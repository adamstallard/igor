## MODIFIED Requirements

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL keep a watermark per source, an efficiency measure only. A cycle that decided
nothing SHALL NOT advance it. A cycle that acted SHALL advance it past items triage skipped, not
past one it chose and did not take: for want of budget, a free worker slot or seat, or because a
condition, an unanswered claim or a `work-claiming` rule ending the cycle stopped it. A refused
claim SHALL advance it, as for an item taken, unless its run records a cure key.

#### Scenario: Seen items not re-triaged

- **WHEN** discovery runs twice with no intervening tracker activity
- **THEN** the second run performs no triage calls

#### Scenario: New items picked up

- **WHEN** an item is created after the last watermark
- **THEN** it appears in the next discovery run

#### Scenario: A preview leaves the mark where it found it

- **WHEN** a cycle runs to show what it would claim, and claims nothing
- **THEN** the stored watermark is unchanged
- **AND** a later cycle that acts still finds every item the preview examined

#### Scenario: An item chosen and never taken is seen again

- **WHEN** a cycle decides to work two items and stops after the first, because its budget ran
  out or a condition stopped its scope
- **THEN** the next cycle reconsiders the second

#### Scenario: An item whose claim got no answer is seen again

- **WHEN** a cycle decides to work an item and its claim fails because the tracker gave no answer,
  such as a server error or a request that never arrived, so nothing is posted on the item
- **THEN** the next cycle reconsiders that item

#### Scenario: An item whose claim the tracker refused is passed

- **WHEN** a cycle decides to work an item and the tracker answers its claim with a refusal: it
  rejects the request, or accepts it and the claim is not on the item when read back
- **THEN** the watermark advances past that item as past one the cycle took

#### Scenario: An item left for want of a slot or seat is seen again

- **WHEN** a cycle decides to work three items and has two free worker slots
- **THEN** it claims two, and the next cycle reconsiders the third

#### Scenario: An item a cycle never reached after two identical failures is seen again

- **WHEN** a cycle decides to work three items, and the first two fail before the worker with the
  same failure, so *Two identical failures before the worker on different items end the cycle*
  ends it
- **THEN** the next cycle reconsiders the third

#### Scenario: An item a cycle never reached after an outage is seen again

- **WHEN** a cycle decides to work three items, and the first two each end because the tracker or
  code host did not answer, so *Two runs in a row that the surface failed stop a cycle* ends it
- **THEN** the next cycle reconsiders the third

#### Scenario: A claim refused for a missing App permission is seen again

- **WHEN** a cycle decides to work an item, and its claim is refused with a 403 for a permission
  the App lacks, whose run records a cure key
- **THEN** the watermark does not pass the item, and a later cycle reconsiders it
