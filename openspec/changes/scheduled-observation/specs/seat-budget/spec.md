## ADDED Requirements

### Requirement: A usage reading is free and is taken on a recurring schedule

A reading of the subscription's windows SHALL be taken repeatedly on a schedule, and each
reading that yields window figures SHALL be appended as an observation. Readings SHALL NOT be
rationed against a budget, because they do not draw on one.

Measured under an interactive login, `claude -p '/usage'` returns `total_cost_usd: 0`,
`num_turns: 0` and an empty `modelUsage`, in under a second. The provider answers it
client-side, so the reading does not consume any part of the window it reports. That is what
makes a schedule the right shape: nothing is traded for freshness, and the interval is chosen
against how fast the figure goes stale rather than against what it costs.

A reading that yields no window figures SHALL record nothing. An observation asserts that a
window was a particular fullness at a particular moment, and a failed reading supports no such
assertion; recording zero, or the previous figure, would be a fabricated measurement in a log
whose whole value is that every row was measured.

#### Scenario: A scheduled reading costs nothing

- **WHEN** a reading is taken under an interactive login
- **THEN** it reports no cost, no turns and no model usage
- **AND** the window it reports is not advanced by the reading

#### Scenario: Each reading appends

- **WHEN** a second scheduled reading follows an earlier one for the same window
- **THEN** it is appended as a further observation
- **AND** the earlier observation is not replaced

#### Scenario: A failed reading records nothing

- **WHEN** a scheduled reading cannot obtain window figures
- **THEN** no observation is recorded
- **AND** no figure is carried forward from a previous reading in its place

### Requirement: The reading runs as a signed-in person, not as a service

The reading SHALL be taken under an interactive login and SHALL refuse to record an observation
when the credential available to it is a seat credential. The refusal SHALL name that condition
— the credential carries no subscription identity, so no window can be reported for it — rather
than reporting a parse failure.

This is the constraint the whole arrangement is built around. `/usage` reports windows against a
subscription; a `setup-token` credential resolves none, and under one the same command returns a
per-invocation cost summary instead. So the job cannot live on the machine the fleet runs on,
where only seat credentials exist. It lives on a machine where the seat's owner is signed in,
and the owner's login reports the same windows the seat draws on because a subscription has only
one set of them.

#### Scenario: A seat credential is refused, not parsed

- **WHEN** the reading is attempted with a seat credential in the environment
- **THEN** no observation is recorded
- **AND** the reason given is that the credential resolves no subscription, not that the output
  could not be parsed

#### Scenario: The owner's login answers for the seat

- **WHEN** the reading is taken under the login of the person who owns a seat
- **THEN** the windows it reports are recorded as observations of that seat

### Requirement: Observations arrive irregularly and nothing depends on their arriving

No behaviour SHALL require that a reading was taken at a particular time, at a particular
interval, or at all. A gap between observations SHALL NOT be treated as an error, and SHALL NOT
be filled by interpolating or repeating a reading.

The sensor is somebody's laptop. It sleeps, it travels, it is closed for the weekend, and the
person it belongs to owes the fleet nothing. A schedule on that hardware expresses an intention,
not a guarantee, and a system that treated a missed interval as a fault would raise an alarm
about a closed lid.

Every observation carries the instant it was taken, so a consumer decides for itself whether a
figure is current enough for what it is about to do. Staleness is therefore a property read at
the point of use rather than a state the schedule has to maintain.

#### Scenario: A gap is not a fault

- **WHEN** no reading has been taken for many intervals
- **THEN** nothing reports an error on that ground
- **AND** the most recent observation remains available, with its own time

#### Scenario: A missed interval is not invented

- **WHEN** the machine was asleep across several scheduled intervals
- **THEN** no observation is recorded for them on waking
- **AND** the next reading is recorded at the time it was actually taken

#### Scenario: Age travels with the figure

- **WHEN** a capacity figure is derived from an observation
- **THEN** the observation's time is available wherever that figure is used

### Requirement: A window's length is measured from successive resets, not configured

The length of a window SHALL be derived from the difference between the reset instants of two
observations of that window, and SHALL NOT be an operator-settable value. Until two differing
resets have been observed, a built-in length stands so that a capacity derivation has an
instance to bound; wherever a length is reported it SHALL say which of the two it is.

Two readings one afternoon reported `resets Sep 15 at 2:30pm` and then `resets Sep 15 at
7:30pm`, which is the session window's five hours stated by the provider twice. A recurring
reading produces such pairs as a by-product, so the geometry a capacity derivation needs to
bound its numerator to one window instance arrives with the observations rather than beside
them.

The built-in length is not a configuration knob, and the difference matters. A knob is a number
somebody sets once from a guess and nobody revisits, wrong in the direction that silently widens
the instance a numerator is summed over. A built-in that the second observation overwrites is a
starting point with an expiry, which is the same self-correcting shape the capacity estimate
itself has: the first figure is provisional, and measurement replaces it without anybody editing
anything.

#### Scenario: Two resets give the length

- **WHEN** two observations of one window report reset instants five hours apart
- **THEN** that window's length is five hours

#### Scenario: Before two resets the built-in length stands, and says so

- **WHEN** fewer than two differing resets have been observed for a window
- **THEN** the built-in length is used, so a capacity derivation still has an instance to bound
- **AND** it is reported as a built-in rather than as a measured figure

#### Scenario: The measured length replaces the built-in one

- **WHEN** a second observation reports a differing reset instant
- **THEN** the derived length supersedes the built-in one
- **AND** nothing is configured for it to take effect

#### Scenario: A window's length is not settable

- **WHEN** an operator supplies a window length in configuration
- **THEN** it is rejected

#### Scenario: A changed window follows the provider

- **WHEN** the provider begins reporting resets at a different spacing
- **THEN** the derived length changes with them
- **AND** no configuration is edited

### Requirement: Appending an observation requires write access to the state branch

Recording an observation SHALL require the same write access to the state branch as any other
appended record, and a reading that cannot be published SHALL fail visibly, naming the access it
needed, rather than being discarded.

The reading and the writing have different owners. Taking the reading needs only the lender's
own login, which they have by definition; publishing it needs push access to the lore
repository, which they may not have at all. For a colleague on the team this is already granted,
because reviewing lore requires it. For a lender outside the team it is the substantial obstacle
to lending a seat, and a failure at this step must be legible as an access problem so that it is
fixed rather than mistaken for the reading not working.

#### Scenario: No write access fails loudly

- **WHEN** a reading succeeds and the observation cannot be appended
- **THEN** the command fails
- **AND** it names the write access it required

#### Scenario: The reading is not discarded quietly

- **WHEN** publishing an observation fails
- **THEN** the failure is not reported as a failed reading
