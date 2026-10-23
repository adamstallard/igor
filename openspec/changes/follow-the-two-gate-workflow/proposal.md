## Why

This project works in two gates. A person reviews a specification first: an OpenSpec proposal,
design, spec deltas and tasks. Only then does the implementation land, **on the same branch**,
followed by a bug hunt, a second review and the merge. It never uses a second pull request.
Adam wants Igors to work the same way ([#149](https://github.com/adamstallard/igor/issues/149)).

An Igor can't today. Its run has one shape: claim, work, publish everything the worker changed,
release. Each part of the workflow runs into something built for that shape.

- **Nothing confines a run to a specification.** The loop publishes whatever the worker changed.
- **It can't resume.** Once its pull request exists the item reports work in flight, and that
  skip is universal. Its only exception is an Igor's own artifact that stopped merging, so an
  approved spec is invisible to it.
- **It can't revise.** Nothing reads a review on its own pull request, and the only commit it
  can put on an existing branch is a conflict resolution.
- **It closes the issue too early.** Every artifact carries `Closes #n`, so merging a spec after
  gate one alone would close the issue with nothing built.
- **Its pull request can't describe itself.** The title is the issue title and the body is a
  transcript excerpt. Neither can say "specification only", and nothing changes either when
  the code lands.

## What Changes

Everything below applies only to a role that opts in, and was decided by Adam on 2026-09-28.

- **A role opts in with `workflow: two-gate`.** A role without it behaves exactly as today.
- **Gate one publishes a specification and nothing else.** The worker is asked for an OpenSpec
  change. The loop, not the worker's instructions, publishes only paths under
  `openspec/changes/**` and names everything it dropped. A run left with nothing under that
  path publishes nothing and hands off.
- **A gate-one pull request says what it is and closes nothing.** Its title carries a
  specification marker, its body opens by saying it is specification only, and it refers to its
  item without a closing keyword. Gate one releases the claim, and does not take the role's
  completion action.
- **The go signal is an approving review** on the spec pull request, from a person with
  authority over the repository: the store's `reviewers`, or anyone with write access (§5.4). It
  is structured data, and no text is interpreted. A review from an Igor never counts: every
  Igor is a GitHub App, so its review's author is a `Bot` account.
- **A change request is answered on the same branch.** The Igor reads the review as data,
  amends the spec, commits onto the branch, replies to the review and asks for it again.
- **Gate two implements on the same branch.** After approval: a fresh claim on the item, the
  implementation of the change's tasks, bug-hunter where configured (#139), then a new title and
  body that describe the code as well as the spec and now carry the closing keyword. Then the
  pull request goes back for the second review.
- **The in-flight skip gains a second exception.** An Igor's own gate-one artifact carrying a
  current approval or change request is resumed rather than skipped, as an artifact of its own
  that stopped merging already is.

Also specified, each as its own requirement so it can be dropped at review, and each an open
question in `design.md`:

- A change request at gate two is answered the same way, without the gate-one confinement.
- A spec pull request merged before gate two ran defers its item and asks why, as a closed one
  does under #141.

Explicitly out of scope:

- **Running bug-hunter.** #139 makes it a pipeline step, and gate two invokes that step where
  it is configured.
- **Merging.** A person merges after the second review, as today.
- **Any workflow other than two-gate.** The setting names a workflow so that another could be
  added, not because one is planned.

## Capabilities

### New Capabilities

- `two-gate-workflow`: what gate one publishes and how it describes itself; the go signal and
  who may give it; revising on a change request; gate two on the same branch; a spec pull
  request closed or merged before gate two.

### Modified Capabilities

- `work-triage`: the in-flight skip admits an Igor's own gate-one artifact carrying a current
  decisive review, alongside its own artifact that cannot merge.
- `task-execution`: an artifact carries every change the worker made, except where gate one
  confines it to the specification path.
- `role-config`: a role may declare `workflow: two-gate`.

## Impact

- The loop gains a way to commit onto an existing branch as an ordinary change, not only as a
  merge, and a way to edit a pull request's title and body.
- The GitHub adapter reads reviews and the head commit of an artifact in the discovery request
  it already makes. It also makes one permission read per reviewer, cached for the cycle. That
  read is shared with `directed-interaction`, which needs it and has not built it.
- A two-gate item costs two worker runs instead of one, plus one for each round of changes. Each
  goes through the budget gate as a separate spend.
- Every Igor is a GitHub App (`one-claiming-surface`, #156), so a pull request an Igor opens is
  authored by its App, and any person with authority can approve it.
