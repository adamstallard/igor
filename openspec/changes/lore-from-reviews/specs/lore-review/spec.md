## ADDED Requirements

### Requirement: Candidates are grouped into one pull request per reviewer

Review SHALL group a batch's candidates by the author their comments were mined from, and
open exactly one pull request per such author containing that author's candidates. A
candidate SHALL be independently acceptable or refusable within that pull request.

#### Scenario: Batch split by author

- **WHEN** a batch of 20 candidates draws on comments from 3 distinct authors
- **THEN** 3 pull requests are opened, each containing only that author's candidates
- **AND** each is assigned to that author for review

#### Scenario: One refusal does not block the rest

- **WHEN** a reviewer declines one candidate in a pull request containing six
- **THEN** the remaining five can still be approved and written

### Requirement: A declined candidate is discarded permanently

When a reviewer declines a candidate, it SHALL be discarded and MUST NOT be re-proposed by a
later run. The declined candidate's source comments SHALL be recorded as declined so that
re-clustering cannot resurrect the same proposal.

#### Scenario: Declined candidate not reproposed

- **WHEN** a candidate is declined and consolidation runs again over the same history
- **THEN** the same candidate is not proposed a second time

#### Scenario: No appeal path

- **WHEN** a candidate has been declined
- **THEN** no mechanism exists to promote it without a new human-initiated proposal

### Requirement: Non-response escalates to store reviewers

When a reviewer has not responded to an assigned pull request within a configured window, the
candidates in it SHALL be reassigned to the store-level `reviewers` list, any one of whom may
approve or decline.

#### Scenario: Window elapses

- **WHEN** an assigned pull request receives no response within the configured window
- **THEN** it is reassigned to the store-level reviewers
- **AND** the original assignee is recorded as non-responding rather than declining

#### Scenario: Any store reviewer may resolve

- **WHEN** an escalated pull request is approved by one member of the store reviewers list
- **THEN** the approval is sufficient and no further sign-off is required

### Requirement: Departed authors are mined with role attribution

Comments from authors no longer present SHALL still be mined. Candidates drawn from them
SHALL be assigned to the store-level `reviewers` rather than the departed author, and the
entry's claim SHALL be expressed as the team's convention rather than attributed to the
individual. Provenance SHALL still cite the original comments and their authors.

#### Scenario: Departed author's cluster proposed

- **WHEN** a candidate's comments were all written by someone no longer present
- **THEN** the pull request is assigned to the store-level reviewers
- **AND** provenance still names the original author and links the comments

#### Scenario: Claim not attributed to an individual

- **WHEN** an entry derived from a departed author is written
- **THEN** its claim states the convention without asserting what that person currently believes

### Requirement: Approval writes the entry with provenance intact

On approval, the entry SHALL be written to the store with `status: active`, a `reviewed`
block naming the approver and date, and its provenance unmodified from the proposal.

#### Scenario: Approved candidate written

- **WHEN** a reviewer approves a candidate
- **THEN** the entry file is written with `status: active`
- **AND** `reviewed.by` names the approver and `reviewed.at` carries the approval date
- **AND** provenance matches the proposal exactly

#### Scenario: Unreviewed entry never active

- **WHEN** a candidate has been proposed but not yet approved
- **THEN** no entry with `status: active` exists for it in the store
