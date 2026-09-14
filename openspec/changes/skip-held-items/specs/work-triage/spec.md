## ADDED Requirements

### Requirement: An item held by another party is never a candidate

Triage SHALL skip any item whose holder field names a party other than the running Igor. This
rule is universal and MUST NOT be configurable.

Acting on work that is visibly someone else's is not an organizational preference. Left to a
lane, an org that forgets to write it gets an Igor that claims and retracts on a colleague's
issue every cycle — noise directed at exactly the people a claim exists to inform.

#### Scenario: An item someone else holds is skipped before any claim

- **WHEN** a candidate is held by a party other than the running Igor
- **THEN** triage skips it before any model call and before any claim
- **AND** the reason recorded names who holds it

#### Scenario: An item the Igor itself holds is still a candidate

- **WHEN** a candidate is held only by the running Igor and has no work in flight
- **THEN** it is not skipped, because that is a claim left behind by a process that stopped

#### Scenario: Not overridable by configuration

- **WHEN** a role attempts to disable the skip
- **THEN** validation fails

### Requirement: A recorded decision is not re-derived while its reason holds

Where triage has declined an item, that decision SHALL be recorded and SHALL suppress
reconsideration until the item changes in a way that could alter it.

An Igor's own activity moves an item's timestamp, so an item declined this cycle looks fresh
the next one. Without a recorded decision the loop rediscovers, re-triages and re-declines the
same item forever, paying for it each time.

#### Scenario: A declined item does not return unchanged

- **WHEN** an item was declined and nothing about it has changed since
- **THEN** it is not triaged again

#### Scenario: The Igor's own comment does not make an item fresh

- **WHEN** an Igor comments on an item and thereby moves its timestamp
- **THEN** that alone does not make the item a candidate again

#### Scenario: A changed item is reconsidered

- **WHEN** an item declined earlier is edited, relabelled, or released by its holder
- **THEN** it is triaged again
