## MODIFIED Requirements

### Requirement: Items with work already in flight are skipped

Triage SHALL skip any item the adapter reports as having work already in flight, an artifact
such as a pull request, unless that artifact is the Igor's own and cannot merge, or unless the role's label holds the item with a
claim this process takes over: its own predecessor's, or a gone rank's, as `work-claiming`
defines. This rule is universal and MUST NOT be configurable; only its detection is
adapter-supplied.

The exceptions preserve the reason rather than qualifying it. Work in flight is skipped because
duplicating work in review is never an organizational preference — and an artifact of one's own
that cannot merge is not duplication, it is the same work, unfinished, which nothing else will
bring back. A claim left on the Igor's own artifact by a process that is no longer behind it is
not duplication either: the process that takes it over catches the item up rather than
re-working it.

The exception above, for a claim this process takes over, covers an item whose holding claim
message carries this process's rank, whether this process or a predecessor posted it. Where
that item's open pull request, the Igor's own, still merges, as after a catch-up that gave its
claim back and kept a person's label, triaging it would only decide to carry on with a catch-up
that changes nothing, so triage SHALL pass the item over with no triage call, unless the item or its pull request has been
updated since this process last triaged it, the pull request no longer merges, or the pull
request is the Igor's own two-gate artifact carrying a review to act on. A process that has not
triaged the item since it started triages it once.

A review to act on is what `follow-the-two-gate-workflow` (#150) calls an actionable review, on
the Igor's own two-gate artifact. Over such a pull request the holder resumes the item and runs a
worker, as #150 says, rather than carrying on with a catch-up that changes nothing. A pull request
that still merges and carries no such review stays worker-free.

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

#### Scenario: A held item whose pull request still merges is not triaged again until it changes

- **WHEN** this process's claim message holds an item whose Igor pull request still merges, and
  neither the item nor the pull request has been updated since this process last triaged it
- **THEN** the item is passed over with no triage call
- **AND** once a comment is added to the item, or the pull request stops merging, the next cycle
  triages it

#### Scenario: A review to act on brings a worker

- **WHEN** this process's claim message holds an item whose Igor pull request, a two-gate
  artifact, still merges, and a reviewer requests changes on it
- **THEN** the next cycle triages the item, and the holder resumes it with a worker, as #150 says

### Requirement: An item held by another party is never a candidate

Triage SHALL skip any item whose holder field names a party other than the running Igor. This
rule is universal and MUST NOT be configurable.

Where several processes run the Igor's role, an item whose holding claim message, the earliest
that counts, carries the rank of another process of the role that is not gone, is held by that
process. Such an item SHALL be passed over before triage, with no triage call. An item the role's
label holds with no such message, or with this process's own rank, is the running Igor's.

Acting on work that is visibly someone else's is not an organizational preference. Left to a
role's lane, its declared limits on what it takes, an org that forgets to write this skip gets an Igor that claims and retracts on a colleague's
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
