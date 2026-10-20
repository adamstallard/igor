## Decisions

1. **A breaker per item** (Adam, 2026-10-11). A thrown failure before the worker is refused: the
   claim is given back and the item is tried again next cycle. On the third identical failure in
   a row, the item is instead handed back deferred, or *set down*, and that run's message says
   the Igor has stopped retrying and what brings the item back. *Rejected:* a configurable
   threshold. Three is a constant: one trips on a blip, two can be coincidence. This differs from
   #101, which makes its own threshold configurable, with a default of three; the breaker keeps
   three fixed.
2. **The count is rebuilt from `executions.ndjson`**, one `kind: "pre-worker"` row per failure
   before the worker. A failure that records a *cure key*, the key #101 records for a fault in
   the Igor's own setup naming what would cure it, writes its run row too, and its `pre-worker`
   row says it recorded one, so the count skips it (decision 11).
   *Rejected:* a count in memory, which a restart loses; and a store of its own, which two Igors
   can overwrite and which can disagree with the log (`design.md`).
3. **Identical means the same source and the same masked message.** The source is which surface's
   call threw. The masks keep runs of three digits or fewer, which hold HTTP statuses and exit
   codes, and replace ids, timestamps, paths and longer digit runs (Adam, 2026-10-20). So
   `HTTP 404` and `HTTP 500` from the same call differ; his accepted risk of 2026-10-11, that
   they counted as identical, is withdrawn. *Rejected:* the source alone, and the raw message,
   which names the working tree's path, a path that differs between ranks and between runs.
4. **Only a tracker or code host that did not answer counts toward the surface-failure rule**,
   which ends a cycle on two such failures in a row and which the spec calls the *outage rule*
   (Adam, 2026-10-11). Which surface failed is known from which surface's call threw. Whether it
   answered is read from the response's status, as #101's `passesMark` reads it (Adam,
   2026-10-20): a refused call, such as a 403 for a missing permission, is not an outage, and
   counts toward its item's breaker like any other failure before the worker. *Rejected:*
   reading the surface from the error's wording; and counting every tracker or code-host
   failure, which would end a cycle on two refusals and conflict with the in-force rule that a
   surface not answering "SHALL be distinguishable from a refusal about the item itself".
5. **Two identical failures before the worker, on different items in a row, end the cycle**
   (Adam, 2026-10-11), and neither counts toward its item's breaker.
6. **After a deferral lifts, one identical failure sets the item down again** (Adam,
   2026-10-11), not three. The answer that lifted it did not cure the failure.
7. **An item alone in its cycle counts a failure every item would meet, once per cycle** (Adam,
   2026-10-11). With one run, nothing tells the item's failure from the environment's.
8. **A set-down lifts only on a person's change to the item, or on another role's successful
   run on it**, such as a pull request it opened (Adam, 2026-10-20, replacing the earlier
   decision that it lifts by `work-triage`'s rule for any handed-back item). An Igor's other
   posts, such as another role's set-down or comment, lift nothing. Without this, two roles that
   meet one failure lift each other's set-downs, and each claims and posts every cycle with no
   bound.
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
14. **This change's code waits for #101 and #213** (Adam, 2026-10-18 for #101, 2026-10-20 for
    #213). #213's redaction function is built first, as its own pull request (#217), and this
    change's code calls it. Sections 2 to 4 of `tasks.md` are
    built only after `condition-backoff` (#101) merges. #101's watermark rule is what holds the
    mark below the items a cycle never reached (decision 12), so without it a cycle ended early by
    a two-in-a-row rule would let the watermark pass them. The breaker also reads two things #101
    adds: the `workerless` mark on a run row whose run started no worker, and cure keys. And it
    relies on #101's rule that readers counting runs skip rows carrying a `kind`, so that no
    reader takes a `pre-worker` or `outage` row for a run. *Rejected:* building them first and accepting that loss until then.
15. **A row on the state branch holds structured fields and no message text** (Adam, 2026-10-20,
    replacing his decision of 2026-10-19 that it holds the masked message as readable text). A
    `pre-worker` row holds:
    - the item, the role, the rank, and whether the rank held the claim;
    - the cycle and the time;
    - the row's kind;
    - where it failed: `tracker`, `code-host`, `tree` or `igor`;
    - the HTTP status or exit code;
    - whether the run recorded a cure key;
    - an unkeyed fingerprint of the masked message, for matching repeats.

    Each failure an `outage` row names carries the same fields, so its status and exit codes are
    readable as #99 (`structured-failure-record`) asks. The full message, after #213's credential
    redaction, goes to the Igor process's own log on its server. *Rejected:* the masked message as
    readable text, which can carry a private repository's text onto a branch that may be public;
    and the raw message, which names the working tree's path (decision 3).
16. **A count that cannot be read sets nothing down** (Adam approved decisions 16 to 21 on
    2026-10-19). Where the log cannot be read, or any of its day files fails to read, the run is
    refused. It still tries to write its `pre-worker` row, since an append can
    succeed where a read failed; a write that fails is lost, as any state write's failure is.
    *Rejected:* setting the item down on an unknown count, which would defer items whenever the
    state branch could not be read.
17. **A failed token mint inside a clone is a `tree` failure.** The tag follows the interface the
    loop called, so an expired clone token is caught by the identical-failure rule, not the outage
    rule (`design.md`). A clone that fails because the code host did not answer is a `code-host`
    failure, and counts toward the outage rule (Adam, 2026-10-20). *Rejected:* tagging a failed
    mint `code-host`, which would let a broken clone token end cycles as an outage of the code
    host.
18. **An `outage` row excludes failures by role, rank and cycle**, not by where the
    failures' rows sit in the log, since `serve` does not wait for a run's row to land.
    *Rejected:* excluding the rows written before the outage row.
19. **A row that lands late or never gets no retry or wait of its own**, beyond the retry #179
    gives every state write. The count reads only rows that have landed, so a late or lost row
    can set an item down early: a worker start's row or a different failure's row that has not
    landed fails to break the sequence, and an `outage` row that has not landed fails to exclude
    its pair. Adam accepted this as a known limit on 2026-10-20, widening it from a lost `outage`
    row to any late or lost row; the cost is an early set-down, which a person's change lifts.
    `model/findings/LateRows.cfg` shows it. *Rejected:* a run waiting for its rows to land before
    it gives the claim back.
20. **An `outage` row written for two identical failures names only those two items**, not
    every failure in the cycle. The rule matched only that pair, so nothing
    shows another failure in the cycle to be the environment's. *Rejected:* naming every item
    that failed before the worker in the cycle, as the surface rule's row does.
21. **A run row written before #101 starts marking rows `workerless` stops the count**, as a run
    that started the worker does, since nothing tells the two apart. That errs toward fewer
    set-downs. *Rejected:* skipping such rows, which could join failures from either side of a
    run that worked.

Decisions 22 to 27 are Adam's answers of 2026-10-19 to the change's open questions, and 28 to 32
his answers of 2026-10-20:

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
    Where the read of the item's claim messages fails, the rank counts nothing, posts nothing
    and leaves the label (Adam, 2026-10-20).
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
27. **One credential redaction applies to everything Igor writes to the state branch** (Adam,
    2026-10-19 and 2026-10-20; [#213](https://github.com/adamstallard/igor/issues/213)). It is
    #188's *credential redaction* rule, which strips GitHub's and Anthropic's token prefixes and
    known secrets by their exact value, extended with the `user:pass@` part of a URL. #213 builds
    it first, in its own pull request, #217, whose OpenSpec change `redact-state-branch` states
    it as `task-execution`'s *Credential redaction replaces every credential the Igor knows*, and
    applies it to every write to the state branch: the run row's `reason`, the transcript, the
    refusal envelope and `deferred.json`. This change cites that requirement. Its own rows hold no
    message text (decision 15), so it applies the redaction to the message it writes to the
    process's log.
28. **A run posts no set-down on an item already deferred** (Adam, 2026-10-20). Two ranks can
    both read an item as free; one sets it down and releases it, and the other's claim message
    lands on the released item, holds it and fails the same way. That run gives the claim back
    without a second set-down. `SetDownOnce` in the model.
29. **The claim-window withdrawal releases only claim messages posted before the rank's test**
    (Adam, 2026-10-20). Decision 22's test and the withdrawal are two tracker calls, and a
    sibling whose claim lands and verifies between them must still hold the item after the
    withdrawal. How a release leaves that message counting is #179's to decide, since #179 orders
    claim messages against a release; the model assumes it as `AtomicWithdraw`.
30. **A run that records a cure key takes no part in either two-in-a-row rule** (Adam,
    2026-10-20). It is never one of the two runs that end a cycle, and it does not separate two
    runs that are. #101's condition already handles that fault.
31. **The set-down post names the kind of failure in plain words, and quotes none of the error**
    (Adam, 2026-10-20, replacing his earlier answer that the post is redacted). It says where the
    run failed and gives its HTTP status or exit code.
32. **The set-down sentence, and the effect of a rank that drops out** (Adam, 2026-10-20,
    approved with the change as written). The sentence is task 3.2's. A rank that drops out
    because another holds the item counts as neither a failure nor a success for either
    two-in-a-row rule.

**Still open:**

- **The masks are unmeasured.** Nobody has checked that real repeated failures give one
  signature, the masked message `design.md` defines (task 0.1). If they never match, the breaker
  never trips, and every failure is retried as in the in-force code.
- **A refused App credential inside a clone is unmeasured** (task 0.1). The tree provider mints
  its clone token from the App's credential. Whether a refusal there reaches #101's App
  condition, and so records a cure key, or is tagged `tree` and counted per item, is not known.
- **How a clone tells that the code host did not answer is unmeasured** (task 0.1). git exits 128
  for most failures, so the tree provider may need git's own report of the HTTP exchange.
- **`igor run --claim`, for Adam.** It runs one item outside any cycle, so its `pre-worker` row
  has no `cycle` for an `outage` row to match, and whether it counts as an item alone in its cycle
  is undecided. *Recommended:* it counts as an item alone in a cycle of its own, whose start is
  the run's start.
- **The first two failures' posts, for Adam.** Decision 31 covers the set-down post. The refusals
  before it, "It will try again next cycle", post the raw error message on the item as every
  failure handoff in the in-force code does, and the item may be public. *Recommended:* they name
  the failure in plain words too.
- **Identical refusals end the cycle, for Adam.** Under decision 4 a refusal is not an outage, but
  two identical refusals on different items, such as a 403 on adding the claim label to every
  item, end the cycle under the identical-failure rule. Decision 12 then holds the watermark
  below every item the cycle never reached, so discovery considers them again each cycle, the
  cost #101 avoids for a refused claim. It also contradicts the in-force `work-claiming` scenario
  *A refusal about the item does not stop the cycle*, which #179 keeps. Where #101 records a cure
  key for that refusal, decision 30 takes it out of the rule and the cost goes. *Recommended:*
  a refusal takes no part in the identical-failure rule either, so the in-force scenario holds.
- **A failed read of the claim messages leaves the claim in silence, for Adam.** Decision 22 has
  the rank count nothing, post nothing and leave the label. The in-force *A claim that cannot be
  kept is given back, out loud* says a run "SHALL NOT end such a run holding the claim in
  silence", and #179 allows silence only to a rank whose claim message does not hold the item.
  Decision 22's rule applies to a lone process too. *Recommended:* a rank whose read fails posts nothing
  only where the role runs several ranks; a process alone in its role withdraws, as before.
- **#99's record and no message text, for Adam.** Decision 15 keeps message text off the state
  branch, and its `outage` row is offered as the record #99 (`structured-failure-record`) asks a
  cycle to keep. #99 asks that record to hold "no less than printing the caught fault to a
  console would have", which the process's log holds and the row does not. *Recommended:* #99's
  record for a breaker row is the row's fields together with the process's log entry; #99 is told
  so.
- **The set-down sentence names what lifts a deferral.** #141, which lets only someone with
  write access lift a deferral, changes that sentence if it lands first (task 3.2).
- **Findings of the 2026-10-20 consistency read, for this change's next revision,** none fixed
  yet:
  - The in-force *A claim that cannot be kept is given back, out loud* says the run "cannot tell
    the two causes apart" and that two runs in a row whose surface did not answer stop the cycle.
    The new rules tell a surface's failure from the call, and decision 30 has two such runs that
    record a cure key not stop it. The in-force text needs a `MODIFIED` block, which #179 also
    restates whole.
  - *What lifts a set-down* narrows `work-triage`'s *An item handed back is not re-worked until
    something answers* for set-downs, with no `work-triage` delta. #101 and #141 each carry a
    `MODIFIED` copy of that requirement, so a delta here has to follow theirs in the archive order issue #204 sets.
  - The meaning of *no answer* is restated from #101's `design.md`; #101's spec does not state it.
  - How a role tells another role's successful run from its other posts is undecided (task 3.7).
  - The in-force `graceful-handoff` conflict below is not a numbered decision.

**Reported to other changes:**

- **#101 (`condition-backoff`)**, under review: its rule that an item is never suppressed for a
  fact about the Igor should say it covers "a fault that records a cure key" (decision 24). As
  written it says "where the cause was a fact about the Igor — a seat whose token is unset, a
  command its allowlist refuses, a capacity never observed — the item SHALL NOT be suppressed",
  which reads as covering a full disk too. This change does not edit #101.
- **#179 (`concurrent-instances`)**:
  - Its *Only the rank holding a claim gives it back* says "a process whose verification fails
    cannot tell whether it holds the item, so it counts as not holding it", and such a process
    drops out silently, leaving the label. Decision 22 has a rank alone on the item post the
    set-down withdrawal, which removes the label, even where the failure was in its
    verification. #179's rule should allow that case, as it already lets a process whose claim
    message failed to post remove its label where no other claim counts. Its TLA+ model assumes
    the opposite ("a verification read that errors ... removes nothing").
  - Its *Still open* still lists, as an open question of this change, whether claim-window
    failures count, which decision 22 has answered.
  - Decision 29: a withdrawal releases only the claim messages posted before the rank's test.
    #179 decides how, for this change's withdrawal and for its own rule for a claim message that
    failed to post, which makes the same two calls.
- **#99 (`structured-failure-record`)**: an `outage` row's failures carry their source, HTTP
  status and exit code as fields apart from any message (decision 15), which is what #99 asks of
  a cycle's record of its faults.
- **#141 (`closed-pr-defers`)**: under decision 8 a set-down lifts only on a person's change or
  another role's successful run. If #141 lands, the person's change counts only from someone with
  write access.

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
  masked: ids, timestamps, paths, hexadecimal identifiers and long digit runs. HTTP statuses and
  exit codes stay. The row on the state branch holds a fingerprint of the masked message, never
  its text.
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
- **A set-down lifts on a person's change to the item, or on another role's successful run on
  it.** An Igor's other posts lift nothing, so two roles cannot keep lifting each other's
  set-downs. [#141](https://github.com/adamstallard/igor/pull/141)'s "only a writer lifts a
  deferral" applies to the person's change once it lands.

**Only a tracker or code host that did not answer is a surface failure (Adam, 2026-10-11 and
2026-10-20).** The cycle's two-in-a-row rule counts a run only where a call to the tracker or the
code host got no answer, including a clone the code host did not answer. A refusal, a failure in
the working tree, or one in the Igor's own code does not count. Which call failed is known
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
- `src/deferred.ts`: a deferral record says whether it is a set-down, and the check that decides
  whether a deferral has lifted applies decision 8's rule to one that is.
- The Igor process's own log: the full message of each failure before the worker, after #213's
  redaction.
