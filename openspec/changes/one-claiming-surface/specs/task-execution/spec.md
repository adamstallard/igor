## MODIFIED Requirements

### Requirement: Work finished before a claim is lost is offered, not discarded

Where a claim is found to be gone between the worker finishing and publication, execution SHALL
distinguish a stop from a loss. A stop SHALL publish nothing. A loss SHALL publish what exists
as a draft, request no reviewers, and leave a message naming what exists.

Someone taking an item over is saying they are taking it, not that the work so far should be
destroyed. The working tree is disposable by design, so discarding it at this point is
unrecoverable: the transcript records that a change was made and not the change itself.

An Igor that has lost an item must not then appear in anyone's review queue over it, which is
why nothing is requested of the new holder.

#### Scenario: A stop still publishes nothing

- **WHEN** the claim was stopped during execution
- **THEN** nothing is published
- **AND** the refusal names the stop

#### Scenario: A loss publishes a draft

- **WHEN** another party holds the item by the time the worker finishes
- **THEN** what the worker produced is published as a draft
- **AND** no reviewers are requested

#### Scenario: The new holder is told what exists

- **WHEN** work is published after a claim was lost
- **THEN** a message on the item names the artifact and says it is theirs to keep, continue, or
  discard

#### Scenario: A role that may not publish still may not

- **WHEN** a claim is lost and the role's allow list permits no pull request
- **THEN** nothing is published, and the refusal is recorded as it would be otherwise

#### Scenario: Losing a claim does not finish the item

- **WHEN** work is published after a claim was lost
- **THEN** the Igor releases only its own claim and does nothing else to the item, because the
  item is not the Igor's to finish

## ADDED Requirements

### Requirement: A person approves every Igor pull request

A pull request an Igor opened SHALL be reviewed and approved by a person before it merges. An
Igor SHALL NOT merge a pull request it opened, and an approval from any Igor SHALL NOT count as
that person's approval, whatever the code host's branch protection accepts.

#### Scenario: Igor does not merge its own pull request

- **WHEN** an Igor's own pull request is approved and mergeable
- **THEN** the Igor does not merge it

#### Scenario: Another Igor's approval is not enough

- **WHEN** an Igor's pull request carries an approving review from another Igor and none from a person
- **THEN** no Igor merges it

## REMOVED Requirements

### Requirement: Completion behaviour follows configured policy

**Reason**: A finished run always releases its claim, which was the default this requirement let a
role override. Under label claiming the other actions, `close` and `assign`, existed only to be
refused, so the policy had nothing left to choose (Adam, 2026-10-11). *A claim that cannot be kept
is given back, out loud* in `work-claiming` says a finished run releases its claim and leaves its
artifact in place.

**Migration**: Delete `completion` from role files. A role file that still sets it is refused as
any key that is not a role key is.
