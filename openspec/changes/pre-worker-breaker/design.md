# Design

## Where the count lives: rows in the execution log

**The count is rebuilt from `executions.ndjson`.** No store of its own holds it. Each failure
before the worker appends one row, and the count is read back from the rows when the next such
failure happens.

```json
{"at": "…", "kind": "pre-worker", "item": "owner/repo#12", "role": "web",
 "source": "tree", "signature": "git clone exited #: fatal: …", "reason": "…"}
```

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
- **Chosen: rows in the log.** Appends cannot overwrite each other. The log is already where a
  run is recorded, and #101 adds rows that are not runs, carrying a `kind`, so this adds a row
  kind rather than a mechanism. A failure before the worker writes no row today, because
  `cli.ts` records only a run with an `execution`, and this row fills that gap in the record too.

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

1. Skip a `pre-worker` row that an `outage` row excludes (below).
2. Skip a run row whose run started no worker. A run row records whether `execute` spawned the
   worker (task 3.4). Two kinds have none: a failure that recorded a cure key, whose row carries
   `cures` (below), and #101's workerless catch-up whose merge came out clean.
3. Count a `pre-worker` row whose `source` and `signature` match the failure in hand.
4. Stop at any other run row, whose run started the worker, or at a `pre-worker` row that does not
   match.
5. Skip rows of any other `kind`, such as #101's `probe` and `check` rows.

The failure in hand is one more, unless it records a cure key. At three or more, the item is set
down. A failure before the worker writes a `pre-worker` row in place of a run row, whether
`execute` threw it or returned it (a catch-up merge that fails is one it returns). The one
exception is a failure that records a cure key, which keeps its run row (below).

**A failure that records a cure key never counts** (Adam, 2026-10-17). #101 records a cure key
for a fault in the Igor's own setup, such as a seat whose token is unset. #101's `work-triage`
delta says an item is never suppressed, that is held back as a set-down item is, for such a
fault. Such a failure keeps the run row it writes today, carrying `cures`, instead of a
`pre-worker` row: #101 builds conditions from run rows that carry a cure key and from its own
`check` rows, never from a `pre-worker` row, so a `pre-worker` row would hide the fault from #101. *Counting* skips that run row (step 2), as it
skips a `pre-worker` row an outage excludes: the row neither counts nor breaks the sequence.

A count at or past three after a lifted deferral sets the item down on the first identical
failure. That is deliberate (spec, *In a row*; accepted by Adam, 2026-10-11): the answer that
lifted the deferral did not cure the failure, and the alternative posts three more times. An edit or a reply leaves no row here, so the
sequence carries on through it.

## What "identical" means: source and masked message

**The source is which surface's call threw**: `tracker`, `code-host`, `tree` or `igor`. `runItem`
passes `execute` its tracker, code host and tree provider through thin wrappers that tag any
error thrown out of a call with the surface's name. An error with no tag is `igor`: a bug, or
something no surface raised. The same tag answers the other requirement, since only `tracker`
and `code-host` set `surfaceFailed`.

The tree provider mints its git token through the code host's credential. A mint that fails
inside a clone is still tagged `tree`, because the tag follows the interface the loop called.
That is the right answer for the cycle rule: an expired clone token fails every item, and the
cycle rule is about the tracker or code host not answering. A failure every item meets is caught
by its own rule instead (*A failure every item meets ends the cycle*, below).

**The message is masked before comparing.** In order:

1. The run's own working-tree path becomes `<tree>`. The code knows that path, since it
   provisioned the tree, so the mask replaces it as text wherever it appears, rather than matching
   a pattern for tree names. A pattern written for today's `igor-tree-` prefix would stop matching
   under `concurrent-instances` (#179), which names trees by role and rank; replacing the known
   path keeps working whatever the name holds (Adam, 2026-10-18: the mask must keep working under
   #179's naming). Because the count carries on across a role's ranks, trees of different ranks
   must mask to the same text, and they do.
2. Hexadecimal runs of seven or more characters, either case, become `<hex>`. These are SHAs and
   request ids.
3. Remaining digit runs become `#`. These are exit codes, ports, counts and timestamps.

The masked text is the row's `signature`. It is kept as text, not a hash, so a person reading
the log sees what was compared.

- **Rejected: the source alone.** A clone that fails on a full disk and then on an expired token
  is two failures, and a person fixing the first should not find the item set down by the
  second.
- **Rejected: the raw message.** A clone's message names its temporary directory, which differs
  every run, so no two would ever match and the breaker would never trip.
- **Accepted risk (Adam, 2026-10-11).** Two failures whose messages differ only in a number, such
  as `HTTP 404` and `HTTP 500`, count as identical. Both are the same call failing on the same item, and either way
  the item is set down after three and comes back when answered.

## Outages: an `outage` row excludes the cycle's failures

Either cycle, `serve`'s or `igor run`'s, ends on the second surface failure in a row. When it
does, it appends:

```json
{"at": "…", "kind": "outage", "role": "web", "since": "<cycle start>", "items": ["…", "…"]}
```

`items` names every item whose run failed in that cycle, before or after the worker, including
the two whose surface failures ended it, because the spec excludes every failure in a cycle the
outage rule ended. Only `pre-worker` rows are affected, since only they count. A
`pre-worker` row for a named item and role, written at or after `since` and before the outage
row, does not count.

**The set-down does not wait for the outage row** (Adam, 2026-10-17). A third identical failure
sets its item down during its own run. If the next run's failure then ends the cycle, the
outage row excludes the failure from later counts, but the set-down already posted stands, and
the item comes back when answered.

Two other ways to keep an outage from setting an item down were rejected:

- **Rejected: delay each row, or the set-down, until the next run shows whether the cycle
  continued.** That means holding the decision in memory across items, and losing it on a crash
  or a shutdown between items.
- **Rejected: count no tracker or code-host failure at all.** Adam named a tracker or code-host
  call during the claim as a failure the breaker counts.

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
two runs in a row, of different items, fail with the same `source` and `signature`, the cycle
ends. Whichever cycle ended appends an `outage` row naming both items, the same row the surface
rule writes, so *Counting* excludes both failures with no new row kind. This does not make a
tree failure a surface failure: `surfaceFailed` still follows only the tracker and code-host
tags.

**Both cycles apply both rules: `serve`'s and the single cycle `igor run` runs** (Adam,
2026-10-17). Today the two share no cycle code: `serve` keeps its surface-failure count in
`src/serve.ts`, and `src/cli.ts` runs its own loop over the items it claims, with no surface
rule. A rule in only one of them would let the other set down the whole backlog. Without the
identical-failure rule, a full disk fails every item the same way in every cycle. Without the
surface rule, an outage fails every item's tracker call, and where the messages differ the
identical-failure rule does not end the cycle either; each failure counts, and three such
cycles set every item down. So this change adds one function, which both loops call, that
applies both two-in-a-row tests.

The comparison needs nothing from the log. The function keeps the previous run's item, source,
signature and whether it was a surface failure for the length of one cycle, which a crash loses
at no cost: the next cycle starts comparing afresh.

## Where the set-down is said

**A failure after the claim** is given back through `handOffFrom`, as today. On the third
identical failure, its `failure` reason carries `next: 'set-down'`, which replaces "It will try
again next cycle" with the set-down sentence (`tasks.md` 3.2). A directed claim keeps its
relabel sentence. Adding the label again is an edit that lifts the deferral, so that sentence is
already what brings the item back.

**A failure in the claim window** is given back by `takeClaim`, which posts `claimWithdrawn` only
where the claim message may have landed. On the third identical failure, the set-down sentence
is appended to the withdrawal. The withdrawal is then posted even where the claim message never
landed, because it is the only word the item gets about being set down. If the tracker is still
failing, that post fails too, at no cost.

The run then returns `handed-off` with `handoff: 'failure'`. That is what `shouldDefer` already
defers on, so `serve`, `cli.ts`'s single-cycle command and the catch-up loop defer it with no
change to them.
