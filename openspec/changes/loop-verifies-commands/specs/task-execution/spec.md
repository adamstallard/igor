## ADDED Requirements

### Requirement: The loop runs the role's checks in the worker's tree

Where the worker changed the tree, execution SHALL run each of the role's effective `checks` in
that tree, in the order declared, after the tree's changes are read and before the claim is
re-read. Every check SHALL run, even after one fails. What a check writes SHALL NOT reach the
artifact.

A check runs code from the tree, which the worker can edit, so it SHALL run as the worker runs:
as the same user, in its own process group, and with the environment the worker was given,
without the seat token. It SHALL NOT run as the Igor's user where a worker user is configured.
Where none is configured, the check runs as the Igor's own user, as the worker did.

#### Scenario: A check runs as the worker user

- **WHEN** a worker user is configured and a check runs a test the worker wrote
- **THEN** the test runs as the worker user
- **AND** its environment holds no seat token and no credential of the Igor's

#### Scenario: What a check writes is not published

- **WHEN** a check writes a file into the tree
- **THEN** the artifact carries the worker's changes and not that file

#### Scenario: A run that changed nothing runs no checks

- **WHEN** the worker leaves the tree unchanged
- **THEN** no check runs

### Requirement: A run's checks are bounded and killed with the run

All of one run's checks together SHALL be bounded by the role's `check_minutes`. At the limit,
execution SHALL kill the running check's process group, record that check as timed out, and
record every check not yet started as not run. A stop or a termination during the checks SHALL
kill them as it kills a worker.

#### Scenario: A hung test is killed at the limit

- **WHEN** a check is still running when `check_minutes` runs out
- **THEN** it and its subprocesses are killed
- **AND** it is recorded as timed out after that many minutes

#### Scenario: A stop during the checks publishes nothing

- **WHEN** the item is stopped while a check runs
- **THEN** the check is killed and nothing is published

### Requirement: The checks' result is published and recorded

Each execution row SHALL record each check's command line and result: passed, failed, timed
out or not run, with its exit code and how long it ran.

A pull request opened after checks SHALL be a draft where any check did not pass, whatever the
role's `allow` prefers, and SHALL still request the role's reviewers. Its body SHALL carry one
line for the checks, after the worker's summary and not counted toward the 700-character limit
on that summary:

- every check passed: the line names them and says Igor ran them;
- a check did not pass: the line names it and its result, followed by the last lines of its
  output, at most 1,000 characters for each such check;
- the role declares no checks: the line says Igor ran none, naming the role.

Where checks follow a conflict resolution on an existing pull request and one did not pass,
execution SHALL return that pull request to draft and comment on it with the same line.

#### Scenario: A failing test keeps the pull request a draft

- **WHEN** a role allows `pr` and `draft-pr`, and a check exits non-zero
- **THEN** the pull request is opened as a draft
- **AND** its body names the check, its exit code and the end of its output

#### Scenario: A role that may only open ready pull requests

- **WHEN** a role allows `pr` and not `draft-pr`, and a check fails
- **THEN** the pull request is opened as a draft

#### Scenario: Passing checks are stated

- **WHEN** every check passes
- **THEN** the body names each check and says Igor ran it

#### Scenario: A resolution that breaks the tests

- **WHEN** a conflict resolution is published to a ready pull request and a check fails
- **THEN** the pull request is returned to draft
- **AND** a comment on it names the failed check

## MODIFIED Requirements

### Requirement: The abandoned-tree threshold derives from the worker's longest possible life

The sweep that reclaims working trees left by a dead process SHALL use a threshold above the
longest a tree can be in use, which is the absolute ceiling, plus the 60-minute maximum of
`check_minutes`, plus the provisioning and publication either side of the worker. The margin
SHALL be additive, because what a tree outlives its worker by is checks, a clone and a push
rather than a share of the run.

Deleting a live sibling's tree corrupts its run; leaving debris another hour costs disk.

#### Scenario: A tree in use by the longest possible worker is not swept

- **WHEN** a worker has run to the absolute ceiling, its checks have run to the maximum limit,
  and its tree is still held
- **THEN** the sweep does not remove that tree

#### Scenario: The threshold follows the ceiling

- **WHEN** the absolute ceiling changes
- **THEN** the sweep threshold changes with it
