## ADDED Requirements

### Requirement: Triage's model call is made only where a seat can pay for it

Triage's model call SHALL be charged to the seat the budget gate chooses for the role, using that
seat's token. Where the gate names no seat, whether every seat serving the role is at its line or
none is usable, the model stage SHALL NOT run, and no credential SHALL be substituted. Discovery,
reading an item's comments, triage's earlier stages (stop and deferral checks, skips, lane tests)
SHALL run as they otherwise would; the gate is consulted where the model call is made, after them.

#### Scenario: Held seats stop the model stage

- **WHEN** candidates survive the earlier stages and no seat serving the role has headroom
- **THEN** no model call is made
- **AND** no candidate is proposed for claiming from that cycle

#### Scenario: No seat means no credential, not a stored login

- **WHEN** the gate names no seat for the role
- **THEN** the model stage does not fall back to a stored Claude login
- **AND** no spend is made that no seat can be named for

#### Scenario: Seats that could not be used at all are refused on the same terms

- **WHEN** one of three holds: no seat serves the role, as after a pull removes the last seat
  file listing it; every seat serving it is unreadable; or every seat serving it holds a reserve
  and has not been read
- **THEN** the model stage does not run either
- **AND** the reason recorded is that one, not exhaustion

#### Scenario: Everything before the model call still runs

- **WHEN** a cycle runs while every seat serving the role is held
- **THEN** sources are still polled, comments are still read, and the stop and deferral gates
  still run
- **AND** a stop or a reply arriving during the held period is acted on in that cycle

#### Scenario: A cycle with nothing to triage reads no seat

- **WHEN** no candidate survives the stages before the model call
- **THEN** the budget gate is not resolved for triage
- **AND** no seat's usage is read on triage's behalf

### Requirement: A cycle that triaged nothing says why, and when triage can resume

Where a cycle makes no triage call because the gate named no seat, it SHALL report that,
distinguishably from a cycle with nothing to triage, and SHALL say how many candidates were left
untriaged. The report SHALL distinguish seats that are spent from seats that could not be used at
all, and where a reset is known it SHALL state when capacity returns.

#### Scenario: Silence is explained

- **WHEN** a cycle makes no triage call because every seat serving the role is held
- **THEN** the report says so and states how many candidates were left untriaged
- **AND** it is distinguishable from a cycle that had nothing to triage

#### Scenario: Spent is told apart from unusable

- **WHEN** the role's seats could not be used for a reason that is not spend, such as a role no
  seat serves, as after a pull removes the last seat file listing it, a seat whose credential
  cannot be read, or a reserved seat nothing has read
- **THEN** the report names that reason
- **AND** it does not report the budget as exhausted

#### Scenario: The return time is stated

- **WHEN** the seats are spent and a reset time is known
- **THEN** the report states when capacity is expected to return

#### Scenario: Held seats do not read as a login problem

- **WHEN** every seat is held, on a machine where `claude` would report that it is not logged in
- **THEN** the cycle reports the held seats
- **AND** nothing reports the Igor as not logged in

## MODIFIED Requirements

### Requirement: A candidate left untriaged is not a candidate triage decided about

Each candidate that reaches the model stage with no model call made about it, for any reason,
SHALL be recorded as untriaged, with the reason, and SHALL hold its source's watermark back so the
next cycle with capacity considers it again. It MUST NOT be recorded as a skip, nor suppressed on
any ground. Where the cycle's cap on model calls is the reason, those left SHALL be the newest.
An untriaged candidate tied on `updatedAt` with one its own source triaged SHALL NOT hold the watermark back.

#### Scenario: Untriaged is not decided

- **WHEN** every seat serving the role is held and candidates had survived to the model stage
- **THEN** each is recorded as untriaged, naming the held seats as the reason
- **AND** none is recorded as skipped, out of lane, or otherwise decided about

#### Scenario: The watermark waits for them

- **WHEN** a cycle triages nothing because every seat serving the role is held
- **THEN** the source's mark does not advance past the oldest candidate left untriaged
- **AND** the next cycle with capacity considers that candidate again, unedited

#### Scenario: An untriaged item is not suppressed

- **WHEN** an item is left untriaged because every seat serving the role was held
- **THEN** nothing records it as handed back, deferred or quiet
- **AND** it needs no reply and no edit to be worked once capacity returns

#### Scenario: The reason the call did not happen does not change the handling

- **WHEN** a candidate reaches the model stage and no call is made about it, because every seat
  serving the role is held, because the seat the gate named has no readable credential, or
  because the cycle reached its cap on model calls first
- **THEN** it is recorded as untriaged with that reason and holds its source's mark back
- **AND** which of those it was makes no difference to whether the item comes back

#### Scenario: The cap falls on the newest, so the mark still moves

- **WHEN** more candidates survive to the model stage than the cycle may triage
- **THEN** the ones left untriaged are the newest of them
- **AND** the mark advances past every candidate the cycle did triage, so none is triaged twice

#### Scenario: A tie inside one source is conceded rather than looped on

- **WHEN** a candidate is left untriaged and shares its `updatedAt` with a candidate the same
  source triaged in that cycle
- **THEN** the mark is not held below it, since no instant separates the two
- **AND** that source's decided candidates are not triaged a second time

#### Scenario: A verdict in another source concedes nothing

- **WHEN** a candidate is left untriaged and shares its `updatedAt` only with candidates triaged
  in a different source
- **THEN** its own source's mark is held below it
- **AND** the next cycle considers it again rather than having dropped it

#### Scenario: Nothing is posted to an item nobody claimed

- **WHEN** the model stage is skipped for want of a seat
- **THEN** no comment is posted to any candidate
- **AND** the cycle's own report is where the Igor says what happened

## REMOVED Requirements

### Requirement: The model stage does not run where no seat can pay for it

**Reason**: Pools are dropped, and two of its scenario names say "pool". openspec will not archive
a `MODIFIED` block that drops or renames a scenario, so the requirement is re-added under a new
name.

**Migration**: *Triage's model call is made only where a seat can pay for it*, added by this
change, with the same rules and every scenario but one, worded for the seats serving a role. The
scenario *An organization with no seats declared still triages* is dropped: Igor never uses a stored Claude
login (`seat-budget`'s *A spend with no seat behind it is not made*), so no model call is made
without a seat.

### Requirement: A cycle that triaged nothing says why, and when it can resume

**Reason**: Pools are dropped, and its scenario *A held pool does not read as a login problem*
names one. openspec will not archive a `MODIFIED` block that renames a scenario, so the
requirement is re-added under a new name.

**Migration**: *A cycle that triaged nothing says why, and when triage can resume*, added by this
change, with the same rules and every scenario, worded for the seats serving a role.
