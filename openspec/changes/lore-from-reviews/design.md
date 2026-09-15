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

The filename is the entry id. Frontmatter:

```yaml
id: use-query-hook-not-useeffect-fetch   # kebab slug, frozen at creation
claim: >-                                 # one or two sentences
  Fetch data with the shared query hook rather than calling fetch inside
  useEffect — the hook handles caching, deduping, and cancellation.
scope: role:frontend                      # global | role:<name> | project:<name>
status: provisional                       # provisional | active | deprecated
conditions:
  paths: ["src/**/*.tsx"]                 # derived predicate; may be absent
  prose: >-                               # always present
    Applies when adding or changing data fetching in a React component.
provenance:
  - url: https://github.com/org/repo/pull/412#discussion_r1029481
    author: sarah
    at: 2026-03-14
supersedes: []
reviewed:
  by: sarah
  at: 2026-09-13
```

The body holds reasoning and exceptions. `core-igor-loop` adds `fired` (count and
timestamp); nothing here should block that.

**Provenance is the single source of truth for scoring.** Support count is the number of
provenance items, recency is a decay over their dates, and author weighting reads their
authors — all derived at index time rather than stored. Storing `support` or `recency` as
frontmatter would desync as soon as time passed or a provenance item was added.

**The id is frozen at creation.** The slug is derived from the claim because legible
supersession pointers and diffs are worth more than a hash, but rewording a claim later must
not move the id, since other entries reference it. Collisions take a numeric discriminator.

**No role objects in this change.** An earlier draft defined a minimal role file here, on
the grounds that review routing and role-versus-lore routing both need one. Neither holds:

- The reviewer is the author the comments were mined from, which comes from provenance. A
  role is only implicated in the fallback cases — no response, or a departed author — and a
  single configured `reviewers` list for the store covers those without inventing a domain
  concept.
- Routing guidance into role config is meaningless while nothing consumes role config.
  Roles do not become runtime objects until `core-igor-loop`, so "propose a role config
  change" would mean writing to a file nothing reads.

So everything this change produces is a lore entry, and `scope` is a **label**
(`global`, `role:frontend`, `project:<name>`) rather than a foreign key. Tagging an entry
`role:frontend` requires no role to exist. When `core-igor-loop` defines roles, entries
already carrying that scope can be promoted into standing instructions at that point —
which is also when there is enough information to define the role schema well. The cost of
deferring is a possible tag rename if eventual role names diverge from the labels.

**Source: review comments only.** Almost every review comment is already a correction
event, so the salience filtering that Slack or ticket history would need is mostly
unnecessary. Broader sources are deferred rather than rejected.

**Stick detection reads `line: null`, GitHub's own outdated marker, not a diff of later
commits.** A review comment's REST payload carries `line: null` exactly when GitHub
considers the comment outdated — the hunk it was anchored to no longer exists in the pull
request's final diff. It is free: it arrives in the same page of comments mining already
fetches. `position` is not that marker despite what the API docs imply; it was populated on
all 2,009 comments measured, outdated ones included.

The measurement is in **Stick detection, measured** below. In short: the free signal is
exactly GitHub's `outdated`, the 33×-more-expensive route of diffing later commits agrees
with it only 75% of the time while measuring the same proxy, and what any of them prove is
weaker than this change originally assumed.

**Stick detection weights, it does not gate, and it is believed most when it says no.**
Among threads hand-labelled as the author actually rejecting the correction, 32% read as
outdated; among threads where the author said they had made the change, 80%; among threads
with no reply at all, 69%. Outdated is therefore the common case and says little on its own,
while *not* outdated on a merged pull request is the informative reading. A cluster is
weighted down by comments that did not stick rather than up by comments that did.

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

**Routing to role config is deferred, not abandoned.** The eventual distinction matters —
role config is always-loaded standing context while lore fires conditionally, so
mis-routing either bloats every invocation or buries standing guidance behind a predicate.
But it cannot be acted on until something loads role config. Until then, candidates that
would eventually be standing guidance are written as lore entries carrying a `role:` scope
label, which is enough information to promote them later without deciding now.

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

## Stick detection, measured

The corpus: 2,400 review comments from `vitejs/vite`, `microsoft/TypeScript`,
`supabase/supabase` and `facebook/react` — the oldest 300 and newest 300 of each, spanning
2013 to 2026. Removing bots (381) and file-level comments (10) leaves **2,009 human
line-anchored comments**, every one of which joined to its GraphQL review thread: **1,664
threads across 588 pull requests**, zero unmatched.

### Which fields are actually there

| field | null | reading |
| --- | --- | --- |
| `position` | 0/2,009 | always populated; not the outdated marker the docs imply |
| `original_line` | 600/2,009 | all 600 from 2013–2014 — old comments carry no line anchor at all |
| `line` | 1,175/2,009 | this is the outdated marker |
| `side`, `diff_hunk`, `commit_id`, `original_commit_id` | 0/2,009 | always present |
| `commit_id` ≠ `original_commit_id` | 1,367/2,009 | only says the head moved; proves nothing about the comment's lines |

Restricted to the 1,409 comments that carry `original_line`, `line: null` and GraphQL
`outdated` agree 97.2%, and the disagreement is one-directional: **809 comments are
`line: null`, and every one of them is `outdated`** — zero exceptions. GraphQL flags a
further 40 that REST still anchors. So the free field is a subset of the paid one, never a
contradiction of it, and the 4.7% it misses is recoverable from the thread query that reply
text needs anyway.

### The expensive route is worse, not just dearer

For 80 comments on merged pull requests with more than one commit, the anchored line range
was compared against every later in-pull-request commit touching that file (`compare
original_commit_id...head`, hunk-overlap on the pre-image). Four were unevaluable because
`compare` omits `patch` for large files. On the remaining 76: 35 both, 7 outdated with no
overlapping change, 12 changed without being marked outdated, 22 neither — **75%
agreement**. Read as outdated predicting the diff, that is 83% precision and 74% recall, but
neither side is ground truth, so the honest reading is simply that two proxies for the same
thing disagree a quarter of the time.

It costs **328 API calls per 1,000 comments** (one per unique pull-request/original-commit
pair, cached) against **10** for the REST listing and **21** for batched GraphQL threads.
Paying 33× to disagree a quarter of the time with a free signal would be worth it if the
expensive one were ground truth. It is not: both measure the same proxy — "did the anchored
hunk change" — and a rebase, a force-push, an unrelated edit in the same hunk, or a file
deletion satisfies it with no correction having landed. Force-pushes are not an edge case:
12 of 48 sampled merged pull requests (25%) had one, and a force-push rewrites the very
commit range the comparison walks.

### What outdated proves about agreement

Thread state does not settle until the pull request does: of 1,297 threads from 2019 on,
540 sat on unmerged pull requests and read 47.8% outdated against 66.8% on merged ones.
Everything below is merged-only, n=757.

A regex over the pull-request author's own replies, cross-tabbed against `isOutdated`,
looked like it showed no separation — until all 38 threads it called pushback were read by
hand. Only **19 were genuine rejections**; 10 were compliance the regex misread on words
like "but" and "actually", and 9 were inconclusive discussion. Hand-labelled:

| thread | n | outdated |
| --- | --- | --- |
| author rejected the correction | 19 | 32% |
| author said they made the change | 92 | 80% |
| no reply from the author | 492 | 69% |
| regex called it pushback, hand-read as compliance | 10 | 80% |

So `outdated` separates rejection from compliance by roughly 2.5× in odds, but the no-reply
majority sits at 69%, near the compliance rate rather than midway. **Outdated is the default
state and carries little information; not-outdated on a merged pull request is the signal.**

Two honest limits. The 32%/80% contrast is measured only on the ~30% of threads that get any
author reply, and those are the more engaged threads by construction; for the 492 no-reply
threads there is no independent check on what outdated means. And 19 hand-labelled
rejections is a small n — enough to reject the diluted regex reading, not enough to
calibrate a weight against.

### Signals rejected

**Thread resolution.** 767 of 1,664 threads resolved (46%), but per repository that ranges
from 18% (`facebook/react`) to 67% (`vitejs/vite`) — it measures house style, not agreement.
Worse, the resolver was the pull-request author on 514 threads and the reviewing commenter
on only 158: "resolved" usually means the person being corrected closed their own thread.
Not used at all. A team that resolves deliberately — reviewer resolves, author does not —
does emit a real signal here, but reading it needs per-repository calibration rather than a
flag: https://github.com/adamstallard/igor/issues/19.

**Reply-text classification by regex.** Half the threads the broad regex called pushback
were compliance. Deciding "did the author agree" from prose needs the drafting model, not a
pattern — but it is high-precision where it fires and costs nothing extra, since the thread
query is already being made.

**The Timeline API.** Across 48 merged pull requests its `committed` events carry sha,
message and parents but no file or line data, and its `reviewed` events carry no per-comment
anchor. Its one relevant event type, `line-commented`, simply re-embeds the same review
comment objects the REST comments endpoint returns — same `line`, `original_line`, `position`
— at the cost of a paginated timeline call per pull request. It adds nothing and charges
more.

### The corpus gate this forces

GitHub does not compute outdated-ness for comments predating line anchoring, and it does not
say so: it reports `false`. Outdated rate was **0/310 for 2013 and 0/317 for 2014**, against
58–64% from 2020 on. Scored naively, every pre-2015 comment reads as "did not stick" — the
signal fails silently in the direction that looks like evidence. Mining therefore skips
comments with no `original_line`, and skips unmerged pull requests, rather than scoring them.

### What the change rests on now

Stick detection was pitched here as "the highest-value filter available". It is not; it is a
free, weak, mostly-negative weight. The filters now carrying this change are **substance**
and **recurrence**, and this gate tested neither. The only evidence about them is the
composition breakdown under **Measured yield** — 46% feature-specific prose, 18%
acknowledgements, 14% questions — which says what has to be discarded, not that the
discarding works. Group 6's
first real run is where that gets tested, and it should be read as a second gate rather than
a tuning pass.

## Risks / Trade-offs

- **Stick detection misreads compliance for agreement** → Measured: it barely separates the
  two (69% of no-reply threads read outdated, against 80% for admitted compliance). Treated
  as a downweight on clusters that did not stick rather than an upweight on those that did,
  never as a per-comment gate, and never the sole reason a cluster is promoted.
- **Stick detection fails silently on old history** → GitHub reports `outdated: false`,
  not "unknown", for comments it cannot anchor. Comments with no `original_line` are skipped
  outright rather than scored.
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

## Measured yield

A spike over one real repository — 277 inline review comments, four years, three human
reviewers, no bots — produced **six** entries a person would want to keep. That is the
number to design against, not the "the same correction fourteen times" framing this change
was originally pitched on.

Composition of that corpus: 46% prose that is mostly feature-specific design discussion
rather than reusable convention, 18% acknowledgements and bare commit links, 14% questions,
11% suggestion blocks (largely wording), 8% one-liners too short to carry a rule. The
recurring-convention fraction is small.

The six that did emerge were worth having and are not things a frontier model would supply
unprompted: index the fields you query on, match the vocabulary already in use, filter in the
query rather than in application code, do not overload a falsey parameter, errors reaching the
API need a typed code, sibling functions should share a signature. Support ranged from 1 to 6
instances.

Two consequences. **Batch caps of 20 are far larger than a corpus this size will fill** — the
cap protects against a reviewer wall that may not materialize until the corpus is an order of
magnitude bigger. And **the value of this change scales with corpus size much more steeply
than assumed**, which argues for pointing it at the largest available history first rather
than the most familiar one.

Clustering in the spike was done by reading, not by embeddings, so it sets a rough ceiling
rather than a prediction of what the implementation will achieve.

## Open Questions

- Which embedding model for clustering, and does it run locally or through an API? Affects
  whether repository content leaves the environment.
- Should lore eventually live in its own repository rather than a path inside the operating
  team's repo? Deferred until there is a second consumer.
