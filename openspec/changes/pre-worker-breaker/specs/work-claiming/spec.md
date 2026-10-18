## ADDED Requirements

### Requirement: Only a tracker or code host failing counts as the surface failing

The cycle stops on two surface failures in a row (*A claim that cannot be kept is given back, out
loud*); this capability calls that the *outage rule*. A run SHALL count toward it only where the
call that threw was the tracker's or the code host's. A run that failed in its working tree, such
as a clone, a branch set up or a full disk, or in the Igor's own code SHALL NOT count, whether it
failed before or after the worker ran.

Which surface's call threw SHALL be known from the call itself, and SHALL NOT be read back out of
the error's wording. Knowing the surface does not tell a surface that did not answer from one
that answered and refused this item, such as a code host refusing a branch the item already
owns. Only a second item failing tells them apart, and the outage rule's two in a row is that
test.

The outage rule covers every cycle, including the single cycle `igor run` runs.


#### Scenario: A working tree that cannot be provisioned is not a surface failure

- **WHEN** an item's run fails because its working tree could not be cloned, and the next item's
  run fails in its working tree in a different way
- **THEN** the cycle continues to the remaining items and is not recorded as failed

#### Scenario: A tracker that does not answer is still a surface failure

- **WHEN** two runs in a row fail because a call to the tracker failed
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A failure in the Igor's own code is not a surface failure

- **WHEN** two runs in a row fail after the worker ran, with an error that no tracker, code
  host or working-tree call threw
- **THEN** the cycle continues to the remaining items and is not recorded as failed

#### Scenario: `igor run` stops on two surface failures in a row

- **WHEN** `igor run`'s cycle meets two runs in a row that fail because a call to the tracker
  failed, with different messages
- **THEN** the cycle ends and the remaining items are not attempted
- **AND** neither failure counts toward setting its item down (*A failure before the worker that
  repeats sets the item down*)

#### Scenario: The source is the call, not the wording

- **WHEN** a working-tree call fails with a message that names a GitHub API error
- **THEN** the run is not a surface failure

#### Scenario: A code host that does not answer after the worker ran is a surface failure

- **WHEN** a run fails because the code host did not answer a call made after the worker ran
- **THEN** that run counts toward the two in a row

### Requirement: A failure before the worker that repeats sets the item down

A run *fails before the worker* when it ends in failure after its claim began and before the
worker started, whether the failure was thrown or returned. Examples are a failure in the claim
window (while the claim is being taken), in provisioning the working tree, in setting up its
branch, or in a tracker or code-host call made before the worker starts. Such a run is refused:
its claim is given back and the item is tried again next cycle, unless the discovery watermark
has moved past it, after which discovery sees it again only once it is edited or commented on
(`work-discovery`).
Where the failure is deterministic, it repeats every poll, each time claiming the item and
posting on it.

The Igor SHALL count an item's failures before the worker, for its own role, in a row; that count
is the item's *breaker*. On the third identical one it SHALL hand the item back deferred instead
of refusing it. What it posts on
the item on that run SHALL say that it has stopped retrying and what brings the item back. It
SHALL say so once for each set-down: the runs before it say what they say today, and a deferred
item is not claimed, so nothing is posted while it stays deferred.

**Only the holder counts.** Where a role runs as several ranks, the numbered processes of one
role that `concurrent-instances` (#179) defines, only the rank whose claim message holds the item,
the claim that counts under #179's rules, SHALL count a failure before the worker or record it. Who posts the set-down, and that every
other rank drops out silently, is #179's *Only the rank holding a claim gives it back*; a rank
that does not hold the claim records nothing toward any breaker. The count is kept per role and
item, so it carries on when another rank of the role later holds the item.

**Identical** means the same source and the same message. The source is one of the tracker, the
code host, the working tree or the Igor's own code. The message is compared with its variable
parts masked: digit runs, hexadecimal identifiers and the working tree's path. Under #179 a tree's
name carries its role and rank, and the count carries on across a role's ranks, so trees of
different ranks SHALL mask to the same text. A failure `execute` returns, rather than throws, carries the
source of the step that failed, which `execute` reports with it.

**In a row** means nothing broke the sequence. A run of the item that started the worker, or a
failure before the worker that is not identical, SHALL start the count again. An edit or a reply
SHALL NOT. So once the deferral lifts, an identical failure sets the item down again at once.

**The count SHALL survive a restart.** It is rebuilt from the execution log
(`executions.ndjson`), never held only in memory.

**An outage is not the item's failure.** A run that failed in a cycle the outage rule then ended
SHALL NOT count toward any item's breaker, and neither SHALL a run that *Two identical failures
before the worker on different items end the cycle* ended.

Whether a run's cycle ends under one of those two rules is known only when a later run in the
cycle fails. The breaker SHALL decide, and post, during the failing run, without waiting for that
later run. So the third identical failure can set an item down and then turn out to be the first
failure of an outage. That deferral stands, and lifts like any other.

**A fault in the Igor's own setup is not the item's failure.** A failure whose run records a
*cure key* SHALL NOT count toward any item's breaker. A cure key is what #101's
`condition-backoff` change records for a fault in the Igor's own setup, such as a seat whose
token is unset, naming what would cure it. That change's `work-triage` delta never suppresses an
item for such a fault, and a set-down is a suppression.

A failure that does not count, because an outage or the rule on two identical failures excluded
it or because its run records a cure key, SHALL NOT start the count again either: the count
passes over it.

**The deferral SHALL lift exactly as any handed-back item's does** (`work-triage`, *An item handed
back is not re-worked until something answers*). The breaker adds no rule of its own about what
lifts it.

**A count that cannot be read sets nothing down.** The run is refused and retried as before.

#### Scenario: The first two identical failures are retried

- **WHEN** an item's working tree fails to clone the same way on two consecutive runs
- **THEN** each run hands the claim back saying it will try again next cycle
- **AND** the item is claimed again next cycle

#### Scenario: The third identical failure sets the item down

- **WHEN** an item's working tree fails to clone the same way on a third consecutive run
- **THEN** the run hands the item back deferred, saying it has stopped retrying and what brings
  the item back
- **AND** the item is not claimed next cycle

#### Scenario: A repeated failure in the claim window sets the item down

- **WHEN** a tracker call in the claim window gets no answer, the same way, on three consecutive
  runs of an item, in cycles that continued to other items
- **THEN** the third run releases the claim and says the Igor has stopped retrying
- **AND** the item is not claimed next cycle

#### Scenario: Failures that differ only in their variable parts are identical

- **WHEN** an item's clone fails three runs in a row with messages that differ only in the
  working tree's temporary path and a number
- **THEN** the third run sets the item down

#### Scenario: Only the holder counts and sets down

- **WHEN** two ranks of one role post claims on an item, and the rank that does not hold the claim
  fails before the worker
- **THEN** that rank records no failure toward the item's breaker and posts nothing
- **AND** the third identical failure of a holder of the item sets it down, whichever rank held it
  each time

#### Scenario: Each role counts its own failures

- **WHEN** an item fails before the worker the same way twice for one role and once for another
- **THEN** neither role sets the item down

#### Scenario: A different failure starts the count again

- **WHEN** an item failed before the worker twice in one way and then once in another
- **THEN** the item is not set down, and the newest failure is the first of its count

#### Scenario: A run that started the worker starts the count again

- **WHEN** an item failed before the worker twice, then a run of it started the worker, then it
  failed before the worker in the first way again
- **THEN** the item is not set down

#### Scenario: The count survives a restart

- **WHEN** an item failed before the worker twice, the Igor restarts, and the item fails the same
  way again
- **THEN** the item is set down

#### Scenario: An outage does not count

- **WHEN** a run failed before the worker in a cycle that the outage rule then ended
- **THEN** that failure does not count toward the item's breaker

#### Scenario: A set-down posted before an outage is known stands

- **WHEN** an item has failed before the worker twice the same way, in cycles that continued,
  and its third identical failure is a surface failure that the next item's surface failure
  turns into an outage
- **THEN** the third run sets the item down
- **AND** that failure does not count toward the item's breaker once the deferral lifts

#### Scenario: A failure that records a cure key does not count

- **WHEN** an item fails before the worker three times in a row, alone in its cycle each time,
  and each run records the same cure key
- **THEN** none of the three counts toward its breaker, and the item is not set down

#### Scenario: The deferral lifts as a handoff's does

- **WHEN** an item was set down by its breaker and it is then answered the way that lifts a
  handed-back item
- **THEN** it is claimed again

#### Scenario: An identical failure after the deferral lifts sets it down at once

- **WHEN** an item set down by its breaker is claimed again after its deferral lifted, and fails
  before the worker in the same way
- **THEN** that run sets it down again, without two more retries

#### Scenario: A failure that does not count does not break the row

- **WHEN** an item fails before the worker the same way twice, then fails in a run whose failure
  records a cure key, then fails the first way again
- **THEN** that last run sets the item down

#### Scenario: A count that cannot be read sets nothing down

- **WHEN** a run fails before the worker and the run record cannot be read
- **THEN** the run is refused and the item is tried again next cycle

### Requirement: Two identical failures before the worker on different items end the cycle

A failure every item meets, such as a full disk or an expired clone token, is not a surface
failure, and it is not any one item's failure either. When two runs in a row, of different items,
fail before the worker identically, the cycle SHALL end, its remaining items SHALL NOT be
attempted, and the cycle SHALL be recorded as failed, as a cycle the outage rule ends is. **Identical** has the meaning *A failure before the worker that repeats sets the item
down* gives it: the same source and the same masked message. Neither run SHALL count toward its
item's breaker.

An item that meets such a failure alone in its cycle, with no second run to compare, SHALL count
it toward its breaker, once per cycle, unless its run records a cure key (*A failure before the
worker that repeats sets the item down*).

#### Scenario: Two items failing to clone the same way end the cycle

- **WHEN** an item's working tree fails to clone, and the next item's working tree fails to clone
  the same way
- **THEN** the cycle ends, is recorded as failed, and the remaining items are not attempted
- **AND** neither failure counts toward its item's breaker

#### Scenario: Two items failing in different ways do not end the cycle

- **WHEN** two items in a row fail before the worker, in different ways, neither of them a
  surface failure
- **THEN** the cycle continues to the remaining items
- **AND** each failure counts toward its own item's breaker

#### Scenario: An item alone in its cycle counts the failure

- **WHEN** a cycle runs one item, and it fails before the worker in a way every item would
- **THEN** the failure counts once toward that item's breaker
