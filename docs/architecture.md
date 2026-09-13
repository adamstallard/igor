# Igor Architecture

The full design, including parts not yet scoped into changes. Each section marks whether it
is **scoped** (has a change proposal), **planned** (agreed, not yet scoped), or **research**
(known to be unsolved).

Individual change proposals under `openspec/changes/` should reference this document rather
than restating it.

---

## 1. Shape of the system

An **Igor** is an instance of a **role**. It holds no durable state. Retire it and nothing
is lost, because everything durable lives in git: the role config, and the **lore** store.

The loop, per cycle:

1. **Search** — deterministic queries against a surface. No model. Free.
2. **Recognize** — is this in the role's lane, how confident are we, and which lore fires?
3. **Claim** — take the work publicly before starting.
4. **Work** — execute with fired lore already in context.
5. **Report** — status back to the surface, including a handoff if budget runs out.

Igors poll rather than waiting for triggers. Polling avoids needing a public endpoint, a
webhook relay per platform, and per-surface bearer-token management. The cost is latency,
which for this class of work is irrelevant.

---

## 2. Why team memory, not per-agent memory

**Scoped** (`lore-from-reviews`).

Per-agent memory has a fleet problem: five Igors on the same role each learn their own
lessons, producing five partial knowledge sets with no merge path and stranded improvements
when any one is retired. Making the *role* and the *lore* the learning objects inverts
this — one Igor's lesson updates the shared artifact and every instance improves at once.

It also survives substrate changes. Memory embedded in model weights is locked to a model
generation; when the backbone improves you start over. Lore is markdown in git, so it
migrates onto a better model for free. For a system whose premise is accumulation over
years, surviving your own upgrades is close to a requirement.

Three distinct objects, often confused:

| | Authority on | Shape | Accessed by |
|---|---|---|---|
| **Corpus** (GitHub, Linear, Slack, Discord, ClickUp) | what happened | complete, chronological, huge, noisy | searched on demand |
| **Lore** | what was learned | curated, atemporal, small, high-signal | fires unbidden |
| **Role config** | who does what | prescriptive, always loaded | standing context |

Routing rule: guidance specific to one role's behavior is role config; guidance applying to
anyone touching an area is lore.

### 2.1 Roles — **planned** (`core-igor-loop`)

Roles and Igors are **many-to-many**. Many Igors can run the same role; one Igor can hold
several.

Roles become real objects in `core-igor-loop`, not before. `lore-from-reviews` deliberately
defines none: its reviewer comes from a mined comment's author, and routing guidance into
role config is meaningless while nothing loads role config. Entries there carry a `scope`
**label** (`role:frontend`) which is a tag, not a foreign key — enough to promote from later,
costing nothing now. Defining the schema in the change that actually consumes it also means
defining it with more information than we have today.

**`reviewers` is a list, not an owner.** Any one of them can approve a lore entry or role
config change. No quorum and no single accountable person — that would be org structure
leaking into config for no benefit.

Until roles exist, the same need is met by a store-level `reviewers` list in the lore tool's
config, which is where an entry escalates when the author it was mined from does not respond.
Roles later narrow that to per-role lists; they do not introduce the concept.

**One Igor, several roles, because a seat costs the same idle.** A role too narrow to fill
its seat's allowance wastes capacity that was already paid for. Holding a second role
absorbs the slack. This also mirrors how organizations actually staff people across areas.

Three properties make that safe:

- **Multi-role at discovery, single-role at execution.** An Igor runs the union of its
  roles' queries, but triage assigns each candidate to exactly one role, and only that
  role's standing instructions and lore scopes load for the work. The discovery surface
  widens; the working context does not get diluted, so one role's conventions cannot bleed
  into another's task.
- **Ranked roles are the amortization policy.** Each Igor holds an *ordered* role list.
  Higher-ranked roles get first call on the budget; lower-ranked ones absorb what is left.
  This implements "spare capacity flows down" and simultaneously answers what to do when two
  roles both have pending work. Ties break by item age.
- **Interchangeability survives.** An Igor is still fully described by its ordered role
  list, so two Igors with the same list remain swappable. Worth keeping explicit, because
  this is the property that would quietly erode into Igors having individual identities.

---

## 3. Lore

### 3.1 Store — **scoped**

One markdown file per entry, in git, at a configurable path in the *operating team's* repo
(lore is their data; Igor is the tool). The filename is the entry id, so a file is findable
directly from a supersession pointer or provenance reference.

Frontmatter carries `id`, `claim`, `scope`, `status`, `conditions` (`paths` predicate plus
always-present `prose`), `provenance`, `supersedes`, `reviewed`, and later `fired` (count and
timestamp). The body holds the reasoning and any exceptions.

**Provenance is the single source of truth for scoring.** Each provenance item carries a
`url`, an `author`, and an `at` date, which makes support count (how many items), recency
(decay over their dates), and author-weighting all *derived* rather than stored. Storing
`support` or `recency` as fields would desync — a recency written in September is wrong by
November.

**The id is derived from the claim at creation, then frozen.** A kebab slug keeps diffs and
supersession pointers legible, but rewording a claim later must not move the id, since other
entries and external references point at it. Collisions get a numeric discriminator.

Git is chosen for diffability (drift detection is `git log`), a review workflow that already
exists, greppability, human readability, and portability across vendors and models. Indexes
are *derived* from the store and stamped with its commit; the store is truth, indexes are
disposable.

Size is a design goal, not a limitation. At 5–20 promotions a week with pruning, a year
lands in the hundreds — small enough to read end to end, which is what makes it trustworthy.

### 3.2 Two indexes — predicates **scoped**, vectors **planned**

Both are compiled from the store at build time. Both take the current situation and return
entry ids. Neither requires having an entry in hand first.

**Predicate index** — inverted, keyed on metadata available before any model runs: file
path globs, repo, labels, service, channel. Exact, free, perfectly legible, trivially
testable. Expected to carry most entries, because much institutional knowledge really is
scoped by path or service.

Deliberately impoverished expression language: globs on paths, exact match or set
membership elsewhere, AND across keys, OR within a list. Wanting real boolean logic is a
signal to split the entry or use a learned condition — building a query DSL here is a trap.

**Vector index** — a matrix of condition vectors for situations that resist metadata
matching ("this looks like the class of bug where the cache is stale"). Cost is one dot
product per condition: ten thousand conditions against a 4096-dim state is a single
matmul, microseconds, and independent of how much text the entries contain. Unlike RAG,
retrieval cost does not grow with corpus size.

### 3.3 Firing — **planned**

Firing is **unbidden**. The worker never issues a query or elects to search; matching
entries are injected before it runs. This is the property that distinguishes the design
from RAG, and it sits entirely on the *condition* side — the payload mechanism is ordinary.

A trigger is `(condition → intervention)`. Interventions come in three kinds:

- **Content injection** — surface a prior decision into context. Most lore entries.
- **Behavior steering** — a vector shifting disposition ("this subsystem has burned us").
- **Capability routing** — select an adapter.

**Firing budget.** Cap at roughly 5–10 entries by match strength with scope priority;
flooding context dilutes everything. The firing statistics then feed a self-organizing
loop: an entry firing on nearly every invocation is standing context in disguise and should
be promoted into role config, and one that has not fired in months should be demoted or
pruned. The always-on/situational boundary stops being a judgment call and becomes
something usage data settles.

**Conflict resolution**, in order: narrower scope beats broader (role beats global), then
higher support, then more recent. Anything unresolvable is a store defect and surfaces for
review — two active contradictory entries mean consolidation merged badly.

### 3.4 Entry and condition lifecycle — **planned**

Entry status (`active` | `deprecated`) and condition status (`active` | `retired`) are
**independent**, and all four combinations are meaningful:

| Entry | Condition | Meaning |
|---|---|---|
| active | active | normal |
| deprecated | active | tombstone fires: "we had a lesson here, retired on X because Y" — prevents re-derivation |
| deprecated | retired | silent, historical record only; the situation can no longer occur |
| active | retired | **the lesson is good, the trigger was wrong** — spurious correlate; keep the entry, re-derive the condition |

Prefer deprecation over deletion. Follow supersession pointers: a fire on a superseded
entry resolves to its replacement rather than counting as a miss.

**Fail soft on a true miss** — log and continue; a missing memory degrades quality, never
correctness. **Treat misses as signal**: a condition firing repeatedly after its entry was
deprecated means the situation recurs but the knowledge is gone, which belongs in the
review queue, not a log.

Retirement requires no unlearning and no deletion operation. The recognizer is a frozen
encoder that never learned any conditions; conditions are data beside it. A retired
condition simply is not compiled into the next index build — a reviewable diff, no orphaned
state. This is a strong reason to keep conditions as editable data rather than fine-tuning
a classifier, which would reintroduce the diffuse-and-unexcisable problem one level down.

### 3.5 Consolidation — backfill **scoped**, ongoing **planned**

**Salience signals**, roughly by value:

1. **Correction events** — a human corrected an agent or another human. Highest value:
   marks exactly where the default was wrong.
2. **Surprise** — expectation diverged from outcome; plans changed mid-execution, tests
   failed unexpectedly, estimates blew out.
3. **Outcome valence** — reverted PRs, recurring bugs, 5x overruns. Failures inform more
   than successes.
4. **Repetition** — the same question asked three times means the answer is not
   discoverable. Repeated retrieval misses are a direct promote signal.
5. **Cost** — long, token-heavy, many-retry episodes contained something hard.
6. **Explicit marking**.

**Weight corrections by source.** A correction from the role's designated expert outranks a
drive-by. The same mechanism defends against bad imprinting generally.

**Batch, offline, human-reviewed.** Nothing enters durable lore unseen. Batches are capped
and sequential — the failure mode that kills this is dumping hundreds of candidates on a
reviewer who never opens the queue again.

**Why batch matters technically:** deriving a condition vector needs positives *and*
negatives. A single lived episode gives one positive and no contrast set — the unsolved
one-shot problem (§6). A batch clustering many related episodes yields a cluster of
positives with the rest of the corpus as negatives; the contrast set falls out free. The
thing that makes continuous personal memory hard is precisely what team memory does not
need.

### 3.6 Learning from human experts — **planned**

The frontier model supplies general craft and cannot supply local convention. Closing that
gap, by value per unit of expert attention:

1. **Mine review comments.** The densest expert-knowledge corpus any engineering org
   produces, already labelled, written by exactly the people whose judgment is wanted.
   Scoped as `lore-from-reviews`.
2. **Weight corrections directed at Igors by who made them.**
3. **Shadow mode** — produce a draft, diff against what the human actually did. Free ground
   truth, zero risk. Triggered by uncertainty rather than run as a phase (§5.3).
4. **Rationed elicitation** — ask the expert when uncertain, cap the rate. Ranked low
   because expert knowledge is largely tacit and experts routinely cannot articulate it,
   which is why observation beats asking.
5. **Role config as codified expert judgment** — each role has a human owner who reviews
   changes to it.

**Consent is a people problem before a technical one.** Building a model of a named
colleague's judgment requires their agreement. The mechanism: route each candidate entry to
the author it was mined from. Decline kills it outright; non-response routes to the role
owner; people who have left are not mined, since they can neither consent nor correct a
misattribution.

---

## 4. Recognition

### 4.1 The recognizer is not the worker — **planned**

Activation-level mechanisms need hidden states, which closed APIs do not expose. But
nothing requires the model that *recognizes* the situation to be the model that *does the
work*.

Run a small open-weight model (1–7B) over the same context, key conditions on its
activations, and inject fired material into the prompt sent to the frontier worker. The
worker exposes nothing and needs to expose nothing.

This also resolves a cost problem: recognition is high-frequency, and moving it to a local
model means polling and triage consume electricity rather than a subscription seat's
rolling allowance, leaving the whole budget for actual work.

**What survives:** unbidden firing, from the worker's perspective — it never elects to
search, it receives context that already contains what matters.

**What is lost:** introspective conditions. You can recognize *situations* ("this context
resembles the deploy that broke staging"); you cannot recognize the worker's mid-task
internal state ("the worker is confused about this API"). Situation recognition is most of
the value here.

### 4.2 Condition vectors — **planned**

A direction in the recognizer's activation space separating "condition present" from
"absent", built from contrastive examples at a chosen layer. At inference: read the hidden
state at layer L on the final input token, project onto the condition vector, threshold. If
it exceeds, the intervention applies for the remainder of the pass.

### 4.3 SAE-legible conditions — **research**

A sparse autoencoder decomposes activations into a sparse combination from a learned
dictionary, whose features often correspond to nameable concepts. Three representations of
one condition: the **vector** fires, the **feature summary** explains, the **prose** field
documents.

Legibility degrades with specificity. Role lane conditions are broad and decompose well;
narrow situational entries may be irreducibly idiosyncratic.

- **Require legibility for role lane conditions.** They are policy, humans edit them, and a
  role engaging on unreadable criteria is the auditability failure this design exists to
  avoid. Illegibility there is a design smell, not a tooling gap.
- **Treat it as a review aid for lore entries**, whose real payoff is catching spurious
  correlates: a condition derived from a cluster can latch onto something incidental, and
  the reviewer reading "fires on {weekend, oncall, service-name}" beside a claim about
  schema migrations sees the mismatch immediately.

That gives a mechanical review criterion — **does the learned condition match the written
claim?** — which probably justifies the SAE infrastructure on its own.

Caveats: features belong to the small recognizer, mediated by whatever SAE was trained on
it; they are not ground truth. Good enough to catch gross errors, not a correctness proof.

**Known unexplored:** defining trigger *conditions* over SAE features. Existing work uses
sparse features to construct and denoise the *disposition*; the inversion appears absent
from the literature.

### 4.4 Post-hoc recognition — **planned**

Feed the recognizer the worker's **output** as well as its input. Pre-hoc firing retrieves;
post-hoc firing flags — "this output has the shape of a confident answer in an area where
we have been wrong before." Needs nothing from the API beyond text already in hand, and is
the cheapest available calibration mechanism.

---

## 5. Surfaces and coordination

### 5.1 Adapters, not integrations — **scoped** (`core-igor-loop`)

Slack, ClickUp, GitHub, Linear, and Discord are *examples* of surfaces, not the
architecture. An adapter provides: `search` returning normalized candidates, `claim`,
`verify_claim`, `report`, and `identity`. Everything above that line is surface-agnostic.

GitHub ships first on ubiquity — it is the one platform nearly every team has. Linear
second (shares the assignment model), Discord third (forces the convention path).

### 5.2 Claim primitives differ — **scoped**

Adapters declare which kind they are:

- **Native assignment** (GitHub, Linear) — potentially a real conditional write ("set
  assignee only if unset"), which would collapse race handling into one atomic operation.
  *Whether these APIs actually support conditional assignment, or last-write-wins, is an
  open empirical question to settle before designing around it.*
- **Convention message** (Slack, Discord) — post, wait a settle interval, re-read, stand
  down if someone claimed first.

On the optimistic path: writes have a genuine total order at the storage layer, so true
ties essentially never occur and no tie-break rule is needed. The only real risk is reading
before a slightly earlier write has propagated, which a settle delay addresses. The delay
must exceed worst-case propagation lag, which no platform publishes — so tune it
empirically and treat it as very likely sufficient rather than provably correct.

### 5.3 Claims are universal; visibility varies — **scoped**

Every pickup takes a claim. Confident work claims on the work surface where humans see it;
shadow work claims in a coordination channel watched by Igors and interested humans. One
code path, one race routine, two destinations — which is what prevents two Igors silently
duplicating the same shadow task.

**Shadow is a mode, not a phase.** When triage concludes a human should own an item, the
Igor still does the work and posts it as a suggestion. Shadowing then shrinks as confidence
calibrates, instead of ending on a date someone picked.

---

## 6. Execution

### 6.1 Action space, not silence — **scoped**

Risk is capped by what an Igor may *finalize*, not by whether it is visible. Draft PRs,
comments, proposals — never merges, sends, or irreversible state changes. This is what lets
the loop deliver value immediately while keeping every mistake reversible.

### 6.2 Difficulty routing — **planned**

Triage already judges the task; have it also estimate difficulty. Routine work runs on the
local open-weight model (free, unlimited, no seat consumption); hard work goes to the
frontier model. As open models improve this is a threshold to move, not an architecture to
rewrite — turning the eventual fully-open migration into a dial rather than a decision.

### 6.3 Budget — **planned**

- **There is no proactive quota API.** `/usage` shows historical spend; no hook or endpoint
  warns before a cap. Wind-down must therefore be built reactively — catch the limit error,
  then spend whatever remains on a handoff — with proactive self-tracking as an
  optimization, never a correctness dependency.
- **Per-invocation cost is available**: headless `claude -p --output-format json` returns
  `total_cost_usd` and a per-model breakdown, so a wrapper can sum real spend. These are
  documented as client-side estimates.
- **Caps are not published.** Per-seat 5-hour and weekly allowances vary by seat tier with
  no numeric values documented. A percentage-of-cap buffer must be calibrated empirically
  — run to the limit once, record cumulative cost, treat that as the working estimate, and
  recalibrate periodically. Both numerator and denominator carry error, so keep the buffer
  conservative.
- **Auth:** `claude setup-token` issues a one-year OAuth token for unattended headless use
  against a subscription seat. Refresh behavior past expiry is undocumented; budget for an
  annual manual regeneration as a known operational task.

### 6.4 Graceful handoff — **scoped**

The failure mode the claim protocol creates: an Igor announces "I'm on this", humans and
other Igors back off, then it goes silent mid-task. So exhaustion must produce a posted
state-of-work, remaining steps, and suggested pickups. The summarizing call should be cheap
and separate, not competing for the exhausted budget.

---

## 7. Prior art

**Research**, from a literature pass in September 2026. The pieces exist; the assembly does
not.

- **CAST** (Conditional Activation Steering, ICLR 2025, arXiv 2409.05907) — condition
  vectors firing on activation patterns paired with behavior vectors, frozen backbone, no
  weight optimization, fires automatically. Nearly the exact `(recognizer, disposition)`
  shape. **Gap:** conditions are hand-authored offline from contrastive prompt sets, not
  learned from experience; no consolidation gate.
- **Neural Procedural Memory** (arXiv 2606.29824) — agent memory as steering vectors
  distilled from historical experience, training-free, motivated by RAG's "text-action
  disconnect" (their name for the unbidden-vs-queried distinction). Closest single system.
  **Gap:** batch-distilled; firing mechanism unconfirmed.
- **Larimar** (arXiv 2403.11901) — one-shot writes to associative memory at inference,
  frozen backbone. **Gap:** keyed on text-episode latents, read by explicit query —
  retrieval, not intrusion.
- **Growing adapter banks with routers** (Self-Expansion arXiv 2403.18886; Latent-LoRA
  arXiv 2607.23837; CLARE; Brainstacks) — mature, no forgetting by construction. **Gap:**
  expansion triggers on task-boundary/distribution shift and routes on task embeddings.
  Continual task learning, not autobiography.
- **Agent-memory survey** (arXiv 2603.07670) — finds no system combining salience-gated
  consolidation with activation-level storage; floats idle-period consolidation as
  principled but unbuilt. Independently raises the auditability complaint about weight-based
  memory: *"where exactly in the weights is the user's birthday stored?"*

**The missing joint:** nobody closes the loop from *experience → salience gate → newly
written activation-keyed condition vector*.

**The invention required, precisely:** deriving a condition vector from **one** lived
episode rather than a curated contrastive corpus — one-shot learning in activation space.
Everything around it can be assembled from published work. Team-level lore sidesteps this
entirely by consolidating in batch (§3.5).

---

## 8. Deferred

Agreed in principle, not scoped, roughly in dependency order:

1. Ongoing consolidation from live episodes (§3.5) — needs Igors producing episodes.
2. Lore retrieval by predicate (§3.2) — lands with `core-igor-loop`.
3. Fleet supervision: multiple concurrent Igors, per-role instance counts, the
   "five frontend Igors dropping as budget runs out" model.
4. Local recognizer layer (§4.1) — requires standing up open-weight serving.
5. Condition vectors and the vector index (§4.2).
6. SAE-legible conditions (§4.3) — research.
7. Post-hoc output recognition (§4.4).
8. Difficulty routing (§6.2).
9. Additional adapters: Linear, then Discord.
