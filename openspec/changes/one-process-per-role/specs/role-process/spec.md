## Purpose

Run each role as one `igor serve` process at a time, whose throughput comes from the workers it
runs at once: up to the role's `workers`, each in a worker slot of its own and on a seat of its
own. Keep a second process of the role, started by mistake, from working beside the first, and
have a process that starts after a crash or a restart adopt or give back every claim its
predecessor left.

## ADDED Requirements

### Requirement: One process serves a role at a time

At most one `igor serve` process SHALL serve a role at any moment, and no other `igor serve`
process of the role SHALL claim, publish or post for its items. Different roles MAY run on
different hosts.

#### Scenario: A second process of a served role does not serve

- **WHEN** `igor serve backend` starts on host B while a process on host A serves `backend`
- **THEN** the process on B exits with status 78 before its first cycle
- **AND** the process on A goes on serving

#### Scenario: Two roles on two hosts both serve

- **WHEN** `igor serve backend` runs on host A and `igor serve frontend` on host B
- **THEN** both serve, each its own role

### Requirement: A serving process rewrites its serving record every 5 minutes

A serving process SHALL keep its role's serving record on the state branch: a start id picked
at random at each start, a counter, its host name and process id, and its lock directory's id.
It SHALL rewrite it, raising the counter, every 5 minutes, from a timer that runs whatever the
poll interval, cycle and workers. Each write SHALL be conditional on the record it last read or
wrote, or on its absence, and a failed one that finds its own start id SHALL be sent again.

#### Scenario: The record is rewritten while a long worker runs

- **WHEN** a worker runs for an hour
- **THEN** the serving record's counter rises every 5 minutes while it runs

#### Scenario: A slow poll interval does not slow the record

- **WHEN** a role's poll interval is 30 minutes
- **THEN** its serving process still rewrites the record every 5 minutes

#### Scenario: A record another process wrote displaces this one

- **WHEN** a serving process's conditional write fails, and the record names another start id
- **THEN** the process stops every worker at once, posts nothing, and exits with status 1

#### Scenario: A write that finds its own record is sent again

- **WHEN** a serving process's conditional write fails, and the record still names its own start
  id, as after an earlier write of its own landed late
- **THEN** it writes again, conditional on the record it now reads, and goes on serving

#### Scenario: A record that is gone is written again

- **WHEN** a serving process finds its role's serving record absent, as after the state branch
  was lost
- **THEN** it writes the record again, conditional on its still being absent

### Requirement: A starting process refuses to start beside a live process of its role

Before its first cycle, a starting process SHALL take its role's lock in a lock directory beside
its local clone of the lore repository, which the operating system releases when its holder
ends, exiting with status 78 where it cannot. Unless *A process restarted from its own checkout
takes over at once* applies, it SHALL watch the serving record for 30 minutes, exiting with
status 78 where a write lands, naming the writer's host, pid and start id, and with 1 where the
record disappears.

#### Scenario: A second process from the same checkout is refused at once

- **WHEN** a person runs `igor serve backend` from the lore checkout the unit `igor@backend`
  serves from, while it serves
- **THEN** the process cannot take the role's lock and exits with status 78 at once

#### Scenario: A live process on another host is found by its record

- **WHEN** `igor serve backend` starts on host B while a process on host A serves `backend`
- **THEN** within 30 minutes it sees the record's counter rise, logs host A's name, the serving process's start id and
  the other process's id, and exits with status 78

#### Scenario: A record left by a crash on another host is taken over

- **WHEN** the process serving `backend` on host A crashed, and `igor serve backend` starts on
  host B
- **THEN** after 30 minutes with no change to the record, the process on B takes over

#### Scenario: Different poll intervals do not change the watch

- **WHEN** a process polling every 10 minutes starts on host B while a process on host A,
  polling every 30, serves its role
- **THEN** within 30 minutes it sees the record's counter rise, and exits with status 78

#### Scenario: A record lost during the watch restarts the watch

- **WHEN** the serving record disappears while a starting process watches it
- **THEN** the process exits with status 1, and its supervisor starts it again to watch afresh

### Requirement: A process takes over its role with one conditional write

A process SHALL take over its role by writing the serving record with its own start id,
conditional on the record still holding what the process read when it started. Where the
write fails because the record changed, the process SHALL exit with status 78; where it cannot
read the record, or its write gets no answer, with status 1. It SHALL NOT discover, triage or
claim before it has taken over.

#### Scenario: Two processes started together

- **WHEN** two processes of one role, on two hosts, start within the same minute and watch the
  same record
- **THEN** one takeover write lands, and the other process's write fails and it exits with
  status 78

#### Scenario: GitHub does not answer a starting process

- **WHEN** a starting process cannot read its role's serving record, or its takeover write gets
  no answer
- **THEN** it exits with status 1, and its supervisor starts it again

#### Scenario: Nothing is claimed during the watch

- **WHEN** a starting process is watching the record
- **THEN** it runs no discovery, triage or claim

### Requirement: A process restarted from its own checkout takes over at once

Where the serving record names the starting process's own lock directory, and the process holds
that directory's role lock, it SHALL take over without watching, because the record's writer
held that lock while it lived and so has ended.

#### Scenario: A crash restarted by systemd

- **WHEN** the process serving `backend` crashes and systemd starts `igor@backend` again on the
  same host
- **THEN** the new process takes over before its first cycle, without waiting 30 minutes

#### Scenario: Another checkout on the same host is another lock directory

- **WHEN** `igor serve backend` starts from a second lore checkout on the host where a process
  serves `backend` from the first
- **THEN** its lock directory differs from the record's, and it watches the record as a process
  on another host does

### Requirement: A serving process that cannot rewrite its record stops its workers

Where a serving process's last landed record write was sent 20 minutes ago, it SHALL stop every
worker at once, post nothing, leave its claims for the next serving process to adopt, and exit
with status 1. Its timer SHALL check at every firing, and the process SHALL check before every
claim, publication or post, measuring age on a clock that counts time the host was suspended. A
starting process watches for 30 minutes, so this process stops first.

#### Scenario: GitHub does not answer for 20 minutes

- **WHEN** every record write fails for 20 minutes while three workers run
- **THEN** the process stops all three workers, leaves their items labelled with nothing posted,
  and exits with status 1

#### Scenario: A paused process resumes

- **WHEN** a serving process resumes after a pause longer than 20 minutes
- **THEN** it stops its workers before it claims, publishes or posts anything, and exits with
  status 1

#### Scenario: A long cycle does not delay the check

- **WHEN** a cycle's triage takes longer than 20 minutes while every record write fails
- **THEN** the timer stops the workers once the last landed write is 20 minutes old

### Requirement: A process that takes over adopts or gives back every claim of its role

After taking over, before new claims, the process SHALL treat every item whose holder entry the
Igor itself set as its predecessor's claim, whatever the discovery watermark. It
SHALL catch up an item with the Igor's open pull request, then give the claim back, and triage
any other again, working it under a fresh claim message or giving the claim back out loud. An
entry a person set is not adopted: it directs the Igor as any hand-over does.

#### Scenario: A claimed item with no pull request is worked again

- **WHEN** a process takes over and an issue carries `igor:backend`, which the Igor added, with no
  pull request, and triage proceeds
- **THEN** the process posts a fresh claim message and works the issue

#### Scenario: A claimed item whose pull request is open is caught up

- **WHEN** a process takes over and an issue carrying the Igor's own `igor:backend` has the Igor's
  open pull request
- **THEN** the process brings that pull request up to date where it no longer merges, and gives
  the claim back

#### Scenario: A claim triage now refuses is given back out loud

- **WHEN** a process takes over and triage now skips an issue carrying the Igor's own
  `igor:backend`
- **THEN** the process gives the claim back with a comment saying why

#### Scenario: A person's hand-over is not adopted

- **WHEN** a process takes over and a person added `igor:backend` to an issue that another
  party's open pull request references
- **THEN** the label stays, and the issue waits for that pull request as any hand-over does

#### Scenario: A claim below the watermark is still found

- **WHEN** an issue carrying the Igor's own `igor:backend` was last updated before the source's
  watermark
- **THEN** the process taking over still finds and adopts it

### Requirement: A stop said while no process served the role is answered at adoption

Where a stop directed at the Igor was said on an adopted item after the latest claim message the
Igor posted there, and no go-ahead lifts it as `work-claiming` allows for an item the Igor found itself, the process SHALL NOT work
the item. It SHALL remove its holder entry and post
a stop receipt, as for a stop said while no run is active.

#### Scenario: A stop said while the role was down

- **WHEN** a person says stop on an issue carrying the Igor's own `igor:backend` while no process
  serves `backend`, and a process then takes over
- **THEN** the process does not work the issue, removes `igor:backend` and posts a stop receipt

### Requirement: A role's workers run at once, each in a slot of its own

A serving process SHALL run up to its role's `workers` workers at once, in worker slots numbered
from 1, each on a different item. A cycle SHALL hand the items it would claim, in the order it
would claim them, to free slots, without waiting for a worker to finish. An item that finds no
free slot or seat SHALL NOT be claimed (`work-discovery` keeps the watermark below it); an adopted
one SHALL stay claimed and be worked before any new item as slots and seats free.

#### Scenario: More items than slots

- **WHEN** a role with `workers: 2` has three items triage proceeds on, and no worker is running
- **THEN** the cycle claims the first two and starts a worker on each, and leaves the third
  unclaimed for a later cycle

#### Scenario: An adopted item waits for a slot, not given back

- **WHEN** a process with `workers: 1` takes over three claims its predecessor left, and triage
  proceeds on all three
- **THEN** it works the first, keeps the other two claimed, and works each as the slot frees,
  before claiming any new item

#### Scenario: A cycle runs while workers run

- **WHEN** a cycle starts while two workers of the role are still running
- **THEN** it runs, and hands new items only to the free slots

#### Scenario: One worker by default

- **WHEN** a role does not set `workers`
- **THEN** its process runs one worker at a time

### Requirement: An item a worker holds is passed over, and a stop on it reaches that worker

A cycle SHALL pass over, before triage, every item one of the process's workers is working. A
stop on such an item SHALL be answered by that worker's run, at its next check for a stop, and
not by the cycle. The process's other workers SHALL go on.

#### Scenario: A cycle meets an item a worker holds

- **WHEN** a cycle's discovery returns an item a worker of the process is working
- **THEN** the cycle neither triages nor claims it

#### Scenario: A stop on one of three running items

- **WHEN** a person says stop on the item in slot 2 while slots 1 and 3 work other items
- **THEN** slot 2's run halts and posts the stop receipt, and slots 1 and 3 go on
- **AND** the cycle posts no stop receipt for that item

### Requirement: Running workers do not share a seat

For each item, the budget gate SHALL pass over every seat a running worker of the process spends
from, and choose among the others as it otherwise would. Where none remains, the item SHALL NOT
be claimed. Triage's model call is no worker, and its seat is chosen as before.

#### Scenario: Three slots and two seats

- **WHEN** a role with `workers: 3` draws on two seats, and two workers are running, one on each
- **THEN** the cycle claims no further item until a worker ends

#### Scenario: A busy seat is passed over

- **WHEN** one of a role's two seats runs a worker of the role, and the other has headroom
- **THEN** the next item's worker spends from the other seat

#### Scenario: Triage may spend from a busy seat

- **WHEN** both of a role's seats run a worker of the role, and a cycle triages an item
- **THEN** triage's model call spends from the seat the budget gate would choose with no workers
  running

### Requirement: A state write refused because the branch moved is retried

Where the state branch refuses a write because the branch moved, the process SHALL read what the
branch now holds, apply its own change to that, and write again. It SHALL NOT send again content
built from what it read before. The serving record is excepted: its writes stay conditional.

#### Scenario: Two roles write state at once

- **WHEN** a write by the `backend` process is refused because the `frontend` process wrote to the
  state branch first
- **THEN** the `backend` process writes again, and both writes' changes are on the branch

#### Scenario: Two workers of one process record their runs at once

- **WHEN** the runs in slots 1 and 2 end together and both record their outcomes
- **THEN** both outcomes are on the state branch

### Requirement: Every worker is kept apart and can be ended

Wherever an `igor serve` worker runs, on the process's host or elsewhere, it SHALL have no access
to the credentials Igor acts with, nor to another worker's run: its tree, its outgoing work and
its processes. The process SHALL be able to end a worker's run and everything that run started.
`task-execution`'s *The worker is given an explicit environment holding no credential but its
seat's* and *A kill reaches the worker's whole process tree* are part of how a local worker
meets this.

#### Scenario: A worker cannot reach Igor's credentials

- **WHEN** a worker runs
- **THEN** it cannot read the GitHub App's private key or any token the process holds

#### Scenario: Ending a run ends what it started

- **WHEN** the process ends a worker's run while a build the worker started is still running
- **THEN** the worker and the build both end, and the role's other workers go on

### Requirement: A worker slot's number names what the slot owns

On the process's own host, a working tree's name SHALL carry its role, its worker slot and its process's lock directory id.
After taking over, an `igor serve` process SHALL remove every tree named for its role and lock
directory, with its outbox (the directory beside it for its outgoing work), whatever its age. Every other
tree, each one `igor run` made included, SHALL be left to the sweep at the abandoned-tree
threshold; `igor run` SHALL name its trees with no lock directory id.

#### Scenario: Trees a crash left are removed at once

- **WHEN** a process takes over after a crash that left trees for slots 1 and 2 of its role
- **THEN** it removes both, with the outbox beside each, before its first
  cycle

#### Scenario: Trees named for another lock directory are left to the age sweep

- **WHEN** a process takes over while trees of its role named for another lock directory exist,
  as when a process from another checkout on the host served the role before
- **THEN** it does not remove them, and the age-based sweep reclaims them once they are older
  than its threshold

#### Scenario: Another role's trees are left alone

- **WHEN** a process of `backend` takes over on a host where `frontend` is working a tree
- **THEN** the `frontend` tree is left in place

#### Scenario: A run's tree is left at takeover

- **WHEN** a process of `backend` takes over from its own checkout while `igor run backend` works
  a tree there
- **THEN** the run's tree is left in place, for the sweep at the abandoned-tree threshold

### Requirement: On its own host, each worker slot runs as a worker user of its own

An `igor serve` worker on the process's own host SHALL meet *Every worker is kept apart and can
be ended* this way. Slot 1 SHALL run as #175's `igor-worker-<role>` and
slot `k`, for `k` of 2 and above, as `igor-worker-<role>-<k>`, created by the same setup with the
same rights and checks, the Unix user `igor serve` runs as holding every slot's group. Each slot's tree and outbox SHALL
take that slot user's group, and a kill by worker user SHALL reach only that slot's processes.

#### Scenario: Two slots run as two users

- **WHEN** slots 1 and 2 of role `dev` run workers at once
- **THEN** they run as `igor-worker-dev` and `igor-worker-dev-2`
- **AND** neither can read the other's tree or see the other's processes

#### Scenario: Killing one slot's worker leaves the other running

- **WHEN** the worker in slot 2 is killed
- **THEN** every process of `igor-worker-dev-2` ends, and the worker in slot 1 goes on

### Requirement: A process that takes over ends its predecessor's surviving workers

After taking over, and before removing any tree or starting a worker, the process SHALL end
every worker of its role still running on its host, with everything that worker started, by killing every process of
each slot's worker user. A
predecessor killed without its unit, as by SIGKILL on a hand-run `igor serve`, leaves its
workers running and spending seats.

#### Scenario: Workers a killed process left are ended

- **WHEN** a hand-run `igor serve` is killed with SIGKILL while two workers run, and is started
  again from the same checkout
- **THEN** the new process ends both workers, and every process they started, before it removes
  their trees or starts a worker of its own

### Requirement: `igor run` keeps no serving record and takes no serving lock

`igor run` SHALL neither write nor read its role's serving record, SHALL NOT take the serving
lock (its role's lock in the lock directory), and SHALL run one worker at a time, whatever `workers`. It
SHALL claim by its role's label, as a serving process does. A lock a run holds for its own
files, as #174 gives it, is not the serving lock.

#### Scenario: A run beside a served role starts

- **WHEN** a person runs `igor run backend` while a process serves `backend`
- **THEN** the run starts, and the serving process goes on serving

#### Scenario: A run works one item at a time

- **WHEN** a person runs `igor run backend` for a role that sets `workers: 3`
- **THEN** the run starts one worker, and starts no other until that one ends
