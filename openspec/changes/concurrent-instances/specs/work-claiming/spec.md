## MODIFIED Requirements

### Requirement: Assignment expresses a claim; ordering resolves it

Every claiming tracker offers a native holder field, such as GitHub's `igor:<role>` label and
Linear's delegate. A claim SHALL set the holder field, because that is the signal humans
read, and SHALL post the claim message. Resolution SHALL rely on the storage order of writes,
not on any conditional-write primitive.

The holder field SHALL be written before the claim message. The field is what resolution reads
and what people see; the message names the Igor and carries the stop instruction. Written in
the other order, an Igor that fails between the two writes leaves a message claiming an item
whose field shows nobody, which is a claim people miss. Written field first, a failure leaves
the visible claim, and the message follows on the next cycle.

Where the holder field holds a single value, the later of two writes holds the item: each Igor
re-reads the field, and the one it no longer names has lost. Where the field holds a list, such
as GitHub's `igor:` labels, any other holder present after the settle interval
means the claim is lost, because a list keeps every write rather than replacing one.

Processes of one role write the same value to the holder field, so the field cannot tell them
apart. Among them, the claim message earliest in storage order holds the item, counting only
messages posted since the item's latest release and leaving out those of ranks that are gone
(see *A retired rank does not hold its items forever*). The item's latest release is the latest
removal of the role's label from it, as the item's label events record. Storage order among
claim messages SHALL be the surface's own sequence key, never a timestamp.

A claim message SHALL be ordered against the item's latest release by its timestamp. A message
SHALL count only when its timestamp is later than the release's; a message in the same second as
the release does not count. No process SHALL wait for the release's second to pass before
posting: a claim whose message does not count is lost, and the item is claimed at a later cycle.

#### Scenario: Claim visible in the native field

- **WHEN** an Igor claims an item on a tracker with a holder field
- **THEN** the holder field shows the Igor
- **AND** a human reading the tracker sees the claim without knowing any convention

#### Scenario: Holder field written before the claim message

- **WHEN** an Igor claims an item on a tracker with a holder field
- **THEN** it sets the holder field first and posts the claim message second

#### Scenario: Later write holds a single-valued field

- **WHEN** two Igors set a single-valued holder field on the same item within one settle interval
- **THEN** the Igor whose write the field still shows holds the item
- **AND** the other Igor has lost the claim

#### Scenario: Another holder in a list

- **WHEN** a re-read after the settle interval finds another holder in a list-valued holder field
- **THEN** the Igor has lost the claim

#### Scenario: No dependence on conditional writes

- **WHEN** a claim is taken on any tracker
- **THEN** correctness does not depend on a compare-and-set guarantee from that surface's API

#### Scenario: A claim message from before a release does not count

- **WHEN** an item was released and then claimed again by processes of one role
- **THEN** only claim messages posted since the release are compared

#### Scenario: A claim message in the release's second does not count

- **WHEN** an item's latest release and a claim message on it carry the same second
- **THEN** that claim message does not count
- **AND** the process that posted it works nothing, and the item is claimed at a later cycle

#### Scenario: Claims written in the same second still order

- **WHEN** two processes of one role claim one item and the surface reports both claim messages
  at the same timestamp
- **THEN** the surface's sequence key decides, and exactly one claim stands

### Requirement: A claim is verified after a settle interval

After claiming, an Igor SHALL wait a configurable settle interval, re-read the item, and stand
down if another party holds it. Standing down MUST remove whatever still names the Igor as
holder, and MUST NOT remove anything naming another party. On a single-valued holder field the
losing Igor's write has already been replaced by the winner's, so clearing the field would
remove the winner's claim; the losing Igor posts a short reply saying it is handing the item
back, and changes nothing else.

Where the other holder is a process of the Igor's own role, standing down SHALL leave the holder
field as it is, such as the role's label on GitHub, and SHALL post nothing, since the field is the
winner's too, as *Only the rank holding a claim gives it back* says.

The re-read SHALL come within one poll interval of the claim message. A process that reaches it
later SHALL stand down without working the item, leaving the role's label in place and posting
nothing, even where it reads its own message as holding the item. That is an exception to *A
claim that cannot be kept is given back, out loud*.

The settle interval does not apply where a person handed the item to the Igor; see *A person
can direct an Igor through the holder field*. Among one role's ranks it does apply, as *A
hand-over among one role's ranks is contested like found work* says.

The re-read SHALL look for a stop said since the cycle that chose the item read it, or, for an
item a person handed over, since the hand-over. A cycle works its items one after another, so a
stop said on one while it works another comes after the cycle read it and before the claim;
looking only back to the claim would miss it.
For an item the Igor's own search found, a go-ahead later in the comments than the latest stop
lifts it, as it would at the next cycle, and the run that follows SHALL NOT be stopped by the stop
the claim saw lifted. For a handed-over item the stop stands.

#### Scenario: Claim confirmed

- **WHEN** a re-read after the settle interval shows the Igor still holding the claim
- **THEN** work proceeds

#### Scenario: Claim lost to an earlier writer

- **WHEN** a re-read shows another party holds the item
- **THEN** the Igor stands down and performs no work
- **AND** the loss is recorded

#### Scenario: Losing Igor leaves a single-valued field alone

- **WHEN** an Igor loses a claim on a single-valued holder field
- **THEN** it does not clear or change the field
- **AND** it posts a reply saying it is handing the item back

#### Scenario: Losing Igor removes itself from a list

- **WHEN** an Igor loses a claim on a holder field that holds a list
- **THEN** it removes its own entry and leaves every other holder in place

#### Scenario: A process that loses to its own role keeps the label on the item

- **WHEN** a process loses a claim to another process of its own role
- **THEN** it leaves the role's label in place and performs no work

#### Scenario: A late verification stands down

- **WHEN** a process reaches the re-read more than one poll interval after posting its claim
  message
- **THEN** it stands down and performs no work

#### Scenario: Settle interval configurable

- **WHEN** an operator tunes the settle interval
- **THEN** the new value governs subsequent verification

#### Scenario: A stop said while the cycle worked another item

- **WHEN** a cycle chooses two items, and somebody says stop on the second while the Igor works
  the first
- **THEN** the claim on the second sees the stop, and the Igor stands down with a stop receipt,
  a reply on the item saying it stopped

#### Scenario: A stop answered by a go-ahead before the claim

- **WHEN** somebody says stop on an item the Igor's search found, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the claim holds and the run is not stopped by that stop

### Requirement: A person can direct an Igor through the holder field

Where a person sets the holder field to name an Igor, the Igor SHALL treat the item as directed
to it. On the next cycle that finds the item, it SHALL post the claim message, naming itself and
carrying the stop instruction, and SHALL begin work without waiting the settle interval, except
where several processes run its role, as the next paragraph says. No
other Igor competes for an item that names a holder, and the person has already chosen. A stop,
or a person removing the Igor from the holder field, SHALL halt it at any time, as for any claim.

Where several processes run the Igor's role, they SHALL decide which of them works the item as
*A hand-over among one role's ranks is contested like found work* says. Between different Igors,
the item still needs no settle interval.

On Linear a person directs an Igor by delegating to it. On GitHub a person directs an App Igor
by adding its `igor:<role>` label.

#### Scenario: Delegated by a person

- **WHEN** a person delegates a Linear issue to an Igor
- **THEN** on its next cycle the Igor posts the claim message and starts work
- **AND** it does not wait the settle interval

#### Scenario: Labelled by a person

- **WHEN** a person adds the label `igor:<role>` to a GitHub issue
- **THEN** on its next cycle the App Igor holding that role posts the claim comment and starts work
- **AND** where one process runs the role, it does not wait the settle interval

#### Scenario: Directed work can still be stopped

- **WHEN** a person removes the Igor as delegate, removes its `igor:<role>` label, or replies stop,
  after the Igor has started
- **THEN** the Igor halts as it would for any stopped claim

#### Scenario: Several ranks share a hand-over

- **WHEN** a person adds `igor:backend` to an issue, and ranks 1 and 2 of the `backend` role are
  both free
- **THEN** they decide which works it by the contest for found work, and only one starts work

### Requirement: A claim that cannot be kept is given back, out loud

`work-claiming` says how a claim is taken, verified, stood down from and stopped. It says nothing
about the run that takes one and then cannot continue, and that silence is the gap: an Igor that
throws while holding a claim leaves the item held, other people told to stand off, and no
explanation.

Where a run holds a claim and cannot go on — the claim could not be finished, or anything after it
failed — the Igor SHALL release the claim and say so on the item. It SHALL NOT end such a run
holding the claim in silence.

Where several processes run one role, two cases end in silence instead. A process that has
stood down for missed heartbeats says nothing, since a sibling may already have taken the item
over (*A retired rank does not hold its items forever*). A process whose claim message does not hold the item says
nothing, since the claim is another rank's (*Only the rank holding a claim gives it back*). The scenarios
below that give a claim back describe the holder.

A run that finishes SHALL release its claim too, leaving its artifact in place and the item open,
so the item is rediscovered and the work in flight keeps it from being claimed again. No role
setting changes this.

**Giving the claim back never takes back a person's hand-over.** Where a person put the Igor in
the holder field, as by adding its `igor:<role>` label, and the run is the Igor bringing its own
artifact up to date rather than answering that hand-over, releasing the claim SHALL leave that
holder entry in place, except where a person stops the Igor: a stop removes the Igor from the
holder field, as every stop does, and the person hands the item over again by adding it anew. Bringing its own work up to date is not a claim of the hand-over (*An item
handed to an Igor waits for work already in flight*), and removing the person's entry would spend
a hand-over the Igor has not answered.

**Where the release does not succeed either**, the Igor SHALL say that instead of saying it
released. The item still carries the Igor's name, so a message asserting release would be false
where somebody is looking; what is said SHALL name the item as still held and SHALL name the one
action that frees it.

**A failure of the surface is not a failure of the item.** Where a run ends this way because a
tracker or host did not answer, that SHALL be distinguishable from a refusal about the item
itself, and a cycle meeting **two in a row** SHALL stop rather than attempting the remaining
items. Nothing about the item produced the outcome, so every remaining item would reach the same
one — and doing so speaks on each of them, at a volume that is itself a cause of the failure.

Two, not one, because the run cannot tell the two causes apart: `produce`, the step that publishes
the worker's branch, fails inside the worker
call for a branch the item already owns, while a tracker that does not answer the release that
ends a finished run fails outside it, so neither the error nor how far the run got separates them. How many items they
affect does — an outage fails every item and a bad item fails one — so the count is the
distinction. A cycle that met one and then ran an item cleanly did not fail, and SHALL NOT be
recorded as failed.

**A write says what the surface recorded.** Where the Igor asks a surface to say or to release
something, the answer SHALL carry what was recorded, not merely that no error was raised. A raised
error cannot separate *this did not happen* from *this happened and the answer was lost*, and a
caller that must tell them apart cannot do it from a thrown error alone.

#### Scenario: A finished run releases its claim

- **WHEN** a run publishes its work and finishes
- **THEN** the Igor releases its claim and leaves the artifact in place
- **AND** it does not close the item

#### Scenario: A claim that could not be announced is given back

- **WHEN** a claim is recorded and the message announcing it fails
- **THEN** the claim is released and the run is refused
- **AND** the item is not left held with nothing said

#### Scenario: A claim that could not be verified is given back and withdrawn

- **WHEN** a claim was announced and verifying it fails
- **THEN** the claim is released, the announcement is withdrawn on the item, and the run is refused

#### Scenario: A release that did not take is said so

- **WHEN** a claim cannot be kept and releasing it does not clear the holder
- **THEN** what is said names the item as still held rather than as released
- **AND** it names the action that frees it

#### Scenario: A failure after the claim hands the item back

- **WHEN** a run holding a claim fails at any point after taking it
- **THEN** the claim is handed back with an explanation on the item

#### Scenario: A cycle stops when the surface stops answering

- **WHEN** two runs in a row end because a surface did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: One run ending that way does not stop the cycle

- **WHEN** an item's run ends because a surface did not answer and the next item's run does not
- **THEN** the cycle continues and is not recorded as failed

#### Scenario: A refusal about the item does not stop the cycle

- **WHEN** a claim is refused because the tracker did not record it
- **THEN** the cycle continues to the remaining items

#### Scenario: A catch-up gives its claim back and keeps a person's label

- **WHEN** an Igor brings its own pull request up to date on an issue whose `igor:<role>` label a
  person added, and the run ends other than by a stop
- **THEN** the label is still on the issue afterwards
- **AND** once that pull request closes, the label directs the Igor as for any hand-over

#### Scenario: A stop during a catch-up takes the label off

- **WHEN** a person stops an Igor while it brings its own pull request up to date on an issue
  whose `igor:<role>` label a person added
- **THEN** the label is removed, and the stop receipt says the Igor released the issue
- **AND** adding the label again later hands the issue over again

#### Scenario: A rank that does not hold the item gives nothing back

- **WHEN** several processes run one role, and a process whose claim message does not hold the
  item cannot go on with its claim
- **THEN** it removes nothing and posts nothing on the item

## ADDED Requirements

### Requirement: A claim names the process that took it

A claim message SHALL carry the rank of the process that posted it, whether or not the role runs
several processes, and verification SHALL treat a claim carrying another rank as belonging to
another process. Claim messages, and the trailers in them, SHALL be read only from comments the
role's own bot account wrote. A comment the surface reports as edited, on GitHub one whose
GraphQL `lastEditedAt` is set, SHALL count for nothing: it is no claim message, and its `Igor-Rank:`,
`Igor-Supersedes:` and `Igor-Handed-Over-By:` trailers are not read, so an edit can neither fake
nor erase one. Hiding or unhiding a comment, or reacting to it, is not an edit, and the comment
still counts.

An edit or a deletion of the holder's claim message while it works the item makes the item read
as unclaimed, and a sibling may then claim and work it too. That risk is accepted: only a person
with maintain or admin access to the repository can edit or delete the bot's comment.

A role runs several processes when the roster, which `role-config` specifies, declares more
than one rank for it, or when rank 0, `igor run`'s, is not gone to the deciding process, as in
each process's first three poll intervals, before it can count rank 0 gone. `igor run` always
counts its role as run by several processes. Whether several processes run a role decides
whether a hand-over is contested (*A person can direct an Igor through the holder field*) and
which give-backs end in silence (*A claim that cannot be kept is given back, out loud*). The rank SHALL be given to the process when it is started, never
discovered or counted, as the last part of its name, `<role>-<rank>`, which `role-config`
specifies.

#### Scenario: A sibling's claim is not the Igor's own

- **WHEN** a process verifies a claim whose holder field names its role and whose earliest claim
  message carries another rank
- **THEN** the claim is another process's and this one stands down

#### Scenario: The rank is readable on the item

- **WHEN** a claim is posted
- **THEN** the message carries the rank of the process that posted it, so a person reading the
  item sees which process holds it

#### Scenario: A claim message someone else wrote does not count

- **WHEN** a comment not written by the role's bot account carries `Igor-Rank: 1`
- **THEN** no process reads it as a claim message

#### Scenario: An edited claim message counts for nothing

- **WHEN** a person edits the bot's claim message on an item, adding `Igor-Supersedes: 2` or
  removing `Igor-Handed-Over-By:`, so its `lastEditedAt` is set
- **THEN** no process reads it as a claim message, and none of its trailers is read

#### Scenario: A hidden claim message still counts

- **WHEN** a person hides the bot's claim message on an item, or unhides it, so its REST
  `updated_at` changes while its `lastEditedAt` stays empty
- **THEN** it still counts as a claim message

#### Scenario: An edit to the holder's message lets a sibling in, as accepted

- **WHEN** a person with maintain access edits or deletes the claim message of the rank working
  an item
- **THEN** that message counts for nothing from then on, and a sibling may claim the item and
  work it beside the holder

#### Scenario: The rank is the last part of the name

- **WHEN** a process is started as `igor serve front-end-2`
- **THEN** it runs as rank 2 of the `front-end` role

### Requirement: A run by hand runs as rank 0

`igor run <role>`, with or without `--plan`, SHALL run as rank 0 of the role. Rank 0 is outside
the roster: no roster declares it, and `igor run` starts whatever the roster declares. It SHALL
NOT wait for, read or refuse on any serving rank's heartbeat before it starts.

Without `--plan`, `igor run` SHALL write its own heartbeat file, `heartbeats/<role>-0.json`, as
a serving process writes its own, from a timer firing every half poll interval, its first write
before its first cycle. Its siblings watch that file as they watch any rank's. It SHALL contend
for items as any rank does, by the claim and its verification, and its claim messages carry
`Igor-Rank: 0`.

`igor run` SHALL take over no claim message, its own rank's included: it passes over every item
whose role label is on and that carries any claim message posted since its latest release,
whatever rank posted it and whether or not that rank is gone. *A process recovers the claims of
its own predecessor* does not apply to rank 0. A claim an `igor run` leaves, as when it crashes, is taken over
by a serving rank once rank 0 is gone, as for any gone rank's claim.

`igor run` spends only the token in its environment's `IGOR_RUN_TOKEN`, as #171's (`seat-files`)
*`igor run` spends its own token as an implicit local seat* says. Each `igor run` keeps trees of
its own, as `task-execution`'s *The sweep removes trees by rank, never by age* says. Each also
gets a home of its own, the `HOME` its worker runs in, which #174 (`pinned-skills`) is to
specify (Adam, 2026-10-19); this change does not specify it.

`igor run --plan` SHALL change nothing: it claims nothing, posts nothing, writes no heartbeat and
removes no tree.

#### Scenario: A run beside a serving rank goes ahead

- **WHEN** `igor@backend-1` is running and a person runs `igor run backend`
- **THEN** the run starts at once as rank 0, without waiting, and writes
  `heartbeats/backend-0.json` before its first cycle

#### Scenario: A run and a serving rank contend for one item

- **WHEN** `igor run backend` and rank 1 of `backend` both claim one item
- **THEN** each verifies its claim, the earliest claim message that counts holds the item, and only
  its process works it

#### Scenario: A run does not take over a claim

- **WHEN** `igor run backend` finds a labelled item whose earliest claim message carries a rank
  that is gone, or rank 0
- **THEN** it passes the item over and posts nothing on it

#### Scenario: A crashed run's claim is recovered by a serving rank

- **WHEN** `igor run backend` crashes holding a claim, and rank 1 has watched
  `heartbeats/backend-0.json` fail to change for three poll intervals
- **THEN** rank 1 may take the item over, as for any gone rank's claim

#### Scenario: A run for a role whose roster declares no rank 1

- **WHEN** the roster lists `backend: [2, 3]` and a person runs `igor run backend`
- **THEN** the run starts as rank 0

#### Scenario: A plan changes nothing

- **WHEN** a person runs `igor run backend --plan` while `igor@backend-1` is running
- **THEN** the plan runs at once, writes no heartbeat, removes no tree and changes nothing

### Requirement: Contention is resolved before a claim, not after it

Every item SHALL have an owner among the ranks the roster declares for its role: the rank at
place `h mod n` in the roster's ranks in ascending order, where `n` is how many ranks the roster
declares and `h` is a hash of the item's id that every process computes alike. The item's order
of ranks SHALL be its owner, then each declared rank after it in ascending order, wrapping round
to the lowest, and then rank 0, which owns no item. The first rank in that order that is
available, as its heartbeat says (*A retired rank does not hold its items forever*), goes first
for the item. A process judges this from its own read of the heartbeat files, and counts itself
available.

A process SHALL attempt first the candidates it goes first for, then the others, each group in
the order discovery gave. Before claiming a candidate another rank goes first for, it SHALL wait
one settle interval for each available rank ahead of it in the item's order, re-read the item,
and claim it only if no claim that counts is on it; seeing the item held, it SHALL move on
without posting anything. A process that goes first for a candidate never waits.

Which rank goes first only orders the attempts. Two processes reading heartbeats of different
ages can each judge itself first for one item, and the claim and its verification then decide
which works it.

#### Scenario: An item's owner takes it

- **WHEN** the roster declares ranks 1 to 4 for `backend`, an item's hash puts its owner at rank
  3, and rank 3 is available
- **THEN** rank 3 attempts the item first, and ranks 4, 1 and 2 wait behind it

#### Scenario: An owner that is busy is passed to the next available rank

- **WHEN** an item's owner is rank 3 of ranks 1 to 4, rank 3's heartbeat says it is not
  available, and rank 4's says it is
- **THEN** rank 4 goes first for the item

#### Scenario: A rank waits behind the ranks ahead of it

- **WHEN** rank 2 attempts an item that rank 1 owns, and rank 1 is available
- **THEN** rank 2 waits one settle interval, re-reads the item, finds rank 1's claim, and posts
  nothing

#### Scenario: Two ranks that each judge themselves first

- **WHEN** a heartbeat read half a poll interval old leads ranks 1 and 2 each to judge itself
  first for one item, and both post a claim message
- **THEN** each verifies its claim, and only the rank whose message is earliest works the item

### Requirement: A hand-over among one role's ranks is contested like found work

Where several processes run one role and a person hands an item to the role, its ranks SHALL
decide which works it by the contest of *Contention is resolved before a claim, not after it*, as
for an item their search found: the item's owner, or the next available rank after it, goes
first. Only an available rank SHALL contend, available as *A retired rank does not hold its
items forever* defines it: one with no claim in hand, that
is, not between setting the holder field and finishing the run or giving the claim back, and
that has not stood down for missed heartbeats, and that has a seat it can spend. A rank whose
worker is running is not available. A rank that posts SHALL verify its claim
after the settle interval, as for an item its search found, and the earliest claim message that
counts holds the item.

A rank that takes over a handed-over item, removing the role's label and adding it again under
*A retired rank does not hold its items forever*, SHALL record in its claim message that the
item was handed over. The adapter SHALL read an item whose holding claim message records a
hand-over as handed over by a person, as it would read the person's label.

#### Scenario: The owner takes a hand-over

- **WHEN** a person adds `igor:backend` to an issue that rank 1 owns, and ranks 1 and 2 of
  `backend` are free
- **THEN** rank 1 posts its claim message at once, and rank 2, re-reading after one settle
  interval, finds it and posts nothing
- **AND** exactly one claim message appears

#### Scenario: A busy owner does not contend

- **WHEN** a person hands over an item that rank 1 owns while rank 1's worker is running and
  rank 2 is free
- **THEN** rank 1 does not contend, and rank 2, the next available rank, posts at once, verifies
  its claim after the settle interval, and works the item

#### Scenario: Two ranks that both post on a hand-over

- **WHEN** ranks 1 and 2 both post a claim message on a handed-over item before either sees the
  other's
- **THEN** each verifies after the settle interval, the earliest claim message that counts holds
  the item, and only its rank works it

#### Scenario: A taken-over hand-over still stands

- **WHEN** a rank takes over a handed-over item from a gone rank, removing the label and adding
  it again
- **THEN** its claim message records the hand-over, and the item is still read as handed over
  by a person

### Requirement: A process recovers the claims of its own predecessor

A claim whose holding message, the earliest claim message that counts, carries a serving
process's own rank SHALL be treated by that process as abandoned by its predecessor, and the item
re-worked from the beginning. Rank 0 recovers nothing (*A run by hand runs as rank 0*).

Where the item has an open pull request the Igor opened, the process SHALL NOT re-work it, and
SHALL catch it up instead, as *A claim left on the Igor's open pull request is caught up* says.

#### Scenario: Restarting after a crash

- **WHEN** a process starts and finds an item claimed with its own rank
- **THEN** it takes the item and works it from the beginning

#### Scenario: A sibling does not adopt it

- **WHEN** a process finds an item held by a rank other than its own that is not gone
- **THEN** it leaves the item alone

#### Scenario: A recovered claim with a pull request open is a catch-up

- **WHEN** a process starts and finds an item claimed with its own rank, and the Igor's pull
  request for that item is open
- **THEN** it catches the item up and leaves the pull request open, and does not re-work the item

### Requirement: A claim left on the Igor's open pull request is caught up

Where a process takes a claim left by its own predecessor or by a gone rank, and the item has an
open pull request the Igor opened, the process SHALL NOT re-work the item. It SHALL carry on
with the claim as a catch-up: it brings the pull request up to date where the pull request no
longer merges, as `task-execution`'s *A published artifact is kept mergeable* says, and then
gives the claim back as a catch-up does, leaving the pull request open and a person's label on
the item.

Where the pull request still merges and carries no review to act on, carrying on changes nothing
on the item: the process runs no worker, and the item waits as any item with the Igor's pull
request open does. Where it carries one, the holder resumes the item with a worker, as
`work-triage`'s *Items with work already in flight are skipped* says.

Taking over a gone rank's claim this way SHALL NOT release the item, so a person's label stays.
The process SHALL post its own claim message, recording in it the gone rank whose message it
supersedes, and SHALL verify it as for any claim. From then on the gone rank's message SHALL NOT
count, for any process, even once that rank returns.

#### Scenario: A gone sibling's claim on an open pull request is caught up

- **WHEN** a process finds an item whose holding claim message carries a gone rank, and the
  Igor's pull request for the item is open
- **THEN** it posts its own claim message without releasing the item, catches the item up, and
  gives the claim back
- **AND** the item is neither skipped as work in flight nor re-worked

#### Scenario: A superseded claim does not count when its rank returns

- **WHEN** a process has taken over a gone rank's claim on an item with the Igor's pull request
  open, and the gone rank restarts
- **THEN** the gone rank's earlier claim message does not count, and the restarted rank leaves
  the item to the process that holds it

#### Scenario: A taken-over catch-up keeps a person's label

- **WHEN** a person added the role's label, and a process catches the item up over a gone rank's
  claim
- **THEN** the label is still on the item after the catch-up gives the claim back

### Requirement: A retired rank does not hold its items forever

A claim held by a rank past the abandonment bound SHALL be adoptable by any process of the role.
A rank is past the bound once the deciding process has itself watched that rank's heartbeat fail
to change for three of its role's poll intervals. Removing a rank from the roster SHALL NOT by
itself make the rank's claims adoptable: a rank missing from the roster is adoptable only once
it is past the bound.

Every process SHALL run a timer of its own, apart from its cycle and from any worker, that fires
every half poll interval. At each firing it SHALL write a heartbeat: it overwrites a file of its
own on the state branch, named by its role and rank, holding an id the process chose when it
started, a counter it increments on each write, and whether the process is available. Its first
heartbeat SHALL land before its first cycle. A heartbeat file SHALL hold no time that any process
compares.

A process is available when it is free, holding no claim and not stood down, and it has a seat
it can spend, as `seat-budget`'s *A role has a seat it can spend when the gate would choose one
now* (#143, `read-seat-windows-from-the-stream`) defines: some seat that serves the role is
admitted by every rule the budget gate applies, its reserve line and pacing among them.
Availability only decides which rank goes first for an item (*Contention is resolved before a
claim, not after it*).

A heartbeat SHALL count only when it changes: when the file holds an id and counter other than
the ones the reading process last read from it. A process SHALL keep in its own memory, for each
sibling, the id and counter it last read from the sibling's file and the moment, by its own
clock, at which it last saw them change, and SHALL count the sibling gone only once three poll
intervals have passed since that moment, or since the process itself started if it is later. A
missing file does not change. Neither the sibling's clock nor any time in the file decides
whether it changed.

A process SHALL read its role's heartbeat files before it chooses a candidate, and again before
it verifies a claim. It SHALL read all of them, with their contents, in one request, and SHALL
judge each sibling's file changed by its blob id.

A process taking over an item whose earlier claim message no longer counts, because that
message's rank is gone, SHALL first release the item by removing the role's label and adding it
again, and SHALL then post its own claim message at once. That holds for an item with no label
too, which can still carry the claim message of a rank that posted it after a sibling gave the
claim back: the process adds the label, removes it and adds it again. An item whose open pull
request the Igor opened is the exception, taken over without a release, as *A claim left on the
Igor's open pull request is caught up* says.

A process SHALL stand down once it has failed to write its heartbeat for two poll intervals.
Standing down, it starts no claim, and leaves its claims in place. The same timer SHALL check, at
each firing, whether the process has stood down, and where it has, SHALL stop the running worker
itself, without waiting for an event from the worker. The process resumes once a heartbeat lands.

A run stopped by standing down ends holding its claim, and says nothing on the item. That is an
exception to *A claim that cannot be kept is given back, out loud*, and to `graceful-handoff`'s
rule that silence after a claim is not permitted. A sibling takes the claim over once the rank
is gone.

A process SHALL read the roster at the start of each cycle. A process whose rank the roster no
longer declares SHALL start no claim, and SHALL shut down as when it is asked to stop: it finishes the
item in hand, or hands it off out loud, as `work-discovery`'s scenario *Shutdown finishes the
item in hand* says, and then exits as *A rank removed from the roster exits cleanly* says. It keeps writing heartbeats until it exits, so no sibling takes its claims unless it dies
first.

Where the configuration a process reads at the start of a cycle fails any check a starting
process makes on it, the process SHALL refuse it: it SHALL go on under the last configuration
that passed, roster included, and SHALL raise a condition naming the failing file and the check.
Where that configuration includes seat files, as under #171, a seat file the read finds removed
is the one exception, and takes effect all the same, as `seat-budget`'s *A removed seat file
always takes effect* (#171) says.
That condition is of the kind `stuck-conditions`' *A read-cleared condition opens on a failing
read and clears on a passing one* defines (#171, `seat-files`). A later read that passes SHALL
take effect. A failing check SHALL NOT make the process exit.

#### Scenario: Scaling down releases the orphan

- **WHEN** a rank is removed from the roster and it held a claim
- **THEN** another process may take that item only if the rank died before giving it up, and
  only once it has watched the rank's heartbeat fail to change for three poll intervals

#### Scenario: A rank removed from the roster is not adopted while it runs

- **WHEN** a rank is removed from the roster while its worker is running
- **THEN** no other process takes its claims while its heartbeat still changes

#### Scenario: A process whose rank leaves the roster shuts down

- **WHEN** the roster no longer declares a running process's rank while its worker runs
- **THEN** it starts no claim, finishes the item or hands it off out loud, and then exits with
  status 0

#### Scenario: A declared rank that stopped running

- **WHEN** a claim's rank is still declared, and a process has watched its heartbeat fail to
  change for three poll intervals
- **THEN** that process may take the item

#### Scenario: An adopted claim holds the item

- **WHEN** a process claims an item whose earlier claim message carries a rank that is gone
- **THEN** it removes the role's label and adds it again, and posts its own claim message at
  once
- **AND** the earlier message falls before the latest release, and the new claim holds the item
  unless its message landed in the release's second, when the item is claimed at a later cycle

#### Scenario: A gone rank's message on an unlabelled item is released first

- **WHEN** rank 2, partway through claiming an item, posted its claim message just after rank 1,
  the holder, set the item down and removed the label; rank 2 then stood down and is now gone;
  and at a later cycle rank 1 claims the item again
- **THEN** rank 1 adds the label, removes it and adds it again before posting
- **AND** rank 2's message does not count when rank 2 returns

#### Scenario: A returning rank does not take back an adopted item

- **WHEN** a rank whose claim another process adopted restarts
- **THEN** its earlier claim message does not count, and it leaves the item to the process that
  holds it

#### Scenario: The bound does not shorten a run

- **WHEN** a process is working an item it holds for longer than three poll intervals
- **THEN** it keeps writing heartbeats, its rank is not gone, and no other process may take the
  item

#### Scenario: A lost state branch takes no live rank's claim

- **WHEN** the state branch is lost or reset, taking every heartbeat file with it
- **THEN** each process keeps counting from the moment it last saw each sibling's heartbeat
  change
- **AND** each live rank rewrites its file within one poll interval, and no process takes a
  claim held by a live rank

#### Scenario: A rolled-back state branch takes no live rank's claim

- **WHEN** the state branch is rolled back to an old commit, putting back heartbeat files with
  counters lower than the ones already read from them
- **THEN** a file put back may read as changed, which postpones a gone verdict and never hastens
  one
- **AND** no process takes a claim held by a live rank

#### Scenario: A rank whose clock goes back is still counted

- **WHEN** a rank's clock is stepped back, or the rank restarts on a host whose clock is behind
- **THEN** each heartbeat it writes still changes its file, and no process counts it gone

#### Scenario: A crashed rank is still recovered after the branch is lost

- **WHEN** a rank's heartbeat file is missing and the rank has crashed
- **THEN** a process counts the rank gone three poll intervals after it last saw the rank's
  heartbeat change, or after its own start if that is later, and may then take the rank's claims

#### Scenario: A restart starts the clock again

- **WHEN** a process restarts
- **THEN** it counts every sibling as last seen at its own start, and as gone only once three
  poll intervals pass after that without the sibling's heartbeat changing
- **AND** the id it writes in its own file is new, so its first heartbeat changes the file
  whatever the file held before

#### Scenario: The first heartbeat comes before the first claim

- **WHEN** a process starts
- **THEN** its heartbeat lands before its first cycle chooses a candidate

#### Scenario: A read from before a long run is not used after it

- **WHEN** a process has worked an item for longer than three poll intervals and goes on to its
  next candidate
- **THEN** it reads the heartbeat files again before choosing, and counts as gone no sibling
  that kept writing heartbeats

#### Scenario: A sibling that restarted during a claim counts

- **WHEN** a sibling restarts and posts a claim message on an item after this process chose it
- **THEN** this process reads the heartbeat files again before verifying, and counts the
  sibling's message

#### Scenario: Every heartbeat file in one read

- **WHEN** a process reads its role's heartbeat files
- **THEN** it reads all of them, with their contents, in one request, and judges each sibling's
  file changed by its blob id

#### Scenario: A rank with no seat to spend is not available

- **WHEN** every seat that serves rank 2's role is past its reserve line
- **THEN** rank 2's heartbeat says it is not available, and an item rank 2 owns goes first to the
  next available rank

#### Scenario: A process that cannot write its heartbeat stands down

- **WHEN** a process has failed to write its heartbeat for two poll intervals
- **THEN** it starts no claim, and its timer stops its worker at its next firing, leaving the
  claim
- **AND** once a heartbeat lands, it resumes

#### Scenario: A silent worker is still stopped by the timer

- **WHEN** a process stands down while its worker runs a tool that produces no event for longer
  than a poll interval
- **THEN** the timer stops the worker within half a poll interval of the stand-down, without
  waiting for an event

#### Scenario: A roster that fails a check at a cycle is refused

- **WHEN** a process reads `igor.config.yaml` at the start of a cycle, and its roster lists one
  rank twice
- **THEN** the process goes on under the last configuration that passed, and does not exit
- **AND** a condition names `igor.config.yaml` and the failing check, until a later read passes
  and the configuration it read takes effect

#### Scenario: A removed seat file takes effect even in a refused read

- **WHEN** a process reads its configuration at the start of a cycle, the read fails a check, and
  it finds a seat file removed
- **THEN** it goes on under the last configuration that passed, except that the removed seat is
  gone from it, and the condition names the failing file and check

#### Scenario: A heartbeat replaces only its own rank's

- **WHEN** two ranks of one role write heartbeats at the same time, and the state branch rejects
  one because the other moved the branch first
- **THEN** the rejected one is retried, it overwrites only its own file, and both heartbeats are
  present afterwards

### Requirement: Only the rank holding a claim gives it back

Where several processes run one role, a process SHALL remove the role's label from an item only
where its own claim message holds the item: the earliest claim message that counts carries its
rank. That covers every way a claim is given back other than the end of a run: setting an item
down after a failure before the worker that repeats (#173, `pre-worker-breaker`), and answering a
stop. A process whose message does not hold
the item SHALL drop out silently: it removes nothing, posts nothing, and leaves the label to the
rank that holds the item. Which failures before the worker count toward setting an item down,
and who posts the set-down, are `pre-worker-breaker`'s (#173) rules. Dropping out silently is an
exception to *A claim that cannot be kept is given back, out loud*, since the claim is not this
process's to give back. A process whose verification fails
cannot tell whether it holds the item, so it counts as not holding it. A process whose claim
message failed to post holds nothing; where no other claim message on the item counts, it removes
the label it set, since the label then has nobody behind it.

A stop said on an item a person handed over SHALL be answered only by the rank whose claim
message holds the item, which halts its run and gives the claim back as any stop does. Every
other rank SHALL ignore the stop. Where no claim message on the item counts, because no rank has
claimed it yet or its holder is gone, the process that reaches the item answers the stop.

#### Scenario: A failed verification by a rank that does not hold the item removes nothing

- **WHEN** ranks 1 and 2 both claim an item, rank 1's claim message holds it, and rank 2's
  verification fails
- **THEN** rank 2 leaves the label in place and posts nothing, and rank 1 works the item

#### Scenario: A claim message that failed to post leaves no label behind

- **WHEN** a process sets the role's label on an unclaimed item, its claim message fails to post,
  and no other claim message on the item counts
- **THEN** it removes the label

#### Scenario: The holder sets an item down

- **WHEN** a failure before the worker repeats for the rank whose claim message holds the item
- **THEN** that rank removes the label and says so on the item, as `pre-worker-breaker` (#173)
  says

#### Scenario: Only the holder answers a stop on a handed-over item

- **WHEN** a person hands an issue to `backend`, rank 2's claim message holds it and its worker
  runs, and the person says stop
- **THEN** rank 1 ignores the stop, and rank 2 halts its run at its next checkpoint, removes the
  label and posts the stop receipt

#### Scenario: A stop on a hand-over nobody has claimed

- **WHEN** a person hands an issue over and says stop before any rank's claim message is on it
- **THEN** the first rank to reach the item removes the label and posts the stop receipt

### Requirement: A rank removed from the roster exits cleanly

A process that exits because the roster no longer declares its rank SHALL log that the roster no
longer declares rank `<rank>` of `<role>`, and SHALL then exit with status 0. The systemd unit
that `stuck-conditions`' *A process that refuses to start exits with status 78* (#82,
`stopped-scope-visible`) has this repository ship restarts a process only on a failure, so it
does not restart a retired rank, and the unit shows inactive with Igor's line in its journal.
Under compose, which #82 has restart every exit, a rank is retired by removing its service, as
#82 says (`docker compose up -d --remove-orphans`).

#### Scenario: A retired rank's unit is inactive and is not restarted

- **WHEN** the roster no longer declares rank 2 of `backend`, and `igor@backend-2` finishes its
  item and exits
- **THEN** it exits with status 0, systemd does not restart it, and `systemctl status
  igor@backend-2` shows it inactive, with the line saying the roster no longer declares rank 2 of
  `backend` in its journal

#### Scenario: Starting a retired rank again is refused

- **WHEN** a person starts `igor@backend-2` again while the roster still does not declare rank 2
- **THEN** it refuses to start, naming the ranks the roster declares, and exits with status 78
- **AND** systemd shows the unit as failed and does not restart it
