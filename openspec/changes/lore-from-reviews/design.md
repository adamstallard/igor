## Context

A team's code review history is a labelled corpus of expert corrections: a named person
saying "this is wrong, do it this way" about a specific artifact, at the moment it
mattered. It already exists, nobody mines it, and senior people go on re-teaching the same
corrections by hand.

This change is a batch job over that history. It produces **lore** — a small curated store
of what the team has learned — and nothing else. There is no agent, no long-running
process, and no writes to any team surface. That makes it a safe first change: the worst
failure mode is a bad pull request against a store nobody depends on yet.

The store schema decided here is load-bearing. `core-igor-loop` consumes it, so entry
format is the one thing in this change that is expensive to get wrong.

## Goals / Non-Goals

**Goals:**

- A lore store that a human can read end to end and would want to.
- Entries with provenance back to the comments they came from.
- Extraction that separates live conventions from dead ones.
- A review workflow that obtains consent by construction rather than assuming it.
- Re-runnable: a second pass over more history adds without duplicating.

**Non-Goals:**

- Retrieval or firing. Lore is read by humans in this change.
- Learned condition vectors, SAE-legible conditions, activation keying.
- Sources other than code review.
- Ongoing consolidation from live episodes.

## Decisions

**Store format: one markdown file per entry, in git, under a configurable path.**
Git gives diffability — which is how drift is detected later — plus a review workflow that
already exists, greppability, and survival across model and vendor changes. A database
would retrieve faster and review worse; retrieval speed is irrelevant at a store size
deliberately capped in the hundreds. Lore lives at a configured path (default `lore/`) in
the repo being operated on, not inside Igor itself, because lore is the operating team's
data while Igor is the tool acting on it.

Frontmatter carries: `id`, `claim`, `conditions`, `scope`, `provenance`, `support`,
`recency`, `status` (`provisional` | `active` | `deprecated`), `supersedes`, `reviewed`.
`core-igor-loop` adds firing metadata; nothing here should block that.

**Source: review comments only.** Almost every review comment is already a correction
event, so the salience filtering that Slack or ticket history would need is mostly
unnecessary. Broader sources are deferred rather than rejected.

**Stick detection by line-range overlap with subsequent commits.** A comment followed by a
change to the lines it targeted is a correction that landed; one that produced no change
was argued down, deferred, or ignored. This is the highest-value filter available and it
is computable from data the API already returns.

It is a heuristic with real holes in both directions — an author may comply with something
they disagreed with, an unrelated edit may touch the same lines, and a correct comment may
be deferred to a follow-up PR. It is treated as evidence, not truth: it weights a cluster
rather than gating an individual comment, so noise averages out across a cluster and a
single misread comment cannot promote a rule on its own.

**Two scores, not one: support count and recency-decayed weight.** Cluster size alone
rewards rules that were enforced heavily years ago and quietly abandoned, which is exactly
backwards — frequency of historical correction is not evidence of current convention.
Clusters are therefore scored on both, with exponential decay on comment age.

High-support, low-recency clusters do not get suppressed; they route to a **separate review
queue asking "did you stop doing this?"** A list of conventions the team abandoned is
useful output in its own right, and a human answering "no, we still do that" promotes the
entry with better evidence than the score had.

**Conditions are derived from source paths, not invented.** If every comment in a cluster
landed on `.tsx` files under `src/components`, that is the firing predicate. Derived
predicates are exact, free, perfectly legible, and need no model. Clusters whose source
paths share no useful prefix get a prose condition and no predicate — they are candidates
for learned conditions in a much later change, not a reason to build that machinery now.

**Routing: role config versus lore.** Guidance about how one role should behave becomes a
proposed role config change; guidance that applies to anyone touching an area becomes a
lore entry. The distinction matters because role config is always-loaded standing context
while lore fires conditionally, and mis-routing either bloats every invocation or buries
standing guidance behind a predicate.

**Review is a pull request assigned to the mined author.** This is the consent mechanism
and the accuracy mechanism at once: the only person who can confirm "yes, that is what I
meant, and yes, we still do it" is the person who wrote the comments. It is also low
effort and reads as flattering rather than extractive.

- **Decline kills the entry outright, with no appeal.** One lost rule costs far less than
  one person feeling their judgment was harvested over their objection.
- **Non-response past a window routes to the role owner**, who may approve on currency
  grounds.
- **Authors who have left are mined, but the rule is attributed to the role, not the
  person, and the current role owner vouches for it.** The entry reads as the present owner
  asserting "this is our convention," with provenance citing the historical comment as
  evidence. Nobody speaks for a departed person; a public artifact they did write is simply
  cited, which is ordinary. The rejected alternative — excluding departed authors entirely
  — was considered more defensible at first but discards most of the historical corpus in
  any team with turnover, including conventions still in force, while protecting against a
  misattribution that attributing to the role already prevents. Currency, the thing that
  actually matters, could not have been vouched for by a departed author anyway.

**Batch cap of 20, configurable.** The failure mode that kills this approach is not bad
extraction, it is dumping four hundred candidates on a reviewer who then never opens the
queue again. Batches are sequential: the next opens only when the previous resolves. The
cap is configuration because the right number depends on the reviewer's patience, which is
not knowable in advance.

**Implementation in TypeScript, run as a CLI.** Node is already present in the toolchain,
GitHub API clients are mature, and `core-igor-loop` will shell out to the `claude` CLI
anyway. Python would be the alternative if clustering moves to local embedding models; that
is not a reason to split the toolchain now.

**Clustering uses embeddings; drafting uses an LLM.** Clustering is a similarity problem
and does not need generation. Drafting each cluster into a claim plus conditions does.
Drafting cost scales with cluster count rather than comment count, which keeps a backfill
over years of history affordable.

**Idempotency via a processed-comment ledger.** Re-running must not duplicate entries. A
ledger of processed comment ids, plus dedupe against existing entries at draft time, makes
re-runs additive. An entry that a new pass would refine becomes a proposed edit rather than
a second entry.

## Risks / Trade-offs

- **Stick detection misreads compliance for agreement** → Weight clusters rather than
  gating comments; require multiple corroborating instances before promotion.
- **The drafting model invents a rule the comments do not support** → Provenance links are
  mandatory and the reviewer is the person who wrote the source comments, so fabrication is
  visible to the one reader most able to catch it.
- **Review fatigue kills the workflow** → Hard batch cap, sequential batches, and entries
  drafted to be readable in under a minute.
- **Private review comments contain sensitive material** (incidents, security, personnel)
  → Repo scope is explicit configuration rather than "all repos", and no content leaves the
  environment except to the drafting model already trusted with the codebase.
- **Clustering splits one rule or merges two** → Support counts read low or conditions read
  incoherent; both are visible at review, which is why a human gate exists before anything
  becomes active.
- **The schema decided here proves wrong for retrieval** → Entries are markdown with
  frontmatter, so migration is a scripted rewrite over a few hundred files rather than a
  data migration.

## Open Questions

- Does the GitHub API expose enough to detect stick reliably — comment line ranges against
  subsequent commit diffs within a pull request — or does it need the Timeline API and
  additional calls per comment? This should be verified empirically against one real repo
  before the extraction step is built.
- Which embedding model for clustering, and does it run locally or through an API? Affects
  whether repository content leaves the environment.
- Should lore eventually live in its own repository rather than a path inside the operating
  team's repo? Deferred until there is a second consumer.
