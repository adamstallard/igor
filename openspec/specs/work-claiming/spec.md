# work-claiming Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: An Igor claims before it starts

Every pickup SHALL take a claim on the tracker before any work begins. An Igor MUST NOT produce
an artifact for an item it has not claimed. This rule MUST NOT be configurable.

#### Scenario: Claim precedes work

- **WHEN** triage returns proceed for an item
- **THEN** a claim is taken before the worker is invoked

#### Scenario: Unclaimed work refused

- **WHEN** a claim cannot be taken for any reason
- **THEN** no work is performed on that item

#### Scenario: Rule not overridable

- **WHEN** configuration attempts to disable claiming
- **THEN** validation fails, because claiming is the coordination mechanism the system exists to provide

### Requirement: Assignment expresses a claim; ordering resolves it

Where a tracker offers a native assignment field, a claim SHALL set it, because that is the
signal humans read. Where a surface offers only messages, a claim SHALL be a post. In both
cases resolution SHALL rely on the storage order of writes, not on any conditional-write
primitive.

#### Scenario: Claim visible in the native field

- **WHEN** an Igor claims an item on a tracker with assignment
- **THEN** the assignee field shows the Igor
- **AND** a human reading the tracker sees the claim without knowing any convention

#### Scenario: No dependence on conditional writes

- **WHEN** a claim is taken on any surface
- **THEN** correctness does not depend on a compare-and-set guarantee from that surface's API

### Requirement: A claim is verified after a settle interval

After claiming, an Igor SHALL wait a configurable settle interval, re-read the item, and stand
down if another party claimed first. Standing down MUST release the Igor's own claim.

#### Scenario: Claim confirmed

- **WHEN** a re-read after the settle interval shows the Igor's claim standing first
- **THEN** work proceeds

#### Scenario: Claim lost to an earlier writer

- **WHEN** a re-read shows another party claimed before the Igor
- **THEN** the Igor stands down, releases its claim, and performs no work
- **AND** the loss is recorded

#### Scenario: Settle interval configurable

- **WHEN** an operator tunes the settle interval
- **THEN** the new value governs subsequent verification

### Requirement: Stop is unconditional and open to anyone

A stop directed at an Igor SHALL take effect immediately, release the claim, and require no
authorization. Stop MUST NOT be gated by identity, permission, or configuration.

#### Scenario: Anyone can stop an Igor

- **WHEN** any party issues a stop for a claimed item
- **THEN** the Igor releases the claim and ceases work on it
- **AND** no permission check is performed

#### Scenario: Stop cannot be disabled

- **WHEN** configuration attempts to restrict who may stop an Igor
- **THEN** validation fails, because stop fails safe and must remain available

#### Scenario: Stop is recorded

- **WHEN** a stop is honoured
- **THEN** the record names who issued it and when

### Requirement: What follows a stop is read from the tracker, not from a second command

After a stop, eligibility SHALL be determined by the tracker's state rather than by any
distinct pause or resume verb.

#### Scenario: A human takes the item

- **WHEN** a human assigns themselves after stopping an Igor
- **THEN** the item is not reclaimed by the Igor

#### Scenario: Nobody takes the item

- **WHEN** an item is stopped and left unassigned
- **THEN** it becomes eligible again after a cooldown
- **AND** it is not permanently removed from the pool

#### Scenario: Explicit go-ahead short-circuits the cooldown

- **WHEN** someone signals on the surface that work may resume
- **THEN** the item becomes eligible immediately

#### Scenario: No second verb exists

- **WHEN** a party wishes to pause rather than stop
- **THEN** they issue a stop
- **AND** resumption follows from tracker state, with no separate pause command defined

### Requirement: A claim that cannot be kept is given back, out loud

`work-claiming` says how a claim is taken, verified, stood down from and stopped. It says nothing
about the run that takes one and then cannot continue, and that silence is the gap: an Igor that
throws while holding a claim leaves the item held, other people told to stand off, and no
explanation.

Where a run holds a claim and cannot go on — the claim could not be finished, or anything after it
failed — the Igor SHALL release the claim and say so on the item. It SHALL NOT end such a run
holding the claim in silence.

**Where the release does not succeed either**, the Igor SHALL say that instead of saying it
released. The item still carries the Igor's name, so a message asserting release would be false
where somebody is looking; what is said SHALL name the item as still held and SHALL name the one
action that frees it.

**A failure of the surface is not a failure of the item.** Where a run ends this way because a
tracker or host did not answer, that SHALL be distinguishable from a refusal about the item
itself, and a cycle meeting **two in a row** SHALL stop rather than attempting the remaining
items. Nothing about the item produced the outcome, so every remaining item would reach the same
one — and doing so speaks on each of them, at a volume that is itself a cause of the failure.

Two, not one, because the run cannot tell the two causes apart: `produce` fails inside the worker
call for a branch the item already owns, while a tracker that does not answer the completion
unassign fails outside it, so neither the error nor how far the run got separates them. How many items they
affect does — an outage fails every item and a bad item fails one — so the count is the
distinction. A cycle that met one and then ran an item cleanly did not fail, and SHALL NOT be
recorded as failed.

**A write says what the surface recorded.** Where the Igor asks a surface to say or to release
something, the answer SHALL carry what was recorded, not merely that no error was raised. A raised
error cannot separate *this did not happen* from *this happened and the answer was lost*, and a
caller that must tell them apart cannot do it from a thrown error alone.

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

- **WHEN** an item's run ends because a surface did not answer and the next item's run does not
- **THEN** the cycle continues and is not recorded as failed

#### Scenario: A refusal about the item does not stop the cycle

- **WHEN** a claim is refused because the tracker did not record it
- **THEN** the cycle continues to the remaining items

