## ADDED Requirements

### Requirement: Seats are named configuration entities with an owner and a reserve

Organization configuration SHALL declare seats, each with an identifier, an `owner` — the
person who can read that seat's usage — and a `reserve`: a fraction of capacity Igors MUST NOT
consume. A role SHALL reference the seat it spends from.

#### Scenario: Seat declared and referenced

- **WHEN** a seat declares an owner and a reserve, and a role references it
- **THEN** that role's spend is accounted against that seat
- **AND** the seat's owner is identifiable from configuration alone

#### Scenario: Sharing made legible

- **WHEN** several roles reference the same seat
- **THEN** it is determinable from configuration that they share a budget

#### Scenario: Role referencing an undeclared seat rejected

- **WHEN** a role references a seat not declared in organization configuration
- **THEN** validation fails

### Requirement: The reserve is untouchable

An Igor SHALL treat the seat's reserve as unavailable. Spend MUST stop at the reserve boundary
rather than at exhaustion, so that a person sharing the seat retains capacity.

#### Scenario: Igor stops at the reserve

- **WHEN** cumulative spend reaches the calibrated cap less the reserve
- **THEN** the Igor stops taking new work and hands off any in progress
- **AND** the reserved capacity remains unspent

#### Scenario: Human capacity preserved

- **WHEN** an Igor shares a seat with the person who owns it
- **THEN** the reserved fraction is available to that person regardless of Igor activity

### Requirement: The cap is supplied by human calibration, not discovered by exhaustion

Capacity SHALL be established from calibration a person submits after reading the seat's usage.
The system MUST NOT require hitting the limit in order to learn it.

#### Scenario: Calibration submitted and stored

- **WHEN** a person submits observed usage and limit for a seat
- **THEN** the calibration is stored on the state branch keyed by that seat

#### Scenario: Grounded from the first window

- **WHEN** a seat has been calibrated and an Igor begins work
- **THEN** headroom is computed from that calibration
- **AND** no exhaustion is required first

#### Scenario: Uncalibrated seat reports honestly

- **WHEN** a seat has never been calibrated
- **THEN** headroom is reported as unknown rather than estimated

### Requirement: Spend is a trailing sum, not a per-window accumulator

The system SHALL record each worker invocation's reported cost with its timestamp, per seat,
on the state branch. Spend SHALL be computed as the **sum over a trailing interval** — the
last five hours, and separately the last week — rather than accumulated against a window that
resets.

The provider's limits are *rolling*, so there is no boundary to detect and no moment at which
a counter returns to zero. An implementation that waits for a reset would never see one.

#### Scenario: Cost accumulated per seat

- **WHEN** two roles sharing a seat each perform work
- **THEN** both costs count against that one seat

#### Scenario: Spend is computed over a trailing interval

- **WHEN** spend is reported for a seat
- **THEN** it is the sum of costs recorded within the trailing interval
- **AND** no window-reset event is required for older costs to stop counting

#### Scenario: Costs age out continuously

- **WHEN** a cost recorded six hours ago is considered against a five-hour interval
- **THEN** it is excluded
- **AND** it was excluded without any reset having occurred

### Requirement: Budget reporting includes the age of the calibration

A budget report SHALL state, per seat: the calibrated cap, **how long ago it was calibrated**,
trailing spend over each interval, the reserve, and remaining headroom.

#### Scenario: Report includes calibration age

- **WHEN** budget is reported for a calibrated seat
- **THEN** the age of the calibration is shown alongside the cap

#### Scenario: Stale calibration surfaced

- **WHEN** a calibration is older than a configured staleness threshold
- **THEN** the report flags it as stale rather than presenting the figure without qualification

### Requirement: Exhaustion cross-checks the calibration

Where a limit error occurs, the system SHALL record cumulative spend at that moment and compare
it against the calibrated cap, reporting a discrepancy rather than silently continuing.

#### Scenario: Exhaustion contradicting calibration reported

- **WHEN** a limit error arrives while spend is well below the calibrated cap
- **THEN** the discrepancy is recorded and surfaced as a calibration problem

#### Scenario: Reactive handling remains a backstop

- **WHEN** a limit error occurs despite calibration
- **THEN** work stops and a handoff is posted
- **AND** the event is treated as an exception rather than the expected mechanism
