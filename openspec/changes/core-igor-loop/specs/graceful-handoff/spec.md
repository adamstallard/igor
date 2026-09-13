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

### Requirement: The handoff is funded before the budget is spent

Capacity for a handoff SHALL be reserved so that exhaustion cannot prevent the handoff itself
from being posted.

#### Scenario: Handoff succeeds at exhaustion

- **WHEN** an Igor reaches its budget limit
- **THEN** sufficient capacity remains to compose and post the handoff

#### Scenario: Handoff not starved by the work it reports on

- **WHEN** a task consumes budget up to the limit
- **THEN** the handoff is still posted
