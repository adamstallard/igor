## MODIFIED Requirements

### Requirement: The cycle repeats without supervision

Igor SHALL provide a process that runs the cycle on the configured interval until stopped. A
single cycle invoked by hand is the unit that process repeats, not a substitute for it.

#### Scenario: Cycles repeat on the interval

- **WHEN** the process is started for a role
- **THEN** it runs a cycle, waits the role's poll interval, and runs another

#### Scenario: A failing cycle does not end the process

- **WHEN** a cycle fails
- **THEN** the failure is reported and the next cycle still runs

#### Scenario: Shutdown finishes the item in hand

- **WHEN** the process is asked to stop while its workers work items
- **THEN** it completes or hands off each of them before exiting
- **AND** it begins no further item

#### Scenario: Budget is re-checked between items

- **WHEN** several items would be claimed in one cycle and capacity runs out partway
- **THEN** the remaining items are not claimed
- **AND** the reason is reported

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL keep a watermark per source, an efficiency measure only. A cycle that decided
nothing SHALL NOT advance it. A cycle that acted SHALL advance it past items triage skipped, but
not past an item it chose and did not take: for want of budget, a free worker slot or a free
seat, because a condition stopped it, or because the tracker gave no answer to its claim. A claim
the tracker answered with a refusal SHALL advance it, as for an item taken.

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
