## ADDED Requirements

### Requirement: A requested candidate enters triage as an ordinary candidate

A candidate arriving because somebody asked SHALL pass the same universal skips, the same lane
and the same triage as a discovered one, differing only in its provenance, except where the skips of held, closed and in-flight items
let a mention through, as those requirements say.

Requests SHALL be their own source, which Igor places ahead of every discovery source.

#### Scenario: A request is screened like anything else

- **WHEN** a candidate requested for work is closed, has work in flight, or falls outside the
  role's lane
- **THEN** it is skipped exactly as a discovered candidate would be

#### Scenario: Requests are considered first

- **WHEN** a cycle has both requested and discovered candidates
- **THEN** the requested ones are considered first

#### Scenario: Provenance distinguishes them

- **WHEN** a candidate arrived from a request
- **THEN** its record says so, and a discovered candidate's does not

## MODIFIED Requirements

### Requirement: An item held by another party is never a candidate

Triage SHALL skip any item whose holder field names a party other than the running Igor. This
rule is universal and MUST NOT be configurable.

A mention that may only be answered, under `directed-interaction`'s *A mention narrows what an
Igor may do*, SHALL pass this skip to be answered. The item stays no candidate for work: the
Igor does not claim or work it.

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

#### Scenario: A mention on a held item is answered

- **WHEN** someone with write access mentions the Igor on an item another party holds
- **THEN** the Igor answers the mention
- **AND** it neither claims nor works the item

### Requirement: Items with work already in flight are skipped

Triage SHALL skip an item the adapter reports work in flight on, except: the Igor's own artifact
that cannot merge; its own two-gate artifact with a review it can act on (an approval or change
request at gate one, a change request later); an item the role's label holds with a claim this
process carries on: its own rank's, posted by it or a predecessor (with its run id for `igor
run`), or a gone rank's, as `work-claiming` defines; and a writer's mention. It MUST NOT
be configurable.

#### Scenario: Item with an open linked artifact skipped

- **WHEN** an item already has work in flight against it
- **THEN** triage skips it
- **AND** the reason recorded identifies work in flight

#### Scenario: Rediscovery after completion does not duplicate work

- **WHEN** an Igor has completed an item, released its claim, and the item is rediscovered
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

#### Scenario: A gone rank's claim on the Igor's artifact is not skipped

- **WHEN** an item's in-flight artifact was produced by this Igor, and the role's label holds the
  item with a claim message of a rank that is gone
- **THEN** it is not skipped, and the process that takes the claim over resumes the gone rank's
  unfinished work on it

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

#### Scenario: A writer's mention on the Igor's own pull request passes

- **WHEN** someone with write access mentions the Igor on its own healthy open pull request,
  choosing an option it offered
- **THEN** the pull request is not skipped, and the Igor acts on the option

#### Scenario: A mention on an item with an open pull request is answered

- **WHEN** someone with write access asks the Igor "can you look at this?" on an issue that has
  an open pull request
- **THEN** the Igor answers the mention
- **AND** it neither claims nor works the item

### Requirement: A closed item is never a candidate

Stage one is deliberately loose and written in the tracker's own language, so a source query
may legitimately omit a state filter. Triage SHALL skip any candidate whose normalized state is
closed, except an answer-only mention. This is a universal skip rather than a lane, because an
organization forgetting to write it would produce work on a settled item.

#### Scenario: Closed item skipped whatever the query returned

- **WHEN** a source query returns a closed item
- **THEN** triage skips it before any model call
- **AND** the reason recorded identifies the item as closed

#### Scenario: A mention on a closed item is answered

- **WHEN** someone with write access mentions the Igor on a closed issue to ask why it was closed
- **THEN** the Igor answers the mention, and does not reopen or work the item
