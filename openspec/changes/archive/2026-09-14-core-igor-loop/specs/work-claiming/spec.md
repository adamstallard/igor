## ADDED Requirements

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
