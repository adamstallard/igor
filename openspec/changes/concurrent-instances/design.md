## Context

One Igor is one named teammate with one account. Capacity is how many processes run behind that
name. Everything here follows from refusing to conflate the two.

## Decisions

### The marker rides in the claim message

Every claim already posts a message, added so a surface showing one shared identity can still
say *which* Igor holds something. It gains the process's rank as a machine-readable trailer.

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
template instances, StatefulSet ordinals. Reading `IGOR_RANK` from the environment takes the
answer from the layer that has it. A parent process that spawned Igors and assigned ranks would
be a coordinator — a single point of failure that itself needs supervising, and the thing this
design refuses everywhere else.

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

The roster — the ranks that exist — is declared configuration, like seats and pools. A claim
held by a rank outside it is adoptable by anyone, so scaling down releases the orphan on the
next cycle, and the human action is the edit already being made.

Counting instances at runtime would be a registry. Being told what exists is configuration.

An abandonment bound backs both up: a claim unattended longer than it may be taken by anyone.
This is not the wall-clock cap that was removed. That capped how long *work* may run; this
bounds how long an *unattended claim* may sit, by which time the work has finished or the
process is dead. Nothing is cut short, so the number can be generous, and it catches the one
case the roster cannot — a rank left in it that no longer runs.

### State becomes append-only

Retrying a conflicted write is mandatory, not a choice. Measured against the Contents API: two
concurrent writes to **different paths** on one branch return 409 — `is at f3b1c59… but
expected 93283b5…` — because the conflict is on the branch ref, not the blob. Per-process files
buy nothing. A retry once the ref settles succeeds.

So the only question is whether retry is *correct*. `discovery.json` and `deferred.json` are
both folds — the newest timestamp per source, the last record per item — so each becomes a log
replayed on read. Retrying then means re-reading and re-appending the same line: order
independent, incapable of clobbering. Retrying a keyed map means re-applying a semantic change
to a base that moved, and the naive form of that — reissuing the same bytes with a fresh sha —
destroys whatever the other writer just recorded.

Append-only is the mechanism, not the contract. A surface with a real append primitive would
meet the same requirement differently.

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
