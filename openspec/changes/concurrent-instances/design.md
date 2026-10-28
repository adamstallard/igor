## Context

One Igor is one role with one identity: on GitHub, the role's GitHub App, which claims with the
`igor:<role>` label and a claim message. Capacity is how many processes run behind that
identity. Everything here follows from refusing to conflate the two.

## Decisions

Adam decided in two rounds on 2026-10-17: first the answers to two reviews' questions, then a
second set settling what those answers left open. A decision from the second set is marked
*round two*. On 2026-10-18 he answered what round two left open, marked *round three*, and then
what round three left open, marked *round four*. His latest answers, given after round four on
2026-10-18 and, for decision 38, on 2026-10-19, are marked *in his latest answers* or dated; the
proposal numbers them 29 to 38. His answers of 2026-10-21 are dated, and the proposal numbers them
39 to 52. Decisions 45 to 48 this change's author drew up from what other changes reported, and
Adam confirmed them on 2026-10-21. On 2026-10-24 he rewrote some earlier decisions in place,
which keep their numbers and carry that date, such as 22 and 49, and the proposal numbers that
day's new ones 53 to 58.

Where this file says *decision n*, it means the proposal's decision n. The numbered rules 1 to 24
under *Each decision, and what breaks without it* are a separate list, the model's rules, each
named there by its constant. Adam's rounds, above, are rounds of answers. A run of the model is named by the
commit it was checked at: `5dc5273` and `7a96c14` are this branch's two commits before this
revision, `7a96c14` the later.

### The marker rides in the claim message

Every claim already posts a message after setting the holder field, naming the Igor and saying
how to stop it. Processes of one role set the same label, so the message is the only part of a
claim that can say which process took it. It gains the process's rank as a machine-readable
trailer: a last line `Igor-Rank: 2`, in the form of a git trailer (Adam, 2026-10-13).

**Which claim messages count** (Adam, 2026-10-13). Among processes of one role, the earliest
claim message holds the item. Messages from before the item's latest release don't count: the
latest time the role's label was removed from the item, which the item's events record. Neither
do messages of ranks that are gone, their heartbeat unchanged for three poll intervals (*Retirement is recorded, not
detected*, below). Without that, a process taking over a dead rank's claim would always lose to
the dead rank's older message.

**A process that loses to its own role keeps the label on the item** (Adam, 2026-10-17). The
in-force rule has a losing Igor remove its own entry from a list-valued holder field. Processes
of one role share one label, so that entry is the winner's too: removing it releases the
winner's claim, and the winner reads the removal, made by its own bot account, as its own
release and carries on.

**Verification comes within one poll interval of the claim message** (Adam, 2026-10-17). A
process that reaches it later works nothing and gives the claim back, as for any failed
verification. Verification is the re-read a settle interval after claiming. In a longer
wait, a rank with an earlier message can pass the abandonment bound, three poll intervals without its heartbeat changing,
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

**An edited claim message counts for nothing** (Adam, 2026-10-18, round four). A person who can
edit the bot's comment could otherwise fake or erase `Igor-Supersedes:` or
`Igor-Handed-Over-By:`. Adam accepted the remaining risk, an edit or deletion of the holder's
message while it works, on the understanding that only maintain or admin access can edit a bot's
comment (decision 30). Task 2.19 measures which access GitHub requires, for information only:
the risk stays accepted whatever it shows (decision 40). A bot comment GitHub reports as edited is
therefore no claim message, and none of its trailers is read. Igor never edits a claim message
itself.

**An edit is read from GraphQL `lastEditedAt`, not from `updated_at`** (Adam, 2026-10-18, from
task 2.18's measurement on 2026-10-19). On five comments of one issue, a reaction left REST
`updated_at` equal to `created_at`; an edit changed it and set `lastEditedAt`; hiding a comment,
and unhiding it, changed `updated_at` and left `lastEditedAt` empty. Testing `updated_at` against
`created_at` would therefore make a hidden claim message stop counting, so the rule tests
`lastEditedAt`, and a hidden or unhidden message still counts. Transferring the issue kept every
comment's times but gave every comment a new id, in the same relative order, so ordering by id
within an issue holds across a transfer; anything that stored a comment's id does not.

In the model an edit removes a message from those that count. An edit made before any process has read the message as holding the item leaves the item just as
a message that never counted leaves it, and the model already had such messages: one posted in
the release's second never counts. An edit made after the message holds the item is a case the
model did not have before: the holding message disappears from what its siblings read while the
holder works. The model now lets a person edit any message at any time (`EditMsg`), and TLC finds that a
sibling then sees a labelled item with no claim message that counts, claims it and works it
beside the holder (`model/findings/EditedMessage.cfg`). Adam accepted that risk (decision 30).

**No other post of the bot carries a trailer line** (decision 53, drawn up by this change and
approved by Adam on 2026-10-24). Reading claim messages only from the bot's own unedited
comments does not stop the bot itself from posting one by mistake. An Igor answers mentions with
text a model composed, and a person can ask it to end a reply with `Igor-Rank: 1` and
`Igor-Supersedes: 2`. Read as a claim message, such a reply could supersede the holder's message
and put two workers on one item. So before posting composed text the bot indents by one space
each line beginning with `Igor-`, and trailers are read only from lines beginning with `Igor-`
at their first character. In Markdown the indent is invisible. *Rejected:* a fixed first line
marking claim messages, which composed text could copy as easily as a trailer.

### Ordering is the surface's sequence key, never a timestamp

GitHub returns comment times to the second. Sibling processes on one poll interval wake
together and claim inside the same second, so "the earliest claim wins" is a tie exactly where
the tiebreak is needed — and with identical intervals, simultaneity is the normal case rather
than a rare race.

Comment ids ascend strictly with creation. Measured on three comments spanning an hour:
5673068718, 5673143226, 5673525664. The id is a total order the timestamp is not. Task 2.12
measured it within one second (2026-10-19): six writers posting at one instant, six rounds, 36
comments. In four rounds all six shared one `created_at` second; the ids were all distinct, no id
order ever contradicted `created_at`, and the REST listing and GraphQL's `comments` both return
ascending ids. Within one second nothing else shows which comment the server created first, so
the measurement shows only that ids never contradict the seconds; ids are the one total order
there is, and every listing uses it.

`work-claiming` already required resolution to "rely on the storage order of writes". This is
that requirement meant literally; the drift to a clock happened in prose, not in the decision.


**A claim message is ordered against the item's latest release by timestamp** (Adam,
2026-10-17). Which messages came after the release compares a comment with a label event, and
the two have separate ids, so only their times compare, to the second. A message in the
release's second does not count, because it may have been posted before the release. Task 2.15
measured that the two share one clock in whole seconds (2026-10-19): in 70 sequenced pairs of an
unlabel and a comment, in either order, the later action never showed an earlier second, and 24
shared a second. A skew below one second, which could put a comment posted just before a release
into the next second, is not ruled out by 70 pairs; none showed one.

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

**Igor reads the role's environment file itself** (Adam, 2026-10-18, round three). Every rank of
a role reads one file, `/etc/igor/<role>.env`. systemd has no specifier for the part of an
instance name before its last dash, so `EnvironmentFile=/etc/igor/%i.env` would name
`generalist-2.env`. The unit's `ExecStart` is `/usr/local/bin/igor serve %i`, and `igor serve`
takes the role from its argument and reads the role's file before anything reads a credential,
setting each key in its own environment. Only the instance name is passed as an argument, so no
credential appears in a process's argument list, where any user on the host can read it. The
shared `/etc/igor/env`, the seat tokens every role reads, stays a systemd `EnvironmentFile=`.

*Rejected:* a shell wrapper, `/bin/sh -c` loading the file with its dot command, which the
2026-10-13 decision chose. The shell runs a `$(...)` in a value before Igor can look at the file,
so a check in Igor came too late to stop it.

**Every value in the role's file is single-quoted or plain** (Adam, 2026-10-17; plain values,
round two; the parser in Igor, round three; the refusal's wording, decision 59 of the proposal,
made by the coordinating agents on 2026-10-24). A line is blank, a `#` comment, or `KEY=value`. A
plain value uses only `[A-Za-z0-9_./:@-]`, so a path or an App ID needs no quotes. A
single-quoted value is everything between its two quotes, as written, and may span lines, as a
private key does. Igor refuses to start on any other line, naming its number and nothing of its
content. Naming the key, as the message once did, could print part of a secret: where a stray single quote inside a multi-line value ends it early, the value's remaining lines are read as lines of their own, and one such as `AbCd12==` reads as a key `AbCd12` with a value that fails the check (proposal, decision 59). The two forms, single-quoted and plain, judged by their
characters alone keep the parser from having to work out
what a shell would have done; with no shell, a single quote inside a value has no way to be
written, and the shell's `'it'\''s'` is refused like any other form. A key the file sets takes
the place of the same key in the environment Igor started with, as the shell's `set -a; .` did.

**A process rereads `igor.config.yaml` at each cycle,** roster included, from its lore checkout, the host's clone of the lore repository that holds the configuration.
Until #176 builds pulling, that checkout changes only when a person pulls it on the host, so a
roster change reaches a running rank that way. Under #82, configuration a process does not
reread takes effect at its next start; `igor.config.yaml` is not such configuration, since the
process rereads it.

**The roster is a list of ranks per role** (Adam, 2026-10-17, who asked for its key and shape to
be specified, and confirmed it in round two), under the top-level key `roster` in
`igor.config.yaml`. A list rather than a count, so that a rank can be retired without
renumbering the ranks above it. A role the roster does not name runs rank 1 only, so a
deployment with one process per role needs no roster.

**A role's name is lowercase letters, digits and dashes** (Adam, 2026-10-18, round three). It
matches `[a-z][a-z0-9-]*`, and for every rank the role may run, `igor-worker-<role>-<rank>` must
fit Linux's 32-character limit on a user name, since #175 (`worker-user`) names each rank's
worker user that way. Loading the configuration refuses any other name, naming the role, so a
name that could never become a user is refused before any process starts. With the rank always
the last dash-separated part, a dash in a role's name is never ambiguous.

**A role's processes share one identity and differ only by rank** (Adam, 2026-10-17).
`role-config` and `docs/architecture.md` §2 said they were interchangeable. Under this change
they are not: the same rank takes back its predecessor's claims at once, other ranks only once
the holder is gone, and rank sets the order and the wait of contention. The `role-config` delta
says so, and task 6.3 restates the architecture passages.

Note the layering: the `claude -p` worker is not an Igor. It is one short-lived subprocess per
item with no identity, no claim, and no rank. The Igor is the long-running process that polls.

### A run by hand runs as rank 0

Decided by Adam, 2026-10-18, in his latest answers. `igor run <role>` runs as rank 0, a rank no
roster declares, with a heartbeat file of its own, `heartbeats/<role>-0-<run id>.json`. It starts at once,
beside any serving rank, and contends for items as any rank does: its claim messages carry
`Igor-Rank: 0`, and the claim and its verification decide who works an item. So `NoTwoWorkers`
covers it with no rule of its own. It takes over no claim message of any rank: not an earlier
run's at rank 0, and not a gone serving rank's. A claim it leaves is taken over by a serving rank
once that run is gone. It removes only its own trees, and those of runs that are gone.

This replaces running `igor run` as rank 1. At rank 1, beside a serving rank 1, a run would read
that rank's claims as its predecessor's, re-work them and sweep its trees. To prevent that, round
four had the run wait half a poll interval for a sign that rank 1 was serving, and had both
processes write a start id into rank 1's file, the one that found the other's id stopping for
good: a *fence*. TLC showed that the wait and the fence together still let both work one item: one failed heartbeat write during the run's wait made rank 1 look unserved
while its worker ran, and a rank 1 restarted beside the run took the run's claim for its
predecessor's. With rank 0 neither can happen: `findings/RunBesideWorker.cfg` and
`findings/RestartBesideRun.cfg` found no violation once `igor run` ran as rank 0, and were
removed. A rollback of the state branch, which could put back a file with another process's id
and stop a live rank, no longer stops anyone, since no process reads its own file's id.

`igor run --plan` changes nothing: it writes no heartbeat and removes no tree.

**Two `igor run`s of one role at once share no tree and no home** (Adam, 2026-10-19). Each run
picks a run id at its start and makes that id the start of every tree id it gives, so a run
removes no live run's trees. Each run also gets a home of its own, the `HOME` its worker's
`claude -p` calls run in, which #174 (`pinned-skills`) specifies.

**Two runs at once tell their claims apart by run id** (Adam, 2026-10-21). Both run at rank 0,
so with only the rank in a claim message each read the earliest message as its own claim and
worked the item (`findings/TwoRuns.cfg` at `5dc5273`). A run's claim message now carries
`Igor-Run: <run id>`, and where the rank is 0, verification compares it. Each run also writes a
heartbeat file of its own, `heartbeats/<role>-0-<run id>.json`: with one file shared at rank 0,
a run that crashed holding a claim never read as gone while the other kept writing, and the
file's availability flipped between the two runs' values. The model now names each process in its
claim messages and keeps a heartbeat file per process. Two runs beside rank 1 pass with a crash
(`ConcurrentInstancesTwoRuns.cfg`) and with a claim given back before its worker
(`ConcurrentInstancesTwoRunsGiveBacks.cfg`); `negative/NoRunIds.cfg` drops the run id and finds
two workers.

**A run removes what a crashed run left** (Adam, 2026-10-21). At its start a run removes the
rank-0 trees of its role whose run's process is gone, with each tree's outbox, `<tree>-git` and
`<tree>-prompt`, and the home and plugin directory #174 gives that run; #174 and #175 record it. A run tells
another run's process is gone by a lock. The lock is the author's reading of Adam's "whose
process is gone", which Adam confirmed on 2026-10-21 with decision 48: each run holds an exclusive lock on `<role>-0-<run id>.lock` in the
trees' directory while it runs, which the system releases when its process ends, so a run whose
lock another can take is gone. A heartbeat file could not say this at a run's start: it takes
three poll intervals of watching, and a run runs one cycle.

**A run's heartbeat file goes when the run does** (decision 54, drawn up by this change and
approved by Adam on 2026-10-24). Every run writes a file of its own, so without a removal the
state branch would gain a file per run for good. A run removes its file as it exits; a serving
process removes a crashed run's file once it counts that run gone, which is when the file stops
mattering to the claim rules.

**A heartbeat records its process's state-directory id** (decision 55, Adam, 2026-10-24, from
#216's decision 131). In #216 (`lore-search`), an item whose run met a sensitive question is held
for a person, and the files of that hold sit in the state directory, the directory on its host
where a process keeps its own files. #216 judges such a hold stuck once no live process answers
for that directory, and the heartbeat is where a rank sees which processes are live. #216's rules read the id, to tell whether a live process, one no sibling counts gone, answers
for a directory. No claim rule of this change reads it, so the model leaves it out.

`igor run` spends the token in `IGOR_RUN_TOKEN`, an implicit local seat, as #171 records.

### An item's owner goes first

Decided by Adam, 2026-10-18, in his latest answers, replacing a start place per rank (rank k at
its k-th candidate). Each item has an owner among the ranks the roster declares: a hash of its
id, modulo the number of declared ranks, picks the owner's place in the roster's ranks in order.
Every process computes the same owner from the item and the roster, with nothing shared. The
item's order of ranks is its owner, the ranks after it, wrapping, and then rank 0. The first
rank in that order that its heartbeat shows available goes first.

**Available means free and with a seat to spend.** A rank's heartbeat says whether it is
available: holding no claim, not stood down, and with a seat it can spend, as #143's *A role has
a seat it can spend when the gate would choose one now* defines. A rank with no seat to spend would only claim
and give back, so the item falls to the next available rank.

**Ownership orders the attempts; the claim decides who works.** A heartbeat read can be half an
interval old, so two ranks can each judge themselves first for one item. Each then posts and
verifies, and the earliest message holds the item. The model makes a process attempt the items
it goes first for before the others, and `negative/NoVerifyClaims.cfg` shows that trusting
ownership instead of verifying lets two ranks work one item.

**A rank behind the owner waits one settle interval per available rank ahead of it** before
claiming, then reads before claiming and moves on silently if the item is held. That replaces
the wait of `k − 1` intervals, which counted every lower rank, busy or not. Rank 0 owns no item
and comes last in every order, so an `igor run` beside serving ranks takes what they leave.
Both, the wait per available rank and rank 0 coming last, were this change's readings of Adam's
answers, and he approved them on 2026-10-21 (decision 44).

Requests, which people make by mentioning an Igor under the open change `directed-interaction`,
join the one candidate list ahead of found work. A request is answered with no claim: the first available rank in its order,
starting from the mention's owner by the same hash, answers, and every other rank leaves it
(Adam, 2026-10-18). `directed-interaction`'s proposal says so.

### The wait settles collisions without comments

A shuffled candidate order, rejected under *Roads not taken*, would only make a collision less
likely. Here the rank that goes first reads the item first and
claims it, and the rank behind it then sees the claim and moves on. A retraction is left only
where two ranks both read the item before either has posted. The cost of a collision was never
the wasted request — it was the claim-and-retract comment landing on somebody's issue, which is
noise aimed at exactly the people the claim exists to reassure.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is what a rank behind the owner waits for, so it is not a second number to
keep in agreement with the first. It must be shorter than the poll interval (Adam, 2026-10-18):
a claim is verified within one poll interval of its message, so a settle interval as long would
make every verification late, and the role would work nothing. Such a configuration is refused,
naming both values.

### A hand-over among one role's ranks goes through the same contest

Decided by Adam, 2026-10-17. A *hand-over* is a person adding `igor:<role>` to an issue. The
in-force rule has the Igor post and start work without the settle interval, since no other Igor
competes for an item a person has given to one of them. Among one role's ranks, every rank would
read the hand-over as its own, and each would start work.

So the ranks contend as for found work: the item's owner, or the next available rank after it,
posts at once, and any other free rank waits, re-reads, and posts only if no claim message that
counts is there. Only a free rank contends; a rank whose worker is running does not. Normally
exactly one claim message appears, from the rank that goes first. The rank that posts still verifies after the settle interval, so two
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
one serving rank 2 runs at a time. It takes the item back and, unless the Igor's pull request for it is
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
one never cancels an earlier one. The adopting rank posts its own claim message, without
removing and re-adding the label, and verifies it as for any claim. Its message supersedes the gone rank's for good, even
once that rank returns; the model shows that a gone rank's message that counts again on its
return puts two workers on the item (`CatchUpSupersedes`). Adam confirmed this reading on
2026-10-18 (round three). A returning rank can tell an adopter's message from a contender's only
if the message says so, so the message carries a trailer, `Igor-Supersedes: <rank>` (task 2.14),
which Adam accepted in round three.

A catch-up's own claim message keeps counting after the catch-up gives its claim back while a
person's label stays, since no release happens. The worry was that the message would hold the
item for a rank that is not working it, so that a later claim by another rank loses to it. It
does hold the item, but for a rank that acts on it. At each cycle, a process of that rank finds a message
carrying its own rank, and reads it as its predecessor's claim whether it posted the message
itself or a predecessor did. It carries on with the catch-up, which runs no worker and changes
nothing on the item while the pull request still merges. When the pull request closes, the person's label hands the item to the Igor again, and that
rank works it. Once the rank is gone, a later claim supersedes its message.

**The holder triages such an item again only when something changed** (Adam, 2026-10-18, round
four). Round three took `work-triage`'s exception, for a catch-up's claim message that keeps counting,
to mean triaging the item every cycle while the pull request is open: a model call each for
nothing. Now the holder passes the item over before triage unless the item or
its pull request has updated since the holder last triaged it, or the pull request no longer
merges. The last triage time is kept in memory, so a restarted holder triages the item once.

**A review to act on means resume** (Adam, 2026-10-18, in his latest answers). On the Igor's own
pull request for an item the holder holds, where it still merges, a review to act on, #150's actionable review, counts as
something changed: the holder triages the item and resumes it with a worker, as #150 says. A
catch-up over a pull request with no such review still runs no worker. #150 defines a review to
act on only for the Igor's own two-gate pull request, so this rule applies only there, a reading
Adam confirmed on 2026-10-21 (decision 51); any other held pull request keeps the catch-up's rule.

### Retirement is recorded, not detected

Retiring a process is a decision, so there is nothing to detect. A crash is not retirement: the
supervisor restarts the process and it recovers its own claim.

The roster — the ranks each role may run — is declared configuration in `igor.config.yaml`. The supervisor starts processes and the roster says which may run: a
process whose rank the roster lacks refuses to start, so the two cannot silently disagree.

Counting instances at runtime would be a registry. Being told what exists is configuration.

**A rank removed from the roster shuts down** (Adam, 2026-10-17, round two). A process reads the
roster at the start of each cycle. One whose own rank has left it starts no claim, and behaves as
when the supervisor asks it to shut down: it finishes the item in hand or hands it off out loud,
then exits. It keeps writing heartbeats
until it exits. Siblings adopt its claims only if it dies first, once its heartbeat has failed
to change for three polls, the same bound as for a declared rank that stopped running, and its
trees are swept then too. The model shows that adopting such a claim at once lets two processes
work one item (`RosterWaits`). This replaces an earlier choice, that such a process stood down
and left its claim for a sibling to adopt once its worker stopped.

**It exits with status 0, a clean exit** (Adam, 2026-10-18). #82 (`stopped-scope-visible`) has
the unit restart a process only on a failure, `Restart=on-failure`, and never after a startup
refusal, which exits 78 (`RestartPreventExitStatus=78`). Compose, under #82, restarts every exit,
0 included, so there a rank is retired by removing its service (`docker compose up -d
--remove-orphans`), as #82 says. Under the systemd unit a retired rank stays down, its unit inactive with Igor's line saying the roster no
longer declares the rank (task 4.25) in the journal, and a person who starts it again while the
roster still leaves it out gets the refusal. A retired rank needs no
status of its own; the 79 that round four gave it, with `SuccessExitStatus=79`, is gone. Nothing alerts anyone: the unit's state and
its journal say why. Measured on 2026-10-19 under systemd 252: with `Restart=on-failure` and
`RestartPreventExitStatus=78`, an exit 0 was not restarted and the unit showed inactive, an exit
78 showed failed, and an exit 1 was restarted. This change's unit has those lines (task 1.3), so a
retired rank, which exits 0, stays down.

The abandonment bound is therefore what frees any rank's claims, whether the rank crashed and
was not restarted, was left in the roster with nothing running, or was removed from it.

**No condition makes a process exit, and a failing configuration read at a cycle is refused**
(Adam, 2026-10-18, round three). Where the configuration a process reads at the start of a cycle
fails a check a starting process makes on it, the process goes on under the last configuration
that passed, roster included, and raises a condition naming the failing file and the check.
Adam's reason: an exited process comes back only by a systemd
restart loop or a person, a restart reads the same state, and anything a person fixes a running
process can pick up. Refusing to start on a bad configuration stays. #208 (`lore-pull`), which
specifies pulling the lore checkout for issue #176, records the same rule for a pull, and owns the
condition: it is `lore:config:<role>`, shared by the role, since one passing commit cures every
rank. Three kinds of passing read clear it: a read of the refused commit, a read of a commit
descending from it, and a read of a branch head that no longer holds the refused commit, as after
a force-push. A read of a commit already known does not open it again (#208's decisions 13, 36
and 37). A rank that passes on an
older commit has not seen the cure, so its read clears nothing. Whether the roster declares the
rank is no startup check on a lore read: a read whose roster drops the rank passes, and the rank
retires (#208's decision 30). This change follows #208 on all of it (decision 47). The condition is of
the read-cleared kind (Adam, 2026-10-18, round four), which #171 (`seat-files`) defines once in
`stuck-conditions`, where #171 also uses it for a seat file Igor cannot decrypt; this change
cites that definition rather than stating it. Under #171 and #208 the configuration a cycle
reads includes the seat files in the lore checkout, and where a read is refused but finds a seat file deleted, the deletion still takes effect, the one exception #171's *A removed seat file always takes
effect* makes.

**Each rank writes a heartbeat** (Adam, 2026-10-13). Every process overwrites its own small file
on the state branch, `heartbeats/<role>-<rank>.json`, every half poll interval (round three). A
timer of Igor's own writes it, apart from the cycle and from any worker, so it keeps writing
while a worker runs. Its first heartbeat lands before its first cycle (Adam,
2026-10-17): until then its file shows only its predecessor, who may have been gone long enough
that a sibling still counts the rank gone, and so leaves out every claim message of that rank,
the new process's included. **A rank is gone when its heartbeat has not
changed for three poll intervals**, measured as `work-claiming`'s *A heartbeat declares its
process's poll interval* says: the longest of the watcher's own interval and those the sibling
declared, or the 30-minute maximum where the watcher has seen no declaration (decision 49). At
the default 10-minute poll on every process that is 30 minutes, six missed firings of its timer. The bound is that fixed multiple of the poll interval; it has no setting of its own. Any
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
sibling gone once three poll intervals, measured as above, pass after that moment, or after its
own start if that is later.

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
Adam decided on a counter that advances, and accepted reading "advances" as "differs from the
last read", with the id picked at each start, on 2026-10-18 (round three).

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

**All the role's heartbeat files are read in one request** (Adam, 2026-10-17). Every rank of a
role acts as one GitHub App, so all of them share one budget of GitHub's rate limits, and a read
per file before every candidate and verification would multiply against it. A rate limit that
stopped heartbeats would stand every rank down at once. Under the counter a file has changed
exactly when its blob id has. Since each file also says whether its rank is available, the read
returns the files' contents too: one GraphQL query for the `heartbeats/` tree's entries can give
each blob's id and text, spending the `graphql` limit rather than `core`. Task 4.11 measures that
query. For the REST alternative, measured on 2026-10-19 (task 4.19), one Git Trees read and one
Contents PUT each cost one `core` request; the requests per cycle per rank, and an App
installation's own limit, are not yet measured. GitHub also documents secondary
limits on writes, 80 a minute and 500 an hour, which every rank's heartbeat writes count against.

**One heartbeat write takes about a second, far inside its half-interval period** (measured
2026-10-19), so a write that conflicts and retries still lands long before a process would stand
down. A Contents PUT took 0.62 to 1.04 s alone. Writes to different paths still conflict on the branch: with two writers at one
instant every round collided, the loser got a 409 and its immediate retry landed, within 1.7 s;
with three, the last needed three attempts and landed within 2.7 s.

**A rank that cannot write its heartbeat stands down** (Adam, 2026-10-17). After two poll
intervals without a heartbeat landing, as in an outage or under a rate limit, a process starts
no claim, leaving its claims as they are. It resumes once a heartbeat lands. Two is one fewer
than the three a sibling waits, so the process has stopped its worker before any sibling may
count it gone and take its claims.

**It keeps the claim in silence** (Adam confirmed, 2026-10-17, round two). By the time it stands
down, a sibling may already count it gone and have taken the item over, so a release could undo
the sibling's fresh claim. That is the stated exception to *A claim that cannot be kept is given
back, out loud*. A sibling takes the claim over once the rank is gone.

**The heartbeat timer stops a stood-down worker** (Adam, 2026-10-18, round three). At each firing,
every half poll interval, the timer that writes the heartbeat also checks whether the process has
stood down, and if it has, stops the worker itself. Deciding to stand down needs no tracker read,
so the timer needs nothing from the worker. On `main`, by contrast, a checkpoint is the claim
re-read in `src/execute.ts`, made on a worker event at most once every 30 seconds
(`CHECKPOINT_INTERVAL_MS`). `claude -p` runs with `--output-format stream-json` and no partial
messages, so a model turn is one event when it ends: a worker may go `MODEL_SILENCE_MS`, 5
minutes, with no event while the model writes, and `TOOL_SILENCE_MS`, 30 minutes, while a tool
runs. At the default 10-minute poll, 30 minutes is three intervals, the whole bound, so a sibling
could count the rank gone while its worker still ran. Waiting for
an event to stop a stood-down worker would have needed a rule on how far apart events may be;
the timer needs none. A person's stop is still seen on worker events, as on `main`.

Round one had two rules for the event gap: a worker reaching a checkpoint at least every two poll
intervals, and a process standing down at one missed heartbeat where its worker could go longer
than one. With the timer stopping a stood-down worker within half an interval, neither can
matter, and both are removed. The model checks the timer against workers whose events come two
intervals apart (`TimerHalts`).

**Taking over a gone rank's claim releases the item first** (Adam, 2026-10-17). The taker
removes the role's label and adds it again before posting its claim message, and posts at once.
Without that, the gone rank's earlier message stays the earliest since the latest release,
counts again once the rank returns, and the returning rank takes the item back as its own while
the taker works it. An item with no label can carry such a message too: a rank mid-claim posts
it just after the holder gives the claim back. A taker of that item adds the label, removes it
and adds it again. TLC found this case on 2026-10-18, once the model let a holder give its claim
back before its worker started (*Only the rank holding a claim gives it back*, below), and Adam
confirmed the release the same day (round four). A claim on the Igor's open pull request is the exception, taken over by a
superseding claim message instead, as above.

One file per rank means a write replaces only that rank's own heartbeat. It does not avoid write
conflicts: a write to any path on the state branch is rejected while another write moves the
branch (see *State becomes append-only*). A rejected heartbeat is retried like any other write,
and a retry cannot overwrite a sibling's file.

The bound governs how long an *unattended claim* may sit, never how long *work* may run.

### Ranks do not coordinate on a lore commit

Decided by Adam, 2026-10-21 (decision 43). Each rank applies the newest lore commit it has
fetched, at its own cycle start, so ranks run on different rosters and poll intervals for a while
after a commit lands. His reasons: the skew cannot be removed, only shortened, since each rank
reads at its own cycle start, and a rank whose worker runs for hours starts its next cycle that
much later; safety rests on the claim, not on the ranks agreeing; and coordinating which commit
they read would add failure modes of its own, a rank waiting on another being one.

The model gives each process its own roster and poll interval, applied at its own cycle start.
The *lore head*, the newest commit of the lore repository's branch, may drop a rank or double
the poll interval. A rank that has not fetched the head yet keeps what it had.

- **Different rosters are safe.** The roster orders attempts and retires ranks, and a retired
  rank's claims are taken only once it is gone, so the claim keeps one worker per item. Every
  configuration with a rank removed passes.
- **Different poll intervals are safe because each heartbeat declares its interval, and a
  watcher with no declaration counts in a maximum** (Adam, 2026-10-21 and 2026-10-24, decision
  49). The gone verdict compares durations kept by two processes: a writer stands down after two
  intervals without a heartbeat, and a watcher counts it gone after three. Each counting in its
  own current interval, a writer that applied a doubled interval while the watcher did not
  stands down only after four of the watcher's intervals, so three missed heartbeats let the
  watcher take the item over while the writer still works it. So each heartbeat declares its
  process's interval, and a watcher counts in the longest of its own current interval and the
  intervals the sibling declared in heartbeats the watcher saw written since the later of its own
  start and the last loss or rollback it detected. The watcher's own interval stays in. A
  watcher on the doubled interval verifies a claim within one of its own intervals; counting in
  a sibling's shorter declared interval alone, it counted the sibling gone after three short
  intervals, which can fall inside that verification window. TLC found the sibling, which had
  stood down, resuming and working the item beside the watcher
  (`ConcurrentInstancesPollSkewCrash.cfg`, before the watcher's own interval was added). A writer
  stands down after two of the shortest interval it has applied since it started. Every interval
  it declared is one it applied, so that is never longer than an interval it declared, and it
  stands down before any watcher counts it gone. `ConcurrentInstancesPollSkew.cfg` passes with the rule, and
  `negative/NoDeclaredInterval.cfg` finds two workers without it.

  A watcher that restarts, or that detects a lost or rolled-back state branch, may hold no
  declaration from a sibling, and then counts in Igor's maximum poll interval, 30 minutes. The
  maximum is three times the default 10-minute poll interval: a role may triple its interval,
  and a watcher that has lost every declaration adopts a claim after at most 90 minutes. No
  writer can apply a longer interval, since `role-config` refuses a poll interval above the
  maximum (decision 49), so none stands down later than two of the maximum, 60
  minutes. The cost is slower adoption after a loss, a rollback or a restart, up to 90 minutes,
  until the sibling's next heartbeat lands; in normal running declarations keep it to three of
  the sibling's own interval. The maximum is fixed in Igor rather than configured, so every
  rank of a role assumes the same one. A declaration counts only from a heartbeat seen written,
  its counter changed, because a file read once may be a rolled-back copy declaring an older,
  shorter interval. `negative/NoCeiling.cfg`, where a watcher with no declaration counts in its
  own interval and what the file says now, finds two workers.

  A first remedy was rejected on 2026-10-24: a writer standing down in the shortest interval it
  had read any sibling declare. TLC found a watcher that moved to the shorter interval after the
  writer last read the watcher's file. The writer, not knowing of the move, stood down later
  than the watcher counted it gone, and still worked the item when the watcher took it.
  *Rejected also:* refusing a cycle read that changes the poll interval, so that it changes only
  when every rank restarts, which still leaves skew between restarts.

### Only the rank holding a claim gives it back

Decided by Adam, 2026-10-18, round three. The ranks of one role share one label, so a removal by
any of them releases the item for all of them. The in-force rules remove it in several places
other than a run's end: a verification that fails, a failure before the worker that repeats
(#173, `pre-worker-breaker`), and a stop. So only the rank whose claim message holds the item
removes the label; any other rank drops out silently, removing and posting nothing. A rank that
loses to a sibling already kept the label (*A process that loses to its own role keeps the label
on the item*, above); this extends that to every give-back.

**After a failed read, the claim still goes back out loud** (decision 46, drawn up by this change
and confirmed by Adam on 2026-10-21, reconciling #173's decisions 22 and 35 with the silent late verification of decision
28). #173's *claim window* is the time from posting a claim message to verifying it. When a
claim fails there, #173 has the rank read the item's claim messages, its *test*. Where no other
rank's claim message counts, the rank posts the *refusal*, the post a refused run makes when it
gives the claim back to be tried again next cycle, or, at a third identical failure, the
*set-down*, which defers the item. Where the test's read fails, the rank reads again at its next
cycle and gives the claim back out loud unless another rank's claim counts. Where that reread
fails too, the claim is #173's *unreadable claim* (Adam, 2026-10-21, decision 52): it counts as
one `tracker` failure toward the item's breaker, and the rank posts the refusal, or the set-down
at the third in a row. It leaves the label, because it cannot tell whether a sibling holds the
item: where a process removes the label after its reread fails again, TLC finds a sibling working an item whose label is gone
(`LabelWhileWorked`, `negative/NoRereadKeepsLabel.cfg`). Before this
revision, this change had a process whose verification failed count as not holding the item,
and a verification later than one poll interval stand down in silence, so neither could post.
Both now follow #173: after a failed post or verification the process makes the test, and its own
message holding means it holds the item. A late verification works nothing, which is what the
proposal's decision 5 needs, and gives the claim back the same way. Apart from a process whose test found another process's claim message counting, which drops
out silently, only a process that stood down for missed heartbeats stays silent: its claim stays in place until a sibling counts it gone, and that sibling takes the item over and says so.

**A withdrawal reads again before it removes the label** (decision 45, drawn up by this change from
#173's decision 29 and confirmed by Adam on 2026-10-21). #173's test and its removal of the label are two tracker calls, and a claim posted
between them must not be released while its process works. Removing the label releases every
claim message posted before the removal, since a release is ordered against a message by time,
so the timing of the removal cannot protect a claim posted between the two calls. What protects
it is who may withdraw: only a process whose own message holds the item. Any message posted
after the test is later than that one, which still counts, so its process loses at
verification. A fresh read of the heartbeat files and the claim messages just before
the removal adds two things: it sees a message posted since the test, and keeps the label on;
and it sees a rank that has come back since the test. TLC found the second. A process P's test
failed, and P reread the item a cycle later. By then the rank whose message was earlier than P's
was gone, so P read itself as holding. That rank then restarted and recovered the item, and P
removed the label from under its worker (`LabelWhileWorked`). The model makes the fresh read and the removal one step, as it does
a takeover's read and release. *Rejected:* recording the latest claim message's id at the test
and re-checking after the removal, which the report from #173 suggested. A message the re-check
finds was posted before the removal, so it no longer counts, and the re-check cannot make it
count again.

**A failed post's label is the first listed exception** (Adam, 2026-10-21, decision 42); the
second is a stop on an item no claim message holds, answered by the process that reaches it. A process that set
the label and whose claim message failed to post has no message to hold by, so the holder rule
alone would leave the label on an item nobody holds, which the next cycle claims anyway. Adam
decided the process removes the label it set, as a listed exception. With no message of its own,
nothing stops a sibling that posts after the test from verifying before the removal, and the
removal would then release that sibling's claim while it works. So the removal is bounded: the
process sends it only while less than half a settle interval has passed since it started to set
the label, by its own monotonic clock, and otherwise sends none and leaves the label. A sibling
can post only after the label is set, and verifies a settle interval after posting. The half
interval left over is for the removal to land and be visible, the visibility the settle wait
itself assumes, so the sibling verifies after the removal, finds the label gone, and works
nothing. The bound compares two durations, each on its own process's clock, as the settle wait
does. `negative/NoSettleWithdraw.cfg` removes the bound and finds two workers.

**Only the holder answers a stop on a handed-over item** (round three). The in-force rule has the
Igor remove its label and post a stop receipt when it sees a stop while no run of its own is
active. A rank cannot see a sibling's run, so a rank not working the item would post a receipt
saying the Igor stopped while the sibling's run went on to its next checkpoint. Where no claim
message on the item counts, because no rank has claimed it yet or its holder is gone, there is
no holder to leave it to, so the rank that reaches the item answers it, a reading Adam confirmed
on 2026-10-18 (round four).

The model shows both rules are needed (`HolderReleases`, `HolderStops`). Checking them also
showed that the in-force stand-down on a stop seen at verification is a give-back too: a rank
that did not hold the item answered the stop while the holder's run carried on, and the model
now applies `HolderReleases` there.

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
  source (task 5.11). A mark belongs to a role and rank, never to one run (Adam, 2026-10-18,
  round three), and #106 now allows that, citing this change.
- **PR #99** adds the candidate ids a cycle carries to the next. They become log lines too,
  replayed per source as the union of each rank's latest (task 5.12).

### The replayed watermark is the lowest live rank's

Decided by Adam, 2026-10-13. Each line of the `discovery.json` log names its source, its rank and
its mark. The replay takes each rank's latest mark for a source, and uses the lowest of those
from ranks that still count. A rank past the abandonment bound stops counting. When no rank
counts, which happens only for a process whose own rank has saved no mark yet, since a process's own
rank always counts, while every rank that has saved one is gone, the
replay uses the lowest of every rank's latest mark rather than starting cold: a cold start would triage every
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
that stops early holds its mark back as #101's change to *Watermarks reduce reconsideration
without governing it* says; #101 archives first, so this change cites that rule rather than
restating it. Adam decided on 2026-10-18 (round four) that the reasons a cycle that stops early holds its
mark back, a stand-down among them, belong in that rule, and this change carries a `MODIFIED`
block on it that adds the stand-down (decision 36). A mark appended right after triage
passes every item the cycle meant to take, and a crash before the
claims would leave those items untaken below every mark. The code on `main` already saves the
mark only after the items are worked (`report.settle` in `src/serve.ts`, and `markAfterWork` in
`src/cli.ts`), so for one process this rule describes what the code does.

**Every cycle also considers every item carrying its role's label** (Adam, 2026-10-17), whatever
the mark. A crashed rank's claimed item can sit below every mark: a sibling saw it while the rank
still counted, passed it as held, and marked past it, and the crashed rank's own lower mark
stopped counting once the rank was gone. Without this, nothing offers the item again, and the
claim is never recovered.

#101 (`condition-backoff`, merged) re-reads `discovery.json` before saving and writes only the
saving cycle's own sources, so roles no longer put back each other's marks. Two processes of one
role still write the same source, and there the later save wins. Task 5.1 replaces that save
with the log: an append overwrites nobody's marks, so the log protects other roles' marks as
#101's re-read does.

### The tree sweep goes by rank, and the ceiling goes

A working tree's name carries its role and rank. At startup a process removes the trees of its
own role and rank, which its dead predecessor left: only one process runs at a rank, so none of
them is in use. It never removes another declared rank's, so it needs no age (Adam, 2026-10-13).
It leaves a declared rank's trees even once that rank is gone: a sibling may take a gone rank's
claims, but deleting a tree that is still in use corrupts a run, and leaving one costs only
disk. A rank the roster no longer declares will not come back, so its trees are removed, but
only once it is gone, at the start of a cycle (Adam, 2026-10-17).

**Rank 0's trees are `igor run`'s alone** (Adam, 2026-10-18). Rank 0 is no rank the roster
declares, but no serving rank removes its trees: an `igor run` may be running, and no worker
user exists for rank 0 to remove them as. Each `igor run` removes its own as it releases them,
and at its start those of runs whose process is gone (decisions 38 and 39).

**Trees live where every rank on the host can see them** (Adam, 2026-10-17). A sweep in each
instance's private temporary directory would never see another rank's trees, so trees go in a
directory every instance shares, which #175 (`worker-user`) specifies.

**The sweep takes each tree's git directory and prompt directory with it** (Adam, 2026-10-17,
and decision 48). PR #175, not merged, adds a git directory beside each tree, named `<tree>-git`,
and a prompt directory, `<tree>-prompt`, holding the system prompt file a worker's `claude -p`
reads. Prompts go on stdin under #175, but the system prompt still goes in that file, and a
crash leaves it. This change sweeps both with the tree, assuming those names, and task 4.20
checks them against #175 as merged.

**A sibling sweeps the trees of a gone rank the roster no longer declares as #175's release
removes them** (Adam, 2026-10-18): the
tree and its outbox as that rank's worker user, who owns what the worker wrote, and `<tree>-git`
and `<tree>-prompt` as the service user, who owns them under #175 and whom the worker user cannot
act for.

Adam decided on 2026-10-13 to remove `ABSOLUTE_CEILING_MS` entirely, including the worker's
6-hour kill.

**What bounds a worker once the ceiling is gone** (Adam, 2026-10-13). The silence windows kill a
worker whose stream goes quiet. A worker that keeps emitting events and never finishes is not
killed by any limit; that is accepted. Two things contain it instead. A person can stop it: a stop
is honoured mid-run at the next checkpoint (`surface-adapter`, scenario *Stop is detected during
long execution*). And the seat's reserve line, from #143 (`read-seat-windows-from-the-stream`), stops new items once
the seat's spend crosses it, so a runaway worker cannot draw others after it. #143 is
not built; until it is, the stop alone contains such a worker, and this change does not wait for
it.

**A probe lapses when its Igor stops keeping it alive in the log** (Adam, 2026-10-24, decision
22). #101's `condition-backoff`, on `main`, lets one item through after a recurring fault stops a
role or seat, to test whether the fault has cleared: a probe. It lapses a probe that never ends
after `SWEEP_AFTER_MS`, the worker's ceiling plus an hour, and this change removes that ceiling.
A probe recording its rank and lapsing when the rank is gone, as Adam first decided on
2026-10-13, cannot be judged by a process of another role sharing the seat, which watches only
its own role's heartbeat files; and #228 (`probe-claim`) requires every Igor in a scope to judge
a lapse alike from the log, since Igors that disagree on which probes have lapsed disagree on
which probe decides. So the process working a probe item appends a keepalive row to the log
every poll interval, and the probe lapses once 90 minutes, three of the maximum poll interval,
pass without one. The model does not cover probes; #228's model covers the race between competing probe bids.

### Derived timings are fixed multiples of the poll interval

Four timings follow the role's poll interval and have no setting of their own: a rank is gone
after three intervals, a heartbeat is written every half interval, and a process stands down
after two intervals without one (Adam, 2026-10-18, round four); and a probe's keepalive is
appended every interval (decision 22, Adam, 2026-10-24). The in-force `role-config` said every
interval is configurable; this change's MODIFIED *Timing values are configurable with stated
defaults* keeps the poll interval configurable and makes these four the exception. TLC checked
safety at the first three ratios only, since the model does not cover probes, and the rules depend on them: the stand-down threshold must
be shorter than the bound, so that a process has stopped its worker before a sibling counts it
gone. The settle interval stays configurable but must be shorter than the poll interval.

### Decisions of 2026-10-28

The consistency read of 2026-10-21 left seven questions for Adam, listed in the proposal's
*Still open*. Adam answered two on 2026-10-28, and the agents coordinating this work settled the
five that had one good option or an answer already given (proposal, decisions 62 to 68). The
spec deltas and tasks that follow from these decisions are still to be written.

- **A mention that acts goes through a claim** (decision 62, Adam). Decision 37 lets a mention
  go unclaimed because a second reply costs nothing. Under #140 an answer can open an issue or
  carry out an option the person chose, which is not harmless twice, so such an answer takes the
  claim any item takes.
- **Two processes on one rank are detected** (decision 63, Adam). A second writer of a rank's
  heartbeat file shows as the file's write counter going back under the reader's own process id,
  or as another host or process id writing it; the rank then stops with a condition naming the
  hosts. The model has no hosts, so a task and a test cover it.
- **The deferral wins over the label** (decision 64). A set-down, #173's deferral of an item
  after repeated failures before its worker, follows a third claim in a row whose claim messages
  cannot be read, and leaves the role's label on. Every cycle considers each labelled item, so
  without this rule the unreadable claim would be tried again every cycle; a deferred item is
  passed over before claiming until the deferral ends or a person adds the label again.
- **The refusal and set-down posts share decision 42's bound** (decision 65). Decision 42 lets a
  process whose claim message failed to post remove the label only within half a settle interval
  of setting it, so that no sibling's claim comes after; #173's refusal and set-down posts take
  the same bound, for the same reason.
- **#171 is asked to let a read-cleared condition take clearing rules** (decision 66). #171's
  read-cleared kind clears on any later passing read and lets a citing rule add none, while
  #208's `lore:config:<role>` needs its own limits; #208 asked #171 to allow them, and this is
  reported to #171, which decides.
- **A mention with no rank available gets the seat's reset time** (decision 67), from its hash
  owner, as `docs/architecture.md` promises.
- **A run id starts with a letter** (decision 68). A rank is digits only and a role's name may
  end in a dash and digits, so a run id of digits could make a run's heartbeat file name read as
  another role's rank, as `heartbeats/web-0-12345678.json` does.

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

**TLC finds no violation in the change as specified, within what the model covers.** The model
leaves out decision 54's removal of a run's heartbeat file, decision 55's state-directory id
and the probe keepalive, none of which a modelled invariant reads. It also never grows a roster.
Decision 56 makes a role count as run by several processes while any sibling's heartbeat file is
live, so its contest on a hand-over differs from the roster's count only when a rank is added,
which the model does not do. Each rule the model checks is a constant,
TRUE in the change as specified. The twenty-one configurations CI runs, and `ConcurrentInstancesPollSkewFull.cfg`, set every rule TRUE.
Each of the twenty-one passes every invariant it checks, and `PollSkewFull` had found no violation
when this revision was pushed (*Bounds and results*). Each file in `model/negative/` turns one rule off and checks only the property that
breaks without it; TLC finds that violation, which shows the rule is needed. CI checks both: the
configurations beside the model must pass, and every negative file must fail.

The model's first run found eight ways the change, as first written, let two processes work one
item, lost an item, or never recovered a crashed rank's claim. Adam decided each on 2026-10-17
and added a ninth rule, for a rank that cannot write its heartbeat. Two reviews of the change
against the in-force specs and the open pull requests then raised twenty questions. Adam's
answers, the same day, added four more rules the model shows are needed (10 to 13
below). Adam's second round of decisions that day added three more (14 to 16), and dropped the
taker's wait for its release's second: every configuration now runs with a claim message free to
land in that second and not count. His third round, on 2026-10-18, added two (17 and 18) and
replaced 13 with the heartbeat timer. Modelling claims given back before the worker found two
holes. A rank that did not hold an item answered a stop seen at verification by removing the
label, which 17 now forbids. And a taker of an unlabelled item that still carried a gone rank's
claim message posted without releasing first, which *Taking over a gone rank's claim releases the
item first*, above, now covers. His latest answers, the same day, replaced the fence his fourth
round had added for `igor run`, a wait and a start id in rank 1's heartbeat file, with rank 0, and the start place per rank with a hash-assigned
owner. The model now runs each `igor run` as a process at rank 0, and orders each process's
attempts by ownership (`OwnerFirst`), with the claim's verification still deciding who works
(`VerifyClaims`, 19 below). With `OwnerFirst` FALSE, every process attempting candidates in the
source's order, TLC finds no violation either: ownership only orders attempts. That was checked on
`ConcurrentInstances.cfg`, which then reaches 48,323,006 distinct states rather than 48,487,914,
since a different order reaches different states; on `ConcurrentInstancesLiveness.cfg`; and on a
rank-0 configuration with a crash, a lost branch, a hand-over and two missed heartbeats
together, which finished at 145,557,318 states in 21 minutes. The model also
lets a person edit a claim message; the rule that an edited message counts for nothing is no
constant, since the model simply removes the edited message from those that count, so it has no
negative file. Allowing edits shows a hole, under *Findings*, below.

Adam's answers of 2026-10-21 changed the model in four ways. A claim message names its process,
and each `igor run` has a heartbeat file of its own, so two runs at once no longer read each
other's claims as their own (`RunIds`, 20 below). A claim given back before its worker now
follows #173: after a failed post or verification the process reads the claim messages, its
test; holding the item, it withdraws, removing the label in a later step after a fresh read;
where the test read fails, it reads again at its next cycle's start. A process whose claim
message failed to post removes the label it set within half a settle interval
(`SettleWithdraw`, 21 below). And each process applies its own roster and poll interval at its
own cycle start, with each heartbeat declaring its process's interval (`DeclaredInterval`, 22
below), and a watcher that has seen no declaration from a sibling since the last loss counts in Igor's
maximum poll interval (`Ceiling`, 24 below; 23, `RereadKeepsLabel`, is another rule). A new invariant, `LabelWhileWorked`, checks that no give-back removes the label
from an item a worker runs on. Before the withdrawal's fresh read was added, TLC found it
violated in `ConcurrentInstancesGiveBacks.cfg` and in a two-run configuration with a crash and
a claim given back together: a process
rereading a cycle late counted gone the crashed rank whose message was earlier than its own, and
removed the label after that rank had restarted and recovered the item.

These rules are checked without a negative file:

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
forever* requires, whether or not the item carries the label. With the pull request open, the
taker's message supersedes instead.

**States are fingerprinted by what a step can tell apart, not by clock.** Update times and marks
are values of a counter every tracker write advances, so two runs alike but for how many writes
came between were distinct states. Each configuration declares `VIEW StateView`, and TLC
fingerprints a state by that view instead.

The view used through round four replaced each time by its place among all the times in the
state, update times and marks alike. Its distinct-state counts varied by about 0.15% from run to
run (`ConcurrentInstancesLongGaps.cfg`, 1,549,443 to 1,551,723 with 8 workers), which shows it
merged states whose next steps it then fingerprinted differently. An example:

- State A has update times 3 and 4; state B has 3 and 5. In both the times have places 1 and 2,
  so the old view merged A and B.
- In each, a cycle cut short appends a mark one below the later item's time: 3 in A, 4 in B.
- Both marks pass exactly the earlier item, so the two successors behave alike. But in A the mark
  equals the earlier time and in B it lies between the two, so the old view gave the successors
  different places, and TLC counted them as two states.

Which of A and B TLC kept, a matter of thread timing, so decided which successors
it went on to count. Verdicts were not affected, since the merged states always behaved alike.

The view now keeps exactly what a step can tell apart (decided 2026-10-18): each item's place
among the items' update times, and each mark's count of the items it passes. Every guard asks
whether an item is above a mark, takes the least or greatest of some marks, or takes the greatest
update time among some items; a new update time is always the latest; and a new mark passes
exactly the items updated before some item, or that item too. Two states with the same view are
therefore the same up to a renaming of times, and every step of one maps onto a step of the
other. Run twice, each configuration now gives the same count (see *Bounds and results*), and the
counts are smaller: `ConcurrentInstancesLongGaps.cfg` has 582,427 distinct states, against
1,551,474 under the old view and 22,856,832 with no view at round four.

Every configuration was also run once with no view, to compare verdicts and counts (*Bounds and
results*).

### Invariants and properties

| Name | Requirement it proves | What it says |
| --- | --- | --- |
| `NoTwoWorkers` | *A claim names the process that took it*; *Assignment expresses a claim; ordering resolves it*; *A hand-over among one role's ranks is contested like found work*; *A claim left on the Igor's open pull request is caught up*; *A run by hand runs as rank 0* | Never two live workers on one item, a catch-up's and an `igor run`'s included. |
| `LiveRankNeverGone` | *A retired rank does not hold its items forever*, scenarios *The bound does not shorten a run*, *A lost state branch takes no live rank's claim*, *A rolled-back state branch takes no live rank's claim* and *A rank whose clock goes back is still counted* | A live rank's claim is never taken: no other process judges gone a running rank that has written its heartbeat since it started and has not stood down. |
| `MarkNeverPassesUntaken` | *Processes saving one source keep the lower watermark* | The replayed mark never passes an item no live process has taken: such an item is among some live process's candidates this cycle, or above the mark some live process would replay. |
| `HandOverStands` | *A hand-over among one role's ranks is contested like found work*, scenario *A taken-over hand-over still stands* | An item a person handed over reads as handed over while it carries the label, until a release or a stop ends the hand-over; a catch-up keeps it. |
| `NoReceiptWhileWorked` | *Only the rank holding a claim gives it back* | A stopped item's label is off only once no worker runs on it, so a stop receipt never says the Igor stopped while a run goes on. |
| `LabelWhileWorked` | *Only the rank holding a claim gives it back*, scenarios *A withdrawal takes no claim that came after its test* and *A claim message that failed to post leaves no label behind* | No give-back removes the label from an item a worker runs on. |
| `OrphanRecovered` (liveness) | *A process recovers the claims of its own predecessor*; *A retired rank does not hold its items forever*; *Every cycle considers the items its role's label holds*; *A claim left on the Igor's open pull request is caught up* | A crashed or retired rank's claims are eventually recovered: a labelled item that no running process holds and no run has finished is eventually worked again, finished or released. |
| `EveryItemHandled` (liveness) | *Processes saving one source keep the lower watermark*, with *A process recovers the claims of its own predecessor* | Every item is eventually finished or stopped. |
| `StopNeverLost` (liveness) | *Stop is unconditional and open to anyone*, already in `openspec/specs/work-claiming`, not added by this change | A stop is never lost: eventually no worker runs on the item and its label is off, for good. |

The liveness properties hold in behaviours where some process is eventually always running.

*A conflicted state write discards nothing*, with the scenario *A heartbeat replaces only its own
rank's*, is assumed rather than proved. It says a rejected write is retried and lands the same line,
so the model treats a conflict as a delay before the write lands, during which a crash can lose it.

*Contention is resolved before a claim, not after it* is checked only as far as it orders
attempts: the model computes each item's owner and the first available rank from the heartbeat
files' availability, and has each process attempt the items it goes first for before the
others. It does not time the wait behind the owner, so every free rank may post, and the model
checks that verification leaves one worker. The same holds for the wait in the hand-over
contest. A configuration with one item tracks no availability, since every process then attempts
the same one item.

*A mention is answered by the first available rank* (`directed-interaction`) is not modelled. A
mention claims nothing and starts no worker, so no invariant here speaks of it, and Adam accepted
that a stale heartbeat can bring a second reply.

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
13. **Igor's heartbeat timer stops a stood-down worker** (`TimerHalts`, `NoTimerHalts.cfg`, with
    worker events two intervals apart). Waiting for the worker's next event instead, the worker
    may still run at the third missed heartbeat, when a sibling counts the rank gone and takes
    the item. TLC: `NoTwoWorkers` violated.
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
17. **Only the rank holding a claim gives it back** (`HolderReleases`, `NoHolderReleases.cfg`).
    A rank that gives its claim back before its worker starts removes the label while its
    sibling, the holder, works the item; the rank claims the unlabelled item again at its next cycle and works it too. TLC:
    `NoTwoWorkers` violated.
18. **Only the holder answers a stop on a handed-over item** (`HolderStops`,
    `NoHolderStops.cfg`). A rank that is not working the item removes the label on the stop
    while its sibling's run goes on. TLC: `NoReceiptWhileWorked` violated.
19. **A claim the poster goes first for is still verified** (`VerifyClaims`,
    `NoVerifyClaims.cfg`). Trusting ownership and its own heartbeat read, a rank works an item it
    goes first for as soon as its message is posted; another rank, whose read differs or which
    does not go first, posts too and verifies, and its message can be the earlier. TLC:
    `NoTwoWorkers` violated. So ownership alone keeps no item to one worker, and the claim is the
    safety net.
20. **An `igor run`'s claim message carries its run id** (`RunIds`, `NoRunIds.cfg`). With rank 0
    alone, two runs of one role each read the earliest rank-0 message as their own claim. TLC:
    `NoTwoWorkers` violated.
21. **A failed post's label is removed only within half a settle interval** (`SettleWithdraw`,
    `NoSettleWithdraw.cfg`). Removed whenever the test finds no message that counts, it releases
    a sibling that posted after the test and verified first, and the process claims the item
    again while the sibling works it. TLC: `NoTwoWorkers` violated.
22. **Each heartbeat declares its process's poll interval** (`DeclaredInterval`,
    `NoDeclaredInterval.cfg`). Counting in its own current interval instead, a rank on a
    doubled interval stands down only after four of its sibling's intervals, while the sibling
    counts it gone after three and takes over the item it still works. TLC: `NoTwoWorkers`
    violated.
23. **A reread that fails again leaves the label** (`RereadKeepsLabel`,
    `NoRereadKeepsLabel.cfg`). Removing it, the process releases a sibling that holds the item
    and works it, though it cannot have told that from its failed reads. TLC: `LabelWhileWorked`
    violated.
24. **A watcher holding no declaration counts in the maximum poll interval** (`Ceiling`,
    `NoCeiling.cfg`). Counting instead in the longest of its own interval and what the
    sibling's file says now, which after a loss is a file the loss removed or an older one
    declaring the shorter interval, a watcher on the shorter interval whose declarations from a
    sibling were lost with the state branch counts that sibling gone after three of the shorter
    intervals, while the sibling, on the doubled interval, stands down only after four. TLC:
    `NoTwoWorkers` violated.

### Findings

Each file in `model/findings/` sets every rule TRUE and finds a violation the rules leave. CI
does not run them; they are for Adam.

- `EditedMessage.cfg`: a person edits the claim message of the rank working an item, so the
  message stops counting, and a sibling claims and works the item. `NoTwoWorkers` violated. Adam
  accepted this risk on 2026-10-18 (proposal decision 30), since only a person with maintain or
  admin access can edit or delete the bot's comment, so the file stays as a record.
`5dc5273`'s `findings/TwoRuns.cfg`, two `igor run`s at once reading each other's claims as their own, now
passes with the run id and is `ConcurrentInstancesTwoRuns.cfg`. `7a96c14`'s `findings/PollSkew.cfg`,
ranks on different poll intervals both working one item, now passes with `DeclaredInterval` and
is `ConcurrentInstancesPollSkew.cfg`.

Two findings of the fourth round's model, `RunBesideWorker.cfg` and `RestartBesideRun.cfg`, found
two workers where `igor run` shared rank 1 with a serving process. Run again with `igor run` at
rank 0, neither finds a violation (17,363,917 and 45,066,556 distinct states), so both files are
removed.

### Bounds and results

Every run uses an abandonment bound of three poll intervals and TLC 2.19 from `tla2tools.jar`
v1.7.4. The runs without `igor run` use two serving ranks, both declared at the start; the
rank-0 runs use rank 1 alone beside one `igor run`, and the two-run ones rank 1 beside two. Time
is unbounded: the model holds two counts capped at the bound, the polls since each sibling's
heartbeat changed and the intervals since each process's own last heartbeat. A lost branch in
these runs may also be a rollback to an old commit. The `PollSkew` files change the poll interval: `ConcurrentInstancesPollSkew.cfg` has the head change
it once, and the files after it combine a change of interval with crashes, a lost branch and
missed heartbeats, each split so that one CI job stays well within its hour. A split names the
one rank that misses heartbeats, or the one that crashes, and its twin swaps them. The two ranks
are alike in the model, so each pair gives the same count.

In CI, each must pass. *With the view* is the run CI makes, on this revision's model. *Without the
view* is one run with no `VIEW`, on 4 workers, stopped after 40 minutes where it had not finished,
made on the model at `5dc5273` and not repeated since.

| Configuration | Items | Environment | Checks | Distinct states, with the view | Time | Without the view (`5dc5273`) |
| --- | --- | --- | --- | --- | --- | --- |
| `ConcurrentInstances.cfg` | 2 | 1 crash, 1 lost or rolled-back branch, 1 hand-over | invariants | 48,487,914 | 11 min 37 s, from the earlier run described below the table | stopped at 185,732,188, no violation |
| `ConcurrentInstancesMisses.cfg` | 2 | 3 missed heartbeats | invariants | 22,290,265 | 3 min 33 s, from the earlier run described below the table | stopped at 83,756,607, no violation |
| `ConcurrentInstancesLongGaps.cfg` | 1 | 3 missed heartbeats; worker events 2 intervals apart, the timer stopping a stood-down worker | invariants | 582,427 | 7 s | passes, 22,856,832 |
| `ConcurrentInstancesRoster.cfg` | 2 | 1 crash, 1 hand-over, 1 rank removed from the roster, applied by each process at its own cycle start | invariants | 50,196,866 | 9 min 46 s | stopped at 86,425,142, no violation |
| `ConcurrentInstancesCatchUp.cfg` | 2 | 1 run that opens its pull request, 1 crash, 1 hand-over | invariants | 29,707,815 | 5 min 21 s | stopped at 82,220,005, no violation |
| `ConcurrentInstancesGiveBacks.cfg` | 1 | 1 crash, 1 hand-over, 1 claim given back before its worker, 1 stop | invariants | 3,600,115 | 36 s | stopped at 113,383,292, no violation |
| `ConcurrentInstancesRunRankZero.cfg` | 2 | rank 1 and 1 `igor run`; 1 crash, 1 lost or rolled-back branch, 1 hand-over | invariants | 8,410,136 | 1 min 50 s | stopped at 64,919,964, no violation |
| `ConcurrentInstancesRunRankZeroMisses.cfg` | 2 | rank 1 and 1 `igor run`; 2 missed heartbeats | invariants | 2,136,707 | 23 s | passes, 20,216,806 |
| `ConcurrentInstancesTwoRuns.cfg` | 1 | rank 1 and 2 `igor run`s; 1 crash | invariants | 14,368,406 | 2 min 49 s | not run |
| `ConcurrentInstancesTwoRunsGiveBacks.cfg` | 1 | rank 1 and 2 `igor run`s; 1 claim given back before its worker | invariants | 13,779,513 | 2 min 38 s | not run |
| `ConcurrentInstancesLiveness.cfg` | 1 | 1 crash, 1 stop | invariants and liveness | 336,418 | 55 s | stopped at 5,186,995, no violation |
| `ConcurrentInstancesLivenessRoster.cfg` | 1 | 1 hand-over, 1 stop, 1 rank removed from the roster | invariants and liveness | 481,693 | 1 min 28 s | passes, 3,231,478 |
| `ConcurrentInstancesLivenessCatchUp.cfg` | 1 | 1 run that opens its pull request, 1 crash, 1 hand-over, 1 stop | invariants and liveness | 1,295,519 | 4 min 35 s | stopped at 3,984,894, no violation |
| `ConcurrentInstancesLivenessRankZero.cfg` | 1 | rank 1 and 1 `igor run`; 1 crash, 1 stop | invariants and liveness | 91,700 | 14 s | passes, 465,757 |
| `ConcurrentInstancesPollSkew.cfg` | 1 | 3 missed heartbeats; the lore head doubles the poll interval, and each process applies it, or keeps its own, at its own cycle start | invariants | 5,194,943 | 1 min 7 s | not run |
| `ConcurrentInstancesPollSkewLoss.cfg` | 1 | every process starts on the doubled interval; the head changes it once; 1 lost or rolled-back branch; 3 missed heartbeats, by rank 2 only | invariants | 45,836,405 | 9 min 41 s | not run |
| `ConcurrentInstancesPollSkewLoss1.cfg` | 1 | as `PollSkewLoss`, with rank 1 the one that misses | invariants | 45,836,405 | 8 min 40 s | not run |
| `ConcurrentInstancesPollSkewCrash.cfg` | 1 | the head changes the interval twice; 1 crash, of rank 1; 3 missed heartbeats, by rank 2 | invariants | 53,324,134 | 9 min 59 s | not run |
| `ConcurrentInstancesPollSkewCrash1.cfg` | 1 | as `PollSkewCrash`, with the ranks swapped | invariants | 53,324,134 | 9 min 10 s | not run |
| `ConcurrentInstancesPollSkewCrashLoss.cfg` | 1 | the head changes the interval once; 1 crash, of rank 1; 1 lost or rolled-back branch; 1 missed heartbeat, by rank 2 | invariants | 47,548,114 | 10 min 2 s | not run |
| `ConcurrentInstancesPollSkewCrashLoss1.cfg` | 1 | as `PollSkewCrashLoss`, with the ranks swapped | invariants | 47,548,114 | 9 min 54 s | not run |

All pass with the view, in a run of every configuration on this revision's model, on 6 TLC workers
of a 10-core Mac shared with `ConcurrentInstancesPollSkewFull.cfg`, below. The first two ran while
the host was short of memory and swapping, and took 112 min 29 s and 37 min 32 s; their counts
match the earlier run, made on 8 workers before the ceiling rule, so the table gives that run's
times for them. The other `PollSkew` files are new. Every count but
`ConcurrentInstancesPollSkew.cfg`'s is the same as before the ceiling rule, which shows the rule adds no state where the interval never changes; `PollSkew`
moved from 5,350,517 to 5,194,943, since a watcher now counts in the longest of its own interval
and the intervals it has seen declared, or in the maximum before it has seen any. The view's counts repeat exactly:
`ConcurrentInstances.cfg` gives 48,487,914 and `ConcurrentInstancesLongGaps.cfg` 582,427 on this
revision's model, the same as at `5dc5273`, where they repeated on three runs and four runs
respectively. `ConcurrentInstancesRoster.cfg` and `ConcurrentInstancesLivenessRoster.cfg` grew,
before this revision, when each process came to apply the roster at its own cycle start, and
`ConcurrentInstancesGiveBacks.cfg` when a claim given back came to have a test, a withdrawal and a
reread. The two two-run configurations together, a crash and a claim given back in one TLC run,
also pass, at 74,648,408 states in 18 min 35 s, too long for a CI job on GitHub's slower runner, so
CI runs them split. A single configuration of `igor run` beside rank 1 with a crash, a lost branch,
a hand-over and two missed heartbeats together is too large for a CI job too: with `OwnerFirst`
FALSE it took 21 minutes on 8 workers here, and with it TRUE it had passed 47 million states in 6
minutes when stopped. So CI runs it split into the two `RunRankZero` files above.

`ConcurrentInstancesPollSkewFull.cfg` puts every poll-interval fault in one run: the head changes
the interval twice, any rank may crash twice, the branch may be lost or rolled back once, and any
rank may miss three heartbeats. It is too large for CI and runs here only. When this revision was
pushed it had found no violation after 69,453,138 distinct states, at depth 19, with 26,645,804
states still on its queue, on 4 workers; a later commit records how it ends. Only it covers a
crash, a lost branch and three missed heartbeats together with a change of interval; the split
files cover them with one missed heartbeat.

Each of the twenty-four files in `model/negative/` finds its violation on one worker, which is how
CI runs them, the slowest, `NoCeiling.cfg`, in 5 min 12 s, and all of them in 17 min 53 s added
together. CI runs them in two jobs, by the first letter after `No`, to keep each well within its
hour. `model/findings/EditedMessage.cfg` finds its violation, `NoTwoWorkers`, within a second.

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
- **Igor's timer stops a stood-down process's worker within the interval in which it stood
  down** (`TimerHalts`). With the rule off, the worker stops at its next event, up to
  `CheckpointGap` intervals later.
- **A claim given back before its worker starts** (`MaxFails`) fails at its post or at its
  verification, and the test that follows may itself fail. The model removes a failed post's
  label only in the same step as the failed post and its test, which stands for decision 42's
  bound; a process that does not remove it then leaves the label. The withdrawal's fresh read and its removal are one step,
  as a takeover's read and release are. A reread that fails again changes nothing the model
  holds: the refusal and set-down posts and the deferral are not modelled, and the label stays.
  A reread decides nothing about the worker: whatever it
  finds, the process works nothing from it.
- **A process whose rank leaves the roster keeps writing heartbeats until it exits.** It sees
  the change at a cycle start of its own, when it applies the lore head or keeps the commit it
  had. Nothing obliges a fetch to bring the head, so a process may run on the old roster for
  good, which the liveness properties allow.
- **Time is counted in the shorter poll interval where the interval may change.** A process on
  the doubled interval writes a heartbeat every half of its own interval, which is once per
  shorter interval, and may let one shorter
  interval end between setting its label and verifying. It counts a sibling gone after three of
  the longest of its own interval and those it saw the sibling declare since it started and since
  the last loss, or else in `CeilLen`, the maximum, and stands down after two of the shortest it has applied. The
  head may change twice, the second time back. A process forgets every declaration at a loss or
  rollback, which it is taken to detect: a serving rank's file missing, or a counter lower than
  the one it last read. A rollback that leaves a file's counter where the watcher last read it changes nothing
  the watcher holds.
  A process on the doubled interval may start its cycles as often as one on the shorter
  interval, which only adds behaviours.
- **A pull request is opened only by a run, before it finishes,** at most once per behaviour
  (`MaxPRs`), and a catch-up then finishes the item. What a person's label does after the pull
  request closes is not modelled, nor is the tree sweep.
- **Each `igor run` runs one cycle and starts at most once, at any point** (`NRuns`); the
  two-run configurations run two beside rank 1.
- **A lost state branch takes every heartbeat file's availability with it; a rollback leaves each
  file's availability as it was just before the rollback.** Which rank goes first decides nothing the invariants check, and the
  configurations pass with `OwnerFirst` FALSE too.

## Since review: the reserve becomes a line checked against a stream reading (2026-09-28)

Recorded 2026-09-28. This changes no requirement or task here.

Adam decided that a seat's reserve is a line that rises toward the reset, checked against the
seat's latest unreset stream reading ([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file may
set its own reserve. It is specified on [#143](https://github.com/adamstallard/igor/pull/143) and
not built. Its accepted cost is that Igor sees its own spend only in the next reading, which #143
measured as arriving after a run's first model call. A process can therefore start a second run
before the first run's reading shows the line crossed, so each Igor process can overshoot the
line by about two runs.

The proposal's *Per-process budget* says concurrency "spends faster without spending
differently", because the gate is checked before each item. Under the line that stops being quite
true. Each process checks the gate before its own item, and none of them sees the others' runs
until a reading arrives. So the overshoot is about two runs per process, not per Igor, and N
ranks can start about 2N runs past the line before any of them reads it. This is the same slack #143
leaves open for several Igors on one seat, and it would be settled with that. Nothing needs to be
decided here before then.
