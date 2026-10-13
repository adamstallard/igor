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
on the state branch, `heartbeats/<role>.<rank>.json`, holding the time it wrote it, once every
poll interval. It keeps doing so while a worker runs, from a timer beside the run rather than
from the cycle. **A rank is gone when it has missed three heartbeats**: its file is older than
three of its role's poll intervals, 30 minutes at the default 10-minute poll. The bound is that
fixed multiple of the poll interval; it has no setting of its own. Any process of the role may
take a gone rank's claims.

A heartbeat rather than a record written once per cycle, such as a line in `decisions.ndjson`,
because a process works its items inside the cycle: a per-cycle record goes quiet for as long as
a run lasts, and a run longer than the bound would make a working rank look gone. The heartbeat
keeps a working rank counted, which is what makes the `work-claiming` scenario *The bound does
not shorten a run* true.

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

## Open questions

1. **Does a lost state branch make every rank look gone?** The heartbeats live on the state
   branch, which `work-discovery` treats as a cache whose loss costs re-examination, never
   correctness. If the branch is lost or reset, every heartbeat goes with it, and each rank looks
   gone until it next writes one: up to one poll interval. A sibling reading in that window may
   adopt a live rank's claim, and two workers then run one item. The rank-in-the-claim decision
   above rejected a lease on the state branch for the same reason. Options: a rank with no
   heartbeat file at all counts as alive rather than gone, so only a stale file means gone; or
   accept the window.

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
