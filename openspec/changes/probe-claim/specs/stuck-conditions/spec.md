## ADDED Requirements

### Requirement: Exactly one Igor takes a due probe, decided by the log after it writes

Where a condition's probe is due, because its cooldown has passed with no probe row holding the
scope, an Igor SHALL take the probe item only when the execution log, read again after its own
probe row has landed, shows that row deciding (defined below). Every other Igor in the scope SHALL
take no item for that probe, except where, at midnight, a write the store accepts after its Igor
gave up on it lands ahead of a row already read as deciding, which this requirement does not
cover. A due probe SHALL eventually be taken
by one Igor while any Igor in the scope keeps running, once appends stop failing, passing their
deadline or landing ahead at midnight, and reads stop being served stale.

The terms, as this requirement uses them:

- A **probe row** is the row an Igor appends to the log to bid for a probe. It names the condition's
  key, the item, and an identifier unique to the row.
- A **void row** names a probe row's identifier, and says that the probe row will produce no run.
- A probe row **ends** with a run row for its item written after it, with a void row naming it, or
  when it **lapses**: when the log shows its Igor can no longer be working it. Whatever rule decides
  a lapse SHALL be one every Igor in the scope judges from the log, such as a row's age against a
  bound every Igor shares. Igors whose clocks differ may disagree on a row near its bound; that
  delays a probe but takes no item twice, since an Igor that still counts the row as holding
  takes no item. Where the rule compares a timestamp in the log with a
  reader's own clock, its bound SHALL exceed the longest a live Igor's row can go without
  whatever keeps it from lapsing, such as a run that has not ended, by at least an assumed
  maximum clock skew between the Igors' hosts of 5 minutes, so that no Igor reads a live
  Igor's row as lapsed; hosts whose clocks
  differ by more are outside what this requirement covers. This requirement does not choose that
  rule. The probe's outcome, which
  *A condition's scope is its cure's scope* and *A condition clears by not recurring, and a probe
  is what observes that* wait for, is whichever of these ends its row.
- A probe row **holds the scope** from when it decides until it ends. While one does, no other
  probe row for that key decides, so no other Igor in the scope takes an item for the probe.
- **Storage order** is the order a fresh read of the log returns its rows: each day's partition in
  line order, earlier days first. Within a day it is the order the store accepted the rows. At
  midnight it can differ, since a row stamped just before midnight goes to the earlier day's
  partition even when the store accepts it after a row in the later day's. Timestamps never
  order rows.
- **The store** is the host that holds the state branch; it accepts or refuses each append to the
  log. A row has **landed** once the store has accepted it.
- The **append deadline** is how long an Igor waits for a probe row's append, including any
  retries of it, before it treats the append as failed. No other append to the log has one.
- The **probe settle interval** is the longer of twice the append deadline and the append
  deadline plus 5 minutes, the clock skew between hosts this requirement assumes, since at midnight
  a slow host's clock can file a row begun after an Igor's own row landed in the earlier day's
  partition, ahead of it. It is not the settle interval of `role-config`.

The append deadline and the probe settle interval SHALL be fixed in Igor's code, not configured.
This is an exception to `role-config`'s *Timing values are configurable with stated defaults*,
which #179's copy of that requirement names among its exceptions.

The rules:

- **An Igor that finds the probe due SHALL append a probe row**, and SHALL take no item until a later
  read decides.
- **That read SHALL be made once the probe settle interval has passed since its row landed**, and
  SHALL show every row the store had accepted by then. Every partition from yesterday on, by the
  reader's clock, SHALL be read fresh, a later day's included where another host has written one;
  an earlier day's, which no row can still reach, may come from a cache.
- **The probe row that decides is the oldest that has not ended**, among the probe rows for the key
  that are newer than the condition's last occurrence, in storage order. The Igor whose row that
  is SHALL take the item, unless one of the rules below stops it.
- **An item that would probe several conditions SHALL probe them one at a time, in the order of
  their keys.** The Igor SHALL append its probe row for the next key only once its row for the
  previous key decides, and SHALL take the item only once its row decides for every key.
- **An Igor that appended a probe row and takes no item SHALL append a void row naming it.** That
  covers losing to an older row, a read that fails, a row that decides for one key and not another,
  and a claim lost to somebody else.
- **An Igor whose probe-row append failed, or whose outcome it cannot tell, SHALL take no item**, and
  SHALL append a void row naming the row it tried to write, since that row may have landed.
- **A void row SHALL end no probe row but the one it names.**

Two Igors in one scope can each read the log as due before either one's probe row lands. Once the
settle interval has passed, every row that can land ahead of an Igor's own in storage order has
landed, with one exception: at midnight, a write the store accepts after its Igor gave up on it,
past the append deadline, can still land ahead, and then two Igors can each read their own row
as deciding. Outside that exception, the oldest unended row is the same for every Igor that
reads the log after its own settle interval. The wait is needed because two appends in flight together can land in either order, and
a read made before both have landed may not show the older one. A void names a row and not an item
because two processes of one role can pick the same item.

#### Scenario: Two Igors find the probe due together

- **WHEN** two Igors in one scope read the probe as due, and each appends a probe row
- **THEN** only the Igor whose row comes first in storage order takes an item
- **AND** the other takes no item and appends a void row naming its own row

#### Scenario: An append in flight is waited for

- **WHEN** an Igor's probe row lands while another Igor's append is still in flight, and that append
  lands ahead of it within the append deadline
- **THEN** the first Igor's read, made after the probe settle interval, shows the other row, and only
  the Igor whose row is older takes an item

#### Scenario: A reader's clock within the skew does not lapse a live row

- **WHEN** a probe row's Igor is still working its item, and another Igor's clock runs 5 minutes
  ahead of the first Igor's host
- **THEN** that other Igor does not read the row as lapsed

#### Scenario: A row accepted late into yesterday's partition is read

- **WHEN** an Igor has read yesterday's partition before another Igor's probe row, stamped just
  before midnight, is accepted into it within the append deadline
- **THEN** the first Igor's read that decides reads that partition again rather than reuse its
  earlier read, and shows the late row

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

- **WHEN** an Igor's item would probe both a role's condition and a seat's, and the role's key
  sorts first
- **THEN** it appends its probe row for the role's key, and appends one for the seat's key only
  once that row decides
- **AND** where its seat row then does not decide, it takes no item and voids both rows

#### Scenario: A probe row nobody is taking does not hold the scope

- **WHEN** the probe that decided ends with a run that observed nothing, or with its void row, and
  other Igors' probe rows are still in the log
- **THEN** none of those rows holds the scope, because each was voided by the Igor that wrote it,
  and the next item may probe

#### Scenario: An append past its deadline counts as failed

- **WHEN** an Igor's probe-row append has not landed by the append deadline
- **THEN** it takes no item, and appends a void row naming the row it tried to write

#### Scenario: Every Igor waits the same probe intervals

- **WHEN** two Igors in a scope run roles whose configurations set different intervals
- **THEN** both use the same append deadline and probe settle interval, the ones Igor's code
  fixes

#### Scenario: A row whose Igor died lapses

- **WHEN** an Igor dies after its probe row decided, before its run row or void row
- **THEN** the row holds the scope until it lapses, and every Igor in the scope then reads it as
  ended

#### Scenario: A due probe is taken

- **WHEN** a probe is due and an Igor in the scope keeps running
- **THEN** one Igor takes the probe item, once appends stop failing, passing their deadline or
  landing ahead at midnight, and reads stop being served stale
