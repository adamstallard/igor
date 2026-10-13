## REMOVED Requirements

### Requirement: An absolute ceiling backstops the silence windows

**Reason**: Adam decided on 2026-10-13 to remove the absolute ceiling (`ABSOLUTE_CEILING_MS`, 6
hours), including the worker's kill at it. Its other use, the tree sweep's threshold, is
replaced by rank in *The startup sweep removes trees by rank, never by age*. The silence windows
still kill a worker that goes quiet. A worker that keeps emitting events and never finishes is
killed by no limit, which Adam accepted: a stop is honoured at the next checkpoint. Once the
`budget-pacing` change is built, the seat's reserve line, a spend threshold per seat, also stops
new items. The change's design says more.

**Migration**: None. No setting named the ceiling.

### Requirement: A killed worker's failure names the limit it breached

**Reason**: It named three limits, and the third, a run that never ended, was the absolute
ceiling, which is removed. *A killed worker's failure names the silence it breached* keeps the
other two unchanged.

**Migration**: None.

### Requirement: The abandoned-tree threshold derives from the worker's longest possible life

**Reason**: The threshold was the absolute ceiling plus an hour, and the ceiling is removed. Age
was the only safe signal while a tree could belong to any live sibling. A tree named by its
role and rank says whose it is, so the sweep no longer needs an age.

**Migration**: A process started with no rank still names its trees with rank 1, so a tree name
with no rank always predates the change. The sweep leaves such trees, and they stay until removed
by hand or by a reboot that clears the temp directory.

## ADDED Requirements

### Requirement: A killed worker's failure names the silence it breached

Where a worker is killed for a limit, the recorded reason SHALL distinguish a tool that never
returned from a model that never answered, and SHALL state the limit's duration.

Whoever reads the handoff acts on the two differently. A single message covering both tells
them neither.

#### Scenario: A tool that never returned is reported as one

- **WHEN** a worker is killed while a tool it dispatched was outstanding
- **THEN** the reason says a tool was running, and for how long nothing was produced

#### Scenario: A hung model is reported as silence

- **WHEN** a worker is killed with no tool outstanding
- **THEN** the reason says it produced nothing, and for how long

### Requirement: The startup sweep removes trees by rank, never by age

A working tree's name SHALL carry the role and rank of the process that made it. At startup,
before its first cycle, a process SHALL remove the trees of its own role and rank, and of its
role's ranks that the roster no longer declares. With each tree it SHALL remove the tree's
outbox, the directory beside it where the run's declarations are kept. It SHALL NOT
remove a tree of another declared rank, or of another role, whatever its age.

Only one process runs at a rank, so at startup no tree of that rank is in use: each was left by
a predecessor that died. A tree of another declared rank may belong to a live sibling, and
deleting a live sibling's tree corrupts its run, while leaving debris costs only disk.

#### Scenario: A predecessor's tree is removed

- **WHEN** a process starts and finds a tree named with its own role and rank
- **THEN** it removes the tree and its outbox before its first cycle

#### Scenario: A sibling's tree is left

- **WHEN** a process starts and finds a tree named with another declared rank of its role
- **THEN** it leaves the tree, however old it is

#### Scenario: A retired rank's tree is removed

- **WHEN** a process starts and finds a tree named with a rank of its role that the roster no
  longer declares
- **THEN** it removes the tree and its outbox
