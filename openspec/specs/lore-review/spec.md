# lore-review Specification

## Purpose
TBD - created by archiving change lore-store. Update Purpose after archive.
## Requirements
### Requirement: Candidates are proposed as pull requests, one per dominant author

Proposing SHALL group candidates by their **dominant author** — the author contributing the
most provenance items — and open exactly one pull request per dominant author containing that
author's candidates, on a branch carrying a recognizable prefix. Proposing SHALL work on any
directory of candidate entries, whether mined or hand-authored.

#### Scenario: Batch split by dominant author

- **WHEN** a batch of candidates has 3 distinct dominant authors
- **THEN** 3 pull requests are opened, each containing only that author's candidates
- **AND** each is assigned to that author

#### Scenario: Hand-authored candidates take the same path

- **WHEN** the candidates were written by a person rather than mined
- **THEN** they are proposed the same way
- **AND** the dominant author is the person who wrote them

#### Scenario: Equal contribution

- **WHEN** two authors contribute the same number of provenance items to a candidate
- **THEN** the author whose most recent contribution is later is treated as dominant

### Requirement: Every contributing author reviews what was derived from them

A candidate drawn from more than one author SHALL request every other contributing author as a
reviewer on the pull request holding it, and SHALL name them in the body. Any one of them MAY
approve, and any one MAY decline.

Bodies MUST NOT use @mentions for contributing authors. A mention notifies someone who may
never have seen the repository and did not ask to be part of it; a plain name credits them
without that.

#### Scenario: Mixed-authorship candidate

- **WHEN** a candidate draws four provenance items from one author and two from another
- **THEN** it is placed in the first author's pull request
- **AND** the second author is requested as a reviewer and named in the body

#### Scenario: Contributing author credited without notification

- **WHEN** a body credits a contributing author
- **THEN** it names them as plain text
- **AND** contains no @mention

### Requirement: Assignment is verified rather than assumed

After assigning, proposing SHALL read back who was actually assigned. Where the intended
author could not be assigned — they are not a collaborator on the destination — the pull
request SHALL be assigned to the store-level `reviewers` instead, and the substitution
reported.

#### Scenario: Dominant author is not a collaborator

- **WHEN** the dominant author cannot be assigned on the destination repository
- **THEN** the store-level reviewers are assigned instead
- **AND** the output states that the intended author was not a collaborator

#### Scenario: Assignment is never silently lost

- **WHEN** an assignment request is accepted but the assignee is absent from the result
- **THEN** the tool treats it as a failure rather than as success

### Requirement: The pull request body states the review contract

Each pull request body SHALL explain how to review: deleting a file rejects that entry
permanently, editing a file amends it, merging accepts everything still present, and closing
without merging defers without rejecting anything. It SHALL also carry each candidate's claim,
conditions, and every provenance link, so the derivation can be checked without leaving the
page.

#### Scenario: Contract is present

- **WHEN** a pull request is opened
- **THEN** its body states that deletion rejects permanently, editing amends, merging accepts,
  and closing without merging defers

#### Scenario: Derivation is checkable in place

- **WHEN** a candidate was derived from six comments
- **THEN** its section lists all six links with their authors and dates

### Requirement: Rejection is deliberate and deferral is passive

Deleting a candidate's file SHALL count as rejecting it, and a rejected candidate MUST NOT be
re-proposed. Closing a pull request without merging SHALL count as deferring: nothing is
rejected and those candidates may be proposed again.

#### Scenario: Deleted file is rejected

- **WHEN** a reviewer deletes a candidate's file and merges
- **THEN** that candidate is recorded as rejected
- **AND** it is not proposed again

#### Scenario: Closed without merging defers

- **WHEN** a pull request is closed without being merged
- **THEN** none of its candidates are recorded as rejected
- **AND** they remain eligible to propose again

### Requirement: Merging is approval, and the merger is recorded

Merging a proposal pull request SHALL count as approving the candidates still present in it.
On promotion, `reviewed.by` SHALL name whoever merged and `reviewed.at` the merge date. Where
the merger was not an assigned reviewer, that SHALL be reported rather than attributed
silently.

#### Scenario: Merge promotes to active

- **WHEN** a proposal pull request is merged
- **THEN** its remaining entries become `status: active`
- **AND** `reviewed.by` names the merger and `reviewed.at` the merge date

#### Scenario: Author merges their own proposal

- **WHEN** the assigned author merges their own pull request
- **THEN** the entries are promoted and `reviewed.by` names them
- **AND** no approval from anyone else is required

#### Scenario: Merged by someone else

- **WHEN** the merger was not an assigned reviewer
- **THEN** the substitution is reported rather than recorded as though they were

### Requirement: Reconciliation happens on invocation, not on a timer

There is no daemon, so the tool SHALL reconcile outstanding proposals at invocation:
promoting what merged, recording what was rejected, and reporting pull requests that have gone
quiet past a configured window so they can be escalated to the store-level `reviewers`.

Where the destination repository promotes entries by its own automation at merge time,
reconciliation SHALL find nothing to promote and MUST NOT conflict with it.

#### Scenario: Merged proposal promoted on the next run

- **WHEN** a proposal was merged and the tool is next invoked
- **THEN** its entries are promoted to active

#### Scenario: Quiet pull request reported

- **WHEN** an open proposal has had no activity for longer than the configured window
- **THEN** it is reported with its assignees and the store reviewers to escalate to

#### Scenario: Already promoted by repository automation

- **WHEN** entries were already set active before reconciliation runs
- **THEN** reconciliation leaves them unchanged

### Requirement: A public destination refuses privately-sourced entries

Where the destination repository is public, proposing SHALL refuse candidates whose provenance
cites a private repository. The destination's visibility MAY be declared in configuration so
the check does not require a network call.

#### Scenario: Private provenance into a public store

- **WHEN** the destination is public and a candidate cites a private repository
- **THEN** proposing refuses and names the offending repository

#### Scenario: Private destination is unrestricted

- **WHEN** the destination is private
- **THEN** provenance from private repositories is accepted

