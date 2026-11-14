# lore-review Specification

## Purpose
Put a lore entry into force only after a person has reviewed it. Candidate entries are proposed
as pull requests to the lore repository, one per dominant author (whoever contributed most of the
sources an entry cites), with every other contributing author asked to review. The pull request
body states the contract: delete a file to reject that entry, edit it to amend, close the pull
request to defer, merge to approve the rest. This spec covers proposing; reconciling, which sets
each entry's status from what happened to its pull request and runs whenever `igor` is
invoked, including by a merge workflow; recording who approved; and refusing, for
a public lore repository, entries drawn from private sources.
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

The tool SHALL reconcile outstanding proposals when invoked: promote what merged, record what was
rejected, and report pull requests quiet past a configured window to escalate to the store's
`reviewers`. A merge-triggered job in the destination is such an invocation and SHALL run
reconciliation. A merge or any other event SHALL promote an entry only through reconciliation;
activating an entry by hand, the manual repair, is not an event. Reconciliation MUST be idempotent
over what it has settled.

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

#### Scenario: A merge that lands no entry file

- **WHEN** a proposal is merged with every candidate deleted on its branch, so that against the
  default branch the merge adds and modifies nothing under the store's entry path
- **THEN** reconciliation still runs on that merge, although it changed no entry file
- **AND** each deleted candidate is recorded as rejected

#### Scenario: Already promoted by repository automation

- **WHEN** entries were already set active before this reconciliation runs, by repository
  automation (the merge-triggered job's reconciliation) or by an earlier invocation
- **THEN** reconciliation leaves them unchanged
- **AND** records no second approval

### Requirement: A pull request proposes the entry files it adds

A pull request SHALL be recognized as proposing each entry file it puts in the store that the
default branch did not have, the new path of a rename included, whoever opened the pull request
and whatever its branch is called. It SHALL NOT be recognized as proposing an entry file it only
edits or removes.

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

Every change to an entry SHALL reach the default branch by pull request. Igor cannot enforce this,
so an entry committed without one is never promoted automatically. "Require a pull request before
merging" SHALL be recommended everywhere; "Require approvals" SHALL NOT be. Setup documentation
SHALL state this and what becomes of an entry committed directly. Activating one in place SHALL stay
available as a manual repair, recording its runner as approver; it MUST NOT be wired to an event.

#### Scenario: Entry committed straight to the default branch

- **WHEN** an entry file is pushed to the default branch without a pull request
- **THEN** no reconciliation promotes it
- **AND** it stays provisional and never fires

#### Scenario: Branch protection is recommended to a single writer

- **WHEN** a destination has one writer
- **THEN** requiring a pull request before merging is still recommended
- **AND** requiring approvals is still not, since GitHub lets nobody approve their own pull
  request

#### Scenario: Setup documentation states the consequence

- **WHEN** an operator reads how to set up a destination
- **THEN** it states that lore changes arrive by pull request
- **AND** that an entry committed directly stays provisional and never fires

#### Scenario: Manual promotion is attributable

- **WHEN** an entry that reached the default branch without a pull request is promoted by hand
- **THEN** whoever ran the promotion is recorded as having approved it

### Requirement: An entry already in the store is never overwritten by proposing

Proposing SHALL gate candidate ids against the store on the tree it commits onto, the default branch
at the sha the proposal is built on, rather than against the checkout it is run from. A candidate
whose id is taken there, by an entry or by a rejection, SHALL NOT be carried in the pull request.
The gate and the commit SHALL read that one sha. This governs the id space only: a behind checkout
is still behind on the configuration beside the store and on where the store is read from.

#### Scenario: A candidate whose id is already an entry on the default branch

- **WHEN** a candidate's id names an entry on the default branch that the proposing checkout
  does not have
- **THEN** that candidate is not proposed
- **AND** no pull request carries a modification to that entry

#### Scenario: A candidate whose id the default branch records as rejected

- **WHEN** the default branch records a rejection for a candidate's id and the checkout does not
  have it
- **THEN** that candidate is not proposed, as a rejected candidate never is

#### Scenario: The store is too large to read in one request

- **WHEN** the listing of a store directory comes back short of what it holds
- **THEN** proposing refuses rather than gating against part of the store

### Requirement: Minting an id checks the default branch and says when the id moved

Minting an id SHALL gate against the checkout and against the default branch's store, read when the
id is made. Where that branch cannot be read, minting SHALL report that and gate against the
checkout alone. Where minting hands out another id because the branch holds the name derived from
the entry's claim, it SHALL say so and whether an entry or a rejection holds the name. It SHALL stay
silent where the checkout holds that name in the same kind as the branch, and speak where the kinds
differ.

#### Scenario: An id minted on a behind checkout

- **WHEN** an id is created for a claim whose slug names an entry on the default branch, and the
  checkout does not have it
- **THEN** the id handed out is not that one
- **AND** the entry is written under an id that was free on that branch when it was read
- **AND** it is reported that an entry on that branch holds the name the claim derives, since the
  draft may be a second entry for a claim already made there

#### Scenario: A minted id whose name the default branch records as rejected

- **WHEN** an id is created for a claim whose slug names a rejection on the default branch, and
  the checkout does not have it
- **THEN** the id handed out is not that one
- **AND** it is reported that the name is rejected there and that such a claim is not proposed
  again, which proposing cannot refuse under the id that was handed out

#### Scenario: A name the checkout already holds in the same kind

- **WHEN** an id is created for a claim whose slug names an entry the checkout has, whether or
  not the default branch has it as well
- **THEN** the id handed out is not that one
- **AND** nothing is reported about the default branch, that entry being in front of the person
  already

#### Scenario: A name the checkout holds as an entry and the default branch as a rejection

- **WHEN** an id is created for a claim whose slug names an entry the checkout has and a
  rejection on the default branch
- **THEN** it is reported as a rejection, which is what the checkout cannot show

#### Scenario: The branch cannot be read while minting

- **WHEN** an id is created and the default branch cannot be read
- **THEN** what could not be checked is reported
- **AND** the id is gated against the checkout alone rather than against nothing
