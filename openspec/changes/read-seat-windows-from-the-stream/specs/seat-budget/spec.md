## ADDED Requirements

### Requirement: A worker run's rate-limit event is recorded as a reading of the seat that paid

Where a worker run's output stream carries a `rate_limit_event`, the last such event of the run
SHALL be recorded as an observation of the seat the gate chose for that run, taken with that
seat's own credential. It SHALL record, for each window the event reports, the fraction of the
window consumed and the instant the window resets; and it SHALL record the event's status —
`allowed`, `allowed_warning` with the threshold it crossed, or `rejected` — and whether extra
usage is being spent.

The worker already runs under the seat's own `setup-token` credential with the stream flags that
produce this event, and the event reports the whole seat's windows, owner's use included. Nothing
else available to that credential reports them: `/usage` returns a cost summary and the usage
endpoint refuses it. Discarding the event discards the only reading of the seat that needs no
person signed in anywhere.

A stream reading SHALL be recorded in the observation shape already in force, and SHALL be
distinguishable in the record and in reporting from a reading taken through `/usage`. It SHALL be
recorded as a usage reading where the event's status is `allowed` or `allowed_warning`, and as a
limit error where the status is `rejected` and the run ended in error. A `rejected` event on a run
the provider reports as successful SHALL be recorded as a usage reading at the figures it gives,
not as a limit error: a limit the run met, retried past and finished around is not the reason it
stopped.
A window the event names that is neither the session nor the weekly window SHALL NOT be recorded
as either.

One reading per run, not one per event: within a window instance fullness only rises, so the last
event is the freshest and the earlier ones add nothing to it.

#### Scenario: A run's event becomes an observation per window

- **WHEN** a worker run's stream carries a `rate_limit_event` reporting the five-hour window at
  `0.07` and the seven-day window at `0.86`, with their resets
- **THEN** an observation of the paying seat's session window at 7% and one of its week window at
  86% are recorded, each with its reset
- **AND** each is marked as having come from the worker's stream

#### Scenario: The warning and its threshold are kept

- **WHEN** the event's status is `allowed_warning` with `surpassedThreshold` `0.75` about the
  seven-day window
- **THEN** the week observation records that status and that threshold

#### Scenario: Overage is kept

- **WHEN** the event reports `isUsingOverage`
- **THEN** every observation recorded from that event carries it

#### Scenario: A rejection the run finished around is not a refusal

- **WHEN** a run's last event has status `rejected` and the run's terminal envelope reports success
- **THEN** its observations are recorded as usage readings, not as limit errors

#### Scenario: Several events, one reading

- **WHEN** a run's stream carries more than one `rate_limit_event`
- **THEN** only the last is recorded

#### Scenario: The reading is the paying seat's, and no other's

- **WHEN** the gate chose seat `fleet-1` for a run
- **THEN** the observations from that run's event are recorded against `fleet-1`

#### Scenario: An unknown window is not guessed

- **WHEN** the event reports a window other than the five-hour and seven-day ones
- **THEN** that window is not recorded as the session or the weekly window

### Requirement: A stream reading is timed when it arrived, not when the run ended

An observation taken from a worker's stream SHALL carry the instant the event was received as the
instant it was taken.

A capacity is spend within the window up to the observation, divided by the fullness it reports.
A run's own spend is recorded when the run ends. Timed at the end, the reading would count the
whole run's spend against a fullness measured before most of it, and the capacity would come out
high — the direction that overruns somebody's floor. Timed at arrival, the run's spend is excluded
while the reading may already reflect some of it, so the capacity comes out slightly low, the
direction already accepted from a co-consumer.

#### Scenario: The run's own spend is not in the numerator

- **WHEN** a capacity is derived from a stream reading
- **THEN** the spend of the run that carried it is not counted in the numerator

### Requirement: A reading bounds its window from below until the window resets

A reading's fullness SHALL be treated as a lower bound on that window's fullness from the moment
it was taken until the reset it reports, and SHALL NOT be taken to describe any later instance of
the window. Reporting SHALL present an unexpired reading as a lower bound, with the instant it was
taken.

Fullness does not fall within an instance, so an old reading understates the present rather than
misstating it; it needs no staleness threshold to be safe until its window turns over, and after
that it says nothing about the present while remaining calibration.

#### Scenario: An old reading still bounds the present

- **WHEN** a seat's newest reading of a window is hours old and its reset has not passed
- **THEN** the window is treated as at least that full
- **AND** reporting shows the figure as a lower bound with the time it was taken

#### Scenario: A reset ends what the reading says

- **WHEN** the reset a reading reported has passed
- **THEN** the reading no longer bears on that window's fullness
- **AND** it remains in the log

### Requirement: A seat spending extra usage has no headroom

A seat whose newest unexpired reading reports extra usage being spent SHALL be treated as having
no headroom in the window the event was about — the one its `rateLimitType` names — until that
window resets, independently of any capacity estimate. The seat's other window SHALL NOT be shut
on that ground: a session past its cap says nothing about the week, and shutting the week for it
would hold the seat out for days.

Extra usage is spending past the subscription's cap, billed beyond it. A seat is lent as a
subscription; no reserve anybody declared contemplates spending its owner's money beyond it.

#### Scenario: Overage stops the seat

- **WHEN** a seat's newest unexpired reading reports `isUsingOverage` true
- **THEN** that seat is passed over for the window the event's `rateLimitType` names, with that as
  the reason
- **AND** it is usable again once that window resets, without intervention

#### Scenario: Overage in one window does not shut the other

- **WHEN** a reading reports `isUsingOverage` true with `rateLimitType` `five_hour`
- **THEN** the session window has no headroom until its reset
- **AND** the week window is bounded as it would otherwise be

### Requirement: A refusal the stream reports is not recorded twice

Where a run's stream reports it rejected and its terminal envelope is also recognised as a usage
limit, one observation of the refusal SHALL be recorded, taken from the stream. Where only the
envelope reports the refusal, it SHALL be recorded from the envelope as it is today.

The stream names the window and a machine-readable reset; the envelope path infers the window from
how far off the reset is. Two rows for one refusal would be two measurements of one fact.

#### Scenario: One refusal, one row

- **WHEN** a run's stream carries a `rejected` event and `usageLimit` also recognises its envelope
- **THEN** exactly one observation of the refusal is recorded, from the stream

#### Scenario: No event, the envelope still records

- **WHEN** a run is refused and its stream carried no `rate_limit_event`
- **THEN** the refusal is recorded from the envelope as before

### Requirement: Nothing depends on the stream carrying a reading

The absence of a `rate_limit_event`, or an event that cannot be read, SHALL leave a run's recording
and every budget decision exactly as they would have been without this requirement. No behaviour
SHALL wait for, require, or refuse work for want of a stream reading.

The event is undocumented. Reading it improves what the loop knows; the loop's correctness rests on
recorded spend, declared and observed capacity, and reacting to refusals, all of which work without
it.

#### Scenario: No event, no change

- **WHEN** a worker run's stream carries no `rate_limit_event`
- **THEN** no observation is recorded from the stream
- **AND** the run is recorded and bounded as it would have been otherwise

#### Scenario: A malformed event is not a failed run

- **WHEN** a `rate_limit_event` is missing fields or carries values of the wrong type
- **THEN** no observation is recorded for what cannot be read
- **AND** the run's outcome is unaffected
