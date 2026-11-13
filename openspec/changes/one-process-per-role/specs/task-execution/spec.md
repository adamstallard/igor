## MODIFIED Requirements

### Requirement: The abandoned-tree threshold derives from the worker's longest possible life

The sweep that reclaims trees left by a dead process covers every working tree that a starting
`igor serve` does not remove at once (`role-process`), such as one `igor run` made or one another
checkout's process left. For those trees, the sweep SHALL use a threshold above the longest a tree can be in use: the absolute ceiling plus the provisioning and publication either side of the
worker. The margin SHALL be additive, because what a tree outlives its worker by is a clone and
a push rather than a share of the run.

#### Scenario: A tree in use by the longest possible worker is not swept

- **WHEN** a worker has run to the absolute ceiling and its tree is still held
- **THEN** the sweep does not remove that tree

#### Scenario: The threshold follows the ceiling

- **WHEN** the absolute ceiling changes
- **THEN** the sweep threshold changes with it

### Requirement: Igor forwards the termination it is sent

Where a process with no graceful shutdown is signalled, execution SHALL kill the group of every
worker it spawned. Where it winds down gracefully instead, as `igor serve` does on SIGINT or
SIGTERM, every running worker SHALL be left running, and SHALL be killed when the process exits. A worker in its own group is outside the group a terminal
signals, so nothing but Igor will reach it.

#### Scenario: An interrupted process takes the worker with it

- **WHEN** a process with no graceful shutdown is sent SIGINT or SIGTERM while a worker runs
- **THEN** the worker's process group is killed before the process exits

#### Scenario: Winding down leaves the item in hand running

- **WHEN** a process that winds down gracefully is signalled while its workers run
- **THEN** each worker keeps running, and each item is completed or handed off as it would be

#### Scenario: No worker outlives the process

- **WHEN** the process exits with a worker still running
- **THEN** that worker's process group is killed
