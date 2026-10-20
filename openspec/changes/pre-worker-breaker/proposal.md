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
3. **Identical means the same source and the same masked message.** The source is which surface's call threw. *Rejected:* the source
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
    drops out silently. Decision 22 says how this applies in the claim window. The mask on
    the tree's path keeps working under #179's naming of trees by role and rank.
    `igor run <role>` runs as rank 0 (Adam, 2026-10-18): a rank no roster declares. It starts
    without waiting for any serving rank, runs beside them, and contends for items as any rank
    does, its claim messages carrying `Igor-Rank: 0`. So a run by hand is one of the role's ranks while it runs.
    It counts a failure and sets an item down only where it holds the claim, its rows carry
    rank 0, and its failures count toward the role's count for the item like any rank's.
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
15. **A failure's row holds its masked message, readable, after the shared redaction** (Adam,
    2026-10-19, replacing his decision of 2026-10-18 to record only a hash). A `pre-worker` row
    holds the failure's source, which surface's call threw, and its masked message as text. Two
    failures are identical when their sources and masked messages match. Before the masks run,
    the message passes through the redaction function that
    [#213](https://github.com/adamstallard/igor/issues/213) decides Igor applies to every write
    to the state branch, which strips token-shaped strings and credentials in URLs (decision 27).
    Redacting first keeps the masks from breaking up a token's shape before the redaction can
    match it. The masks stay, because they are what make repeats compare equal: they replace the
    timestamps, process ids, tree ids and temporary paths that differ between two runs of one
    failure. *Rejected:* a hash of the masked message in place of its text, keyed or not. Other
    records on the state branch already carry failure text (decision 27), so hiding only this
    change's text protected little, and it cost a record a person can read. *Rejected:* the raw
    message, which names the working tree's path (decision 3).
16. **A count that cannot be read sets nothing down** (proposed: this decision and the next
    five are the change's own, which Adam has not yet approved). Where the log cannot be read,
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
19. **An `outage` row that never lands gets no retry of its own** (proposed), beyond the one
    #179 gives every state write. That cycle's
    failures then count, at the cost of a set-down that an answer lifts.
20. **An `outage` row written for two identical failures names only those two items**
    (proposed), not every failure in the cycle. The rule matched only that pair, so nothing
    shows another failure in the cycle to be the environment's. *Rejected:* naming every item
    that failed before the worker in the cycle, as the surface rule's row does.
21. **A run row written before #101 starts marking rows `workerless` stops the count** (proposed), as a run
    that started the worker does, since nothing tells the two apart. That errs toward fewer
    set-downs. *Rejected:* skipping such rows, which could join failures from either side of a
    run that worked.

Adam answered the change's seven open questions on 2026-10-19, approving each one's
recommendation except the one to key the hash, which decision 15 now replaces. Decisions 22 to
27 are those answers. Decisions 16 to 21 were not among the questions, and still wait for his
approval:

22. **A failure in the claim window counts only where no other rank's claim is on the item**
    (Adam, 2026-10-19). Where a role may run several ranks, a claim-window failure counts, and
    the set-down is posted, only where at that moment the item carries no claim message of
    another rank of the role that counts under #179's rules. A rank alone on the item then
    sets it down. A rank that may have lost to a sibling counts nothing and, as #179 requires of
    a rank that does not hold the item, leaves the role's label on it. #179 says a process whose
    claim failed in the window holds nothing, so without this test no claim-window failure
    would count wherever several ranks run. The test reads the item, not the roster, because an
    `igor run` joins any role as rank 0 (decision 13), so the roster cannot say whether one
    process or several are running. It misses two `igor run`s of one role at once: both run as
    rank 0, so each reads the other's claim message as its own rank's, sees itself alone, and
    may count and set the item down. Both work the item then too, a gap #179 lists for Adam;
    if #179 answers it with a run id in the claim message, this test compares that id too.
23. **A withdrawal is posted on the third identical failure in the claim window even where the
    claim message never landed** (Adam, 2026-10-19). It is the only word the item gets about
    being set down. If the tracker is still failing, the post fails too, at no cost. Under
    decision 22 it is posted only where no sibling's claim counts.
24. **#101's rule that an item is never suppressed for a fault in the Igor covers faults that
    record a cure key** (Adam, 2026-10-19). #101's `work-triage` rule says "where the cause was a
    fact about the Igor — a seat whose token is unset, a command its allowlist refuses, a
    capacity never observed — the item SHALL NOT be suppressed". Decision 11 reads that as
    faults that record a cure key. Others, such as a full disk, count toward the breaker. A full
    disk then sets down only an item alone in its cycle, once per cycle: two items failing alike
    end the cycle uncounted (decision 5). #101's text is to say so; see *Reported to other
    changes*.
25. **The count is per role and item** (Adam, 2026-10-19), so with several roles each may post
    three times before setting an item down. Each role is a separate Igor with its own label
    and its own deferral, and a fault in one role's setup says nothing about another's.
26. **A failure `execute` returns before the worker is retried twice and set down on the
    third** (Adam, 2026-10-19), like every other failure before the worker. In the in-force
    code such a failure, for example a catch-up whose merge fails, is handed off as a `failure`
    and deferred at once. One rule for every failure before the worker is simpler to read off
    an item's history, and two extra retries of a cheap step cost little. *Rejected:* deferring
    returned failures at once and counting only thrown ones.
27. **One shared redaction applies to everything Igor writes to the state branch** (Adam,
    2026-10-19; [#213](https://github.com/adamstallard/igor/issues/213)). The state branch is as
    visible as its repository, and failure text reaches it through records this change does not
    otherwise touch: the in-force run row's `reason` in `executions.ndjson`, the transcript and
    the refusal envelope beside it (the response Igor keeps when the provider refuses a run for
    a spent usage window), and `deferred.json`, where `noteHandoff` stores a handoff's `reason`.
    A failure that records a cure key (decision 11) and one that `execute` returns (decision 26)
    keep their ordinary run row, so their text reaches the branch that way, and a set-down's
    text reaches `deferred.json`. #213 records the decision and is the work of building the function,
    which does not exist yet; this change's `pre-worker` and `outage` rows are to pass through
    it. An `outage` row carries the source
    and the masked, redacted message of each failure it names, so it meets #99's
    (`structured-failure-record`) rule that a cycle's record of its own faults carry the fault's
    identity and origin, with no exception for rows carrying a `kind`; but see *Still open* on
    the status codes the masks remove.

**Still open:**

- **The masks are unmeasured.** Nobody has checked that real repeated failures give one masked
  message, the *signature* `design.md` defines (task 0.1). If they never match, the
  breaker never trips, and every failure is retried as in the in-force code.
- **A refused App credential inside a clone is unmeasured** (task 0.1). The tree provider mints
  its clone token from the App's credential. Whether a refusal there reaches #101's App
  condition, and so records a cure key, or is tagged `tree` and counted per item, is not known.
- **#213's redaction function is not built.** Tasks 3.1, 4.1 and 4.2 call it. Whether this
  change's code waits for #213, as it waits for #101 (decision 14), or builds the function
  itself, as #213 describes it, is for Adam. Nothing says what a row holds if this change's
  code lands first; without a fallback, such as writing only `source` until the function
  exists, its rows would carry unredacted text.
- **Two redaction rules.** #188 (`keep-action-log`) already decides that its *Credential
  redaction* is "one rule, applied wherever this or another change says text is redacted"
  (Adam, 2026-10-13), redacting seat tokens by their exact value and the values of
  secret-named environment variables. #213 strips token-shaped strings and credentials in URLs.
  Whether #213 adopts #188's rule, adds its patterns to it, or stands beside it is for Adam;
  with two rules, a seat token in a clone error would be stripped by #188's and not by #213's.
- **The masks remove status codes that #99 asks for.** Mask 3 turns every digit run into `#`,
  so an `outage` row's message loses a response status or exit status. #99 asks that such an
  identity be "separately readable from the sentence a person reads". Whether the `failures`
  entries gain a field holding it, unmasked, is for Adam.
- **A claim-window read that fails.** Under decision 22 a rank reads the item's claim messages
  before it counts a claim-window failure. Where the tracker is not answering, that read
  probably fails too. Whether the rank then counts, counts nothing, or leaves the label is for
  Adam; the spec says nothing yet.
- **A code-host outage seen through clones.** A clone's failure is tagged `tree` (decision 17),
  so it never counts toward the outage rule. Where a code-host outage fails each clone with a
  different masked message, neither rule ends the cycle, and each item counts one failure per
  cycle. Whether that needs a rule is for Adam.
- **Private text in a readable message.** The redaction strips credentials, not content. A
  tracker's error quoting a private repository's or a Linear workspace's text would reach the
  state branch, which may be public. Adam chose a readable record knowing other records already
  carry such text (decision 15). Whether the redaction should strip more is for Adam, beside
  #213's open question on the transcript.
- **The set-down sentence names what lifts a deferral.** #141, which lets only someone with
  write access lift a deferral, changes that sentence if it lands first (task 3.2).

**Reported to other changes:**

- **#101 (`condition-backoff`)**, under review: its rule that an item is never suppressed for a
  fact about the Igor should say it covers "a fault that records a cure key" (decision 24). As
  written it says "where the cause was a fact about the Igor — a seat whose token is unset, a
  command its allowlist refuses, a capacity never observed — the item SHALL NOT be suppressed",
  which reads as covering a full disk too. This change does not edit #101.
- **#179 (`concurrent-instances`)**: its *Only the rank holding a claim gives it back* says "a
  process whose verification fails cannot tell whether it holds the item, so it counts as not
  holding it", and such a process drops out silently, leaving the label. Decision 22 has a rank
  alone on the item post the set-down withdrawal, which removes the label, even where the
  failure was in its verification, the re-read after posting that shows whose claim message
  holds the item. #179's rule should allow that case, as it already lets a
  process whose claim message failed to post remove its label where no other claim counts.

**Conflict with what is in force, recorded and not resolved:** the in-force `graceful-handoff`
scenario that makes budget the only reason to defer already disagrees with the in-force code,
which defers failures; a set-down is one more such deferral.

## Why

When a claimed run fails **before the worker starts**, the item is refused and tried again next
cycle ([#155](https://github.com/adamstallard/igor/issues/155)). Examples are a clone that fails,
a catch-up whose merge fails, a full disk, or a tracker call during the claim. Retrying such a
failure is cheap, so a thrown one defers nothing. (A failure `execute` returns before the worker
is deferred at once, which decision 26 changes.)

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
  failure before the worker that counts and was not identical, starts the count again. An edit or a reply
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
