## MODIFIED Requirements

### Requirement: Work finished before a claim is lost is offered, not discarded

Where a claim is found to be gone between the worker finishing and publication, execution SHALL
distinguish a stop from a loss. A stop SHALL publish nothing. A loss SHALL publish what exists
as a draft, request no reviewers, the new holder included, and leave a message naming what
exists.

#### Scenario: A stop still publishes nothing

- **WHEN** the claim was stopped during execution
- **THEN** nothing is published
- **AND** the run's recorded refusal names the stop

#### Scenario: A loss publishes a draft

- **WHEN** another party holds the item by the time the worker finishes
- **THEN** what the worker produced is published as a draft
- **AND** no reviewers are requested

#### Scenario: The new holder is told what exists

- **WHEN** work is published after a claim was lost
- **THEN** a message on the item names the artifact and says it is theirs to keep, continue, or
  discard

#### Scenario: A role that may not publish still may not

- **WHEN** a claim is lost and the role's allow list permits no pull request
- **THEN** nothing is published, and the refusal is recorded as it would be otherwise

#### Scenario: Losing a claim does not complete the item

- **WHEN** work is published after a claim was lost
- **THEN** the Igor posts the message naming what exists and does nothing else to the item,
  because the item is not the Igor's to finish: it releases its own claim where it has one of its
  own, and where another process of its own role holds the item, the label it shares with that
  process stays, as `work-claiming`'s *Only the rank holding a claim gives it back* says

## REMOVED Requirements

### Requirement: An absolute ceiling backstops the silence windows

**Reason**: Adam decided on 2026-10-13 to remove the absolute ceiling (`ABSOLUTE_CEILING_MS`, 6
hours), including the worker's kill at it. Its other use, the tree sweep's threshold, is
replaced by rank in *The sweep removes trees by rank, never by age*. The silence windows
still kill a worker that goes quiet. A worker that keeps emitting events and never finishes is
killed by no limit, which Adam accepted: a stop is honoured at the next checkpoint. Once the
`read-seat-windows-from-the-stream` change (#143) is built, the seat's reserve line (#143) also
stops new items. The change's design says more.

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

#### Scenario: A tool that never returned is reported as one

- **WHEN** a worker is killed while a tool it dispatched was outstanding
- **THEN** the reason says a tool was running, and for how long nothing was produced

#### Scenario: A hung model is reported as silence

- **WHEN** a worker is killed with no tool outstanding
- **THEN** the reason says it produced nothing, and for how long

### Requirement: A tree's name gives the role and rank of the process that made it

A working tree's directory SHALL be named `<role>-<rank>-<id>`, giving the role and rank of the
process that made it and an id holding no dash, so that the name read from its end gives the id,
then the rank, then the role, whose name may itself hold dashes. The directory the trees are kept
in, which every rank on the host shares, is the one `worker-user` (#175) specifies.

#### Scenario: A role whose name ends in a number keeps its trees apart

- **WHEN** the roles `web` and `web-2` both run, and rank 2 of `web` sweeps its trees
- **THEN** it reads `web-2-1-k3x9` as rank 1 of `web-2`, and leaves it

### Requirement: The sweep removes trees by rank, never by age

Before its first cycle, a serving process SHALL remove the trees of its own role and rank, and at
the start of each cycle those of each rank of its role that the roster does not declare and that is
gone, as `work-claiming` defines, each with its outbox, `<tree>-git` and `<tree>-prompt`, where
present. It SHALL NOT remove a tree of another declared rank, of a rank that is not gone, of another
role, or of rank 0, whatever its age.

#### Scenario: A predecessor's tree is removed

- **WHEN** a process starts and finds a tree named with its own role and rank
- **THEN** it removes the tree, its outbox, its git directory and its prompt directory before its
  first cycle

#### Scenario: A sibling's tree is left

- **WHEN** a process finds a tree named with another declared rank of its role
- **THEN** it leaves the tree, however old it is

#### Scenario: Another role's tree is left

- **WHEN** a process finds a tree named with another role
- **THEN** it leaves the tree, whatever its rank and however old it is

#### Scenario: A retired rank's tree is removed once the rank is gone

- **WHEN** a process finds a tree named with a rank of its role that the roster no longer
  declares, and it has watched that rank's heartbeat fail to change for three poll
  intervals
- **THEN** it removes the tree and its outbox as `igor-worker-<role>-<rank>` for that rank, and the
  tree's git directory and prompt directory as the service user

#### Scenario: A retired rank's tree is left while the rank runs

- **WHEN** a process finds a tree named with a rank the roster no longer declares, whose
  heartbeat still changes
- **THEN** it leaves the tree

#### Scenario: A serving rank leaves a run's trees

- **WHEN** a serving process of `backend` finds a tree named `backend-0-k3x9`
- **THEN** it leaves the tree, however old it is and whether or not the run that made it is gone

#### Scenario: Every rank on the host sees the trees

- **WHEN** two ranks of one role run on one host under the systemd unit
- **THEN** both keep their trees in the directory #175 shares between them, so a sweep finds a
  retired rank's trees

### Requirement: A serving process removes each part of a tree as the user that owns it

A serving process SHALL remove each tree and its outbox as the worker user of the rank that made
the tree, and each `<tree>-git` and `<tree>-prompt` as the service user.

#### Scenario: A tree is removed by the users that own its parts

- **WHEN** rank 2 of the `backend` role removes a tree its predecessor made
- **THEN** it removes the tree and its outbox as `igor-worker-backend-2`, the worker user of the
  rank that made it, and the tree's git directory and prompt directory as the service user

### Requirement: A run by hand removes its own trees as it releases them

Each `igor run` SHALL pick at start a run id of eight lowercase letters and digits, the first a
letter. Its trees SHALL be named `<role>-0-<id>`, the id being the run id followed by a tree id of
any length, so two runs of a role at once never share a tree and a run knows its trees by their id's
first eight characters. A run SHALL remove each of its trees as it releases it at the task's end,
under its own user, since `igor run` has no worker user. `igor run --plan` SHALL remove nothing.

#### Scenario: A run removes only its own trees

- **WHEN** an `igor run backend` that picked the run id `r7k2m9x4` ends a task whose tree is
  `backend-0-r7k2m9x4a1`, beside `backend-0-q2b4n8c6z3` from another run and `backend-1-p2q7`
- **THEN** it removes `backend-0-r7k2m9x4a1`, its outbox, its git directory and its prompt
  directory, and leaves the other two

#### Scenario: A planned run removes nothing

- **WHEN** `igor run backend --plan` runs, and the trees' directory holds a tree of a run whose
  process is gone
- **THEN** it removes no tree, home, plugin directory or lock file

### Requirement: A run removes what a run whose process is gone left

Before its first cycle, `igor run` SHALL find by their lock files, as *Each run holds its lock
file for as long as it runs* has them, each other run of its role whose process is gone, one whose
lock another can take, and remove its trees, each with its outbox, `<tree>-git` and
`<tree>-prompt`, and its home and plugin directory from `pinned-skills` (#174). It SHALL leave what
its user cannot remove, logging the paths and keeping that run's lock file.

#### Scenario: A run removes what a crashed run left

- **WHEN** an `igor run backend` starts and finds `backend-0-q2b4n8c6z3`, whose run, with the run
  id `q2b4n8c6`, crashed, so the lock on `backend-0-q2b4n8c6.lock` is free, beside `backend-0-m5t8w1y3b2` of a run still
  holding its lock
- **THEN** before its first cycle it removes `backend-0-q2b4n8c6z3`, its outbox, `<tree>-git` and
  `<tree>-prompt`, and that run's home and plugin directory, and leaves `backend-0-m5t8w1y3b2`

#### Scenario: A run leaves what another person's crashed run left

- **WHEN** an `igor run backend` starts and finds a tree of a gone run that another person
  started, which its own user cannot remove
- **THEN** it leaves the tree and logs its path, and goes on to its first cycle

#### Scenario: A gone run's lock file goes last

- **WHEN** an `igor run` removes what a gone run left
- **THEN** it removes that run's lock file only after its trees, home and plugin directory

#### Scenario: A crashed run with no tree left is found by its lock

- **WHEN** an `igor run backend` starts and finds the free lock `backend-0-q2b4n8c6.lock` of a run
  that crashed with no tree outstanding
- **THEN** before its first cycle it removes that run's home and plugin directory, then its lock
  file

#### Scenario: A run's tree is left while its lock is held

- **WHEN** an `igor run backend` starts and finds a tree of another run whose lock it cannot take
- **THEN** it removes nothing of that run

### Requirement: Each run holds its lock file for as long as it runs

Each `igor run` SHALL hold an exclusive lock on a file in the trees' directory named
`<role>-0-<run id>.lock` for as long as it runs; the system releases the lock when its process
ends, however it ends.

#### Scenario: A running run's lock cannot be taken

- **WHEN** an `igor run` of `backend` is running and another `igor run` of `backend` starts
- **THEN** the new run cannot take the first run's lock, and does not count it gone
