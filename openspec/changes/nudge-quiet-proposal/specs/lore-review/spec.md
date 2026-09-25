## ADDED Requirements

### Requirement: A quiet proposal is told so on its own pull request

Where reconciliation finds an open proposal that has gone quiet past the window, it SHALL post a
comment on that pull request saying so. The comment SHALL be posted on every invocation path —
the destination's merge-triggered job and a person's own — because which of them ran is not
something the assignees can see and not something the proposal's fate should depend on.

A comment is the whole of the surface. Reconciliation MUST NOT open an issue, a discussion or
any other item of its own to carry the report, and the destination's merge-triggered template
MUST NOT be granted permission to open one.

The comment MUST NOT @mention anyone, on the grounds bodies already MUST NOT: assignment is what
notifies, and the assignees are subscribed to the pull request already. Where a proposal has no
assignees at all the comment SHALL still be posted, and the run SHALL report that nobody was
notified rather than leaving the reader to infer it from an empty assignee list.

The stdout report SHALL remain exactly as it is. Whoever typed the command is present, and the
comment is not for them.

#### Scenario: Quiet proposal reached from the merge-triggered job

- **WHEN** reconciliation runs in the destination's merge-triggered job and finds an open
  proposal quiet past the window
- **THEN** a comment saying so appears on that pull request
- **AND** no issue or other item is opened anywhere

#### Scenario: Quiet proposal reached from a terminal

- **WHEN** a person runs reconciliation and it finds the same quiet proposal
- **THEN** the comment is posted just as the job would have posted it
- **AND** the stale line is still printed to stdout

#### Scenario: Nobody is assigned

- **WHEN** a quiet proposal has no assignees
- **THEN** the comment is posted anyway
- **AND** the run states that nobody was notified

#### Scenario: Nobody is mentioned

- **WHEN** the comment addresses the proposal's assignees
- **THEN** it names them as plain text and contains no @mention

### Requirement: One nudge per quiet spell, and the comment is the record

Reconciliation runs on every merge into the destination's default branch and again whenever a
person invokes it, and reaches the same conclusion about the same quiet proposal every time. It
SHALL comment at most once per quiet spell. Re-announcing is how a surface gets muted, and a
muted surface is the defect being fixed.

Whether it has already spoken SHALL be read back from the pull request's own comments, not from
a note kept anywhere else: the comment is the record. This is the shape reconciliation already
uses for what merged and what a reviewer deleted.

Reconciliation SHALL recognize its own nudge by what the comment carries rather than by who
authored it. The merge-triggered job comments as the job's actor and a person's local invocation
comments as that person, so the same nudge from the same code has different authors, and an
author test would nudge twice on the two paths this rule exists to reconcile.

A nudge SHALL NOT count as activity on the proposal. Posting it moves the pull request's
activity timestamp, and reconciliation SHALL NOT read that movement either as the proposal
having become active — the report SHALL go on stating when the proposal went quiet, never when
reconciliation last spoke — or as the activity a later quiet spell is measured from.

A second nudge SHALL follow only where the pull request has been active since the last nudge, at
an instant strictly later than it, and has then gone quiet past the window again. The subject is
the quiet spell rather than the pull request: a proposal nobody answers is told once, and a
proposal that is answered and then abandoned again is told again.

#### Scenario: Many runs, one comment

- **WHEN** five merges land in a day and the job reconciles on each
- **THEN** the quiet proposal carries one nudge, not five

#### Scenario: A local sweep adds nothing to what the job said

- **WHEN** a person reconciles after the merge-triggered job has already nudged a proposal
- **THEN** no second comment is posted

#### Scenario: A nudge posted under a person's own credential is still ours

- **WHEN** the nudge on a quiet proposal was posted by a person's local invocation, and so is
  authored by that person rather than by the job's actor
- **THEN** a later run recognizes it as the nudge already posted
- **AND** posts no second one

#### Scenario: A nudge does not make a proposal look active

- **WHEN** the only activity on a proposal since it went quiet is reconciliation's own nudge
- **THEN** the run still reports it as quiet
- **AND** states the date it went quiet, not the date of the nudge

#### Scenario: Answered, then quiet again

- **WHEN** an assignee replies to the nudge, and the proposal then goes quiet past the window
  again
- **THEN** a second nudge is posted

#### Scenario: Ignored forever

- **WHEN** nobody responds to a nudge for a year
- **THEN** no further comment is ever posted
- **AND** the proposal continues to be reported to stdout on every run

### Requirement: The nudge distinguishes approving, rejecting and deferring

The comment SHALL state all three ways the proposal can end and SHALL distinguish them: merging
approves every candidate still present; deleting a candidate's file and then merging rejects
those candidates permanently, and a rejected candidate is never proposed again; closing without
merging defers, rejecting nothing and leaving every candidate eligible to be proposed again.

It SHALL say which of the three cannot be undone, and MUST NOT present them as interchangeable
ways of clearing the pull request. A nudge arrives precisely when somebody has stopped paying
attention to this proposal, which is when the nearest gesture is the one that gets made, and one
of the three is irreversible.

It SHALL say when the proposal went quiet and how long ago that was, so the comment is readable
on its own by somebody who did not see the run that posted it. It SHALL name the store-level
`reviewers` as who else can act where the assignees cannot, or say that none are configured.

#### Scenario: All three endings are stated

- **WHEN** a nudge is posted
- **THEN** it states that merging approves, that deleting a candidate's file and then merging
  rejects it, and that closing without merging defers

#### Scenario: The irreversible one is marked as irreversible

- **WHEN** the nudge describes deleting a candidate's file and merging
- **THEN** it states that the rejection is permanent and that the candidate is never proposed
  again

#### Scenario: Deferring is stated as reversible

- **WHEN** the nudge describes closing without merging
- **THEN** it states that nothing is rejected and the candidates may be proposed again

#### Scenario: The comment stands on its own

- **WHEN** somebody reads the nudge months later
- **THEN** it says when the proposal went quiet and how long it had been quiet when the nudge was
  posted
- **AND** names the store reviewers, or says that none are configured

### Requirement: A nudge that cannot be posted fails the run

Reconciliation SHALL finish the promotions and rejections it owes whether or not it can comment:
those are not waiting on a message to a person.

Where a nudge cannot be posted, reconciliation SHALL report the failure naming what it needs —
the permission to comment on a pull request, where that is what is missing — and SHALL exit
non-zero. Reporting it to the log of a run that succeeded would be this change's own bug: the
merge-triggered job's green log is the surface being replaced, and a failed run is a surface
people do look at.

Nothing SHALL record the nudge as delivered, so the next invocation attempts it again once the
cause is cured.

The destination's merge-triggered template SHALL grant the permission commenting on a pull
request needs, and SHALL NOT grant permission to open items.

#### Scenario: The template cannot comment yet

- **WHEN** the job's token may read pull requests but not write to them
- **THEN** the merged entries are still promoted and the deleted candidates still recorded as
  rejected
- **AND** the run names the missing permission and exits non-zero

#### Scenario: The next run tries again

- **WHEN** the permission is granted after a run failed to nudge
- **THEN** the next run posts the nudge

#### Scenario: The template opens nothing

- **WHEN** the template's permissions are read
- **THEN** they allow commenting on a pull request
- **AND** grant nothing that would let the job open an issue
