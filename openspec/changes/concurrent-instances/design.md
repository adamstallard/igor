## Context

One Igor is one role with one identity: on GitHub, the role's GitHub App, which claims with the
`igor:<role>` label and a claim message. Capacity is how many processes run behind that
identity. Everything here follows from refusing to conflate the two.

## Decisions

Adam decided in two rounds on 2026-10-17: first the answers to two reviews' questions, then a
second set settling what those answers left open. A decision from the second set is marked
*round two*.

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
release's second does not count, because it may have been posted before the release.

**Nobody waits out a release's second** (Adam, 2026-10-17, round two). A claim message posted in
the second of the item's latest release does not count, and that item goes to the next cycle.
This holds for a process taking over a gone rank's claim, which releases the item just before
posting, and for one claiming an unlabelled item right after a sibling finished it. Its claimer
finds no claim message that counts at its verification, so it loses, works nothing, and leaves
the label on. At the next cycle any rank finds the item labelled with no claim message that
counts, and claims it by posting one. The previous version had a taker wait for the second to
pass; TLC found no violation of any invariant or liveness property with the wait off, so it is
dropped, and the model now checks the change without it.

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

**Under systemd the rank is in the instance name** (Adam, 2026-10-13; its form, 2026-10-17, round
two). One template unit runs as `igor@<role>-<rank>`, such as `igor@generalist-2`, and passes
the instance to `igor serve <role>-<rank>`, which splits it. The rank is always written, and is
the name's last dash-separated part, so `front-end-2` is rank 2 of `front-end`, and an instance
named by its role alone is refused. The unit uses `%i` directly wherever it names something per
instance, as #175 names the worker user `igor-worker-%i`. The role's GitHub App identity stays
one per role; no rank has an App of its own. The rank reaches `igor` as part of its argument,
the instance name, so the process learns role and rank from one place.

**A shell wrapper loads the role's credentials** (Adam, 2026-10-13). Every rank of a role reads
one file, `/etc/igor/<role>.env`. systemd has no specifier for the part of an instance name
before its last dash, so `EnvironmentFile=/etc/igor/%i.env` would name `generalist-2.env`. Instead,
`ExecStart` runs `/bin/sh -c`: the script takes the role from the instance name, loads the role's
file into its environment, and `exec`s `igor serve` with the instance. Task 1.3 gives the exact
lines. Only the instance name is passed as an argument, so no credential appears in a process's
argument list, where any user on the host can read it.

The script loads the file with the shell's dot command, `. "/etc/igor/<role>.env"`, not with
systemd's `EnvironmentFile=`, so the file must be valid shell. If the file is missing, the dot
command fails and the unit does not start.

**Every value in the role's file is single-quoted or plain** (Adam, 2026-10-17; plain values,
round two). Outside single quotes the shell expands `$`, `` ` `` and `\`, so a private key or
token holding one would reach Igor changed, and nothing would say so. A plain value uses only
`[A-Za-z0-9_./:@-]`, which the shell leaves alone, so a path or an App ID needs no quotes.
Every other value is refused at start, naming the line and the key but never the value. That
includes every double-quoted value, even one holding none of those characters: two forms judged by
their characters alone keep the check from having to work out what the shell would do. The check reads the file
only for its quoting: the credentials still reach Igor only through its environment, as
`role-config` requires.

**The roster is a list of ranks per role** (Adam, 2026-10-17, who asked for its key and shape to
be specified, and confirmed it in round two), under the top-level key `roster` in
`igor.config.yaml`. A list rather than a count, so that a rank can be retired without
renumbering the ranks above it. A role the roster does not name runs rank 1 only, so a
deployment with one process per role needs no roster.

**A role's name may hold a dot** (2026-10-17, round two). The previous version refused one,
because under `<role>.<rank>` the name `front.end` could be the role `front.end` at rank 1 or
the role `front` at a rank named `end`. With the rank always written as the last dash-separated
part, no name is ambiguous, so this change no longer refuses a dot. A role's name still becomes
part of a Unix user name under #175, `igor-worker-<role>-<rank>`, where a dot can read as
`user.group`; whether role names need a rule for that is #175's to decide.

**A role's processes share one identity and differ only by rank** (Adam, 2026-10-17).
`role-config` and `docs/architecture.md` §2 said they were interchangeable. Under this change
they are not: the same rank takes back its predecessor's claims at once, other ranks only once
the holder is gone, and rank sets the order and the wait of contention. The `role-config` delta
says so, and task 6.3 restates the architecture passages.

Note the layering: the `claude -p` worker is not an Igor. It is one short-lived subprocess per
item with no identity, no claim, and no rank. The Igor is the long-running process that polls.

### A run by hand does not run beside a serving rank 1

Decided by Adam, 2026-10-17, round two. `igor run <role>` runs as rank 1, so beside a serving
rank 1 it would read that rank's claims as its predecessor's and re-work them, and its startup
sweep would remove that rank's trees. So it refuses when rank 1's heartbeat is live, naming the
serving instance. A role nobody serves runs by hand as it always has; PR #175 makes such a run
use no worker user, with a notice, while `serve` always needs one.

Under *Liveness is judged by a counter* below, the only sign that rank 1 is live is its counter
changing, and rank 1 writes once a poll interval, so `igor run` reads the file, waits one of the
role's poll intervals, and reads it again. It waits even when the file is missing, since a lost or
reset state branch removes the file while rank 1 runs, and a serving rank 1 rewrites it within
the interval. The wait, 10 minutes at the default poll, is the cost of judging by the counter,
and the proposal lists it for Adam. `igor run --plan` claims nothing, but sweeps at start like
any run, so it is refused too.

### Rank 1 comes first everywhere

Decided by Adam, 2026-10-17, round two. Rank 1 starts at the first candidate and rank k at the
k-th, in every list. The open change `directed-interaction` said the highest rank starts at the
first request; its proposal now says rank 1 does, and rank k the k-th, so that request lists
are ordered as found work is.

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
message records that the item was handed over, as a trailer `Igor-Handed-Over-By: <login>`
(Adam confirmed the wording on 2026-10-17, round two), and the adapter reads that record as the
person's hand-over still standing.

### A claim is recovered by identity, not by waiting

A sibling can observe only how old a claim is, and a progress-bounded worker has no maximum
duration, so no age is ever conclusive. Making the marker the rank replaces the question.

Rank 2 restarts, finds a claim marked rank 2, and knows its predecessor is dead, because only
one rank 2 runs at a time. It takes the item back and, unless the Igor's pull request for it is
open, re-works it from scratch — the
predecessor's working tree is gone, and a tree that survived a crash is debris rather than a
checkpoint, since the worker's context died with its process.

Rank 3 finds a claim marked rank 2 and leaves it while rank 2 is not gone, because rank 2 will
recover it.

**A claim left on the Igor's open pull request is caught up, whoever left it** (Adam,
2026-10-17; any gone rank's, round two). A process that opened a pull request and then died
leaves its claim behind. Re-working the item would duplicate work in review, against triage's
skip for work in flight. So the process that takes the claim over, its restarted successor or
any sibling once the rank is gone, carries on with it as a catch-up: it brings the pull request
up to date where it no longer merges, and gives the claim back as a catch-up does, leaving the
pull request and any person's label. Without the sibling's part, triage would skip the item as
work in flight, and the role's label would stay on it with nobody behind it; `work-triage`'s
skip gains that exception, and the model shows it is needed (`CatchUpAny`).

**Every catch-up over a gone rank's claim ends with the adopting rank's own claim message**
(Adam, 2026-10-17, round two). Adam's words: the gone rank's claim message stops counting once a
later claim by the same role exists, so no release is needed and a person's label stays. That is
a new rule, supersession: everywhere else the earliest claim message holds the item, and a later
one never cancels an earlier one. The spec reads it as: the adopting rank posts its own claim message, without removing and re-adding the
label, and verifies it as for any claim. Its message supersedes the gone rank's for good, even
once that rank returns; the model shows that a gone rank's message that counts again on its
return puts two workers on the item (`CatchUpSupersedes`). A returning rank can tell an
adopter's message from a contender's only if the message says so, so task 2.14 proposes a
trailer, `Igor-Supersedes: <rank>`, which Adam has not yet confirmed.

A catch-up's own claim message keeps counting after the catch-up gives its claim back while a
person's label stays, since no release happens. The worry was that the message would hold the
item for a rank that is not working it, so that a later claim by another rank loses to it. It
does hold the item, but for a rank that acts on it: at each cycle that rank reads its own message
as its predecessor's claim and carries on, which runs no worker and changes nothing on the item
while the pull request still merges. When the pull request closes and the label directs the Igor
again, that rank works the item. Once the rank is gone, a later claim supersedes its message.

**Duplicate rank is an operator invariant and cannot be handled.** A live twin and a dead
predecessor are indistinguishable: two rank-2 processes each read the other's claim as an
abandoned predecessor and take it in turn, continuously. Adding a boot generation to the marker
does not help — each still reads the other as a dead earlier generation. The heartbeat cannot
separate them either, since both write the same rank's file. So one process per rank is
kept by the operator, like not declaring two seats with one id, and the claim message names the
rank so a violation is visible on the item rather than silent.

### Retirement is recorded, not detected

Retiring a process is a decision, so there is nothing to detect. A crash is not retirement: the
supervisor restarts the process and it recovers its own claim.

The roster — the ranks each role may run — is declared configuration in `igor.config.yaml`,
like seats and pools. The supervisor starts processes and the roster says which may run: a
process whose rank the roster lacks refuses to start, so the two cannot silently disagree.

Counting instances at runtime would be a registry. Being told what exists is configuration.

**A rank removed from the roster shuts down** (Adam, 2026-10-17, round two). A process reads the
roster at the start of each cycle. One whose own rank has left it starts no claim, and behaves as
when the supervisor asks it to shut down: it finishes the item in hand or hands it off out loud,
then exits; the
supervisor's restart is then refused, since the rank is undeclared. It keeps writing heartbeats
until it exits. Siblings adopt its claims only if it dies first, once its heartbeat has failed
to change for three polls, the same bound as for a declared rank that stopped running, and its
trees are swept then too. The model shows that adopting such a claim at once lets two processes
work one item (`RosterWaits`). This replaces an earlier choice, that such a process stood down
and left its claim for a sibling to adopt once its worker stopped.

The abandonment bound is therefore what frees any rank's claims, whether the rank crashed and
was not restarted, was left in the roster with nothing running, or was removed from it.

**Each rank writes a heartbeat** (Adam, 2026-10-13). Every process overwrites its own small file
on the state branch, `heartbeats/<role>-<rank>.json`, once every poll interval. It keeps doing so while a worker runs, from a timer beside the
run rather than from the cycle. Its first heartbeat lands before its first cycle (Adam,
2026-10-17): until then its file shows only its predecessor, who may have been gone long enough
that a sibling still counts the rank gone, and so leaves out every claim message of that rank,
the new process's included. **A rank is gone when it has missed
three heartbeats**, three of its role's poll intervals, 30 minutes at the default 10-minute
poll. The bound is that fixed multiple of the poll interval; it has no setting of its own. Any
process of the role may take a gone rank's claims.

A heartbeat rather than a record written once per cycle, such as a line in `decisions.ndjson`,
because a process works its items inside the cycle: a per-cycle record goes quiet for as long as
a run lasts, and a run longer than the bound would make a working rank look gone. The heartbeat
keeps a working rank counted, which is what makes the `work-claiming` scenario *The bound does
not shorten a run* true.

**Liveness is judged by a counter, never by timestamps** (Adam, 2026-10-17, round two). The
heartbeat file holds a counter the rank increments on each write. A sibling judges liveness only
by whether the counter changed across its own polls, timed by its own clock. No time in the file
is compared across processes, or at all. Each process keeps in its own memory, per sibling, what
it last read from the sibling's file and the moment it last saw that change, and counts the
sibling gone once three of its own poll intervals pass after that moment, or after its own start
if that is later.

This closes a hole in the version before it, which counted a heartbeat when its time was later
than any read from the file. A rank whose clock went back, restarted on another host or stepped
by the clock's own correction, then wrote times that never counted, so its siblings counted it
gone and took its claims while it worked. The model shows it: with times compared and one clock
stepped back, TLC finds two workers on one item (`CounterLiveness`).

**What changed means, across a restart and a rollback.** A restarted rank cannot carry its
counter on from its own file, since a lost or rolled-back state branch puts an older counter
back, and counting from there would write values its siblings have already read past. So the
file also holds an id the process picks at random when it starts, and a heartbeat counts when
the id and counter differ from what the watcher last read, not only when the counter is higher.
Adam decided on a counter that advances; reading "advances" as "differs from the last read" is
this spec's, and the proposal lists it for him to confirm.

- **A lost or reset state branch changes no heartbeat.** A missing file lets the count run on
  from the sibling's last real heartbeat. A live rank rewrites its file within one poll
  interval, so its count restarts long before three. A crashed rank is still recovered three
  intervals after its last real heartbeat.
- **A rolled-back branch may read as a change, once.** The file put back differs from the one
  last read, so it restarts the count for its rank. That postpones a gone verdict by up to three
  poll intervals and never hastens one; the model includes it.
- **A restart forgets the counts** and starts every sibling's afresh, which postpones a gone
  verdict by up to three poll intervals and never hastens one. Storing the counts on the state
  branch would put them beside the files whose loss they exist to survive.

Watching the file replaces judging by its age, which the model showed a rollback defeats: an old
commit leaves every file present and old, so every live rank looks gone at once, and its claims
are adopted while it works them (`WatchAdvance`).

**Heartbeats are read before each claim decision** (Adam, 2026-10-17): before choosing a
candidate and again before verifying, not once a cycle. A cycle includes its worker runs, so a
read from its start can be older than the bound when the cycle reaches its next candidate, and
a sibling that restarted after the read would still look gone.

**All the role's heartbeat files are read in one request** (Adam, 2026-10-17): one read of the
state branch's tree. Every rank of a role acts as one GitHub App, so all of them share one budget of
GitHub's `core` REST rate limit, and a read per file before every candidate and verification
would multiply against it. A rate limit that stopped heartbeats would stand every rank down at
once. The tree gives each file's blob id, and under the counter a file has changed exactly when
its blob id has, so a process fetches no file's contents. Task 4.19 measures the requests per
cycle per rank.

**A rank that cannot write its heartbeat stands down** (Adam, 2026-10-17). After two poll
intervals without a heartbeat landing, as in an outage or under a rate limit, a process starts
no claim and stops its running worker at the worker's next checkpoint, leaving the claim. It
resumes once a heartbeat lands. Two is one fewer than the three a sibling waits, so where the
worker reaches a checkpoint within a poll interval, the process has stopped before any sibling
may count it gone and take its claims.

**It keeps the claim in silence** (Adam confirmed, 2026-10-17, round two). By the time it stands
down, a sibling may already count it gone and have taken the item over, so a release could undo
the sibling's fresh claim. That is the stated exception to *A claim that cannot be kept is given
back, out loud*. A sibling takes the claim over once the rank is gone.

**A worker checkpoints at least every two poll intervals, and longer gaps are forbidden** (Adam
confirmed, 2026-10-17, round two). When this was asked, Adam was told that a long model call
still checkpoints, because the stream's events count. `main` does not bear that out. A
checkpoint there is the claim re-read in `src/execute.ts`, made on a worker event, at most once
every 30 seconds (`CHECKPOINT_INTERVAL_MS`), never on a timer. `claude -p` runs with
`--output-format stream-json` and no partial messages, so a model turn arrives as one event when
it ends: the worker may go `MODEL_SILENCE_MS`, 5 minutes, with no event while the model writes,
and `TOOL_SILENCE_MS`, 30 minutes, while a tool runs, before the silence windows kill it. At the
default 10-minute poll, 30 minutes is three intervals; at a 2-minute poll, even 5 minutes is more
than two. So the requirement does not hold for `main`'s worker, and task 4.15 must add a
checkpoint that does not wait for an event. A stand-down needs no tracker read, so it could stop
the worker on a timer.

**Where a worker's checkpoints are further apart, a rank stands down at one** (Adam,
2026-10-17). A role may poll every two minutes, so at the shortest poll one interval between
checkpoints is tight. If task 4.15 finds a worker can go longer than one poll interval between
them, a process stands down after one missed heartbeat instead. One missed heartbeat plus two intervals
to the next checkpoint is still within the three a sibling waits, so this covers gaps of up to
two intervals; a longer gap would not be covered by either rule. The model checks both cases
(`StandDownAt`, `CheckpointGap`).

**Taking over a gone rank's claim releases the item first** (Adam, 2026-10-17). The taker
removes the role's label and adds it again before posting its claim message, and posts at once.
Without that, the gone rank's earlier message stays the earliest since the latest release,
counts again once the rank returns, and the returning rank takes the item back as its own while
the taker works it. A claim on the Igor's open pull request is the exception, taken over by a
superseding claim message instead, as above.

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
that rank's heartbeat change since it started; its own rank's mark always counts. **The
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

**Trees live where every rank on the host can see them** (Adam, 2026-10-17; the path, round
two). The unit sets `PrivateTmp=true`, which gives each instance its own temporary directory, so
a sweep there never sees another rank's trees. Trees go in `/var/lib/igor/trees`, under the
unit's `StateDirectory=igor`, which every instance of the template shares. PR #175
(`worker-user`) keeps `PrivateTmp=true` for everything else, and records its side of this
itself.

**The sweep takes each tree's git directory with it** (Adam, 2026-10-17). PR #175, not merged,
adds a git directory beside each tree, named `<tree>-git`. This change sweeps it with the tree,
assuming that name, and task 4.20 checks the name against #175 as merged.

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
TRUE in the change as specified. The eight configurations beside the model set every rule TRUE,
and pass. Each file in `model/negative/` turns one rule off and checks only the property that
breaks without it; TLC finds that violation, which shows the rule is needed. CI checks both: the
configurations beside the model must pass, and every negative file must fail.

The model's first run found eight ways the change, as first written, let two processes work one
item, lost an item, or never recovered a crashed rank's claim. Adam decided each on 2026-10-17
and added a ninth rule, for a rank that cannot write its heartbeat. Two reviews of the change
against the in-force specs and the open pull requests then raised twenty questions. Adam's
answers, the same day, added four more rules the model shows are needed (10 to 13
below). Adam's second round of decisions that day added three more (14 to 16), and dropped the
taker's wait for its release's second: every configuration now runs with a claim message free to
land in that second and not count. These rules are checked without a negative file:

- **A rank removed from the roster shuts down,** finishing its item or handing it off out loud.
  Standing down in silence instead would be safe too, since siblings still wait out the
  abandonment bound, so no property breaks without it; `RosterWaits` is the rule that guards
  safety.
- **A rolled-back state branch may read as a heartbeat changing.** The model lets a rollback
  restart some watchers' counts, and checks that this loses nothing.
- **A sibling's mark counts only once this process has seen it alive, and the every-rank-gone
  fallback is capped.** Both bound how much triage is repeated, which the model does not measure.
  The model checks that neither lets the mark pass an untaken item. Every item in the model is
  inside the cold start's look-back, so the cap changes nothing in it.
- **An item a sibling holds is passed over before triage.** That saves triage calls, which the
  model does not count; the model checks that it loses no item.

The model releases an item before taking it over only where the taker leaves out a gone rank's
claim message and the item has no pull request open, as *A retired rank does not hold its items
forever* requires. With the pull request open, the taker's message supersedes instead.

**States are fingerprinted by order, not by clock.** Update times and marks are values of a
counter every tracker write advances, so two runs alike but for how many writes came between
were distinct states. Every guard only compares those values, or takes their least or greatest,
and the one subtraction, a held-back mark of `upd[i] - 1`, is only compared as `x > upd[i] - 1`,
which for whole numbers is `x >= upd[i]`. So each configuration declares `VIEW StateView`, which
replaces each such value by its place in their order. That cut `ConcurrentInstancesLongGaps.cfg`
from 35,935,599 distinct states to 2,467,859 with the same result, and every negative file still
finds its violation.

### Invariants and properties

| Name | Requirement it proves | What it says |
| --- | --- | --- |
| `NoTwoWorkers` | *A claim names the process that took it*; *Assignment expresses a claim; ordering resolves it*; *A hand-over among one role's ranks is contested like found work*; *A claim left on the Igor's open pull request is caught up* | Never two live workers on one item, a catch-up's included. |
| `LiveRankNeverGone` | *A retired rank does not hold its items forever*, scenarios *The bound does not shorten a run*, *A lost state branch takes no live rank's claim*, *A rolled-back state branch takes no live rank's claim* and *A rank whose clock goes back is still counted* | A live rank's claim is never taken: no other process judges gone a running rank that has written its heartbeat since it started and has not stood down. |
| `MarkNeverPassesUntaken` | *Processes saving one source keep the lower watermark* | The replayed mark never passes an item no live process has taken: such an item is among some live process's candidates this cycle, or above the mark some live process would replay. |
| `HandOverStands` | *A hand-over among one role's ranks is contested like found work*, scenario *A taken-over hand-over still stands* | An item a person handed over reads as handed over while it carries the label, until a release or a stop ends the hand-over; a catch-up keeps it. |
| `OrphanRecovered` (liveness) | *A process recovers the claims of its own predecessor*; *A retired rank does not hold its items forever*; *Every cycle considers the items its role's label holds*; *A claim left on the Igor's open pull request is caught up* | A crashed or retired rank's claims are eventually recovered: a labelled item that no running process holds and no run has finished is eventually worked again, finished or released. |
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
8. **A sibling is gone only once its heartbeat has not changed for three polls, as this process
   watched it** (`WatchAdvance`, `NoWatchAdvance.cfg`). Judged by the file's age instead,
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
14. **Liveness is judged by a counter, never by timestamps** (`CounterLiveness`,
    `NoCounterLiveness.cfg`). Comparing the times in the file, a rank whose clock stepped back
    writes heartbeats that never count; a sibling counts it gone while it works, takes over its
    item, and both work it. TLC: `NoTwoWorkers` violated.
15. **A gone rank's claim on the Igor's open pull request is caught up by any process**
    (`CatchUpAny`, `NoCatchUpAny.cfg`). Otherwise triage skips it as work in flight, and a
    crashed rank that is never restarted leaves its label on the item for good. TLC:
    `OrphanRecovered` violated.
16. **Over such a claim, the taker's message supersedes the gone rank's for good**
    (`CatchUpSupersedes`, `NoCatchUpSupersedes.cfg`). With no release and no supersession, the
    gone rank's message counts again once it restarts, and it catches the item up while the
    taker does. TLC: `NoTwoWorkers` violated.

### Bounds and results

All runs use two ranks, both declared at the start, an abandonment bound of three poll intervals,
and TLC 2.19 from `tla2tools.jar` v1.7.4. Time is unbounded: the model holds two
counts capped at the bound, the polls since each sibling's heartbeat changed and the intervals
since each process's own last heartbeat. A lost branch in these runs may also be a rollback to an old
commit.

In CI, each must pass:

| Configuration | Items | Environment | Checks | Result | Distinct states | Time |
| --- | --- | --- | --- | --- | --- | --- |
| `ConcurrentInstances.cfg` | 2 | 1 crash, 1 lost or rolled-back branch, 1 hand-over | invariants | no violation | 12,706,014 | 2 min 54 s |
| `ConcurrentInstancesMisses.cfg` | 2 | 3 missed heartbeats | invariants | no violation | 17,590,014 | 3 min 8 s |
| `ConcurrentInstancesLongGaps.cfg` | 1 | 3 missed heartbeats; stand down at 1, checkpoints 2 intervals apart | invariants | no violation | 2,467,859 | 26 s |
| `ConcurrentInstancesRoster.cfg` | 2 | 1 crash, 1 hand-over, 1 rank removed from the roster | invariants | no violation | 18,213,605 | 2 min 59 s |
| `ConcurrentInstancesCatchUp.cfg` | 2 | 1 run that opens its pull request, 1 crash, 1 hand-over | invariants | no violation | 13,288,457 | 2 min 3 s |
| `ConcurrentInstancesLiveness.cfg` | 1 | 1 crash, 1 stop | invariants and liveness | no violation | 592,046 | 1 min 33 s |
| `ConcurrentInstancesLivenessRoster.cfg` | 1 | 1 hand-over, 1 stop, 1 rank removed from the roster | invariants and liveness | no violation | 594,210 | 1 min 36 s |
| `ConcurrentInstancesLivenessCatchUp.cfg` | 1 | 1 run that opens its pull request, 1 crash, 1 hand-over, 1 stop | invariants and liveness | no violation | 2,196,949 | 6 min 20 s |

Times are on 8 TLC workers of a 10-core Mac. Each of the sixteen files in `model/negative/` finds
its violation within 70 seconds on one worker, which is how CI runs them; all sixteen take 6
minutes together.

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

- **Every heartbeat write changes the file.** The counter goes up, and a restarted process
  writes a new id, so no clock enters into it. A clock stepped back therefore changes nothing
  the model reads under the counter, and no configuration that must pass includes one;
  `NoCounterLiveness.cfg` includes one to show what comparing times would break.
- **A claim is visible at once.** The settle interval's length is not modelled.
- **A stood-down process's worker reaches a checkpoint within `CheckpointGap` poll intervals**, as
  the requirement says. That is what lets it stop before a sibling counts it gone.
- **A process whose rank leaves the roster keeps writing heartbeats until it exits,** and sees
  the roster change at once. How late it notices delays only when it stops starting claims.
- **A pull request is opened only by a run, before it finishes,** at most once per behaviour
  (`MaxPRs`), and a catch-up then finishes the item. What a person's label does after the pull
  request closes is not modelled, nor is the tree sweep.

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
