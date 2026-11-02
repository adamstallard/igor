## ADDED Requirements

### Requirement: A requested candidate enters triage as an ordinary candidate

A candidate arriving because somebody asked SHALL pass the same universal skips, the same lane
and the same triage as a discovered one, differing only in its provenance.

Requested work is ordered ahead of discovered work by source order, not by a priority
mechanism: requests are their own source, which Igor places ahead of every discovery source.

#### Scenario: A request is screened like anything else

- **WHEN** a requested candidate is closed, has work in flight, or falls outside the role's lane
- **THEN** it is skipped exactly as a discovered candidate would be

#### Scenario: Requests are considered first

- **WHEN** a cycle has both requested and discovered candidates
- **THEN** the requested ones are considered first

#### Scenario: Provenance distinguishes them

- **WHEN** a candidate arrived from a request
- **THEN** its record says so, and a discovered candidate's does not
