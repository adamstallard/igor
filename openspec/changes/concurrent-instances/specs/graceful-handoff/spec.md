## MODIFIED Requirements

### Requirement: An Igor never goes silent on a claimed item

Where an Igor stops work it has claimed **of its own accord** — exhaustion, unrecoverable
failure, or any condition it detects itself — it SHALL post a handoff to the item before
releasing. Silence after a claim MUST NOT be a permitted outcome, because the claim told
others to stand off.

Where several processes run one role, a process that has stood down for missed heartbeats, or
whose claim message does not hold the item, posts nothing, an exception that `work-claiming`'s *A claim that cannot be kept is given back, out loud*
states.

**A stop directed at the Igor is exempt.** Stop releases the claim immediately and posting a
handoff would delay it; the rationale does not apply either, since whoever issued the stop is
presumably taking the work. Where partial work product exists, the release message SHALL name
it — a one-line receipt, not a handoff.

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
