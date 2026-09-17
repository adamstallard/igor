## MODIFIED Requirements

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

#### Scenario: Reconciling what is already settled changes nothing

- **WHEN** entries were already set active before reconciliation runs — by the merge-triggered
  job, or by an earlier invocation
- **THEN** reconciliation leaves them unchanged
- **AND** records no second approval

## ADDED Requirements

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
