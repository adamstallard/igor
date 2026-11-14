# Design

## Where the count lives: rows in the execution log

**The count is rebuilt from `executions.ndjson`.** No store of its own holds it. Each failure
before the worker appends one row, and the count is read back from the rows when the next such
failure happens.

```json
{"at": "…", "kind": "pre-worker", "item": "owner/repo#12", "role": "web",
 "cycle": "<start id>:<cycle count>", "source": "tree", "exitCode": 128,
 "cured": false, "fingerprint": "<SHA-256 of the masked message, hex>"}
```

**The row holds structured fields and no message text** (the proposal's
decision 15). The state branch is as visible as its repository, so on a public repository anyone
can read the row.

- `source` is which surface's call threw: `tracker`, `code-host`, `tree` or `igor`.
- `httpStatus` or `exitCode` holds the failure's status, where it has one. #99
  (`structured-failure-record`) asks for that status to be readable apart from the message.
- `cured` says whether the run recorded a cure key. A cure key is the name #101 records for a
  fault in the Igor's own setup, saying what would fix it, such as `seat:<id>:token` for a seat
  whose token is unset.
- `fingerprint` is an unkeyed SHA-256 of the failure's masked message (*What "identical" means*,
  below). It exists to match repeats. Being unkeyed, it does not hide a message: someone who
  guesses a masked message can confirm the guess. A secret shorter than 8 characters, which
  credential redaction does not register, stays in the masked text: an accepted limit, in
  `work-claiming`'s decision record.

The failure's full message goes to the Igor process's own log on its server, which the server's
journal keeps, after credential redaction. That rule is `task-execution`'s requirement
*Credential redaction replaces every credential the Igor knows*, added for
[#213](https://github.com/adamstallard/igor/issues/213) by pull request #217; the requirement
says what the rule matches. #217 builds the rule's function, `redact`, before this change's code
(the proposal's decision 14).

A failure that records a cure key writes its `pre-worker` row, with `cured: true`, and also its
ordinary run row in the execution log, the row without a `kind` that every run writes, whose
`cures` field lists the cure keys.
#101 builds its conditions from run rows that carry a cure key, never from a `pre-worker` row, so
the run row is what keeps the fault visible to #101. For a thrown failure that records a cure key,
the in-force code writes no run row, so this change writes one. Nothing in the in-force code gives a
throw a cure key: the handler takes cures only from a result `execute` returned
(`cures: ran?.cures ?? []` in `src/loop.ts`), and `standIn`, which builds the result of a run that threw after reaching the worker or the
host, carries none by design. Task 3.4b gives a thrown failure its cure key.
Whether a refused token mint inside a clone records one at all is unmeasured (task 0.1).

Three places could hold the count: memory, `deferred.json` and the log. `work-claiming`'s decision
record turns down the first two.

- **Chosen: rows in the log.** An append never overwrites a row another process wrote:
  `appendRecord` reads the day's file and writes it back with one line added, and the code host
  refuses the write if the file changed since the read. The refused append is then lost unless
  something retries it, and in the in-force code nothing does. #242 (`one-process-per-role`),
  which archives before this change, adds a retry: *A state write refused because the branch
  moved is retried*, re-applying the write on what the branch now holds. Task 0.3 checks that
  this retry covers appends to `executions.ndjson`. The log is already where a
  run is recorded, and #101 adds rows that are not runs, carrying a `kind`, so this adds a row
  kind rather than a mechanism. In the in-force code a failure before the worker that is thrown
  writes no row: `cli.ts` records a run only where `execute` returned a result for it, and a
  throw returns none. This row fills that gap in the record too.

The log is read only on a failure before the worker, never on a healthy run, so the breaker costs
nothing until it is needed. The log is kept on the `igor-state` branch, one file per day.
The breaker's read bypasses `readLog`'s cache for every day file dated from the day before the
reading host's own date onward, including a file dated later still that a host whose clock runs
ahead wrote. A row can land late in yesterday's file, so only older files come from the cache.
#228 (`probe-claim`) reads the log the same way where its read decides which Igor takes a probe. So after a process's
first read the breaker costs at least three requests to the code host: the list of day files,
yesterday's and today's.

**What the deferral itself uses is unchanged.** The third failure's run returns as a `failure`
handoff carrying no cures, and the existing `shouldDefer` and `noteHandoff` path writes it to
`deferred.json`. That record is a cache whose loss costs one repeated handoff. Here the loss
costs one claim and one message: the next identical failure finds a count past three and sets
the item down again.

### Counting

A *run row* is a row without a `kind`. For one item and one role, walk the rows newest first,
and apply to each row the first step that fits it:

1. Skip a `pre-worker` row that an `outage` row excludes (below). The `outage` row is looked up
   by role, cycle and item wherever it sits in the log, not met in the walk, since it can
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

**A failure that records a cure key never counts**. #101 records a cure key
for a fault in the Igor's own setup, such as a seat whose token is unset. #101's `work-triage`
delta says that for such a fault an item is never suppressed, that is, never held back as a
set-down item is. *Counting* skips both of that failure's rows (steps 1 and 2), as it skips a
`pre-worker` row an outage excludes: they neither count nor break the sequence. Such a run also
takes no part in either two-in-a-row rule (the proposal's decision 28): it is
never one of a pair, and the function that applies both two-in-a-row rules (*Both cycles apply
both rules*, below) keeps the run before it as the previous run.

A count at or past three after a lifted deferral sets the item down on the first identical
failure. That is deliberate (spec, *Only a worker start or a different counted failure starts the count again*): the answer that
lifted the deferral did not cure the failure, and the alternative posts three more times. An
edit or a reply leaves no row here, so the sequence carries on through it.

## What "identical" means: source and masked message

**The source is which surface's call threw**: `tracker`, `code-host`, `tree` or `igor`. `runItem`
passes `execute` its tracker, code host and tree provider through thin wrappers that tag any
error thrown out of a call with the surface's name. An error with no tag is `igor`: a bug, or
something no surface raised.

**Only a call that got no answer is a surface failure** (the proposal's
decision 4). The wrapper also records whether the surface answered, by the response's status, as
`unanswered` in `src/claiming.ts` does for a claim: no status at all, a 5xx, a 408, a 429, or a 403 whose
message says it is a rate limit is no answer. GitHub can answer a rate limit with a 403, so a 403
needs its message read (`work-claiming`'s decision record). Only a `tracker` or
`code-host` failure with no answer sets `surfaceFailed`, the mark on a run that the outage rule
counts. A refused call, such as a 404 for an item deleted since discovery, counts toward its own
item's breaker and toward nothing else (the proposal's decision 31). A 403 for a permission the
App lacks counts toward nothing at all, since its run records a cure key (decision 32). Two
identical refused calls on different items do not end the cycle under the identical-failure rule
either, so the in-force scenario *A refusal about the item does not stop the cycle* holds. Since a refused
call never ends a cycle, it leaves no item unreached on its account. So decision 12, which holds the discovery watermark below the items an early-ended cycle never
reached, never holds it back for a refused call. A refused call whose run records a cure key, such
as a missing App permission, holds the watermark back at its own item instead, as the
`work-discovery` delta says.

**A clone is the one working-tree call whose failure can be tagged as the code host's.** A clone that fails because
the code host did not answer is tagged `code-host`, with no answer, so two in a row end the cycle
as an outage. The tree provider also mints its git token through the code host's credential. A
mint inside a clone that gets no answer is tagged `code-host` with no answer too (the proposal's
decision 17); a refused mint stays `tree`, and counts as a working-tree failure, unless it
records a cure key (task 0.1 measures whether it does). A clone token the code host refuses fails
every item that way, and the identical-failure rule catches it (*A failure every item meets ends
the cycle*, below). git exits 128 for most failures, so how the tree provider tells that the code
host did not answer a clone is unmeasured (task 0.1).

**The message is masked before comparing**. The masks run on the message after
credential redaction, never on the raw one: replacing digit and hexadecimal runs first
could break up a token's shape before the redaction can match it. In order:

1. The run's own working-tree path becomes `<tree>`. The code knows that path, since it
   provisioned the tree, so the mask replaces it as text wherever it appears, rather than matching
   a pattern for tree names. A pattern written for the in-force `igor-tree-` prefix would stop matching under #242, for the reason `work-claiming`'s decision record gives. Replacing
   the known path as text works under any naming, so the trees of different slots mask to the same
   text.
   The path is known only if `provision` reports it: in the in-force code it makes the
   directory itself and, when the clone fails, removes it and rethrows, so the caller never
   learns it. Its random suffix is six characters that neither the hexadecimal nor the digit mask catches, so each failed
   clone would give a different signature. Task 3.1 has `provision` report the path it made
   with its failure. The tree's path is masked first, as `<tree>`, so that a tree inside the
   temporary directory does not become `<tmp>`, and one outside it is caught too, as a tree is under #175 (`worker-user`), which moves the
   trees out of the temporary directory.
   Any other path under the system's temporary directory becomes `<tmp>`.
2. Timestamps, dates and times of day, become `<time>`.
3. Hexadecimal runs of seven or more characters, either case, become `<hex>`. These are SHAs and
   request ids.
4. Item references and repository names: an issue or pull request number, `#` followed by
   digits, becomes `#<n>`; a Linear issue key, a team key of capitals and digits, a hyphen and
   digits such as `ENG-123`, becomes `<key>`; and a repository's `owner/name` becomes `<repo>`, so two items'
   failures can match (agents' decision A5).
5. Remaining runs of four or more digits become `<n>`. These are process ids, ports and counts.

Runs of three digits or fewer stay. They hold HTTP statuses and exit codes, so a 404 and a 500
from the same call are not identical. The masked text is the failure's *signature*. The row holds
its fingerprint (above), and the text itself goes nowhere: the process's log holds the message
before masking.

The rejected alternatives, the masked message as readable text in the row, the source alone,
the raw message and masking every digit run, are in `work-claiming`'s decision record.

## Outages: an `outage` row excludes the cycle's failures

Either cycle, `serve`'s or `igor run`'s, ends on the second surface failure in a row. `igor run
--claim` works one item outside any cycle, so it ends nothing and no `outage` row excludes its
failure, which counts like any run's (the proposal's decision 30). Its
`pre-worker` row has no `cycle`. When a cycle does end, it appends:

```json
{"at": "…", "kind": "outage", "role": "web", "cycle": "<start id>:<cycle count>",
 "items": ["owner/repo#12", "owner/repo#15"],
 "failures": [{"item": "owner/repo#12", "source": "tracker", "httpStatus": 503,
               "cured": false, "fingerprint": "…"},
              {"item": "owner/repo#15", "source": "tracker", "httpStatus": 503,
               "cured": false, "fingerprint": "…"}]}
```

Each entry of `failures` carries the fields of the failure's `pre-worker` row, and no message
text. The row is the cycle's record of its fault for #99 (`structured-failure-record`): it says
what failed and where, with the status readable apart from any message.

`items` names every item whose run failed before the worker in that cycle, because the spec
excludes every failure in a cycle the outage rule ended. Where one of the two surface failures
that ended the cycle came before the worker, its item is named too. Failures after the worker
are left out because only `pre-worker` rows count. A `pre-worker` row for a named item, of the
same role, whose `cycle` equals the outage row's, does not count. A cycle is named by the
process's start id and a count of its cycles; a run that ends between cycles, which #242 counts
toward the next, carries the next count, known before that cycle starts (the proposal's decision
18). Matching on the cycle, not on where the rows sit in the log, is deliberate: `serve` records a
run without waiting for the write, so the row of the failure that ended the cycle can land after
the outage row. `igor run` has its own start id, so an outage row of a served cycle never excuses
its failures, nor the other way round.

An outage row that never lands lets that cycle's failures count. The cost is a set-down that a
reply lifts, so the row gets no retry of its own, beyond what #242's retry of a refused state write covers
(task 0.3). The same holds
for any row that lands late or never (the proposal's decision 19).

**The set-down does not wait for the outage row**. A third identical failure
sets its item down during its own run. If the next run's failure then ends the cycle, the
outage row excludes the failure from later counts, but the set-down already posted stands, and
the item comes back when answered.

Where the failing run is itself the second of the two runs that end the cycle, that is known
during the run. The function both cycles call to apply the two-in-a-row rules (*Both cycles
apply both rules*, below) keeps the previous run, and `runItem` asks that function before
counting, so that run neither counts nor sets its item down.

Why the set-down does not wait for the next run is in `work-claiming`'s decision record.

A single item that meets an outage, or a failure every item meets, alone in its cycle has no
second run to end the cycle, so its failure counts. That costs it one place in its count per
such cycle, which decision 7 accepts: with one run in the cycle, nothing can tell the
item's failure from an outage, which is why both cycle rules count two.

## A failure every item meets ends the cycle

A full disk or a clone token the code host refuses fails every item before the worker, and in the working
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

**Both cycles apply both rules: `serve`'s and the single cycle `igor run` runs**, for the reason
`work-claiming`'s decision record gives. This change adds one function, which both loops call,
that applies both two-in-a-row tests.

The comparison needs nothing from the log. The function keeps the previous run's item, source,
signature and whether it was a surface failure, and starts afresh when a cycle ends; a run that
ends between cycles counts toward the next, as #242 counts it, and is that cycle's first. A crash
loses the state at no cost: the next cycle starts comparing afresh. A run that records a cure key leaves the previous
run in place, neither joining a pair nor separating one (the proposal's decision 28). Runs are
compared in the order they end, as #242 counts them. A refused call is never one of a pair
(decision 31), but it becomes the previous run, so it separates the runs on either side of it,
as a failure that is not identical does.

## Where the set-down is said

**The set-down post names the failure and quotes none of it** (the proposal's
decision 29). The item may be public. In the in-force code a failure handoff posts the raw error
message; a set-down's post instead says in plain words where the run failed, from the row's
`source`, and gives its HTTP status or exit code, such as "Setting up the working tree failed
(exit code 128)". The full message is in the process's log. A *refused run* is one that gives
the claim back for the item to be tried again next cycle, as the two failures before a set-down
do. Its post, the *refusal post*, gives the same plain words in place of the raw message,
followed by "It will try again next cycle" (the proposal's decision 29).

**A failure after the claim** is given back through `handOffFrom`, as in the in-force code. On
the third identical failure, its `failure` reason carries `next: 'set-down'`. An undirected
handoff's "It will try again next cycle" becomes the set-down sentence (`tasks.md` 3.2). A
directed handoff, whose tail is its relabel sentence alone, gets the set-down sentence first and
keeps the relabel sentence after it. Adding the label again is an edit that lifts the deferral,
so the relabel sentence already says what brings the item back.

**A failure in the claim window** is given back by `takeClaim`, and counts like any other
failure before the worker (the proposal's decision 22). On the first two failures, what it posts depends on the claim message. Where the message may have
landed, it posts `claimWithdrawn`, or `claimStuck` if the release did not clear the label; where
the message cannot have landed, it posts nothing. Either post names
the failure in plain words, as a refusal post does, and says it will try again next cycle. On the
third identical failure, it always posts one of the two, with the set-down sentence in it, and
removes the role's label, even where the claim message never landed, because that is the only
word the item gets about being set down (the proposal's decision 23). A set-down whose post fails
is refused instead of deferred (agents' decision A1).

**One set-down per deferral** (the proposal's decision 27). `igor run --claim` can claim an item
its role has set down. Before it posts a set-down, the run reads the item's record in `deferred.json`, and asks
whether a set-down of its role there has lifted. Where one has not, the run posts no set-down and gives the
claim back with the refusal, leaving out its "It will try again next cycle", which the deferral
makes untrue (the proposal's decision 27). A set-down's record in `deferred.json` is keyed by item
and role (agents' decision A2).

The run then returns `handed-off` with `handoff: 'failure'`. That is what `shouldDefer` already
defers on, so `serve`, and `igor run`'s cycle in `src/cli.ts` in both its loops, over claimed
items and over catch-ups, defer it with no change to their deferral path. One more path does
not: `igor run --claim`, on an item whose own pull request has fallen behind its base, runs
`catchUpItem`, which calls neither `shouldDefer` nor `noteHandoff`. A set-down there must defer
the item too (task 4.1).

## What lifts a set-down

**A person's change to the item, or another role's successful run on it** (the
proposal's decision 8). A successful run is one that produced the role's work, such as a pull
request it opened for the item. An Igor's other activity on the item lifts nothing: another
role's set-down post, its comments, its label. Each role is a separate Igor, so without this rule
two roles that both meet one failure would lift each other's set-downs with their own posts, and
each would claim and post every cycle with no bound.

`work-triage`'s *An item handed back is not re-worked until something answers* lifts any other
handed-back item on a reply from anyone but that Igor, or any edit. A set-down's record in
`deferred.json` says it is a set-down, so the check that decides whether a deferral has lifted
applies the narrower rule to it. A post's author, the role's GitHub App, says whether it is an
Igor's. An edit is told today by a fingerprint of the item's title, body, labels and assignees
(`src/deferred.ts`), which records no author, so until task 3.7 finds how to tell an edit's
author, any edit lifts a set-down, an Igor's included; how a role tells another role's
successful run from its other posts is task 3.7's too.

## What the model proves

[`model/PreWorkerBreaker.tla`](model/PreWorkerBreaker.tla) models the breaker in TLA+, and CI runs
TLC, the TLA+ model checker, on it (`.github/workflows/tla-pre-worker-breaker.yml`). It models one
role's serving process, its items, and each run's claim (post, verify). It models failures in the
claim window, and failures after verification that are thrown or returned, each with or without a
cure key (#101's mark of a fault in the Igor's own setup). It also models worker starts, the two
two-in-a-row rules with their `outage` rows, `igor run --claim` runs, which pair with nothing and
may claim an item already set down, set-downs lifted by a person's change or another role's
successful run, and another role's other posts on a deferred item. Rows reach the execution log
only when they land, which may be late, in any order, or never. Each set-down is checked against a
ghost record of every failure, in the order the runs decided them.

One run is modelled at a time. Under #242 a role's worker slots run at once, but each works an item
of its own, the count is per item, and the two-in-a-row rules count runs in the order they end, so
one run at a time, in that order, stands for them.

**What passes, and under what.** Each rule of the change is a constant, TRUE in the change as
specified. One switch, `PromptRows`, is an assumption, not a rule: a row about an item lands before
any run next claims the item, and before any run already on the item decides its outcome, a
failure or a worker start.

Every configuration CI runs passes every invariant it checks. All but
`PreWorkerBreakerLateRows.cfg` assume `PromptRows`; that one drops it and checks the invariants
that hold without it. Each file in `model/negative/` turns one rule off, keeps `PromptRows`, and
checks only the invariant that breaks without the rule; TLC finds that violation, which shows the
rule is needed. CI checks both kinds: the configurations must pass and the negatives must fail.
`model/findings/LateRows.cfg` fails by design (*What the assumption leaves out*, below), and CI
does not run it.

| Invariant or property | Requirement it proves (`work-claiming`) |
| --- | --- |
| `NoSetDownWithoutThree`: at least three recorded failures with the set-down's signature | *A failure before the worker that repeats sets the item down* |
| `NoSetDownWithoutThreeInARow`: three that the spec counts in a row, skipping the excluded ones | the same; *Only a worker start or a different counted failure starts the count again*; *An outage is not the item's failure*; *A fault in the Igor's own setup is not the item's failure* |
| `NoDoubleSetDown`: one set-down per deferral | *One set-down per deferral* |
| `NoSetDownWithoutAnswer`: each set-down of an item after its first follows a person's change or another role's successful run | *A set-down lifts on a person's change or another role's successful run* |
| `NoSetDownForCure`: no set-down for a failure that records a cure key | *A fault in the Igor's own setup is not the item's failure* |
| `NoCycleEndOnRefusal`: no cycle ends on a pair of refused calls | *Two identical failures before the worker on different items end the cycle* |
| `RepeatedFailureSetDown`: an item that fails the same way before the worker on every run is set down | *A failure before the worker that repeats sets the item down* |

Results on TLC 2.19 (`tla2tools.jar` v1.7.4), one JVM, 2026-11-13. `PreWorkerBreaker.cfg` is the
base: two items, three signatures (a surface failure, a refused call and a failure of the working
tree), a claim-window failure, a lifted deferral and one `igor run --claim` run. In *Checks*,
three, in a row, once, answer, cure and refusal stand for `NoSetDownWithoutThree`,
`NoSetDownWithoutThreeInARow`, `NoDoubleSetDown`, `NoSetDownWithoutAnswer`, `NoSetDownForCure` and
`NoCycleEndOnRefusal`.

| Configuration | Differs from the base by | Checks | Distinct states | Result |
| --- | --- | --- | ---: | --- |
| `PreWorkerBreaker.cfg` | (the base) | three, in a row, once, answer, refusal | 38,943,207 | pass |
| `PreWorkerBreakerReturned.cfg` | returned failures and cure keys; no claim-window failure, no directed run, no lift, four runs | every invariant | 149,167 | pass |
| `PreWorkerBreakerLateRows.cfg` | no `PromptRows`: rows late, reordered, one lost; no directed run, no lift, four runs | three, once, answer, refusal | 776,799 | pass |
| `PreWorkerBreakerLiveness.cfg` | every run fails, each item with its own signature (`Sigs` `{"a", "b"}`, no refused-call signature); rows reordered, one lost; no directed run, no lift | liveness, three, in a row, once, answer | 5,515 | pass |

Each negative configuration turns off one rule and finds a violation, as required:

| Negative | Rule turned off | Violation TLC finds |
| --- | --- | --- |
| `NoIdenticalOnly.cfg` | only identical failures count in a row | `NoSetDownWithoutThree` |
| `NoReturnedRetried.cfg` | a returned failure is retried twice (decision 25) | `NoSetDownWithoutThree` |
| `NoSkipSecondOfPair.cfg` | the run that ends its cycle as the second of a pair is not counted | `NoSetDownWithoutThreeInARow` |
| `NoOutageExcludes.cfg` | an `outage` row excludes the failures it names | `NoSetDownWithoutThreeInARow` |
| `NoCureSkipped.cfg` | the count skips a failure that records a cure key | `NoSetDownForCure` |
| `NoSetDownOnce.cfg` | no set-down on an item already deferred (decision 27) | `NoDoubleSetDown` |
| `NoIgorPostsLiftNothing.cfg` | another role's posts lift no set-down (decision 8) | `NoSetDownWithoutAnswer` |
| `NoRefusalsUnpaired.cfg` | a refused call is never one of a pair (decision 31) | `NoCycleEndOnRefusal` |

**Liveness holds within a bound on runs.** The model bounds the runs of a behaviour, so liveness
is checked as: an item that fails the same way on every run is set down before the runs run out.
Each item takes three runs, plus one for each lost row; a claim-window failure costs nothing
extra, since it counts like any other. A smaller `MaxRuns` than that makes the property fail only
because the runs run out. The liveness configuration assumes `PromptRows`; without it a row in
flight undercounts, and the bound grows with the rows in flight.

### What the assumption leaves out

- **A row that lands late, or is lost, can set an item down after fewer than three in a row**
  (`findings/LateRows.cfg`, which drops `PromptRows`): the accepted limit in `work-claiming`'s
  decision record, and the proposal's decision 19.

### What else the model includes, and what it leaves out

**A run that records a cure key takes no part in the two-in-a-row rules** (the proposal's
decision 28). In the model it forms no pair and leaves the previous run in place, so it neither
ends a cycle nor separates the two runs of a pair. **A refused call** forms no pair either
(decision 31), but becomes the previous run, so it separates the runs on either side of it. A
refused call's signatures are `RefusalSigs`.

**Not modelled:** several roles, since an item's count is kept per role, so in this model roles
share nothing; `Lift` and `OtherPost` stand for what another role does on the item. Also failures
after the worker; the masks, since a signature is a model value; a read of the count that fails,
since the spec has it count nothing and post no set-down, which can only remove set-downs; the
role's label; and the discovery watermark.

## Agents' decisions

These settle what the proposal's decisions leave open. Each is cheap to reverse.

- **A1. A set-down whose post fails is refused, not deferred.** A deferred item nobody was told
  about waits for a person who has no reason to look. Refused, the item comes back next cycle, and
  its next identical failure, at a count already past three, sets it down again and posts again.
- **A2. A set-down's record in `deferred.json` is keyed by item and role.** One record per item
  would let a second role's set-down replace the first's, and one set-down per deferral checks
  the item's record for its own role.
- **A3. The run row and deferral record of a failure before the worker carry the plain words its
  post uses, not the error message.** Decision 15 keeps message text off the state branch for the
  `pre-worker` row; the run row's `reason` and the deferral record are on the same branch, and
  credential redaction does not strip a private repository's text.
- **A4. The run row a thrown failure that records a cure key writes is marked `workerless`.**
  Without the mark, *Counting* would read it as a worker start. #101 still reads it as the run
  that ends a probe, which is right: the probe saw the fault recur.
- **A5. The masks replace item references and repository names.** The identical-failure rule
  compares failures across items, which differ in exactly those parts. Decision 33's accepted limit, a short secret, is unchanged.
- **A6. A status not on decision 4's list counts as answered**, for the reason `work-claiming`'s
  decision record gives.
- **A7. A set-down pruned from `deferred.json` is accepted.** `deferred.json` drops records after
  30 days or past 500. The pruned item is claimed again, and its next identical failure, at a
  count past three, sets it down again at once: one claim and one post per pruning.
- **A8. A cycle the identical-failure rule ends is recorded as failed,** as one the outage rule
  ends is, since its remaining items were not attempted.
- **A9. A claim the tracker refuses before its claim message posts lets the watermark pass the
  item**, as the in-force rule has it, unless its run records a cure key (the proposal's decision
  12): the item changed nothing and has nothing to retry until someone changes it.
- **A10. The in-force scenario *Busy is not a reason* no longer says budget is the only reason to
  defer.** A set-down defers too, so this change's `graceful-handoff` copy keeps #143's text and
  changes only that step.
- **A11. The set-down's lift rule is written into `work-triage`'s requirement.** A rule in
  `work-claiming` cannot override an in-force `work-triage` requirement, so this change carries a
  compacted copy of *An item handed back is not re-worked until something answers* that names a
  set-down's lifts and the test for a fact about the Igor, a cure key or exhausted budget. The
  in-force reasons for that requirement, that a handoff invites a reply so an edit alone cannot
  be the only lift, and that a rule beats an enumeration because such causes recur on every
  item, still hold and are why the copy keeps both lifts and states a test.
- **A12. The role's App-permission cure key is scoped to the role**, for the reason
  `work-claiming`'s decision record gives.
