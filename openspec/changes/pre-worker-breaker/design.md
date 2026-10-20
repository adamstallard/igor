# Design

## Where the count lives: rows in the execution log

**The count is rebuilt from `executions.ndjson`.** No store of its own holds it. Each failure
before the worker appends one row, and the count is read back from the rows when the next such
failure happens.

```json
{"at": "…", "kind": "pre-worker", "item": "owner/repo#12", "role": "web", "rank": 1,
 "cycle": "<cycle start>", "source": "tree", "message": "git clone exited #: fatal: …"}
```

`source` is which surface's call threw: `tracker`, `code-host`, `tree` or `igor`. `message` is
the failure's masked message as text, which a person reading the state branch can read (Adam,
2026-10-19). The raw message first passes through the redaction function Igor applies to every
write to the state branch ([#213](https://github.com/adamstallard/igor/issues/213)), which
strips token-shaped strings and credentials in URLs, and then through the masks (*What
"identical" means*, below). The state branch is as visible as its repository, so the redaction
is what keeps a credential off it.

A failure that records a cure key (#101's name for a fault in the Igor's own setup) writes no
`pre-worker` row. It keeps the ordinary run row, the row without a `kind` that the log holds for
each run (*A failure that records a cure key never counts*, below).

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
   land after the rows it excludes.
2. Skip a run row that #101 marks `workerless`: its run started no worker. Three kinds have
   none: a failure before the worker that recorded a cure key, whose row carries `cures`
   (below); a failure before the worker that `execute` returned, whose run row stays beside its
   `pre-worker` row (below); and #101's catch-up whose merge came out clean. A row without the
   mark started the worker, so a row written before #101 marked rows stops the count. That errs
   toward fewer set-downs (the proposal's decision 21).
3. Count a `pre-worker` row whose `source` and `message` match the failure in hand.
4. Stop at a run row whose run started the worker, including one that recorded a cure key after
   the worker started, or at a `pre-worker` row that does not match.
5. Skip rows of any other `kind`, such as #101's `probe` and `check` rows.

The walk runs before the failure in hand writes its own row, so that failure is one more,
unless it records a cure key. At three or more, the item is set
down.

Which rows a failure before the worker writes:

- **Thrown:** a `pre-worker` row only.
- **Returned by `execute`**, such as a merge that fails in a catch-up (which holds a claim): a
  `pre-worker` row, and the ordinary run row `execute`'s result already produces, marked
  `workerless`. The run row stays because of #101's *probe*, the one item #101 lets through
  after a fault in the Igor's setup to test whether the fault has cleared. #101 ends a probe on
  the probed item's run row, and voids the probe where the run wrote none. Keeping the row lets
  a returned failure end its probe, as it does under #101, instead of voiding it. A thrown
  failure on a probe writes no run row, so #101 voids its probe.
- **Recording a cure key:** its run row only (below).

**A failure that records a cure key never counts** (Adam, 2026-10-17). #101 records a cure key
for a fault in the Igor's own setup, such as a seat whose token is unset. #101's `work-triage`
delta says that for such a fault an item is never suppressed, that is, never held back as a
set-down item is. Such a failure keeps its ordinary run row, carrying `cures`, instead of a
`pre-worker` row. #101 builds conditions from run rows that carry a cure key and from its own
`check` rows, never from a `pre-worker` row, so a `pre-worker` row would hide the fault from
#101. *Counting* skips that run row (step 2), as it skips a `pre-worker` row an outage excludes:
the row neither counts nor breaks the sequence.

A count at or past three after a lifted deferral sets the item down on the first identical
failure. That is deliberate (spec, *In a row*; accepted by Adam, 2026-10-11): the answer that
lifted the deferral did not cure the failure, and the alternative posts three more times. An
edit or a reply leaves no row here, so the sequence carries on through it.

## What "identical" means: source and masked message

**The source is which surface's call threw**: `tracker`, `code-host`, `tree` or `igor`. `runItem`
passes `execute` its tracker, code host and tree provider through thin wrappers that tag any
error thrown out of a call with the surface's name. An error with no tag is `igor`: a bug, or
something no surface raised. The tag does not tell a surface that did not answer from one that
answered and refused this item, such as a code host refusing a branch the item already owns.
Only a second item failing tells them apart, which is why the outage rule waits for two in a
row. The same tag decides *Only a tracker or code host failing counts as the surface failing*,
since only `tracker` and `code-host` set `surfaceFailed`.

The tree provider mints its git token through the code host's credential. A mint that fails
inside a clone is still tagged `tree`, because the tag follows the interface the loop called.
That is the right answer for the outage rule: an expired clone token fails every item, and the
outage rule is about the tracker or code host not answering. A failure every item meets is caught
by its own rule instead (*A failure every item meets ends the cycle*, below).

**The message is masked before comparing.** In order:

1. The run's own working-tree path becomes `<tree>`. The code knows that path, since it
   provisioned the tree, so the mask replaces it as text wherever it appears, rather than matching
   a pattern for tree names. A pattern written for the in-force `igor-tree-` prefix would stop
   matching under `concurrent-instances` (#179), which names trees by role and rank; replacing
   the known path keeps working whatever the name holds (Adam, 2026-10-18). Because the count
   carries on across a role's ranks, trees of different ranks must mask to the same text, and
   they do.
   The path is known only if `provision` reports it: in the in-force code it makes the
   directory itself and, when the clone fails, removes it and rethrows, so the caller never
   learns it. Its random suffix is six characters that mask 2 does not catch, so each failed
   clone would give a different signature. Task 3.1 has `provision` report the path it made
   with its failure.
2. Hexadecimal runs of seven or more characters, either case, become `<hex>`. These are SHAs and
   request ids.
3. Remaining digit runs become `#`. These are exit codes, ports, counts and timestamps.

The masks run on the redacted message, never on the raw one: replacing digit and hexadecimal
runs first could break up a token's shape before the redaction can match it. The masked text is
the failure's *signature*, and the row holds it as `message` (above).

- **Rejected: a hash of the signature in the row, keyed or not** (Adam, 2026-10-19). It hid the
  text from a person reading the branch, while the in-force run row's `reason`, the transcript,
  the refusal envelope (the provider's response Igor keeps when the provider refuses a run for a
  spent usage window) and `deferred.json` carry failure text onto the same branch, so it
  protected little. One redaction over every write protects them all.
- **Rejected: the source alone.** A clone that fails on a full disk and then on an expired token
  is two failures, and a person fixing the first should not find the item set down by the
  second.
- **Rejected: the raw message.** A clone's message names its working tree's path, which differs
  between ranks and, for a temporary tree, between runs, so two failures would rarely match and
  the breaker would rarely trip.
- **Accepted risk (Adam, 2026-10-11).** Two failures whose messages differ only in a number, such
  as `HTTP 404` and `HTTP 500`, count as identical. Both are the same call failing on the same
  item, and either way the item is set down after three and comes back when answered.

## Outages: an `outage` row excludes the cycle's failures

Either cycle, `serve`'s or `igor run`'s, ends on the second surface failure in a row. When it
does, it appends:

```json
{"at": "…", "kind": "outage", "role": "web", "rank": 1, "since": "<cycle start>",
 "items": ["owner/repo#12", "owner/repo#15"],
 "failures": [{"item": "owner/repo#12", "source": "tracker", "message": "…"},
              {"item": "owner/repo#15", "source": "tracker", "message": "…"}]}
```

`failures` holds the source and the redacted, masked message of each failure the row names, so
the row is the cycle's record of its fault for #99 (`structured-failure-record`), readable on
the state branch. The masks remove a response status or exit status, which #99 asks to be
readable apart from the message; whether each entry gains a field holding it is open (the
proposal's *Still open*).

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
reply lifts, so the row gets no retry beyond the one #179 gives every state write.

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
two runs in a row, of different items, fail with the same `source` and `message`, the cycle ends.
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
message and whether it was a surface failure for the length of one cycle, which a crash loses at no
cost: the next cycle starts comparing afresh. A rank that drops out because another rank holds
the item has no failure of its own, so it leaves the previous run in place.

## Where the set-down is said

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
likely while the tracker is not answering, nothing yet says what the rank does (the proposal's
*Still open*).

The run then returns `handed-off` with `handoff: 'failure'`. That is what `shouldDefer` already
defers on, so `serve` and both loops of `igor run`'s cycle in `src/cli.ts`, over claimed items
and over catch-ups, defer it with no change to their deferral path.
