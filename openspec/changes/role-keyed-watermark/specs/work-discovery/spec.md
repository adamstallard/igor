## MODIFIED Requirements

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL keep a watermark per role and source, an efficiency measure only. A cycle that decided
nothing SHALL NOT advance it. A cycle that acted SHALL advance it past items triage or the lane skipped,
not past one it chose and did not take: for want of budget, a worker slot or seat, or because a
`stuck-conditions` condition, an unanswered claim or a `work-claiming` rule ending the cycle
stopped it. A refused claim SHALL advance it unless its run records a
`stuck-conditions` cure key.

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
  out or an open `stuck-conditions` condition stopped its scope
- **THEN** the next cycle reconsiders the second

#### Scenario: An item a role's lane skipped is passed

- **WHEN** a cycle that acted skips an item because the role's lane rejects it
- **THEN** the watermark advances past that item, as past one triage skipped

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
- **AND** where it has three free slots but a seat for only two, it likewise claims two, and the
  next cycle reconsiders the third

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

- **WHEN** a cycle decides to work an item, its claim is refused with a 403 because the App lacks a
  permission, and that run records a `stuck-conditions` cure key
- **THEN** the watermark does not pass the item, and the first cycle after the condition clears
  reconsiders it

## ADDED Requirements

### Requirement: A role's watermark is its own

A watermark SHALL be identified by the role's name and the source, never by any seat the role's model
calls are paid from nor by the process's start. A role and source with no mark of its own SHALL
be a first run as *A first run does not face the whole backlog* has one, even where another role
has a mark for that source. A cycle SHALL change no other role's mark, and SHALL keep a mark no
configured role and source resolves to.

#### Scenario: One role's lane rejection does not hide the item from another

- **WHEN** two roles poll the same source and differ only by lane, and the narrower role's lane
  rejects an item
- **THEN** the other role still finds that item fresh on its next cycle
- **AND** nothing about the item has to change for it to be found

#### Scenario: A role added later does not inherit what it never considered

- **WHEN** a second role is configured against a source an existing role has been polling
- **THEN** the new role's cycle is a first run, bounded by the look-back window, rather than one
  that considers only items newer than the existing role's mark

#### Scenario: Every source cold-starts once on the upgrade

- **WHEN** a role's cycle runs against a destination whose stored marks predate this rule
- **THEN** each of that role's sources is treated as a first run, bounded by the look-back window
- **AND** the cycle record it writes to the state branch shows a cold start

#### Scenario: An unreachable mark is left alone

- **WHEN** a cycle writes state to a destination holding marks that no configured role and source
  resolves to, and marks of other configured roles
- **THEN** those marks are still present afterwards
- **AND** no mark belonging to another role is removed or overwritten

#### Scenario: A renamed role starts again, and only it

- **WHEN** a role is renamed and its sources are unchanged
- **THEN** it is a first run for that role, bounded by the look-back window
- **AND** the marks of every other role polling those sources are unaffected

#### Scenario: A restarted process continues its mark

- **WHEN** a process running a role restarts
- **THEN** it continues its role's mark for each source, the one saved before the restart
- **AND** it is not given a new mark on the strength of being a new process start

#### Scenario: A role's mark does not follow its seat

- **WHEN** the seats a role's model calls are paid from change
- **THEN** it reads and advances the same mark for each of its sources as before
