# Igor Architecture

The full design, including parts not yet scoped into changes. Each section marks whether it is
**built** (shipped and in use), **scoped** (has a change proposal), **planned** (agreed, not
yet scoped), or **research** (known to be unsolved).

Individual change proposals under `openspec/changes/` should reference this document rather
than restating it.

---

## 1. Shape of the system

An **Igor** is an instance of a **role**. It holds no durable state. Retire it and nothing
is lost, because everything durable lives in git: the role config, and the **lore** store.

The loop, per cycle:

1. **Search** — deterministic queries against a surface, through a pluggable adapter (§5.1).
   No model. Free.
2. **Recognize** — is this in the role's lane, and which lore fires?
3. **Claim** — take the work publicly before starting.
4. **Work** — execute with fired lore already in context.
5. **Report** — status back to the surface, including a handoff if budget runs out.

Igors poll rather than waiting for triggers. Polling avoids needing a public endpoint, a
webhook relay per platform, and per-surface bearer-token management. The cost is latency,
which for this class of work is irrelevant.

**What that argument does and does not cover.** It holds wherever a push would require the
surface to reach *in* — a self-hosted Igor behind a firewall cannot receive a webhook without
becoming a service someone operates. It does not hold for a surface the Igor already holds an
outbound connection to. A Discord bot keeps a socket open and is handed every message in its
channels; polling that channel asks for information already arriving, at higher latency and
more calls. Take the push there.

Two things that does not change. Discovery still polls, because a tracker has no push a
firewalled Igor can receive. And a push is not coordination: it tells one Igor that something
happened and decides nothing about who takes it, so the claim protocol is untouched.

Where it earns its keep is **stop**. A stop is currently seen at the next checkpoint, and its
whole value is being fast — the one place in this design where latency is not irrelevant.

---

## 2. Why team memory, not per-agent memory

**Built** (`lore-store`). Mining that memory out of review history (`lore-from-reviews`) is
scoped but deferred.

Per-agent memory has a fleet problem: five agents doing the same job each learn their own
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

**One Igor may hold several roles, but the reason is conditional.** The original argument was
that a seat costs the same idle, so a role too narrow to fill its allowance wastes capacity
already paid for — holding a second role absorbs the slack.

That argument depends entirely on **one seat per Igor**. Seats can be shared (§6.5), and once
they are, the pressure disappears: five narrow Igors on one pooled seat beat one broad Igor,
because specialization buys things breadth destroys —

- **Legibility.** If every Igor does everything, "which Igor claimed this" carries no
  information. A narrow identity tells a human what lane the work is in.
- **Differential trust.** The docs Igor may open pull requests freely while the infra Igor may
  only comment. One Igor holding every role forces the action space to be the union or the
  intersection of its roles, and both are wrong.
- **Failure isolation.** A bad role config breaks one lane rather than everything.

Under a shared pool the priority ordering moves to **fleet level** — one ordering across Igors
rather than a ranked list inside each — which is cleaner anyway. Role breadth then becomes an
empirical tuning decision that follows expected work volume, exactly like staffing: a role that
reliably fills capacity gets dedicated resources, one that does not gets pooled.

Three properties make that safe:

- **Multi-role at discovery, single-role at execution.** An Igor runs the union of its
  roles' queries, but triage assigns each candidate to exactly one role, and only that
  role's standing instructions and lore scopes load for the work. The discovery surface
  widens; the working context does not get diluted, so one role's conventions cannot bleed
  into another's task.
- **Priority is fleet-level, not per-Igor.** Ranking roles inside a single Igor so spare
  budget flows down its own list only makes sense when each Igor owns a seat. Seats are
  pooled (§6.5), so the ordering belongs across Igors. Ties break by item age either way.
- **Interchangeability survives.** An Igor is still fully described by its ordered role
  list, so two Igors with the same list remain swappable. Worth keeping explicit, because
  this is the property that would quietly erode into Igors having individual identities.

---

## 3. Lore

### 3.1 Store — **built**

One markdown file per entry, in git, at a configurable path in the *operating team's* repo
(lore is their data; Igor is the tool). The filename is the entry id, so a file is findable
directly from a supersession pointer or provenance reference.

Frontmatter carries `id`, `claim`, `scope`, `status`, `conditions` (`paths` predicate plus
always-present `prose`), `provenance`, `supersedes`, `reviewed`, and later `fired` (count and
timestamp). The body holds the reasoning and any exceptions.

**Provenance is the single source of truth for scoring.** Each provenance item carries an
`author` and an `at` date, plus a `url` when it cites a mined artifact — a hand-authored entry
records authorship with no link (§3.2.1). That makes support count (how many items), the date of
the newest, and author-weighting all *derived* rather than stored. Storing them as fields would
desync — a support count written in September is wrong the moment somebody adds a citation.

**The id is derived from the claim at creation, then frozen.** A kebab slug keeps diffs and
supersession pointers legible, but rewording a claim later must not move the id, since other
entries and external references point at it. Collisions get a numeric discriminator.

Git is chosen for diffability (drift detection is `git log`), a review workflow that already
exists, greppability, human readability, and portability across vendors and models. Indexes,
when they exist, will be *derived* from the store and stamped with its commit; the store is
truth, indexes are disposable.

**Store size is not the constraint, and conflating it with firing volume is a mistake.** Three
separate things:

- **Firing volume** — how many entries reach a worker per invocation. Genuinely hard: context
  is finite and injecting forty marginal entries degrades output. Held to a token budget (§3.3).
- **Store size** — how many exist. Largely unconstrained. With precise conditions a
  10,000-entry store fires the same few entries a 200-entry store would, plus it covers the
  rare case the small store missed. A path predicate fires identically regardless of what else
  exists, and retrieval is one matmul or an index lookup either way.
- **Reviewability** — an entry should be readable in under a minute and the store should be
  searchable. Neither requires reading it cover to cover.

**The reason a `CLAUDE.md` must stay short is exactly the reason lore need not be.** An
always-loaded file taxes every invocation with its length. Lore is conditional, so it carries
no such tax — which is the whole advantage over conventional context files, and capping lore at
comparable sizes discards it.

What actually limits growth is **review throughput** (curation is where the value is, and ~20
per batch is what a reviewer tolerates — that bounds the rate, not the ceiling) and **per-entry
precision** (a vague condition fires wrongly and costs everyone). The rule is therefore not a
number: lore should be **as large as it can be while every entry has a precise condition and
demonstrable value**. The fire-count loop in §3.3 already implements exactly that test, and
neither half of it refers to the total.

### 3.1.1 How entries get into the store — **built**

Entries arrive by pull request, and since only `active` entries fire (§3.3), review is what
puts a rule into force rather than a formality after it.

`propose` takes a directory of candidates, groups them by **dominant author** — whoever
contributed the most provenance items, ties broken toward the later contribution — and opens
one pull request per author on a prefixed branch, built through the git tree API so nothing is
cloned. Every other contributing author is requested as a reviewer and named in the body by
plain name, never an @mention: a mention notifies someone who may never have seen the
repository.

Grouping by author rather than by entry is deliberate. Six entries produced two pull requests
in the first real run, not six, and each person gets one conversation.

The body carries the contract, using affordances the reviewer already knows: **delete a file**
to reject permanently, **edit** one to amend it, **merge** to accept the rest, **close without
merging** to defer. Rejection has to be the deliberate act of deleting something; closing a tab
is passive and must not destroy a candidate.

**Merging is approval.** GitHub will not let anyone approve their own pull request, so tying
approval to merge is what keeps a single maintainer from being stuck — they open and merge
their own proposal, and `reviewed.by` records them honestly. A merger who was not an assigned
reviewer is flagged rather than recorded as though they had been asked.

Promotion then happens one of two ways. Where the destination runs the merge-triggered workflow
(§6.7), entries are active the moment they merge. Otherwise `reconcile` promotes at the next
invocation — there is no daemon — and also reports rejections and pull requests that have gone
quiet past a window, for escalation to the store-level `reviewers`.

None of this is mining-specific. A hand-authored candidate takes the identical path, which is
why it lives in `lore-store` rather than `lore-from-reviews`.

### 3.2 Two indexes — both **planned**

Neither is built. Both would be compiled from the store at build time, take the current
situation, and return entry ids, with neither requiring an entry in hand first.

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

### 3.2.1 Lore is one of four context channels — **context**

Lore is not the only way a worker gets context, and it is the only conditional one:

| Channel | When | Source |
|---|---|---|
| **Standing instructions** | always | role config |
| **The work item** | always | the claimed issue, diff, or thread |
| **Ambient** | on demand, free | the codebase and its own docs — the worker is a coding agent with file access |
| **Fired lore** | when a condition matches | the lore store |

An Igor with an empty lore store is therefore not crippled: it has its role, the task, and the
whole codebase — what a competent new hire walks in with. **Lore is additive, not
foundational**, which is what makes hand-authored bootstrapping viable (§3.5.1).

**Lore exists for what the worker would not know to ask for.** On-demand retrieval handles
anything the worker thinks to look up. Lore covers the other case — "we never use that pattern
here, it broke us in March" — which nobody searches for because nobody knows to. That is the
entire justification for unbidden firing, and it is why better search cannot replace the
channel.

**Open: may the worker query surfaces mid-task?** Reading the repository is obviously
available. Searching Linear or Slack for the discussion behind an ambiguous item is not
specified. Recommended: allow read-only surface search, capped in call count, with everything
returned marked untrusted exactly as ingested content already is (§5.4). A human would read
the original discussion before touching something ambiguous, and forbidding it buys no safety
— the content is equally untrusted whether it arrives by firing or by fetching. The cap
guards against rabbit-holing, not against attack.

### 3.3 Firing — **built** (injection; relevance filtering still ahead)

**Only `active` entries fire.** `provisional` means proposed but not yet in force. Gating on
status is what makes review more than ceremony: if a provisional entry fired, an entry would
behave identically before and after approval, and unreviewed lore would quietly shape agent
behaviour — the failure the review gate exists to prevent.

The cost is a transient, and how small depends on the destination. Where the destination runs
the merge-triggered promotion workflow (§6.7), an entry is active the moment it merges and
there is no window at all. Where it does not, `reconcile` promotes at the start of the next
invocation — there is no daemon — so a merged entry stays provisional for one cycle. That
window is minutes while anything is running, and while nothing is running nothing is firing
either.

Consequence: an entry created and committed straight to main, without going through `propose`,
never fires — and would otherwise say nothing about why. `create` therefore reports that the
entry is provisional and names `propose` as the next step.


Firing is **unbidden**. The worker never issues a query or elects to search; matching
entries are injected before it runs. This is the property that distinguishes the design
from RAG, and it sits entirely on the *condition* side — the payload mechanism is ordinary.

A trigger is `(condition → intervention)`. Interventions come in three kinds:

- **Content injection** — surface a prior decision into context. Most lore entries.
- **Behavior steering** — a vector shifting disposition ("this subsystem has burned us").
- **Capability routing** — select an adapter.

**Firing budget.** A token budget on injected lore, not a count. Flooding context dilutes
everything, so there is a limit; but "five entries" means nothing when entries differ in
length by an order of magnitude, and a count would have to be re-guessed every time the
store's shape changed.

**When the budget is exceeded, say so — do not silently drop.** Whichever entries a rule
discarded, nobody chose that rule, and the resulting miss is invisible: the worker proceeds
confidently without a lesson and nothing looks wrong. Reporting "47 in-scope entries, 12k
tokens, over the 4k budget" hands the problem to someone who can decide, which is the only
party equipped to.

Ordering, when a mechanism must choose, comes from the relevance mechanism itself: a model
asked which conditions apply returns them in order, and a vector match returns scores.
Neither needs a separate notion of match strength, and none of it is worth building before a
store outgrows plain injection.

**Conflicts are not resolved at retrieval.** Two contradictory active entries are a store
defect, and detecting the contradiction requires understanding both — which only the worker
has. Inject both and let it say so. A retrieval rule quietly picking a winner hides the
defect that review exists to catch.

**Firing records are machine output and live where machine output lives** — the state
branch, beside discovery watermarks and execution transcripts, never in the entry files.
Writing counts into the store would mean a commit to human-reviewed files on every fire,
merge conflicts against human edits, and `git blame` on a curated corpus buried under
machine churn.

The deeper reason: it is not a count, it is a log. Each decision records the condition, the
item, whether it applied and why — which is the contrastive corpus §4.2.1 needs. A count can
be derived from the log; the log cannot be recovered from a count, so storing only the count
discards the thing that turns out to matter most.

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

### 3.4.1 Fire counts decide what a lesson has become — **planned**

Firing is recorded — a count and a last-fired timestamp per entry — and the counts are worth
acting on, because the two extremes are both failures wearing the shape of an entry.

**An entry that fires on nearly everything is not lore.** It is role configuration that ended
up in the wrong place. Lore is for what applies *sometimes*, and something that always applies
should be standing instruction, where it costs nothing to match and cannot be crowded out by a
firing cap. Leaving it in the store means paying retrieval for a constant.

**An entry that never fires is dead weight, and nobody will notice.** A store only grows.
Without a signal, the failure is silent: entries accumulate, the index gets slower to build,
consolidation gets harder to reason about, and nothing ever says which entries were carrying
their weight. A never-firing entry is also evidence its condition was mis-derived — which
§3.4 already distinguishes from the lesson itself being wrong.

Neither promotion nor pruning should be automatic. Both change what an Igor knows, which is
the thing review exists to gate, so they belong in the review queue as proposals with the
firing history attached. The rule is a threshold and a window, and there is no basis for
choosing either yet: it needs firing history from a real store, which does not exist.

Deliberately not built with retrieval. Recording counts is cheap and can begin immediately;
acting on them requires history to act on, and a threshold guessed before any data would be a
number nobody could later argue with.

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

**Batch, offline, human-reviewed.** Nothing enters durable lore unseen. Batches are to be
capped and sequential — the failure mode that kills this is dumping hundreds of candidates on a
reviewer who never opens the queue again. Measured against a real corpus the cap binds late:
277 comments yielded six entries and two pull requests, well under a cap of twenty.

**Why batch matters technically:** deriving a condition vector needs positives *and*
negatives. Negatives are never the problem — the corpus supplies them, as does every entry
already in the store. *Positives* are: a single lived episode offers exactly one, which is the
unsolved part (§7). A batch clustering related episodes yields several positives at once, so
the contrastive setup is ordinary rather than exotic. What makes continuous personal memory
hard is precisely what team memory does not face.

### 3.5.1 Sources beyond review comments — **planned**

The organizing principle: **mine where a human already did the work of explaining why.**
Review comments qualify because explanation is the artifact's purpose. Ranked by how much
explanatory structure already exists:

**Already lore in the wrong format.** *Architecture Decision Records* are claim plus
reasoning plus applicability — importing them is closer to format conversion than
extraction. *Incident postmortems* are explicitly "what went wrong and what we will do
differently." Both nearly free where they exist, and often they do not.

**Strong signal, cheap query.** *Revert commits* carry a built-in negative outcome signal and
need no clever detection — likely the best second source precisely because every team reverts
even when no team writes ADRs. *Fix commits referencing an issue* pair cause with correction.
*PR descriptions*, especially "why not X" passages where an author preempts an objection.
*Issues closed as won't-fix with reasoning* encode rejection rules, which are valuable and
recorded almost nowhere else.

**Real but harder.** *Code comments explaining non-obvious decisions* are already lore,
scattered and unindexed; cheap to extract, wildly variable in quality. *Repeated questions on
any surface* — asked three times means the answer is not discoverable. *Recurring CI or lint
failures* indicate a convention gap, but need different tooling.

**Noisy, defer.** *Chat threads.* The detectable pattern is question → answer → confirmation,
which is a real handle with poor precision. Worth doing eventually and worth doing last.

Each source is its own change rather than one "mine everything," because the salience signal
*is* most of the work and it differs per source — stick-detection for reviews, the revert
itself for reverts, structure for postmortems. Bundling them would mean building four
detectors simultaneously with no way to tell which one is producing garbage.

### 3.6 Learning from human experts — **planned**

The frontier model supplies general craft and cannot supply local convention. Closing that
gap, by value per unit of expert attention:

1. **Mine review comments.** The densest expert-knowledge corpus any engineering org
   produces, already labelled, written by exactly the people whose judgment is wanted.
   Scoped as `lore-from-reviews`.
2. **Weight corrections directed at Igors by who made them.**
3. ~~**Shadow mode**~~ — dropped (§5.3). It assumed a human would replace the agent's draft,
   producing a clean diff to learn from; in practice people iterate on the draft instead, so
   the ground truth this depended on mostly does not exist.
4. **Rationed elicitation** — ask the expert when uncertain, cap the rate. Ranked low
   because expert knowledge is largely tacit and experts routinely cannot articulate it,
   which is why observation beats asking.
5. **Role config as codified expert judgment** — each role has a human owner who reviews
   changes to it.

**Consent is a people problem before a technical one.** Building a model of a named
colleague's judgment requires their agreement. The mechanism: route each candidate entry to
the author it was mined from. Decline kills it outright; non-response routes to the
store-level `reviewers`. People who have left **are** mined, but the rule is attributed to the
role rather than to them and a current reviewer vouches for it — nobody speaks for a departed
colleague, and citing a comment they publicly wrote is ordinary. Excluding them was considered
and rejected: it discards most of the historical corpus in any team with turnover, to guard
against a misattribution that role attribution already prevents.

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

### 4.2.1 The filter that precedes vectors also trains them — **planned**

Condition vectors are built from contrastive examples, and §4.2 does not say where those come
from. They come from the mechanism vectors replace.

Before the recognizer exists, relevance is judged by a model: one call receives every in-scope
entry's *condition* — a sentence and a path glob, roughly forty tokens each — alongside the
item, and answers which apply. Only the matched entries, whole, reach the worker. Two hundred
entries is about eight thousand tokens, one cheap call, and it works today.

**Every decision that call makes is a labelled example.** Condition, item, applied or not, and
the clause the model gave. That is precisely the positives-and-negatives corpus a condition
vector needs, produced as a side effect of running normally. The filter is not a stopgap ahead
of the real mechanism; it is how the real mechanism gets its training data, which makes it a
prerequisite rather than a detour.

**Log rejections, not only fires.** A bare fire count cannot distinguish an entry whose
condition never matched from one nothing ever considered, and those call for opposite
responses — the first is a mis-derived condition, the second means the entry is out of scope
for everything the fleet does. The rejection log answers four questions the fire count cannot:

- **What do vectors train on** — the negatives, which are most of the corpus.
- **Why did the lesson we needed not fire** — answerable after the fact, with the model's own
  clause, rather than by re-running and hoping.
- **Is the filter wrong in a systematic way** — a whole class rejected consistently is visible
  in aggregate and invisible one item at a time.
- **Which entries have stopped earning their place** (§3.4.1) — considered a hundred times and
  applied never is strong evidence; never fired is ambiguous.

**A filter miss is silent**, which is the hazard worth designing against: the worker proceeds
confidently without the lesson and nothing looks wrong. Err toward including. The cost of a
false positive is tokens; the cost of a false negative is the whole point of lore.

### 4.2.2 Scope stays exact; relevance does not — **planned**

Two filters look alike and are not. **Scope and status are exact and always applied**: a
`project:` entry is invisible outside that project, and a `provisional` entry does not fire.
Neither is a judgment about relevance — they are visibility and review state, and handing
them to a model or a vector would let a guess decide who may see what.

**Everything else is relevance, and predicates are a poor proxy for it.** A path glob is an
attempt to say "this is about that part of the system" in a language that cannot quite express
it, which is why it matches so weakly before a worker has opened anything. A relevance
mechanism does that job directly.

So conditions keep their path globs, but as **input to the judgment rather than the judgment
itself** — a model reading "when throwing from code reachable by a request handler,
`web_services/**/*.js`" is better informed than one reading the sentence alone, and a human
reading the entry learns where it applies. There is no separate predicate pre-filter ahead of
a vector match: one dot product against ten thousand conditions is a single matmul, so there
is nothing for a pre-filter to save.

**A field naming where a condition applies** — at triage, at execution, or both — is the
natural way to express a lesson about *which work to take* rather than *how to do it*. No
entry wants it yet and nothing in `scope` can carry it, so it is recorded as the shape to
reach for rather than built.

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

### 5.0 The unit of work is an issue, wherever it lives — **built**

The atomic unit is **an issue**, not a GitHub Issue. Linear, ClickUp and Jira all hold issues,
and all of them have a real assignee field — so "prefer the atomic write where a native claim
primitive exists" holds across trackers rather than being a GitHub quirk.

That splits a surface into **two roles** which GitHub happens to combine, which is why it is
easy to miss:

- **Tracker** — where work is discovered, claimed, and reported on. Linear, GitHub Issues,
  ClickUp, Jira.
- **Code host** — where the artifact lands. Usually GitHub.

They are linked by convention, and the convention varies: Linear reads branch names like
`adam/ENG-123-…`; GitHub Issues reads `Closes #123` in a pull request body. GitHub Issues plus
GitHub is the degenerate case where one surface plays both roles.

The adapter interface therefore separates them even while only GitHub ships, because the
linkage is exactly the part that would otherwise get hardcoded.

Reviewing other people's pull requests is the natural *second* unit and a poor first one: you
do not assign yourself a review, and two reviewers is not a collision, so the claim mechanic
has nothing to bite on.

### 5.0.1 Scope comes from the org's own convention — **built**

Igor defines no canonical label. Teams already have conventions — gmango marks ClickUp work
`AI` or `Human` — and imposing an `igor` label on top would fit worse than the one they have.

So a role's discovery query is written in the **tracker's native query language and passed
through verbatim**: `label:ai` on GitHub, a tag filter on ClickUp, Linear's own syntax. No
normalized filter DSL in between — the same trap as inventing a query language for lore
predicates, months of work producing something less debuggable than the native thing. The cost
is that a role is not portable across trackers, which is acceptable because roles are per-org
and orgs mostly run one tracker.

This corrects an earlier framing. A scope label is not a training wheel Igor imposes and later
removes; it is the boundary the org already draws. There is nothing to graduate off — widening
scope means widening the query.

**But the query is only the first of three filters, and the org's idiosyncrasy belongs in the
second.** Two operations were being conflated:

- A **tracker query** is *remote*. The tracker executes it, so it must be in the tracker's
  language, and it should be deliberately **loose** — fetch broadly.
- **Lane matching** is *local*, over a candidate the adapter has already normalized. That is
  where predicates belong: `labels includes AI`, `labels excludes Human`, `paths under
  services/billing`. Normalized fields, so portable across trackers in a way a query is not.

So triage is three stages, mirroring lore firing exactly: loose native query, then free precise
predicates, then an LLM call for only the residue predicates cannot express. A loose remote
query plus a precise local filter is more robust than a clever remote one, and the **same
predicate evaluator serves both lore firing and role lane matching** — one implementation.

The distinction to keep: **no DSL for remote queries, predicates for local matching.**
Translating `label:ai` into ClickUp tag syntax is the trap. Filtering normalized candidates is
not. It does mean the adapter's normalization contract has to be real — labels, title, body,
author, state, age, linked paths, url — since predicates are only as portable as that shape is
consistent.

Separately: the *query and predicates* are concrete config, but **what a label means is team
knowledge** and belongs in lore — "work marked AI is agent-eligible, Human means leave it
alone." An Igor reading its own lore understands why it is scoped that way rather than only
that it is.

### 5.0.2 State is a cache; correctness never depends on it — **built**

Watermarks and seen-item records are an efficiency measure, not a correctness mechanism. **The
tracker is the source of truth for what is claimed.** An Igor that loses its state re-examines
an old item, finds it assigned or closed, and skips — so losing state costs API calls and
triage tokens, never a duplicate claim.

**It lives on an orphan branch of the destination**, not on `main` and not on a laptop. The
generalisation: **machine output goes in a machine venue on every surface** — its own channel
in Slack or Discord, its own branch in git. Coordination claims already work that way, so
state should not be the exception.

An orphan branch specifically, sharing no history with `main`:

- `main`'s log stays purely human-meaningful, which is the whole value of keeping lore in git
- state survives a fresh clone, which local storage does not
- it is still inspectable — `git show igor-state:state.json`, no checkout
- no merge conflicts with `main`, and no accidental merge, since there is no common ancestor
- writing it reuses the tree API already used to propose entries, so nothing is cloned

Transcripts from task execution belong there too: durable machine output that has no business
in `main`.

Items handed back live there as well, in `deferred.json`. A handoff releases the claim and
leaves no pull request, so nothing downstream stops the item returning — and the handoff
comment itself lifts the item above the watermark, which is what makes it return. The record is
what keeps the Igor quiet until a reply or an edit answers it, and losing it costs one repeated
handoff.

**The append-only logs are partitioned by UTC day** — `executions/2026-09-15.ndjson`, and the
same shape for decisions and firings. The Contents API has no append, so a write downloads the
file and re-uploads it whole, and on one ever-growing file the bytes sent grow with the square
of the records. A day's partition bounds that without a second representation: a reader spans
the partitions in name order, which is date order.

Nothing reads a flat, unpartitioned log. Partitioning landed before anyone ran an Igor, so one
is dry-run debris rather than history, and supporting it would cost a request on every read
forever.

That trades bytes for requests, so a past day is read once per process and held. The budget
gate reads the whole spend log and `serve` gates once per item, so an uncached read costs a
request per day of history on every item — sixty gates an hour against a 5,000/hour REST
budget reaches the limit in roughly eighty days, and sooner where several processes share one
machine account, since that limit is per account. Today's partition and the directory listing
are always re-read: both are constant, and it was the per-day term that grew.

**Stops are not kept there, and the principle holds without an exception.** Whether an item
carries a stop is asked of the tracker before every claim, over the cooldown window: the stop
is a person's comment sitting on the item, and the rule that recognises one is the same rule
the claim re-read uses. Nothing an Igor can lose sits between somebody writing **stop** and the
Igor honouring it. The asymmetry with a handoff is in what each is made of — a handoff is the
Igor's own prose, which nothing could recognise without parsing it back.

Reading live inverts the failure direction, so the gate is placed for it. An item whose
comments cannot be read waits a cycle rather than being claimed, because a failed read cannot
tell "no stop" from "cannot say". And the gate sits before the claim rather than inside the
claim's own re-read, which runs after the Igor has assigned itself and announced it — a stop
found there costs a claim and a retraction nobody needed to see.

Writing the cache principle down matters more than the location, because it is exactly what
would quietly stop holding once state is durable and shared — at which point the branch starts
looking like a database and losing it starts looking like a failure.

**A rejected candidate is not kept there either, for the same reason.** Deleting a candidate
from a proposal is a person's decision, and losing that record costs them being asked again
about something they already refused — not a machine re-examining an item. So the record sits
beside the entries on `main`, versioned and human-readable, and un-rejecting is deleting the
file, the same gesture that rejected it. The cost is that `reconcile` writes it into the
checkout for someone to commit, which is what promotion already does.

### 5.0.3 What a role actually looks like — **built**

Merge semantics (§6.0) describe how fields combine, not what they are called. The shape:

`roles/frontend.yaml` — the filename is the name, as with lore entry ids:

```yaml
extends: [org]                          # org-level base, same file shape
seat: adam-primary                      # which seat this Igor spends from

sources:                                # where to look
  - tracker: github
    repo: org/web
    query: "is:issue is:open label:ai"  # native syntax, deliberately loose

lane:                                   # APPEND — AND-ed with everything inherited
  labels:
    includes: [ai]
    excludes: [Human, wontfix]
  paths:
    under: [src/, packages/ui/]

instructions: |                         # APPEND — org's plus this role's
  Prefer the shared query hook over fetch in useEffect.

completion: unassign                    # OVERRIDE — unassign | close | assign

allow: [draft-pr, comment]              # MONOTONIC — subset of inherited
commands:                               # MONOTONIC — subset of inherited
  - "npm test:*"                        # what the worker may run, so it can check itself
  - "npx tsc --noEmit"
budget_share: 0.4                       # MONOTONIC — at most inherited

reviewers: [sarah, miguel]              # who reviews changes to this role
```

`commands` is what lets a worker run anything at all: without it the worker can edit files and
nothing else, so it cannot build, test or type-check, and says so in its transcript instead of
verifying. It is deliberately **not** read from the repository being worked, whose own
`.claude/settings.json` is a file the worker can edit — an allowlist a worker can widen is not
one. Narrowing means an entry the parent already lists, verbatim: deciding whether `npm test`
is narrower than an inherited `npm *` is a matcher, and the same reasoning that gets one command
past the check gets every command past it.

**Legibility is a standing constraint, not a finishing touch.** People read these, and so do
models writing them — a flat obvious schema is easier to generate correctly than a nested one
with implicit structure. Every level of nesting should have to earn itself.

`lane` is **declarative rather than an expression language** — `includes`, `excludes`, `under`,
`max_days`. No parser and no operators, which is the same discipline as refusing a query DSL:
the moment a role wants real boolean logic, split the role. It is also what makes appending
safe, since adding constraints can only narrow a match.

**Documentation is not how people get this right; feedback is.** Two commands matter more than
any amount of prose:

- **`igor role explain <name>`** — the effective merged config, annotated with which level each
  value came from. Under inheritance, "what does this role actually do" is hard to answer by
  reading three files, and that is exactly when people guess.
- **`igor role dry-run <name>`** — run discovery and triage over recent items and print what it
  *would* have claimed and why, claiming nothing. This is how a lane predicate gets found wrong
  before anything posts publicly.

Dry-run is the one to build first. It also recovers the useful half of shadow mode — seeing
what an Igor would do without it doing anything — as a **development affordance** rather than a
runtime mode, which is where it belonged.

### 5.0.4 Work already in flight — **built**

An Igor unassigns itself on completion, so the item returns to the pool and is rediscovered
next cycle. Without a check it would claim it again and redo work sitting in review.

**The rule is universal, the detection is per-adapter.** "Do not duplicate work already in
flight" is never an org preference, so it is tool behaviour rather than config. But *how* you
see it differs: a linked pull request on GitHub, a linked branch on Linear. The adapter answers
"does this item have work in flight?" and the loop skips.

### 5.1 Adapters, not integrations — **built** (GitHub only)

Slack, ClickUp, GitHub, Linear, and Discord are *examples* of surfaces, not the
architecture. An adapter provides: `search` returning normalized candidates, `claim`,
`verify_claim`, `report`, and `identity`. Everything above that line is surface-agnostic.

GitHub ships first on ubiquity — it is the one platform nearly every team has. Linear
second (shares the assignment model), Discord third (forces the convention path).

### 5.2 One claim mechanism, not two — **built**

**Use the assignment field for visibility; use ordering for correctness.** Those are separate
jobs and conflating them produced a design with two race mechanisms.

Where a tracker has an assignee field, an Igor sets it — that is the native signal humans read,
and it is what makes a claim legible without anyone learning a convention. Where a surface has
only messages, the claim is a post.

Correctness comes from the same place either way: **writes have a genuine total order at the
storage layer**, so true ties essentially never occur and no tie-break rule is needed. Post,
wait a settle interval, re-read, and stand down if someone was first. Every surface orders its
writes, so one path covers all of them.

**A conditional write was considered and dropped.** "Set assignee only if unset" would be
atomic where it exists — but it exists only on some trackers, so it cannot replace the ordering
path, only sit beside it and double the code paths and failure modes for marginal latency. It
also made the design depend on an API guarantee nobody had verified.

The cost of choosing ordering: it is probabilistic, because no platform publishes worst-case
propagation lag, so the settle delay is tuned empirically and is *very likely* rather than
provably sufficient. Accepted because the failure needs two Igors hitting one item within
seconds, the consequence is duplicated work rather than damage, and two claims on one item is
immediately visible to a human.

### 5.3 Every pickup takes a claim — **built**

An Igor claims on the tracker where humans can see it, or it skips the item. There is no
second, quieter destination and no confidence score deciding between them.

**Igors win races against humans, and that is not fixable.** An Igor polling every few minutes
claims a new item before a human has opened their notifications. First-claim-wins therefore
favours Igors systematically, and over weeks humans would find everything already taken.

So the claim protocol is doing two different jobs and only one of them is a race. The settle
delay and the conditional write are for **Igor against Igor**, genuine contests between equals.
**Human against Igor is not a race at all — it is an override**, and what matters there is that
the override is cheap and obvious rather than that the race is fair.

**Stop is that override, and it stays a single verb.** Immediate, unconditional, releases the
claim, available to anyone (§5.4). What happens *next* is read from the tracker rather than
from a second command:

- **A human assigns themselves** — they have taken it; the Igor leaves it alone.
- **Nobody claims it** — it becomes eligible again after a cooldown.
- **Someone says go ahead** — eligible immediately, short-circuiting the cooldown.

That yields pause-with-resume without inventing a second verb, and the resume signal is just a
message on the surface. The failure it avoids: if stop blacklisted an item permanently, a human
who stopped to look and then wandered off would have silently deleted that work from the pool,
since the watermark already marks it seen.

**A minimal stop belongs in `core-igor-loop`, not in `directed-interaction`.** The conversational
layer is a later change, but the change that introduces the speed asymmetry is the change that
must ship the override for it — otherwise the first Igor can only be stopped by killing the
process.

**Shadow mode was designed and then dropped**, and the reasoning is worth keeping because it
corrects what this design is defending against. Shadow meant doing the work but posting it as
a suggestion rather than taking ownership, gated on a confidence score. Each justification
failed:

- *Risk* is already capped by the action space (§6.1) — a bad draft costs a review comment.
- *Learning* assumed a human would **replace** the output, giving a clean diff to learn from.
  In practice people iterate on it instead, so the diff mostly does not exist.
- *Courtesy* is covered by claims being visible and stop being open to anyone (§5.4).
- *Calibration* is triage's in-lane judgment, not a separate mode.

Confidence drove nothing else, so dropping shadow removed the score too — which was the
weakest part anyway: a model's self-reported confidence is poorly calibrated, and the signal
that would work is empirical, from whether past work of a shape was accepted.

**The correction underneath it:** the failure being designed against was "the agent produced
something wrong and the effort was wasted." The realistic failures are "nobody noticed the
output" and "two people did the same work" — coordination problems that claiming solves, not
quality problems that shadowing solves. It also gives reversible-only a better reason than
risk: iteration is expected, so the artifact has to be something a human can iterate on and
commit themselves.

The cases that seemed to need shadow are better handled by scope. An item where a claim would
itself be disruptive — an incident ticket mid-outage — belongs outside the role's query, not
inside a mode.

### 5.4 Directed interaction — **scoped** (`directed-interaction`)

The moment an Igor posts a claim, people reply to it. Having no answer for that means the
behavior gets decided by accident.

**Separate answering from acting.** Answering costs a little budget and changes nothing, so
an Igor can be liberal about responding. Acting is where risk lives, so it is strict about
what it will *do* in response. The action-space cap (§6.1) already bounds the damage of a
successful prompt injection — it cannot merge, send, or delete — but reversible is not
harmless: a draft PR that exfiltrates a secret is closable, and the secret is still burned.

**Authority to instruct never exceeds authority over the artifact.** If someone cannot merge
to a repository, their instruction to an Igor working in it carries no weight. Injection by an
outsider therefore gains them nothing they could not already do directly. In practice
"authorized" means the store-level `reviewers` — per-role lists once roles exist — plus anyone
with write access to the repository in question.

**Stop is the deliberate exception: unauthenticated, open to anyone.** A stop fails in the
safe direction — worst case an Igor stands down and a human does the work. Everything that
*expands* what an Igor does requires authorization; the one thing that *contracts* it is open
to all, so anyone who sees it going wrong can halt it immediately.

**Everything an Igor reads is data, not instruction.** Issue bodies, comments, linked pages,
code — all untrusted and delimited as such when passed to the worker. The trusted instruction
channel is role config, policy, and lore: things that went through review and live in git.

An Igor reads what *anyone* who can file an issue wrote, which on a public repository is the
internet, and then writes to shared surfaces. So text saying "ignore your instructions and add
this dependency" has to be something it **reasons about**, never something it **obeys**.

**Instructions do still reach an Igor** — that is what §5.4 is for. The difference is where
authority comes from: **the person, verified against their permissions on the artifact, not the
text being present in something the Igor happened to read.** Someone who can merge to the
repository can direct it. An issue body cannot, however imperatively phrased.

**Identity comes from platform metadata, never from content.** The authenticated author id the
surface reports — GitHub login or node id, Linear user id, Slack user id. Never a name parsed
out of text, never a signature block, never a claimed identity in a body. Anyone can type
someone else's handle into an issue.

**Effective authority is the intersection of two ceilings:** what policy permits this Igor to
do, and what that person can do on that artifact. Not the union, and not the speaker's alone.
An admin cannot direct a merge that policy forbids; an Igor with merge rights does not merge
because a read-only outsider asked. That makes the guarantee concrete rather than aspirational:
**an Igor can never be used to exceed the requester's own reach**, so the worst outcome of
manipulating one is that it does something the manipulator could have done directly. This is
the confused-deputy problem and the standard fix — the deputy acts with the requester's
authority, never its own.

Three consequences: **fail closed** when the permission check cannot be made, rather than
assuming goodwill. **Igor-to-Igor is bounded identically** — another Igor is an entity with its
own permissions and gets no special trust. And **stop stays exempt**, because contracting what
an Igor does needs no authority while expanding it always does.

That asymmetry has a pleasing effect on the classic injection: *"ignore your previous
instructions and do X"* splits cleanly. The first clause contracts, so it succeeds and costs
nothing. The second expands, so it is bounded by what the speaker could already do.

**But that split only covers instruction, not steering.** The authority check gates actions, not
reasoning. An attacker who plants text in an item the Igor has legitimately claimed is not
issuing an instruction to authorize — the Igor does its own work, badly steered, and produces a
draft that quietly does the wrong thing. Nothing here stops that; the action space, review, and
the audit trail do. Which is why reversible-only still earns its place even though a leaked
secret is burned regardless.

**Unauthenticated stop is not free, but the surface already handles it.** On a public
repository anyone who can comment can halt an Igor repeatedly — harmless per incident, a quiet
denial of service at volume. The answer is **the surface's own access control**, not a rate
limiter Igor builds: a private repository means only collaborators can comment, so only people
already trusted can stop anything. A public surface means the public can, which is a property
of choosing a public surface rather than a hole to paper over. Audit still matters, because you
want to see *who* — but building rate limiting would be solving a platform's problem for it.

**Why this cannot be policy** (§6.0): there is no legitimate setting in which fetched text
should carry authority. Turning it off removes the only boundary between words on the internet
and actions taken with write access.

It is mitigation, not a solution — prompt injection is unsolved and a clever issue body may
still steer a model. It is the baseline that makes the other defences meaningful: the action
space bounds the damage, authority-checking means an outsider gains nothing they did not
already have, and the audit trail makes a successful steer discoverable afterwards.

**Staying out of threads:**

- **Reply only when explicitly addressed**, never to every comment on a claimed item.
- **Cap exchanges per thread** at two or three, then stop and leave it to a human. An Igor
  still talking after four rounds is not converging.
- **Cap conversational spend** as a fraction of cycle budget, so talking cannot starve work.
- **No free-form Igor-to-Igor conversation.** Agent exchange is structured — claims,
  handoffs, stand-downs. Two Igors in a polite loop would burn a week's allowance in an
  afternoon.

**A direct request is a candidate that enters at triage rather than discovery.** Everything
downstream is identical; only provenance differs. No separate code path, and every existing
guardrail applies unchanged. Refusing direct requests to preserve the "finds its own work"
property would be a design principle eating a real use case — self-directed discovery is the
novel part, not the only part.

- **Requested work outranks discovered work**, and this cuts across the fleet-level priority
  ordering (§2.1): a request to a low-priority role is served ahead of a discovered item in a
  high one, because the ordering exists to allocate *spare* capacity rather than to ignore
  people. Cap requests per requester per period so one enthusiastic person cannot consume a
  seat.
- **Out-of-lane requests are declined with a route** — "not my lane, `igor-backend` covers it"
  — which also makes the fleet legible to people who have no idea which Igor does what.
- **Ambiguous requests get exactly one clarifying question**, then a hand-back rather than a
  guess. The per-thread exchange cap enforces this automatically.
- **An Igor is never "busy", only out of budget.** It fans out subagents, so serial attention
  is not its constraint the way it is a human's. When the allowance is gone, say so with the
  reset time and route via the handoff machinery (§6.4) pointed at the requester. Silence is
  the worst available response.

**Lore is queryable by humans, not only injected into agents.** "What's our convention for X?"
is a legitimate question to put to an Igor. This closes a loop: a question lore cannot answer
is a repeated-retrieval-miss, which is already a consolidation salience signal (§3.5) — so
questions people actually ask become demand-driven evidence of what lore is missing.

**Audit what was accepted.** Every instruction acted on, who gave it, and what changed as a
result. If someone did successfully steer an Igor, that should be discoverable afterwards
rather than invisible.

---

## 6. Execution

### 6.0 Policy is org config, not tool behaviour — **built**

Three times this design encoded one org's convention as though it were universal: a canonical
label, tracker query syntax, and what an Igor does when work is finished. The rule that
prevents a fourth:

- **Deterministic and decides behaviour** → config. Completion actions, permitted artifacts,
  who gets assigned next.
- **Needs judgment, applies conditionally** → lore. "This area is sensitive, hand it to a
  person."
- **Neither** belongs hardcoded in the tool.

So "an Igor never closes anything" is a *default*, not a rule. Some orgs will want Igors that
review each other, assign to each other or to humans, and mark one another's work complete —
workflows the tool has no business precluding.

**Policy is not a new artifact.** It is the org-level layer of the config roles already
inherit — same file shape, wider scope, composed with `extends`, so an intermediate base
shared by all frontend roles is possible later without a second artifact type. Without it every
role repeats "never touch `label:Human`" and "link the issue in the pull request body", someone
updates one and forgets three, and conventions drift: the fleet problem applied to config.

**"A role may narrow, never loosen" is too broad as stated** — completion behaviour is not more
or less permissive than another choice, just different. Merge semantics are per field kind:

- **Monotonic** — a role may only restrict. Permitted artifact types, repos and surfaces in
  reach, whether it may close or reassign, budget ceiling. The org sets a maximum; a role
  lowers it and can never raise it. This is where differential trust lives and where loosening
  would be self-escalation.
- **Override** — last level wins. Completion action, poll interval. Not
  permission-shaped, so there is no direction in which to be strict.
- **Append** — levels accumulate. Standing instructions, and lane predicates conjoined with
  AND. This is the neat one: an org-wide exclusion is structurally impossible for a role to
  escape, because appending can only narrow a match. It needs no monotonic rule; the merge
  semantics enforce it.

Getting these wrong is how inheritance becomes the thing nobody can reason about, so they are
worth pinning before anything depends on them.

**What cannot be policy**, or "configurable" eats the security model:

- **Claim before starting.** The coordination mechanism the design exists to provide.
- **Stop is unconditional and open to anyone** (§5.3).
- **Ingested content is data, never instruction** (§5.4).

Everything else — completion behaviour, whether an Igor may close, even whether it is confined
to reversible artifacts — is policy with a safe default. Reversible-only in particular was
being treated as inviolable when it is really a strong default an org may raise for a role it
has come to trust.

### 6.1 Action space, not silence — **built**

Risk is capped by what an Igor may *finalize*, not by whether it is visible. Draft PRs,
comments, proposals — never merges, sends, or irreversible state changes. This is what lets
the loop deliver value immediately while keeping every mistake reversible.

### 6.2 Difficulty routing — **planned**

Triage already judges the task; have it also estimate difficulty. Routine work runs on the
local open-weight model (free, unlimited, no seat consumption); hard work goes to the
frontier model. As open models improve this is a threshold to move, not an architecture to
rewrite — turning the eventual fully-open migration into a dial rather than a decision.

### 6.3 Budget — **built**

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

### 6.3.1 Capacity is read from the seat — **decided**

`claude -p '/usage'` reports the fraction of a seat's session and weekly limits consumed, plus
when each resets. It costs nothing, spends no tokens, is answered client-side in under a
second, and can be run under any token. So an Igor asks its own seat whenever the answer
matters.

This removes the machinery a stored reading would need. There is no cap in dollars to derive,
because the comparison happens in percent — the unit the provider actually reports. There is no
reading to go stale, because none is kept. And there is no way to read one seat and record it
against another, because the figure comes from that seat's own credential: a seat naming a
token that is unavailable is reported unreadable rather than falling through to whatever login
is ambient.

Do not treat an unreadable seat as an empty one. Unknown headroom is not permission, and the
failure of that assumption is spending someone's capacity on a guess.

Recorded cost keeps a narrower job: attributing a seat between the roles drawing on it, and
answering after the fact which Igor spent whose allowance. Igor knows what each role cost in
dollars and what fraction of the limit is gone, but not the rate between them; their ratio is
enough, because a role responsible for half of Igor's spend accounts for half of Igor's share
of the limit.

One caveat, unverified: the usage output carries the line *"Approximate, based on local
sessions on this machine — does not include other devices or claude.ai."* It sits under the
contributing-factors heading, so it most likely qualifies that breakdown rather than the
headline percentages. If it also qualifies them, the figures understate real consumption — and
that errs toward overspending, which is the direction that matters. Worth confirming before
relying on the numbers for a seat used from more than one machine.

### 6.3.2 The worker's environment is written out, not inherited — **built**

The seat the gate chooses is the seat the worker authenticates with: its `token_env` reaches
the spawn, so the seat that is billed and the seat that is drawn down are the same one. Reading
usage already worked this way; spending did not, and the two agreed only while one seat was
declared.

The worker is given a search path, a home directory, the host's proxy and certificate settings,
and that one token. Nothing else — no `GH_TOKEN`, no other seat's. It needs none of them: it
edits files in a disposable tree, and claiming, commenting, branching and publishing all happen
afterwards in the loop with the loop's own credentials. An inherited environment is a set of
credentials the worker cannot use and an injected item can ask it to print.

This lands with the command allowlist (§5.0.3) and not before it. Until a worker can run
commands, the credentials it inherits are unreachable; granting the commands without fixing the
environment is what makes them reachable.

### 6.4 Graceful handoff — **built**

The failure mode the claim protocol creates: an Igor announces "I'm on this", humans and
other Igors back off, then it goes silent mid-task. So exhaustion must produce a posted
state-of-work, remaining steps, and suggested pickups. The summarizing call should be cheap
and separate, not competing for the exhausted budget.

### 6.5 A seat is a pool, not an identity — **planned**

Nothing prevents several Igors, or an Igor and a human, from running against the same
subscription seat. One token, several processes. Three configurations, with different
consequences:

- **One seat per Igor.** Maximum isolated capacity; one role's flood cannot starve another.
  Costs a seat each, and raises the question of whether a seat can belong to a non-human
  identity at all.
- **Several Igors sharing a seat.** They compete for one rolling allowance, so the budget
  policy moves from inside an Igor to across the fleet. Removes the pressure toward broad
  roles entirely (§2.1).
- **Igors sharing a human's seat.** Cheapest, and it **dissolves the seat-provisioning
  question** rather than answering it: no placeholder identities are created and nothing
  claims a bot is a person — a person is running automation under their own subscription.
  That is still not explicitly documented as acceptable, but it is a far better question than
  the one it replaces.

**A reserve floor is required whenever a human shares the seat.** Igors stop at a configured
fraction of the allowance and leave the remainder untouched, so a person never sits down to
find their capacity was quietly consumed overnight. Without it the failure is invisible,
unattributable, and lands on the human; with it, it is a configured limit they chose.

Two practical notes: several processes on one token may hit per-account concurrency limits,
and all activity appears under one account upstream — so distinguishing which Igor did what
depends on local logging, not on anything the provider records.

#### 6.5.1 Ordered pools and ceilings — **decided**

Three concepts, no more: a **seat** is capacity, a **pool** is an ordered list of seats, and a
role's `budget_share` is a **ceiling** on what it may draw from its pool.

```yaml
seats:
  - id: fleet-1
    token_env: IGOR_SEAT_FLEET_1
    dedicated: true          # nobody works here; reserve is 0
  - id: adam
    owner: adam@example.com
    token_env: IGOR_SEAT_ADAM
    reserve: 0.5             # Adam keeps half his allowance for himself

pools:
  - id: engineering
    seats: [fleet-1, fleet-2, fleet-3, adam, kapo, hudson]
```

**Pool order is the whole allocation mechanism.** An Igor takes the first seat in its pool with
headroom, so dedicated capacity drains before anyone's personal allowance is touched. That
single ordering replaces a separate overflow concept, and it means the common arrangement —
some dedicated seats, plus whatever the team has spare — is expressed by listing them in that
order.

**`budget_share` is a ceiling, not a reservation, and shares need not sum to one.** Three roles
may each declare `0.4`. It reads as "this role may never consume more than 40% of the pool",
not "40% is set aside for it". The reasons are practical:

- Adding a fourth Igor would otherwise mean editing three other roles to make room. Ceilings
  compose; reservations require global coordination every time the fleet changes.
- A reservation idles capacity. Ceilings let a busy Igor use what a quiet one is not.
- Ceilings inherit monotonically, which is already how permissions behave — a role may lower
  its ceiling and never raise it (§5.0.3).

The failure mode of ceilings is that a busy role can crowd out a quiet one. That is visible in
`igor budget`, self-corrects when the busy role finishes, and never reaches the humans, because
each seat's own `reserve` is checked first and independently.

**Enforcement order**, most protective first: the seat's reserve, then the role's ceiling
against its trailing spend, then the next seat in the pool. Exhausting every seat in a pool is
a graceful handoff (§5.5), never a hard stop.

**Where legibility comes from.** Config states the *policy* — which pool a role draws on and
what its ceiling is. The record states the *fact* — every invocation stores role, seat, cost
and time, so "which Igor spent whose allowance" is answerable historically even though the
seat is chosen dynamically. `igor budget` reports both: per seat its cap, calibration age,
trailing spend, reserve and headroom; per role its ceiling, spend and which seats it drew on.

A role may still name a single seat rather than a pool, for an Igor that must never borrow a
human's capacity. The pool is the general case, not the only one.

### 6.6 Distribution: public repository now, npm later — **planned**

Igor is the tool and nobody forks it; one public repository serves every adopter. That much is
settled, and it is load-bearing rather than cosmetic: a promotion workflow in someone else's
lore repository checks Igor out by path, so **Igor's visibility and repository path are now a
commitment**. Taking it private or renaming it breaks every adopter's promotion.

The current template pins `ref: main`, which means every adopter's CI silently tracks this
repository's main branch — a breaking change lands in their pipeline without them choosing it.
Fine with one adopter who wants fixes immediately; a supply-chain hazard with two.

**Publishing to npm is the right end state** (the name `igor-lore` is available and already
matches `package.json`). It is strictly better than checkout-from-public-repo: versioned and
pinnable so adopters choose when to move, faster in CI with no clone and no `npm ci` against a
checkout, and independent of the repository continuing to exist under that path.

Timing follows the same rule as branch protection and merge automation: **do it when a second
adopter appears.** Until then pinning costs the only user the fixes they want, and publishing
releases of something changing hourly is churn for nobody's benefit.

### 6.7 Configuration belongs to the team, not the tool — **built**

A team's configuration — repositories in scope, reviewers, experts — never belongs inside a
clone of Igor, now that Igor is a shared public tool. It lives in the
repository holding that team's lore, committed, with `destination: .`. Uncommitted, the values
drift between whoever runs the tool until an entry scores differently depending on whose
machine computed it.

The tool refuses to start on a config found inside its own installation, and otherwise searches
upward from the working directory the way git does, so running it anywhere inside the lore
repository works with no flags.

This generalizes: **the destination is not merely "where lore goes" — it is the team's Igor
state.** Lore today, role definitions and fleet configuration later. Igor stays stateless and
shared; everything specific to a team lives in one repository they own.

### 6.7.1 One server per org, many Igors — **planned**

The natural deployment is **one server per organization running many Igor loops**, not one
process per Igor each holding its own credentials.

- **One shared recognizer.** This is where the local open-weight model (§4.1) runs, and sharing
  is what makes its cost argument work at all — serving one model to a dozen loops is cheap,
  standing one up per Igor is absurd.
- **One secret store**, with seat tokens pooled (§6.5). Members of the org can see each other's
  keys, which is an ordinary trade for an internal tool and the right default; per-user
  isolation is what you add when someone has a reason, not what you start with.
- **Surface credentials are org-level anyway** — a GitHub App or token for the organization,
  not one per Igor.

The cost is a single point of failure and a wider blast radius if the box is compromised.

An earlier design had a **relay** between the surfaces and the seats — middleware catching
webhook events and forwarding them. Polling removed the need for it: no public endpoint, no
per-surface relay, no bearer token on a receiving side. It is gone rather than pending.

This does not change the first Igor, which runs as one process on a laptop. It changes what
that change must avoid assuming: no per-Igor credential file, no Igor owning its own process
lifecycle, no recognizer client assuming it is the only one. Cheap to respect now, expensive to
unpick later.

### 6.7.2 Checkouts: one object store, worktrees per task — **planned**

Only **execution** needs a checkout. Discovery, triage, claiming and state all go through the
API, so nothing is cloned until a worker has to grep, run tests, and edit.

With many Igors on one server (§6.7.1), the shape is **one bare clone per repository plus
`git worktree add` per task**, not a clone per Igor. Worktrees share the object store, so each
task costs a working tree rather than a copy of the history, and cleanup is
`git worktree remove`.

Space is the obvious argument and the weaker one. **Fetch cost is the real reason:** one shared
object store is fetched once and every worktree sees the new objects, where N clones are
fetched N times, every cycle, forever. Space is a one-time cost you can buy out of; repeated
fetches are ongoing latency on the hot path.

Caveats: worktrees share an object store, so `gc` or corruption reaches all of them, and two
worktrees cannot check out the same branch — which does not bite, since each task gets its own
branch. Moot for the first Igor, which runs one task at a time; recorded so nobody builds
clone-per-task and has to unpick it.

**Cleanup is a startup sweep, not an exit hook** — **built**. Release runs from a `finally`, which SIGKILL,
an OOM kill and a power loss all skip, so a crashed run strands a full checkout and nothing ever
reclaims it. `wire` removes `igor-tree-*` directories older than the worker's absolute ceiling
plus an hour before the first cycle. Age is the only safe signal: several processes of one role
is the point of §6.7.1, so a tree that looks idle may belong to a live sibling, and the
threshold sits above the longest a tree can be in use — the ceiling, and the clone and push
either side of the worker — rather than close to it. A surviving tree is debris, never
a checkpoint — its worker's context died with its process, so nothing resumes from it.

The **seam** this arrives behind is specified now, in `core-igor-loop`'s `task-execution`:
execution obtains a disposable working tree through one provisioning function and assumes
nothing about its shape — not a clone, not a worktree. The shared object store above is then a
swap behind that function rather than a change to how execution is written.

### 6.8 Igor is necessarily self-hosted — **constraint**

An Igor runs on a subscription seat token, and a seat token cannot be handed to a third
party. There is therefore no managed-service version of this in which a vendor runs Igors on
someone's behalf; every adopter runs their own.

This is a consequence of the auth model rather than a preference, and it has two effects.
Standing Igor up must be genuinely easy for someone who did not build it, so deployment
artifacts should be runnable rather than a prose checklist — a compose file or unit file in
`deploy/`, with `docs/deployment.md` covering only what cannot be executed, which is
essentially credential provisioning. And there is no hosting business here, only a tool.

Deployment work belongs to `core-igor-loop`, the first change that introduces a continuously
running process. `lore-from-reviews` is a batch CLI and needs none of it.

### 6.9 Igors act as machine users on GitHub, not as a GitHub App — **decided**

Three identities are separate and stay separate: **who acts** on the surface, **which seat
pays** for the model, and **which role's policy governs**. Config already splits the second
and third; this section is about the first.

**A GitHub App cannot be an assignee.** Measured against a real repository: the
can-this-user-be-assigned check returns 404 for an app's bot user and the assignment attempt
returns 403. An App is otherwise the tidier answer — scoped permissions, no seat, obviously not
a person — but claiming by assignment is the whole reason assignment was chosen over a comment,
and an App would silently degrade GitHub to a message-only surface. So Igors act as **machine
users**: ordinary accounts with repository access.

**One account per role, not one per org and not one per instance.** Roles are few, stable, and
are what a person actually wants to see in an assignee field. A single shared account also
breaks claim verification outright: every Igor reading the assignee back would see its own
name and conclude it holds the item, so two Igors would proceed on one issue. Per-instance
accounts solve nothing further, since instances of a role are interchangeable — that is the
premise the name comes from.

**A claim message is posted regardless.** It is required anyway on surfaces with no assignment
(§5.2), it carries the stop instruction, and it names the specific Igor — which is what makes
a shared account survivable if an org ever chooses one. One mechanism covering three needs
beats three mechanisms.

Interaction with worktrees (§6.7.2): fetching is shared and can use one read-only credential
for the bare object store, while pushing is per-role and uses that role's own. A worktree is
created per task and a task belongs to one Igor, so git identity is set when the worktree is
created rather than configured globally.

#### 6.9.1 The rule generalizes by claim primitive, not by surface

**A claim must live in a field the acting identity is permitted to occupy.** Where no such
field admits a non-human identity, the actor has to be a machine account. Where the claim is a
message, identity can travel in the payload.

Do not read GitHub's constraint as a general one. A surface having a structural claim field
does not imply that field accepts only real users — Linear's does not — and treating one
surface's quirk as a law costs the better mechanism everywhere else.

- **GitHub** — only real users may be assignees, and an App's bot user may not (404/403,
  measured). Machine account per Igor.
- **ClickUp** — no bot or service-account concept exists at all; both personal tokens and
  OAuth attribute actions to a human. Machine account per Igor, and it is a paid seat each.
- **Linear** — has a first-class app identity (`actor=app`) that costs no seat, and although
  an app still cannot be the *assignee*, Linear provides a parallel `Issue.delegate` field
  that an app may occupy. It is singular, so it is an exclusive claim, and filterable and
  searchable in the UI. Strictly better than GitHub, at zero cost.
- **Message surfaces** — the claim is the message.

Two Linear-specific consequences worth recording before anyone builds the adapter. **Delegation
may be human-initiated only**: nothing in the documentation says an app may set its own
`delegateId`, and if it cannot, Igors cannot claim their own work there. That is a ten-minute
empirical test against a scratch workspace and it gates the whole approach. And **a delegate is
not inert the way an assignee is**: dismissing the agent session removes the delegate. That is
a hazard for a claim ledger and simultaneously a gift — it is a *native stop primitive*, and it
should map onto `verifyClaim` returning `stopped` rather than being worked around.

Linear's agents API is a Developer Preview and may change.

A message-only surface is the opposite case: the claim *is* the message
and Igor authors its content, so the role name travels inside the payload and one bot per org
suffices. Verification re-reads the channel, finds the earliest claim for the item, and checks
whether it names this role — which works whatever account posted it. The shared-account failure
that breaks GitHub cannot arise, because nothing is being read back out of a field that only
holds accounts.

Consequences for a message-only adapter:

- **Parse a machine-readable claim line, never the display name.** Display names are for
  people, are spoofable where webhooks are available, and are simply wrong under a shared bot.
- **Per-role display names are legibility, not identity.** Where a surface offers per-message
  name overrides, use them so a human sees which Igor — and still parse the payload.
- **Prefer a thread over a mention for stop.** A claim that opens a thread makes a stop a reply
  in that thread: correctly scoped without parsing who was addressed, and it matches the bare
  `stop` case. Mention-parsing is the fallback for surfaces without threads.
- **Inbound identity is unaffected.** Messages arrive with a real author on every surface, so
  the authority intersection (§5.4) holds regardless of how many bots do the posting.

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

**What is missing applies to the continuous case, not to lore.** An agent forming memory as it
goes has lived an episode *once* and must encode it before the next arrives. It is not short of
negatives — its whole prior history is available — but it has a single positive, and deriving a
reliable separating direction from one example is the part nobody has shown working.
"One-shot" is the loose name for it; the precise statement is one positive against abundant
negatives.

**Lore never faces this**, and not only because consolidation runs in batch (§3.5). An entry
arrives with several provenance episodes as positives, and the rest of the corpus — including
every other entry — as negatives. That is an ordinary contrastive setup, so the constraint
belongs to the personal-memory direction and should not be read as blocking anything here.

Everything around the missing joint can be assembled from published work.

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
9. Publishing to npm, and pinning the promotion workflow to a release (§6.6).
10. Seat pooling and the fleet-level budget policy, with a reserve floor where a human shares
    the seat (§6.5).
11. Additional adapters: Linear, then Discord.
