## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark that discovery keeps, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome: a reply from anyone other than the Igor,
or an edit to the item itself, except as the next paragraph says. Outside that case both are required, because a handoff *invites* a reply — an item
suppressed until its title or labels change would stay silent precisely where a person supplied
the missing context in a comment.

Where the handoff is a flagged run's that stopped on a question it could not settle
(`graceful-handoff`'s *A handoff states what was done, what remains, and who could continue*),
a reply SHALL NOT count as an answer; only an edit to the item counts. Who may make that edit
is not decided (the proposal's Still open).

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply lifts the suppression

- **WHEN** anyone other than the Igor comments on a handed-back item
- **AND** the handoff was not a flagged run's that stopped on a question
- **THEN** it is worked again

#### Scenario: A reply does not rerun a flagged item

- **WHEN** a flagged run stopped on a question it could not settle and handed the item back
- **AND** someone other than the Igor then comments on the item, and the item is unchanged
- **THEN** it is not worked again

#### Scenario: An edit lifts the suppression

- **WHEN** a handed-back item is retitled, rewritten, relabelled, or its holder changes
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing
