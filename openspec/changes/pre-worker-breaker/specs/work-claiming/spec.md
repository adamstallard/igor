## ADDED Requirements

### Requirement: Only a tracker or code host failing counts as the surface failing

The cycle stops on two surface failures in a row (*A claim that cannot be kept is given back, out
loud*); this capability calls that the *outage rule*. A run SHALL count toward it only where the
call that threw was the tracker's or the code host's. A run that failed in its working tree, such
as a clone, a branch set up or a full disk, or in the Igor's own code SHALL NOT count, whether it
failed before or after the worker ran.

Which surface's call threw SHALL be known from the call itself, and SHALL NOT be read back out of
the error's wording.

The outage rule SHALL apply in every cycle, including the single cycle `igor run` runs.

#### Scenario: A working tree that cannot be provisioned is not a surface failure

- **WHEN** an item's run fails because its working tree could not be cloned, and the next item's
  run fails in its working tree in a different way
- **THEN** the cycle continues to the remaining items and is not recorded as failed

#### Scenario: A tracker that does not answer is still a surface failure

- **WHEN** two runs in a row fail because a call to the tracker failed
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A working tree that fails after the worker ran is not a surface failure

- **WHEN** two runs in a row fail after the worker ran, each because a call to its working tree
  failed
- **THEN** the cycle continues to the remaining items and is not recorded as failed

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
window (while the claim is being taken), in provisioning the working tree, in a catch-up's
merge, or in a tracker or code-host call made before the worker starts. Such a run is refused:
its claim is given back, and discovery may take the item again next cycle (`work-discovery`).

The Igor SHALL count an item's failures before the worker, for its own role, in a row; that count
is the item's *breaker*. When a failure brings the count of identical ones to three or more, the
Igor SHALL hand the item back deferred instead of refusing it, which is to *set the item down*.
What it posts on the item on that run SHALL say that it has stopped retrying and what brings the
item back. It SHALL say so only on the run that sets the item down.

**Only the holder counts.** A role's *ranks* are its numbered processes, as
`concurrent-instances` (#179) defines them; rank 0 is an `igor run`'s, while it runs. Where a
role runs as several ranks, only the rank whose claim message holds the item under #179's rules
SHALL count a failure before the worker or record it. A rank that does not hold the claim records nothing toward any breaker. Who posts
the set-down, and that every other rank drops out silently, is #179's *Only the rank holding a
claim gives it back*. The count is kept per role and item, so it carries on when another rank
of the role later holds the item.

**Identical** means the same source and the same message. The source is one of the tracker, the
code host, the working tree or the Igor's own code. The message is compared with its variable
parts masked: digit runs, hexadecimal identifiers and the working tree's path. The working trees
of different ranks of one role SHALL mask to the same text. A failure the run returns, rather
than throws, SHALL carry the source of the step that failed; one that carries none has the
source of the Igor's own code.

**In a row** means nothing broke the sequence. A run of the item that started the worker, or a
failure before the worker that counts and is not identical, SHALL start the count again. An edit or a reply
SHALL NOT. So once the deferral lifts, an identical failure sets the item down again at once.

**The count SHALL survive a restart.** It is rebuilt from the execution log
(`executions.ndjson`), never held only in memory.

**The breaker's row SHALL hold no failure's text.** A failure before the worker whose run
records no cure key (*A fault in the Igor's own setup is not the item's failure*, below) appends a row to the execution log, which lives on the state branch where
Igor keeps its records. That row SHALL hold the failure's source (`tracker`, `code-host`, `tree`
or `igor`), which stands for its class in place of its text, and a short hash of its masked
message. Identical failures are those whose sources and hashes match. The raw and masked
messages SHALL go only to the process's own log, the server's journal under systemd or the
standard error of an `igor run`, as one line
with the item, role, source and hash, encoded so that no message can break the line or forge
another.

**An outage is not the item's failure.** A run that failed in a cycle the outage rule then ended
SHALL NOT count toward any item's breaker, and neither SHALL either of the two runs whose
failures end a cycle under *Two identical failures before the worker on different items end the
cycle*.

The breaker SHALL decide, and post, during the failing run, without waiting for a later run to
show whether one of those two rules ends the cycle. A set-down posted for a failure that then
turns out to be part of an outage stands, and lifts like any other.

**A fault in the Igor's own setup is not the item's failure.** A failure whose run records a
*cure key* SHALL NOT count toward any item's breaker. A cure key is what #101's
`condition-backoff` change records for a fault in the Igor's own setup, such as a seat whose
token is unset, naming what would cure it.

A failure before the worker that does not count, because an outage or the rule on two identical
failures excluded it or because its run records a cure key, SHALL NOT start the count again
either: the count passes over it. A run that started the worker starts the count again whether
or not it records a cure key.

**The deferral SHALL lift exactly as any handed-back item's does** (`work-triage`, *An item handed
back is not re-worked until something answers*). The breaker adds no rule of its own about what
lifts it.

**A count that cannot be read SHALL set nothing down.** The run is refused, and its failure's
row is still written.

#### Scenario: The first two identical failures are retried

- **WHEN** an item no person handed over, whose refusal therefore asks for no new label, fails to
  clone its working tree the same way on two consecutive runs
- **THEN** each run hands the claim back saying it will try again next cycle
- **AND** the item is claimed again next cycle

#### Scenario: The third identical failure sets the item down

- **WHEN** an item's working tree fails to clone the same way on a third consecutive run
- **THEN** the run hands the item back deferred, saying it has stopped retrying and what brings
  the item back
- **AND** the item is not claimed next cycle

#### Scenario: A repeated failure in the claim window sets the item down

- **WHEN** one process of a role runs, with no `igor run` beside a serving rank, and a tracker
  call in the claim window gets no answer, the same way, on three consecutive runs of an item,
  in cycles that continued to other items
- **THEN** the third run releases the claim and says the Igor has stopped retrying
- **AND** the item is not claimed next cycle

#### Scenario: Failures that differ only in their variable parts are identical

- **WHEN** an item's clone fails three runs in a row with messages that differ only in the
  working tree's temporary path and a number
- **THEN** the third run sets the item down

#### Scenario: Only the holder counts and sets down

- **WHEN** two ranks of one role post claims on an item, and the rank that does not hold the claim
  fails before the worker
- **THEN** that rank records no failure toward the item's breaker
- **AND** the third identical failure of a holder of the item sets it down, whichever rank held it
  each time

#### Scenario: Trees of different ranks mask alike

- **WHEN** two ranks of one role each hold an item in turn, and its clone fails the same way for
  each, with messages that differ only in the path of each rank's working tree
- **THEN** the two failures are identical, and both count toward the item's breaker

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

#### Scenario: A run that started the worker and recorded a cure key starts the count again

- **WHEN** an item fails before the worker the same way twice, then a run of it starts the worker
  and records a cure key, then it fails before the worker the first way again
- **THEN** the item is not set down

#### Scenario: A failure that does not count does not break the sequence

- **WHEN** an item fails before the worker the same way twice, then fails before the worker in a
  run that records a cure key, then fails the first way again
- **THEN** that last run sets the item down

#### Scenario: A failure's text stays off the state branch

- **WHEN** an item's clone fails before the worker with a message that quotes a private
  repository's response
- **THEN** the row the failure appends to the execution log holds the source and a hash of the
  masked message, and no part of the raw or the masked message
- **AND** the process's own log holds both messages on one line with that hash

#### Scenario: A message cannot break the process's log line

- **WHEN** an item fails before the worker with a message holding a newline and a quote
- **THEN** the process's own log holds the failure on one line, with the newline and the quote
  escaped, and no second line

#### Scenario: A returned failure carries its step's source

- **WHEN** a run's `execute` returns a failure before the worker from a step in the working tree
- **THEN** the failure's source is `tree`

#### Scenario: A returned failure with no source is the Igor's own

- **WHEN** a run's `execute` returns a failure before the worker that carries no source
- **THEN** the failure's source is `igor`

#### Scenario: A count that cannot be read sets nothing down

- **WHEN** a run fails before the worker and the execution log cannot be read
- **THEN** the run is refused and the item is tried again next cycle
- **AND** the run still appends its failure's row

### Requirement: Two identical failures before the worker on different items end the cycle

A failure every item meets, such as a full disk or an expired clone token, is not a surface
failure. When two runs in a row, of different items, fail before the worker identically, the
cycle SHALL end, its remaining items SHALL NOT be attempted, and the cycle SHALL be recorded as
failed, as a cycle the outage rule ends is. **Identical** has the meaning *A failure before the
worker that repeats sets the item down* gives it: the same source and the same masked message.
Neither run SHALL count toward its item's breaker.

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
