## Context

One Igor is one role with one identity: on GitHub, the role's GitHub App, which claims with the
`igor:<role>` label and a claim message. Capacity is how many processes run behind that
identity. Everything here follows from refusing to conflate the two.

## Decisions

### The marker rides in the claim message

Every claim already posts a message after setting the holder field, naming the Igor and saying
how to stop it. Processes of one role set the same label, so the message is the only part of a
claim that can say which process took it. It gains the process's rank as a machine-readable
trailer: a last line `Igor-Rank: 2`, in the form of a git trailer (Adam, 2026-10-13).

**Which claim messages count** (Adam, 2026-10-13). Among processes of one role, the earliest
claim message holds the item. Messages from before the item's latest release don't count: the
latest time the role's label was removed from the item, which the item's events record. Neither
do messages of ranks whose claims may be adopted: ranks no longer in the roster, and ranks that
have missed three heartbeats (*Retirement is recorded, not detected*, below). Without
that, a process taking over a dead rank's claim would always lose to the dead rank's older
message.

**A process that loses to its own role keeps the label on the item** (Adam, 2026-10-17). The
in-force rule has a losing Igor remove its own entry from a list-valued holder field. Processes
of one role share one label, so that entry is the winner's too: removing it releases the
winner's claim, and the winner reads the removal, made by its own bot account, as its own
release and carries on.

**Verification comes within one poll interval of the claim message** (Adam, 2026-10-17), and a
later one stands down. Verification is the re-read a settle interval after claiming. In a longer
wait, a rank with an earlier message can pass the abandonment bound, the three missed heartbeats
under *Retirement is recorded, not detected*. The verifier then leaves that rank's message out
and holds the item, and the rank returns and recovers it.

The alternative was a lease keyed by item on the state branch: cheaper to read and unambiguous
to parse. It was rejected because the state branch is a cache — losing it must cost
re-examination and never correctness — and a lease makes correctness depend on it. The tracker
is the source of truth for what is claimed, and a claim marker is a fact about what is claimed.

A trailer rather than prose, so the protocol does not depend on parsing a sentence someone may
reword.

### Ordering is the surface's sequence key, never a timestamp

GitHub returns comment times to the second. Sibling processes on one poll interval wake
together and claim inside the same second, so "the earliest claim wins" is a tie exactly where
the tiebreak is needed — and with identical intervals, simultaneity is the normal case rather
than a rare race.

Comment ids ascend strictly with creation. Measured on three comments spanning an hour:
5673068718, 5673143226, 5673525664. The id is a total order the timestamp is not.

`work-claiming` already required resolution to "rely on the storage order of writes". This is
that requirement meant literally; the drift to a clock happened in prose, not in the decision.

### Rank is given by the supervisor

A process is told its rank when it is started. It is not discovered, negotiated, or counted —
rank 3 waits its turn whether or not a rank 2 exists, and a gap costs only the wait.

Every supervisor already has stable slot identity, because the problem is generic: systemd
template instances, StatefulSet ordinals. A parent process that spawned Igors and assigned ranks
would be a coordinator — a single point of failure that itself needs supervising, and the thing
this design refuses everywhere else.

**Under systemd the rank is in the instance name** (Adam, 2026-10-13). One template unit runs as
`igor@<role>.<rank>`, such as `igor@generalist.2`, and passes the instance to
`igor serve <role>.<rank>`, which splits it. `igor serve <role>`, with no rank, is rank 1, so an
existing `igor@generalist` unit keeps working as rank 1. The rank is an argument rather than an
environment variable because systemd cannot set a variable from part of an instance name.

**A shell wrapper loads the role's credentials** (Adam, 2026-10-13). Every rank of a role reads
one file, `/etc/igor/<role>.env`. systemd has no specifier for the part of an instance name
before a dot, so `EnvironmentFile=/etc/igor/%i.env` would name `generalist.2.env`. Instead,
`ExecStart` runs `/bin/sh -c`: the script takes the role from the instance name, loads the role's
file into its environment, and `exec`s `igor serve` with the instance. Task 1.3 gives the exact
lines. Only the instance name is passed as an argument, so no credential appears in a process's
argument list, where any user on the host can read it.

The script loads the file with the shell's dot command, `. "/etc/igor/<role>.env"`, not with
systemd's `EnvironmentFile=`, so the file must be valid shell: `KEY=value` lines, with a value
holding spaces or newlines in quotes. If the file is missing, the dot command fails and the unit
does not start.

Note the layering: the `claude -p` worker is not an Igor. It is one short-lived subprocess per
item with no identity, no claim, and no rank. The Igor is the long-running process that polls.

### Rank is a starting offset, and a delay only when it must be

Given roughly the same candidate list, rank 1 starts at the first item, rank 2 at the second.
Where there are at least as many items as processes, nothing collides and nothing waits.

Where there are not, rank k waits `k-1` settle intervals and then **reads before claiming**.
Seeing the item taken, it moves on silently.

This is what a shuffle cannot do. A shuffle makes a collision less likely; a lower rank that
looks first makes the retraction impossible. The cost of a collision was never the wasted
request — it was the claim-and-retract comment landing on somebody's issue, which is noise
aimed at exactly the people the claim exists to reassure.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is what a lower rank waits for, so it is not a second number to keep in
agreement with the first.

Capacity is therefore consumed in rank order — the same shape as a seat pool taking the first
with headroom. A thin queue leaves the highest ranks idle, which is correct.

### A claim is recovered by identity, not by waiting

A sibling can observe only how old a claim is, and a progress-bounded worker has no maximum
duration, so no age is ever conclusive. Making the marker the rank replaces the question.

Rank 2 restarts, finds a claim marked rank 2, and knows its predecessor is dead, because only
one rank 2 runs at a time. It takes the item back and re-works it from scratch — the
predecessor's working tree is gone, and a tree that survived a crash is debris rather than a
checkpoint, since the worker's context died with its process.

Rank 3 finds a claim marked rank 2 and leaves it, because rank 2 will recover it.

**Duplicate rank is an operator invariant and cannot be handled.** A live twin and a dead
predecessor are indistinguishable: two rank-2 processes each read the other's claim as an
abandoned predecessor and take it in turn, continuously. Adding a boot generation to the marker
does not help — each still reads the other as a dead earlier generation. Only liveness separates
the cases, and tracking liveness is what this design does without. So it is declared and
validated like a seat id, and the claim message names the rank so a violation is visible on the
item rather than silent.

### Retirement is recorded, not detected

Retiring a process is a decision, so there is nothing to detect. A crash is not retirement: the
supervisor restarts the process and it recovers its own claim.

The roster — the ranks each role may run — is declared configuration in `igor.config.yaml`,
like seats and pools. The supervisor starts processes and the roster says which may run: a
process whose rank the roster lacks refuses to start, so the two cannot silently disagree. A claim
held by a rank outside it is adoptable by anyone, so scaling down releases the orphan on the
next cycle, and the human action is the edit already being made.

Counting instances at runtime would be a registry. Being told what exists is configuration.

An abandonment bound backs up the restart and the roster, for the one case neither covers: a
rank left in the roster that no longer runs.

**Each rank writes a heartbeat** (Adam, 2026-10-13). Every process overwrites its own small file
on the state branch, `heartbeats/<role>.<rank>.json`, holding the time it wrote it by its own
clock, once every poll interval. It keeps doing so while a worker runs, from a timer beside the
run rather than from the cycle. Its first heartbeat lands before its first cycle (Adam,
2026-10-17): until then its file shows only its predecessor, who may have been gone long enough
for a sibling to leave out the new process's claim message. **A rank is gone when it has missed
three heartbeats**, three of its role's poll intervals, 30 minutes at the default 10-minute
poll. The bound is that fixed multiple of the poll interval; it has no setting of its own. Any
process of the role may take a gone rank's claims.

A heartbeat rather than a record written once per cycle, such as a line in `decisions.ndjson`,
because a process works its items inside the cycle: a per-cycle record goes quiet for as long as
a run lasts, and a run longer than the bound would make a working rank look gone. The heartbeat
keeps a working rank counted, which is what makes the `work-claiming` scenario *The bound does
not shorten a run* true.

**Each process judges a sibling gone by watching its heartbeat, not by the file's age** (Adam,
2026-10-17). A heartbeat counts only when it moves forward: when the file holds a later time
than any this process has read from it. Each process keeps in its own memory, per sibling, the
latest time it has read and the moment it last saw that time move forward. It counts the sibling
gone once three poll intervals pass after that moment, or after its own start if that is later.

- **A lost, reset or rolled-back state branch moves no heartbeat forward.** A missing file, and
  a file older than one already read, only let the count run on from the sibling's last real
  heartbeat. A live rank rewrites its file within one poll interval, so its count restarts long
  before three. A crashed rank is still recovered three intervals after its last real heartbeat.
- **No two hosts' clocks are compared.** A file's times are compared only with earlier times
  from the same file, written by the same rank's clock. The watcher's own poll intervals measure
  the three.
- **A restart forgets the counts** and starts every sibling's afresh, which postpones a gone
  verdict by up to three poll intervals and never hastens one. Storing the counts on the state
  branch would put them beside the files whose loss they exist to survive.

This replaces judging by the file's age, which the model showed a rollback defeats: an old
commit leaves every file present and old, so every live rank looks gone at once, and its claims
are adopted while it works them. It also replaces the earlier rule that a missing file starts
the clock when first noticed, which it generalises from missing files to stale ones.

**Heartbeats are read before each claim decision** (Adam, 2026-10-17): before choosing a
candidate and again before verifying, not once a cycle. A cycle includes its worker runs, so a
read from its start can be older than the bound when the cycle reaches its next candidate, and
a sibling that restarted after the read would still look gone.

**A rank that cannot write its heartbeat stands down** (Adam, 2026-10-17). After two poll
intervals without a heartbeat landing, as in an outage or under a rate limit, a process starts
no claim and stops its running worker at the worker's next checkpoint, leaving the claim. It
resumes once a heartbeat lands. A worker reaches a checkpoint at least once a poll interval
(task 4.15 makes sure of it). Two is one fewer than the three a sibling waits, so the process
has stopped before any sibling may count it gone and take its claims. The claim stays because a
process that cannot write to the state branch may not be able to write to the tracker either; a
sibling takes it over once the rank is gone.

**Taking over a gone rank's claim releases the item first** (Adam, 2026-10-17). The taker
removes the role's label and adds it again before posting its claim message. Without that, the
gone rank's earlier message stays the earliest since the latest release, counts again once the
rank returns, and the returning rank takes the item back as its own while the taker works it.

One file per rank means a write replaces only that rank's own heartbeat. It does not avoid write
conflicts: a write to any path on the state branch is rejected while another write moves the
branch (see *State becomes append-only*). A rejected heartbeat is retried like any other write,
and a retry cannot overwrite a sibling's file.

The bound governs how long an *unattended claim* may sit, never how long *work* may run.

### State becomes append-only

Retrying a conflicted write is mandatory, not a choice. Measured against the Contents API: two
concurrent writes to **different paths** on one branch return 409 — `is at f3b1c59… but
expected 93283b5…` — because the conflict is on the branch ref, not the blob. Per-process files
buy nothing. A retry once the ref settles succeeds.

So the only question is whether retry is *correct*. `discovery.json` and `deferred.json` are
both folds, so each becomes a log replayed on read. `deferred.json` keeps the last record per
item. `discovery.json` keeps, for each source, the lowest of the ranks' latest marks, as the next
section says. Retrying then means re-reading and re-appending the same line: order
independent, incapable of clobbering. Retrying a keyed map means re-applying a semantic change
to a base that moved, and the naive form of that — reissuing the same bytes with a fresh sha —
destroys whatever the other writer just recorded.

Append-only is the mechanism, not the contract. A surface with a real append primitive would
meet the same requirement differently.

### The replayed watermark is the lowest live rank's

Decided by Adam, 2026-10-13. Each line of the `discovery.json` log names its source, its rank and
its mark. The replay takes each rank's latest mark for a source, and uses the lowest of those
from ranks that still count. A rank past the abandonment bound stops counting. When no rank
counts, such as after every process of a role has been down past the bound, the replay uses the
lowest of every rank's latest mark rather than starting cold: a cold start would triage every
issue of the last 7 days (`COLD_START_DAYS`) again.

The two errors cost different things. A mark too low makes a process triage some items again. A
mark too high skips items a sibling has not yet taken, and nothing brings those items back until
the issue is updated again, such as by a new comment. Taking the lowest of every mark ever written would never advance, which is
why only each rank's latest counts, and a rank that stopped running would hold the mark down
forever, which is why the bound ends its say.

**A cycle appends its mark only after attempting every candidate** (Adam, 2026-10-17). A cycle
that stops early, because its budget runs out or its process stands down, appends a mark below
the update time of the oldest candidate it did not attempt. A mark appended right after triage
passes every item the cycle meant to take, and a crash before the
claims would leave those items untaken below every mark. This was true with one process too:
the save today happens before the claims.

**Every cycle also considers every item carrying its role's label** (Adam, 2026-10-17), whatever
the mark. A crashed rank's claimed item can sit below every mark: a sibling saw it while the rank
still counted, passed it as held, and marked past it, and the crashed rank's own lower mark
stopped counting once the rank was gone. Without this, nothing offers the item again, and the
claim is never recovered.

PR #101 (`condition-backoff`, not merged) re-reads `discovery.json` before saving and writes only
the saving cycle's own sources, so roles no longer put back each other's marks. Two processes of
one role still write the same source, and there the later save wins. Task 5.1 replaces that save
with the log, whether or not #101 has merged by then: an append overwrites nobody's marks, so
the log protects other roles' marks as #101's re-read does.

### The tree sweep goes by rank, and the ceiling goes

A working tree's name carries its role and rank. At startup a process removes the trees of its
own role and rank, which its dead predecessor left, and those of ranks the roster no longer
declares. It never removes another declared rank's, so it needs no age (Adam, 2026-10-13). It
leaves a gone rank's trees too: a sibling may take a gone rank's claims, but deleting a tree
that is still in use corrupts a run, and leaving one costs only disk.

Adam decided on 2026-10-13 to remove `ABSOLUTE_CEILING_MS` entirely, including the worker's
6-hour kill.

**What bounds a worker once the ceiling is gone** (Adam, 2026-10-13). The silence windows kill a
worker whose stream goes quiet. A worker that keeps emitting events and never finishes is not
killed by any limit; that is accepted. Two things contain it instead. A person can stop it: a stop
is honoured mid-run at the next checkpoint (`surface-adapter`, scenario *Stop is detected during
long execution*). And the seat's reserve line, from `budget-pacing` (#143), stops new items once
the seat's spend crosses it, so a runaway worker cannot draw others after it. `budget-pacing` is
not built; until it is, the stop alone contains such a worker, and this change does not wait for
it.

**A probe lapses on heartbeats** (Adam, 2026-10-13). PR #101, which builds `condition-backoff`
and is not merged, lets one item through after a recurring fault stops a role or seat, to test
whether the fault has cleared: a probe. It lapses a probe that never ends after `SWEEP_AFTER_MS`,
the ceiling plus an hour. Under this change a probe records its rank, and lapses when that rank
misses three heartbeats, as any work of a gone rank does. Whichever of #101 and this change's
build lands second makes that edit (task 4.9).

## Roads not taken

**A shuffled candidate order.** Reduces collisions probabilistically and still produces
retractions. Ranking removes them.

**Per-process state files.** Measured false: the conflict is on the ref.

**A heartbeat on the claim.** The working process periodically edits its own claim comment, so
its `updated_at` means "alive as of a minute ago". Rejected in favour of the per-rank heartbeat
on the state branch: an edit every poll interval is a schedule of writes on somebody's issue, and one
file per rank covers every claim the rank holds.

**Partitioning work between processes.** Removes the race rather than resolving it, and needs a
coordinator.

**Knowing how many processes are running.** Nothing needs the number.

## What the model proves

[`model/ConcurrentInstances.tla`](model/ConcurrentInstances.tla) models this change in TLA+, and
CI runs TLC, the TLA+ model checker, on it (`.github/workflows/tla-concurrent-instances.yml`).

**TLC finds no violation in the change as specified.** The model's first run found eight ways the
change, as first written, let two processes work one item, lost an item, or never recovered a
crashed rank's claim. Adam decided each on 2026-10-17, and added a ninth rule, for a rank that
cannot write its heartbeat. The requirements now carry all nine decisions. Each decision is a constant in the model, TRUE in the change as specified:
`ConcurrentInstances.cfg` and `ConcurrentInstancesLiveness.cfg` set every one TRUE, and pass. Each
file in `model/negative/` sets one FALSE and checks only the property that breaks without it;
TLC finds that violation, which shows the decision is needed. CI checks both: the three configurations beside the model must pass, and every negative file
must fail.

### Invariants and properties

| Name | Requirement it proves | What it says |
| --- | --- | --- |
| `NoTwoWorkers` | *A claim names the process that took it*; *Assignment expresses a claim; ordering resolves it* | Never two live workers on one item. |
| `LiveRankNeverGone` | *A retired rank does not hold its items forever*, scenarios *The bound does not shorten a run*, *A lost state branch takes no live rank's claim* and *A rolled-back state branch takes no live rank's claim* | A live rank's claim is never taken: no other process judges gone a running rank that has written its heartbeat since it started and has not stood down. |
| `MarkNeverPassesUntaken` | *Processes saving one source keep the lower watermark* | The replayed mark never passes an item no live process has taken: such an item is among some live process's candidates this cycle, or above the mark some live process would replay. |
| `OrphanRecovered` (liveness) | *A process recovers the claims of its own predecessor*; *A retired rank does not hold its items forever*; *Every cycle considers the items its role's label holds* | A crashed rank's claims are eventually recovered: a labelled item that no running process holds is eventually worked again or released. |
| `EveryItemHandled` (liveness) | *Processes saving one source keep the lower watermark*, with *A process recovers the claims of its own predecessor* | Every item is eventually finished or stopped. |
| `StopNeverLost` (liveness) | *Stop is unconditional and open to anyone*, already in `openspec/specs/work-claiming`, not added by this change | A stop is never lost: eventually no worker runs on the item and its label is off, for good. |

The liveness properties hold in behaviours where some process is eventually always running.

*A conflicted state write discards nothing*, with the scenario *A heartbeat replaces only its own
rank's*, is assumed rather than proved. It says a rejected write is retried and lands the same line,
so the model treats a conflict as a delay before the write lands, during which a crash can lose it.

*Contention is resolved before a claim, not after it* is not checked at all. It decides which
process posts a claim message, not whether two processes work, and the model does not time the
rank-proportional wait.

### Each decision, and what breaks without it

Each line gives the constant, its file in `model/negative/`, and what TLC finds with it FALSE.

1. **Heartbeats are read before each claim decision** (`ReReadHeartbeats`,
   `NoReReadHeartbeats.cfg`). With one read a cycle, a sibling that restarts after the read stays
   gone to the reader for the rest of its cycle, and the reader adopts the sibling's new claim.
   TLC: `LiveRankNeverGone` violated.
2. **The first heartbeat lands before the first cycle** (`HeartbeatFirst`,
   `NoHeartbeatFirst.cfg`). A rank that restarts after more than three intervals down claims while
   its siblings still count it gone; a sibling verifying a claim on the same item leaves its
   message out, and both work the item. TLC: `NoTwoWorkers` violated.
3. **Taking over a gone rank's claim releases the item first** (`ReleaseOnTakeover`,
   `NoReleaseOnTakeover.cfg`). Otherwise the gone rank's message stays the earliest since the
   latest release; when the rank returns, it takes the item back while the taker works it. TLC:
   `NoTwoWorkers` violated.
4. **Verification comes within one poll interval** (`VerifyWithinPoll`, `NoVerifyWithinPoll.cfg`).
   A later verification leaves out the message of a rank that has gone in the meantime, and the
   rank returns and recovers the item. TLC: `NoTwoWorkers` violated.
5. **A process that loses to its own role keeps the label on the item** (`LoserKeepsLabel`,
   `NoLoserKeepsLabel.cfg`). Removing it releases the winner's claim; the winner carries on, and
   the loser claims the unlabelled item again. TLC: `NoTwoWorkers` violated.
6. **A cycle appends its mark after attempting every candidate** (`MarkAfterAttempts`,
   `NoMarkAfterAttempts.cfg`). A crash between an early mark and the claims leaves items below
   every mark. TLC: `MarkNeverPassesUntaken` violated.
7. **Every cycle considers every labelled item** (`LabelSweep`, `NoLabelSweep.cfg`). A crashed
   rank's claim can sit below every mark once its own lower mark stops counting. TLC:
   `OrphanRecovered` violated.
8. **A sibling is gone only once its heartbeat has not moved forward for three polls, as this
   process watched it** (`WatchAdvance`, `NoWatchAdvance.cfg`). Judged by the file's age instead,
   a state branch rolled back to an old commit makes every live rank look gone at once. TLC:
   `LiveRankNeverGone` violated.
9. **A process that cannot write its heartbeat for two intervals stands down**
   (`StandDownOnMisses`, `NoStandDownOnMisses.cfg`). Without it, a live rank whose heartbeats fail
   for three intervals keeps working while its siblings count it gone. TLC: `LiveRankNeverGone`
   violated.

### Bounds and results

All runs use two ranks, both declared, an abandonment bound of three poll intervals, and TLC 2.19
from `tla2tools.jar` v1.7.4. Time is unbounded: the model caps at the bound its counts of polls
since each sibling's heartbeat moved forward, and of intervals since each process's own last
heartbeat.
A lost branch in these runs may also be a rollback to an old commit.

In CI, each must pass:

| Configuration | Items | Environment | Checks | Result | Distinct states | Time |
| --- | --- | --- | --- | --- | --- | --- |
| `ConcurrentInstances.cfg` | 2 | 1 crash, 1 lost or rolled-back branch | invariants | no violation | 7,752,928 | 41 s |
| `ConcurrentInstancesMisses.cfg` | 2 | 3 missed heartbeats | invariants | no violation | 55,116,793 | 4 min 40 s |
| `ConcurrentInstancesLiveness.cfg` | 1 | 1 crash, 1 stop | invariants and liveness | no violation | 1,362,187 | 3 min 30 s |

Times are on 4 TLC workers. Each file in `model/negative/` finds its violation within about a
minute on one worker, which is how CI runs them.

Two runs outside CI's bounds found no violation, and neither is a proof:

- **Liveness with two missed heartbeats**, as `ConcurrentInstancesLiveness.cfg` with
  `MaxMisses = 2`, did not finish in 45 minutes. Its last completed liveness check covered about
  18 million distinct states.
- **Three ranks**, as `ConcurrentInstances.cfg` with a third rank and two missed heartbeats, ran
  as TLC's random simulation for ten minutes and checked 522,251,826 states in behaviours up to
  100 steps long.

To reproduce a run, download `tla2tools.jar` from the TLA+ release v1.7.4
(`https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar`) into `model/`, and
from `model/` run:

```sh
java -cp tla2tools.jar tlc2.TLC -workers auto -config ConcurrentInstances.cfg ConcurrentInstances.tla
```

A negative file runs the same way, as `-config negative/NoLabelSweep.cfg`.

### What the model assumes

Adam accepted these on 2026-10-17.

- **A stop on an item whose holder is down is answered by the next process that reaches the item**,
  which releases the claim. That holder is that process's own predecessor, or a gone rank.
- **A label removed by the role's own bot account does not stop a running worker.** The in-force
  rules call that removal the Igor's own release and say nothing more.
- **Triage says proceed** for every candidate that is not finished.
- **A stop is permanent.** No go-ahead or cooldown follows it.
- **The roster does not change** while the model runs.
- **A claim-and-retract is acceptable.** A sibling that reads a claim between its label and its
  message posts a message of its own, and one of the two stands down. No invariant forbids it.

The model also assumes:

- **A rank's heartbeat times move forward on its own clock.** A rank runs on one host, so each
  write holds a later time than the last; no two hosts' clocks are compared.
- **A claim is visible at once.** The settle interval's length is not modelled.
- **A stood-down process's worker reaches a checkpoint within one poll interval**, as the
  requirement says. That is what lets it stop before a sibling counts it gone.

## Since review: the reserve becomes a line checked against a stream reading (2026-09-28)

Recorded 2026-09-28. This changes no requirement or task here.

Adam decided that a seat's reserve is a line that rises toward the reset, checked against the
seat's latest unreset stream reading ([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file may
set its own reserve. It is specified on [#143](https://github.com/adamstallard/igor/pull/143) and
not built. Its accepted cost is that Igor sees its own spend only in the next reading, so each Igor can
overshoot the line by at most one run.

The proposal's *Per-process budget* says concurrency "spends faster without spending
differently", because the gate is checked before each item. Under the line that stops being quite
true. Each process checks the gate before its own item, and none of them sees the others' runs
until a reading arrives. So the overshoot is one run per process, not one run per Igor, and N
ranks can start N runs past the line before any of them reads it. This is the same slack #143
leaves open for several Igors on one seat, and it would be settled with that. Nothing needs to be
decided here before then.
