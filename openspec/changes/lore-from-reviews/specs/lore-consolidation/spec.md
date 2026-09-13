## ADDED Requirements

### Requirement: Related corrections are clustered into candidate rules

Consolidation SHALL group semantically related comments across pull requests using text
embeddings, and each resulting cluster SHALL become one candidate entry. The embedding
provider SHALL be pluggable and SHALL default to a local implementation.

#### Scenario: Differently worded comments cluster together

- **WHEN** one comment reads "don't fetch in useEffect" and another reads "this should use
  the query hook"
- **THEN** both land in the same cluster despite sharing no significant keywords

#### Scenario: Unrelated comments stay separate

- **WHEN** a comment about data fetching and a comment about test naming are clustered
- **THEN** they are placed in different clusters

### Requirement: Clusters are scored on support and recency independently

Consolidation SHALL compute two scores per cluster: a support count equal to the number of
contributing comments, and a recency weight applying exponential decay over comment dates
using a configured half-life. Neither score SHALL be persisted into an entry's frontmatter.

#### Scenario: Recent and historical clusters distinguished

- **WHEN** cluster A has 6 comments from the last quarter and cluster B has 14 comments all
  older than two years
- **THEN** cluster B has the higher support count
- **AND** cluster A has the higher recency weight

### Requirement: Stale high-support clusters route to a separate queue

A cluster whose support is high but whose most recent contributing comment is older than a
configured staleness threshold SHALL be routed to a "did you stop doing this?" review queue
rather than the promotion queue.

#### Scenario: Abandoned convention surfaced

- **WHEN** a cluster of 14 comments has no instance newer than the staleness threshold
- **THEN** it is placed in the staleness queue
- **AND** it is not proposed for promotion to `active`

#### Scenario: Confirmed-still-current rule promoted

- **WHEN** a reviewer confirms a stale cluster is still current
- **THEN** the candidate moves into the normal promotion path

### Requirement: Candidates are drafted with claim, conditions, and provenance

For each promoted cluster, consolidation SHALL draft an entry containing a claim, a prose
condition, a scope label, and one provenance item per contributing comment carrying its url,
author, and date. Drafting MUST NOT assert a claim unsupported by the cluster's comments.

#### Scenario: Draft carries full provenance

- **WHEN** a cluster of 14 comments is drafted
- **THEN** the candidate entry contains 14 provenance items
- **AND** each item carries a url, an author, and a date

### Requirement: Path predicates are derived from source comments

Where the file paths of a cluster's comments share a common glob pattern, consolidation SHALL
emit that pattern as the entry's `conditions.paths`. Where they do not, the entry SHALL be
written with a prose condition and no `paths` predicate.

#### Scenario: Shared path prefix yields a predicate

- **WHEN** every comment in a cluster targets a `.tsx` file under `src/components`
- **THEN** the drafted entry's `conditions.paths` contains a glob matching that location

#### Scenario: Scattered paths yield no predicate

- **WHEN** a cluster's comments span unrelated directories with no common pattern
- **THEN** the drafted entry omits `conditions.paths`
- **AND** still carries a prose condition

### Requirement: Candidates are deduplicated against the existing store

Before proposing a candidate, consolidation SHALL compare it against existing entries. A
candidate that refines an existing entry SHALL be proposed as an edit to that entry, adding
its provenance, rather than as a new entry.

#### Scenario: Refinement proposed as an edit

- **WHEN** a candidate expresses the same rule as an existing active entry with additional
  supporting comments
- **THEN** the proposal edits the existing entry and appends the new provenance items
- **AND** no second entry is created

### Requirement: Each batch is capped and sequential

Consolidation SHALL propose at most a configured number of candidates per batch, defaulting
to 20, selected by combined support and recency. A subsequent batch SHALL NOT open while
candidates from the previous batch remain unresolved.

#### Scenario: Batch capped

- **WHEN** 400 candidates qualify and the cap is 20
- **THEN** the 20 highest-scoring candidates are proposed
- **AND** the remainder are retained for a later batch

#### Scenario: Next batch blocked on unresolved review

- **WHEN** a previous batch still has candidates awaiting review
- **THEN** consolidation declines to open a new batch
