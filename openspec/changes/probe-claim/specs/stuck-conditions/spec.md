## ADDED Requirements

### Requirement: The read that decides a probe is fresh, in storage order

Storage order is the order a fresh read of the log returns rows: UTC-day partitions, earlier
first, each in the order the store (the state branch's host) accepted them. A row goes to its
writer's clock's day and lands once accepted; timestamps never order rows. The read that decides
SHALL show every row landed before it, reading fresh every partition from the reader's yesterday
on and any later one another host wrote, and SHALL fail as a whole if any cannot be read.

#### Scenario: A row accepted late into yesterday's partition is read

- **WHEN** an Igor has read yesterday's partition before another Igor's probe row, stamped just
  before midnight, is accepted into it within the append deadline
- **THEN** the first Igor's read that decides reads that partition again rather than reuse its
  earlier read, and shows the late row

#### Scenario: A later day's partition from a host whose clock is ahead is read

- **WHEN** another Igor's host, whose clock is ahead of the reader's, has filed a probe row in a
  partition dated after the reader's today
- **THEN** the reader's read that decides reads that partition fresh, and shows the row

#### Scenario: A partition that cannot be read fails the read

- **WHEN** one of the partitions from yesterday on cannot be read during the read that decides
- **THEN** the read fails as a whole, and the Igor takes no item and appends a void row naming
  its row

#### Scenario: A row landed in today's partition is read

- **WHEN** another Igor's probe row landed in today's partition before the read that decides
- **THEN** that read shows the row

### Requirement: An item that would probe several conditions bids for them one at a time

A probe row names one condition's key, the item and an identifier unique to the row. An item that
would probe several conditions SHALL probe them one at a time, in the order of their keys. The Igor
SHALL append its probe row for the next key only once its row for the previous key decides, and
SHALL take the item only once its row decides for every key.

#### Scenario: One item probing two conditions

- **WHEN** an Igor's item would probe both a role's condition and a seat's, and the role's key
  sorts first
- **THEN** it appends its probe row for the role's key, and appends one for the seat's key only
  once that row decides
- **AND** where its seat row then does not decide, it takes no item and voids both rows

### Requirement: A probe row ends with its run, its own void row or its lapse

A probe row ends with a run row for its item written after it, a void row naming its identifier
saying it will produce no run, or its lapse under the one lapse rule every Igor in the scope
applies. A probe row decides when it is the oldest unended one for its key newer than the condition's
last occurrence, in storage order, and SHALL hold the scope from then until it ends; while it does,
no other probe row for its key decides, save one that lands ahead of it at midnight.

#### Scenario: How a probe row ends is the probe's outcome

- **WHEN** a probe row that decided ends
- **THEN** how it ended is the probe's outcome that *A condition's scope is its cure's scope* and
  *A condition clears by not recurring, and a probe is what observes that* wait for

#### Scenario: A row whose Igor died lapses

- **WHEN** an Igor dies after its probe row decided, before its run row or void row
- **THEN** the row holds the scope until it lapses, and every Igor in the scope then reads it as
  ended

### Requirement: A probe's append deadline and settle interval are fixed in code

The append deadline is how long an Igor waits for a probe row's append, retries too, before
treating it as failed; this requirement sets none for other appends, nor bars one. The probe settle
interval is the longer of twice the append deadline and the deadline plus 5 minutes, and is not the
claim settle interval `role-config` configures for `work-claiming`. Both SHALL be fixed in code,
not configured, as an exception to `role-config`'s *Timing values are configurable with stated
defaults*.

#### Scenario: An append past its deadline counts as failed

- **WHEN** an Igor's probe-row append has not landed by the append deadline
- **THEN** it takes no item, and appends a void row naming the row it tried to write

#### Scenario: The settle interval covers a row stamped before midnight on a slow clock

- **WHEN** Igor B's probe row lands just after midnight, and Igor A, whose clock runs up to 5
  minutes slower than B's, begins a probe row up to 5 minutes later and stamps it before
  midnight, and A's append lands within the append deadline
- **THEN** A's row is ahead of B's in storage order, and B's read after the probe settle interval
  shows it

#### Scenario: Every Igor waits the same probe intervals

- **WHEN** two Igors in a scope run roles whose configurations set different intervals
- **THEN** both use the same append deadline and probe settle interval, the ones Igor's code
  fixes

#### Scenario: A short append deadline sets the settle interval at it plus 5 minutes

- **WHEN** the append deadline is 3 minutes
- **THEN** the probe settle interval is 8 minutes

#### Scenario: A long append deadline sets the settle interval at twice it

- **WHEN** the append deadline is longer than 5 minutes
- **THEN** the probe settle interval is twice the append deadline

### Requirement: Exactly one Igor takes a due probe, decided by the log after it writes

An Igor that finds a condition's probe due SHALL append a probe row and, a probe settle interval
after it lands, reread the log. It SHALL take the item only if that read shows its row deciding,
and then SHALL take it unless its append failed or may have failed, its claim is lost, or its row
does not decide for every key. No other Igor in the scope SHALL take an item for that probe, save
where, at midnight, a write accepted after its Igor gave up lands ahead of a row already read as
deciding.

#### Scenario: Two Igors find the probe due together

- **WHEN** two Igors in one scope read the probe as due, and each appends a probe row
- **THEN** only the Igor whose row comes first in storage order takes an item
- **AND** the other takes no item and appends a void row naming its own row

#### Scenario: An append in flight is waited for

- **WHEN** an Igor's probe row lands just after midnight while another Igor's append, stamped just
  before midnight, is still in flight, and that append lands in the previous day's partition, ahead of
  it in storage order, within the append deadline
- **THEN** the first Igor's read, made after the probe settle interval, shows the other row, and
  only the Igor whose row is older takes an item

#### Scenario: A row that lands later does not change who decides

- **WHEN** an Igor's probe row is the oldest that has not ended, and another Igor's row lands after
  it in storage order
- **THEN** the first Igor's row still decides, for every Igor that reads both

#### Scenario: The midnight gap

- **WHEN** at midnight a write that the store accepts after its Igor gave up on it lands
  ahead of a row already read as deciding
- **THEN** this requirement does not promise that only one Igor takes an item for that probe
- **AND** it does not say by what path a second Igor would take one

### Requirement: An Igor that bid for a probe and takes no item voids its row

An Igor that appended a probe row and takes no item SHALL append a void row naming it, including
when its row loses to an older one, its read fails, its row decides for one key and not another, or
its claim on the item is lost to somebody else. An Igor whose probe-row append failed, or whose
append's outcome it cannot tell, SHALL take no item, and SHALL append a void row naming the row it
tried to write. A void row SHALL end no probe row but the one it names.

#### Scenario: A void ends only the row it names

- **WHEN** two Igors that cover the same work, such as two roles set up to do it, append probe rows
  naming the same item, and the one that lost appends its void row
- **THEN** the winner's probe row still holds the scope until its own run row or void row lands

#### Scenario: A failed append takes no item

- **WHEN** an Igor's probe-row append fails, or it cannot tell whether the append landed
- **THEN** it takes no item, and appends a void row naming the row it tried to write

#### Scenario: A failed read or a lost claim voids the row

- **WHEN** an Igor's read after the probe settle interval fails, or its row decides and its claim
  on the item is lost to somebody else
- **THEN** it takes no item, and appends a void row naming its row

#### Scenario: A probe row nobody is taking does not hold the scope

- **WHEN** the probe that decided ends with a run that neither meets the condition again nor
  clears it, or with its void row, and other Igors' probe rows are still in the log, each with
  its void row landed
- **THEN** none of those rows holds the scope, and the next item may probe

### Requirement: Every Igor in a scope judges a probe row's lapse alike, from the log

Every Igor in the scope SHALL decide a probe row's lapse by the same rule, read from the log;
this requirement does not choose the rule. Where the rule compares a timestamp in the log with the
reader's clock, its bound SHALL exceed the longest a live Igor's row can go without the event the rule
counts from, such as its append or a later row that renews it, by at least 5 minutes, the assumed clock skew between hosts.

#### Scenario: A reader's clock within the skew does not lapse a live row

- **WHEN** a probe row's Igor is still working its item, and another Igor's clock runs 5 minutes
  ahead of the first Igor's host
- **THEN** that other Igor does not read the row as lapsed

#### Scenario: Clocks further apart than the skew are not covered

- **WHEN** two Igors' hosts' clocks differ by more than 5 minutes
- **THEN** no requirement on taking a due probe promises its rule for them, including that neither
  reads the other's live row as lapsed

#### Scenario: Every Igor applies the same lapse rule

- **WHEN** two Igors in a scope run roles whose configurations differ
- **THEN** both decide whether a probe row has lapsed by the same rule, applied to the same rows of
  the log

### Requirement: A due probe is eventually taken

Once a condition's cooldown has passed, while any Igor in the scope keeps running and the scope
has an item some Igor in it would take, one Igor SHALL eventually take a probe item, unless a run already
under way meets or closes the condition. This holds once appends no longer fail, pass their
deadline or land ahead at midnight, claims are no longer lost to somebody else, and reads no
longer miss rows that had landed.

#### Scenario: A due probe is taken

- **WHEN** a condition's cooldown has passed, an Igor in the scope keeps running and the scope has
  an item some Igor in it would take
- **THEN** one Igor takes a probe item, once appends no longer fail, pass their deadline or land
  ahead at midnight, claims are no longer lost, and reads no longer miss rows that had landed
