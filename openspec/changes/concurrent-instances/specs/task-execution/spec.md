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
hours), including the worker's kill at it. Its other use, the tree sweep's threshold, is replaced by
rank in *A serving process removes only its own and gone undeclared ranks' trees*. The silence
windows still kill a worker that goes quiet. A worker that keeps emitting events and never finishes
is killed by no limit, which Adam accepted: a stop is honoured at the next checkpoint. The seat's
reserve line (#143) also stops new items. The change's design says more.

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

### Requirement: The sweep removes trees by rank, never by age

Trees SHALL live in the directory #175 specifies, shared by a host's ranks, each named
`<role>-<rank>-<id>`, its id holding no dash, and removed with what #175 lays beside it, if any:
outbox, `<tree>-git` and `<tree>-prompt`. Each `igor run` SHALL at start pick a run id of eight
lowercase letters and digits, the first a letter, start its trees' ids with it, and remove the
rank-0 trees and #174's home and plugin directory of each gone run of its role. `igor run --plan`
SHALL remove nothing.

#### Scenario: A run removes only its own trees

- **WHEN** an `igor run backend` that picked the run id `r7k2m9x4` ends a task whose tree is
  `backend-0-r7k2m9x4a1`, beside `backend-0-q2b4n8c6z3` from another run and `backend-1-p2q7`
- **THEN** it removes `backend-0-r7k2m9x4a1`, its outbox, its git directory and its prompt
  directory, under its own user, since `igor run` has no worker user, and leaves the other two,
  telling its own trees by the first eight characters of their id, which are its run id; the rest
  of a tree's id, of any length, is the tree's own, so two runs of one role at once never share a
  tree

#### Scenario: Every rank on the host sees the trees

- **WHEN** two ranks of one role run on one host under the systemd unit
- **THEN** both keep their trees in the directory `worker-user` (#175) specifies, which every
  rank on the host shares, so a sweep finds a retired rank's trees

#### Scenario: A run removes what a crashed run left

- **WHEN** an `igor run backend` starts and finds `backend-0-q2b4n8c6z3`, whose run, with the run
  id `q2b4n8c6`, crashed, so the lock on `backend-0-q2b4n8c6.lock` is free, beside `backend-0-m5t8w1y3b2` of a run still
  holding its lock
- **THEN** before its first cycle it removes `backend-0-q2b4n8c6z3`, its outbox, `<tree>-git` and
  `<tree>-prompt`, and that run's home and plugin directory, and leaves `backend-0-m5t8w1y3b2`

#### Scenario: A plan removes nothing a gone run left

- **WHEN** a person runs `igor run backend --plan`, and a gone run of `backend` left trees
- **THEN** the plan removes nothing: none of those trees, nor any tree, home, plugin directory or
  lock file of its own or of any other run

### Requirement: A serving process removes only its own and gone undeclared ranks' trees

A serving process SHALL remove its own rank's trees before its first cycle, and at each cycle's
start those of each rank of its role that the roster does not declare and that is gone
(`work-claiming`). It SHALL remove no other tree, whatever its age, and never a rank-0 tree. It
SHALL remove each tree and its outbox as the worker user of the rank that made it, and each
`<tree>-git` and `<tree>-prompt` as the service user.

#### Scenario: A predecessor's tree is removed

- **WHEN** a process starts and finds a tree named with its own role and rank
- **THEN** it removes the tree, its outbox, its git directory and its prompt directory before its
  first cycle

#### Scenario: A sibling's tree is left

- **WHEN** a process finds a tree named with another declared rank of its role
- **THEN** it leaves the tree, however old it is

#### Scenario: A role whose name ends in a number keeps its trees apart

- **WHEN** the roles `web` and `web-2` both run, and rank 2 of `web` sweeps its trees
- **THEN** it reads `web-2-1-k3x9` from its end, as id, rank, then role, so as rank 1 of `web-2`,
  and leaves it

#### Scenario: Another role's tree is left

- **WHEN** a process finds a tree named with another role
- **THEN** it leaves the tree, whatever its rank and however old it is

#### Scenario: A retired rank's tree is removed once the rank is gone

- **WHEN** a process finds a tree named with a rank of its role that the roster no longer
  declares, and it has watched that rank's heartbeat fail to change for three poll
  intervals
- **THEN** it removes the tree and its outbox as `igor-worker-<role>-<rank>` for that rank, as
  #175 has a release remove them, and the tree's git directory and its prompt directory, which holds
  the system prompt file a crash can leave, as the service user, which owns them under #175

#### Scenario: A retired rank's tree is left while the rank runs

- **WHEN** a process finds a tree named with a rank the roster no longer declares, whose
  heartbeat still changes
- **THEN** it leaves the tree

#### Scenario: A serving rank leaves a run's trees

- **WHEN** a serving process of `backend` finds a tree named `backend-0-k3x9`, of rank 0, which
  is `igor run`'s (`work-claiming`'s *A run by hand runs as rank 0*) and which the roster does
  not declare
- **THEN** it leaves the tree, however old it is and whether or not the run that made it is gone

### Requirement: A run knows another run is gone by its lock

Each `igor run` SHALL hold an exclusive lock on `<role>-0-<run id>.lock` in the trees' directory
while it runs, freed when its process ends. A run whose lock another run can take is gone, even
with no tree left. A run SHALL remove no tree of a run whose lock it cannot take, and removes a
gone run's lock file last. Where the run's own user cannot remove what another person's run left,
it leaves it, logs the paths and keeps that run's lock file, so a later run finds them again.

#### Scenario: A run leaves what another person's crashed run left

- **WHEN** an `igor run backend` starts and finds a tree of a gone run that another person
  started, which its own user cannot remove
- **THEN** it leaves the tree, logs its path and keeps that run's lock file, so a later run finds
  them again, and goes on to its first cycle

#### Scenario: A gone run's lock file goes last

- **WHEN** an `igor run` removes what a gone run left
- **THEN** it removes that run's lock file only after its trees, home and plugin directory
