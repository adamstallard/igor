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

Triage SHALL skip any item the adapter reports as having work already in flight. This rule is
universal and MUST NOT be configurable; only its detection is adapter-supplied.

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

