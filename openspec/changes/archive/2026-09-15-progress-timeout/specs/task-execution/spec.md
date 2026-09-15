## ADDED Requirements

### Requirement: A worker is bounded by silence on its stream

Execution SHALL kill a worker that produces no event on its output stream for a bounded window,
and SHALL reset that window on every event it parses. Output the stream never promised — an
unparsable line, anything on stderr — SHALL NOT count as progress, so a worker that has stopped
working and is still writing noise is still killed.

Killing a live worker destroys its working tree and strands its claim, where tolerating a
wedged one costs idle minutes, so each window errs long.

#### Scenario: A worker producing events is left alone

- **WHEN** a worker emits events continuously
- **THEN** it is not killed, however long it has been running

#### Scenario: A silent worker is killed

- **WHEN** a worker produces no event for the window in force
- **THEN** it is killed

#### Scenario: Noise is not progress

- **WHEN** a worker writes output that is not an event on its stream
- **THEN** the window is not reset

### Requirement: The window depends on what the worker is waiting for

Execution SHALL read from the stream whether a tool the worker dispatched is still outstanding,
and SHALL apply a longer window while one is than when none is.

A worker blocked on a tool it dispatched is legitimately silent for as long as that tool runs,
which for a build, a test suite or a fetch is long, and the tool's own timeout bounds it
independently. A worker waiting on nothing but the model's next turn is silent only through
retries or a hang, and nothing legitimate takes long there.

Outstanding work SHALL be tracked per dispatched call rather than inferred from the most recent
event, because tools dispatched together return one at a time and a result arriving while a
sibling still runs must not shorten the window under it.

A turn that has resumed proves every tool it dispatched has come back, and execution SHALL take
that as clearing the outstanding set, so that one call whose result never arrives cannot hold
the longer window open for the rest of the run. Only the run's own turn counts: a subagent
produces its own events while the call that spawned it is still outstanding, and those prove
nothing about the turn above them.

#### Scenario: A long tool call is not a wedged worker

- **WHEN** a worker has dispatched a tool and produced nothing since
- **THEN** it is given the longer window

#### Scenario: A returned tool restores the shorter window

- **WHEN** every tool a worker dispatched has returned and it has produced nothing since
- **THEN** it is given the shorter window

#### Scenario: A sibling still running holds the longer window

- **WHEN** one of several tools dispatched together returns and the others have not
- **THEN** the longer window still applies

#### Scenario: A resumed turn clears a call whose result never came

- **WHEN** the run's own turn resumes while a dispatched call is still recorded outstanding
- **THEN** the outstanding set is cleared and the shorter window applies

#### Scenario: A subagent's own events do not clear its parent's tools

- **WHEN** a subagent produces events while the call that spawned it is outstanding
- **THEN** the longer window still applies

### Requirement: An absolute ceiling backstops the silence windows

Execution SHALL kill a worker that has run for an absolute ceiling, whatever its stream is
doing, because a worker emitting an event at intervals forever satisfies every silence window
and still never finishes. The ceiling SHALL sit far above any run expected to occur, so that
reaching it is evidence of a fault rather than of a long task.

#### Scenario: A live worker that never finishes is still killed

- **WHEN** a worker emits events within its window but runs past the ceiling
- **THEN** it is killed

### Requirement: A killed worker's failure names the limit it breached

Where a worker is killed for a limit, the recorded reason SHALL distinguish a tool that never
returned, a model that never answered, and a run that never ended, and SHALL state the limit's
duration.

Whoever reads the handoff acts on the three differently. A single message covering them tells
them none.

#### Scenario: A tool that never returned is reported as one

- **WHEN** a worker is killed while a tool it dispatched was outstanding
- **THEN** the reason says a tool was running, and for how long nothing was produced

#### Scenario: A hung model is reported as silence

- **WHEN** a worker is killed with no tool outstanding
- **THEN** the reason says it produced nothing, and for how long

#### Scenario: The ceiling is reported as length

- **WHEN** a worker is killed at the ceiling
- **THEN** the reason says how long it ran without finishing

### Requirement: A limit does not destroy what the worker already produced

Where a worker is killed for a limit, execution SHALL keep what the run had already produced.
A worker that had reported its result before the kill SHALL settle with that result and its
cost rather than as a failure, and a worker killed mid-edit SHALL have its working tree read so
the recorded outcome names what it changed.

A silence window can expire on a run that is finished but whose process has not exited, and a
kill can land hours into real editing. Recording either as having produced nothing records the
wrong failure.

#### Scenario: A finished run survives a kill

- **WHEN** a worker has reported its result and is killed for a limit before its process exits
- **THEN** the run settles with that result and its reported cost

#### Scenario: A killed worker's changes are recorded

- **WHEN** a worker is killed for a limit after editing files
- **THEN** the recorded outcome names what changed in its working tree
- **AND** nothing is published

### Requirement: The abandoned-tree threshold derives from the worker's longest possible life

The sweep that reclaims working trees left by a dead process SHALL use a threshold above the
longest a tree can be in use, which is the absolute ceiling plus the provisioning and
publication either side of the worker. The margin SHALL be additive, because what a tree
outlives its worker by is a clone and a push rather than a share of the run.

Deleting a live sibling's tree corrupts its run; leaving debris another hour costs disk.

#### Scenario: A tree in use by the longest possible worker is not swept

- **WHEN** a worker has run to the absolute ceiling and its tree is still held
- **THEN** the sweep does not remove that tree

#### Scenario: The threshold follows the ceiling

- **WHEN** the absolute ceiling changes
- **THEN** the sweep threshold changes with it
