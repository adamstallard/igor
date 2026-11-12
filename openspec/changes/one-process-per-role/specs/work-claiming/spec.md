## ADDED Requirements

### Requirement: Two runs in a row that the surface failed stop a cycle

Where a run ends because a tracker or code host did not answer, that SHALL be distinguishable
from a refusal about the item. Two such runs in a row SHALL stop the cycle from attempting its
remaining items, counting runs in the order they end, each toward the cycle running when it ends
or, where none is, the next. A cycle that met one such run, and then a run that ended otherwise, SHALL NOT
be recorded as failed.

#### Scenario: Runs that end out of order are counted as they end

- **WHEN** the workers in slots 1 and 2 end, one after the other, because GitHub did not answer,
  while a cycle runs
- **THEN** that cycle claims no further item and is recorded as failed

#### Scenario: A failure after a clean run starts the count again

- **WHEN** a run ends because a surface did not answer, the next run to end finishes cleanly, and
  a third ends because a surface did not answer
- **THEN** no cycle is stopped for those runs

### Requirement: A write says what the surface recorded

Where the Igor asks a surface to say or to release something, the answer SHALL carry what the
surface recorded, not merely that no error was raised, because a raised error cannot tell *this
did not happen* from *this happened and the answer was lost*.

#### Scenario: A release whose answer was lost is read back

- **WHEN** the Igor releases a claim and the answer is lost after GitHub removed the label
- **THEN** what the Igor acts on says the label is gone, and it does not report the claim as held

## MODIFIED Requirements

### Requirement: A claim is verified after a settle interval

After claiming, an Igor SHALL wait the settle interval, re-read the item, and stand down if
another party holds it, removing only what names itself; on a single-valued holder field it SHALL
instead post that it is handing the item back. A handed-over item SHALL take no settle interval. The
re-read SHALL look for a stop said since the cycle that chose the item read it, or since the
hand-over. A later go-ahead SHALL lift a stop on an item the Igor's search found, not on one handed
over.

#### Scenario: Claim confirmed

- **WHEN** a re-read after the settle interval shows the Igor still holding the claim
- **THEN** work proceeds

#### Scenario: Claim lost to an earlier writer

- **WHEN** a re-read shows another party holds the item
- **THEN** the Igor stands down and performs no work
- **AND** the loss is recorded

#### Scenario: Losing Igor leaves a single-valued field alone

- **WHEN** an Igor loses a claim on a single-valued holder field
- **THEN** it does not clear or change the field
- **AND** it posts a reply saying it is handing the item back

#### Scenario: Losing Igor removes itself from a list

- **WHEN** an Igor loses a claim on a holder field that holds a list
- **THEN** it removes its own entry and leaves every other holder in place

#### Scenario: Settle interval configurable

- **WHEN** an operator tunes the settle interval
- **THEN** the new value governs subsequent verification

#### Scenario: A stop said while the cycle worked another item

- **WHEN** a cycle chooses two items, and somebody says stop on the second after the cycle read
  it and before the Igor claims it, as while the cycle claims the first
- **THEN** the claim on the second sees the stop, and the Igor stands down with a receipt

#### Scenario: A stop answered by a go-ahead before the claim

- **WHEN** somebody says stop on an item the Igor's search found, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the claim holds and the run is not stopped by that stop

### Requirement: A claim that cannot be kept is given back, out loud

Where a run holds a claim and cannot go on, the Igor SHALL release the claim and say so on the
item, never holding it in silence. A run that finishes SHALL release its claim too, leaving its
artifact and the item open; no role setting changes this. Releasing SHALL leave
the holder entry a person set in place where the run brought the Igor's own artifact up to date, unless a
person stopped the Igor. Where the release fails, the Igor SHALL say the item is still held and
name the one action that frees it.

#### Scenario: A finished run releases its claim

- **WHEN** a run publishes its work and finishes
- **THEN** the Igor releases its claim and leaves the artifact in place
- **AND** it does not close the item

#### Scenario: A claim that could not be announced is given back

- **WHEN** a claim is recorded and the message announcing it fails
- **THEN** the claim is released and the run is refused
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

- **WHEN** two runs in a row end because a surface did not answer
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
