## ADDED Requirements

### Requirement: Only a tracker or code host failing counts as the surface failing

The cycle stops on two surface failures in a row (*A claim that cannot be kept is given back, out
loud*); this capability calls that the *outage rule*. A run SHALL count toward it only where a call
to the tracker or the code host got no answer. *No answer* has the meaning #101
(`condition-backoff`) gives it for a claim, which its `passesMark` reads from the response's
status: no status at all, a 5xx, a 408, a 429, or a 403 for a rate limit. A call the surface
answered and refused, such as a 403 for a missing permission, SHALL NOT count toward the outage
rule.

A run that failed in its working tree, such as a branch set up or a full disk, or in the Igor's
own code SHALL NOT count either, whether it failed before or after the worker ran. One working-tree
call is the code host's: a clone that fails because the code host did not answer SHALL count as a
code-host failure. A clone whose failure the tree provider cannot tell was unanswered, and a token
mint that fails inside a clone, SHALL count as working-tree failures.

Which surface's call threw SHALL be known from the call itself, and SHALL NOT be read back out of
the error's wording.

The outage rule SHALL apply in every cycle, including the single cycle `igor run` runs.
`igor run --claim` works one item outside any cycle, so no two-in-a-row rule applies to it: its
failure SHALL NOT end a cycle or count toward the outage rule.

#### Scenario: A working tree that cannot be provisioned is not a surface failure

- **WHEN** an item's run fails because its working tree could not be cloned onto a full disk, and
  the next item's run fails in its working tree in a different way
- **THEN** the cycle continues to the remaining items and is not recorded as failed

#### Scenario: A tracker that does not answer is still a surface failure

- **WHEN** two runs in a row fail because a call to the tracker failed
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A refusal is not an outage

- **WHEN** two runs in a row fail because the tracker answered and refused a call, each with a
  403 that is not a rate limit, and with different messages
- **THEN** the outage rule does not end the cycle
- **AND** each failure counts toward its own item's breaker

#### Scenario: A clone the code host does not answer is a surface failure

- **WHEN** two runs in a row fail to clone because the code host did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A token mint that fails inside a clone is not a surface failure

- **WHEN** two runs in a row fail to clone because the token mint inside the clone failed, with
  different messages
- **THEN** the outage rule does not end the cycle

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
item back. It SHALL say so only on the run that sets the item down. That post SHALL name the kind
of failure in plain words: where it failed, and its HTTP status or exit code where it has one. It
SHALL NOT quote the error message. The same holds for each failure before the set-down, whose run
gives the claim back to be tried again next cycle: what that run posts SHALL name the kind of
failure in plain words and SHALL NOT quote the error message. The full message goes to the process's own log (*The breaker's row SHALL hold
no message text*, below).

**One set-down per deferral.** A run SHALL NOT post a set-down on an item whose set-down by its
role has not lifted (*What lifts a set-down*, below). It gives the claim back without one, and
its post SHALL NOT say that it will try again next cycle.

**`igor run --claim` counts like any run.** Its failure before the worker SHALL count toward the
item's breaker for its role as any rank's does, as rank 0. It ends no cycle (*Only a tracker or
code host failing counts as the surface failing*), and no `outage` row excludes it.

**Only the holder counts.** A role's *ranks* are its numbered processes, as
`concurrent-instances` (#179) defines them; rank 0 is an `igor run`'s, while it runs. Where a
role runs as several ranks, only the rank whose claim message holds the item under #179's rules
SHALL count a failure before the worker or record it. A rank that does not hold the claim records nothing toward any breaker. The rank that
holds the item SHALL post the set-down, and every other rank drops out silently, as #179's
*Only the rank holding a claim gives it back* requires. The count is kept per role and item, so it carries on when another rank
of the role later holds the item.

**In the claim window, a rank alone on the item counts,** as an exception to the holder rule
above. A rank whose run fails in the claim window SHALL count the failure, and post the
set-down, only where at that moment the item carries no claim message of another rank of its
role that counts under #179's rules. Where it carries one, the rank SHALL count nothing, record
nothing toward the breaker, and leave the role's label on the item.

Where the rank cannot read the item's claim messages, it SHALL count nothing and record nothing
toward the breaker for that failure, then or later. On that run it SHALL post nothing and leave
the role's label on the item, and in its next cycle it SHALL read the item's claim messages
again. `igor run`, whose process runs no next cycle, SHALL make that second read before it
exits. Where that read finds another rank's claim message that counts, the rank drops out
silently, as above. Where it finds none, or fails again, the rank SHALL give its claim back with
the post a refused run makes, so that the claim never ends in silence (*A claim that cannot be
kept is given back, out loud*).

**Identical** means the same source and the same message. The source is one of the tracker, the
code host, the working tree or the Igor's own code. The message is compared with its variable
parts masked: ids, timestamps, the working tree's path and other temporary paths, hexadecimal
identifiers and runs of four or more digits.
The masks SHALL keep runs of three digits or fewer, which hold HTTP statuses and exit codes, so
two failures that differ in their status are not identical. The working trees of different ranks
of one role SHALL mask to the same text. A failure the run returns, rather
than throws, SHALL carry the source of the step that failed; one that carries none has the
source of the Igor's own code.

**In a row** means nothing broke the sequence. A run of the item that started the worker, or a
failure before the worker that counts and is not identical, SHALL start the count again. An edit or a reply
SHALL NOT. So once the deferral lifts, an identical failure sets the item down again at once.

**The count SHALL survive a restart.** It is rebuilt from the execution log
(`executions.ndjson`), never held only in memory.

**The breaker's row SHALL hold no message text.** Each failure before the worker appends a row
to the execution log, which lives on the state branch where Igor keeps its records. That row
SHALL hold only these fields:
- the item, the role, the rank, and whether the rank held the claim;
- the cycle and the time;
- the row's kind;
- the source (`tracker`, `code-host`, `tree` or `igor`);
- the HTTP status or exit code, where the failure has one;
- whether the run recorded a cure key (*A fault in the Igor's own setup is not the item's
  failure*, below);
- an unkeyed fingerprint of the masked message.

Identical failures are those whose sources and fingerprints match. The failure's full message
SHALL go to the Igor process's own log on its server, never to the state branch, after
`task-execution`'s *Credential redaction replaces every credential the Igor knows*
([#213](https://github.com/adamstallard/igor/issues/213)). The masks run on that redacted
message.

**An outage is not the item's failure.** A run that failed in a cycle the outage rule then ended
SHALL NOT count toward any item's breaker, and neither SHALL either of the two runs whose
failures end a cycle under *Two identical failures before the worker on different items end the
cycle*.

The breaker SHALL decide, and post, during the failing run, without waiting for a later run to
show whether one of those two rules ends the cycle. Where the failing run is itself the second
of the two runs that end the cycle, that is known during the run, and the breaker SHALL NOT
count it or set its item down. A set-down posted for a failure that then
turns out to be part of an outage stands, and lifts like any other.

**A fault in the Igor's own setup is not the item's failure.** A failure whose run records a
*cure key* SHALL NOT count toward any item's breaker; its row says that it recorded one. A cure
key is what #101's `condition-backoff` change records for a fault in the Igor's own setup, such as
a seat whose token is unset, naming what would cure it.

A failure before the worker that does not count, because an outage or the rule on two identical
failures excluded it or because its run records a cure key, SHALL NOT start the count again
either: the count passes over it. A run that started the worker starts the count again whether
or not it records a cure key.

**What lifts a set-down.** A set-down SHALL lift on a person's change to the item, such as a
reply or an edit, or on another role's successful run on it, such as a pull request that role
opened for the item. An Igor's other posts on the item, such as another role's set-down or
comment, and its label edits, SHALL NOT lift it. This is narrower than what lifts other
handed-back items (`work-triage`, *An item handed back is not re-worked until something answers*).

**A count that cannot be read SHALL set nothing down.** That includes a read where any part of the
execution log failed to read. The run is refused, and its failure's row is still written.

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

- **WHEN** a tracker call in the claim window gets no answer, the same way, on three
  consecutive runs of an item, in cycles that continued to other items, and each time the item
  carries no other rank's claim message that counts
- **THEN** the third run releases the claim and says the Igor has stopped retrying
- **AND** the item is not claimed next cycle

#### Scenario: The set-down is said even where the claim message never landed

- **WHEN** the third identical failure in the claim window is the failure to post the claim
  message
- **THEN** the run still posts the withdrawal, saying the Igor has stopped retrying

#### Scenario: A claim-window failure beside another rank's claim does not count

- **WHEN** a rank's run fails in the claim window, and the item carries a claim message of
  another rank of the role, one that counts under #179's rules
- **THEN** the rank records nothing toward the item's breaker
- **AND** it leaves the role's label on the item

#### Scenario: Failures that differ only in their variable parts are identical

- **WHEN** an item's clone fails three runs in a row with messages that differ only in the
  working tree's temporary path and a timestamp
- **THEN** the third run sets the item down

#### Scenario: Failures with different HTTP statuses are not identical

- **WHEN** an item's tracker call fails before the worker twice with HTTP 404, then once with
  HTTP 500, with messages otherwise the same
- **THEN** the item is not set down, and the newest failure is the first of its count

#### Scenario: A claim-window failure whose read of the claim messages fails does not count

- **WHEN** a rank's run fails in the claim window, and its read of the item's claim messages fails
- **THEN** the rank records nothing toward the item's breaker and posts nothing
- **AND** it leaves the role's label on the item, and reads the claim messages again in its next
  cycle

#### Scenario: A read of the claim messages that fails twice gives the claim back out loud

- **WHEN** a rank's read of an item's claim messages failed after a claim-window failure, and
  its read in its next cycle fails too
- **THEN** the rank gives its claim back with the post a refused run makes
- **AND** it records nothing toward the item's breaker

#### Scenario: A reread that finds no other claim gives the claim back out loud

- **WHEN** a rank's read of an item's claim messages failed after a claim-window failure, and
  its read in its next cycle finds no other rank's claim message that counts
- **THEN** the rank gives its claim back with the post a refused run makes
- **AND** it records nothing toward the item's breaker

#### Scenario: `igor run` rereads before it exits

- **WHEN** `igor run`'s read of an item's claim messages fails after a claim-window failure
- **THEN** it reads them again before it exits, and gives its claim back with the post a refused
  run makes unless that read finds another rank's claim message that counts

#### Scenario: A reread that finds a sibling's claim drops out silently

- **WHEN** a rank's read of an item's claim messages failed after a claim-window failure, and
  its read in its next cycle finds another rank's claim message that counts
- **THEN** the rank posts nothing, records nothing, and leaves the role's label on the item

#### Scenario: An item already deferred is not set down again

- **WHEN** two ranks of one role claim an item one after the other, and the first's third
  identical failure sets it down while the second's claim message lands on it
- **AND** the second rank then holds the item and fails the same way
- **THEN** the second rank posts no set-down, and the item stays deferred
- **AND** its post does not say that it will try again next cycle

#### Scenario: The set-down post names the failure without quoting it

- **WHEN** the third identical failure is a clone that exits 128 with a message quoting a path
- **THEN** the set-down post says the working tree failed, with exit code 128
- **AND** it quotes no part of the message

#### Scenario: The failures before a set-down are named without quoting them

- **WHEN** an item's clone fails before the worker, exiting 128 with a message quoting a path,
  and the run is refused
- **THEN** the refusal's post says the working tree failed, with exit code 128, and that it will
  try again next cycle
- **AND** it quotes no part of the message

#### Scenario: A failure of `igor run --claim` counts toward the breaker

- **WHEN** an item failed before the worker the same way twice under `igor serve`, and then
  `igor run --claim` on it fails the same way
- **THEN** the `igor run --claim` run sets the item down
- **AND** it ends no cycle

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

#### Scenario: The second surface failure is recorded and does not set its item down

- **WHEN** an item has failed before the worker twice the same way, in cycles that continued,
  and its third identical failure is a surface failure before the worker that comes right after
  another item's surface failure before the worker, so the item's failure is the second of the
  pair and the outage rule ends the cycle during its run
- **THEN** the item is not set down
- **AND** the cycle's `outage` record names both items, with each failure's source, status and
  fingerprint

#### Scenario: An outage does not count

- **WHEN** a run failed before the worker in a cycle that the outage rule then ended
- **THEN** that failure does not count toward the item's breaker

#### Scenario: A set-down posted before an outage is known stands

- **WHEN** an item has failed before the worker twice the same way, in cycles that continued,
  and its third identical failure is a surface failure that the next item's surface failure
  turns into an outage
- **THEN** the third run sets the item down
- **AND** that failure does not count toward the item's breaker once the deferral lifts

#### Scenario: The run that ends the cycle does not set its item down

- **WHEN** an item has failed before the worker twice the same way, in cycles that continued,
  and its third identical failure is the second of two identical failures on different items
  in a row
- **THEN** the cycle ends, and the item is not set down

#### Scenario: A failure that records a cure key does not count

- **WHEN** an item fails before the worker three times in a row, alone in its cycle each time,
  and each run records the same cure key
- **THEN** none of the three counts toward its breaker, and the item is not set down

#### Scenario: The deferral lifts as a handoff's does

- **WHEN** an item was set down by its breaker and a person then replies on it
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

#### Scenario: An excluded failure of another kind does not break the sequence

- **WHEN** an item fails before the worker the same way twice, then fails another way in a cycle
  the outage rule ended, then fails the first way again
- **THEN** that last run sets the item down

#### Scenario: A failure's row holds no message text

- **WHEN** an item's clone fails before the worker with a message that holds a seat's token, the
  model-subscription credential the Igor gives its worker
- **THEN** the row the failure appends to the execution log holds its fields and fingerprint, and
  no part of the message
- **AND** the Igor process's own log holds the message, with `[redacted]` where the token was

#### Scenario: Another role's post does not lift a set-down

- **WHEN** one role has set an item down, and another role posts its own set-down or a comment on
  the item, or adds its label
- **THEN** the first role's set-down stays

#### Scenario: Another role's successful run lifts a set-down

- **WHEN** one role has set an item down, and another role's run on the item opens a pull request
- **THEN** the first role's set-down lifts

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

#### Scenario: A count with one day's file unread sets nothing down

- **WHEN** a run fails before the worker and one day's file of the execution log fails to read
  while the others read
- **THEN** the run is refused and the item is tried again next cycle

### Requirement: Two identical failures before the worker on different items end the cycle

A failure every item meets, such as a full disk or an expired clone token, is not a surface
failure. When two runs in a row, of different items, fail before the worker identically, the
cycle SHALL end, its remaining items SHALL NOT be attempted, and the cycle SHALL be recorded as
failed, as a cycle the outage rule ends is. **Identical** has the meaning *A failure before the
worker that repeats sets the item down* gives it: the same source and the same masked message.
Neither run SHALL count toward its item's breaker.

**A run that records a cure key SHALL take no part in this rule or the outage rule.** It is
never one of the two runs that end a cycle, and it does not separate two runs that are.

**A refused call SHALL take no part in this rule either.** A failure before the worker whose
tracker or code-host call was answered and refused, such as a 403 for a missing permission,
counts toward its own item's breaker only. It is never one of the two runs that end a cycle, so
the in-force scenario *A refusal about the item does not stop the cycle* holds, and it never holds
the discovery watermark below the items after it. Like any failure that is not identical to the
one before it, it separates the runs on either side of it.

The record of a cycle ended by this rule, or by the outage rule, SHALL carry, for each failure it
names, the fields *A failure before the worker that repeats sets the item down* requires of the
breaker's row, and no message text.

An item that meets such a failure alone in its cycle, with no second run to compare, SHALL count
it toward its breaker, once per cycle, unless its run records a cure key (*A failure before the
worker that repeats sets the item down*).

#### Scenario: Two items failing to clone the same way end the cycle

- **WHEN** an item's working tree fails to clone, and the next item's working tree fails to clone
  the same way
- **THEN** the cycle ends, is recorded as failed, and the remaining items are not attempted
- **AND** neither failure counts toward its item's breaker

#### Scenario: The cycle's record carries each failure's fields

- **WHEN** two items in a row fail to clone the same way, with a message that holds a token
- **THEN** the record of the cycle names both items, with each failure's source, exit code and
  fingerprint
- **AND** it holds no part of either message

#### Scenario: A run that records a cure key does not join or split a pair

- **WHEN** an item fails before the worker, the next item's run records a cure key, and the item
  after that fails before the worker the same way as the first
- **THEN** the cycle ends, and neither the first nor the third failure counts toward its item's
  breaker

#### Scenario: Two runs that record a cure key do not end the cycle

- **WHEN** two runs in a row fail before the worker on a tracker call that gets no answer, and
  each records a cure key
- **THEN** neither the outage rule nor this rule ends the cycle

#### Scenario: Two identical refused calls on different items do not end the cycle

- **WHEN** two runs in a row, of different items, fail before the worker because the tracker
  refused adding the claim label, each with the same 403 that is not a rate limit
- **THEN** the cycle continues to the remaining items
- **AND** each failure counts toward its own item's breaker

#### Scenario: Two items failing in different ways do not end the cycle

- **WHEN** two items in a row fail before the worker, in different ways, neither of them a
  surface failure
- **THEN** the cycle continues to the remaining items
- **AND** each failure counts toward its own item's breaker

#### Scenario: An item alone in its cycle counts the failure

- **WHEN** a cycle runs one item, and it fails before the worker in a way every item would
- **THEN** the failure counts once toward that item's breaker
