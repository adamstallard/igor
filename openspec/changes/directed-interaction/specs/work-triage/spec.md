## ADDED Requirements

### Requirement: A requested candidate enters triage as an ordinary candidate

A candidate arriving because somebody asked SHALL pass the same universal skips, the same lane
and the same triage as a discovered one, differing only in its provenance, except where *An item held by another party is never a
candidate* lets a mention through.

Requests SHALL be their own source, which Igor places ahead of every discovery source.

#### Scenario: A request is screened like anything else

- **WHEN** a requested candidate is closed, has work in flight, or falls outside the role's lane
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
