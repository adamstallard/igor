## MODIFIED Requirements

### Requirement: An item held by another party is never a candidate

Triage SHALL skip any item whose holder field names a party other than the running Igor. This
rule is universal and MUST NOT be configurable.

Where several processes run the Igor's role, an item whose holding claim message, the earliest
that counts, carries the rank of another process of the role that is not gone, is held by that
process. Such an item SHALL be passed over before triage, with no triage call. An item the role's
label holds with no such message, or with this process's own rank, is the running Igor's.

Acting on work that is visibly someone else's is not an organizational preference. Left to a
role's lane, its declared limits on what it takes, an org that forgets to write this skip gets an Igor that claims and retracts on a colleague's
issue every cycle — noise directed at exactly the people a claim exists to inform.

#### Scenario: An item someone else holds is skipped before any claim

- **WHEN** a candidate is held by a party other than the running Igor
- **THEN** triage skips it before any model call and before any claim
- **AND** the reason recorded names who holds it

#### Scenario: A second holder alongside the Igor still means someone else's

- **WHEN** a candidate is held by both the running Igor and another party
- **THEN** it is skipped, on the same reading a mid-run claim check uses: people add
  themselves to a holder list rather than replacing what is there

#### Scenario: An item the Igor itself holds is still a candidate

- **WHEN** a candidate is held only by the running Igor, with no claim message of another live
  process of its role, and has no work in flight
- **THEN** it is not skipped, because that is a claim left behind by a process that stopped

#### Scenario: Nobody named means nobody holds it

- **WHEN** a candidate names no holder
- **THEN** the skip does not apply

#### Scenario: A sibling's item is passed over before triage

- **WHEN** a labelled item's holding claim message carries the rank of another process of the
  role that is not gone
- **THEN** the item is passed over with no triage call
