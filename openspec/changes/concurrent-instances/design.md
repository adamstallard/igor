## Context

One Igor is one role with one identity: on GitHub, the role's GitHub App, which claims with the
`igor:<role>` label and a claim message. Capacity is how many processes run behind that
identity. Everything here follows from refusing to conflate the two.

## Decisions

### The marker rides in the claim message

Every claim already posts a message after setting the holder field, naming the Igor and saying
how to stop it. Processes of one role set the same label, so the message is the only part of a
claim that can say which process took it. It gains the process's rank as a machine-readable
trailer: a last line `Igor-Rank: 2`, in the form of a git trailer.

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

**Under systemd the rank is in the instance name** (Adam, 2026-10-13). The unit runs as
`igor@<role>.<rank>`, such as `igor@generalist.2`, and passes the instance to
`igor serve <role>.<rank>`, which splits it. `igor serve <role>`, with no rank, is rank 1, so an
existing `igor@generalist` unit keeps working as rank 1. The rank is an argument rather than an
environment variable because systemd cannot set a variable from part of an instance name.

The unit reads `/etc/igor/<role>.env` for the App's credentials, one file for every rank of the
role. systemd has no specifier for the part of an instance name before a dot, so `%i.env` would
name `generalist.2.env`; how the unit names the role's file is an open question below.

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
rank left in the roster that no longer runs. **A rank is gone when it has recorded no cycle for
three of its role's poll intervals**, 30 minutes at the default 10-minute poll (Adam,
2026-10-13). The bound is that fixed multiple of the poll interval; it has no setting of its own.
Any process of the role may take a gone rank's claims. So every cycle has to be recorded with its
role and rank on the state branch, including a cycle that found nothing; where, and how a
process working one long item keeps recording, is open question 3.

The bound governs how long an *unattended claim* may sit, not how long *work* may run.

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
from ranks that still count. A rank past the abandonment bound stops counting.

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
declares. It never removes another declared rank's, so it needs no age, and nothing in this
change depends on the absolute ceiling any more; PR #101 does (open question 5). Adam decided on 2026-10-13 to remove `ABSOLUTE_CEILING_MS`
entirely, including the worker's 6-hour kill.

What still bounds a worker: the silence windows kill one whose stream goes quiet. Nothing kills a
worker that keeps emitting events and never finishes. Nor does the abandonment bound stop such a
worker: it lets another process take the claim, and the original worker keeps running. That is an open question
below, not a decision.

## Open questions

1. **How does the unit read `/etc/igor/<role>.env` from the instance `<role>.<rank>`?** systemd
   cannot take the part before the dot. Options: start through `/bin/sh -c`, which sources the
   role's file and then runs `igor serve`; a per-rank file, `/etc/igor/<role>.<rank>.env`,
   linked to the role's; or name units `igor-<role>@<rank>`, where `%j` is the role, which drops
   `igor@<role>.<rank>`.
2. **What stops a worker that never finishes?** With the ceiling gone, only the silence windows
   bound a worker, and a worker that emits events at intervals satisfies them forever.
3. **How is a cycle recorded, and does a long run make its rank look gone?** `decisions.ndjson`
   skips cycles that decided nothing, so as it stands it cannot be the record; a record of its
   own costs a commit to the state branch per rank per poll. And a process works its items inside
   the cycle, so it records no cycle while a worker runs. A run longer than 30 minutes would then
   make its rank gone, a sibling would take its claim, and the original worker would go on and
   could publish too. That breaks the `work-claiming` scenario *The bound does not shorten a run*,
   which stands as written until this is answered. Either a working process records that it is
   alive while its worker runs, or the bound applies to runs.
4. **What mark applies when no rank counts?** After every process of a role has been down past
   the bound, no rank's mark counts, and discovery would start cold, looking back the 7 days
   (`COLD_START_DAYS`) it gives a source with no mark. The alternative is the lowest latest mark of
   any rank.
5. **What does PR #101's probe lapse on?** After a fault stops a role or seat, `condition-backoff`
   lets one item through to test whether it has cleared: a probe. A probe that never ends lapses
   after `SWEEP_AFTER_MS`, the ceiling plus an hour, which removing the ceiling removes. It needs
   an answer before task 4.6 is built.

## Roads not taken

**A shuffled candidate order.** Reduces collisions probabilistically and still produces
retractions. Ranking removes them.

**Per-process state files.** Measured false: the conflict is on the ref.

**A heartbeat on the claim.** The working process periodically edits its own claim comment, so
its `updated_at` means "alive as of a minute ago". It is the only mechanism that makes runs
unbounded *and* recovery immediate, and it is ten lines. Held in reserve rather than built,
because identity already covers restart and the roster covers retirement, and a heartbeat that
is not needed is a schedule of writes on somebody's issue.

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
