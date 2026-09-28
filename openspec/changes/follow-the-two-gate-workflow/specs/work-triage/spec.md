## MODIFIED Requirements

### Requirement: Items with work already in flight are skipped

Triage SHALL skip any item the adapter reports as having work already in flight, unless that
artifact is the Igor's own and cannot merge, or is the Igor's own two-gate artifact carrying an
actionable review it can act on: at gate one an approval or a change request, and past gate one a
change request. This rule is universal and
MUST NOT be configurable; only its detection is adapter-supplied.

The exception preserves the reason rather than qualifying it. Work in flight is skipped because
duplicating work in review is never an organizational preference — and an artifact of one's own
that cannot merge is not duplication, it is the same work, unfinished, which nothing else will
bring back. A specification of one's own that a person has approved or asked to change is the
same work too, waiting on the Igor rather than on a reviewer.

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

#### Scenario: An approved specification of one's own is a candidate

- **WHEN** an item's in-flight artifact is this Igor's own gate-one artifact and carries an
  actionable approval
- **THEN** it is not skipped, and is resumed for gate two

#### Scenario: A specification of one's own with changes requested is a candidate

- **WHEN** an item's in-flight artifact is this Igor's own gate-one artifact and carries an
  actionable change request
- **THEN** it is not skipped, and is resumed for a revision

#### Scenario: A specification awaiting review is still skipped

- **WHEN** an item's in-flight artifact is this Igor's own gate-one artifact and carries no
  actionable review
- **THEN** it is skipped, as work in flight

#### Scenario: An approval past gate two is still skipped

- **WHEN** an item's in-flight artifact is this Igor's own and carries paths outside
  `openspec/changes/`, and carries an actionable approval
- **THEN** it is skipped, because gate two has already run and merging is a person's to do

#### Scenario: A change request past gate two is a candidate

- **WHEN** an item's in-flight artifact is this Igor's own, past gate one, and carries an
  actionable change request
- **THEN** it is not skipped, and is resumed for a revision of the implementation
