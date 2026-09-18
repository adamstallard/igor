# lore-review Specification

## Purpose
TBD - created by archiving change lore-store. Update Purpose after archive.
## Requirements
### Requirement: Candidates are proposed as pull requests, one per dominant author

Proposing SHALL group candidates by their **dominant author** — the author contributing the
most provenance items — and open exactly one pull request per dominant author containing that
author's candidates, on a branch carrying a recognizable prefix. The prefix is a convention for
people reading a branch list; recognizing a pull request as a proposal MUST NOT depend on it.
Proposing SHALL work on any directory of candidate entries, whether mined or hand-authored.

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

No event SHALL promote an entry except through reconciliation. A merge-triggered job in the
destination repository is one such invocation and SHALL run reconciliation rather than a
mechanism of its own: a second promoter has a blind spot of its own to maintain, and the two
disagree about exactly the cases nobody is watching. Promotion by a person's own hand is not an
event and is covered below.

A pull request SHALL be recognized as a lore proposal by the entry files it **adds** to the
store — every path it puts there that the default branch did not have, including one arriving
as a rename, since an entry's filename is its id — whoever opened it and whatever its branch is
called. A proposal is defined by proposing an entry, not by which tool made the branch. A pull
request that only edits or removes an entry file SHALL NOT be recognized as proposing it:
editing changes a claim someone already approved and removing retires it, and neither is a
claim being put up for review.

Reconciliation MUST be idempotent over what it has already settled, because the merge-triggered
job and a person's local invocation sweep the same pull requests.

#### Scenario: Merged proposal promoted on the next run

- **WHEN** a proposal was merged and the tool is next invoked
- **THEN** its entries are promoted to active

#### Scenario: Quiet pull request reported

- **WHEN** an open proposal has had no activity for longer than the configured window
- **THEN** it is reported with its assignees and the store reviewers to escalate to

#### Scenario: A merge is an invocation

- **WHEN** a pull request adding entry files is merged into the default branch
- **THEN** the destination's merge-triggered job reconciles
- **AND** the entries it landed become active and every candidate the reviewer deleted is
  recorded as rejected

#### Scenario: A proposal nothing of ours opened

- **WHEN** a pull request adding an entry file is merged from a branch with no proposal prefix,
  opened by hand
- **THEN** it is reconciled as a proposal like any other

#### Scenario: A pull request that only edits entry files

- **WHEN** a pull request that edits existing entry files for an unrelated reason — a formatting
  sweep, a renamed term — is merged into the default branch
- **THEN** it is not a proposal, and the entries it edited keep the status they had

#### Scenario: An entry that replaces a retired one

- **WHEN** a merged pull request deletes an entry file and adds a new one close enough to it
  that the change is reported as a rename
- **THEN** the new entry is proposed and promoted, because its filename is an id nothing has
  reviewed

#### Scenario: A merge that lands no entry file

- **WHEN** a proposal is merged with every candidate deleted, so the merge adds and modifies
  nothing under the store's entry path
- **THEN** reconciliation still runs on that merge
- **AND** each deleted candidate is recorded as rejected

#### Scenario: Already promoted by repository automation

- **WHEN** entries were already set active before reconciliation runs — by the merge-triggered
  job, or by an earlier invocation
- **THEN** reconciliation leaves them unchanged
- **AND** records no second approval

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

### Requirement: Lore reaches the default branch by pull request

Every change to an entry SHALL arrive on the default branch through a pull request.
Reconciliation sweeps pull requests, so an entry that never had one is an entry nothing will
ever promote: it stays `provisional`, and only active entries fire. The remaining blind spot is
closed by requiring the pull request, not by adding a mechanism that watches for commits
without one — that mechanism is the one being retired.

"Require a pull request before merging" SHALL be recommended to every destination, including
one with a single writer. It still lets an author merge their own proposal, and it is what
makes the promotion path total rather than a courtesy between collaborators. "Require
approvals" SHALL NOT be recommended: GitHub refuses to let anyone approve their own pull
request, which hard-blocks a solo maintainer.

Setup documentation SHALL state the requirement and what becomes of an entry committed
directly, where a destination is being set up. Discovered any other way, it is discovered by
noticing lore that never fires.

Promoting an entry in place SHALL remain available as a manual repair for one already on the
default branch without a pull request, recording whoever ran it as the approver. It is invoked
by a person and MUST NOT be wired to an event.

#### Scenario: Entry committed straight to the default branch

- **WHEN** an entry file is pushed to the default branch without a pull request
- **THEN** no reconciliation promotes it
- **AND** it stays provisional and never fires

#### Scenario: Branch protection is recommended to a single writer

- **WHEN** a destination has one writer
- **THEN** requiring a pull request before merging is still recommended
- **AND** requiring approvals is still not

#### Scenario: Setup documentation states the consequence

- **WHEN** an operator reads how to set up a destination
- **THEN** it states that lore changes arrive by pull request
- **AND** that an entry committed directly stays provisional and never fires

#### Scenario: Manual promotion is attributable

- **WHEN** an entry that reached the default branch without a pull request is promoted by hand
- **THEN** whoever ran the promotion is recorded as having approved it

