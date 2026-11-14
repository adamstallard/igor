## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

An item an Igor handed back rather than producing something SHALL be recorded, and SHALL NOT be
worked again until something answers it: for a set-down, only what `work-claiming` says lifts
one; otherwise a reply from anyone but the Igor that handed it back, or an edit to the item. Where
the cause was a fact about the Igor, capacity exhausted or never read or a fault whose run
records a cure key, the item SHALL NOT be suppressed. A refused run is not handed back.

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply lifts the suppression

- **WHEN** anyone other than the Igor comments on a handed-back item that is not a set-down
- **THEN** it is worked again

#### Scenario: An edit lifts the suppression

- **WHEN** a handed-back item that is not a set-down is retitled, rewritten, relabelled, or its
  holder changes
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: A seat that could not be read is no more a decision about the item

- **WHEN** an item was handed back because the worker could not start, its seat's token unset
- **THEN** it is not suppressed, on the same grounds: the Igor's configuration produced that
  outcome, and the next item would meet it identically

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing

#### Scenario: A failure that records a cure key suppresses nothing

- **WHEN** an item was handed back after a failure whose run recorded a cure key
- **THEN** it is not suppressed, and it is worked again once the condition clears
