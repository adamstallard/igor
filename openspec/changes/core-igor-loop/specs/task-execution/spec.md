## ADDED Requirements

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
