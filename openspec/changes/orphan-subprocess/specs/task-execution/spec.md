## ADDED Requirements

### Requirement: A kill reaches the worker's whole process tree

Execution SHALL run the worker in its own process group and SHALL kill that group, so that the
subprocesses the worker spawned die with it. A group that has already exited SHALL NOT make
cleanup fail.

A kill that reaches only the worker leaves a build, a test run or a script writing to a working
tree that is about to be released and swept. The tool window exists because such a subprocess
may legitimately run long, so a kill lands while one is running by construction rather than by
chance.

#### Scenario: A killed worker takes its subprocesses with it

- **WHEN** a worker with a subprocess running is killed for a limit
- **THEN** the subprocess does not outlive it

#### Scenario: A stopped run takes its subprocesses with it

- **WHEN** a worker with a subprocess running is killed because the run was stopped
- **THEN** the subprocess does not outlive it

#### Scenario: A worker that exited on its own

- **WHEN** cleanup kills a worker whose process group is already gone
- **THEN** no error is raised

### Requirement: Igor forwards the termination it is sent

Where the process is asked to terminate, execution SHALL kill the group of every worker it
spawned. Where the process winds down gracefully instead, the worker in hand SHALL be left
running and SHALL be killed when the process exits.

A worker in its own group is outside the group a terminal signals, so nothing else will reach
it: detaching it obliges Igor to pass on what it is told. Forwarding on the signal itself would
end the item in hand, which shutdown is required to finish or hand off.

#### Scenario: An interrupted process takes the worker with it

- **WHEN** a process with no graceful shutdown is sent SIGINT or SIGTERM while a worker runs
- **THEN** the worker's process group is killed before the process exits

#### Scenario: Winding down leaves the item in hand running

- **WHEN** a process that winds down gracefully is signalled while a worker runs
- **THEN** the worker keeps running, and the item is completed or handed off as it would be

#### Scenario: No worker outlives the process

- **WHEN** the process exits with a worker still running
- **THEN** that worker's process group is killed
