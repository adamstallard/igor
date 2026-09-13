## ADDED Requirements

### Requirement: Igors poll on an interval rather than waiting for triggers

Discovery SHALL run each configured source's query on a configurable interval. The system MUST
NOT require a public endpoint, webhook receiver, or per-surface relay.

#### Scenario: Sources polled on the interval

- **WHEN** a role declares two sources and the interval elapses
- **THEN** each source's query is executed
- **AND** results from all sources are normalized into one candidate set

#### Scenario: No inbound endpoint required

- **WHEN** an Igor runs behind a firewall with no inbound network access
- **THEN** discovery still functions

### Requirement: Queries are dispatched to the tracker unmodified

Discovery SHALL send each source's configured query verbatim to that tracker, and SHALL treat
it as deliberately loose — narrowing is the job of later stages, not of the query.

#### Scenario: Query sent as written

- **WHEN** a source's query is executed
- **THEN** the tracker receives exactly the configured string

#### Scenario: Loose query narrowed downstream

- **WHEN** a query returns candidates outside the role's lane
- **THEN** discovery still returns them
- **AND** they are excluded by lane predicates rather than by changing the query

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL record a per-source watermark so previously seen items are not reconsidered
indefinitely. A watermark is an efficiency measure only.

#### Scenario: Seen items not re-triaged

- **WHEN** discovery runs twice with no intervening tracker activity
- **THEN** the second run performs no triage calls

#### Scenario: New items picked up

- **WHEN** an item is created after the last watermark
- **THEN** it appears in the next discovery run

### Requirement: State is a cache and correctness never depends on it

The tracker SHALL be the source of truth for what is claimed. Losing discovery state MUST NOT
produce a duplicate claim; it MUST cost only redundant API calls and triage.

#### Scenario: State lost entirely

- **WHEN** all discovery state is deleted and the loop runs
- **THEN** previously handled items are re-examined
- **AND** each is found assigned, closed, or already worked and is skipped
- **AND** no duplicate claim is made

#### Scenario: Correctness not delegated to the cache

- **WHEN** the watermark and the tracker disagree about an item's status
- **THEN** the tracker's status governs

### Requirement: State lives on an orphan branch of the destination

Discovery state and execution transcripts SHALL be written to an orphan branch of the
destination repository, sharing no history with its default branch. They MUST NOT be written to
the default branch.

#### Scenario: State written off the main line

- **WHEN** state is persisted
- **THEN** it is committed to the state branch
- **AND** the default branch's history is unchanged

#### Scenario: State survives a fresh clone

- **WHEN** the loop starts from a machine that has never run it before
- **THEN** prior state is available from the branch

#### Scenario: State inspectable without checkout

- **WHEN** a person wants to see why an item was skipped
- **THEN** the state file is readable from the branch without checking it out
