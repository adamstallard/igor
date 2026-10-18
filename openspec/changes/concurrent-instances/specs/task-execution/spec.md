## REMOVED Requirements

### Requirement: An absolute ceiling backstops the silence windows

**Reason**: Adam decided on 2026-10-13 to remove the absolute ceiling (`ABSOLUTE_CEILING_MS`, 6
hours), including the worker's kill at it. Its other use, the tree sweep's threshold, is
replaced by rank in *The sweep removes trees by rank, never by age*. The silence windows
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

**Migration**: None. No setting named the threshold.

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

### Requirement: The sweep removes trees by rank, never by age

A working tree's directory name SHALL be `<role>-<rank>-<id>`, giving the role and rank of the
process that made it and an id holding no dash, so that the name read from its end gives the id,
then the rank, then the role, whose name may itself hold dashes. Working trees
SHALL be kept in a directory every rank on the host shares, never in a temporary directory
private to one process. Under the systemd unit that directory SHALL be `/var/lib/igor/trees`,
under the `StateDirectory=` every instance of the template shares.

At startup, before its first cycle, a process SHALL remove the trees of its own role and rank.
At the start of each cycle, it SHALL remove the trees of each rank of its role that the roster
does not declare and that is gone, as `work-claiming` defines. With each tree it SHALL remove
the tree's outbox, the directory beside it where the run's declarations are kept, and the tree's
git directory, `<tree>-git` beside it, where there is one. It SHALL NOT remove a tree of another
declared rank, of a rank that is not gone, or of another role, whatever its age. `igor run
--plan` SHALL remove no tree.

A process SHALL remove each tree as the worker user of the rank that made it, by running the
removal under `sudo -u igor-worker-<role>-<rank>`: its own rank's worker user for its
predecessor's trees, and a gone rank's for that rank's.

#### Scenario: A predecessor's tree is removed

- **WHEN** a process starts and finds a tree named with its own role and rank
- **THEN** it removes the tree, its outbox and its git directory before its first cycle

#### Scenario: A sibling's tree is left

- **WHEN** a process finds a tree named with another declared rank of its role
- **THEN** it leaves the tree, however old it is

#### Scenario: A role whose name ends in a number keeps its trees apart

- **WHEN** the roles `web` and `web-2` both run, and rank 2 of `web` sweeps its trees
- **THEN** it reads `web-2-1-k3x9` as rank 1 of `web-2`, and leaves it

#### Scenario: Another role's tree is left

- **WHEN** a process finds a tree named with another role
- **THEN** it leaves the tree, whatever its rank and however old it is

#### Scenario: A retired rank's tree is removed once the rank is gone

- **WHEN** a process finds a tree named with a rank of its role that the roster no longer
  declares, and it has watched that rank's heartbeat fail to change for three poll
  intervals
- **THEN** it removes the tree, its outbox and its git directory, running the removal as
  `igor-worker-<role>-<rank>` for that rank

#### Scenario: A retired rank's tree is left while the rank runs

- **WHEN** a process finds a tree named with a rank the roster no longer declares, whose
  heartbeat still changes
- **THEN** it leaves the tree

#### Scenario: Every rank on the host sees the trees

- **WHEN** two ranks of one role run on one host under the systemd unit
- **THEN** both keep their trees in `/var/lib/igor/trees`, so a sweep finds a retired rank's
  trees
