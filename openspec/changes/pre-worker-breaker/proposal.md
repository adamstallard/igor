## Decisions

1. **A breaker per item** (Adam, 2026-10-11). A thrown failure before the worker is refused: the
   claim is given back and the item is tried again next cycle. On the third identical failure in
   a row, the item is instead handed back deferred, or *set down*, and that run's message says
   the Igor has stopped retrying and what brings the item back. *Rejected:* a configurable
   threshold. Three is a constant: one trips on a blip, two can be coincidence. This differs from
   #101, which makes its own threshold configurable, with a default of three; the breaker keeps
   three fixed.
2. **The count is rebuilt from `executions.ndjson`**, one `kind: "pre-worker"` row per failure
   that can count (a failure that records a cure key writes its run row instead, decision 11).
   *Rejected:* a count in memory, which a restart loses; and a store of its own, which two Igors
   can overwrite and which can disagree with the log (`design.md`).
3. **Identical means the same source and the same masked message,** compared through the
   message's hash (decision 15). The source is which surface's call threw. *Rejected:* the source
   alone, and the raw message, which names the working tree's path, a path that differs between
   ranks and between runs. *Accepted risk* (Adam, 2026-10-11): `HTTP 404` and `HTTP 500` from
   the same call count as identical.
4. **Only a tracker or code-host failure counts toward the surface-failure rule**, which ends a
   cycle on two such failures in a row and which the spec calls the *outage rule* (Adam,
   2026-10-11). Which surface failed is known from which surface's call threw. *Rejected:*
   reading it from the error's wording.
5. **Two identical failures before the worker, on different items in a row, end the cycle**
   (Adam, 2026-10-11), and neither counts toward its item's breaker.
6. **After a deferral lifts, one identical failure sets the item down again** (Adam,
   2026-10-11), not three. The answer that lifted it did not cure the failure.
7. **An item alone in its cycle counts a failure every item would meet, once per cycle** (Adam,
   2026-10-11). With one run, nothing tells the item's failure from the environment's.
8. **The deferral lifts by `work-triage`'s existing rule**, with no rule of its own.
9. **Both cycles apply both two-in-a-row rules** (Adam, 2026-10-17): `serve`'s cycle and the one
   `igor run` runs each end on two surface failures in a row (decision 4) and on two identical
   failures before the worker on different items in a row (decision 5), through the one
   comparison function both call (task 4.5). Without the surface rule in `igor run`, tracker
   failures whose messages differ each count toward their item's breaker during an outage.
10. **A set-down can be posted for a failure that a later run excludes** (Adam, 2026-10-17).
    Whether a failure is part of an outage, or of two identical failures on different items, is
    known only when the next run in the same cycle fails. The breaker decides and posts during
    the failing run, so an item with two genuine failures behind it can be set down by the first
    failure of an outage. It comes back when answered. *Rejected:* holding the decision until the
    next run, which a crash between the two runs loses, since it was never written to the log.
11. **A failure that #101 records as a condition never counts toward the breaker** (Adam,
    2026-10-17). Such a failure is one whose run records a *cure key*, #101's name for a fault in
    the Igor's own setup, such as a seat whose token is unset. #101's `condition-backoff` says an
    item SHALL NOT be suppressed for such a fault. This holds for an item alone in its cycle too,
    which decision 7 otherwise lets count a failure every item would meet.
12. **The discovery watermark does not advance past the items a cycle never reached because a
    two-in-a-row rule ended it** (Adam, 2026-10-17): the surface-failure rule, as well as the
    identical-failure rule. The watermark is the point past which discovery treats items as seen.
    #101's watermark requirement already keeps the watermark below an item left untaken for three
    reasons: the budget ran out, a condition stopped the cycle, or the claim got no answer. Task
    5.0 adds the two rules to those reasons, with a scenario for each.
13. **Aligned to `concurrent-instances`** (Adam, 2026-10-18;
    [#179](https://github.com/adamstallard/igor/pull/179)). Where a role runs as several ranks,
    only the rank holding the item's claim counts a failure before the worker, and #179's *Only
    the rank holding a claim gives it back* has that rank post the set-down while any other rank
    drops out silently. How this applies in the claim window is open question 1. The mask on
    the tree's path keeps working under #179's naming of trees by role and rank.
    Decision 12's reasons for holding the watermark back go, by task 5.0, into #101's watermark
    rule, *Watermarks reduce reconsideration without governing it*: #179 cites that rule, so it is
    the one place every reason lives. *Rejected:* a count per rank, and a set-down any rank could
    post.
14. **This change's code waits for #101** (Adam, 2026-10-18). Sections 2 to 4 of `tasks.md` are
    built only after `condition-backoff` (#101) merges. #101's watermark rule is what holds the
    mark below the items a cycle never reached (decision 12), so without it a cycle ended early by
    a two-in-a-row rule would let the watermark pass them. The breaker also reads #101's
    `workerless` mark and cure keys, and relies on #101's rule that readers skip rows carrying a
    `kind`. *Rejected:* building them first and accepting that loss until then.
15. **The state branch never gets a failure's text** (Adam, 2026-10-18). A `pre-worker` row
    holds the failure's source, which surface's call threw, as the error class Adam asked for in
    place of its text, and a hash of its masked message, the first twelve hexadecimal digits of
    its SHA-256. Two failures are identical when their sources and hashes match. The raw and
    masked messages go only to the process's own log, the server's journal under systemd, as one
    line of JSON with the item, role, source and hash, so a person can find a row's text by its
    hash. *Rejected:* the masked message as text in the row, and the raw message beside it. The
    state branch may be public, and a tracker's error can carry the response text of a private
    repository.
16. **A count that cannot be read sets nothing down** (proposed: this decision and the next
    three are the change's own, which Adam has not yet approved). Where the log cannot be read,
    the run is refused. It still tries to write its `pre-worker` row, since an append can
    succeed where a read failed; a write that fails is lost, as any state write's failure is.
    *Rejected:* setting the item down on an unknown count, which would defer items whenever the
    state branch could not be read.
17. **A failed token mint inside a clone is a `tree` failure** (proposed). The tag follows the
    interface the loop called, so an expired clone token is caught by the identical-failure
    rule, not the outage rule (`design.md`). *Rejected:* tagging it `code-host`, which would let
    a broken clone token end cycles as an outage of the code host.
18. **An `outage` row excludes failures by role, rank and cycle** (proposed), not by where the
    failures' rows sit in the log, since `serve` does not wait for a run's row to land.
    *Rejected:* excluding the rows written before the outage row.
19. **An `outage` row that never lands gets no retry of its own** (proposed). That cycle's
    failures then count, at the cost of a set-down that an answer lifts.

**Still open:**

- **The masks are unmeasured.** Nobody has checked that real repeated failures give one masked
  message, the *signature* `design.md` defines (task 0.1). If they never match, the
  breaker never trips, and every failure is retried as in the in-force code.
- **A refused App credential inside a clone is unmeasured** (task 0.1). The tree provider mints
  its clone token from the App's credential. Whether a refusal there reaches #101's App
  condition, and so records a cure key, or is tagged `tree` and counted per item, is not known.
- **The set-down sentence names what lifts a deferral.** #141, which lets only someone with
  write access lift a deferral, changes that sentence if it lands first (task 3.2).

**Open questions for Adam**, each with a recommendation; none is decided:

1. **A failure in the claim window, where a role runs several ranks.** #179's *Only the rank
   holding a claim gives it back* says a process whose claim message failed to post holds
   nothing, and one whose verification (the re-read after posting that shows whose claim message
   holds the item) fails counts as not holding it. Every claim-window failure is one of those
   two, so where a role runs several ranks, decision 13 lets no claim-window failure count. A
   role served by one rank is not affected: the holder rule applies only to several ranks, and
   the scenario *A repeated failure in the claim window sets the item down* is written for one.
   Tasks 3.3 and 3.4 build the one-rank case and wait on this answer for several.
   *Recommendation:* count a claim-window failure, and post the set-down, only where, at the
   moment of the failure, the item carries no claim message of another rank of the role among
   the messages #179 counts. A rank alone on the item then sets it down, and a rank that may
   have lost to a sibling counts nothing, and, as #179 requires of a rank that does not hold
   the item, leaves the role's label on it. Under #179 `igor run` runs as
   rank 1 and refuses to start beside a serving rank 1, so it can share an item only with ranks
   2 and up.
2. **The withdrawal posted where no claim message landed.** As drafted, on the third identical
   failure in the claim window, the withdrawal carrying the set-down sentence is posted even
   where the claim message never landed (`design.md`, *Where the set-down is said*; task 3.3).
   *Recommendation:* keep it. It is the only word the item gets about being set down, and if the
   tracker is still failing the post fails too, at no cost. Under recommendation 1 it is posted
   only where no sibling's claim counts.
3. **Which faults #101's no-suppression rule covers.** #101's `work-triage` rule says "where the
   cause was a fact about the Igor — a seat whose token is unset, a command its allowlist
   refuses, a capacity never observed — the item SHALL NOT be suppressed". Decision 11 reads
   that as covering faults that record a cure key. Read literally, it also covers a fault with
   no cure key, such as a full disk, which this change counts toward the breaker.
   *Recommendation:* keep decision 11's reading, and have #101's rule say "a fault that records
   a cure key". A full disk then still sets items down, but only an item alone in its cycle,
   once per cycle: two items failing alike end the cycle uncounted.
4. **The count is per role and item**, so with several roles each may post three times before
   setting an item down.
   *Recommendation:* keep it. Each role is a separate Igor with its own label and its own
   deferral, and a fault in one role's setup says nothing about another's.
5. **A hash of a guessable message can be confirmed.** Decision 15's hash is unkeyed, so anyone
   reading a public state branch who can guess a failure's masked message, such as "repository
   not found" with a private repository's name in it, can hash the guess and confirm it.
   *Recommendation:* key the hash with a secret only the server holds (HMAC-SHA-256 under a key
   in the role's environment file), so a guess cannot be checked offline. Changing the key
   restarts every count, which costs at most three more failures per item.
6. **A returned failure before the worker is retried twice before it defers.** In the in-force
   code, a failure `execute` returns before the worker, such as a catch-up whose merge fails, is
   handed off as a `failure` and deferred at once. This change counts it like a thrown failure:
   refused on the first two, set down on the third.
   *Recommendation:* keep it. One rule for every failure before the worker is simpler to read
   off an item's history, and two extra retries of a cheap step cost little. The alternative is
   to keep deferring returned failures at once and count only thrown ones.

**Conflict with what is in force, recorded and not resolved:** decision 15 keeps a failure's
text out of this change's rows, but the in-force run row in `executions.ndjson` carries the
run's `reason`, and the transcript and the refusal envelope (the provider's response, kept when
it refuses a run for a spent usage window) beside it carry the worker's text, all on the same
state branch. Two kinds of failure before the worker keep that run row: one that records a cure
key (decision 11), and one that `execute` returns, whose row stays beside its `pre-worker` row
(`design.md`, *Counting*). A returned catch-up merge failure's `reason` quotes git's error. So
their text still reaches the branch. Whether decision 15 reaches those records is for Adam;
this change does not touch them.

## Why

When a claimed run fails **before the worker starts**, the item is refused and tried again next
cycle ([#155](https://github.com/adamstallard/igor/issues/155)). Examples are a clone that fails,
a branch that cannot be set up, a full disk, or a tracker call during the claim. Retrying such a
failure is cheap, so a thrown one defers nothing. (A failure `execute` returns before the worker
is deferred at once; open question 6.)

A deterministic failure therefore repeats forever. Every poll claims the item (its `igor:<role>`
label and a claim comment), fails, posts a handoff ending "It will try again next cycle", and
releases. Nothing remembers that the item failed the same way last cycle.

There is a second effect. Every throw out of a claimed run is marked as a surface failure, and
`serve` ends the cycle on the second in a row. A clone failure on one item is not the tracker
failing, but it counts as if it were. If that item sorts first, a real outage then ends the
cycle one item early.

## What Changes

**A breaker per item (Adam, 2026-10-11).** The Igor counts an item's failures before the worker,
in a row. On the third identical one it hands the item back deferred instead of refusing it, and
the message it posts on that run says it has stopped retrying and what brings the item back. The
first two failures are refused and retried.

- **The count is rebuilt from the execution log.** It is not kept in a store of its own, so it
  survives a restart. Each failure before the worker appends one row to `executions.ndjson`,
  the same log [#101](https://github.com/adamstallard/igor/pull/101)'s conditions are rebuilt
  from (`design.md`).
- **Identical means the same source and the same message.** The source is the tracker, the code
  host, the working tree or the Igor's own code. The message is compared with its variable parts
  masked: numbers, hexadecimal identifiers and the working tree's path.
- **In a row means nothing broke the sequence.** A run of the item that reached the worker, or a
  failure before the worker that was not identical, starts the count again. An edit or a reply
  does not. So once a deferral lifts, an identical failure sets the item down again at once.
- **An outage is not the item's failure.** A failure in a cycle that the outage rule then ended
  does not count toward any item's breaker. The breaker decides during the failing run, before
  the cycle's end is known, so a set-down can be posted for a failure that a later run excludes.
- **A fault in the Igor's own setup is not the item's failure.** A failure whose run records one
  of #101's cure keys never counts toward the breaker. It keeps its ordinary run row (the log's
  row for a run, which carries no `kind`), because #101 builds its conditions from run rows that
  carry a cure key, never from a `pre-worker` row.
- **The deferral lifts as any handed-back item's does.** That rule is `work-triage`'s *An item
  handed back is not re-worked until something answers*. The breaker adds no rule of its own,
  so [#141](https://github.com/adamstallard/igor/pull/141)'s "only a writer lifts a deferral"
  applies here once it lands.

**Only a tracker or code-host failure is a surface failure (Adam, 2026-10-11).** The cycle's
two-in-a-row rule counts a run only where a call to the tracker or the code host failed. A
failure in the working tree or in the Igor's own code does not count. Which call failed is known
from which surface's call threw, not read from the error's wording.

**A failure every item meets ends the cycle (Adam, 2026-10-11).** When two runs in a row, of
different items, fail before the worker identically, as a full disk or an expired clone token
makes them, the cycle ends and neither failure counts toward its item's breaker. An item alone in
its cycle counts such a failure once. Without this, every item would be claimed and posted on
three times and then set down, and stay down after the cause was fixed.

Out of scope:

- **Catch-ups the code host settles on its own.** They take no claim and post nothing, so there
  is nothing to repeat. A catch-up that escalates into a claimed run is covered like any other.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-claiming`: a failure before the worker that repeats three times sets the item down, two
  identical ones on different items in a row end the cycle, and only a tracker or code-host
  failure counts as the surface failing. Modifying the in-force *A claim that cannot be kept is
  given back, out loud* would mean restating its whole text, so all three are added as
  requirements of their own.

## Impact

- `src/loop.ts`: `runItem` attributes a throw to the surface whose call threw, builds the
  failure's signature, asks how many identical failures precede it, and hands the item back on
  the third. Its claim-window path does the same for a refused claim.
- `src/claiming.ts`: on the third failure, the claim withdrawal (`claimWithdrawn`, or
  `claimStuck` where the release did not clear the label) carries the set-down sentence.
- `src/execute.ts`: a failure it returns carries the source of the step that failed.
- `src/handoff.ts`: a `set-down` tail for a failure handoff.
- A cycle-rule function that `src/serve.ts` and `src/cli.ts` both call: it ends a cycle on two
  surface failures in a row, and on two identical failures before the worker on different items
  in a row.
- `src/serve.ts`, `src/cli.ts`: each appends an outage row whenever that function ends its cycle.
  The row names every item that failed before the worker in the cycle when two surface
  failures ended it, and only the two items when two identical failures did. `igor run`'s
  single cycle in `src/cli.ts` gains the surface rule, which in the in-force code only `serve`
  applies.
- `src/wiring.ts`, `src/cli.ts`: write a row for each failure before the worker, and supply the
  count reader.
- Readers of `executions.ndjson`: #101's `stuck-conditions` requires every reader that counts
  runs to skip rows carrying a `kind`, and its task 2.3 makes the readers do so. The two kinds
  added here rely on that rule.
- `src/deferred.ts`: no change. The breaker defers through the existing handoff path.
