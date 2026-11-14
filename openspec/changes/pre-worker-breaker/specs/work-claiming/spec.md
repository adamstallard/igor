## ADDED Requirements

### Requirement: Only a tracker or code host failing counts as the surface failing

A run SHALL count toward *Two runs in a row that the surface failed stop a cycle*, the *outage
rule*, only where a tracker or code-host call got no answer: no status, a 5xx, a 408, a 429, or a
403 for a rate limit. A call answered and refused, a working-tree failure and a failure in the
Igor's own code SHALL NOT count, save a clone or its token mint the code host did not answer. Which surface failed SHALL be known from the call, never from the error's wording.

#### Scenario: A working tree that cannot be provisioned is not a surface failure

- **WHEN** an item's run fails because its working tree could not be cloned onto a full disk, and
  the next item's run fails in its working tree in a different way
- **THEN** the cycle continues to the remaining items and is not recorded as failed

#### Scenario: A tracker that does not answer is still a surface failure

- **WHEN** two runs in a row fail because a call to the tracker got no answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A rate limit is a surface failure

- **WHEN** two runs in a row fail because the tracker answered a call with a 429, or with a 403
  that says it is a rate limit
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A refusal is not an outage

- **WHEN** two runs in a row fail because the tracker answered and refused a call, each with a
  403 that is neither a rate limit nor a permission the App lacks, and with different messages
- **THEN** the outage rule does not end the cycle
- **AND** each failure counts toward its own item's count of failures before the worker, its
  *breaker* (*A failure before the worker that repeats sets the item down*)

#### Scenario: A clone the code host does not answer is a surface failure

- **WHEN** two runs in a row fail to clone because the code host did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: A clone whose failure cannot be told unanswered is a working-tree failure

- **WHEN** two runs in a row fail to clone, with different messages, and the tree provider cannot
  tell that the code host did not answer
- **THEN** the outage rule does not end the cycle

#### Scenario: A token mint that fails inside a clone is not a surface failure

- **WHEN** two runs in a row fail to clone because the code host refused the token mint inside
  the clone, with different messages
- **THEN** the outage rule does not end the cycle

#### Scenario: A token mint inside a clone that gets no answer is a surface failure

- **WHEN** two runs in a row fail to clone because the code host did not answer the token mint
  inside the clone, with different messages
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

- **WHEN** `igor run`'s cycle meets two runs in a row that fail because a call to the tracker got
  no answer, with different messages
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

A run *fails before the worker* when it ends in failure, thrown or returned, after its claim began,
its *claim window* included, and before the worker started; by default it is refused. The Igor SHALL count
an item's failures before the worker for its own role, the item's *breaker*. At the third
identical one in a row it SHALL instead hand the item back deferred, which is to *set the item
down*, and only that run's post SHALL say it has stopped retrying and what brings the item back.

#### Scenario: The first two identical failures are retried

- **WHEN** an item the Igor's own search found, not one a person handed over, fails to clone its working tree the same way on two consecutive runs
- **THEN** each run hands the claim back saying it will try again next cycle
- **AND** the item is claimed again next cycle

#### Scenario: The third identical failure sets the item down

- **WHEN** an item's working tree fails to clone the same way on a third consecutive run
- **THEN** the run hands the item back deferred, saying it has stopped retrying and what brings
  the item back
- **AND** the item is not claimed next cycle

#### Scenario: A repeated failure in the claim window sets the item down

- **WHEN** a tracker call in the claim window gets no answer, the same way, on three
  consecutive runs of an item, in cycles that continued to other items
- **THEN** the third run releases the claim and says the Igor has stopped retrying
- **AND** the item is not claimed next cycle

#### Scenario: The set-down is said even where the claim message never landed

- **WHEN** the third identical failure in the claim window is the failure to post the claim
  message
- **THEN** the run still posts the withdrawal, saying the Igor has stopped retrying
- **AND** it removes the role's label

#### Scenario: A catch-up's set-down keeps a person's label

- **WHEN** a catch-up on an issue whose `igor:<role>` label a person added fails before the worker
  the same way a third time in a row
- **THEN** the item is set down, and the person's label stays on it, as releasing a catch-up's
  claim leaves it

#### Scenario: A failure of `igor run --claim` counts toward the breaker

- **WHEN** an item failed before the worker the same way twice under `igor serve`, and then
  `igor run --claim` on it fails the same way
- **THEN** the `igor run --claim` run sets the item down
- **AND** it ends no cycle, and no `outage` row excludes it

#### Scenario: Each role counts its own failures

- **WHEN** an item fails before the worker the same way twice for one role and once for another
- **THEN** neither role sets the item down

#### Scenario: A returned failure is retried like a thrown one

- **WHEN** a run's `execute` returns a failure before the worker, such as a catch-up's merge that
  fails, on two consecutive runs of an item
- **THEN** each run gives the claim back to be tried again next cycle, and neither sets the item
  down

### Requirement: A post about a failure before the worker names it without quoting it

What a run posts for a failure before the worker, whether it gives the claim back to be tried
again or sets the item down, SHALL name the kind of failure in plain words: where it failed, and
its HTTP status or exit code where it has one. It SHALL NOT quote the error message, which goes
only to the Igor process's own log.

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

#### Scenario: A claim-window refusal is named in plain words

- **WHEN** a run's claim-window failure, the first for its item, is a tracker call that answered
  with HTTP 500
- **THEN** the withdrawal it posts says the tracker failed, with HTTP 500, and that it will try
  again next cycle

### Requirement: One set-down per deferral

A run SHALL NOT post a set-down on an item whose set-down by its role has not lifted. It SHALL
give the claim back without one, and its post SHALL NOT say that it will try again next cycle.

#### Scenario: An item already deferred is not set down again

- **WHEN** an item's role set it down, and before the set-down lifts `igor run --claim` on the
  item fails the same way
- **THEN** the run posts no set-down, and the item stays deferred
- **AND** its post does not say that it will try again next cycle

### Requirement: Identical failures share a source and a masked message

Two failures before the worker are *identical* where their sources and masked messages match. The
source SHALL be the tracker, the code host, the working tree or the Igor's own code: a thrown
failure's from its call, a returned one's from its step, otherwise the Igor's. Masking SHALL
replace item references, repository names, timestamps, temporary paths, the tree's among
them, hexadecimal identifiers and runs of four or more digits, keeping shorter runs, which hold
statuses and exit codes.

#### Scenario: Failures that differ only in their variable parts are identical

- **WHEN** an item's clone fails three runs in a row with messages that differ only in the
  working tree's temporary path and a timestamp
- **THEN** the third run sets the item down

#### Scenario: The same failure on two items is identical

- **WHEN** two items' clones fail with messages that differ only in each item's repository name
  and issue number
- **THEN** the two failures are identical

#### Scenario: A Linear issue key is masked

- **WHEN** two items' tracker calls fail with messages that differ only in each item's Linear
  issue key, such as `ENG-123` and `ENG-4`
- **THEN** the two failures are identical

#### Scenario: Request ids and process ids are masked

- **WHEN** an item's clone fails three runs in a row with messages that differ only in a
  hexadecimal request id and a five-digit process id
- **THEN** the third run sets the item down

#### Scenario: Failures with different HTTP statuses are not identical

- **WHEN** an item's tracker call fails before the worker twice with HTTP 404, then once with
  HTTP 500, with messages otherwise the same
- **THEN** the item is not set down, and the newest failure is the first of its count

#### Scenario: Trees of different slots mask alike

- **WHEN** an item's clone fails the same way in two worker slots in turn, with messages that
  differ only in the path of each slot's working tree
- **THEN** the two failures are identical, and both count toward the item's breaker

#### Scenario: A returned failure carries its step's source

- **WHEN** a run's `execute` returns a failure before the worker from a step in the working tree
- **THEN** the failure's source is `tree`

#### Scenario: A returned failure with no source is the Igor's own

- **WHEN** a run's `execute` returns a failure before the worker that carries no source
- **THEN** the failure's source is `igor`

### Requirement: Only a worker start or a different counted failure starts the count again

A run of the item that started the worker, whether or not it records a cure key, and a failure
before the worker that counts and is not identical, SHALL start the item's count again. An edit,
a reply, and a failure before the worker that does not count SHALL NOT: the count passes over
them. So once a deferral lifts, an identical failure sets the item down again at once.

#### Scenario: A different failure starts the count again

- **WHEN** an item failed before the worker twice in one way and then once in another
- **THEN** the item is not set down, and the newest failure is the first of its count

#### Scenario: A run that started the worker starts the count again

- **WHEN** an item failed before the worker twice, then a run of it started the worker, then it
  failed before the worker in the first way again
- **THEN** the item is not set down

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

#### Scenario: An identical failure after the deferral lifts sets it down at once

- **WHEN** an item set down by its breaker is claimed again after its deferral lifted, and fails
  before the worker in the same way
- **THEN** that run sets it down again, without two more retries

### Requirement: The breaker's count is rebuilt from the execution log

The count SHALL be rebuilt from the execution log, `executions.ndjson` on the state branch, never
held only in memory, so it survives a restart. A count that cannot be read, including one where
any part of the log failed to read, SHALL set nothing down: the run is refused, and its failure's
row is still written.

#### Scenario: The count survives a restart

- **WHEN** an item failed before the worker twice, the Igor restarts, and the item fails the same
  way again
- **THEN** the item is set down

#### Scenario: A count that cannot be read sets nothing down

- **WHEN** a run fails before the worker and the execution log cannot be read
- **THEN** the run is refused and the item is tried again next cycle
- **AND** the run still appends its failure's row

#### Scenario: A count with one day's file unread sets nothing down

- **WHEN** a run fails before the worker and one day's file of the execution log fails to read
  while the others read
- **THEN** the run is refused and the item is tried again next cycle

### Requirement: The breaker's row holds no message text

Each failure before the worker SHALL append a row to the execution log holding only: the item and
the role; the cycle and the time; the row's kind; the source (`tracker`, `code-host`, `tree` or
`igor`); any HTTP status or exit code; whether the run recorded a cure key; and an unkeyed
fingerprint of the masked message. The full message SHALL go to the process's own log after
*Credential redaction replaces every credential the Igor knows*, and the masks SHALL run on that
redacted text.

#### Scenario: A failure's row holds no message text

- **WHEN** an item's clone fails before the worker with a message that holds a seat's token, the
  model-subscription credential the Igor gives its worker
- **THEN** the row the failure appends to the execution log holds its fields and fingerprint, and
  no part of the message
- **AND** the Igor process's own log holds the message, with `[redacted]` where the token was

#### Scenario: The masks run after redaction

- **WHEN** two failures of an item hold different seat tokens in otherwise identical messages
- **THEN** both tokens are redacted before masking, and the two failures are identical

### Requirement: An outage is not the item's failure

A failure in a cycle the outage rule then ended, and either of the two runs that end a cycle under
*Two identical failures before the worker on different items end the cycle*, SHALL NOT count
toward a later count of any item. The breaker SHALL decide and post during the failing run. A run
known during that run to be the second of the two SHALL NOT count or set its item down; a set-down
posted for a failure later found part of an outage stands, and lifts like any other.

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

### Requirement: A cycle a two-in-a-row rule ends is recorded without message text

A cycle that the outage rule or *Two identical failures before the worker on different items end
the cycle* ends SHALL append an `outage` row naming each failure it excludes, with the fields *The
breaker's row holds no message text* lists and no message text.

#### Scenario: The cycle's record carries each failure's fields

- **WHEN** two items in a row fail to clone the same way, with a message that holds a token
- **THEN** the record of the cycle names both items, with each failure's source, exit code and
  fingerprint
- **AND** it holds no part of either message

#### Scenario: Two items failing the same way are named alone

- **WHEN** a cycle's third item fails to clone one way, and its fourth and fifth items then fail
  before the worker identically, ending the cycle
- **THEN** the `outage` row names the fourth and fifth items only

### Requirement: A fault in the Igor's own setup is not the item's failure

A failure whose run records a *cure key*, `stuck-conditions`' record of a fault in the Igor's
own setup naming what would cure it, SHALL NOT count toward any item's breaker, and its row SHALL
say it recorded one. A call the tracker or code host refuses because the GitHub App lacks a
permission is such a fault: once the refusal can be told from others, its run SHALL record a cure
key naming the permission, scoped to the role; until then it counts as a refused call.

#### Scenario: A failure that records a cure key does not count

- **WHEN** an item fails before the worker three times in a row, alone in its cycle each time,
  and each run records the same cure key
- **THEN** none of the three counts toward its breaker, and the item is not set down
- **AND** each run's `pre-worker` row says it recorded a cure key

#### Scenario: A permission 403 that cannot be told counts as a refused call

- **WHEN** the GitHub App lacks the permission to add the claim label, and a 403 for it cannot yet
  be told from other 403s
- **THEN** each refused claim counts toward its own item's breaker, as a refused call does

#### Scenario: A missing App permission sets no item down

- **WHEN** the GitHub App lacks the permission to add the claim label, a 403 for it can be told
  from other 403s, and items' claims are refused with that 403 until the key's condition stops
  the role from taking new items
- **THEN** each run records a cure key naming the permission, scoped to the role, none of the
  failures counts toward its item's breaker, and no item is set down

### Requirement: A set-down lifts on a person's change or another role's successful run

A set-down SHALL lift as `work-triage`'s *An item handed back is not re-worked until something
answers* defers to here: on a reply or an edit to the item from anyone but an Igor, or on another
role's successful run on it, such as a pull request that role opened for the item, once a role can
tell one from its other posts. An Igor's other posts SHALL NOT lift it, nor its edits once an
edit's author can be told.

#### Scenario: A person's reply lifts a set-down

- **WHEN** an item was set down by its breaker and a person then replies on it
- **THEN** it is claimed again

#### Scenario: A person's edit lifts a set-down

- **WHEN** an item was set down by its breaker and a person then retitles it
- **THEN** it is claimed again

#### Scenario: Any edit lifts a set-down until an edit's author can be told

- **WHEN** one role has set an item down, another role adds its label, and an edit's author cannot
  yet be told
- **THEN** the first role's set-down lifts

#### Scenario: Another role's post does not lift a set-down

- **WHEN** one role has set an item down, and another role posts its own set-down or a comment on
  the item
- **THEN** the first role's set-down stays

#### Scenario: Another role's successful run lifts a set-down

- **WHEN** one role has set an item down, and another role's run on the item opens a pull request
- **THEN** the first role's set-down lifts

### Requirement: Two identical failures before the worker on different items end the cycle

When two runs in a row, of different items, fail before the worker identically, counted in the
order they end, the cycle SHALL end and be recorded as failed. A run that records a cure key, a
refused call's included, is neither one of the two nor between them. Any other refused call, a
tracker or code-host call outside the working tree answered and refused, SHALL NOT be one of the two, and separates them as a different failure would. An item alone in its cycle that fails so SHALL count it.

#### Scenario: Two items failing to clone the same way end the cycle

- **WHEN** an item's working tree fails to clone, and the next item's working tree fails to clone
  the same way
- **THEN** the cycle ends, is recorded as failed, and the remaining items are not attempted
- **AND** neither failure counts toward its item's breaker

#### Scenario: A run that records a cure key does not join or split a pair

- **WHEN** an item fails before the worker, the next item's run records a cure key, and the item
  after that fails before the worker the same way as the first
- **THEN** the cycle ends, and neither the first nor the third failure counts toward its item's
  breaker

#### Scenario: Two runs that record a cure key do not end the cycle

- **WHEN** two runs in a row, of different items, fail before the worker identically in their
  working trees, and each records a cure key
- **THEN** the cycle continues to the remaining items

#### Scenario: Two identical refused calls on different items do not end the cycle

- **WHEN** two runs in a row, of different items, fail before the worker because the tracker
  answered adding the claim label with the same 404, the items having been deleted since
  discovery
- **THEN** the cycle continues to the remaining items
- **AND** each failure counts toward its own item's breaker (*A failure before the worker that
  repeats sets the item down*)

#### Scenario: Identical failures are paired in the order their runs end

- **WHEN** the runs in worker slots 1 and 2 fail before the worker identically on different items,
  and the run in slot 2 ends first
- **THEN** the run in slot 1 is the second of the pair, ends the cycle and does not count

#### Scenario: A refused call between two identical failures separates them

- **WHEN** an item fails before the worker, the next item's claim is answered and refused, and the
  item after that fails before the worker the same way as the first
- **THEN** the cycle continues to the remaining items

#### Scenario: Two items failing in different ways do not end the cycle

- **WHEN** two items in a row fail before the worker, in different ways, neither of them a
  surface failure
- **THEN** the cycle continues to the remaining items
- **AND** each failure counts toward its own item's breaker (*A failure before the worker that
  repeats sets the item down*)

#### Scenario: An item alone in its cycle counts the failure

- **WHEN** a cycle runs one item, and it fails before the worker in a way every item would
- **THEN** the failure counts once toward that item's breaker

## MODIFIED Requirements

### Requirement: Two runs in a row that the surface failed stop a cycle

Where a run ends because a tracker or code host did not answer, that SHALL be distinguishable
from a refusal about the item. Two such runs in a row SHALL stop the cycle from attempting its
remaining items, counting runs in the order they end, each toward the cycle running when it ends
or, where none is, the next; a run that records a cure key is neither one of the two nor between
them. A cycle that met one such run, then one ending otherwise without a cure key, SHALL NOT be
recorded as failed.

#### Scenario: Runs that end out of order are counted as they end

- **WHEN** the workers in slots 1 and 2 end, one after the other, because GitHub did not answer,
  while a cycle runs
- **THEN** that cycle claims no further item and is recorded as failed

#### Scenario: A failure after a clean run starts the count again

- **WHEN** a run ends because a surface did not answer, the next run to end finishes cleanly, and
  a third ends because a surface did not answer
- **THEN** no cycle is stopped for those runs

#### Scenario: A run that records a cure key between two unanswered runs does not separate them

- **WHEN** a run ends because the tracker did not answer, the next run records a cure key, and the
  run after that ends because the tracker did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: Two unanswered runs that record a cure key do not stop the cycle

- **WHEN** two runs in a row end because the tracker did not answer, and each records a cure key
- **THEN** the cycle goes on to its remaining items

### Requirement: A claim that cannot be kept is given back, out loud

Where a run holds a claim and cannot go on, the Igor SHALL release the claim and say so on the
item, never holding it in silence. A run that finishes SHALL release its claim too, leaving its
artifact and the item open, whatever the role sets. Releasing SHALL leave a person's holder entry
in place where the run brought the Igor's own artifact up to date, unless a person stopped the
Igor. Where the release fails, the Igor SHALL say the item is still held and name the one action
that frees it.

#### Scenario: A finished run releases its claim

- **WHEN** a run publishes its work and finishes
- **THEN** the Igor releases its claim and leaves the artifact in place
- **AND** it does not close the item

#### Scenario: A claim that could not be announced is given back

- **WHEN** a claim is recorded and the message announcing it fails
- **THEN** the claim is released and the run is refused, or, on the item's third identical
  failure before the worker, set down as *A failure before the worker that repeats sets the item
  down* says
- **AND** the item is not left held with nothing said

#### Scenario: A claim that could not be verified is given back and withdrawn

- **WHEN** a claim was announced and verifying it fails
- **THEN** the claim is released, the announcement is withdrawn on the item, and the run is refused

#### Scenario: A release that did not take is said so

- **WHEN** a claim cannot be kept and releasing it does not clear the holder
- **THEN** what is said names the item as still held rather than as released
- **AND** it names the action that frees it

#### Scenario: A failure after the claim hands the item back

- **WHEN** a run holding a claim fails at any point after taking it
- **THEN** the claim is handed back with an explanation on the item

#### Scenario: A cycle stops when the surface stops answering

- **WHEN** two runs in a row end because a surface did not answer, as *Two runs in a row that the
  surface failed stop a cycle* counts them
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: One run ending that way does not stop the cycle

- **WHEN** a run ends because a surface did not answer and the next run to end does not
- **THEN** the cycle continues and is not recorded as failed

#### Scenario: A refusal about the item does not stop the cycle

- **WHEN** a claim is refused because the tracker did not record it
- **THEN** the cycle continues to the remaining items

#### Scenario: A catch-up gives its claim back and keeps a person's label

- **WHEN** an Igor brings its own pull request up to date on an issue whose `igor:<role>` label a
  person added, and the run ends other than by a stop
- **THEN** the label is still on the issue afterwards
- **AND** once that pull request closes, the label directs the Igor as for any hand-over

#### Scenario: A stop during a catch-up takes the label off

- **WHEN** a person stops an Igor while it brings its own pull request up to date on an issue
  whose `igor:<role>` label a person added
- **THEN** the label is removed, and the stop receipt says the Igor released the issue
- **AND** adding the label again later hands the issue over again
