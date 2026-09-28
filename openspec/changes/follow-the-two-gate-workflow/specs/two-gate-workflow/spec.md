## ADDED Requirements

### Requirement: Gate one publishes a specification and nothing else

For a role whose effective `workflow` is `two-gate`, an item's first run SHALL ask the worker,
through the trusted instruction channel, for an OpenSpec change under `openspec/changes/`. The
loop SHALL publish only changed paths under `openspec/changes/**`, measured from the
repository's root, whatever the worker changed and whatever its instructions said.

Every other change the worker made SHALL be dropped and recorded as a refusal. That covers a
path added, modified or removed, and each side of a rename. The paths dropped SHALL be named at
the top of the artifact's body and in the report on the item. Where nothing under
`openspec/changes/**` remains, nothing SHALL be published, and the item SHALL be handed off
naming what was dropped.

#### Scenario: A code change at gate one is dropped and named

- **WHEN** a gate-one worker writes a change under `openspec/changes/` and also edits a file
  under `src/`
- **THEN** the artifact carries the specification and not the `src/` edit
- **AND** the `src/` path is named as dropped at the top of the body and in the report

#### Scenario: A removal outside the path is dropped, not carried

- **WHEN** a gate-one worker removes a file outside `openspec/changes/`
- **THEN** the file is still present on the artifact's branch
- **AND** the removal is named as dropped

#### Scenario: A rename across the boundary is split and named

- **WHEN** a gate-one worker renames a file from outside `openspec/changes/` to a path inside it
- **THEN** the artifact carries the new path, and the old path is left as the base holds it
- **AND** both paths are named, the removal as dropped

#### Scenario: Nothing under the path means nothing published

- **WHEN** every change a gate-one worker made is outside `openspec/changes/`
- **THEN** no artifact is published
- **AND** the item is handed off naming what was dropped, not reported as having nothing to do

#### Scenario: The confinement holds against the worker's instructions

- **WHEN** the item, a review, or anything else the worker read asks it to implement at gate one
- **THEN** whatever it implements outside `openspec/changes/` is still dropped

#### Scenario: A one-gate role is unaffected

- **WHEN** a role does not declare `workflow: two-gate`
- **THEN** every change the worker made is carried, as before

#### Scenario: Catching up a spec carries the base's own changes

- **WHEN** a gate-one artifact that stopped merging is brought up to date, and the base changed
  paths outside `openspec/changes/`
- **THEN** the merge carries the base's changes
- **AND** the confinement applies only to what the worker changed on top of the merge

### Requirement: A gate-one artifact says it is a specification and closes nothing

A gate-one artifact's title SHALL carry a marker saying it is a specification. Its body SHALL
open by saying it is specification only and nothing outside `openspec/changes/` is included.
It SHALL refer to its item through the tracker adapter's non-closing reference.

No gate-one artifact, commit on its branch, or body SHALL carry a closing keyword the code host
honours for the item, whatever its source: the adapter's linkage, the worker's output, or the
item's own title used as a commit message.

#### Scenario: The title and body say what the artifact is

- **WHEN** gate one publishes an artifact
- **THEN** its title carries the specification marker
- **AND** its body opens by saying it is specification only

#### Scenario: The item is referenced, not closed

- **WHEN** gate one publishes an artifact for a GitHub issue
- **THEN** the body refers to the issue without a closing keyword
- **AND** the issue reports the artifact as work in flight

#### Scenario: A closing keyword in the worker's output is not carried

- **WHEN** a gate-one worker's final message says `Fixes #12` for the item it is working
- **THEN** the artifact's body carries no closing keyword for that item

#### Scenario: A closing keyword in the item's title is not carried

- **WHEN** a gate-one item's title contains a closing keyword for itself
- **THEN** neither the commit message nor the body carries it as a closing keyword

#### Scenario: Merging a spec alone closes nothing

- **WHEN** a gate-one artifact is merged before gate two runs
- **THEN** the item stays open

### Requirement: Gate one ends with a release, not a completion

When gate one publishes, the Igor SHALL release its claim on the item and SHALL NOT take the
role's configured completion action. The completion action SHALL be taken when gate two
publishes.

#### Scenario: A role that closes on completion does not close at gate one

- **WHEN** a two-gate role with `completion: close` publishes a gate-one artifact
- **THEN** the claim is released and the item stays open

#### Scenario: The completion action waits for gate two

- **WHEN** gate two publishes for the same item
- **THEN** the role's completion action is taken

### Requirement: An approving review from someone with authority is the go signal

Gate two SHALL start only on an **actionable approval** on the Igor's own open gate-one
artifact. An approval is actionable when all of these hold:

- it is the latest decisive review by its author, where a decisive review approves or requests
  changes;
- its author has authority, meaning the store's `reviewers` names them or they have write
  access to the repository;
- it is current, meaning no commit that is not a merge of the base has landed on the
  artifact's branch since it was submitted;
- it is unanswered, meaning the Igor has not posted a hand-back reply on the artifact that names
  that review. Nothing else the Igor or anyone else posts answers a review;
- no actionable change request stands beside it, where a change request is actionable on the
  same terms.

A review's author SHALL be read from the code host's metadata. Authority SHALL be read from the
host's permission data and SHALL fail closed: an author whose authority can't be read has none.

Nothing else SHALL start gate two. That includes a comment, a mention, a comment-only review, a
dismissed review, and any text in a review's body. An approval with no activity on the item
itself SHALL still be found.

#### Scenario: An approval from someone with write access starts gate two

- **WHEN** someone with write access approves the Igor's gate-one artifact, and nothing has
  landed on it since
- **THEN** gate two starts on the next cycle

#### Scenario: An approval from a store reviewer without write access starts gate two

- **WHEN** someone named in the store's `reviewers`, without write access, approves
- **THEN** gate two starts

#### Scenario: An approval from someone without authority does nothing

- **WHEN** someone with neither write access nor a place in the store's `reviewers` approves
- **THEN** gate two does not start, and nothing is said

#### Scenario: An unreadable permission is no authority

- **WHEN** the reviewer's permission cannot be read
- **THEN** gate two does not start in that cycle

#### Scenario: Other posts on the artifact do not answer an approval

- **WHEN** after an approval, the Igor answers a mention on the artifact, or someone else comments
  on it
- **THEN** the approval is still unanswered, and gate two starts

#### Scenario: A comment saying go is not a go

- **WHEN** someone with write access comments "LGTM, go ahead" or mentions the Igor saying so,
  without an approving review
- **THEN** gate two does not start

#### Scenario: A change request outweighs an approval

- **WHEN** one person with authority approves and another requests changes, and both are current
  and unanswered
- **THEN** the Igor revises, and gate two does not start

#### Scenario: A revision supersedes an earlier approval

- **WHEN** an approval was given before the Igor's latest revision landed
- **THEN** it is not current, and gate two waits for an approval of the revised spec

#### Scenario: A merge of the base does not supersede an approval

- **WHEN** an approval was given, and afterwards only a merge of the base landed on the branch
- **THEN** the approval is still current, and gate two starts

#### Scenario: An approval with the item untouched is still found

- **WHEN** an approval lands on the artifact and the item has had no activity since gate one
- **THEN** the approval is found, and gate two starts

#### Scenario: An approval with comments is still a go

- **WHEN** an approving review carries a body or inline comments
- **THEN** gate two starts
- **AND** the comments are passed to the worker as untrusted data

#### Scenario: Somebody else's spec is not resumed

- **WHEN** an approval lands on a gate-one-shaped artifact another party opened
- **THEN** the Igor does not act on it

### Requirement: A change request is answered on the same branch

Where the Igor's own open gate-one artifact carries an actionable change request, the Igor
SHALL take a claim on the item and provision a tree at the artifact's branch. It SHALL give the
worker the review's body and inline comments, delimited as untrusted data. It SHALL publish
the revision as a commit on the existing branch, confined as gate one is.

After the revision the Igor SHALL reply on the artifact, naming each change request it answers
and saying what changed. It SHALL ask everyone whose change request it answered to review again,
and SHALL release the claim.

Where the revision leaves nothing to publish, the Igor SHALL reply on the artifact, naming each
change request it answers and saying why it could not revise, and SHALL hand the item off. That
reply answers those change requests and no other review, so the same change request SHALL NOT be
acted on again.

#### Scenario: A requested change is made on the branch that exists

- **WHEN** someone with authority requests changes on the Igor's gate-one artifact
- **THEN** the worker revises the spec in a tree at that artifact's branch
- **AND** the revision is a commit on that branch, and no new artifact is opened

#### Scenario: The reviewer is answered and asked again

- **WHEN** a revision has been committed
- **THEN** a reply on the artifact says what changed
- **AND** the reviewer who requested changes is asked to review again

#### Scenario: A review asking for code does not lift the confinement

- **WHEN** a change request asks the Igor to implement as well
- **THEN** the revision still carries nothing outside `openspec/changes/`

#### Scenario: A revision that changes nothing ends the round

- **WHEN** the worker makes no change under `openspec/changes/` in answer to a change request
- **THEN** nothing is committed, and a reply on the artifact names the change request and says
  why the Igor could not revise
- **AND** the same change request is not acted on again, and the Igor waits for a new review

#### Scenario: An approval beside an unrevisable change request is not answered by the reply

- **WHEN** a change request and an approval were both current, and the revision changed nothing
- **THEN** the reply answers the change request only
- **AND** on a later cycle the approval is actionable, and gate two starts

#### Scenario: A revised spec waits for its next review

- **WHEN** a revision has been committed
- **THEN** the change request it answered is no longer current
- **AND** nothing further happens until another decisive review is submitted

### Requirement: Gate two implements on the same branch

On an actionable approval, the Igor SHALL take a fresh claim on the item and provision a tree at
the artifact's branch. It SHALL ask the worker to implement the tasks of the change the
artifact carries, passing the approving review's body and inline comments as untrusted data.
Gate one's confinement SHALL NOT apply, and the role's action space SHALL.

Where the role configures bug-hunter as a pipeline step, gate two SHALL run it after the
implementation and before publishing.

Gate two SHALL publish as a commit on the existing branch. It SHALL then replace the artifact's
title and body:

- the title SHALL drop the specification marker;
- the body SHALL describe the implementation as well as the specification;
- the body SHALL carry the tracker adapter's linkage for the item, which may close it.

Where the item was edited after the approval, the body SHALL say so and link the item.

The Igor SHALL then request review, release the claim, and take the role's completion action.
Gate two is a spend, and SHALL start only where the budget gate names a seat for it.

Where gate two leaves nothing to publish outside `openspec/changes/`, the Igor SHALL publish
nothing and SHALL leave the title and body as they are. It SHALL reply on the artifact, naming
the approval it answers and saying why, and SHALL hand the item off. The same approval SHALL NOT
be acted on again.

#### Scenario: Gate two lands on the spec's branch

- **WHEN** gate two runs for an approved spec
- **THEN** the implementation is a commit on the spec's branch
- **AND** no second artifact is opened

#### Scenario: Gate two takes a claim people can see

- **WHEN** gate two starts
- **THEN** the item is claimed as any pickup is, and the claim message names the artifact being
  resumed

#### Scenario: The title and body stop saying specification only

- **WHEN** gate two has published
- **THEN** the title carries no specification marker
- **AND** the body describes the code as well as the spec, and carries the item's linkage

#### Scenario: Bug-hunter runs where configured

- **WHEN** the role configures bug-hunter as a pipeline step
- **THEN** it runs over gate two's changes before they are published

#### Scenario: An item edited between the gates is noted, not re-asked

- **WHEN** the item was edited after the spec was approved
- **THEN** gate two proceeds
- **AND** the body says the item changed after the approval, and links it

#### Scenario: No seat, no gate two

- **WHEN** an approval is actionable and the budget gate names no seat
- **THEN** nothing is claimed and no worker runs
- **AND** the approval is still actionable on a later cycle, with nothing recorded against the
  item

#### Scenario: An implementation confined to the spec path is not published

- **WHEN** gate two's worker changes nothing outside `openspec/changes/`
- **THEN** nothing is published and the title and body are unchanged
- **AND** a reply on the artifact says why, the item is handed off, and the same approval is not
  acted on again

#### Scenario: A stop binds gate two

- **WHEN** anyone says stop on the item while gate two runs
- **THEN** the claim is released and nothing is published, as for any run

### Requirement: A resumed item passes the stop gate and the deferral gate

A two-gate item resumed for a revision or for gate two SHALL pass the universal skips, the stop
gate and the deferral gate before it is claimed, and the role's lane predicates SHALL apply. No
model triage call SHALL be made for it, and it SHALL NOT hold any source's watermark.

#### Scenario: A stopped item is not resumed

- **WHEN** an approval is actionable but the item was stopped within its cooldown
- **THEN** gate two does not start

#### Scenario: An item someone else took is not resumed

- **WHEN** an approval is actionable but the item is now held by another party
- **THEN** gate two does not start

#### Scenario: A lane exclusion added between the gates is honoured

- **WHEN** the item gained a label the role's lane excludes after gate one
- **THEN** gate two does not start

#### Scenario: Resuming costs no triage call

- **WHEN** an item is resumed for gate two
- **THEN** no triage model call is made for it

#### Scenario: A conflicting spec is caught up before it is resumed

- **WHEN** an approved gate-one artifact also cannot merge
- **THEN** it is brought up to date first
- **AND** gate two starts on a later cycle, the approval still being current

### Requirement: A closed spec pull request is never resumed

A gate-one artifact closed without being merged SHALL NOT be resumed for a revision or for gate
two, whatever reviews it carries. Where a rule for an Igor's own pull request closed without
merging is in force, it SHALL apply to a closed gate-one artifact unchanged.

#### Scenario: An approval on a closed spec does nothing

- **WHEN** a gate-one artifact carrying an actionable approval is closed without merging
- **THEN** gate two does not start

### Requirement: A change request at gate two is answered on the same branch

Where the Igor's own open artifact is past gate one and carries an actionable change request,
the Igor SHALL revise it on the same branch as a change request at gate one is answered. The
differences are that gate one's confinement SHALL NOT apply, and the title and body SHALL be
updated to describe what the artifact now carries.

#### Scenario: A requested change to the code is made on the branch

- **WHEN** someone with authority requests changes after gate two published
- **THEN** the worker revises in a tree at the artifact's branch, and the revision is a commit on
  it
- **AND** the reviewer is answered and asked to review again

#### Scenario: A gate-two revision may touch code

- **WHEN** the requested change is to a file under `src/`
- **THEN** the revision carries it

### Requirement: A spec pull request merged before gate two defers its item

Where the Igor's own gate-one artifact is merged before gate two published, the Igor SHALL NOT
start another gate one for the item. It SHALL say on the item, once, that the specification was
merged with nothing built and ask whether to build it. The item SHALL stay deferred until
someone with write access answers.

#### Scenario: A merged spec is not specified again

- **WHEN** an item's gate-one artifact was merged and the item is rediscovered
- **THEN** no second gate-one artifact is opened
- **AND** the Igor asks once whether to build it

#### Scenario: An answer from someone with write access restarts it

- **WHEN** someone with write access replies on the item
- **THEN** it may be worked again
