## MODIFIED Requirements

### Requirement: Assignment expresses a claim; ordering resolves it

Where a tracker offers a native assignment field, a claim SHALL set it, because that is the
signal humans read. Where a surface offers only messages, a claim SHALL be a post. In both
cases resolution SHALL rely on the storage order of writes, not on any conditional-write
primitive.

Storage order means the surface's own sequence key. A timestamp is not one: surfaces report
times to the second, and processes sharing a poll interval act inside the same second, so a
clock is ambiguous exactly where the tiebreak is needed.

#### Scenario: Claim visible in the native field

- **WHEN** an Igor claims an item on a tracker with assignment
- **THEN** the assignee field shows the Igor
- **AND** a human reading the tracker sees the claim without knowing any convention

#### Scenario: No dependence on conditional writes

- **WHEN** a claim is taken on any surface
- **THEN** correctness does not depend on a compare-and-set guarantee from that surface's API

#### Scenario: Claims written in the same second still order

- **WHEN** two processes claim one item and the surface reports both at the same timestamp
- **THEN** the surface's sequence key decides, and exactly one claim stands

## ADDED Requirements

### Requirement: A claim names the process that took it

Where several processes run behind one account, a claim SHALL carry the rank of the process
that took it, and verification SHALL treat a claim carrying another rank as belonging to
another process.

Without it two processes sharing an account both read the account among the holders, both
answer "held by me", and both work the item — producing two pull requests for one issue, which
is the most visible misfire available and lands in front of the people the claim was meant to
reassure.

The rank is supplied to the process when it is started, not discovered: a supervisor is the
only thing that knows how many processes there are, and a process that counted its own siblings
would be a registry.

#### Scenario: A sibling's claim is not the Igor's own

- **WHEN** a process verifies a claim on an item held by its account and carrying another rank
- **THEN** the claim is another process's and this one stands down

#### Scenario: The rank is readable on the item

- **WHEN** a claim is posted
- **THEN** the message identifies the process, so two processes sharing a rank are visible
  rather than silent

#### Scenario: A rank outside the declared roster fails validation

- **WHEN** a process starts with a rank the configuration does not declare
- **THEN** it refuses to start

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

### Requirement: A process recovers the claims of its own predecessor

A claim carrying a process's own rank SHALL be treated as abandoned by that process, and the
item re-worked from the beginning.

Only one process runs at a given rank, so a claim bearing this process's rank was left by a
predecessor that is no longer running. Nothing about the predecessor's work survives it: the
working tree is disposable, and one that outlived a crash is debris rather than a checkpoint,
because the context that knew what it was doing died with the process.

#### Scenario: Restarting after a crash

- **WHEN** a process starts and finds an item claimed with its own rank
- **THEN** it takes the item and works it from the beginning

#### Scenario: A sibling does not adopt it

- **WHEN** a process finds an item claimed with a rank other than its own, which is declared
- **THEN** it leaves the item alone

### Requirement: A retired rank does not hold its items forever

A claim held by a rank the configuration no longer declares SHALL be adoptable by any process,
as SHALL a claim left unattended beyond a bound.

Retiring a process is a decision rather than an event, so the roster records it and nothing has
to detect it. The bound covers only the case the roster cannot: a rank left declared that no
longer runs.

The bound governs how long an unattended claim may sit, never how long work may run. By the
time it applies the work has finished or the process is gone, so nothing is cut short by it.

#### Scenario: Scaling down releases the orphan

- **WHEN** a rank is removed from the roster and it held a claim
- **THEN** another process may take that item on the next cycle

#### Scenario: A declared rank that stopped running

- **WHEN** a claim is unattended past the bound and its rank is still declared
- **THEN** another process may take the item

#### Scenario: The bound does not shorten a run

- **WHEN** a process is working an item it holds
- **THEN** no bound on unattended claims applies to it
