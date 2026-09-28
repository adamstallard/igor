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

A stream reading SHALL be recorded in the observation shape already in force, with source
`stream`, so that it is distinguishable in the record and in reporting from a reading taken
through `/usage` and from a limit error read off the envelope. Where the event's status is
`rejected` and the run ended in error, it SHALL be recorded as a refusal: at 100% of the window
the event names, with the reset it states. A `rejected` event on a run the provider reports as
successful SHALL be recorded at the figures it gives, not as a refusal: a limit the run met,
retried past and finished around is not the reason it stopped.
A window the event names that is neither the session nor the weekly window SHALL NOT be recorded
as either.

One reading per run, not one per event: within a window instance fullness only rises, so the last
event is the freshest and the earlier ones add nothing to it.

#### Scenario: A run's event becomes an observation per window

- **WHEN** a worker run's stream carries a `rate_limit_event` reporting the five-hour window at
  `0.07` and the seven-day window at `0.86`, with their resets
- **THEN** an observation of the paying seat's session window at 7% and one of its week window at
  86% are recorded, each with its reset
- **AND** each is recorded with source `stream`

#### Scenario: The warning and its threshold are kept

- **WHEN** the event's status is `allowed_warning` with `surpassedThreshold` `0.75` about the
  seven-day window
- **THEN** the week observation records that status and that threshold

#### Scenario: Overage is kept

- **WHEN** the event reports `isUsingOverage`
- **THEN** every observation recorded from that event carries it

#### Scenario: A rejection the run finished around is not a refusal

- **WHEN** a run's last event has status `rejected` and the run's terminal envelope reports success
- **THEN** its observations are recorded at the figures the event gives, not as a refusal

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

### Requirement: A seat nothing has read is probed on the Igor server with its own token

Where seats are declared, for a seat that names a token source and has no unexpired reading of a
window — no `usage` or `stream` observation of it whose reset has not passed — the server running
the Igors SHALL make a seat probe: one minimal `claude -p` call with that seat's own configured
token, on the cheapest model, with a trivial prompt and no tools, and with `--output-format
stream-json --verbose`. It SHALL read the call's `rate_limit_event` and record it as a `stream`
reading of that seat, exactly as a worker run's event is recorded.

Stream readings arrive only when a run is made on a seat, which leaves two seats unread. A
reserved seat with no capacity figure is admitted only once a reading of it exists, so until
something reads it, it never runs and never gets a reading. And a seat the fleet is not using is
never read. A probe reads both, on the machine that already holds the seat's token and config.

A seat probe SHALL run only on the server that runs the Igors, never on a person's machine, and
nothing SHALL be installed anywhere else for it. A seat naming no token source SHALL NOT be probed:
its call would run on whatever login is ambient, which reads that login rather than the seat.

A seat probe is not free. Its cost SHALL be recorded like any other spend, against the seat it
read, and it SHALL count toward that seat's bound like any other spend.

A seat SHALL NOT be probed more than once an hour, nor while a probe of it is still running. A
probe that receives no `rate_limit_event`, or one that cannot be read, SHALL record no
observation, and that seat SHALL NOT be probed again until one session window's length (five
hours) has passed. A probe that fails SHALL NOT be retried in a loop.

A seat probe SHALL NOT be made on a seat the gate has found refused, while that refusal is
unexpired: an unexpired observation at 100% of a window stops probes of that seat until the reset
it states. Nor SHALL one be made on a seat whose unexpired reading reports extra usage being spent,
until that window resets, since a probe there would spend its owner's money. Nor SHALL one be
made on a seat whose recorded Igor spend has reached `(1 − reserve) × capacity` in any window,
since a probe's spend is Igor spend and the reserve is untouchable. Having no capacity figure is
the only reason for passing a seat over under which it is still probed.

#### Scenario: A reserved seat with no figure is probed

- **WHEN** a seat declares a reserve and a token source, and has no reading of either window
- **THEN** the server running the Igors makes one seat probe with that seat's token
- **AND** the probe's `rate_limit_event`, if there is one, is recorded as a `stream` reading of
  that seat

#### Scenario: An idle seat is read again once its reading expires

- **WHEN** a seat's newest reading of its session window has passed its reset and no run has been
  made on the seat since
- **THEN** the seat is probed

#### Scenario: A seat with an unexpired reading of every window is not probed

- **WHEN** a seat has an unexpired reading of both its windows
- **THEN** no probe is made on it

#### Scenario: A probe's cost is recorded

- **WHEN** a seat probe completes
- **THEN** its reported cost is recorded against the seat it read
- **AND** it counts toward that seat's bound

#### Scenario: No event, no observation, no loop

- **WHEN** a seat probe's stream carries no `rate_limit_event`
- **THEN** no observation is recorded
- **AND** that seat is not probed again for five hours

#### Scenario: Probes are rate-limited

- **WHEN** a seat was probed less than an hour ago
- **THEN** it is not probed again, whatever its readings

#### Scenario: A refused seat is not probed

- **WHEN** a seat has an unexpired observation at 100% of a window
- **THEN** it is not probed until that observation's reset has passed

#### Scenario: A seat spending extra usage is not probed

- **WHEN** a seat's unexpired reading reports extra usage being spent
- **THEN** it is not probed until that window resets

#### Scenario: A seat at its bound is not probed

- **WHEN** a seat's session reading has expired, and its recorded Igor spend in the week window
  has reached `(1 − reserve) × capacity`
- **THEN** it is not probed until that week window resets

#### Scenario: A seat with no token source is not probed

- **WHEN** a seat names none of the token mechanisms
- **THEN** no probe is made on it

#### Scenario: A probe never runs on a person's machine

- **WHEN** a seat is probed
- **THEN** the call is made by the server running the Igors, with the token in its config

### Requirement: Observations arrive irregularly and nothing depends on their arriving

No behaviour SHALL require that a reading of a seat was taken at a particular time, at a
particular interval, or at all. A gap between readings SHALL NOT be treated as an error, and SHALL
NOT be filled by interpolating or repeating a reading.

Readings arrive with the work. A stream reading comes with a run on the seat, and a probe comes
only when a seat has no unexpired reading, within the probe's own limits. A seat nobody is
spending from on a quiet day is read about once a session window. A seat the fleet is busy on is
read many times an hour. Neither is a fault, and a system that expected a regular cadence would
report the first as one.

Every observation carries the instant it was taken, so a consumer decides for itself whether a
figure is current enough for what it is about to do. Staleness is read at the point of use, and
nothing has to keep a schedule for it.

#### Scenario: A gap is not a fault

- **WHEN** no reading of a seat has been taken for many hours
- **THEN** nothing reports an error on that ground
- **AND** the most recent observation remains available, with its own time

#### Scenario: A gap is not filled in

- **WHEN** no run or probe was made on a seat across a stretch of time
- **THEN** no observation is recorded for that stretch
- **AND** the next reading is recorded at the time it was actually taken

#### Scenario: Age travels with the figure

- **WHEN** a capacity figure is derived from an observation
- **THEN** the observation's time is available wherever that figure is used

### Requirement: A window's length is measured from successive resets, not configured

The length of a window SHALL be derived from the reset instants of that window's observations: it
is the smallest positive difference between two differing reset instants. It SHALL NOT be an
operator-settable value. Until two differing resets have been observed, a built-in length stands
(five hours for the session, seven days for the week), so that a capacity derivation has an
instance to bound. Wherever a length is reported, it SHALL say which of the two it is.

A stream reading states its reset in epoch seconds, so its reset is an exact instant with no
phrase to resolve. Readings arrive with every run and probe, so pairs of differing resets arrive
as a by-product of the work.

**Why the smallest difference.** Readings do not come from every instance of a window. Between
two readings there may have been instances nothing read, so a difference between two resets is at
least one window length and may be several. It is never less than one. So the smallest
difference is the best estimate, and any error in it is on the long side.

**Why a longer figure does not replace the built-in.** A measured length longer than the built-in
one is exactly what instances nobody read would produce, so it is no evidence that the provider
changed the window. It SHALL be reported as measured, and SHALL NOT supersede the built-in length.
A measured length shorter than the built-in one cannot come from unread instances, so it is
evidence, and it SHALL supersede the built-in length.

The built-in length is not a configuration knob, and the difference matters. A knob is a number
somebody sets once from a guess and nobody revisits. A built-in that measurement overwrites is a
starting point with an expiry, the same self-correcting shape the capacity estimate has.

#### Scenario: Two resets give the length

- **WHEN** two observations of the session window report reset instants exactly five hours apart
- **THEN** that window's length is five hours

#### Scenario: Unread instances do not stretch the window

- **WHEN** the resets of a window's observations differ by five hours and by fifteen hours
- **THEN** its length is five hours

#### Scenario: Before two resets the built-in length stands, and says so

- **WHEN** fewer than two differing resets have been observed for a window
- **THEN** the built-in length is used, so a capacity derivation still has an instance to bound
- **AND** it is reported as built-in rather than measured

#### Scenario: A shorter measured length replaces the built-in one

- **WHEN** the smallest difference between a window's observed resets is shorter than its
  built-in length
- **THEN** that measured length is used
- **AND** nothing is configured for it to take effect

#### Scenario: A longer measured length is reported and not used

- **WHEN** every difference between a window's observed resets is longer than its built-in length
- **THEN** the built-in length is still used
- **AND** reporting shows the measured length beside it

#### Scenario: A window's length is not settable

- **WHEN** an operator supplies a window length in configuration
- **THEN** it is rejected

## MODIFIED Requirements

### Requirement: Usage is read from the seat, not supplied by a person

Remaining capacity SHALL be established from the seat itself — read directly where the seat's
credential yields a reading, and otherwise derived from recorded observations of that seat and
recorded spend against it. The system MUST NOT require a person to submit a usage figure.

A capacity MAY be declared in configuration as `capacity_estimate`, a starting figure per seat
**and per window**, and SHALL be superseded by any observation of that seat and window rather
than averaged with one.
One figure cannot serve both: every consumer is per window — the bound is `(1 − reserve) ×
capacity` within a window, and reporting is per seat and per window. Deriving one window's
capacity from the other's by their cadence ratio would assume the two limits are proportional,
which is the thing two independent limits exist to deny: were a session exactly a 168th of a
week, the weekly limit would forbid nothing the session limit already forbids. A seat MAY
declare one window and not the other; the undeclared one is simply unobserved until it is. A
declared figure needs neither an observation nor recorded spend, which is what it is for: a
reserved seat with no figure at all is passed over rather than spent from until a reading of it
admits it one item at a time, as *A seat with no capacity figure at all protects no floor* says,
so without one a seat nothing has read accumulates nothing for a derivation to divide. It is
reported as declared until an observation replaces it, so nobody mistakes an assumption for a
measurement.

What must never be configured is a *usage figure*. Capacity is a property of the plan and
changes rarely; how full the window is right now changes by the minute and is the thing a
person cannot supply usefully. Even capacity is not fixed — the provider has moved the weekly
allowance for every subscriber at least once, without any plan changing — so a declared figure
is a starting point with a shelf life and not a constant.

`/usage` reports window percentages only to a credential the provider can resolve a
subscription for. The credential a seat holds is a `setup-token` one, which carries no
subscription identity, so `/usage` under it reports a per-invocation cost summary instead. The
same credential does receive the seat's windows, in the `rate_limit_event` on the output stream
of a run made with it, so a seat is read through its own credential whenever such a run is made.
Where a reading can be taken it remains the better answer and is taken; its absence must bound
the seat rather than blind the system to it, because a seat nothing can measure is otherwise a
seat with no ceiling at all.

#### Scenario: Capacity established without a person

- **WHEN** an Igor needs to know whether it may spend
- **THEN** the seat's usage is read directly where its credential yields a reading
- **AND** otherwise capacity is derived from recorded observations of that seat and recorded
  spend against it
- **AND** no human supplies how full the window is, in either case

#### Scenario: A declared capacity gets a reserved seat started

- **WHEN** a seat declares both a reserve and a capacity, and has no observation
- **THEN** the declared capacity bounds it and it may be spent from
- **AND** the figure is reported as declared rather than observed

#### Scenario: An observation supersedes what was declared

- **WHEN** a seat with a declared capacity is observed
- **THEN** the observed capacity is used and the declared one is not combined with it
- **AND** later observations supersede earlier ones in the same way

#### Scenario: A seat is read through its own credential

- **WHEN** a seat declares where its token is held
- **THEN** the reading is taken using that token
- **AND** the figure therefore describes that seat and no other

#### Scenario: A missing token is refused, not substituted

- **WHEN** a seat names a token that is not available
- **THEN** the seat is reported unreadable
- **AND** no other credential is used in its place

#### Scenario: An unreadable seat is not treated as free

- **WHEN** a seat's usage cannot be read
- **THEN** it is bounded by observation and record rather than passed over on that ground alone
- **AND** a seat with neither a reading nor an observation is passed over, with the reason

#### Scenario: One unreadable seat does not blind the rest

- **WHEN** one seat of several cannot be read
- **THEN** the others are still reported and still usable

### Requirement: An observation records how full a window was, and when it resets

A capacity observation SHALL record the seat, the window, the fraction of that window consumed,
the instant the observation was taken, the instant the window resets, and which of three sources
it came from: a usage reading (`usage`), a provider limit error (`limit`), or the
`rate_limit_event` on a run's output stream (`stream`).

New observations SHALL be recorded as `limit` or `stream` only. Nothing SHALL write `usage` any
more: it was written only by `igor observe`, which read `/usage` under the interactive login of
whoever ran it, and that command is withdrawn. Rows already recorded as `usage` SHALL still be
read, exactly as any other observation is, because the log is never rewritten and those rows
are calibration.

    {"at":…,"seat":"adam","window":"session","percentUsed":100,"resetsAt":…,"source":"limit"}
    {"at":…,"seat":"adam","window":"week","percentUsed":36,"resetsAt":…,"source":"usage"}
    {"at":…,"seat":"adam","window":"week","percentUsed":86,"resetsAt":…,"source":"stream"}

One record type, because the three sources say the same thing. A limit error is a reading at
exactly 100% with a reset time attached, and treating it as a second kind of fact would mean
two mechanisms deciding the same question from the same information. A stream reading is a
reading of the same windows taken by another route, and a refusal the stream reports is a limit
error taken by another route; `stream` records the route, because reporting has to say where a
figure came from, and whether a stream row reports a refusal is carried by the event's status on
the row.

An observation of a window scoped to one model SHALL record that model. The weekly limit on a
single model is a separate cap from the all-models one, so recording a refusal against it as an
unqualified `week` would assert that the whole window was full when it was not — a wrong figure
where none was needed. No bound is derived against a per-model window here; the model is
recorded so that the figure is true and so that the derivation, when it comes, has the rows.

The reset SHALL be recorded as an instant that can be compared against the present. The
provider reports it as a human phrase — a date, a time, and a zone — which cannot be compared
without being resolved first. An observation whose reset cannot be resolved SHALL be recorded
anyway and SHALL place no window boundary and yield no capacity derivation, because a position
in a window that has been invented is worse than none. It SHALL still expire, one window length
after it was taken.

The two are not the same claim. A derivation has to know *where* the instance sits, and an
unresolved reset says nothing about that. An expiry only has to know how long the fact stays
relevant, and the cadence bounds that without placing anything: a window resets at most one
length after any moment inside it, so the seat is held for at least as long as it is really
shut. That error cannot overrun anybody's floor, where a row that never expired would be a seat
nobody could use again.

#### Scenario: A recorded usage reading is still read

- **WHEN** the log holds an observation with source `usage`
- **THEN** it is read, and bears on capacity, expiry and reporting as any observation does

#### Scenario: Nothing new is recorded as a usage reading

- **WHEN** any observation is recorded
- **THEN** its source is `limit` or `stream`

#### Scenario: A limit error becomes an observation at 100%

- **WHEN** the provider refuses a run because a window is exhausted, and the run's stream
  reported no refusal
- **THEN** an observation is recorded at 100% for that window, with the reset the provider
  stated and source `limit`

#### Scenario: A stream reading is recorded with its own source

- **WHEN** a run's output stream carries a `rate_limit_event` reporting a window's fullness and
  reset
- **THEN** an observation is recorded with that fullness, that reset, and source `stream`

#### Scenario: A per-model window is recorded as one

- **WHEN** an observation concerns a limit scoped to a single model
- **THEN** the record names that model
- **AND** it is not recorded as the all-models window

#### Scenario: A reset that cannot be resolved is not invented

- **WHEN** an observation's reset time cannot be resolved to a comparable instant
- **THEN** the observation is still recorded
- **AND** it yields no capacity figure and places no window boundary
- **AND** it stops bearing on the present one window length after it was taken

### Requirement: Recorded spend attributes a seat between its roles

Recorded cost SHALL be used both to apportion a seat between the roles drawing on it and, taken
against an observed capacity, to decide whether that seat has anything left. What fraction of a
seat a role is responsible for comes from the record; whether capacity remains comes from the
record measured against an observation of how full the window was.

The record is the only quantity available for both questions on a seat nothing has read yet:
`/usage` reports no window to a seat's credential, and a stream reading arrives only when a run
is made with it. A reading, where there is one, says how full the whole seat is; which role
consumed what still comes only from the record. Cost is reported as an equivalent value at list prices rather than an amount billed,
which is what makes it usable as a proxy for consumption of a subscription window.

#### Scenario: A role's share derived from its spend

- **WHEN** two roles have drawn on one seat
- **THEN** each role's share of the consumed limit follows its share of recorded cost

#### Scenario: No recorded spend attributes nothing

- **WHEN** a seat has no recorded spend
- **THEN** no role is held to have consumed any of it

#### Scenario: The record decides exhaustion where no reading can

- **WHEN** a seat's recorded spend reaches its bound and no reading is available
- **THEN** the seat is treated as having no headroom
- **AND** the decision does not wait on a reading that has not arrived

### Requirement: A seat with no capacity figure at all protects no floor

A seat declaring a non-zero reserve and having, for a window, no capacity figure (neither one
derived from an observation nor a declared capacity) SHALL be passed over, with that as the
stated reason, rather than spent from against a denominator nobody supplied. The one exception
is calibration admission, below. A seat declaring no reserve MAY be spent from with neither,
bounded reactively: its first limit error is its first calibration point.

A reserve is a fraction of capacity, so without a capacity figure it expresses no quantity at
all. Spending somebody's subscription against a denominator nobody chose is worse than declining
to use their seat, because the failure is invisible to them until their own work is refused. A
declared figure is not that: somebody named it, it is reported as declared, and the first
observation replaces it. Where nobody's floor is at stake, the same ignorance costs only a
failed run, which is the calibration the seat needed.

The unlock is a reading taken after Igor has spent from the seat inside the window it reads,
because a capacity is that spend divided by the fullness the reading reports: a reading of a seat
Igor has not spent from inside the instance yields no figure. The seat's own credential receives
a reading on the stream of every run made with it, so no machine with an interactive login is
required.

**Calibration admission.** Such a seat SHALL be admitted for one item at a time while the most
recent unreset observation of every one of its windows reports it below `1 − reserve`. A window
that has a capacity figure SHALL still be bounded as it otherwise would be, and the seat is
admitted only if that window is within its bound too. A seat with no unreset observation of some
window SHALL NOT be admitted on this ground; the seat probe reads it first.

A reading is of the whole seat, owner's use included. A reading below `1 − reserve` therefore
says that at least the reserved fraction of the window was still unspent, by anybody, when it
was taken. That makes one item a small, bounded risk to the owner's floor, where the alternative
is a seat nobody declared a figure for never being used at all.

One item at a time means that an Igor SHALL NOT admit a further item to such a seat while an item
it admitted there under this rule is still running. Within one Igor this holds by construction,
because an Igor works its items one after another. Several Igors sharing the seat each hold it for
themselves, so up to one admitted item per Igor can be running on the seat at once. That is the
same slack the dollar bound already has, since spend is recorded only when a run ends.

The admitted item's spend is recorded when its run ends, after the reading its own run carried
arrived. So that reading yields no figure, by the arrival rule. The next reading inside the same
window instance divides that spend and yields one: in practice, the reading carried by the next
item admitted under this rule. Until a figure exists, admission continues one item at a time on
the same condition. Once one exists, the ordinary bound applies to that window and this rule no
longer does.

Where the reading an admitted run carries is at or past `1 − reserve` in any window, that run
SHALL be allowed to finish. It is not stopped mid-item, since stopping it would waste what was
already spent. No further item SHALL be admitted to the seat under this rule while that reading
is unreset.

Apart from the items calibration admission lets in, the one call made on such a seat is a seat
probe. A probe spends a trivial amount to read the seat and does no work, and it is recorded
against the seat like any spend. Being passed over means no work is charged to the seat. It does
not mean the seat is never read.

#### Scenario: A reserved seat is not spent from on a guess

- **WHEN** a seat declares a reserve and has, for a window, neither a capacity figure nor a
  declared capacity
- **AND** it has no unreset observation of every window below `1 − reserve`
- **THEN** it is passed over
- **AND** the reason given is that no capacity figure exists for it

#### Scenario: A read seat below its reserve is admitted for one item

- **WHEN** a seat declares a reserve of 0.5, has no capacity figure for either window, and its
  most recent unreset observations report the session at 20% and the week at 30%
- **THEN** one item may be charged to it

#### Scenario: Not a second item while the first runs

- **WHEN** an Igor has admitted an item to such a seat under calibration admission and that item
  is still running
- **THEN** that Igor admits no further item to the seat on that ground

#### Scenario: A reading at the reserve admits nothing

- **WHEN** such a seat's most recent unreset observation of either window reports it at or past
  `1 − reserve`
- **THEN** it is passed over

#### Scenario: A seat nothing has read is probed, not admitted

- **WHEN** such a seat has no unreset observation of a window
- **THEN** no item is charged to it
- **AND** it is left to the seat probe

#### Scenario: A run that crosses the reserve finishes, and nothing follows it

- **WHEN** an item admitted under calibration admission carries a reading at or past
  `1 − reserve` in a window
- **THEN** that item's run is allowed to finish
- **AND** no further item is admitted to the seat on that ground until that window resets

#### Scenario: The next reading yields the figure

- **WHEN** an admitted item's spend has been recorded, and a later reading of the seat inside the
  same window instance arrives
- **THEN** that window has a capacity figure derived from that spend and that reading
- **AND** from then on that window is bounded by `(1 − reserve) × capacity`, as any calibrated
  window is

#### Scenario: A window with a figure is still bounded

- **WHEN** such a seat's week window has a capacity figure and its session window has none
- **THEN** the seat is admitted for one item only if its week spend is within its bound and every
  window's most recent unreset observation is below `1 − reserve`

#### Scenario: Several Igors each hold to one

- **WHEN** two Igors share a reserved seat with no capacity figure and a reading below
  `1 − reserve`
- **THEN** each admits at most one item to it at a time
- **AND** up to two admitted items may be running on it at once

#### Scenario: A dedicated seat runs uncalibrated

- **WHEN** a seat declares no reserve and has no observation
- **THEN** work may be charged to it

#### Scenario: The first refusal calibrates it

- **WHEN** an uncalibrated seat with no reserve is refused by the provider
- **THEN** that refusal is recorded as an observation
- **AND** the seat has a capacity estimate it did not have before

### Requirement: Every invocation records which role spent from which seat

Because a seat is chosen at run time, configuration alone cannot say which seat paid for a
given piece of work. Each invocation SHALL record the role, the seat, the reported cost, and
the time, so the question is answerable from the record. A seat probe is made on no role's
behalf; it SHALL record that it was a seat probe in place of a role.

#### Scenario: Attribution recoverable after the fact

- **WHEN** an operator asks which Igor consumed a person's spare capacity
- **THEN** the answer is determinable from recorded invocations
- **AND** it does not depend on inferring anything from configuration

#### Scenario: A probe is recorded as a probe

- **WHEN** a seat probe is made
- **THEN** the record names the seat, the cost and the time
- **AND** it says the spend was a seat probe rather than naming a role

### Requirement: A spend with no seat behind it does not happen

Where seats are declared, every model call Igor makes on its own behalf SHALL be charged to the
seat the gate chose for the role, and SHALL be made with that seat's credential where the seat
names one. A seat probe is the one exception to the gate choosing: it is charged to the seat it
reads and made with that seat's own credential, and it is made only on a seat that names one. Where the gate names no seat, the call SHALL NOT be made, and no ambient credential
SHALL be substituted for the seat the gate did not name. Where an organization declares no
seats, budget is not enforced and this requirement places no condition on anything.

The condition is whether the gate named a seat, not whether a credential was found. A seat
naming none of the three token mechanisms is already unaffected by the rule that governs them —
it runs on whatever login is ambient — and it is still a seat the gate chose, still bounded by
its reserve, still named in the record as having paid. What has no seat behind it is a call the
gate refused to choose one for.

This is the spending-side counterpart of the reading rule already in force: a seat naming a
token that is not available is reported unreadable and no other credential is used in its place.
The same principle governs spending — a seat the gate did not name cannot be charged, and a
credential no seat names cannot be attributed — but it was written only of readings, so the one
spend in the cycle that does not go through a worker reached an ambient fallback with no seat
behind it and nothing in the record naming what paid.

Attributing that spend instead of refusing it was considered and rejected. A record saying an
unnamed login paid is honest about a call that should not have been made, leaves the ceiling
unenforced, and does nothing at all on a host where no ambient login exists: there the call
fails with a message about not being logged in, which describes a machine whose credentials are
configured correctly and whose seats are simply held.

The exemption for an organization with no seats is not an oversight to be tightened later. A
deployment that declares no seats has asked for no ceiling and made no promise about which
credential pays, and the fallback is what it runs on.

#### Scenario: No seat, no spend

- **WHEN** the gate names no seat for a role, because every seat is spent or the pool cannot be
  used
- **THEN** no model call is made on that role's behalf
- **AND** no credential is substituted for the seat's

#### Scenario: A spend nothing can attribute is refused rather than recorded as ambient

- **WHEN** a call could only be made on a credential no seat names
- **THEN** it is refused
- **AND** it is not made and recorded against the ambient login instead

#### Scenario: An unenforced budget is untouched

- **WHEN** an organization declares no seats
- **THEN** calls run on whatever login is ambient, as they did before
- **AND** nothing is refused for want of a seat

#### Scenario: A call that runs names the seat that paid

- **WHEN** the gate names a seat and the call is made
- **THEN** the call uses that seat's credential where the seat names one
- **AND** the record names that seat as having paid, whether or not it named a token

#### Scenario: A seat naming no token is still a seat

- **WHEN** the gate chooses a seat that names none of the token mechanisms
- **THEN** the call is made, on the ambient login, as that configuration already permits
- **AND** the seat is recorded as having paid

### Requirement: A pool is an ordered list of seats, and order is the allocation mechanism

Organization configuration MAY declare pools, each an **ordered** list of seat identifiers. A
role referencing a pool SHALL spend from the first seat in that list with headroom remaining.
A role MAY reference a single seat instead, for an Igor that must never draw on a shared one.

Ordering is what expresses the common arrangement — some dedicated capacity, plus whatever the
team has spare — without a separate overflow concept. A seat nobody works on declares no
reserve; a person's seat declares one, and is listed after the dedicated seats so it is drawn
on last.

A seat declaring a reserve is drawn on only once it has a capacity figure — observed, or
declared as a `capacity_estimate` — because a fraction of an unknown quantity bounds nothing.
The one exception is calibration admission: a reserved seat with no figure, whose most recent
unreset observation of every window is below `1 − reserve`, is drawn on one item at a time, as
*A seat with no capacity figure at all protects no floor* says. The overflow position in a pool
is therefore conditional on that seat having a figure or being admissible that way, and a pool
whose only reserved seat is neither has nothing to overflow into.

#### Scenario: Dedicated capacity is consumed before a person's

- **WHEN** a pool lists dedicated seats ahead of seats owned by people
- **THEN** work is charged to the dedicated seats until they have no headroom
- **AND** only then to a person's seat, and never past that seat's reserve

#### Scenario: A seat without headroom is passed over, not waited on

- **WHEN** the first seat in a pool has reached its reserve
- **THEN** the next seat with headroom is used
- **AND** the Igor does not stop while the pool has capacity

#### Scenario: An uncalibrated reserved seat is not the pool's fallback

- **WHEN** the dedicated seats in a pool have no headroom and the reserved seat behind them has
  no capacity figure, neither observed nor declared
- **AND** that seat has no unreset observation of every window below `1 − reserve`
- **THEN** the pool is treated as having no headroom
- **AND** the reserved seat is not spent from against a guessed capacity

#### Scenario: A read reserved seat is the fallback one item at a time

- **WHEN** the dedicated seats in a pool have no headroom and the reserved seat behind them has
  no capacity figure, but its most recent unreset observation of every window is below
  `1 − reserve`
- **THEN** one item at a time may be charged to that seat under calibration admission

#### Scenario: Exhausting every seat in a pool is a handoff

- **WHEN** no seat in a role's pool has headroom
- **THEN** the Igor hands off rather than stopping silently

#### Scenario: Pool referencing an undeclared seat rejected

- **WHEN** a pool lists a seat not declared in organization configuration
- **THEN** validation fails

### Requirement: The reserve is untouchable

An Igor SHALL treat the seat's reserve as unavailable. The reserve SHALL be enforced as a bound
on what Igors themselves spend — recorded spend against the seat, summed across every Igor and
role drawing on it within the window, SHALL NOT exceed `(1 − reserve) × capacity` — rather than
as a distance from a reading of how full the seat is. Work MUST stop at that bound rather than
at exhaustion, so that a person sharing the seat retains capacity.

Bounding Igor's own spend guarantees the owner's floor by construction: whatever the owner does
with the rest of the window, the fraction Igors can have taken from it is capped, and no
observation of the owner is required. That independence is the point — the floor holds while
observations are stale, sparse or absent, which is the normal condition. The subscription behind
a seat is shared with that person's Claude on web, desktop and mobile, not only with Claude
Code, so the consumer Igor sees least of is the largest one, and a floor whose enforcement
waited on a current reading of them would lapse exactly when readings stopped arriving.

Every Igor drawing on a seat writes its executions to the same state branch, so the sum is
recoverable from one record and Igors sharing a seat with each other stay within one bound. A
person is the only consumer that keeps no books.

A seat that has no capacity figure has no bound to enforce this way. For such a seat alone,
calibration admission lets in one item at a time on a reading of how full the seat is, while that
reading is below `1 − reserve`, as *A seat with no capacity figure at all protects no floor* says.
That is the stated exception to enforcing the reserve as a bound on Igor's spend rather than as a
distance from a reading. It ends as soon as the seat has a figure, and from then on the bound
above applies.

#### Scenario: Igor stops at the reserve

- **WHEN** recorded Igor spend against a seat reaches `(1 − reserve) × capacity` for a window
- **THEN** the Igor stops taking new work on that seat and hands off any in progress
- **AND** the reserved fraction of capacity remains unspent by Igors

#### Scenario: Human capacity preserved

- **WHEN** an Igor shares a seat with the person who owns it
- **THEN** the reserved fraction is available to that person regardless of Igor activity

#### Scenario: The floor holds without observing the owner

- **WHEN** nothing reports how much of a seat its owner has consumed
- **THEN** the bound on Igor spend is still enforced
- **AND** the reserve is still guaranteed to the owner

#### Scenario: Several Igors share one bound

- **WHEN** two Igors spend from the same seat
- **THEN** their recorded spend is summed against a single bound
- **AND** neither is permitted the whole of it

### Requirement: Capacity is recorded spend divided by the fraction it consumed

A seat's capacity for a window SHALL be derived as recorded Igor spend within that window
instance divided by the fraction of the window an observation reported consumed. The numerator
SHALL be the spend recorded for that seat within the instance the observation belongs to —
bounded by the observation's reset time and the window's fixed cadence — and not spend over all
recorded history.

Instances tile the timeline: each ends exactly where the next begins, and no moment belongs to
neither. One observed reset therefore fixes every boundary before and after it by subtraction,
which is what lets spend be assigned to an instance at all. The session window runs five hours
and the weekly window seven days until measurement says otherwise, as *A window's length is
measured from successive resets, not configured* says.

Where a seat has consumers Igor cannot see, the quotient is lower than the seat's true capacity,
because the numerator counts only Igor's share of a denominator that everybody moved. That error
is deliberate and is in the safe direction: a capacity estimated low yields a bound on Igor that
is tighter than intended, which cannot overrun anybody's floor.

It is a property of one observation, not a ceiling on what can be known. A seat read repeatedly
is also read across intervals its owner happened to sit out, and those yield the capacity
outright. Which observations to combine, and how, wants a season of them to decide; what must
not be concluded is that a shared seat is stuck with an underestimate, because a seat
permanently under-used is the waste that lending was meant to avoid.

An observation with no recorded spend in its instance SHALL yield no capacity figure. Dividing
by an unrelated numerator produces a number, and nothing about that number is true.

#### Scenario: Capacity derived from one observation

- **WHEN** an observation reports a window 36% consumed and the record shows Igor spent an
  amount within that instance
- **THEN** capacity for that window is that amount divided by 0.36

#### Scenario: Only the instance the observation belongs to counts

- **WHEN** spend is recorded for a seat across several instances of the same window
- **THEN** only spend within the observation's own instance is the numerator

#### Scenario: A co-consumer makes the estimate low, not high

- **WHEN** a seat's owner has also consumed part of the observed window
- **THEN** the derived capacity is lower than the seat's true capacity
- **AND** the resulting bound on Igor spend is tighter rather than looser

#### Scenario: No spend in the instance derives nothing

- **WHEN** an observation's window instance has no recorded Igor spend
- **THEN** no capacity figure is derived from it
