## ADDED Requirements

### Requirement: Only a tracker or code host failing counts as the surface failing

The cycle stops on two surface failures in a row (*A claim that cannot be kept is given back, out
loud*). A run SHALL count toward that only where a call to the tracker or the code host failed. A
run that failed in its working tree, such as a clone, a branch set up or a full disk, or in the
Igor's own code SHALL NOT count, whether it failed before or after the worker ran.

Which call failed SHALL be known from which surface's call threw, and SHALL NOT be read back out
of the error's wording. A table of error shapes misses the first error it does not list.

A failure in one item's working tree is not the tracker failing. Counted as if it were, it ends
the cycle one item early when a real outage follows it.

#### Scenario: A working tree that cannot be provisioned is not a surface failure

- **WHEN** an item's run fails because its working tree could not be cloned, and the next item's
  run fails the same way
- **THEN** the cycle continues to the remaining items and is not recorded as failed

#### Scenario: A tracker that does not answer is still a surface failure

- **WHEN** two runs in a row fail because a call to the tracker failed
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A code host that does not answer after the worker ran is a surface failure

- **WHEN** a run fails because the code host did not answer a call made after the worker ran
- **THEN** that run counts toward the two in a row

### Requirement: A failure before the worker that repeats sets the item down

A run *fails before the worker* when it ends after its claim began and before the worker was paid
for. Examples are a failure in the claim window, in provisioning the working tree,
in setting up its branch, or in a tracker or code-host call made before the worker starts. Such a
run is refused and tried again next cycle, because a retry costs nothing. Where the failure is
deterministic, it repeats every poll, each time claiming the item and posting on it.

The Igor SHALL count an item's failures before the worker, for its own role, in a row. On the
third identical one it SHALL hand the item back deferred instead of refusing it. What it posts on
the item on that run SHALL say that it has stopped retrying and what brings the item back. It
SHALL say so once: the runs before the third say what they say today, and a deferred item is not
claimed, so nothing is posted after it.

**Identical** means the same source and the same message. The source is one of the tracker, the
code host, the working tree or the Igor's own code. The message is compared with its variable
parts masked: digit runs, hexadecimal identifiers and the working tree's temporary path.

**In a row** means nothing broke the sequence. A run of the item that reached the worker, or a
failure before the worker that is not identical, SHALL start the count again. An edit or a reply
SHALL NOT. So once the deferral lifts, an identical failure sets the item down again at once.
The answer that lifted it did not cure the failure.

**The count SHALL survive a restart.** It is rebuilt from the run record, never held only in
memory.

**An outage is not the item's failure.** A run that failed in a cycle the outage rule then ended
SHALL NOT count toward any item's breaker. Without this, an outage of three polls sets down the
items that sort first, each waiting for an answer about a fault that was never theirs.

**The deferral SHALL lift exactly as any handed-back item's does** (`work-triage`, *An item handed
back is not re-worked until something answers*). The breaker adds no rule of its own about what
lifts it.

**A count that cannot be read sets nothing down.** The run is refused and retried as before. The
record is a cache, and failing toward the work is the right direction for one.

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

- **WHEN** a tracker call in the claim window fails the same way on three consecutive runs of an
  item, in cycles that continued to other items
- **THEN** the third run releases the claim and says the Igor has stopped retrying
- **AND** the item is not claimed next cycle

#### Scenario: A different failure starts the count again

- **WHEN** an item failed before the worker twice in one way and then once in another
- **THEN** the item is not set down, and the newest failure is the first of its count

#### Scenario: A run that reached the worker starts the count again

- **WHEN** an item failed before the worker twice, then a run of it reached the worker, then it
  failed before the worker in the first way again
- **THEN** the item is not set down

#### Scenario: The count survives a restart

- **WHEN** an item failed before the worker twice, the Igor restarts, and the item fails the same
  way again
- **THEN** the item is set down

#### Scenario: An outage does not count

- **WHEN** a run failed before the worker in a cycle that the outage rule then ended
- **THEN** that failure does not count toward the item's breaker

#### Scenario: The deferral lifts as a handoff's does

- **WHEN** an item was set down by its breaker and it is then answered the way that lifts a
  handed-back item
- **THEN** it is claimed again

#### Scenario: An identical failure after the deferral lifts sets it down at once

- **WHEN** an item set down by its breaker is claimed again after its deferral lifted, and fails
  before the worker in the same way
- **THEN** that run sets it down again, without two more retries

#### Scenario: A count that cannot be read sets nothing down

- **WHEN** a run fails before the worker and the run record cannot be read
- **THEN** the run is refused and the item is tried again next cycle
