## ADDED Requirements

### Requirement: A requested candidate enters triage as an ordinary candidate

A candidate arriving because somebody asked SHALL pass the same universal skips, the same lane
and the same triage as a discovered one, differing only in its provenance.

Only the entry point is new. A request that skipped screening would be a way to have an Igor do
what its lane forbids by asking nicely, which is the authority rule defeated by a side door.

Requested work is ordered ahead of discovered work because a person asking is a stronger
relevance signal than a query match. That is source ordering rather than a priority mechanism:
requests are their own source, listed first.

#### Scenario: A request is screened like anything else

- **WHEN** a requested candidate is closed, has work in flight, or falls outside the role's lane
- **THEN** it is skipped exactly as a discovered candidate would be

#### Scenario: Requests are considered first

- **WHEN** a cycle has both requested and discovered candidates
- **THEN** the requested ones are considered first

#### Scenario: Provenance distinguishes them

- **WHEN** a candidate arrived from a request
- **THEN** its record says so, and a discovered candidate's does not
