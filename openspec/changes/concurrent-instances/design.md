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
do messages of ranks that are gone, having missed three heartbeats (*Retirement is recorded, not
detected*, below). Without that, a process taking over a dead rank's claim would always lose to
the dead rank's older message.

**A process that loses to its own role keeps the label on the item** (Adam, 2026-10-17). The
in-force rule has a losing Igor remove its own entry from a list-valued holder field. Processes
of one role share one label, so that entry is the winner's too: removing it releases the
winner's claim, and the winner reads the removal, made by its own bot account, as its own
release and carries on.

**Verification comes within one poll interval of the claim message** (Adam, 2026-10-17). A
process that reaches it later stands down. Verification is the re-read a settle interval after claiming. In a longer
wait, a rank with an earlier message can pass the abandonment bound, the three missed heartbeats
under *Retirement is recorded, not detected*. The verifier then leaves that rank's message out
and holds the item, and the rank returns and recovers it.

Without the rank in the claim message, every process of a role reads every claim as its own,
since all of them act as the role's identity and set the same label. Two processes would both
work the item and open two pull requests for one issue, the most visible misfire an Igor can make, in front of
the people the claim was meant to reassure.

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
Task 2.12 measures whether ids still ascend for claim comments several ranks post within one
second.

**A claim message is ordered against the item's latest release by timestamp** (Adam,
2026-10-17). Which messages came after the release compares a comment with a label event, and
the two have separate ids, so only their times compare, to the second. A message in the
release's second does not count, because it may have been posted before the release. A process
taking over a gone rank's claim releases the item first, by removing the label and adding it
again (*Taking over a gone rank's claim releases the item first*, below). It then waits until
that release's second has passed before posting, so that its own message always counts.

A process that claims an unlabelled item adds the label rather than releasing, so it does not
wait. Its message can still land in the second of an earlier release, such as one a sibling
made by finishing the item; that message does not count. At its verification the claimer finds
no claim message that counts, so it loses, works nothing, and leaves the label on. At the next
cycle any rank finds the item labelled with no claim message that counts, and claims it by
posting one. The model checks that this loses no item and never puts two workers on it.

On Linear, removing the label and adding it again has no counterpart yet, so taking over a gone
rank's claim is not defined there. It must be defined before a Linear adapter is built (task
2.13).

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
systemd's `EnvironmentFile=`, so the file must be valid shell. If the file is missing, the dot
command fails and the unit does not start.

**Every value in the role's file is single-quoted** (Adam, 2026-10-17). Inside double quotes the
shell expands `$`, `` ` `` and `\`, so a private key or token holding one would reach Igor
changed, and nothing would say so. The unit's comment and `docs/deployment.md` say values are
single-quoted, and a starting process refuses a double-quoted value, naming the line and the key
but never the value. The check reads the file only for its quoting: the credentials still reach
Igor only through its environment, as `role-config` requires.

**The roster is a list of ranks per role** (Adam, 2026-10-17, who asked for its key and shape to
be specified), under the top-level key `roster` in `igor.config.yaml`. A list rather than a count,
so that a rank can be retired without renumbering the ranks above it. A role the roster does not
name runs rank 1 only, so a deployment with one process per role needs no roster.

**A role's name has no dot** (Adam, 2026-10-17). A process is named `<role>.<rank>`, and
`igor serve front.end` could be the role `front.end` at rank 1 or the role `front` at a rank
named `end`. `role-config` refuses such a role file.

**A role's processes share one identity and differ only by rank** (Adam, 2026-10-17).
`role-config` and `docs/architecture.md` §2 said they were interchangeable. Under this change
they are not: the same rank takes back its predecessor's claims at once, other ranks only once
the holder is gone, and rank sets the order and the wait of contention. The `role-config` delta
says so, and task 6.3 restates the architecture passages.

Note the layering: the `claude -p` worker is not an Igor. It is one short-lived subprocess per
item with no identity, no claim, and no rank. The Igor is the long-running process that polls.

### Rank is a starting offset, and a delay only when it must be

Given roughly the same candidate list, rank 1 starts at the first item, rank 2 at the second.
A rank k with at least k candidates starts at one no lower rank starts at, and does not wait. Its
later candidates can still collide, and verification resolves those.

Where it has fewer, rank k waits `k-1` settle intervals and then **reads before claiming**.
Seeing the item taken, it moves on silently.

**Rank k contends only when it has fewer than k candidates** (Adam, 2026-10-17). With k or more,
its k-th candidate is one no lower rank starts at. With fewer, its place in the list wraps round
to a candidate a lower rank starts at, so it waits. Deciding this needs only the process's own
candidate list, never a count of the processes running.

This is what a shuffle cannot do. A shuffle makes a collision less likely. Under rank, the
higher rank waits, so the lower rank reads the item first and claims it, and the higher rank
then sees the claim and moves on. A retraction is left only where two ranks both read the item
before either has posted. The cost of a collision was never the wasted
request — it was the claim-and-retract comment landing on somebody's issue, which is noise
aimed at exactly the people the claim exists to reassure.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is what a lower rank waits for, so it is not a second number to keep in
agreement with the first.

Capacity is therefore consumed in rank order — the same shape as a seat pool taking the first
with headroom. A thin queue leaves the highest ranks idle, which is correct.

### A hand-over among one role's ranks goes through the same contest

Decided by Adam, 2026-10-17. A *hand-over* is a person adding `igor:<role>` to an issue. The
in-force rule has the Igor post and start work without the settle interval, since no other Igor
competes for an item a person has given to one of them. Among one role's ranks, every rank would
read the hand-over as its own, and each would start work.

So the ranks contend as for found work: rank k waits `k-1` settle intervals, re-reads, and posts
only if no claim message that counts is there, and rank 1 posts at once. Only a free rank
contends; a rank whose worker is running does not. Normally exactly one claim message appears,
from the lowest free rank. The rank that posts still verifies after the settle interval, so two
ranks that both post resolve by the earliest message. The no-settle rule keeps applying between
different Igors.

**A taken-over hand-over still stands** (Adam, 2026-10-17). A rank taking over a gone rank's
claim removes the label and adds it again, which replaces the person's label with the bot's.
The item would then read as one the Igor found, and the in-force rules treat the two differently
in two places. When the Igor brings its own pull request up to date (a *catch-up*) and gives its
claim back, it keeps a person's label but removes its own, so the hand-over would be lost
unanswered. And a person's "go ahead" after a stop lifts the stop on a found item but not on a
handed-over one, so a stop that should stand could be lifted. So the taker's claim
message records that the item was handed over, and the adapter reads that record as the person's
hand-over still standing.

### A claim is recovered by identity, not by waiting

A sibling can observe only how old a claim is, and a progress-bounded worker has no maximum
duration, so no age is ever conclusive. Making the marker the rank replaces the question.

Rank 2 restarts, finds a claim marked rank 2, and knows its predecessor is dead, because only
one rank 2 runs at a time. It takes the item back and re-works it from scratch — the
predecessor's working tree is gone, and a tree that survived a crash is debris rather than a
checkpoint, since the worker's context died with its process.

Rank 3 finds a claim marked rank 2 and leaves it, because rank 2 will recover it.

**A recovered claim with the Igor's pull request open is a catch-up** (Adam, 2026-10-17). A
predecessor that opened a pull request and then died leaves its claim behind. Re-working the item
would duplicate work in review, against triage's skip for work in flight. So the restarted rank
releases the claim as a catch-up releases its claim, leaving the pull request and any person's
label, and the item goes on as any item with the Igor's pull request open does.

**Duplicate rank is an operator invariant and cannot be handled.** A live twin and a dead
predecessor are indistinguishable: two rank-2 processes each read the other's claim as an
abandoned predecessor and take it in turn, continuously. Adding a boot generation to the marker
does not help — each still reads the other as a dead earlier generation. The heartbeat cannot
separate them either, since both write the same rank's file. So one process per rank is
declared and validated like a seat id, and the claim message names the rank so a violation is visible on the
item rather than silent.

### Retirement is recorded, not detected

Retiring a process is a decision, so there is nothing to detect. A crash is not retirement: the
supervisor restarts the process and it recovers its own claim.

The roster — the ranks each role may run — is declared configuration in `igor.config.yaml`,
like seats and pools. The supervisor starts processes and the roster says which may run: a
process whose rank the roster lacks refuses to start, so the two cannot silently disagree.

Counting instances at runtime would be a registry. Being told what exists is configuration.

**A rank removed from the roster is adopted only once it is gone** (Adam, 2026-10-17). A rank
can leave the roster while its process still runs, working an item, so a claim the roster no
longer covers is not yet free. Any process may take it once the rank's heartbeat has failed to
move forward for three polls, the same bound as for a declared rank that stopped running, and
its trees are swept then too. A process reads the roster at the start of each cycle. One whose
own rank has left it stands down, as *A rank that cannot write its heartbeat stands down* below
describes, and exits once its worker has stopped; the
supervisor's restart is then refused, since the rank is undeclared. The model shows that adopting
such a claim at once lets two processes work one item (`RosterWaits`).

The abandonment bound is therefore what frees any rank's claims, whether the rank crashed and
was not restarted, was left in the roster with nothing running, or was removed from it.

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

**All the role's heartbeat files are read in one request** (Adam, 2026-10-17): one read of the
state branch's tree. Every rank of a role acts as one GitHub App, so all of them share one budget of
GitHub's `core` REST rate limit, and a read per file before every candidate and verification
would multiply against it. A rate limit that stopped heartbeats would stand every rank down at
once. The tree gives each file's blob id, so a process fetches a file's contents only when its
id differs from the one it last read, which is at most once per sibling per poll interval. Task
4.19 measures the requests per cycle per rank.

**A rank that cannot write its heartbeat stands down** (Adam, 2026-10-17). After two poll
intervals without a heartbeat landing, as in an outage or under a rate limit, a process starts
no claim and stops its running worker at the worker's next checkpoint, leaving the claim. It
resumes once a heartbeat lands. A worker reaches a checkpoint at least once a poll interval
(task 4.15 makes sure of it). Two is one fewer than the three a sibling waits, so the process
has stopped before any sibling may count it gone and take its claims. The claim stays because a
process that cannot write to the state branch may not be able to write to the tracker either; a
sibling takes it over once the rank is gone.

**Where a worker's checkpoints are further apart, a rank stands down at one** (Adam,
2026-10-17). A worker must reach a checkpoint once per poll interval, and a role may poll every
two minutes, so at the shortest poll that limit is tight. If task 4.15 finds a worker can go longer than one poll interval between them, a
process stands down after one missed heartbeat instead. One missed heartbeat plus two intervals
to the next checkpoint is still within the three a sibling waits, so this covers gaps of up to
two intervals; a longer gap would not be covered by either rule. The model checks both cases
(`StandDownAt`, `CheckpointGap`).

**Taking over a gone rank's claim releases the item first** (Adam, 2026-10-17). The taker
removes the role's label and adds it again before posting its claim message. Without that, the
gone rank's earlier message stays the earliest since the latest release, counts again once the
rank returns, and the returning rank takes the item back as its own while the taker works it.
The taker then waits out the release's second before posting, as *Ordering is the surface's
sequence key, never a timestamp* says.

**Why the first heartbeat comes first, and why a file is compared only with itself.** Until a new
process's first heartbeat lands, its file still shows its predecessor, who may have been gone
long enough for a sibling to leave out the new process's claim message. Comparing a file's times
only with earlier times from the same file means no two hosts' clocks are ever compared.

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

**Every state file more than one process writes is covered** (Adam, 2026-10-17), not only
`discovery.json` and `deferred.json`. `reconcile.json` and the daily record logs, which
`src/state.ts` re-uploads whole, are read-modify-write too, so a retry of either could discard
what a sibling wrote (task 5.1). A conflicted write is ordinary operation between siblings, so it
is never reported as a failed cycle, which would make normal concurrency read as a defect.

Two open pull requests change what `discovery.json` holds, and whichever lands second adapts:

- **PR #106** keys the watermark by role rather than by source alone. Under this change the log
  keeps one line per rank, each naming its role, folded on read into one mark per role and
  source (task 5.11).
- **PR #99** adds the candidate ids a cycle carries to the next. They become log lines too,
  replayed per source as the union of each rank's latest (task 5.12).

### The replayed watermark is the lowest live rank's

Decided by Adam, 2026-10-13. Each line of the `discovery.json` log names its source, its rank and
its mark. The replay takes each rank's latest mark for a source, and uses the lowest of those
from ranks that still count. A rank past the abandonment bound stops counting. When no rank
counts, such as after every process of a role has been down past the bound, the replay uses the
lowest of every rank's latest mark rather than starting cold: a cold start would triage every
issue of the last 7 days (`COLD_START_DAYS`) again.

The two errors cost different things. A mark too low makes a process triage some items again,
a model call each. A mark too high skips items a sibling has not yet taken, and nothing brings
those items back until the issue is updated again, such as by a new comment. Taking the lowest
of every mark ever written would never advance, which is why only each rank's latest counts, and
a rank that stopped running would hold the mark down forever, which is why the bound ends its
say.

**A rank holds the mark down only once this process has seen it alive** (Adam, 2026-10-17). A
restarted process watches every sibling afresh, so for three polls it counts each one, even a
rank that died long ago and is still declared. That rank's old mark would drag the mark down,
below even a cold start's look-back. So a sibling's mark counts only once this process has seen
that rank's heartbeat move forward since it started; its own rank's mark always counts. **The
every-rank-gone fallback is capped** at the cold start's look-back, 7 days, for the same reason.

**An item a sibling holds is passed over before triage** (Adam, 2026-10-17). Every cycle
considers every labelled item, so without this each rank would triage every item a live sibling
holds, every cycle, with a model call each. The pass-over uses the same test as choosing a
candidate: the item's holding claim message carries a sibling's rank that is not gone.

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
own role and rank, which its dead predecessor left: only one process runs at a rank, so none of
them is in use. It never removes another declared rank's, so it needs no age (Adam, 2026-10-13).
It leaves a declared rank's trees even once that rank is gone: a sibling may take a gone rank's
claims, but deleting a tree that is still in use corrupts a run, and leaving one costs only
disk. A rank the roster no longer declares will not come back, so its trees are removed, but
only once it is gone, at the start of a cycle (Adam, 2026-10-17).

**Trees live where every rank on the host can see them** (Adam, 2026-10-17). The unit sets
`PrivateTmp=true`, which gives each instance its own temporary directory, so a sweep there never
sees another rank's trees. Trees go under the unit's `StateDirectory=` instead, which every
instance of the template shares.

**The sweep takes each tree's git directory with it** (Adam, 2026-10-17). PR #175
(`worker-user`), not merged, adds a git directory beside each tree, named `<tree>-git`. This
change sweeps it with the tree, assuming that name, and task 4.20 checks the name against #175
as merged.

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

**TLC finds no violation in the change as specified.** Each rule the model checks is a constant,
TRUE in the change as specified. The six configurations beside the model set every rule TRUE,
and pass. Each file in `model/negative/` turns one rule off and checks only the property that
breaks without it; TLC finds that violation, which shows the rule is needed. CI checks both: the
configurations beside the model must pass, and every negative file must fail.

The model's first run found eight ways the change, as first written, let two processes work one
item, lost an item, or never recovered a crashed rank's claim. Adam decided each on 2026-10-17
and added a ninth rule, for a rank that cannot write its heartbeat. Two reviews of the change
against the in-force specs and the open pull requests then raised twenty questions. Adam's
answers, the same day, added four more rules the model shows are needed (10 to 13
below), and three it checks without a negative file:

- **A taker waits out its release's second** (`WaitAfterRelease`). With the wait off, TLC finds
  no violation of any invariant: a taker's message in its release's second does not count, so the
  taker loses, and another claim takes the item at the next cycle. The wait saves that cycle and its
  extra claim message; it is not needed for safety.
- **A sibling's mark counts only once this process has seen it alive, and the every-rank-gone
  fallback is capped.** Both bound how much triage is repeated, which the model does not measure.
  The model checks that neither lets the mark pass an untaken item. Every item in the model is
  inside the cold start's look-back, so the cap changes nothing in it.
- **An item a sibling holds is passed over before triage.** That saves triage calls, which the
  model does not count; the model checks that it loses no item.

The model releases an item before taking it over only where the taker leaves out a gone rank's
claim message, as *A retired rank does not hold its items forever* requires.

### Invariants and properties

| Name | Requirement it proves | What it says |
| --- | --- | --- |
| `NoTwoWorkers` | *A claim names the process that took it*; *Assignment expresses a claim; ordering resolves it*; *A hand-over among one role's ranks is contested like found work* | Never two live workers on one item. |
| `LiveRankNeverGone` | *A retired rank does not hold its items forever*, scenarios *The bound does not shorten a run*, *A lost state branch takes no live rank's claim* and *A rolled-back state branch takes no live rank's claim* | A live rank's claim is never taken: no other process judges gone a running rank that has written its heartbeat since it started and has not stood down. |
| `MarkNeverPassesUntaken` | *Processes saving one source keep the lower watermark* | The replayed mark never passes an item no live process has taken: such an item is among some live process's candidates this cycle, or above the mark some live process would replay. |
| `HandOverStands` | *A hand-over among one role's ranks is contested like found work*, scenario *A taken-over hand-over still stands* | An item a person handed over reads as handed over while it carries the label, until a run finishes it or a stop ends the hand-over. |
| `OrphanRecovered` (liveness) | *A process recovers the claims of its own predecessor*; *A retired rank does not hold its items forever*; *Every cycle considers the items its role's label holds* | A crashed or retired rank's claims are eventually recovered: a labelled item that no running process holds is eventually worked again or released. |
| `EveryItemHandled` (liveness) | *Processes saving one source keep the lower watermark*, with *A process recovers the claims of its own predecessor* | Every item is eventually finished or stopped. |
| `StopNeverLost` (liveness) | *Stop is unconditional and open to anyone*, already in `openspec/specs/work-claiming`, not added by this change | A stop is never lost: eventually no worker runs on the item and its label is off, for good. |

The liveness properties hold in behaviours where some process is eventually always running.

*A conflicted state write discards nothing*, with the scenario *A heartbeat replaces only its own
rank's*, is assumed rather than proved. It says a rejected write is retried and lands the same line,
so the model treats a conflict as a delay before the write lands, during which a crash can lose it.

*Contention is resolved before a claim, not after it* is not checked at all. It decides which
process posts a claim message, not whether two processes work, and the model does not time the
rank-proportional wait. The same holds for the wait in the hand-over contest: the model lets
every free rank post, and checks that verification leaves one worker.

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
10. **A hand-over among one role's ranks goes through the contest** (`HandoverContest`,
    `NoHandoverContest.cfg`). Under the in-force rule, both ranks read the hand-over as their own,
    post, and start work without verifying. TLC: `NoTwoWorkers` violated.
11. **A taker's claim message records the hand-over** (`HandoverRecorded`,
    `NoHandoverRecorded.cfg`). A rank takes over a crashed rank's claim on a handed-over item, and
    removing and re-adding the label makes the item read as found. TLC: `HandOverStands`
    violated.
12. **A rank removed from the roster is adopted only once it is gone** (`RosterWaits`,
    `NoRosterWaits.cfg`). Adopted at once, the removed rank's claim is taken while its worker is
    still running. TLC: `NoTwoWorkers` violated.
13. **Where a worker may go two intervals between checkpoints, a process stands down after one
    missed heartbeat** (`StandDownAt`, `CheckpointGap`; `NoEarlierStandDown.cfg` sets them to 2
    and 2). Standing down at two, the worker may still run at the third missed heartbeat, when a
    sibling counts the rank gone and takes the item. TLC: `NoTwoWorkers` violated.

### Bounds and results

All runs use two ranks, both declared at the start, an abandonment bound of three poll intervals,
and TLC 2.19 from `tla2tools.jar` v1.7.4. Time is unbounded: the model holds two
counts capped at the bound, the polls since each sibling's heartbeat moved forward and the
intervals since each process's own last heartbeat. A lost branch in these runs may also be a rollback to an old
commit.

In CI, each must pass:

| Configuration | Items | Environment | Checks | Result | Distinct states | Time |
| --- | --- | --- | --- | --- | --- | --- |
| `ConcurrentInstances.cfg` | 2 | 1 crash, 1 lost or rolled-back branch, 1 hand-over | invariants | no violation | 44,154,364 | 3 min 14 s |
| `ConcurrentInstancesMisses.cfg` | 2 | 3 missed heartbeats | invariants | no violation | 93,839,882 | 6 min 56 s |
| `ConcurrentInstancesLongGaps.cfg` | 1 | 3 missed heartbeats; stand down at 1, checkpoints 2 intervals apart | invariants | no violation | 14,765,592 | 1 min 18 s |
| `ConcurrentInstancesRoster.cfg` | 2 | 1 crash, 1 hand-over, 1 rank removed from the roster | invariants | no violation | 80,477,704 | 5 min 19 s |
| `ConcurrentInstancesLiveness.cfg` | 1 | 1 crash, 1 stop | invariants and liveness | no violation | 3,183,418 | 6 min 7 s |
| `ConcurrentInstancesLivenessRoster.cfg` | 1 | 1 hand-over, 1 stop, 1 rank removed from the roster | invariants and liveness | no violation | 2,023,538 | 4 min 26 s |

Times are on 7 or 8 TLC workers of a 10-core Mac. Each file in `model/negative/` finds its
violation within about two minutes on one worker, which is how CI runs them.

Runs outside CI's bounds found no violation. The first two finished, so each is a proof within
its bounds; the last two did not, so neither is:

- **Long checkpoint gaps with a crash**, as `ConcurrentInstancesLongGaps.cfg` with one crash:
  157,383,378 distinct states in 15 min 55 s on 7 workers.
- **The taker's wait off** (`WaitAfterRelease = FALSE`), as `ConcurrentInstances.cfg`:
  136,411,380 distinct states in 1 h 3 min on one worker, with every invariant checked; and as
  `ConcurrentInstancesLiveness.cfg`, 13,136,886 distinct states in 33 min on 6 workers, with the
  liveness properties checked.
- **Long checkpoint gaps with two items**, as `ConcurrentInstancesLongGaps.cfg` with
  `NItems = 2`, stopped after 21 minutes and 10 GB of states.
- **Liveness with a crash, a stop, a hand-over and a rank removed from the roster**, as
  `ConcurrentInstancesLiveness.cfg` with both added, stopped after 22 minutes at 9,946,483
  distinct states.

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
- **A claim-and-retract is acceptable.** A sibling that reads a claim between its label and its
  message posts a message of its own, and one of the two stands down. No invariant forbids it.

The model also assumes:

- **A rank's heartbeat times move forward on its own clock.** Each write holds a later time than
  the last; no two hosts' clocks are compared. A rank restarted on a host whose clock is behind,
  or a clock stepped back, breaks this, and the proposal lists it as open.
- **A claim is visible at once.** The settle interval's length is not modelled.
- **A stood-down process's worker reaches a checkpoint within `CheckpointGap` poll intervals**, as
  the requirement says. That is what lets it stop before a sibling counts it gone.
- **A process whose rank leaves the roster keeps writing heartbeats until it exits,** and sees
  the roster change at once. Its siblings count from its last heartbeat, so how late it notices
  delays only when its claims are freed.
- **Pull requests, catch-ups and the tree sweep are not modelled.**

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
