## ADDED Requirements

### Requirement: Review comments are extracted only from configured repositories

Mining SHALL extract pull request review comments from the repositories named in
configuration, and MUST NOT discover or include repositories that were not explicitly
listed. Each extracted comment SHALL retain its body, author, file path, line range,
permalink, and timestamp.

#### Scenario: Configured repository mined

- **WHEN** mining runs with `org/web` in scope
- **THEN** review comments from `org/web` pull requests are extracted
- **AND** each retains body, author, path, line range, permalink, and timestamp

#### Scenario: Unlisted repository skipped

- **WHEN** the credential has access to `org/secrets` but it is not listed in scope
- **THEN** no comments from `org/secrets` are extracted

### Requirement: Corrections are classified by whether they stuck

Mining SHALL determine, for each comment, whether the lines it targeted were subsequently
modified within the same pull request, and record that determination as a `stuck` signal on
the comment. This signal SHALL be treated as evidence that weights a cluster, and MUST NOT be
used to include or exclude an individual comment on its own.

#### Scenario: Comment followed by a change

- **WHEN** a review comment targets lines 40-45 and a later commit in that pull request
  modifies lines within that range
- **THEN** the comment is recorded as `stuck: true`

#### Scenario: Comment with no subsequent change

- **WHEN** a review comment's target lines are unchanged for the remainder of the pull request
- **THEN** the comment is recorded as `stuck: false`
- **AND** the comment is still carried forward into clustering

### Requirement: Non-substantive comments are filtered

Mining SHALL exclude comments that carry no rule content, using at minimum: length below a
configured threshold, absence of any reasoning, and explicit nit markers. Filtering decisions
SHALL be recorded so that a filtered comment can be inspected rather than silently dropped.

#### Scenario: Nit filtered

- **WHEN** a comment reads "nit: extra blank line"
- **THEN** it is excluded from clustering
- **AND** the exclusion and its reason are recorded

#### Scenario: Substantive comment retained

- **WHEN** a comment explains why an approach is wrong and what to do instead
- **THEN** it is retained for clustering

### Requirement: Comment authors are resolved and weighted

Each comment SHALL carry its author identity. Where configuration designates expert authors,
their comments SHALL receive a higher weight in cluster scoring than unweighted authors.

#### Scenario: Expert comment weighted higher

- **WHEN** two clusters have equal size but one is composed of comments from a designated
  expert
- **THEN** the expert's cluster scores higher

### Requirement: Mining is idempotent across runs

Mining SHALL record processed comment identifiers in a ledger, and a subsequent run SHALL NOT
reprocess a comment already in the ledger. Re-running over an expanded history SHALL add new
material without duplicating prior results.

#### Scenario: Second run adds only new comments

- **WHEN** mining runs, then runs again after new pull requests have merged
- **THEN** only comments absent from the ledger are processed

#### Scenario: Re-run over identical history is a no-op

- **WHEN** mining runs twice with no intervening repository activity
- **THEN** the second run produces no new candidates
