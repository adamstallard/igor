## MODIFIED Requirements

### Requirement: An Igor never goes silent on a claimed item

Where an Igor stops work it has claimed **of its own accord** — exhaustion, unrecoverable
failure, or any condition it detects itself — it SHALL post a handoff to the item before
releasing, because the claim told others to stand off. A stop directed at the Igor is exempt: it
releases at once, and any partial work is named in a one-line receipt. A serving process
that stops because it cannot rewrite its serving record, or because another process wrote it,
posts nothing, since it may have been replaced; the process taking over answers on each claim
(`role-process`).

#### Scenario: Handoff posted on exhaustion

- **WHEN** an Igor exhausts its budget mid-task
- **THEN** it posts a handoff to the claimed item before stopping

#### Scenario: A directed stop posts no handoff

- **WHEN** a stop is issued for a claimed item
- **THEN** the claim is released without waiting to compose a handoff

#### Scenario: A directed stop names partial work

- **WHEN** a stop arrives after a draft artifact was already produced
- **THEN** the release message names that artifact
- **AND** it is a single line rather than a full handoff

#### Scenario: Handoff posted on unrecoverable failure

- **WHEN** execution fails in a way the Igor cannot recover from
- **THEN** it posts a handoff rather than leaving the claim silent

#### Scenario: A stand-down leaves its claims to the next process

- **WHEN** a serving process stands down with three items claimed
- **THEN** it posts nothing on them, and the process that next takes over the role works each
  again or gives it back out loud
