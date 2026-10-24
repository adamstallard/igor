## ADDED Requirements

### Requirement: Exactly one Igor takes a due probe, decided by the log after it writes

Where a condition's probe is due, an Igor SHALL take the probe item only when the execution log,
read again after its own probe row has landed, shows that row deciding. Every other Igor in the
scope SHALL take no item for that probe, and a due probe SHALL eventually be taken by one Igor
while any Igor in the scope keeps running.

The terms, as this requirement uses them:

- A **probe row** is the row an Igor appends to the log to bid for a probe. It names the condition's
  key, the item, and an identifier unique to the row.
- A **void row** names a probe row's identifier, and says that the probe row will produce no run.
- A probe row **ends** with a run row for its item written after it, with a void row naming it, or
  when it **lapses**: when the log shows its Igor can no longer be working it. Whatever rule decides
  a lapse SHALL be one every Igor in the scope judges alike from the log. The probe's outcome, which
  *A condition's scope is its cure's scope* and *A condition clears by not recurring, and a probe
  is what observes that* wait for, is whichever of these ends its row.
- The **append deadline** is how long an Igor waits for an append, retries included, before it
  treats the append as failed.
- The **probe settle interval** is longer than the append deadline. It is not the claim settle
  interval of `role-config`.

The rules:

- **An Igor that finds the probe due SHALL append a probe row**, and SHALL take no item until a later
  read decides.
- **That read SHALL be made once the probe settle interval has passed since its row landed**, and
  SHALL show every row the store had accepted by then, with no part of the log served from an
  earlier read.
- **The probe row that decides is the oldest that has not ended**, among the probe rows for the key
  that are newer than the condition's last occurrence, in storage order: the order in which the
  store accepted the rows, never their timestamps. The Igor whose row that is SHALL take the item.
- **An Igor that probes several conditions with one item SHALL take it only where its row decides for
  every one of them.**
- **An Igor that appended a probe row and takes no item SHALL append a void row naming it.** That
  covers losing to an older row, a read that fails, a row that decides for one key and not another,
  and a claim lost to somebody else.
- **An Igor whose probe-row append failed, or whose outcome it cannot tell, SHALL take no item**, and
  SHALL append a void row naming the row it tried to write, since that row may have landed.
- **A void row SHALL end no probe row but the one it names.**

Two Igors in one scope can each read the log as due before either one's probe row lands. Once the
settle interval has passed, no row can land ahead of an Igor's own: rows still to come land after
it. So the oldest unended row is the same for every Igor that reads the log after its own settle
interval. The wait is needed because two appends in flight together can land in either order, and
a read made before both have landed may not show the older one. A void names a row and not an item
because two processes of one role can pick the same item.

#### Scenario: Two Igors find the probe due together

- **WHEN** two Igors in one scope read the probe as due, and each appends a probe row
- **THEN** only the Igor whose row the store accepted first takes an item
- **AND** the other takes no item and appends a void row naming its own row

#### Scenario: An append in flight is waited for

- **WHEN** an Igor's probe row lands while another Igor's append is still in flight, and that append
  lands ahead of it within the append deadline
- **THEN** the first Igor's read, made after the probe settle interval, shows the other row, and only
  the Igor whose row is older takes an item

#### Scenario: A row that lands later does not change who decides

- **WHEN** an Igor's probe row is the oldest that has not ended, and another Igor's row lands after
  it
- **THEN** the first Igor's row still decides, for every Igor that reads both

#### Scenario: A void ends only the row it names

- **WHEN** two processes of one role append probe rows naming the same item, and the one that lost
  appends its void row
- **THEN** the winner's probe row still holds the scope until its own run row or void row lands

#### Scenario: A failed append takes no item

- **WHEN** an Igor's probe-row append fails, or it cannot tell whether the append landed
- **THEN** it takes no item, and appends a void row naming the row it tried to write

#### Scenario: A failed read or a lost claim voids the row

- **WHEN** an Igor's read after the settle interval fails, or its row decides and its claim on the
  item is lost to somebody else
- **THEN** it takes no item, and appends a void row naming its row

#### Scenario: One item probing two conditions

- **WHEN** an Igor's item would probe both a role's condition and a seat's, and its row decides for
  the role's key but not the seat's
- **THEN** it takes no item, and voids both rows

#### Scenario: A probe row nobody is taking does not hold the scope

- **WHEN** the probe that decided ends with a run that observed nothing, or with its void row, and
  other Igors' probe rows are still in the log
- **THEN** none of those rows holds the scope, because each was voided by the Igor that wrote it,
  and the next item may probe

#### Scenario: A row whose Igor died lapses

- **WHEN** an Igor dies after its probe row decided, before its run row or void row
- **THEN** the row holds the scope until it lapses, and every Igor in the scope then reads it as
  ended

#### Scenario: A due probe is taken

- **WHEN** a probe is due and an Igor in the scope keeps running
- **THEN** one Igor takes the probe item, after however many appends are lost, late or read stale,
  so long as their number is finite
