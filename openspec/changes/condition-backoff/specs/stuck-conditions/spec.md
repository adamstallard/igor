## ADDED Requirements

### Requirement: A condition that recurs stops the affected scope from taking new work

Where the same cure key is recorded as the cause of a handoff repeatedly, the scope that key
names SHALL stop taking new items until the condition clears, and SHALL say which key stopped
it and what would cure it.

An Igor stuck on its own configuration is not stuck on anything an item can fix. Nothing about
the item produced the outcome, so nothing about the next item avoids it: the loop claims,
spends a worker, hands back, and does it again every poll interval against the whole backlog.
The cost is not only money. Each attempt leaves a handoff on somebody's issue saying an Igor
could not proceed, which is a notification to a person who cannot act on it either.

Recurrence is the trigger. A first occurrence is information — an unverified pull request still
carries the diff, and a handoff naming the missing command is how the cure gets found at all.
The twentieth is waste, whatever the cause.

#### Scenario: A recurring condition stops the scope

- **WHEN** one cure key has been recorded as the cause of a handoff enough times
- **THEN** the scope that key names takes no new items

#### Scenario: A first occurrence is not a condition

- **WHEN** a cure key is recorded for the first time
- **THEN** work continues, because one occurrence is what finds the cure

#### Scenario: The stop names its cure

- **WHEN** a scope stops on a condition
- **THEN** it states the cure key and what changing it would take, rather than reporting itself
  unavailable

#### Scenario: The record says which kind of idle this is

- **WHEN** a cycle takes no work because a condition is open
- **THEN** the decision record names the condition and its key, distinctly from an exhausted
  budget, from pacing, and from an empty queue

### Requirement: Conditions are counted, not graded

A condition SHALL be acted on by how often it has recurred and MUST NOT be graded by severity.
No configuration may declare a condition fatal, degraded, or otherwise ranked, and validation
SHALL reject one that tries.

Grading is a judgement nothing here is in a position to make. Whether an unverified pull request
is worse than no pull request depends on the repository, the reviewer and the week; the same
refused `npm ci` is a nuisance on a documentation change and a wasted review on a
behaviour-changing one. An Igor cannot know which, a person writing a config knob is guessing at
it in advance, and a wrong grade is worse than none — fatal where it should not be stops a fleet
that was working, and degraded where it should not be is the unbounded repetition this exists to
end.

Count is the one thing an Igor can know for certain about its own condition, and it does not
require anybody to have predicted the consequence correctly.

#### Scenario: Two conditions with different consequences back off the same way

- **WHEN** one condition yields unverified pull requests and another yields nothing at all
- **THEN** both stop their scope on recurrence alone, with no ordering between them

#### Scenario: A configured severity is refused

- **WHEN** a role or org base declares a condition fatal or degraded
- **THEN** validation fails

### Requirement: A condition's scope is its cure's scope

A condition SHALL be keyed by what would cure it, and SHALL stop exactly what that cure governs:
a refused command stops the role whose `commands` refused it, an unreadable seat stops every
role drawing on that seat, a credential belonging to an Igor stops that Igor. The record SHALL
live in the state branch keyed by the cure key, so the same cure met by several Igors is one
condition.

Keying by the process that hit the condition would count one cure five times, back off five
times over, and clear five times — with the fifth Igor still discovering for itself something
four others already recorded. The cure is the thing that is singular; everything else is a
witness to it.

Scoping by cure also keeps the stop as small as it can honestly be. A role refused one command
is the only thing that refusal says anything about, and stopping the fleet for it wastes
capacity that was never affected.

#### Scenario: One cure met by several Igors is one condition

- **WHEN** five Igors each hand back on the same cure key
- **THEN** it is one condition, counted once toward its recurrence and cleared once

#### Scenario: A role-scoped condition leaves other roles working

- **WHEN** a role's allowlist refuses a command it needs
- **THEN** that role stops and roles that do not share the cure continue

#### Scenario: A seat-scoped condition stops every role on that seat

- **WHEN** a seat's token cannot be read
- **THEN** every role drawing on that seat stops, whatever their own configuration says

#### Scenario: The count survives the process

- **WHEN** a loop restarts while a condition is open
- **THEN** the condition and its count are read back rather than starting again from zero

### Requirement: A condition clears by not recurring, and a probe is what observes that

An open condition SHALL clear when it stops recurring, with nothing external required to
announce the cure. After a cooldown the affected scope SHALL take exactly one item; where that
item does not meet the condition it SHALL clear, and where it does the scope SHALL stop again
for a longer cooldown.

Nobody sends a fixed signal, and nobody should have to: the cure is a configuration change made
by whoever reads the stop, on a surface that has no channel back to the loop, and a condition
that waits to be told is a condition somebody has to remember to close. But a stopped scope runs
nothing and therefore observes nothing, so absence can never be established from inside the
stop. The probe is the only way out of that: one run buys the observation, and the cooldown
bounds what it costs to be wrong.

The probe SHALL be the next item the scope would ordinarily take, not the item that was being
worked when the condition opened. A condition is scoped to its cure and says nothing about any
item, and the item that first met it may be legitimately unworkable for its own reasons — an
Igor waiting for that one item to become available again is stopped on something unrelated to
the cure it is trying to observe.

#### Scenario: A cured condition clears itself

- **WHEN** the cooldown passes and the probe item completes without meeting the condition
- **THEN** the condition is closed and the scope resumes

#### Scenario: A condition still present backs off further

- **WHEN** the probe meets the same condition again
- **THEN** the scope stops again and the next cooldown is longer

#### Scenario: One item, not a resumption

- **WHEN** a scope is probing
- **THEN** it takes one item and stops again until that item's outcome is known

#### Scenario: The probe is not the item that tripped it

- **WHEN** the item being worked when a condition opened is suppressed, closed, or claimed by
  somebody else
- **THEN** the probe is whichever item the scope would take next, and the condition can still
  clear

### Requirement: No recurrence count or cooldown is fixed here

The recurrence threshold and the cooldown SHALL be configurable, and their defaults SHALL be
marked provisional until run history exists to fit them against.

Nothing here has been measured. The two items whose cost is recorded are $1.19 and $11.18 — 10×
apart — so what a wasted repetition costs is not known to within an order of magnitude, and a
threshold is a statement about exactly that. A number chosen now would carry a number's
authority over a guess.

#### Scenario: Defaults are marked as unfitted

- **WHEN** an operator reads the threshold or the cooldown
- **THEN** each is declared provisional and says what it was reasoned from
