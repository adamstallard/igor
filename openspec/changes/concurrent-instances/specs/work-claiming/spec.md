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
messages posted since the item's latest release and leaving out those of ranks whose claims may
be adopted (see *A retired rank does not hold its items forever*).

Storage order means the surface's own sequence key. A timestamp is not one: surfaces report
times to the second, and processes sharing a poll interval act inside the same second, so a
clock is ambiguous exactly where the tiebreak is needed.

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

Where the other holder is a process of the Igor's own role, the role's label names both, so the
label names another party and standing down SHALL leave it in place. Removing it would release
the winner's claim, and the winner would read the removal, made by its own bot account, as its
own release and carry on, while the item showed no claim.

The re-read SHALL come within one poll interval of the claim message. A process that reaches it
later SHALL stand down without working the item. In that time a rank with an earlier claim
message may have passed the abandonment bound, so the re-read would leave its message out, and
that rank may then return and recover the item.

The settle interval does not apply where a person handed the item to the Igor; see *A person
can direct an Igor through the holder field*.

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

## ADDED Requirements

### Requirement: A claim names the process that took it

Where several processes run one role, a claim message SHALL carry the rank of the process that
posted it, and verification SHALL treat a claim carrying another rank as belonging to another
process.

All processes of a role act as the role's identity, such as its GitHub App, and set the same
holder value, such as its `igor:<role>` label. Without the rank, each reads the claim as its
own, and both work the item. That produces two pull requests for one issue, the most visible
misfire available, in front of the people the claim was meant to reassure.

The rank is supplied to the process when it is started, not discovered: the supervisor starts
the processes, and a process that counted its own siblings would be a registry. The roster in
`igor.config.yaml` lists the ranks each role may run, and a process whose rank it lacks refuses
to start, so the supervisor's processes and the roster cannot silently disagree. Under systemd the rank is part of the unit's instance name,
`<role>.<rank>`, and a process started with a role and no rank is rank 1.

#### Scenario: A sibling's claim is not the Igor's own

- **WHEN** a process verifies a claim whose holder field names its role and whose earliest claim
  message carries another rank
- **THEN** the claim is another process's and this one stands down

#### Scenario: The rank is readable on the item

- **WHEN** a claim is posted
- **THEN** the message identifies the process, so two processes sharing a rank are visible
  rather than silent

#### Scenario: A rank outside the declared roster fails validation

- **WHEN** a process starts with a rank the configuration does not declare
- **THEN** it refuses to start

#### Scenario: No rank given

- **WHEN** a process is started with a role and no rank
- **THEN** it runs as rank 1

### Requirement: Contention is resolved before a claim, not after it

A process SHALL attempt candidates in an order derived from its rank, and where it may contend
for an item it SHALL wait in proportion to its rank and re-read before claiming.

A process that loses a race after claiming has already posted a claim and must retract it. The
cost of a collision is not the wasted request; it is a claim-and-retract comment on somebody's
item. Reading first means a loser says nothing at all.

The wait SHALL be a multiple of the settle interval, which already means the time for a claim
to become visible to another party.

#### Scenario: Enough work for everyone

- **WHEN** there are at least as many candidates as processes
- **THEN** each process begins at a different candidate, and none waits

#### Scenario: Contending for one item

- **WHEN** two processes would take the same item
- **THEN** the lower rank claims first, and the higher rank re-reads, finds it held, and posts
  nothing

#### Scenario: A higher rank waits longer

- **WHEN** ranks 2 and 3 may both contend for one item
- **THEN** rank 2 waits one settle interval and rank 3 waits two before re-reading

### Requirement: A process recovers the claims of its own predecessor

A claim whose holding message, the earliest claim message that counts, carries a process's own
rank SHALL be treated as abandoned by that process, and the item re-worked from the beginning.

Only one process runs at a given rank, so a claim bearing this process's rank was left by a
predecessor that is no longer running. Nothing about the predecessor's work survives it: the
working tree is disposable, and one that outlived a crash is debris rather than a checkpoint,
because the context that knew what it was doing died with the process.

#### Scenario: Restarting after a crash

- **WHEN** a process starts and finds an item claimed with its own rank
- **THEN** it takes the item and works it from the beginning

#### Scenario: A sibling does not adopt it

- **WHEN** a process finds an item held by a rank other than its own, which is declared and not
  gone
- **THEN** it leaves the item alone

### Requirement: A retired rank does not hold its items forever

A claim held by a rank the configuration no longer declares SHALL be adoptable by any process
of the role. So SHALL a claim held by a rank past the abandonment bound: a rank that has missed
three heartbeats, meaning the deciding process has itself watched that rank's heartbeat fail to
move forward for three of its role's poll intervals, 30 minutes at the default 10-minute poll.

Every process SHALL write a heartbeat once every poll interval, including while a worker runs:
it overwrites a file of its own on the state branch, named by its role and rank, with the time
of writing by its own clock. Its first heartbeat SHALL land before its first cycle, so that it
never claims while its file still shows a predecessor that has been gone for a while.

A heartbeat SHALL count only when it moves forward: when the file holds a later time than any
the reading process has read from that file before. A process SHALL keep in its own memory, for
each sibling, the latest time it has read from the sibling's file and the moment it last saw
that time move forward, and SHALL count the sibling gone only once three poll intervals have
passed since that moment, or since the process itself started if it is later. A file that is
missing, or older than one the process has already read, as after the state branch is lost,
reset or rolled back, does not move forward. It lets the count run on from the sibling's last
real heartbeat, and never shortens it. A file's times are compared only with earlier times from
the same file, so no two hosts' clocks are compared.

A process SHALL read its role's heartbeat files before it chooses a candidate, and again before
it verifies a claim. A cycle includes its worker runs, so a read from the start of a cycle can
be older than the bound by the time the cycle chooses its next candidate.

A process that takes over an item whose claim message it leaves out, because that message's
rank is gone or undeclared, SHALL first release the item by removing the role's label and adding
it again, and only then post its own claim message. The left-out message then falls before the item's latest
release, and never counts again, even once its rank comes back.

A process that has failed to write its heartbeat for two poll intervals SHALL stand down: it
starts no claim, and stops its running worker at the worker's next checkpoint, leaving the
claim in place. It resumes once a heartbeat lands. A running worker SHALL reach a checkpoint at
least once every poll interval. Two is one fewer than the three a sibling waits, so with a
checkpoint every interval, a process that cannot write its heartbeat has stopped work before any
sibling may count it gone.

Retiring a process is a decision rather than an event, so the roster records it and nothing has
to detect it. The bound covers only the case the roster cannot: a rank left declared that no
longer runs.

The bound governs how long an unattended claim may sit, never how long work may run. A process
working an item keeps writing heartbeats, so its rank stays counted however long the run takes.

#### Scenario: Scaling down releases the orphan

- **WHEN** a rank is removed from the roster and it held a claim
- **THEN** another process may take that item on the next cycle

#### Scenario: A declared rank that stopped running

- **WHEN** a claim's rank is still declared, and a process has watched its heartbeat fail to move
  forward for three poll intervals
- **THEN** that process may take the item

#### Scenario: An adopted claim holds the item

- **WHEN** a process claims an item whose earlier claim message carries a rank that may be adopted
- **THEN** it removes the role's label and adds it again before posting its own claim message
- **AND** the earlier message falls before the latest release, and the new claim holds the item

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
- **THEN** each process keeps counting from each sibling's last heartbeat that moved forward
- **AND** each live rank rewrites its file within one poll interval, and no process takes a
  claim held by a live rank

#### Scenario: A rolled-back state branch takes no live rank's claim

- **WHEN** the state branch is rolled back to an old commit, leaving every heartbeat file present
  but older than the times already read from it
- **THEN** no process counts those files as moving forward or as old
- **AND** no process takes a claim held by a live rank

#### Scenario: A crashed rank is still recovered after the branch is lost

- **WHEN** a rank's heartbeat file is missing and the rank has crashed
- **THEN** a process counts the rank gone three poll intervals after it last saw the rank's
  heartbeat move forward, or after its own start if that is later, and may then take the rank's
  claims

#### Scenario: A restart starts the clock again

- **WHEN** a process restarts
- **THEN** it counts every sibling as last seen at its own start, and as gone only once three
  poll intervals pass after that without the sibling's heartbeat moving forward

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

#### Scenario: A process that cannot write its heartbeat stands down

- **WHEN** a process has failed to write its heartbeat for two poll intervals
- **THEN** it starts no claim, and its worker stops at the next checkpoint, within one poll
  interval, leaving the claim
- **AND** once a heartbeat lands, it resumes

#### Scenario: A heartbeat replaces only its own rank's

- **WHEN** two ranks of one role write heartbeats at the same time, and the state branch rejects
  one because the other moved the branch first
- **THEN** the rejected one is retried, it overwrites only its own file, and both heartbeats are
  present afterwards
