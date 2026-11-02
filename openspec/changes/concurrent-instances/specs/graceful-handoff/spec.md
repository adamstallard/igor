## MODIFIED Requirements

### Requirement: An Igor never goes silent on a claimed item

An Igor that stops claimed work **of its own accord** — exhaustion, unrecoverable failure or
anything it detects itself — SHALL post a handoff to the item before releasing; silence after a
claim MUST NOT be allowed. Among one role's processes, two post nothing: one stood down for missed
heartbeats, and one finding another's claim message holding the item. A stop directed at the Igor
releases the claim at once without a handoff; its one-line release message SHALL name any partial
work product.

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

#### Scenario: A stood-down rank posts no handoff

- **WHEN** a process stands down for missed heartbeats while its worker runs
- **THEN** its worker stops and it posts nothing on the item

#### Scenario: A rank that finds another's claim message posts no handoff

- **WHEN** a process stops work on an item and finds another process's claim message holding it
- **THEN** it posts nothing on the item
