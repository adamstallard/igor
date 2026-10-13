## ADDED Requirements

### Requirement: The loop runs the role's checks in the worker's tree

Where the worker changed the tree, execution SHALL run each of the role's effective `checks` in
that tree, in the order declared, after the tree's changes are read and before the claim is
re-read. Every check SHALL run, even after one fails. What a check writes SHALL NOT reach the
artifact.

Each check SHALL run as the worker ran: as the same user, in its own process group, and with
the environment the worker was given, without the seat token.

#### Scenario: A check runs as the worker user

- **WHEN** a worker user is configured and a check runs a test the worker wrote
- **THEN** the test runs as the worker user
- **AND** its environment holds no seat token and no credential of the Igor's

#### Scenario: What a check writes is not published

- **WHEN** a check writes a file into the tree
- **THEN** the artifact carries the worker's changes and not that file

#### Scenario: A failed check does not stop the rest

- **WHEN** the first of two checks exits non-zero
- **THEN** the second still runs, and both results are recorded

#### Scenario: A run that changed nothing runs no checks

- **WHEN** the worker leaves the tree unchanged
- **THEN** no check runs

### Requirement: A run's checks are bounded and killed with the run

All of one run's checks together SHALL be bounded by the role's `check_minutes`. At the limit,
execution SHALL kill the running check's process group, record that check as timed out, and
record every check not yet started as not run.

While checks run, execution SHALL re-read the claim on a timer, once per checkpoint interval.
During the worker's run the claim is re-read on the worker's events, and a check emits none. A stop found then, or a termination during the checks,
SHALL kill the running check as it kills a worker.

#### Scenario: A hung test is killed at the limit

- **WHEN** a check is still running when `check_minutes` runs out
- **THEN** it and its subprocesses are killed
- **AND** it is recorded as timed out after that many minutes

#### Scenario: A stop during the checks publishes nothing

- **WHEN** the item is stopped while a check runs
- **THEN** the check is killed at the next checkpoint, not at the end of the checks
- **AND** nothing is published

### Requirement: The checks' result is published and recorded

Each execution row SHALL record each check's command line and result: passed, failed, timed
out or not run, with its exit code and how long it ran. The row SHALL NOT hold a check's output.

A pull request opened after checks SHALL be a draft where any check did not pass, even where the
role's `allow` lists `pr` and not `draft-pr`, and SHALL still request the role's reviewers. Its
body SHALL carry one line for the checks, after the worker's summary and not counted toward the
700-character limit on that summary:

- every check passed: the line names them and says Igor ran them;
- a check did not pass: the line names it and its result, followed by the last lines of its
  output, at most 1,000 characters for each such check;
- the role declares no checks: the line says Igor ran none, naming the role.

Before output is published, each credential value the Igor holds SHALL be replaced in it by
`[redacted]`: every seat token, and the value of each variable in the Igor's environment whose
name contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`.

Where checks follow a conflict resolution on an existing pull request, execution SHALL comment
on it with the same line, and where a check did not pass SHALL return it to draft.

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

#### Scenario: A role with no checks says so

- **WHEN** the role declares no checks
- **THEN** the body says Igor ran none, naming the role

#### Scenario: A credential in a check's output is not published

- **WHEN** a failing check prints a seat token
- **THEN** the body holds `[redacted]` where the token was

#### Scenario: A resolution that breaks the tests

- **WHEN** a conflict resolution is published to a ready pull request and a check fails
- **THEN** the pull request is returned to draft
- **AND** a comment on it names the failed check
