# Design

## Where the count lives: rows in the execution log

**The count is rebuilt from `executions.ndjson`.** No store of its own holds it. Each failure
before the worker appends one row, and the count is read back from the rows when the next such
failure happens.

```json
{"at": "…", "kind": "pre-worker", "item": "owner/repo#12", "role": "web", "rank": 1,
 "held": true, "cycle": "<cycle start>", "source": "tree", "exitCode": 128,
 "cured": false, "fingerprint": "<SHA-256 of the masked message, hex>"}
```

**The row holds structured fields and no message text** (Adam, 2026-10-20; the proposal's
decision 15). The state branch is as visible as its repository, so on a public repository anyone
can read the row.

- `held` says whether the rank held the claim. It is false for a rank alone on the item in the
  claim window (*Where the set-down is said*, below).
- `source` is which surface's call threw: `tracker`, `code-host`, `tree` or `igor`.
- `httpStatus` or `exitCode` holds the failure's status, where it has one. #99
  (`structured-failure-record`) asks for that status to be readable apart from the message.
- `cured` says whether the run recorded a cure key, #101's name for a fault in the Igor's own
  setup.
- `fingerprint` is an unkeyed SHA-256 of the failure's masked message (*What "identical" means*,
  below). It exists to match repeats. Being unkeyed, it does not hide a message: someone who
  guesses a masked message can confirm the guess.

The failure's full message goes to the Igor process's own log on its server, which the server's
journal keeps, after credential redaction: `task-execution`'s *Credential redaction replaces every
credential the Igor knows*, which [#213](https://github.com/adamstallard/igor/issues/213) adds in
pull request #217. That rule is #188's, extended with the `user:pass@` part of a URL, and #213
builds it before this change's code (the proposal's decision 14).

A failure that records a cure key writes its `pre-worker` row, with `cured: true`, and also its
ordinary run row, carrying `cures`: the row without a `kind` that the log holds for each run.
#101 builds its conditions from run rows that carry a cure key, never from a `pre-worker` row, so
the run row is what keeps the fault visible to #101. For a thrown failure that records a cure key,
the in-force code writes no run row, so this change writes one. #101 builds how `runItem` learns a throw's cure key.
Whether a refused token mint inside a clone records one at all is unmeasured (task 0.1).

Three places could hold the count. Two are rejected.

- **Rejected: in memory.** It does not survive a restart, and a deterministic failure survives
  one. An Igor restarted by a deploy or a crash would post three more times per item before
  setting it down, and one restarted often would never set it down at all.
- **Rejected: a count in `deferred.json`, or a store beside it.** That state is written whole,
  so two Igors writing it in one interval can overwrite each other. A count kept beside the log
  can also disagree with it. [#101](https://github.com/adamstallard/igor/pull/101) rejected a
  separate store for its conditions for both reasons (Adam, 2026-10-11), and a per-item failure
  count is the same kind of thing, a trailing run of identical events.
- **Chosen: rows in the log.** An append never overwrites a row another process wrote:
  `appendRecord` reads the day's file and writes it back with one line added, and the code host
  refuses the write if the file changed since the read. The refused append is then lost unless
  something retries it, and in the in-force code nothing does. #179 (`concurrent-instances`),
  which archives before this change, adds a retry: where several processes write one state
  file, a refused write is retried, keeping the other process's record. Task 0.3 checks that
  this retry covers appends to `executions.ndjson`. The log is already where a
  run is recorded, and #101 adds rows that are not runs, carrying a `kind`, so this adds a row
  kind rather than a mechanism. In the in-force code a failure before the worker that is thrown
  writes no row: `cli.ts` records a run only where `execute` returned a result for it, and a
  throw returns none. This row fills that gap in the record too.

The log is read only on a failure before the worker, never on a healthy run, so the breaker costs
nothing until it is needed. The log is kept on the `igor-state` branch, one file per day.
`readLog` reads a past day's file once per process and re-reads the list of day files and
today's file every time, so after a process's first read the breaker costs two requests to the
code host.

**What the deferral itself uses is unchanged.** The third failure's run returns as a `failure`
handoff carrying no cures, and the existing `shouldDefer` and `noteHandoff` path writes it to
`deferred.json`. That record is a cache whose loss costs one repeated handoff. Here the loss
costs one claim and one message: the next identical failure finds a count past three and sets
the item down again.

### Counting

A *run row* is a row without a `kind`. For one item and one role, walk the rows newest first,
and apply to each row the first step that fits it:

1. Skip a `pre-worker` row that an `outage` row excludes (below). The `outage` row is looked up
   by role, rank, cycle and item wherever it sits in the log, not met in the walk, since it can
   land after the rows it excludes. Skip a `pre-worker` row with `cured: true` too.
2. Skip a run row that #101 marks `workerless`: its run started no worker. Three kinds have
   none: a failure before the worker that recorded a cure key, whose row carries `cures`
   (below); a failure before the worker that `execute` returned, whose run row stays beside its
   `pre-worker` row (below); and #101's catch-up whose merge came out clean. A row without the
   mark started the worker, so a row written before #101 marked rows stops the count. That errs
   toward fewer set-downs (the proposal's decision 21).
3. Count a `pre-worker` row whose `source` and `fingerprint` match the failure in hand.
4. Stop at a run row whose run started the worker, including one that recorded a cure key after
   the worker started, or at a `pre-worker` row that does not match.
5. Skip rows of any other `kind`, such as #101's `probe` and `check` rows.

The walk runs before the failure in hand writes its own row, so that failure is one more,
unless it records a cure key. At three or more, the item is set down, unless it is already
deferred for the role (*Where the set-down is said*, below).

**A read that fails sets nothing down, and so does a partial one** (the proposal's decision 16).
In the in-force code `readLog` never throws: a day's file that fails to read reads as empty. A
missing day would let the rows on either side of it join one count, as a late row does
(*What the model shows*, below). So `readLog` reports any file it failed to read, and the breaker
treats such a read as one that failed (task 4.3).

Which rows a failure before the worker writes:

- **Thrown:** a `pre-worker` row only.
- **Returned by `execute`**, such as a merge that fails in a catch-up (which holds a claim): a
  `pre-worker` row, and the ordinary run row `execute`'s result already produces, marked
  `workerless`. The run row stays because of #101's *probe*, the one item #101 lets through
  after a fault in the Igor's setup to test whether the fault has cleared. #101 ends a probe on
  the probed item's run row, and voids the probe where the run wrote none. Keeping the row lets
  a returned failure end its probe, as it does under #101, instead of voiding it. A thrown
  failure on a probe writes no run row, so #101 voids its probe.
- **Recording a cure key:** a `pre-worker` row with `cured: true`, and its run row (above).

**A failure that records a cure key never counts** (Adam, 2026-10-17). #101 records a cure key
for a fault in the Igor's own setup, such as a seat whose token is unset. #101's `work-triage`
delta says that for such a fault an item is never suppressed, that is, never held back as a
set-down item is. *Counting* skips both of that failure's rows (steps 1 and 2), as it skips a
`pre-worker` row an outage excludes: they neither count nor break the sequence. Such a run also
takes no part in either two-in-a-row rule (Adam, 2026-10-20; the proposal's decision 30): it is
never one of a pair, and the function that applies both two-in-a-row rules (*Both cycles apply
both rules*, below) keeps the run before it as the previous run.

A count at or past three after a lifted deferral sets the item down on the first identical
failure. That is deliberate (spec, *In a row*; accepted by Adam, 2026-10-11): the answer that
lifted the deferral did not cure the failure, and the alternative posts three more times. An
edit or a reply leaves no row here, so the sequence carries on through it.

## What "identical" means: source and masked message

**The source is which surface's call threw**: `tracker`, `code-host`, `tree` or `igor`. `runItem`
passes `execute` its tracker, code host and tree provider through thin wrappers that tag any
error thrown out of a call with the surface's name. An error with no tag is `igor`: a bug, or
something no surface raised.

**Only a call that got no answer is a surface failure** (Adam, 2026-10-20; the proposal's
decision 4). The wrapper also records whether the surface answered, by the response's status, as
#101's `passesMark` does for a claim: no status at all, a 5xx, a 408, a 429, or a 403 whose
message says it is a rate limit is no answer. GitHub answers both its primary and secondary rate
limits with a 403 as often as a 429, so a 403 needs its message read. Only a `tracker` or
`code-host` failure with no answer sets `surfaceFailed`, the mark on a run that the outage rule
counts. A refused call, such as a 403 for a missing permission, counts toward its own item's
breaker and toward nothing else (Adam, 2026-10-21; the proposal's decision 34): two identical
ones on different items do not end the cycle under the identical-failure rule either, so the
in-force scenario *A refusal about the item does not stop the cycle* holds. Since a refused
call never ends a cycle, it leaves no item unreached on its account. So the discovery watermark,
which the proposal's decision 12 holds below the items an early-ended cycle never reached, is
never held back for one.

**A clone is the one working-tree call that can be the code host's.** A clone that fails because
the code host did not answer is tagged `code-host`, with no answer, so two in a row end the cycle
as an outage. The tree provider also mints its git token through the code host's credential, and
a mint that fails inside a clone stays tagged `tree` (the proposal's decision 17): an expired
clone token fails every item, and the identical-failure rule catches it (*A failure every item
meets ends the cycle*, below). git exits 128 for most failures, so how the tree provider tells
that the code host did not answer a clone is unmeasured (task 0.1).

**The message is masked before comparing** (Adam, 2026-10-20). The masks run on the message after
credential redaction, never on the raw one: replacing digit and hexadecimal runs first
could break up a token's shape before the redaction can match it. In order:

1. The run's own working-tree path becomes `<tree>`. The code knows that path, since it
   provisioned the tree, so the mask replaces it as text wherever it appears, rather than matching
   a pattern for tree names. A pattern written for the in-force `igor-tree-` prefix would stop
   matching under `concurrent-instances` (#179), which names trees by role and rank; replacing
   the known path keeps working whatever the name holds (Adam, 2026-10-18). Because the count
   carries on across a role's ranks, trees of different ranks must mask to the same text, and
   they do.
   The path is known only if `provision` reports it: in the in-force code it makes the
   directory itself and, when the clone fails, removes it and rethrows, so the caller never
   learns it. Its random suffix is six characters that neither the hexadecimal nor the digit mask catches, so each failed
   clone would give a different signature. Task 3.1 has `provision` report the path it made
   with its failure. The tree's path is masked first, as `<tree>`, so that a tree inside the
   temporary directory does not become `<tmp>`, and one outside it, as #179 may place one, is
   caught too.
   Any other path under the system's temporary directory becomes `<tmp>`.
2. Timestamps, dates and times of day, become `<time>`.
3. Hexadecimal runs of seven or more characters, either case, become `<hex>`. These are SHAs and
   request ids.
4. Ids: an issue or pull request number, `#` followed by digits, becomes `#<n>`, so two items'
   failures can match.
5. Remaining runs of four or more digits become `<n>`. These are process ids, ports and counts.

Runs of three digits or fewer stay. They hold HTTP statuses and exit codes, so a 404 and a 500
from the same call are not identical. The masked text is the failure's *signature*. The row holds
its fingerprint (above), and the text itself goes nowhere: the process's log holds the message
before masking.

- **Rejected: the masked message as readable text in the row** (Adam, 2026-10-19, replaced
  2026-10-20). A tracker error can quote a private repository's or a Linear workspace's text,
  which the redaction does not strip, onto a branch that may be public.
- **Rejected: the source alone.** A clone that fails on a full disk and then on an expired token
  is two failures, and a person fixing the first should not find the item set down by the
  second.
- **Rejected: the raw message.** A clone's message names its working tree's path, which differs
  between ranks and, for a temporary tree, between runs, so two failures would rarely match and
  the breaker would rarely trip.
- **Rejected: masking every digit run** (Adam, 2026-10-11, replaced 2026-10-20). It made a 404
  and a 500 from the same call identical, and removed the status #99 asks to be readable.

## Outages: an `outage` row excludes the cycle's failures

Either cycle, `serve`'s or `igor run`'s, ends on the second surface failure in a row. `igor run
--claim` works one item outside any cycle, so it ends nothing and no `outage` row excludes its
failure, which counts as rank 0's (Adam, 2026-10-21; the proposal's decision 33). Its
`pre-worker` row has no `cycle`. When a cycle does end, it appends:

```json
{"at": "…", "kind": "outage", "role": "web", "rank": 1, "since": "<cycle start>",
 "items": ["owner/repo#12", "owner/repo#15"],
 "failures": [{"item": "owner/repo#12", "held": true, "source": "tracker", "httpStatus": 503,
               "cured": false, "fingerprint": "…"},
              {"item": "owner/repo#15", "held": true, "source": "tracker", "httpStatus": 503,
               "cured": false, "fingerprint": "…"}]}
```

Each entry of `failures` carries the fields of the failure's `pre-worker` row, and no message
text. The row is the cycle's record of its fault for #99 (`structured-failure-record`): it says
what failed and where, with the status readable apart from any message.

`items` names every item whose run failed before the worker in that cycle, because the spec
excludes every failure in a cycle the outage rule ended. Where one of the two surface failures
that ended the cycle came before the worker, its item is named too. Failures after the worker
are left out because only `pre-worker` rows count. A `pre-worker` row for a named item, of the
same role and rank, whose `cycle` equals the outage row's `since`, does not count. Matching on
the cycle, not on where the rows sit in the log, is deliberate: `serve` records a run without
waiting for the write, so the row of the failure that ended the cycle can land after the outage
row. Matching on the rank keeps one rank's outage from excusing a sibling rank's failure on the
same item in a cycle of its own. `igor run` runs as rank 0 beside any serving rank (Adam,
2026-10-18; the proposal's decision 13), so its rows carry rank 0. A serving rank's outage row
therefore never excuses a failure of `igor run`, and an outage row of `igor run` never excuses
a serving rank's failure. Two `igor run`s of one role at once both write rank 0, so only their
cycles' starts keep one run's outage row from excusing the other's failures. #179 lists for
Adam the wider gap these two runs leave: both can work the same item.

An outage row that never lands lets that cycle's failures count. The cost is a set-down that a
reply lifts, so the row gets no retry beyond the one #179 gives every state write. The same holds
for any row that lands late or never (the proposal's decision 19).

**The set-down does not wait for the outage row** (Adam, 2026-10-17). A third identical failure
sets its item down during its own run. If the next run's failure then ends the cycle, the
outage row excludes the failure from later counts, but the set-down already posted stands, and
the item comes back when answered.

Where the failing run is itself the second of the two runs that end the cycle, that is known
during the run. The function both cycles call to apply the two-in-a-row rules (*Both cycles
apply both rules*, below) keeps the previous run, and `runItem` asks that function before
counting, so that run neither counts nor sets its item down.

Two other ways to keep an outage from setting an item down were rejected:

- **Rejected: delay each row, or the set-down, until the next run shows whether the cycle
  continued.** That means holding the decision in memory across items, and losing it on a crash
  or a shutdown between items.
- **Rejected: count no tracker or code-host failure at all.** Adam named a tracker or code-host
  call during the claim as a failure the breaker counts. Where a role runs several ranks, the
  rule that only the holder counts would, on its own, count no claim-window failure, since #179
  says a process whose claim failed in the window holds nothing. So a claim-window failure
  counts where the item has no claim message of another rank that #179's rules count (*Where
  the set-down is said*, below; the proposal's decision 22).

A single item that meets an outage, or a failure every item meets, alone in its cycle has no
second run to end the cycle, so its failure counts. That costs it one place in its count per
such cycle. Adam accepted this on 2026-10-11: with one run in the cycle, nothing can tell the
item's failure from an outage, which is why both cycle rules count two.

## A failure every item meets ends the cycle (Adam, 2026-10-11)

A full disk or an expired clone token fails every item before the worker, and in the working
tree, so it is not a surface failure. Counted only per item, it would claim and post on every
item for three cycles and then set down the whole backlog, which would stay deferred after the
cause was fixed until someone answered each item.

So the loop applies the outage rule's test, two in a row, to failures before the worker: when
two runs in a row, of different items, fail with the same `source` and signature, the cycle ends.
Whichever cycle ended appends an `outage` row naming both items, the same row the surface rule
writes, so *Counting* excludes both failures with no new row kind. It names only the two, not
every failure in the cycle (the proposal's decision 20): the rule matched only that pair, so nothing shows any other failure
in the cycle to be the environment's rather than its item's. Where the two identical failures
are also surface failures, the outage rule ended the cycle, and its row names every item that
failed before the worker. This does not make a tree failure a surface failure: `surfaceFailed`
still follows only the tracker and code-host tags.

**Both cycles apply both rules: `serve`'s and the single cycle `igor run` runs** (Adam,
2026-10-17). In the in-force code the two share no cycle code: `serve` keeps its surface-failure
count in `src/serve.ts`, and `src/cli.ts` runs its own loop over the items it claims, with no
surface rule. A rule in only one of them would let the other set down the whole backlog. Without
the identical-failure rule, a full disk fails every item the same way in every cycle. Without
the surface rule, an outage fails every item's tracker call, and where the messages differ the
identical-failure rule does not end the cycle either; each failure counts, and three such cycles
set every item down. So this change adds one function, which both loops call, that applies both
two-in-a-row tests.

The comparison needs nothing from the log. The function keeps the previous run's item, source,
signature and whether it was a surface failure for the length of one cycle, which a crash loses at
no cost: the next cycle starts comparing afresh. Two kinds of run leave the previous run in place,
neither joining a pair nor separating one: a rank that drops out because another rank holds the
item, which has no failure of its own (Adam approved this with the change, 2026-10-20); and a run
that records a cure key (the proposal's decision 30). A refused call is never one of a pair
(decision 34), but it becomes the previous run, so it separates the runs on either side of it,
as a failure that is not identical does.

## Where the set-down is said

**The set-down post names the failure and quotes none of it** (Adam, 2026-10-20; the proposal's
decision 31). The item may be public. In the in-force code a failure handoff posts the raw error
message; a set-down's post instead says in plain words where the run failed, from the row's
`source`, and gives its HTTP status or exit code, such as "Setting up the working tree failed
(exit code 128)". The full message is in the process's log. A *refused run* is one that gives
the claim back for the item to be tried again next cycle, as the two failures before a set-down
do. Its post, the *refusal post*, gives the same plain words in place of the raw message,
followed by "It will try again next cycle" (Adam, 2026-10-21; the proposal's decision 36).

**A failure after the claim** is given back through `handOffFrom`, as in the in-force code. On
the third identical failure, its `failure` reason carries `next: 'set-down'`. An undirected
handoff's "It will try again next cycle" becomes the set-down sentence (`tasks.md` 3.2). A
directed handoff, whose tail is its relabel sentence alone, gets the set-down sentence first and
keeps the relabel sentence after it. Adding the label again is an edit that lifts the deferral,
so the relabel sentence already says what brings the item back.

**A failure in the claim window** is given back by `takeClaim`. On the first two failures, it
posts `claimWithdrawn` where the claim message may have landed, or `claimStuck` there if the
release did not clear the label, and posts nothing where the message cannot have landed. On the
third identical failure, it always posts one of the two, with the set-down sentence in it,
even where the claim message never landed, because that is the only word the item gets about
being set down (Adam, 2026-10-19; the proposal's decision 23). If the tracker is still failing,
that post fails too, at no cost.

**Only where no other rank's claim is on the item** (Adam, 2026-10-19; the proposal's decision
22). #179 says a process whose claim failed in the window holds nothing. So before it counts a
claim-window failure, or posts the set-down, the rank reads the item's claim messages. It adds
the failure to the item's count, and posts, only where the item has no claim message of another
rank of its role that #179's rules count. A rank that finds one adds nothing, writes no `pre-worker` row, and leaves the role's label on
the item. Two `igor run`s of one role at once both carry rank 0, so neither sees the other's
claim as another rank's; #179 lists that gap for Adam. Where that read itself fails, which is
likely while the tracker is not answering, the rank counts nothing, posts nothing and leaves the
label (Adam, 2026-10-20; the proposal's decision 22), as it would beside a sibling's claim.

**A failed read is tried again next cycle** (Adam, 2026-10-21; the proposal's decision 35). The
rank keeps the item in memory and reads its claim messages again in its next cycle. Where it
finds another rank's claim message that counts, it drops out silently. Where it finds none, or
the read fails again, it gives the claim back with the refusal post, so the claim
does not end in silence, as the in-force *A claim that cannot be kept is given back, out loud*
requires. `igor run` runs no next cycle, so it makes the second read before it exits.

The claim-window failure whose read failed is never counted, whatever the reread finds, and a
second failed read is not a failure that counts either. Counting the first would mean writing
its row a cycle late, by when the item's claim messages may have changed. A restart between the
two reads loses the memory, and the claim then waits for #179 to free an item that no running
rank works.

**The withdrawal releases only claim messages posted before the test** (Adam, 2026-10-20; the
proposal's decision 29). The test and the withdrawal are two tracker calls, and a sibling's claim
message that lands and verifies between them must still count after the withdrawal. #179 decides
how a release leaves such a message counting, since it orders claim messages against a release.
The model assumes it (*What the model proves*, below).

**One set-down per deferral** (Adam, 2026-10-20; the proposal's decision 28). Two ranks can both
read an item as free; one sets it down and releases it, and the other's claim message then lands
on the released item. Before it posts a set-down, the run reads the item's record in `deferred.json`, and asks
whether a set-down of its role there has lifted. Where one has not, the run posts no set-down and gives the
claim back with the refusal, leaving out its "It will try again next cycle", which the deferral
makes untrue (Adam approved this on 2026-10-21; the proposal's decision 38).

The run then returns `handed-off` with `handoff: 'failure'`. That is what `shouldDefer` already
defers on, so `serve`, and `igor run`'s cycle in `src/cli.ts` in both its loops, over claimed
items and over catch-ups, defer it with no change to their deferral path. One more path does
not: `igor run --claim`, on an item whose own pull request has fallen behind its base, runs
`catchUpItem`, which calls neither `shouldDefer` nor `noteHandoff`. A set-down there must defer
the item too (task 4.1).

## What lifts a set-down

**A person's change to the item, or another role's successful run on it** (Adam, 2026-10-20; the
proposal's decision 8). A successful run is one that produced the role's work, such as a pull
request it opened for the item. An Igor's other activity on the item lifts nothing: another
role's set-down post, its comments, its label. Each role is a separate Igor, so without this rule
two roles that both meet one failure would lift each other's set-downs with their own posts, and
each would claim and post every cycle with no bound.

`work-triage`'s *An item handed back is not re-worked until something answers* lifts any other
handed-back item on a reply from anyone but that Igor, or any edit. A set-down's record in
`deferred.json` says it is a set-down, so the check that decides whether a deferral has lifted
applies the narrower rule to it. Which posts and edits are an Igor's is known from their author,
the role's GitHub App; how a role tells another role's successful run from its other posts is
task 3.7's.

## What the model proves

[`model/PreWorkerBreaker.tla`](model/PreWorkerBreaker.tla) models the breaker in TLA+, and CI runs
TLC, the TLA+ model checker, on it (`.github/workflows/tla-pre-worker-breaker.yml`). It models one
role run as several ranks, its items, and each run's claim (read, post, verify). It models
failures in the claim window, and failures after verification that are thrown or returned, each
with or without a cure key (#101's mark of a fault in the Igor's own setup). It also models worker
starts, the two two-in-a-row rules with their `outage` rows, set-downs lifted by a person's change
or another role's successful run, and another role's other posts on a deferred item. Rows reach
the execution log only when they land, which may be late, in any order, or never. Each set-down
is checked against a ghost record of every failure, in the order the runs decided them.

**What passes, and under what.** Each rule of the change is a constant, TRUE in the change as
specified. Two of the model's switches are assumptions, not rules:

- `PromptRows`: a row about an item lands before any run next claims the item, and before any run
  already on the item decides its outcome, a failure or a worker start.
- `AtomicWithdraw`: a rank alone on the item in the claim window tests the item's claim messages
  and posts its withdrawal in one step. It stands for the proposal's decision 29: the withdrawal
  releases only claim messages posted before the test, by a mechanism #179 decides.

Every configuration CI runs passes every invariant it checks. All of them assume
`AtomicWithdraw`, and all but `PreWorkerBreakerLateRows.cfg` assume `PromptRows`; that one drops
it and checks the invariants that hold without it. Each file in `model/negative/` turns one rule
off, keeps `PromptRows`, and checks only the invariant that breaks without the rule; TLC finds
that violation, which shows the rule is needed. CI checks both kinds: the configurations must
pass and the negatives must fail. `model/findings/` holds two configurations that fail by design,
one for each assumption (*What the assumptions leave out*, below), and CI does not run them.

| Invariant or property | Requirement it proves (`work-claiming`) |
| --- | --- |
| `NoSetDownByNonHolder`: a set-down comes from the holder, or from a rank in the claim window while no other rank holds the item | *A failure before the worker that repeats sets the item down*, "Only the holder counts" and "In the claim window, a rank alone on the item counts" |
| `NoSetDownWithoutThree`: at least three recorded failures with the set-down's signature | the same requirement, "When a failure brings the count of identical ones to three or more" |
| `NoSetDownWithoutThreeInARow`: three that the spec counts in a row, skipping the excluded ones | the same requirement, "In a row", "An outage is not the item's failure" and the cure-key rule; and *Two identical failures before the worker on different items end the cycle*, "Neither run SHALL count" |
| `NoDoubleSetDown`: one set-down per deferral | the same requirement, "One set-down per deferral" |
| `NoSetDownWithoutAnswer`: each set-down of an item after its first follows a person's change or another role's successful run | the same requirement, "What lifts a set-down" |
| `NoSetDownForCure`: no set-down for a failure that records a cure key | the same requirement, "A fault in the Igor's own setup is not the item's failure" |
| `NoCycleEndOnRefusal`: no cycle ends on a pair of refused calls | *Two identical failures before the worker on different items end the cycle*, "A refused call SHALL take no part in this rule either" |
| `RepeatedFailureSetDown`: an item that fails the same way before the worker on every run is set down | the same requirement, its purpose |

Results on TLC 2.19 (`tla2tools.jar` v1.7.4), four workers, 2026-10-21. `PreWorkerBreaker.cfg` is
the base: two ranks, two items, three signatures (a surface failure, a refused call and a failure
of the working tree), and a claim-window failure. The first four configurations in the table below
use those signatures; the liveness ones give each item its own signature and have no refused call.
In *Checks*, holder, three, in a row, once, answer, cure and refusal stand for
`NoSetDownByNonHolder`, `NoSetDownWithoutThree`, `NoSetDownWithoutThreeInARow`,
`NoDoubleSetDown`, `NoSetDownWithoutAnswer`, `NoSetDownForCure` and `NoCycleEndOnRefusal`.

| Configuration | Differs from the base by | Checks | Distinct states | Time | Result |
| --- | --- | --- | ---: | ---: | --- |
| `PreWorkerBreaker.cfg` | (the base) | holder, three, in a row, once, answer, refusal | 24,204,541 | 101 s | pass |
| `PreWorkerBreakerOneRank.cfg` | one rank; returned failures, cure keys, a lifted deferral | every invariant | 40,795,299 | 186 s | pass |
| `PreWorkerBreakerReturned.cfg` | returned failures and cure keys; no claim-window failure and four runs, to keep it small | holder, three, in a row, once, answer, cure, refusal | 11,672,449 | 47 s | pass |
| `PreWorkerBreakerLateRows.cfg` | no `PromptRows`: rows late, reordered, one lost | holder, three, once, answer, refusal | 40,026,709 | 169 s | pass |
| `PreWorkerBreakerLiveness.cfg` | one rank; every run fails; a lost row | liveness, holder, three, in a row, once, answer | 7,267 | 1 s | pass |
| `PreWorkerBreakerLivenessRanks.cfg` | one item that fails every run; a lost row | liveness, holder, three, in a row, once, answer | 97,125 | 3 s | pass |

Each negative configuration turns off one rule and finds a violation, as required:

| Negative | Rule turned off | Violation TLC finds |
| --- | --- | --- |
| `NoHolderOnly.cfg` | only the holder counts | `NoSetDownByNonHolder` |
| `NoAloneInWindow.cfg` | a claim-window failure counts only with no other rank's claim on the item | `NoSetDownByNonHolder` |
| `NoIdenticalOnly.cfg` | only identical failures count in a row | `NoSetDownWithoutThree` |
| `NoReturnedRetried.cfg` | a returned failure is retried twice (decision 26) | `NoSetDownWithoutThree` |
| `NoSkipSecondOfPair.cfg` | the run that ends its cycle as the second of a pair is not counted | `NoSetDownWithoutThreeInARow` |
| `NoOutageExcludes.cfg` | an `outage` row excludes the failures it names | `NoSetDownWithoutThreeInARow` |
| `NoCureSkipped.cfg` | the count skips a failure that records a cure key | `NoSetDownForCure` |
| `NoSetDownOnce.cfg` | no set-down on an item already deferred (decision 28) | `NoDoubleSetDown` |
| `NoIgorPostsLiftNothing.cfg` | another role's posts lift no set-down (decision 8) | `NoSetDownWithoutAnswer` |
| `NoRefusalsUnpaired.cfg` | a refused call is never one of a pair (decision 34) | `NoCycleEndOnRefusal` |

**Liveness holds within a bound on runs.** The model bounds the runs of a behaviour, so liveness
is checked as: an item that fails the same way on every run is set down before the runs run out.
With one rank, each item takes three runs, plus one for each lost row; a claim-window failure
costs nothing extra, since a lone rank's counts like any other. With two ranks contending for the
item, a run that loses verification to its sibling counts nothing, so each counted failure may
cost two runs. The item needs three counted failures, one more for the lost row, and one more
for a claim-window failure beside the sibling's claim, which counts nothing either: 2 × (3 + 1 + 1)
= 10. A smaller `MaxRuns` than that makes the property fail only because
the runs run out. Both liveness configurations assume `PromptRows`; without it a row in flight
undercounts, and the bound grows with the rows in flight.

### What the assumptions leave out

CI does not run `model/findings/`: each file there drops one assumption and fails by design.

- **A row that lands late, or is lost, can set an item down after fewer than three in a row**
  (`findings/LateRows.cfg`, which drops `PromptRows`). *Counting* reads only rows that have
  landed. Suppose a worker start's run row, or a different failure's `pre-worker` row, has not
  landed when the item's next run counts. It then no longer breaks the sequence, and the failures
  before and after it join into one count. An `outage` row that has not landed no longer excludes
  its pair. A late row is possible because `serve` records a run without waiting for the write
  (*Outages*, above), and a refused write is retried. Adam accepted this as a known limit
  (2026-10-20; the proposal's decision 19): the cost is an early set-down, which a person's change
  lifts. `findings/LateRows.cfg` with `PromptRows` TRUE and no row lost, rows still reordered,
  passes (70,446,985 distinct states, in a run made for this check on 2026-10-21; CI does not run it).
- **A lone rank's withdrawal can release the item under a sibling** (`findings/WithdrawRace.cfg`,
  which drops `AtomicWithdraw`). Decision 22's test of the item's claim messages and the
  withdrawal are two tracker calls. A sibling whose claim message lands and verifies between them
  holds the item; a withdrawal that released every claim message would release it, so no claim
  message of the sibling's would count while it works, and when it later failed a third time it
  would set the item down without holding it. Decision 29 rules that out: the withdrawal releases
  only claim messages posted before the test, which #179 decides how to do. With `AtomicWithdraw`,
  the configuration is the base one, which passes.

**A run that records a cure key takes no part in the two-in-a-row rules** (the proposal's
decision 30). In the model it forms no pair and leaves the previous run in place, so it neither
ends a cycle nor separates the two runs of a pair. **A refused call** forms no pair either
(decision 34), but becomes the previous run, so it separates the runs on either side of it. A
refused call's signatures are `RefusalSigs`.

**Not modelled:** several roles, since the count is per role and roles share nothing here; `Lift`
and `OtherPost` stand for what another role does on the item. Also failures after the worker; the
masks, since a signature is a model value; a read of the count that fails, and a failed read of
the item's claim messages in the claim window, since the spec has each count nothing and post no
set-down, which can only remove set-downs (the reread a cycle later counts nothing either);
`igor run --claim`, whose failure counts like a rank's and never pairs, since it runs outside any
cycle, so leaving it out can only add cycle ends; the discovery watermark; and how #179 frees an item that carries
claim messages while no running rank is working it (`Recover` stands for that).
