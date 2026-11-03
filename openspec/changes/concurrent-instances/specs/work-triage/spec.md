## MODIFIED Requirements

### Requirement: Items with work already in flight are skipped

Triage SHALL skip any item the adapter reports as having work already in flight, an artifact such as
a pull request, unless that artifact is the Igor's own and cannot merge, or the role's label holds
the item with a claim this process carries on as its own: one with its own rank, posted by it or a
predecessor, and for `igor run` carrying its own run id too, or a gone rank's, as `work-claiming`
defines. This rule is universal and MUST NOT be configurable; only its detection is
adapter-supplied.

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

#### Scenario: A gone rank's claim on the Igor's artifact is not skipped

- **WHEN** an item's in-flight artifact was produced by this Igor, and the role's label holds the
  item with a claim message of a rank that is gone
- **THEN** it is not skipped, and the process that takes the claim over catches the item up

### Requirement: An item held by another party is never a candidate

Triage SHALL skip any item whose holder field names a party other than the running Igor. This
rule is universal and MUST NOT be configurable. An item whose holding claim message carries the
rank of another process of its role that is not gone is that process's, and SHALL be passed over
before triage, with no triage call. An item the role's label holds with no such message, or with
this process's own rank, is the running Igor's; for `igor run`, only if the message also carries
its run id.

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

## ADDED Requirements

### Requirement: A held item whose own pull request still merges is triaged only when it changes

Where an item's holding claim message carries this process's rank, posted by it or a predecessor,
and for `igor run` also its run id, and the Igor's own open pull request for it still merges, triage
SHALL pass it over unless the item or pull request changed since this process last triaged it, the
pull request stopped merging, or the pull request carries an actionable two-gate review. While it
still merges without one, the item gets no worker. A process triages such an item once after
starting.

#### Scenario: A restarted holder triages its unchanged pull request once

- **WHEN** rank 1 restarts while it holds an item whose pull request, the Igor's own, still
  merges and has not changed
- **THEN** rank 1 triages the item once after its start, and passes it over with no triage call
  at later cycles until the item or its pull request changes

#### Scenario: A held item whose pull request still merges is not triaged again until it changes

- **WHEN** this process's claim message holds an item whose Igor pull request still merges, as
  after a catch-up that gave its claim back and kept a person's label, and neither the item nor
  the pull request has been updated since this process last triaged it
- **THEN** the item is passed over with no triage call
- **AND** once a comment is added to the item, or the pull request stops merging, the next cycle
  triages it
- **AND** no worker runs on it while the pull request still merges and carries no actionable
  review

#### Scenario: Another run's rank-0 message is not igor run's own

- **WHEN** an `igor run` finds an item whose holding claim message carries rank 0 and another
  run's id
- **THEN** that message is not its own, since every run is rank 0 and its message must also carry
  its own run id, so this rule does not pass the item over as held by it

#### Scenario: A review to act on brings a worker

- **WHEN** this process's claim message holds an item whose Igor pull request, a two-gate
  artifact, still merges, and a reviewer requests changes on it
- **THEN** the next cycle triages the item, and the holder resumes it with a worker, as
  `follow-the-two-gate-workflow` (#150) says of an actionable review, rather than carrying on with
  a catch-up that changes nothing
