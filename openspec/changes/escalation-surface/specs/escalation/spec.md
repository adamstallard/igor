## ADDED Requirements

### Requirement: A conclusion nobody is present for is raised as an issue in the destination

Where Igor concludes something only a person can act on and no person is in the loop, it SHALL
raise that conclusion as an issue in the destination repository. A run log, a job step summary,
and a file committed to the store MUST NOT be the only surface carrying it.

Every producer SHALL raise onto this one surface, so that the destination's open escalations
are the whole of what is waiting on a person. Two places to watch is the same as none.

Where a producer also has a reader present — somebody who typed the command and is reading its
output — it SHALL keep reporting to them as well. Standard output is not wrong; it is
incomplete, and it is incomplete exactly when nobody typed anything.

#### Scenario: A quiet proposal reaches somebody

- **WHEN** reconciliation finds an open proposal with no activity for longer than the window
- **THEN** an escalation is raised in the destination naming the pull request, its assignees
  and the store reviewers

#### Scenario: A stopped scope reaches somebody, having no pull request to attach to

- **WHEN** a recurring condition stops a scope from taking new items
- **THEN** an escalation is raised in the destination naming the cure key and what would change
  it, without requiring any pull request, item or thread to exist

#### Scenario: Both producers land in one list

- **WHEN** a proposal is quiet and a scope is stopped at the same time
- **THEN** both are open escalations in the same destination, and an operator reading that one
  list sees everything waiting

#### Scenario: A person at a terminal still gets the report

- **WHEN** somebody runs reconciliation by hand and a proposal is quiet
- **THEN** the quiet proposal is reported on standard output as before, and the escalation is
  the same one surface rather than a second

### Requirement: An open escalation is the record that the thing has already been said

Before raising, a producer SHALL look for an escalation carrying the same subject, and where an
open one exists it SHALL raise nothing and write nothing further. The escalation's own state
SHALL be that record; no separate file SHALL be kept saying what has been announced.

The producers run on every merge and every poll and reach the same conclusion every time. A
surface that repeats itself is one people mute, and a muted surface is the defect this exists
to fix. Reading the surface back is also what `reconcile` already does with pull requests
rather than keeping a note of its own, and a note would be a second thing to get wrong.

#### Scenario: The second run says nothing

- **WHEN** a producer reaches a conclusion it has an open escalation for
- **THEN** it raises nothing, comments nothing, and the existing escalation is untouched

#### Scenario: Losing local state does not duplicate

- **WHEN** the state branch is wiped and a producer runs against a still-quiet proposal
- **THEN** no second escalation is raised, because the record is the issue in the destination
  rather than anything local

#### Scenario: A race is settled, not prevented

- **WHEN** two producers raise for the same subject before either sees the other's
- **THEN** the next run closes all but the oldest, naming it as the duplicate it is

### Requirement: A subject is one occurrence, so a fact that recurs can be raised again

An escalation's subject SHALL identify the occurrence and not merely the thing it is about: a
quiet proposal by its pull request together with the last activity it went quiet from, and a
stopped scope by its cure key together with that occurrence's opening.

A cure key opens, clears and reopens over its life. Keyed on the cure key alone, a condition
that cleared months ago and has recurred would match the closed escalation from last time and
stay silent while the fleet sits stopped — the surface failing in exactly the case it exists
for.

#### Scenario: A condition that cleared and recurred is raised again

- **WHEN** a condition on one cure key was escalated, cleared, and later recurs
- **THEN** a new escalation is raised, because it is a new occurrence of that cure

#### Scenario: A proposal that moved and went quiet again is raised again

- **WHEN** an escalated proposal receives a review comment and then goes quiet past the window
  once more
- **THEN** a new escalation is raised, because the activity it went quiet from has changed

#### Scenario: One condition, however many probes

- **WHEN** a stopped scope probes, meets the condition again, and stops for a longer cooldown
- **THEN** the escalation stays open and unchanged, because the condition never closed

### Requirement: Closing an escalation is the answer, and the unchanged fact raises no other

A person closing an escalation SHALL end it, and while its subject is unchanged no further
escalation SHALL be raised for that subject. Nothing SHALL require a person to reply in any
particular form, apply any label, or send any signal shaped for Igor.

Closing is the gesture a person already knows for "seen", and treating it as the answer is the
shape the deferral machinery already has, where a reply from anybody other than the Igor lifts
a deferral and nothing waits to be told in a special way. An operator who closes an escalation
without curing anything gets silence, deliberately: the alternative is a surface they mute.

#### Scenario: Closed and still quiet stays closed

- **WHEN** somebody closes an escalation and its subject is still in the state that raised it
- **THEN** no escalation is raised for that subject again, and it is not reopened

#### Scenario: Closing and nudging re-arms the subject

- **WHEN** somebody closes an escalation and comments on the quiet pull request, and it later
  goes quiet past the window again
- **THEN** a new escalation is raised, because the subject changed and then recurred

#### Scenario: A reply is not required

- **WHEN** an escalation is closed with no comment on it at all
- **THEN** that is a complete answer

### Requirement: Igor closes the escalations it raised once their subjects resolve

Where an escalation's subject has resolved — the proposal merged, closed, or had activity
inside the window; the condition cleared — the producer SHALL close the escalation it raised.
An open escalation SHALL therefore mean something is still waiting.

A list that accumulates resolved entries stops being read, which arrives at the same place as
a log nobody opens.

#### Scenario: A proposal that moved closes its escalation

- **WHEN** an escalated proposal is merged, or closed, or receives activity inside the window
- **THEN** the escalation for it is closed on the next run

#### Scenario: A cleared condition closes its escalation

- **WHEN** a probe completes without meeting the condition and the condition closes
- **THEN** the escalation naming that cure key is closed

#### Scenario: Already closed by hand

- **WHEN** the subject resolves and a person had already closed the escalation
- **THEN** nothing further is done, and it is not reopened in order to be closed

### Requirement: An escalation is never work

An escalation SHALL be excluded from work by what it is, alongside an item that is closed, one
already in flight, and one held by somebody else — and MUST NOT depend for that on who is
assigned to it or on any role's lane.

Assignment cannot carry this. The store `reviewers` is optional and defaults to empty, which
the tool already expects and reports; with nobody to assign, an escalation is held by nobody
and whether a role's lane admits it is not something Igor can guarantee. An Igor that claims
its own escalation spends a worker on a message to a person and then hands it back, which is
the loop that this whole area exists to stop.

Recognizing an escalation SHALL rely on a marker the producer writes, this being the one case
where nothing else exists to read: unlike a lore proposal, which a person may open by hand and
which is therefore recognized by the entry files it adds rather than by any convention, an
escalation has no existence apart from Igor having raised it.

#### Scenario: An unassigned escalation is still not work

- **WHEN** no reviewers are configured, so an escalation is raised assigned to nobody
- **THEN** it is skipped as an escalation, whatever labels it carries and whatever lane is
  considering it

#### Scenario: An assigned escalation is skipped for being one, not for being held

- **WHEN** an escalation is assigned to the store reviewers
- **THEN** it is skipped as an escalation, and would be skipped identically with the assignees
  removed

#### Scenario: Stripping the marker hands it to the loop deliberately

- **WHEN** a person removes the marker from an escalation
- **THEN** it becomes an ordinary item, eligible like any other, because a person has converted
  a message into work

### Requirement: The escalation names who is subscribed, and a failure to assign is reported

An escalation SHALL be assigned to the store-level `reviewers`, and a quiet proposal's
escalation SHALL also name the pull request's own assignees. Where the intended assignees could
not be assigned, the producer SHALL read back who actually was and report the difference rather
than assume it.

Assignment here says who is subscribed and nothing more; it is not what keeps the escalation
out of the work queue. Reading assignment back rather than trusting the request is the rule
already in force for proposals, and it exists because an accepted request with an absent
assignee is a silent failure.

#### Scenario: Nobody is configured

- **WHEN** no store reviewers are configured
- **THEN** the escalation is still raised, and states that it is assigned to nobody rather than
  appearing to have an owner

#### Scenario: An assignee who is not a collaborator

- **WHEN** somebody named cannot be assigned on the destination
- **THEN** the escalation is raised, names them in its body as plain text, and the substitution
  is reported

### Requirement: An escalation that cannot be raised is reported, not swallowed

Where the destination has issues disabled, or the token cannot open one, the producer SHALL
report that the escalation could not be raised and MUST NOT treat the conclusion as delivered.
The rest of the run SHALL still complete.

A surface that fails quietly is worse than the log it replaced, because the log at least still
existed. The merge-triggered job's token is scoped narrowly on purpose, so a missing permission
is the expected first failure and deserves to name itself.

#### Scenario: The token cannot open issues

- **WHEN** the job's token lacks permission to open an issue
- **THEN** the failure is reported naming the permission that is missing, rather than as a
  generic error

#### Scenario: The destination has issues disabled

- **WHEN** the destination repository has issues turned off
- **THEN** the failure to escalate is reported, and the conclusion is not recorded as delivered

#### Scenario: Reconciliation still finishes its own work

- **WHEN** an escalation cannot be raised during reconciliation
- **THEN** promotions and rejections for that run are still written, because they are not
  waiting on a message to a person
