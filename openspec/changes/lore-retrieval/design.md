## Context

The lore store works, holds six reviewed entries, and nothing reads it. This change connects
the two halves of the project.

The design record is `docs/architecture.md`, particularly §3.3 on firing and §4 on
recognition. This document covers only what implementing this change required deciding, and
several of those decisions **removed** things the proposal originally specified.

One measurement shapes everything below. The whole store — six entries, bodies included — is
**1,600 tokens**; their claims and conditions alone are **308**. At that size retrieval has no
selection problem, and most of the machinery proposed for it would be answering a question
nobody is asking.

## Decisions

**Inject everything in scope.** No index, no cap that bites, no ranking. Selection needs a
rule, and a rule authored before there is data to test it is a number nobody can argue with
later — the same mistake as guessing a budget threshold before any spend existed.

**Exceeding the token budget is reported, not resolved.** This is the one place the change is
opinionated about a failure it has never seen. A dropped lesson is silent: the worker proceeds
confidently without it and the output looks fine. Reporting "47 in-scope entries, 12k tokens,
over the 4k budget" is both the honest response and the trigger for building a relevance
filter, so the system asks for its own next change rather than degrading quietly.

**Status and scope stay exact; relevance never becomes exact.** These look like the same kind
of filter and are not. Scope is visibility and status is review state — a wrong answer there
shows one team's material to another, or lets unreviewed material instruct a worker. A wrong
relevance answer costs some attention. Only the second is safe to delegate to a guess.

**Path globs inform judgment; they do not perform it.** A glob is an attempt to say "this is
about that part of the system" in a language that cannot quite express it, which is why it
matches so weakly before a worker has opened anything — issues name paths 14% of the time on a
busy repository and 1.3% on a quiet one. The globs stay in the entry, where they help a model
or a human decide, and stop being the matcher.

**Recency is removed rather than demoted.** Every entry in the real store scores between 0.03
and 0.34 on a 365-day half-life, because lore is mined from historical review comments and is
old by construction. The most architectural lesson in the store — the one whose own body says
it was "kept because it is architectural rather than local" — scored lowest. A mechanism that
systematically buries the corpus the project is designed to build is not worth keeping as a
tiebreak.

**Quality belongs to review, not retrieval.** Support and expert authorship answer "is this
lesson real", which a human already decided when approving the entry. Ranking active entries
by those signals at retrieval implies some active entries are second-class, and if that is
true the fix is better review rather than an automatic discount nobody sees. Support still
travels with the entry, as information for the worker rather than as a filter.

**Firing records go to the state branch, and are a log rather than a counter.** Writing counts
into entry files means a commit to human-reviewed material on every fire. More importantly, a
count throws away the shape that matters: each decision records the item, the entries, and
eventually whether each applied — which is the contrastive corpus condition vectors train on.
A count derives from the log; the log cannot be recovered from a count.

## Roads not taken

- **The inverted predicate index**, stamped with the store commit. Its argument was matching
  speed, but neither successor mechanism matches by predicate: a model filter sends all
  conditions, and a vector match needs all conditions as a matrix. Both load everything by
  construction, so an index that avoids loading everything helps neither.
- **Match strength.** It exists only to order an unordered relevance result. A model asked
  which conditions apply returns them in order; a vector match returns scores. It arrives free
  from whichever mechanism eventually does the filtering, and never needs designing.
- **Conflict resolution at retrieval** — narrower scope, then higher support, then more
  recent. Recognising that two entries contradict requires understanding both, which only the
  worker has. A retrieval rule picking a winner hides the store defect review exists to catch.

## Risks / Trade-offs

- **Every entry reaching every worker is mostly noise** — five of six entries are irrelevant to
  a given item. Accepted: the conditions tell the worker when each applies, and the alternative
  is automated relevance that can be wrong. Noise costs tokens; a miss costs the point of lore.
- **A bad entry now affects output** rather than sitting inert. That is the change working as
  intended, and it is why `active` is a reviewed state rather than a default.
- **The store's growth is unbounded and injection is not** — this design has a known breaking
  point rather than a hidden one, and reaches it loudly.
- **No firing history is produced beyond what fired** — rejections, which are most of the
  training corpus for condition vectors, only start with the relevance filter. This change
  produces the smaller half.
- **The dilution claim is inherited, not measured.** That injecting many marginal entries
  degrades output is the justification for having a budget at all, and nothing here tests it.
  With 1,600 tokens it cannot be tested; when it can, the experiment is cheap.

## What the first run against a real store contradicted

Ran on `adamstallard/igor#1` with all five entries in context. It produced a draft pull
request that typechecks, passes 293 tests including six it wrote, and refuses partial
`--url`/`--author` pairing rather than guessing which author a URL belongs to. Good work.

**Whether lore caused any of it is unproven.** The worker wrote the conditional-spread pattern
the `exactOptionalPropertyTypes` entry teaches, and its report mentions reasoning about that
constraint by name. But TypeScript would have rejected the alternative anyway, so the entry may
have saved a compile-fix cycle rather than prevented anything. Suggestive, not attributable —
and attribution needs a comparison this change cannot run, since the same item cannot be worked
twice from the same starting state.

**Four of five entries were irrelevant to the item and did no visible harm.** That is the
inject-everything trade-off holding at this size. It says nothing about fifty.

**Execution cost $3.60** — twenty-five times the average across four sandbox items, seventy
times the one-line CI fix. Real work on a real codebase is a different economic animal, and
every cost figure recorded before this one described toy changes.

**Part of that is the worker spawning subagents.** Its report describes "a second reviewer pass"
over the diff. So an execution is not one model call with a knowable cost — it is a tree of
them, and the budget gate sees only the total, after the fact.

**And it exceeded the item.** Asked to let `create` cite multiple provenance items, it also
authored a new OpenSpec change — proposal, tasks and a spec delta — that nobody requested. The
standing instruction to keep specs current made that defensible, and it is still scope the
action space does not bound: `allow` governs what *kind* of action an Igor may take, and
nothing governs how much it may change while taking one.

## Open Questions

- The token budget has no basis yet. It should be large enough that six entries are nowhere
  near it and small enough to catch a store that has genuinely outgrown injection, which is a
  wide range and an easy first guess to correct.
- Whether the worker should be told an entry is old. The date travels with the entry, but
  nothing says what a worker should make of a lesson whose evidence is five years old and
  still active.
- Whether the action space should bound the *size* of a change, not only its kind. One run
  produced an unrequested OpenSpec change alongside the fix it was asked for.
