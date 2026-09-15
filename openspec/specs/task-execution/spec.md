# task-execution Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: The worker receives standing instructions and the normalized item

Execution SHALL invoke a headless worker with the role's effective standing instructions and
the normalized item. Content ingested from any surface MUST be delimited and presented as data
rather than as instruction.

#### Scenario: Worker invoked with role context

- **WHEN** a claimed item is executed
- **THEN** the worker receives the role's merged standing instructions and the normalized item

#### Scenario: Ingested content delimited as data

- **WHEN** an item's body or comments are passed to the worker
- **THEN** they are delimited as untrusted content
- **AND** the trusted instruction channel remains the role configuration

#### Scenario: Instruction-shaped content in an item does not direct the worker

- **WHEN** an item's body contains text phrased as an instruction to the agent
- **THEN** it is treated as information about the task
- **AND** it does not alter the action space, the role, or what is claimed

### Requirement: Execution obtains a disposable working tree through one seam

Execution is the only stage needing a checkout; discovery, triage, claiming and state all go
through the API. Execution SHALL obtain its working tree through a single provisioning seam and
SHALL treat that tree as disposable, making no assumption that a checkout persists between
tasks or is shared with another task. The tree SHALL be released when the task ends, whatever
its outcome.

#### Scenario: Working tree provisioned for a task that needs one

- **WHEN** a claimed item is executed
- **THEN** the working tree is obtained through the provisioning seam
- **AND** no other stage of the loop requires a checkout

#### Scenario: No state carries between tasks

- **WHEN** a task begins in a working tree
- **THEN** it does not depend on any file left behind by a previous task

#### Scenario: The tree is released on failure as well as success

- **WHEN** a task ends in failure, handoff, or a stop
- **THEN** its working tree is released

#### Scenario: The provisioning strategy is replaceable

- **WHEN** the way trees are provisioned changes
- **THEN** only the seam changes
- **AND** no requirement above depends on trees being clones, worktrees, or any other shape

### Requirement: Only reversible artifacts are produced

Execution SHALL be confined to the artifact types the role's effective `allow` list permits,
which by default are reversible: draft pull requests and comments. The loop MUST NOT act on a
worker output outside that list, regardless of what the worker produced.

#### Scenario: Permitted artifact produced

- **WHEN** a role allows draft pull requests and the worker produces one
- **THEN** the artifact is created

#### Scenario: Disallowed artifact refused

- **WHEN** the worker produces output implying an action outside the role's allow list
- **THEN** the loop does not perform that action
- **AND** the refusal is recorded

#### Scenario: Enforcement is at the loop, not the prompt

- **WHEN** the worker is instructed to stay within the action space but produces output outside it
- **THEN** the action is still refused by the loop

### Requirement: The artifact is linked back to its item

On producing an artifact, execution SHALL link it to the originating item using the tracker
adapter's own convention.

#### Scenario: Artifact linked by adapter convention

- **WHEN** an artifact is produced for an item
- **THEN** the adapter's linkage convention is applied
- **AND** the item and artifact are mutually discoverable on their surfaces

### Requirement: Transcripts and outcomes are captured to the state branch

Execution SHALL record the worker transcript, the reported cost, and the outcome. These SHALL
be written to the state branch, never to the destination's default branch.

#### Scenario: Transcript persisted off the main line

- **WHEN** execution completes
- **THEN** the transcript and outcome are written to the state branch
- **AND** the default branch is unchanged

#### Scenario: Cost recorded per invocation

- **WHEN** the worker reports its cost for an invocation
- **THEN** that figure is recorded and accumulated against the seat

### Requirement: Completion behaviour follows configured policy

On believing work complete, an Igor SHALL take the completion action its effective
configuration specifies. The default SHALL be to release the claim and leave the artifact.

#### Scenario: Default completion releases the claim

- **WHEN** a role specifies no completion action
- **THEN** the Igor unassigns itself and leaves the artifact in place
- **AND** it does not close the item

#### Scenario: Configured completion honoured

- **WHEN** a role configures a completion action other than the default
- **THEN** that action is taken instead

#### Scenario: Completion is not hardcoded

- **WHEN** an organization requires a completion workflow differing from the default
- **THEN** it is expressible in configuration without modifying the tool

### Requirement: Work finished before a claim is lost is offered, not discarded

Where a claim is found to be gone between the worker finishing and publication, execution SHALL
distinguish a stop from a loss. A stop SHALL publish nothing. A loss SHALL publish what exists
as a draft, request no reviewers, and leave a message naming what exists.

Someone taking an item over is saying they are taking it, not that the work so far should be
destroyed. The working tree is disposable by design, so discarding it at this point is
unrecoverable: the transcript records that a change was made and not the change itself.

An Igor that has lost an item must not then appear in anyone's review queue over it, which is
why nothing is requested of the new holder.

#### Scenario: A stop still publishes nothing

- **WHEN** the claim was stopped during execution
- **THEN** nothing is published
- **AND** the refusal names the stop

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
- **THEN** the configured completion behaviour is not performed, because the item is not the
  Igor's to complete

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

