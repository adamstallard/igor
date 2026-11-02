## MODIFIED Requirements

### Requirement: An Igor never goes silent on a claimed item

Where an Igor stops claimed work of its own accord, on any condition it detects itself, it SHALL
post a handoff to the item before releasing. Silence after a claim MUST NOT be a permitted
outcome, except where `work-claiming`'s *A claim that cannot be kept is given back, out loud*
lets one of several processes running a role post nothing. A stop directed at the Igor is
exempt: it releases the claim at once, and its release message SHALL name any partial work
product in one line, not a handoff.

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
- **AND** where several processes run the role, one that finds another's claim message holding
  the item also posts nothing on it, whether or not it stood down
