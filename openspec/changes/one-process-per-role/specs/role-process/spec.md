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

### Requirement: A serving process rewrites its serving record every half poll interval

A serving process SHALL keep its role's serving record on the state branch, holding: a start
id, picked at random at each start; a counter; its poll interval at start; its host name and
process id; and its lock directory's id. It SHALL rewrite the record, raising the counter, every
half of that interval, from a timer that runs whatever the cycle and workers do. Each write SHALL
be conditional on the record holding its last write, or, where the record is absent, on its
absence.

#### Scenario: The record is rewritten while a long worker runs

- **WHEN** a worker runs for longer than a poll interval
- **THEN** the serving record's counter rises every half poll interval while it runs

#### Scenario: A record another process wrote displaces this one

- **WHEN** a serving process's conditional write fails, and the record names another start id
- **THEN** the process stops every worker at once, posts nothing, and exits with status 1

#### Scenario: A record that is gone is written again

- **WHEN** a serving process finds its role's serving record absent, as after the state branch
  was lost
- **THEN** it writes the record again, conditional on its still being absent

### Requirement: A starting process refuses to start beside a live process of its role

Before its first cycle, a starting process SHALL take its role's lock in a lock directory beside
its lore checkout, a lock the operating system releases when its holder ends, and SHALL exit with
status 78 where it cannot. It SHALL then watch the serving record for three times the longer of its
own poll interval and the one the record declares, or three of its own with no record, and SHALL
exit with status 78 where the record changes meanwhile, naming the other process's host and id.

#### Scenario: A second process from the same checkout is refused at once

- **WHEN** a person runs `igor serve backend` from the lore checkout the unit `igor@backend`
  serves from, while it serves
- **THEN** the process cannot take the role's lock and exits with status 78 at once

#### Scenario: A live process on another host is found by its record

- **WHEN** `igor serve backend` starts on host B while a process on host A serves `backend`
- **THEN** within three poll intervals it sees the record's counter rise, logs host A's name and
  the other process's id, and exits with status 78

#### Scenario: A record left by a crash on another host is taken over

- **WHEN** the process serving `backend` on host A crashed, and `igor serve backend` starts on
  host B
- **THEN** after three poll intervals with no change to the record, the process on B takes over

#### Scenario: The watch counts the longer interval

- **WHEN** a starting process's poll interval is 10 minutes and the record declares 20
- **THEN** it watches for 60 minutes

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
- **THEN** the new process takes over before its first cycle, without waiting three poll
  intervals

#### Scenario: Another checkout on the same host is another lock directory

- **WHEN** `igor serve backend` starts from a second lore checkout on the host where a process
  serves `backend` from the first
- **THEN** its lock directory differs from the record's, and it watches the record as a process
  on another host does

### Requirement: A serving process that cannot rewrite its record stops its workers

Where a serving process's last landed record write is two of its poll intervals old, it SHALL
stop every worker at once, post nothing, leave its claims for the next serving process to adopt,
and exit with status 1. Its timer SHALL check at every firing, and the process SHALL check before
every claim, publication or post, measuring age on a clock that counts time the host was
suspended. A starting process watches three intervals, so this process stops first.

#### Scenario: GitHub does not answer for two poll intervals

- **WHEN** every record write fails for two poll intervals while three workers run
- **THEN** the process stops all three workers, leaves their items labelled with nothing posted,
  and exits with status 1

#### Scenario: A paused process resumes

- **WHEN** a serving process resumes after a pause longer than two poll intervals
- **THEN** it stops its workers before it claims, publishes or posts anything, and exits with
  status 1

#### Scenario: A long cycle does not delay the check

- **WHEN** a cycle's triage takes longer than two poll intervals while every record write fails
- **THEN** the timer stops the workers once the last landed write is two poll intervals old

### Requirement: A process that takes over adopts or gives back every claim of its role

After taking over, before new claims, the process SHALL treat every item whose role label the
Igor's own bot account added as its predecessor's claim, whatever the discovery watermark. It
SHALL catch up an item with the Igor's open pull request, then give the claim back, and triage
any other again, working it under a fresh claim message or giving the claim back out loud. A
label a person added is not adopted: it directs the Igor as any hand-over does.

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
Igor posted there, the process SHALL NOT work the item. It SHALL remove its holder entry and post
a stop receipt, as for a stop said while no run is active.

#### Scenario: A stop said while the role was down

- **WHEN** a person says stop on an issue carrying the Igor's own `igor:backend` while no process
  serves `backend`, and a process then takes over
- **THEN** the process does not work the issue, removes `igor:backend` and posts a stop receipt

### Requirement: A role's workers run at once, each in a slot of its own

A serving process SHALL run up to its role's `workers` workers at once, in worker slots numbered
from 1, each on a different item. A cycle SHALL hand the items it would claim, in the order it
would claim them, to free slots, without waiting for a worker to finish. An item that finds no
free slot SHALL NOT be claimed, and the watermark SHALL stay below it.

#### Scenario: More items than slots

- **WHEN** a role with `workers: 2` has three items triage proceeds on, and no worker is running
- **THEN** the cycle claims the first two and starts a worker on each, and leaves the third
  unclaimed for a later cycle

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

### Requirement: A state write refused because the branch moved is retried

Where the state branch refuses a write because the branch moved, the process SHALL read what the
branch now holds, apply its own change to that, and write again. It SHALL NOT send again content
built from what it read before.

#### Scenario: Two roles write state at once

- **WHEN** a write by the `backend` process is refused because the `frontend` process wrote to the
  state branch first
- **THEN** the `backend` process writes again, and both writes' changes are on the branch

#### Scenario: Two workers of one process record their runs at once

- **WHEN** the runs in slots 1 and 2 end together and both record their outcomes
- **THEN** both outcomes are on the state branch

### Requirement: A worker slot's number names what the slot owns

A working tree's name SHALL carry its role, its worker slot and its process's lock directory id.
Where workers run as Unix users of their own, slot `k` of role `r` SHALL run as
`igor-worker-<r>-<k>`. After taking over, the process SHALL remove every tree named for its
role and lock directory, with the outbox beside it, whatever its age, because the process that
named it held that directory's lock and has ended.

#### Scenario: Trees a crash left are removed at once

- **WHEN** a process takes over after a crash that left trees for slots 1 and 2 of its role
- **THEN** it removes both, with the outbox beside each, before its first cycle

#### Scenario: Another role's trees are left alone

- **WHEN** a process of `backend` takes over on a host where `frontend` is working a tree
- **THEN** the `frontend` tree is left in place

#### Scenario: Two slots run as two users

- **WHEN** slots 1 and 2 of role `dev` run workers at once, under worker users
- **THEN** they run as `igor-worker-dev-1` and `igor-worker-dev-2`

### Requirement: `igor run` keeps no serving record and takes no lock

`igor run` SHALL neither write nor read its role's serving record, and SHALL NOT take its role's
lock. It SHALL claim by its role's label, as a serving process does.

#### Scenario: A run beside a served role starts

- **WHEN** a person runs `igor run backend` while a process serves `backend`
- **THEN** the run starts, and the serving process goes on serving
