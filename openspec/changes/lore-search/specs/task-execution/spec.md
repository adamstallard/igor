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
