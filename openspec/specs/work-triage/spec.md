# work-triage Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: Triage runs in three stages, cheapest first

Triage SHALL proceed in order: the tracker's own query, then declarative lane predicates over
normalized candidates, then a model call for only the residue. A candidate rejected by an
earlier stage MUST NOT reach a later one.

#### Scenario: Predicates gate the model call

- **WHEN** a discovery run returns candidates and most fail the lane predicates
- **THEN** only the survivors are sent to the model
- **AND** model cost scales with what survives predicates rather than with what the tracker returned

#### Scenario: Predicate stage costs nothing

- **WHEN** a candidate is excluded by a lane predicate
- **THEN** no model call is made for it

#### Scenario: Residue reaches the model

- **WHEN** a candidate satisfies every lane predicate but in-lane-ness still requires judgment
- **THEN** it is sent to the model for a verdict

### Requirement: The triage outcome is binary and carries no confidence score

Triage SHALL produce a binary outcome — proceed or skip — determined by whether the work is in
lane and worth doing. The system MUST NOT compute, store, or act on a confidence score.

#### Scenario: Binary verdict returned

- **WHEN** triage evaluates a candidate
- **THEN** the outcome is either proceed or skip
- **AND** no intermediate or graded state exists

#### Scenario: No confidence-gated behaviour

- **WHEN** triage is uncertain about a candidate
- **THEN** it still returns proceed or skip
- **AND** no alternative handling path is selected on the basis of uncertainty

### Requirement: Every decision records its reason, including skips

Triage SHALL record, for each candidate, the outcome, the stage that decided it, and a
human-readable reason. Skips MUST be recorded as fully as proceeds.

#### Scenario: Skip reason recorded

- **WHEN** a candidate is skipped by a lane predicate
- **THEN** the record names the predicate that excluded it

#### Scenario: Model verdict reason recorded

- **WHEN** the model decides a candidate is out of lane
- **THEN** its stated reason is recorded alongside the outcome

#### Scenario: Skip ratio observable

- **WHEN** an operator inspects triage records over a period
- **THEN** the proportion of candidates skipped at each stage is determinable from the record
  rather than estimated

### Requirement: A closed item is never a candidate

Stage one is deliberately loose and written in the tracker's own language, so a source query
may legitimately omit a state filter. Triage SHALL skip any candidate whose normalized state is
closed. This is a universal skip rather than a lane, because an organization forgetting to
write it would produce work on a settled item — visible on a surface people watch.

#### Scenario: Closed item skipped whatever the query returned

- **WHEN** a source query returns a closed item
- **THEN** triage skips it before any model call
- **AND** the reason recorded identifies the item as closed

### Requirement: Predicate inputs derived from ingested text are hints, not authority

Some normalized fields are read out of item text rather than supplied by the surface — the
paths an issue names, for one. Such fields MAY route work and MUST NOT widen it: a predicate
input derived from ingested text SHALL NOT be able to place an item inside a lane the item's
surface-supplied fields exclude it from, nor grant any permission.

#### Scenario: Text-derived field routes but does not widen

- **WHEN** an item's body names a path belonging to another Igor's lane
- **THEN** that may make the item match a path predicate
- **AND** it does not override a label exclusion or any other surface-supplied constraint

#### Scenario: Text cannot grant authority

- **WHEN** an item's text is crafted to place itself in a more permissive Igor's lane
- **THEN** the action space still comes from that role's configuration
- **AND** nothing in the item's text alters it

### Requirement: Items with work already in flight are skipped

Triage SHALL skip any item the adapter reports as having work already in flight, unless that
artifact is the Igor's own and cannot merge. This rule is universal and MUST NOT be
configurable; only its detection is adapter-supplied.

The exception preserves the reason rather than qualifying it. Work in flight is skipped because
duplicating work in review is never an organizational preference — and an artifact of one's own
that cannot merge is not duplication, it is the same work, unfinished, which nothing else will
bring back.

#### Scenario: Item with an open linked artifact skipped

- **WHEN** an item already has work in flight against it
- **THEN** triage skips it
- **AND** the reason recorded identifies work in flight

#### Scenario: Rediscovery after completion does not duplicate work

- **WHEN** an Igor has completed an item, unassigned itself, and the item is rediscovered
- **THEN** the open artifact is detected and the item is skipped
- **AND** no second artifact is produced

#### Scenario: Rule not overridable by configuration

- **WHEN** a role or org base attempts to disable the in-flight skip
- **THEN** validation fails, because duplicating work in review is never an organizational preference

#### Scenario: An Igor's own artifact that cannot merge is a candidate

- **WHEN** an item's in-flight artifact was produced by this Igor and no longer merges
- **THEN** it is not skipped

#### Scenario: A healthy artifact of one's own is still skipped

- **WHEN** an item's in-flight artifact was produced by this Igor and merges cleanly
- **THEN** it is skipped, as before

#### Scenario: Somebody else's conflicting artifact is not adopted

- **WHEN** an item's in-flight artifact was produced by another party and cannot merge
- **THEN** it is skipped, because it is theirs

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

#### Scenario: A second holder alongside the Igor still means someone else's

- **WHEN** a candidate is held by both the running Igor and another party
- **THEN** it is skipped, on the same reading a mid-run claim check uses: people add
  themselves to a holder list rather than replacing what is there

#### Scenario: An item the Igor itself holds is still a candidate

- **WHEN** a candidate is held only by the running Igor and has no work in flight
- **THEN** it is not skipped, because that is a claim left behind by a process that stopped

#### Scenario: Nobody named means nobody holds it

- **WHEN** a candidate names no holder
- **THEN** the skip does not apply

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome: a reply from anyone other than the Igor,
or an edit to the item itself. Both are required, because a handoff *invites* a reply — an item
suppressed until its title or labels change would stay silent precisely where a person supplied
the missing context in a comment.

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply lifts the suppression

- **WHEN** anyone other than the Igor comments on a handed-back item
- **THEN** it is worked again

#### Scenario: An edit lifts the suppression

- **WHEN** a handed-back item is retitled, rewritten, relabelled, or its holder changes
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing

