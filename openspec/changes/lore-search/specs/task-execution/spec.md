## MODIFIED Requirements

### Requirement: Only reversible artifacts are produced

Execution SHALL be confined to the artifact types the role's effective `allow` list permits,
which by default are reversible: draft pull requests and comments. The loop MUST NOT act on a
worker output outside that list, regardless of what the worker produced.

One worker output is exempt from the list: the citations a worker reports. The Igor pushes them
to the lore repository's `questions` branch only as `lore-firing`'s *An Igor publishes the
citations its worker reports* allows.

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

#### Scenario: A citation push needs no allow action

- **WHEN** a role's `allow` list names no action for citations
- **AND** its worker reports a citation that *An Igor publishes the citations its worker
  reports* allows the Igor to push
- **THEN** the Igor pushes that citation all the same

### Requirement: Transcripts and outcomes are captured to the state branch

Execution SHALL record the worker transcript, except as below, the reported cost, and the
outcome. These SHALL be written to the state branch, never to the destination's default branch.

A run whose worker reported meeting a question with a *category*, as `lore-firing`'s *An Igor
publishes the citations its worker reports* defines it, or whose Igor met one in its own
inquisitor run, SHALL have no transcript written to the state branch.
Its outcome, its cost and its row in the execution ledger, `executions.ndjson`, which holds the run's id, its item
and the citation counts that requirement sets, are still written. For such a run, the pull
request body SHALL carry no excerpt of the worker's result and no link to a transcript, and a
record of the provider refusing the run SHALL keep only the refusal's reason, never the
provider's text. The reason is the limit Igor read from the provider's reply and the time
that limit resets, where Igor read them; where it read neither, the record says only that the
provider refused the run.

During a run, the worker SHALL report a bare flag that the run met such a question, with no
category, question or answer. When the Igor runs the inquisitor skill itself and that skill gives a
question a category, every rule of this paragraph and the one above SHALL apply to that run.

#### Scenario: Transcript persisted off the main line

- **WHEN** execution completes
- **AND** the run met no question with a category
- **THEN** the transcript and outcome are written to the state branch
- **AND** the default branch is unchanged

#### Scenario: Cost recorded per invocation

- **WHEN** the worker reports its cost for an invocation
- **THEN** that figure is recorded and accumulated against the seat

#### Scenario: A run that met a categorized question stores no transcript

- **WHEN** execution completes for a run whose worker reported meeting a question with a
  category
- **THEN** no transcript of that run is written to the state branch
- **AND** the run's outcome, cost and record, with its citation counts, are written there

#### Scenario: A run that met a categorized question publishes no excerpt of its result

- **WHEN** a run whose worker reported meeting a question with a category publishes a pull
  request
- **THEN** its body holds no excerpt of the worker's result
- **AND** it holds no link to a transcript

#### Scenario: A refusal on such a run keeps only its reason

- **WHEN** the provider refuses a run whose worker reported meeting a question with a category
- **THEN** the record of the refusal on the state branch holds the refusal's reason
- **AND** it holds none of the provider's text

#### Scenario: The worker's report of a categorized question names nothing

- **WHEN** a worker reports that its run met a question with a category
- **THEN** the report is a bare flag, holding no category, question or answer

#### Scenario: The Igor's own inquisitor run that met a categorized question stores no transcript

- **WHEN** the Igor runs the inquisitor skill itself and meets a question with a category
- **THEN** no transcript of that run is written to the state branch
