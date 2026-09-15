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

- **WHEN** the credential has access to a repository that is not listed in scope
- **THEN** no comments from it are extracted

#### Scenario: No repositories configured

- **WHEN** mining runs with an empty list of repositories in scope
- **THEN** it refuses to run rather than defaulting to everything the credential can reach

### Requirement: Review comments are mined from the repository where the pull request was opened

Mining SHALL treat each repository in scope as the source of its own review comments, and MUST
NOT assume that a fork inherits the review history of its upstream. Where both a fork and its
upstream are of interest, both SHALL be listed in scope.

#### Scenario: Fork does not inherit upstream review history

- **WHEN** a repository in scope is a fork whose commit history includes its upstream's commits
- **THEN** only review comments opened against the fork are extracted
- **AND** the upstream's review comments are absent unless the upstream is also in scope

### Requirement: Corrections are classified by whether they stuck

Mining SHALL record, for each comment, whether the pull request host still anchors it to a
line in the final diff, as a `stuck` signal on the comment. This signal SHALL be treated as
evidence that weights a cluster, and MUST NOT be used to include or exclude an individual
comment on its own. Because the signal separates rejection from compliance only weakly, it
SHALL be applied as a downweight on comments that did not stick, and SHALL NOT be the sole
basis on which a cluster is promoted.

#### Scenario: Comment no longer anchored

- **WHEN** a review comment is no longer anchored to a line in the pull request's final diff
- **THEN** the comment is recorded as `stuck: true`

#### Scenario: Comment still anchored at merge

- **WHEN** a review comment is still anchored to a line when the pull request merges
- **THEN** the comment is recorded as `stuck: false`
- **AND** the comment is still carried forward into clustering

#### Scenario: Stuck alone does not promote

- **WHEN** a cluster's only distinguishing evidence is that its comments stuck
- **THEN** the cluster is not promoted on that basis

### Requirement: The corpus excludes comments whose stick signal is not computable

Mining SHALL exclude review comments that the host cannot anchor to a line, and comments on
pull requests that never merged, rather than recording them as not having stuck. The host
reports an unanchorable comment as still-anchored rather than as unknown, so scoring it would
manufacture negative evidence.

#### Scenario: Comment the host cannot anchor

- **WHEN** a review comment carries no original line anchor
- **THEN** it is excluded from the corpus
- **AND** the exclusion and its reason are recorded

#### Scenario: Unmerged pull request

- **WHEN** a review comment belongs to a pull request that has not merged
- **THEN** it is excluded from the corpus, because its thread state has not settled

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

### Requirement: Bot and automated-reviewer comments are excluded by default

Mining SHALL identify comments authored by bots or automated reviewers and exclude them by
default, with configuration able to re-include named authors. Exclusions SHALL be recorded in
the same way as substance filtering, so that what was dropped remains inspectable.

Detection MUST treat the account type reported by the host as authoritative. Login-pattern
matching MAY supplement it but MUST NOT be the primary mechanism, because automated reviewers
do not reliably carry a marker in their login.

#### Scenario: Bot reviewer excluded by account type

- **WHEN** review comments include entries whose author account type is `Bot`
- **THEN** those comments are excluded from clustering
- **AND** the exclusion and its reason are recorded

#### Scenario: Automated reviewer without a login marker

- **WHEN** an automated reviewer posts under a login carrying no `[bot]` suffix or other
  naming marker, but is typed as a bot by the host
- **THEN** it is still excluded
- **AND** exclusion does not depend on the login string

#### Scenario: Human review of AI-authored code retained

- **WHEN** a human reviews a pull request whose code was written by an AI assistant
- **THEN** the human's comments are retained, because the correction is human judgment about
  what the team wants

#### Scenario: Bot author explicitly re-included

- **WHEN** configuration names a bot author as re-included
- **THEN** that author's comments participate in clustering
- **AND** candidates drawn from them escalate to store reviewers, since a bot cannot be
  assigned a review

### Requirement: Mining is idempotent across runs

Mining SHALL record processed comment identifiers in a ledger, and a subsequent run SHALL NOT
reprocess a comment already in the ledger. Re-running over an expanded history SHALL add new
material without duplicating prior results.

The ledger is also what stops a rejected candidate returning: its source comments are already
processed, so the cluster cannot re-form. A later comment expressing the same rule does form a
new, smaller cluster and may be proposed again — that is new evidence for a rule the team
previously declined, and asking once more is the intended behaviour rather than a defect.

#### Scenario: Second run adds only new comments

- **WHEN** mining runs, then runs again after new pull requests have merged
- **THEN** only comments absent from the ledger are processed

#### Scenario: Re-run over identical history is a no-op

- **WHEN** mining runs twice with no intervening repository activity
- **THEN** the second run produces no new candidates

#### Scenario: A rejected candidate does not return from the same comments

- **WHEN** a candidate was rejected and mining runs again over the same history
- **THEN** its source comments are in the ledger and are not reprocessed
- **AND** the candidate is not proposed again

#### Scenario: New evidence may raise a previously rejected rule

- **WHEN** a new comment expresses a rule whose earlier candidate was rejected
- **THEN** it forms a new cluster from unprocessed comments
- **AND** it may be proposed with the support that new evidence carries
