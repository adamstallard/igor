Builds on: one-process-per-role (adamstallard/igor#242)
Builds on: redact-state-branch (adamstallard/igor#217)
Builds on: read-seat-windows-from-the-stream (adamstallard/igor#143)

## Decisions

1. **A breaker per item**. A thrown failure before the worker is refused: the
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
   codes, and replace item references, repository names, timestamps, temporary paths,
   hexadecimal identifiers and longer digit runs. So
   `HTTP 404` and `HTTP 500` from the same call differ. *Rejected:* the source alone, and the raw message,
   which names the working tree's path, a path that differs between worker slots and between runs.
4. **Only a tracker or code host that did not answer counts toward the surface-failure rule**,
   which ends a cycle on two such failures in a row and which the spec calls the *outage rule*. Which surface failed is known from which surface's call threw. Whether it
   answered is read from the response's status, as `unanswered` in `src/claiming.ts` reads it: a refused call, such as a 404 for an item deleted since discovery, is not an outage, and
   counts toward its item's breaker like any other failure before the worker (decision 31). *Rejected:*
   reading the surface from the error's wording; and counting every tracker or code-host
   failure, which would end a cycle on two refusals and conflict with the in-force rule that a
   surface not answering "SHALL be distinguishable from a refusal about the item itself".
5. **Two identical failures before the worker, on different items in a row, end the cycle**, and neither counts toward its item's breaker. Decision 31 covers refused calls.
6. **After a deferral lifts, one identical failure sets the item down again**, not three. The answer that lifted it did not cure the failure.
7. **An item alone in its cycle counts a failure every item would meet, once per cycle**. With one run, nothing tells the item's failure from the environment's.
8. **A set-down lifts only on a person's change to the item, or on another role's successful
   run on it**, such as a pull request it opened. An Igor's other
   posts, such as another role's set-down or comment, lift nothing. Without this, two roles that
   meet one failure lift each other's set-downs, and each claims and posts every cycle with no
   bound.
9. **Both cycles apply both two-in-a-row rules**: `serve`'s cycle and the one
   `igor run` runs each end on two surface failures in a row (decision 4) and on two identical
   failures before the worker on different items in a row (decision 5), through the one
   comparison function both call (task 4.5). Without the surface rule in `igor run`, tracker
   failures whose messages differ each count toward their item's breaker during an outage.
10. **A set-down can be posted for a failure that a later run excludes**.
    Whether a failure is part of an outage, or of two identical failures on different items, is
    known only when the next run in the same cycle fails. The breaker decides and posts during
    the failing run, so an item with two genuine failures behind it can be set down by the first
    failure of an outage. It comes back when answered. *Rejected:* holding the decision until the
    next run, which a crash between the two runs loses, since it was never written to the log.
11. **A failure that #101 records as a condition never counts toward the breaker**. Such a failure is one whose run records a *cure key*, #101's name for a fault in
    the Igor's own setup, such as a seat whose token is unset. #101's `condition-backoff` says an
    item SHALL NOT be suppressed for such a fault. This holds for an item alone in its cycle too,
    which decision 7 otherwise lets count a failure every item would meet. Any other failure, such as a full disk, counts toward the breaker. Where every item would meet
    it, it can set down only an item alone in its cycle, which counts it once per cycle; two items
    failing alike end the cycle uncounted (decision 5). This
    change's `work-triage` delta says so in *An item handed back is not re-worked until something
    answers*, where the in-force text lists examples of a fact about the Igor and names no test.
12. **The discovery watermark does not advance past the items a cycle never reached because a
    two-in-a-row rule ended it**: the surface-failure rule, as well as the
    identical-failure rule. The watermark is the point past which discovery treats items as seen.
    #101's watermark requirement already keeps the watermark below an item left untaken for three
    reasons: the budget ran out, a condition stopped the cycle, or the claim got no answer; #242
    adds a fourth, no free worker slot or seat. This change's `work-discovery` delta adds the two
    rules to those reasons in its copy of *Watermarks reduce reconsideration without governing
    it*, which keeps #242's text, with a scenario for each. It also keeps the watermark below an
    item whose claim was refused when the run records a cure key, such as a missing App
    permission (decision 32), reversing the in-force example of such a refusal passing the mark:
    holding it costs re-triage of the items after it while the condition lasts, and passing it
    would lose the item for good once the permission is granted.
13. **One process serves the role, so every failure before the worker counts.** Under #242
    (`one-process-per-role`), which archives before this change, a role runs as one serving
    process whose workers each work an item of their own (*A role's workers run at once, each in a
    slot of its own*), so no two runs of one role hold an item at once and nothing decides which
    run's failure counts. `igor run` claims by label beside a served role with nothing
    coordinating the two, and the docs say not to point it at a served role (#241); this change
    adds nothing for that case. The mask on the tree's path covers #242's naming of trees by
    worker slot. *Rejected:* a count per worker slot, since the count is the item's.
14. **This change's code is built on #101 and #213**. #213's redaction function is built first,
    as its own pull request (#217), and this change's code calls it. Sections 2 to 4 of `tasks.md`
    build on `condition-backoff` (#101), which is in force. #101's watermark rule is what holds the
    mark below the items a cycle never reached (decision 12), so without it a cycle ended early by
    a two-in-a-row rule would let the watermark pass them. The breaker also reads two things #101
    adds: the `workerless` mark on a run row whose run started no worker, and cure keys. And it
    relies on #101's rule that readers counting runs skip rows carrying a `kind`, so that no
    reader takes a `pre-worker` or `outage` row for a run.
15. **A row on the state branch holds structured fields and no message text**. A
    `pre-worker` row holds:
    - the item and the role;
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
16. **A count that cannot be read sets nothing down.** Where the log cannot be read, or any of
    its day files fails to read, the run is refused. It still tries to write its `pre-worker`
    row, since an append can succeed where a read failed; a write that fails is lost, as any
    state write's failure is. *Rejected:* setting the item down on an unknown count, which would
    defer items whenever the state branch could not be read.
17. **A token mint inside a clone is tagged by whether the code host answered it.** A mint that
    got no answer is a `code-host` failure with no answer, as a clone the code host did not
    answer is, and counts toward the outage rule; a code host down during mints then ends the
    cycle instead of setting items down one by one. A refused mint is answered, so it stays a
    `tree` failure and counts toward its item's breaker. *Rejected:* tagging every failed mint
    `tree`, which leaves an unanswered mint with differing messages to count on every item.
18. **An `outage` row excludes failures by role, item and cycle**, not by where the rows sit in
    the log, since `serve` does not wait for a run's row to land. A cycle is named by the
    process's start id and a count of its cycles, so a run that ends between cycles, which #242's
    *Two runs in a row that the surface failed stop a cycle* counts toward the next, carries the
    next cycle's name, known before that cycle starts. *Rejected:* excluding the rows written before the outage row.
19. **A row that lands late or never gets no retry or wait of its own**, beyond #242's *A state
    write refused because the branch moved is retried*, if task 0.3 finds that it covers appends;
    if it does not, a refused append is lost, with the same cost. The
    count reads only rows that have landed, so a late or lost row can set an item down early: a
    worker start's row or a different failure's row that has not landed fails to break the
    sequence, and an `outage` row that has not landed fails to exclude its pair. This is accepted
    as a known limit, for any late or lost row; the cost is an early set-down, which a person's
    change lifts. `model/findings/LateRows.cfg` shows it. *Rejected:* a run waiting for its rows
    to land before it gives the claim back.
20. **An `outage` row written for two identical failures names only those two items**, not
    every failure in the cycle. The rule matched only that pair, so nothing
    shows another failure in the cycle to be the environment's. *Rejected:* naming every item
    that failed before the worker in the cycle, as the surface rule's row does.
21. **A run row written before #101 starts marking rows `workerless` stops the count**, as a run
    that started the worker does, since nothing tells the two apart. That errs toward fewer
    set-downs. *Rejected:* skipping such rows, which could join failures from either side of a
    run that worked.

22. **A failure in the claim window counts like any other failure before the worker**: under
    decision 13 no other run of the role can hold the item, so nothing needs deciding first, and
    the run posts the set-down itself, with no read of the item's claim messages
    first.
23. **A withdrawal is posted on the third identical failure in the claim window even where the
    claim message never landed.** It is the only word the item gets about being set down, and it
    removes the role's label, save a person's label that releasing a catch-up's claim leaves.
    This change carries a `MODIFIED` copy of #242's *A claim that cannot be kept is given back,
    out loud* whose scenario lets that third failure set the item down. If the tracker is still failing, the post fails too, and the item is
    then refused rather than deferred (`design.md`, agents' decision A1), so the next identical
    failure sets it down again and posts again.
24. **The count is per role and item**, so with several roles each may post
    three times before setting an item down. Each role is a separate Igor with its own label
    and its own deferral, and a fault in one role's setup says nothing about another's.
25. **A failure `execute` returns before the worker is retried twice and set down on the
    third**, like every other failure before the worker. In the in-force
    code such a failure, for example a catch-up whose merge fails, is handed off as a `failure`
    and deferred at once. One rule for every failure before the worker is simpler to read off
    an item's history, and two extra retries of a cheap step cost little. *Rejected:* deferring
    returned failures at once and counting only thrown ones.
26. **The full message sent to the process's log is redacted too**, by `task-execution`'s
    *Credential redaction replaces every credential the Igor knows* (#217), although the log is not
    the state branch; this change's rows hold no message text (decision 15).
27. **A run posts no set-down on an item already deferred.** `igor run --claim`, which a person
    points at an item, can claim one its role has set down, and fail the same way. That run gives
    the claim back without a second set-down. `SetDownOnce` in the model.
28. **A run that records a cure key takes no part in either two-in-a-row rule**. It is never one of the two runs that end a cycle, and it does not separate two
    runs that are. #101's condition already handles that fault. For the outage rule this change
    carries a `MODIFIED` copy of #242's *Two runs in a row that the surface failed stop a cycle*,
    which archives before it.
29. **The set-down post names the kind of failure in plain words, and quotes none of the error**. It says where the
    run failed and gives its HTTP status or exit code, and so do the refusals before it; the full
    text goes to the process's own log. Task 3.2 holds the sentence.
30. **`igor run --claim` counts like any run**. Its failure before the worker
    counts toward the item's per-role count like any run's. It runs outside any cycle, so it ends no
    cycle and trips no outage rule, and no `outage` row excludes it. *Rejected:* giving each
    `--claim` run a cycle of its own, which would only add a `cycle` for `outage` rows that can
    never be written for it.
31. **A refused call never ends a cycle**. The in-force scenario *A refusal
    about the item does not stop the cycle* wins: a refusal about the item counts toward that
    item's set-down only, never toward ending the cycle or holding the watermark, save one whose run
    records a cure key, which holds the watermark (decision 12). Two identical
    refused calls on different items, such as a 404 on adding the claim label to items deleted
    since discovery, do not end the cycle under the identical-failure rule. So decision 12,
    which holds the discovery watermark below the items a cycle ended early never reached, never
    holds it back for them. Like any failure that is not identical to the one before it, a
    refused call separates the runs on either side of it. The TLA+ model in `model/` checks this
    as the invariant `NoCycleEndOnRefusal`.
32. **A missing App permission records a cure key, so it sets no item down**. A call the tracker or code host refuses because the GitHub App lacks a
    permission, such as a 403 on adding the claim label, is a fault in the Igor's own setup. Its run records a cure
    key, #101's mechanism, naming the permission, so under *A fault in the Igor's own setup is
    not the item's failure* it counts toward no item's breaker. Every item meeting the same 403
    then cannot set the whole backlog down, which decision 31 alone, counting a refused call per
    item, would allow.
33. **The fingerprint stays unkeyed, and its weakness for a short secret is a known limit**. Credential redaction (#217) registers no secret shorter than 8
    characters, so a short secret in a failure's message, such as a 6-character proxy password,
    stays in the masked text, and anyone reading a public state branch can recover it from the
    row's unkeyed SHA-256 by trying every short string. *Rejected:* a keyed hash, such as an
    HMAC. It needs a key that the role's serving process and every `igor run` of the role hold
    and the state branch does not: a secret to provision and rotate. Rotating it changes every
    fingerprint, and so resets every item's count.

**Still open.** Each item names who answers it.

- **Unmeasured, for task 0.1 at gate two.** That real repeated failures give one signature after
  the masks, on one item and across items; which field of a 403 for a missing App permission
  tells it from other 403s, without which decision 32's cure key cannot be recorded and such a
  403 counts per item as decision 31 has it; whether a refused App credential inside a clone
  reaches #101's App condition; and how a clone tells that the code host did not answer, since
  git exits 128 for most failures; whether #242's retry covers appends to `executions.ndjson`
  (task 0.3), on which decision 19 rests; and how an edit's author is told, without which an
  Igor's own edit lifts a set-down (task 3.7); and how a role tells another role's successful run from its other posts, without
  which no post of another role lifts a set-down (task 3.7). Each requirement built on one of these says what
  holds until it is measured.
- **#216 (`lore-search`), for this change at archive and for #204.** #216 modifies `work-triage`'s
  *An item handed back is not re-worked until something answers* too, with a flagged-held rule a
  cure key and a reply do not release, and archives before this change. Task 7.1 merges this
  change's copy onto #216's archived text by hand at archive, keeping every scenario #216 adds
  and its flagged-held rule. Issue #204, which sets the order the open changes archive in, should
  say so in its body.
- **#141 (`closed-pr-defers`), for #141 and #204.** #141 lets only someone with write access lift a
  deferral, and calls its own deferral a set-down. Both #141 and this change modify `work-triage`'s
  *An item handed back is not re-worked until something answers*, and #204's order does not place
  #141. Whichever archives second carries the other's copy and merges the two lift rules, and
  the set-down sentence (task 3.2) follows.
- **#99 (`structured-failure-record`), for #99.** Decision 15 is this change's answer to #99's
  record of a cycle's faults: structured fields on the state branch and the message in the
  process's own log.
  #99's requirement asks the entry to hold no less than printing the caught fault to a console;
  whether the process's log line meets that, with no message text on the state branch, is #99's
  to say.
- **#242's design, for #242.** It says this change (#173) modifies none of #242's requirements; this change
  modifies three: *Two runs in a row that the surface failed stop a cycle*, *A claim that cannot
  be kept is given back, out loud* and *Watermarks reduce reconsideration without governing it*.
  #242's design should name all three.
- **#106 (`role-keyed-watermark`), for #106.** It archives after this change and modifies
  *Watermarks reduce reconsideration without governing it*, so its copy must keep what this change's copy adds: the two cycles it holds the watermark back
  for, those either two-in-a-row rule ended, the cure-key exception and three scenarios.

## Why

When a claimed run fails **before the worker starts**, the item is refused and tried again next
cycle ([#155](https://github.com/adamstallard/igor/issues/155)). Examples are a clone that fails,
a catch-up whose merge fails, a full disk, or a tracker call during the claim. Retrying such a
failure is cheap, so a thrown one defers nothing. (A failure `execute` returns before the worker
is deferred at once, which decision 25 changes.)

A deterministic failure therefore repeats forever. Every poll claims the item (its `igor:<role>`
label and a claim comment), fails, posts a handoff ending "It will try again next cycle", and
releases. Nothing remembers that the item failed the same way last cycle.

There is a second effect. Every throw out of a claimed run is marked as a surface failure, and
`serve` ends the cycle on the second in a row. A clone failure on one item is not the tracker
failing, but it counts as if it were. If that item sorts first, a real outage then ends the
cycle one item early.

## What Changes

**A breaker per item.** The Igor counts an item's failures before the worker,
in a row. On the third identical one it hands the item back deferred instead of refusing it, and
the message it posts on that run says it has stopped retrying and what brings the item back. The
first two failures are refused and retried.

- **The count is rebuilt from the execution log.** It is not kept in a store of its own, so it
  survives a restart. Each failure before the worker appends one row to `executions.ndjson`,
  the same log [#101](https://github.com/adamstallard/igor/pull/101)'s conditions are rebuilt
  from (`design.md`).
- **Identical means the same source and the same message.** The source is the tracker, the code
  host, the working tree or the Igor's own code. The message is compared with its variable parts
  masked: ids, item references and repository names, timestamps, the working tree's and other
  temporary paths, hexadecimal identifiers and long digit runs. HTTP statuses and
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

**Only a tracker or code host that did not answer is a surface failure.** The cycle's two-in-a-row rule counts a run only where a call to the tracker or the
code host got no answer, including a clone the code host did not answer. A refusal, a failure in
the working tree, or one in the Igor's own code does not count. Which call failed is known
from which surface's call threw, not read from the error's wording.

**A failure every item meets ends the cycle.** When two runs in a row, of
different items, fail before the worker identically, as a full disk or a clone token the code
host refuses makes them, the cycle ends and neither failure counts toward its item's breaker. An item alone in
its cycle counts such a failure once. Without this, every item would be claimed and posted on
three times and then set down, and stay down after the cause was fixed.

Out of scope:

- **Catch-ups the code host settles on its own.** They take no claim and post nothing, so there
  is nothing to repeat. A catch-up that escalates into a claimed run is covered like any other.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-claiming`: a run that records a cure key takes no part in #242's outage rule; a failure
  before the worker that repeats three times sets the item down, two
  identical ones on different items in a row end the cycle, and only a tracker or code-host
  failure counts as the surface failing, toward #242's *Two runs in a row that the surface failed
  stop a cycle*.
- `work-discovery`: the watermark does not pass an item a cycle ended by either two-in-a-row rule
  never reached (decision 12).
- `work-triage`: a set-down lifts as `work-claiming` says, and only a run that records a cure
  key, exhausted budget, or a seat whose usage could not be read is a fact about the Igor that suppresses nothing (decision 11).
- `graceful-handoff`: the in-force scenario *Busy is not a reason* no longer names budget as the
  only reason to defer, since a set-down defers too.

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
