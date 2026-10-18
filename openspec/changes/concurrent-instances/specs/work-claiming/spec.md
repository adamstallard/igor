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

Where the other holder is a process of the Igor's own role, standing down SHALL leave the role's
label in place, since that label is the winner's too.

The re-read SHALL come within one poll interval of the claim message. A process that reaches it
later SHALL stand down without working the item, leaving the role's label in place, since a
sibling it has not identified may hold the item.

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

## ADDED Requirements

### Requirement: A claim names the process that took it

A claim message SHALL carry the rank of the process that posted it, whether or not the role runs
several processes, and verification SHALL treat a claim carrying another rank as belonging to
another process. Claim messages, and the trailers in them, SHALL be read only from comments the
role's own bot account wrote.

A role runs several processes when the roster, which `role-config` specifies, declares more
than one rank for it. The rank SHALL be given to the process when it is started, never
discovered or counted, as the last part of its name, `<role>-<rank>`, which `role-config`
specifies.

#### Scenario: A sibling's claim is not the Igor's own

- **WHEN** a process verifies a claim whose holder field names its role and whose earliest claim
  message carries another rank
- **THEN** the claim is another process's and this one stands down

#### Scenario: The rank is readable on the item

- **WHEN** a claim is posted
- **THEN** the message carries the rank of the process that posted it, so a person reading the
  item sees which process holds it, and two processes posting the same rank on one item show
  that they share it

#### Scenario: A claim message someone else wrote does not count

- **WHEN** a comment not written by the role's bot account carries `Igor-Rank: 1`
- **THEN** no process reads it as a claim message

#### Scenario: The rank is the last part of the name

- **WHEN** a process is started as `igor serve front-end-2`
- **THEN** it runs as rank 2 of the `front-end` role

### Requirement: A run by hand does not run beside a serving rank 1

`igor run <role>`, with or without `--plan`, SHALL run as rank 1 of the role, and SHALL refuse
to start, as `igor serve` does, where the roster does not declare rank 1. Before anything else it
does, it SHALL read
rank 1's heartbeat file, and read it again once one of the role's poll intervals has passed,
even where the file was missing. Where the file changed or appeared between the two reads, a
process is serving rank 1, and `igor run` SHALL refuse to start, naming that instance,
`igor@<role>-1`. Where it did neither, nobody is serving rank 1, and the run goes ahead.

#### Scenario: A run beside a serving rank 1 is refused

- **WHEN** `igor@backend-1` is running and a person runs `igor run backend`
- **THEN** the run refuses to start, naming `igor@backend-1`, and claims and removes nothing

#### Scenario: A run by hand for a rank the roster does not declare is refused

- **WHEN** the roster lists `backend: [2, 3]` and a person runs `igor run backend`
- **THEN** the run refuses to start, naming the ranks the roster declares

#### Scenario: A role nobody serves runs by hand

- **WHEN** no process serves rank 1 of `backend`, and a person runs `igor run backend`
- **THEN** the run goes ahead as rank 1

### Requirement: Contention is resolved before a claim, not after it

A process SHALL attempt candidates in an order derived from its rank: rank k starts at its k-th
candidate and goes on round the list. Rank k contends only when it has fewer than k candidates.
A process that contends SHALL wait (k − 1) settle intervals, re-read the item, and claim it only
if no claim that counts is on it; rank 1 never waits. Seeing the item held, it SHALL move on
without posting anything.

#### Scenario: Enough work for everyone

- **WHEN** rank k has at least k candidates
- **THEN** it starts at its k-th candidate and does not wait

#### Scenario: Contending for one item

- **WHEN** two processes would take the same item
- **THEN** the lower rank claims first, and the higher rank re-reads, finds it held, and posts
  nothing

#### Scenario: A higher rank waits longer

- **WHEN** ranks 2 and 3 both contend for one item
- **THEN** rank 2 waits one settle interval and rank 3 waits two before re-reading

### Requirement: A hand-over among one role's ranks is contested like found work

Where several processes run one role and a person hands an item to the role, its ranks SHALL
decide which works it by the contest of *Contention is resolved before a claim, not after it*:
rank k waits (k − 1) settle intervals, re-reads the item, and posts a claim message only if no
claim message that counts is on it, and rank 1 posts at once. Only a rank free to take an item
SHALL contend; a rank whose worker is running does not. A rank that posts SHALL verify its claim
after the settle interval, as for an item its search found, and the earliest claim message that
counts holds the item.

A rank that takes over a handed-over item, removing the role's label and adding it again under
*A retired rank does not hold its items forever*, SHALL record in its claim message that the
item was handed over. The adapter SHALL read an item whose holding claim message records a
hand-over as handed over by a person, as it would read the person's label.

#### Scenario: The lowest free rank takes a hand-over

- **WHEN** a person adds `igor:backend` to an issue and ranks 1 and 2 of `backend` are free
- **THEN** rank 1 posts its claim message at once, and rank 2, re-reading after one settle
  interval, finds it and posts nothing
- **AND** exactly one claim message appears

#### Scenario: A busy rank does not contend

- **WHEN** a person hands an item over while rank 1's worker is running and rank 2 is free
- **THEN** rank 1 does not contend, and rank 2 posts after its wait and works the item

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

A claim whose holding message, the earliest claim message that counts, carries a process's own
rank SHALL be treated by that process as abandoned by its predecessor, and the item re-worked
from the beginning.

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

Where the pull request still merges, carrying on changes nothing on the item: the process runs
no worker, and the item waits as any item with the Igor's pull request open does.

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

Every process SHALL write a heartbeat once every poll interval, including while a worker runs:
it overwrites a file of its own on the state branch, named by its role and rank, holding an id
the process chose when it started and a counter it increments on each write. Its first heartbeat
SHALL land before its first cycle. A heartbeat file SHALL hold no time that any process compares.

A heartbeat SHALL count only when it changes: when the file holds an id and counter other than
the ones the reading process last read from it. A process SHALL keep in its own memory, for each
sibling, the id and counter it last read from the sibling's file and the moment, by its own
clock, at which it last saw them change, and SHALL count the sibling gone only once three poll
intervals have passed since that moment, or since the process itself started if it is later. A
missing file does not change. Neither the sibling's clock nor any time in the file decides
whether it changed.

A process SHALL read its role's heartbeat files before it chooses a candidate, and again before
it verifies a claim. It SHALL read all of them in one request for the state branch's tree, and
SHALL judge each file changed by its blob id, so that it fetches no file's contents.

A process taking over an item whose earlier claim message no longer counts, because that
message's rank is gone, SHALL first release the item by removing the role's label and adding it
again, and SHALL then post its own claim message at once. An item whose open pull request the
Igor opened is the exception, taken over without a release, as *A claim left on the Igor's open
pull request is caught up* says.

A running worker SHALL reach a checkpoint at least once every two poll intervals. A process
SHALL stand down once it has failed to write its heartbeat for two poll intervals. Where the
longest gap between a worker's checkpoints, a fixed property of Igor's worker, is longer than a
role's poll interval, a process of that role SHALL instead stand down once it has failed to write
its heartbeat for one poll interval. Standing down,
it starts no claim, and stops its running worker at the worker's next checkpoint, leaving the
claim in place. It resumes once a heartbeat lands.

A run stopped by standing down ends holding its claim, and says nothing on the item. That is an
exception to *A claim that cannot be kept is given back, out loud*, and to `graceful-handoff`'s
rule that silence after a claim is not permitted: by the time the process
stands down, a sibling may already count it gone and have taken the item over, so a release
could undo the sibling's fresh claim. A sibling takes the claim over once the rank is gone.

A process SHALL read the roster at the start of each cycle. A process whose rank the roster no
longer declares SHALL start no claim, and SHALL shut down as when it is asked to stop: it finishes the
item in hand, or hands it off out loud, as `work-discovery`'s scenario *Shutdown finishes the
item in hand* says, and then exits. It keeps writing heartbeats until it exits, so no sibling
takes its claims unless it dies first.

#### Scenario: Scaling down releases the orphan

- **WHEN** a rank is removed from the roster and it held a claim
- **THEN** another process may take that item only if the rank died before giving it up, and
  only once it has watched the rank's heartbeat fail to change for three poll intervals

#### Scenario: A rank removed from the roster is not adopted while it runs

- **WHEN** a rank is removed from the roster while its worker is running
- **THEN** no other process takes its claims while its heartbeat still changes

#### Scenario: A process whose rank leaves the roster shuts down

- **WHEN** the roster no longer declares a running process's rank while its worker runs
- **THEN** it starts no claim, finishes the item or hands it off out loud, and then exits

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
- **THEN** it reads all of them in one request for the state branch's tree, and judges each by
  its blob id without fetching its contents

#### Scenario: A process that cannot write its heartbeat stands down

- **WHEN** a process has failed to write its heartbeat for two poll intervals
- **THEN** it starts no claim, and its worker stops at the next checkpoint, leaving the claim
- **AND** once a heartbeat lands, it resumes

#### Scenario: A worker reaches a checkpoint within two intervals

- **WHEN** a worker runs for longer than two poll intervals
- **THEN** it reaches a checkpoint at least once in every two poll intervals

#### Scenario: Workers whose checkpoints are further apart stand down sooner

- **WHEN** a role's worker can go longer than one poll interval between checkpoints, and a
  process has failed to write its heartbeat for one poll interval
- **THEN** it starts no claim, and its worker stops at the next checkpoint, leaving the claim

#### Scenario: A heartbeat replaces only its own rank's

- **WHEN** two ranks of one role write heartbeats at the same time, and the state branch rejects
  one because the other moved the branch first
- **THEN** the rejected one is retried, it overwrites only its own file, and both heartbeats are
  present afterwards
