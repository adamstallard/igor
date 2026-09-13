## ADDED Requirements

### Requirement: An Igor never goes silent on a claimed item

Where an Igor cannot continue work it has claimed — for any reason — it SHALL post a handoff to
the item before stopping. Silence on a claimed item MUST NOT be a permitted outcome.

#### Scenario: Handoff posted on exhaustion

- **WHEN** an Igor exhausts its budget mid-task
- **THEN** it posts a handoff to the claimed item before stopping

#### Scenario: Handoff posted on unrecoverable failure

- **WHEN** execution fails in a way the Igor cannot recover from
- **THEN** it posts a handoff rather than leaving the claim silent

#### Scenario: Silence is a defect

- **WHEN** an Igor stops work on a claimed item without posting
- **THEN** that is a failure of this requirement, because the claim told others to stand off

### Requirement: A handoff states what was done, what remains, and who could continue

A handoff SHALL report the work completed so far, the steps remaining as the Igor understands
them, and suggested parties who could pick it up.

#### Scenario: Handoff content complete

- **WHEN** a handoff is posted
- **THEN** it states what was done, what remains, and who could continue

#### Scenario: Artifact referenced in the handoff

- **WHEN** partial work exists as an artifact
- **THEN** the handoff links it, so the next party resumes rather than restarts

### Requirement: A budget handoff states when capacity returns

Where the reason for stopping is budget, the handoff SHALL state the reset time rather than
reporting the Igor as unavailable without qualification.

#### Scenario: Reset time included

- **WHEN** an Igor hands off because its budget is exhausted
- **THEN** the handoff states when capacity is expected to return

#### Scenario: Busy is not a reason

- **WHEN** an Igor has capacity but many items in progress
- **THEN** it does not defer on the grounds of being busy
- **AND** budget remains its only reason to defer

### Requirement: A handoff is composable without a model call

The handoff SHALL be assembled from recorded state — what was claimed, which steps completed,
what artifact exists, and the reset time — and MUST NOT require a worker invocation to
produce.

Reserving budget for the handoff was considered and rejected: the situation demanding a
handoff is frequently the situation in which no call can be made at all, so a reserve does not
help. A handoff that depends on the thing that just failed is not a handoff.

#### Scenario: Handoff posted after the budget is exhausted

- **WHEN** an Igor is rate-limited mid-task
- **THEN** the handoff is composed from recorded state and posted
- **AND** no worker invocation is required to produce it

#### Scenario: Handoff posted after an unrecoverable failure

- **WHEN** execution fails in a way that cannot be retried
- **THEN** the handoff still reports what was done and what remains
- **AND** it does so without depending on the failed path

#### Scenario: Quality is traded for reliability deliberately

- **WHEN** a templated handoff is compared against one a model would write
- **THEN** the templated one is accepted as less fluent
- **AND** the reason recorded is that it works when the alternative cannot run
