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
high — a figure that overstates what the window holds. Timed at arrival, the run's spend is
excluded while the reading may already reflect some of it, so the capacity comes out slightly low,
the direction already accepted from a co-consumer. A capacity is reported and decides nothing
(*The reserve is untouchable*), so this is about the report being honest. What the gate uses is
the reading itself, and the time it arrived is also what bounds how far one run can carry a seat
past its line before the next reading shows it.

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

### Requirement: A missing reading closes a reserved seat and changes nothing else

The absence of a `rate_limit_event`, or an event that cannot be read, SHALL record no observation
from the stream, SHALL leave the run's recording exactly as it would otherwise have been, and
SHALL NOT fail the run. Its one effect on a budget decision is the one *A seat with no reading is
drawn on only where its line is the whole window* states. A seat whose effective reserve for a
role — the larger of the seat's reserve and the role's — is above 0, and that has no unreset
reading of a window, is not drawn on for that role until something reads it again. A seat whose
effective reserve is 0 has a line of 100% whatever the reading says, so it is admitted with no
reading and runs until the provider refuses it.

The event is undocumented, and the gate rests on it for reserved seats. For a seat whose
credential is a `setup-token` one the stream is the only source of a reading other than a refusal,
and a refusal only ever shuts a window. So if the provider drops or changes the event:

- **What fails closed:** every seat whose effective reserve is above 0 goes idle for that role once
  its last reading resets, and stays idle until readings return. Nobody's reserve is spent on a
  guess.
- **What keeps running:** every seat whose effective reserve is 0, stopped by the provider's
  refusal as it is without this change. A refusal is still recorded from the envelope, and still
  shuts its window until its reset.

#### Scenario: No event, no observation

- **WHEN** a worker run's stream carries no `rate_limit_event`
- **THEN** no observation is recorded from the stream
- **AND** the run is recorded as it would have been otherwise

#### Scenario: A malformed event is not a failed run

- **WHEN** a `rate_limit_event` is missing fields or carries values of the wrong type
- **THEN** no observation is recorded for what cannot be read
- **AND** the run's outcome is unaffected

#### Scenario: A reserved seat whose readings stop is closed, not guessed at

- **WHEN** a seat declares a reserve of 0.5, its runs stop carrying events, and its last reading of
  the session has passed its reset
- **THEN** it is passed over for want of a reading
- **AND** it is left to the seat probe, under the probe's own limits

#### Scenario: A seat at reserve 0 runs on without events

- **WHEN** a seat declares reserve 0, the role drawing on it declares none, and its runs carry no
  events
- **THEN** work may still be charged to it
- **AND** it stops when the provider refuses it

#### Scenario: A role's reserve needs a reading even on a reserve-0 seat

- **WHEN** a seat declares reserve 0, a role drawing on it declares 0.3, and the seat has no unreset
  reading of a window
- **THEN** that role's Igor does not draw on the seat until something reads it
- **AND** a role declaring no reserve still may

### Requirement: A seat nothing has read is probed on the Igor server with its own token

Where seats are declared, for a seat that names a token source and has no unexpired reading of a
window — no `usage` or `stream` observation of it whose reset has not passed — the server running
the Igors SHALL make a seat probe: one minimal `claude -p` call with that seat's own configured
token, on the cheapest model, with a trivial prompt and no tools, and with `--output-format
stream-json --verbose`. It SHALL read the call's `rate_limit_event` and record it as a `stream`
reading of that seat, exactly as a worker run's event is recorded.

Stream readings arrive only when a run is made on a seat, which leaves two seats unread. A seat
with a non-zero reserve is drawn on only while an unreset reading shows it below its line, so
until something reads it, it never runs and never gets a reading. And a seat the fleet is not
using is never read. A probe reads both, on the machine that already holds the seat's token and
config. The post-reset probe that *A window's length is measured, and so is whether it starts at
first use* specifies is a seat probe too, and every limit and exclusion here applies to it.

A seat probe SHALL run only on the server that runs the Igors, never on a person's machine, and
nothing SHALL be installed anywhere else for it. A seat naming no token source SHALL NOT be probed:
its call would run on whatever login is ambient, which reads that login rather than the seat.

A seat probe is not free. Its cost SHALL be recorded like any other spend, against the seat it
read, marked as a seat probe. Its consumption reaches the seat's next reading like any other.

A seat SHALL NOT be probed more than once an hour, nor while a probe of it is still running. A
probe that receives no `rate_limit_event`, or one that cannot be read, SHALL record no
observation, and that seat SHALL NOT be probed again until one session window's length (five
hours) has passed. A probe that fails SHALL NOT be retried in a loop.

A seat probe SHALL NOT be made on a seat the gate has found refused, while that refusal is
unexpired: an unexpired observation at 100% of a window stops probes of that seat until the reset
it states. Nor SHALL one be made on a seat whose unexpired reading reports extra usage being spent,
until that window resets, since a probe there would spend its owner's money. Nor SHALL one be
made on a seat whose most recent unreset reading of any window is at or past that window's line
(*The reserve is untouchable*), since a probe's consumption is Igor's and the reading says the
seat has none to give it.

**A probe checks the credential too.** A probe the provider answers with an authentication failure
(HTTP 401) SHALL open the seat's credential stop, `seat:<id>:credential`, in whichever record owns
that stop: the breaker #65 proposes, or the condition record #101 specifies, whichever lands first.
A probe that succeeds SHALL count as the check that clears that stop. An authentication failure is
not a probe that received no event, so the five-hour back-off SHALL NOT follow it. A seat whose
credential stop is open SHALL be probed only as that clearing check, whatever its readings, and
never more than once an hour. Every other exclusion above still applies to it: a seat refused, spending extra
usage, or at its line could not be used if its credential were cleared, so it keeps its stop until
it could.

#### Scenario: A reserved seat with no reading is probed

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
- **THEN** its reported cost is recorded against the seat it read, as a seat probe

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

#### Scenario: A seat past its line is not probed

- **WHEN** a seat's session reading has expired, and its most recent unreset week reading is at or
  past the week's line
- **THEN** it is not probed while that remains so

#### Scenario: A probe refused its credential opens the stop

- **WHEN** a seat probe is answered with an authentication failure
- **THEN** the seat's credential stop `seat:<id>:credential` is opened
- **AND** no observation is recorded

#### Scenario: A probe that succeeds clears the stop

- **WHEN** a seat's credential stop is open and a probe of it succeeds
- **THEN** the stop is cleared
- **AND** any reading the probe carried is recorded as usual

#### Scenario: A stopped credential is checked hourly

- **WHEN** a seat's credential stop is open and it was probed less than an hour ago
- **THEN** it is not probed again
- **AND** once an hour has passed it is probed again, with no five-hour back-off

#### Scenario: A seat with no token source is not probed

- **WHEN** a seat names none of the token mechanisms
- **THEN** no probe is made on it

#### Scenario: A probe never runs on a person's machine

- **WHEN** a seat is probed
- **THEN** the call is made by the server running the Igors, with the token in its config

### Requirement: Observations arrive irregularly, and a gap is waiting, not a fault

No behaviour SHALL require that a reading of a seat was taken at a particular time or at a
particular interval. A gap between readings SHALL NOT be treated as an error, and SHALL NOT be
filled by interpolating or repeating a reading.

Readings arrive with the work. A stream reading comes with a run on the seat, and a probe comes
only when a seat has no unexpired reading, or just after a reset it knows of, within the probe's
own limits. A seat nobody is spending from on a quiet day is read about once a session window. A
seat the fleet is busy on is read many times an hour. Neither is a fault, and a system that
expected a regular cadence would report the first as one.

A seat with a non-zero reserve is drawn on only while an unreset reading shows it below its line,
so a gap that runs past a reset leaves it waiting for the next run's or probe's reading. That is
waiting, not a fault, and nothing reports it as one.

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

### Requirement: A window's length is measured, and so is whether it starts at first use

A window's length, and whether its instances run on a fixed schedule or start at the first use
after a reset, SHALL be measured, not configured. Until measured, a built-in length stands (five
hours for the session, seven days for the week) and instances are taken to run on a fixed
schedule. Wherever a length or a schedule is reported, it SHALL say whether it is built-in or
measured, and how it was measured.

**Just after a reset, by a probe.** Every reading states when its window resets. For each seat
that names a token source, the server running the Igors SHALL make a seat probe ten minutes after
a reset it knows of, once for each window type, and again about once a week to catch a change.
The new reading's reset, set against the old reset and the probe's own time, gives both answers.
On a fixed schedule the new reset is the old reset plus one length. Where instances start at first
use, it is the probe's time plus one length.

One probe gives the two differences, new reset less old reset and new reset less the probe's time,
and they differ by the probe's delay under either schedule. So one probe tells the schedules apart
only against a length already expected: whichever difference equals the built-in length, or the
last measured one, names the schedule and the length. Where neither does, a post-reset probe after
a later reset, at a different delay, SHALL settle it: on a fixed schedule the new reset does not
move with the probe's delay, and at first use it moves by the same amount.

A post-reset probe is a seat probe. Every limit and exclusion of *A seat nothing has read is probed
on the Igor server with its own token* applies to it, including the hourly limit and the line, and
its cost is recorded. Where one is excluded, the next reset it knows of is the next chance.

Two costs of it are stated rather than hidden. On a window that starts at first use the probe
itself starts the instance, which then runs from the probe rather than from the owner's first
use. And on a shared seat the owner may use it between the reset and the probe, which starts the
instance earlier and makes the probe-time difference short by that interval. Ten minutes keeps
the second small, and the weekly repeat bounds the first.

A length measured this way SHALL supersede the built-in length whether it is longer or shorter,
because the probe reads the instance immediately after the reset it follows and no unread instance
lies between them.

**Passively, from ordinary readings.** The smallest positive difference between two differing
reset instants among a window's observations is also evidence of its length, and it arrives as a
by-product of the work. Readings do not come from every instance, so a difference between two
resets is at least one length and may be several, and at first use it also includes the idle
time before each instance began. The smallest difference is therefore the best passive estimate,
and its error is on the long side. It SHALL supersede the length in use only where it is shorter.
A longer passive figure is what unread instances produce, so it SHALL be reported and SHALL NOT be
used.

**Placing one instance from another.** Where a window is measured to run on a fixed schedule, one
reset fixes every boundary before and after it. Where it is measured to start at first use, an
instance SHALL be placed only from its own reset, one length before it, and no instance SHALL be
inferred from another's reset across a gap.

The built-in length is not a configuration knob, and the difference matters. A knob is a number
somebody sets once from a guess and nobody revisits. A built-in that measurement overwrites is a
starting point with an expiry.

#### Scenario: A post-reset probe finds a fixed schedule

- **WHEN** a session reading reported a reset at 14:00, and a probe at 14:10 reads a new reset at
  19:00
- **THEN** the session's length is five hours, measured after a reset
- **AND** its instances run on a fixed schedule

#### Scenario: A post-reset probe finds instances starting at first use

- **WHEN** a session reading reported a reset at 14:00, and a probe at 14:10 reads a new reset at
  19:10
- **THEN** the session's length is five hours, measured after a reset
- **AND** its instances start at first use

#### Scenario: A post-reset probe keeps the probe's limits

- **WHEN** a seat's session has just reset, and the seat was probed less than an hour ago or its
  unreset week reading is at or past the week's line
- **THEN** no post-reset probe is made on it after that reset

#### Scenario: The measurement is repeated

- **WHEN** a window's length and schedule were measured after a reset about a week ago
- **THEN** a post-reset probe is made after that window's next known reset

#### Scenario: A longer length measured after a reset is followed

- **WHEN** a post-reset probe measures a session length longer than five hours
- **THEN** that length is used, and reported as measured after a reset

#### Scenario: Unread instances do not stretch the window

- **WHEN** no post-reset probe has measured a window, and the resets of its observations differ by
  five hours and by fifteen hours
- **THEN** its length is five hours

#### Scenario: A shorter passive length replaces the one in use

- **WHEN** the smallest difference between a window's observed resets is shorter than the length
  in use
- **THEN** that measured length is used
- **AND** nothing is configured for it to take effect

#### Scenario: A longer passive length is reported and not used

- **WHEN** no post-reset probe has measured a window, and every difference between its observed
  resets is longer than its built-in length
- **THEN** the built-in length is still used
- **AND** reporting shows the measured length beside it

#### Scenario: Before measurement the built-in length stands, and says so

- **WHEN** no post-reset probe has measured a window and fewer than two differing resets have been
  observed for it
- **THEN** the built-in length and a fixed schedule are used
- **AND** both are reported as built-in rather than measured

#### Scenario: No instance is inferred across a gap at first use

- **WHEN** a window is measured to start at first use
- **THEN** an instance is placed only from its own reset
- **AND** no instance is placed from another instance's reset

#### Scenario: A window's length is not settable

- **WHEN** an operator supplies a window length in configuration
- **THEN** it is rejected

### Requirement: Holding back at the line is distinguishable from having nothing to do

An Igor that takes no work because every seat it may draw on is at or past its line SHALL record
that as the reason, distinctly from a seat the provider refused, from a seat passed over for want
of a reading, and from an empty queue. Budget reporting SHALL say such a seat is holding back, and
name the instant at which its line reaches its most recent reading, which is when it would admit
work again if nothing more were used.

From outside, all four look like an Igor doing nothing, and they call for different responses. A
refused seat wants its reset. A seat nothing has read wants a reading. An empty queue means the
lane is wrong. A seat holding back is the reserve working as intended, and needs nothing.

The line rises as the window runs out, so a seat holding back becomes usable again with time alone
unless more is used. That instant is `resetsAt − (1 − reading) ÷ r × window length`, with `r` the
reserve the line uses, and it comes before the reset.

#### Scenario: The record says which

- **WHEN** a cycle takes no work because the role's seats are at their lines
- **THEN** the decision record names holding back at the line rather than exhaustion or an empty
  queue

#### Scenario: Reporting says when the line passes the reading

- **WHEN** a seat declares a reserve of 0.3, its week reading is 94%, and 30% of the week remains,
  so its line is 91%
- **THEN** reporting says the seat is holding back
- **AND** it names the instant at which 20% of the week remains, when the line reaches 94%

### Requirement: A handoff for a window the line shut states its crossing, marked approximate

Where a window is shut because its reading is at or above the seat's reserve line, and the reading
is below 100%, the hour a handoff states for that window SHALL be the instant the line rises past
the reading, not the window's reset, and it SHALL be marked approximate.

The line rises toward 100% as the window runs down, so such a window reopens before its reset,
and stating the reset would be late by up to the whole window. The crossing is marked because a
reading is only a lower bound until its window resets: the owner may have spent since, so the
seat can be back later than the crossing and never earlier. A reading of 100% is a refusal, and
its window still returns at its reset.

#### Scenario: A reserve line's crossing is stated, and hedged

- **WHEN** a window is shut because its reading, below 100%, is at or above the seat's reserve line
- **THEN** the hour stated for it is the instant the line rises past that reading, not its reset
- **AND** it is marked approximate

#### Scenario: A refused window still returns at its reset

- **WHEN** a window is shut because its reading is 100%
- **THEN** the hour stated for it is its reset

### Requirement: A seat's fullness is read from the seat, not supplied by a person

How full a seat is SHALL be established from the seat itself — read directly where the seat's
credential yields a reading, and otherwise taken from recorded observations of that seat. The
system MUST NOT require a person to submit a usage figure.

Neither a usage figure nor a capacity SHALL be configured. How full the window is right now
changes by the minute and is the thing a person cannot supply usefully. A capacity in dollars was
once declarable, as `capacity_estimate`, to start a reserved seat under a bound on Igor's spend;
whether Igor may start work on a seat is now decided by the seat's reading against its line (*The
reserve is untouchable*), and a figure in dollars is not an input to that, so the key has nothing
left to do. A capacity is only ever derived from observations, and reported.

`capacity_estimate` SHALL be refused wherever a seat declares it, because configuration refuses a
key nobody reads. So that an operator upgrading an existing config is not left guessing, the
refusal SHALL name the key, say that it was removed with the dollar bound (#143), and say to
delete the line.

`/usage` reports window percentages only to a credential the provider can resolve a
subscription for. The credential a seat holds is a `setup-token` one, which carries no
subscription identity, so `/usage` under it reports a per-invocation cost summary instead. The
same credential does receive the seat's windows, in the `rate_limit_event` on the output stream
of a run made with it, so a seat is read through its own credential whenever such a run is made.
Where a reading can be taken it remains the better answer and is taken; its absence must close a
reserved seat rather than blind the system to it, because a seat nothing can measure is otherwise
a seat with no ceiling at all.

#### Scenario: Capacity established without a person

- **WHEN** an Igor needs to know whether it may spend
- **THEN** the seat's usage is read directly where its credential yields a reading
- **AND** otherwise how full it is comes from recorded observations of that seat
- **AND** no human supplies how full the window is, in either case

#### Scenario: A declared capacity is refused, saying how to fix it

- **WHEN** a seat in an existing config declares `capacity_estimate`
- **THEN** the config is refused at load
- **AND** the refusal names `capacity_estimate`, says it was removed with the dollar bound (#143),
  and says to delete the line

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
- **THEN** it is judged on its recorded observations against its line rather than passed over on
  that ground alone
- **AND** where its effective reserve is above 0 and it has no unreset observation, it is passed
  over, with the reason

#### Scenario: One unreadable seat does not blind the rest

- **WHEN** one seat of several cannot be read
- **THEN** the others are still reported and still usable

### Requirement: Recorded spend attributes a seat between its roles, and decides no headroom

Recorded cost SHALL be used to apportion a seat between the roles drawing on it, and to derive
the seat's capacity in dollars for reporting. It SHALL NOT decide whether the seat has anything
left: that is decided by the seat's reading against its line (*The reserve is untouchable*).
What fraction of a seat a role is responsible for comes from the record; how full the seat is
comes from a reading.

A reading says how full the whole seat is, owner's use included; which role consumed what still
comes only from the record. Cost is reported as an equivalent value at list prices rather than
an amount billed, which is what makes it usable as a proxy for consumption of a subscription
window.

#### Scenario: A role's share derived from its spend

- **WHEN** two roles have drawn on one seat
- **THEN** each role's share of the consumed limit follows its share of recorded cost

#### Scenario: No recorded spend attributes nothing

- **WHEN** a seat has no recorded spend
- **THEN** no role is held to have consumed any of it

#### Scenario: The record does not decide exhaustion

- **WHEN** a seat has recorded spend and no unreset reading
- **THEN** whether it may be drawn on is decided as *A seat with no reading is drawn on only where
  its line is the whole window* says
- **AND** no sum of recorded spend opens or shuts it

### Requirement: A role may hold back more of a seat than the seat does

A role MAY declare a `reserve`, a fraction from 0 to 1, both included. It SHALL apply to every seat
the role draws on, and it is not set per seat. The line that role's Igor checks on a seat SHALL use the larger of the seat's reserve and
the role's (*The reserve is untouchable*). So a role can hold back more than a seat does and never
less: a lender's reserve holds whatever a role declares. On a seat declaring reserve 0, the role's
reserve alone sets that role's line. A role reserve is valid whatever seats the role draws on, a
dedicated seat included.

A role's reserve SHALL be raised by inheritance and never lowered. A role MAY declare a larger
reserve than the one it inherits from its parent or from `roles/org.yaml`, and SHALL NOT declare a
smaller one: configuration declaring a child reserve below its parent's SHALL be refused, naming
both values and the role each came from. It is the same protective direction as taking the larger
of the seat's and the role's reserve: nothing below a level can hold back less than that level
does.

It gives roles sharing a seat a priority without coordinating them. Every Igor compares the same
whole-seat reading against its own line, so once the reading passes a higher-reserve role's line,
only roles with a lower one take items there. With `frontend` at 0.3 and `generalist` at none on
one seat, `frontend` stops at 70% just after a reset, rising to 100% at the reset, and `generalist`
takes what lies above that line.

It is a priority, not a guaranteed share. A lower-reserve role that always has work can hold the
seat at a higher-reserve role's line for most of a window and so crowd it out. No mechanism is
added against that. Two remedies exist: choosing which roles a seat serves, so a seat that does
not serve the greedy role is kept from it; and more seats, so that the lower-reserve role is fully
served elsewhere.

#### Scenario: A higher-reserve role yields to a lower one

- **WHEN** `frontend` declares a reserve of 0.3 and `generalist` declares none, both draw on one seat
  declaring reserve 0, half its week remains, and its week reading is 88%
- **THEN** `frontend`'s Igor takes no item on that seat, because its line is 85%
- **AND** `generalist`'s Igor may, because its line is 100%

#### Scenario: A role cannot lower a lender's reserve

- **WHEN** a seat declares a reserve of 0.5 and a role drawing on it declares 0.2
- **THEN** the role's line on that seat uses 0.5

#### Scenario: One reserve for every seat the role draws on

- **WHEN** a role declares a reserve of 0.3 and may draw on three seats
- **THEN** each of the three is judged against a line using at least 0.3

#### Scenario: A role reserve out of range is refused

- **WHEN** a role declares a reserve below 0 or above 1
- **THEN** validation fails

#### Scenario: A child role may raise its inherited reserve

- **WHEN** `roles/org.yaml` declares a reserve of 0.2 and a role extending it declares 0.4
- **THEN** configuration is valid, and the role's reserve is 0.4

#### Scenario: A child role may not lower its inherited reserve

- **WHEN** a role's parent declares a reserve of 0.3 and the role declares 0.1
- **THEN** validation fails
- **AND** the refusal names both reserves and the role each came from

#### Scenario: A role declaring none inherits its parent's

- **WHEN** a role's parent declares a reserve of 0.3 and the role declares none
- **THEN** the role's reserve is 0.3

#### Scenario: A role reserve with a dedicated seat is valid

- **WHEN** a role naming a dedicated seat declares a reserve of 0.4
- **THEN** configuration is valid

## REMOVED Requirements

### Requirement: Usage is read from the seat, not supplied by a person

**Reason**: It made a declared `capacity_estimate` what starts a reserved seat, and said the
absence of a reading "must bound the seat" through recorded spend. Under the moving line a seat
is admitted on its reading and no figure in dollars admits it. So its scenario *A declared
capacity gets a reserved seat started* is false, and openspec will not archive a `MODIFIED` block
that drops a scenario.

**Migration**: Replaced by *A seat's fullness is read from the seat, not supplied by a person*,
added by this change. It keeps every other rule and scenario, and removes `capacity_estimate`:
an existing config carrying it is refused with a message saying to delete the line.

### Requirement: Recorded spend attributes a seat between its roles

**Reason**: It made recorded spend, taken against a capacity, what decides whether a seat has
anything left, and its scenario *The record decides exhaustion where no reading can* says so.
Under the moving line that is decided by the seat's reading, and openspec will not archive a
`MODIFIED` block that drops the scenario.

**Migration**: Replaced by *Recorded spend attributes a seat between its roles, and decides no
headroom*, added by this change. It keeps apportioning between roles and deriving the reported
capacity, and says the record opens and shuts nothing.

## RENAMED Requirements

- FROM: `### Requirement: A seat with no capacity figure at all protects no floor`
- TO: `### Requirement: A seat with no reading is drawn on only where its line is the whole window`

## MODIFIED Requirements

### Requirement: Seats are named configuration entities with an owner and a reserve

Organization configuration SHALL declare seats, each with an identifier, an `owner` — the
person who can read that seat's usage — and a `reserve`: the share of the remaining window held
back from Igors, as *The reserve is untouchable* defines it. A role SHALL reference the seat it
spends from.

A reserve SHALL be a fraction from 0 to 1, both included. On a seat a person lends, it is held
back for that person. On a seat nobody works on, it is held back for work that arrives later in
the window, which spreads Igor's use across the window rather than spending it as work comes; such
a seat declares none by default, because spending early is not waste when the work is there. At 1
nothing is held back at the reset and the window is spent evenly across its length. A reserve is
the same setting on every seat, and the same rule reads it. A role MAY hold back more of a seat
than the seat does, never less (*A role may hold back more of a seat than the seat does*).

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

#### Scenario: A seat nobody works on may declare a reserve

- **WHEN** a seat declared as dedicated declares a reserve of 0.5
- **THEN** configuration is valid
- **AND** the seat is held to its line as any other seat is

#### Scenario: A reserve of 1 is accepted

- **WHEN** a seat declares a reserve of 1
- **THEN** configuration is valid

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

#### Scenario: A reading becomes an observation

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

### Requirement: A seat with no reading is drawn on only where its line is the whole window

A seat SHALL be drawn on only where it is known to be below its line in every window (*The
reserve is untouchable*). Where a seat has no unreset reading of a window, all that is known of
that window is that the provider has not refused it, which is below the line only where the line
is 100% at every moment: where the reserve the line uses, the larger of the seat's and the role's,
is 0. So where that reserve is non-zero and the seat has no unreset reading of a window, the seat
SHALL be passed over for that role, with that as the stated reason. Where it is 0 the seat MAY be
drawn on with no reading, stopped by the provider's refusal; its first run's reading, or its first
refusal, is its first reading.

No capacity figure SHALL admit a seat or keep one out. The line is a
fraction of the window compared against a fraction of the window, and needs no quantity in
dollars. A reserved seat nothing has read is passed over not because its size is unknown but
because how full it is is unknown, and spending somebody's subscription past a line nobody has
checked is invisible to them until their own work is refused.

The seat's own credential receives a reading on the stream of every run made with it, and the
seat probe reads a seat nothing has run on, so no machine with an interactive login is required.
Apart from the probe, no call is made on a seat passed over this way. Being passed over means no
work is charged to the seat; it does not mean the seat is never read.

#### Scenario: A reserved seat is not spent from on a guess

- **WHEN** a seat declares a reserve of 0.5 and has no unreset reading of its week
- **THEN** it is passed over
- **AND** the reason given is that nothing has read it
- **AND** it is left to the seat probe

#### Scenario: A read seat needs no capacity figure

- **WHEN** a seat declares a reserve of 0.5, has no capacity figure for either window, and its
  most recent unreset readings put the session at 20% and the week at 30%, both below their lines
- **THEN** work may be charged to it

#### Scenario: A dedicated seat runs uncalibrated

- **WHEN** a seat declares reserve 0, the role drawing on it declares none, and the seat has no
  observation
- **THEN** work may be charged to it, because at reserve 0 the line is 100% at every moment

#### Scenario: The first refusal calibrates it

- **WHEN** a seat at reserve 0 with no reading is refused by the provider
- **THEN** that refusal is recorded as an observation, and is the seat's first reading
- **AND** the window it names is shut until its reset

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
team has spare — without a separate overflow concept. A seat nobody works on usually declares no
reserve and is filled to the whole window; a person's seat declares one, and is listed after the
dedicated seats so it is drawn on last.

A seat has headroom while its most recent unreset reading of every window is below that window's
line (*The reserve is untouchable*). A seat with no unreset reading of a window has none wherever
its line uses a non-zero reserve, as *A seat with no reading is drawn on only where its line is the
whole window* says. The overflow position in a pool is therefore conditional on that seat having
been read below its line, and a pool whose only reserved seat has not has nothing to overflow into.

#### Scenario: Dedicated capacity is consumed before a person's

- **WHEN** a pool lists dedicated seats ahead of seats owned by people
- **THEN** work is charged to the dedicated seats until they have no headroom
- **AND** only then to a person's seat, and never past that seat's line

#### Scenario: A seat without headroom is passed over, not waited on

- **WHEN** the first seat in a pool has reached its line
- **THEN** the next seat with headroom is used
- **AND** the Igor does not stop while the pool has capacity

#### Scenario: An uncalibrated reserved seat is not the pool's fallback

- **WHEN** the dedicated seats in a pool have no headroom and the reserved seat behind them has
  no unreset reading of a window
- **THEN** the pool is treated as having no headroom
- **AND** the reserved seat is not spent from on a guess

#### Scenario: A reserved seat read below its line is the fallback

- **WHEN** the dedicated seats in a pool have no headroom and the reserved seat behind them has
  unreset readings of both windows below their lines
- **THEN** work may be charged to that seat, whether or not it has a capacity figure

#### Scenario: Exhausting every seat in a pool is a handoff

- **WHEN** no seat in a role's pool has headroom
- **THEN** the Igor hands off rather than stopping silently

#### Scenario: Pool referencing an undeclared seat rejected

- **WHEN** a pool lists a seat not declared in organization configuration
- **THEN** validation fails

### Requirement: The reserve is untouchable

An Igor SHALL treat the reserved share of what remains of each window as unavailable. For each
window it SHALL start work on a seat only while that seat's most recent unreset reading of the
window is below the seat's line for that window:

    line      = 1 − r × remaining
    r         = max(the seat's reserve, the role's reserve), a role declaring none counting as 0
    remaining = (resetsAt − now) ÷ window length, clamped to [0, 1]

where `resetsAt` is the reset that reading reports and the window length is the one in use for
that window (*A window's length is measured, and so is whether it starts at first use*). Both
windows SHALL be below their lines.

The reading is the latest unreset observation of the window, all models, whatever its source: a
`stream` reading, a refusal, or a `usage` row already in the log, and on a seat `/usage` reads
live, that live reading. A refusal counts as a reading for this: an observation at 100% of the
window it names until its reset, whether it was recorded from a refused worker run's envelope or
from a refused triage call. It is the one input to this gate that does not depend on the stream. The line is one rule for every seat and every role, whatever
their reserves; *A role may hold back more of a seat than the seat does* says what a role's
reserve is for.

The same line is `(1 − r) + r × elapsed`: the reserve is held back at the start of the window and
released evenly as the window runs out, and the line reaches 100% at the reset, where anything
unspent is lost. Just after a reset it is `1 − r`. At `r` = 0 it is 100% at every moment, so the
seat is filled to the whole window and stopped only by the provider's refusal. At `r` = 1 it is
exactly the fraction of the window elapsed, which spends the window evenly across its length.

What a reserve promises an owner is this: at any moment, Igor leaves `r` × the part of the window
still to come. At 0.5 it leaves half of what remains: half the window just after a reset, a
quarter halfway through, and nothing at the reset itself, when anything unused is lost anyway.
That assumes the owner's own use is spread across the window, since the reserve is a share of the
time still to come and not a slice set aside at the start. An owner who finds Igor takes too much,
or who tends to use the seat late in the window, raises the reserve; there is no other setting.

What is compared is a reading of the whole seat, owner's use included. So the rule needs no
figure for how much the owner has used and no figure in dollars for the window: whatever the
owner does, Igor stops where the seat as a whole reaches the line, and it takes more of the
window when the owner uses less and less when the owner uses more. A seat's capacity in dollars
(*Capacity is recorded spend divided by the fraction it consumed*) is reported, and SHALL NOT be an
input to this decision.

This replaces a bound on Igor's own recorded spend at `(1 − reserve) × capacity`, with the
seat's reserve alone. That bound
needed a capacity in dollars for every window before a reserved seat could be used at all, and it
held the whole reserve back until the reset, where what nobody used was lost.

A reading whose reset cannot be resolved places nothing, so its `remaining` SHALL be taken as 1
and its line as `1 − r`, the most the line ever holds back. A refusal, at 100%, is at or past
every line, so a refused window is shut until its reset under this rule, as *A seat at 100% is
spent until its window resets* already says.

An item already running when a reading reaches the line SHALL be allowed to finish: the line
decides only whether work starts. Between readings an Igor does not see its own spend. The
reading the gate sees before an item is the last one the previous run on the seat carried, and a
run's event is timed when it arrives. So each Igor can carry the seat past its line by the spend
of the item it admits, plus whatever the previous run spent after its last event arrived — about
one run's spend where a run's last event arrives near its end. That overshoot is accepted. Every
worker run carries a fresh reading, so the next gate call sees it, and the overshoot does not
compound. It is held per Igor process and not coordinated across processes, so several Igors on
one seat, or several concurrent ranks of one Igor, can each overshoot once.

Every Igor drawing on a seat is counted in the seat's reading, so Igors sharing a seat are held to
one line without adding up each other's books.

#### Scenario: Igor stops at the reserve

- **WHEN** a seat declares a reserve of 0.3, half its week remains, and its most recent unreset
  week reading is 85%
- **THEN** the Igor starts no new work on that seat
- **AND** an item already running on it finishes

#### Scenario: The reserve is released toward the reset

- **WHEN** a seat declares a reserve of 0.3, a tenth of its week remains, and its most recent
  unreset week reading is 90%
- **THEN** work may start on it, because its line is 97%

#### Scenario: Just after a reset the whole reserve is held

- **WHEN** a seat declares a reserve of 0.3, its session has just reset, and its reading of the new
  session is 72%
- **THEN** the Igor starts no new work on that seat, because its line is 70%

#### Scenario: At reserve 0 the line is the whole window

- **WHEN** a seat declares reserve 0, the role drawing on it declares none, and its most recent
  unreset readings are at 99%
- **THEN** work may start on it
- **AND** only the provider's refusal stops it

#### Scenario: At reserve 1 the line is the elapsed fraction

- **WHEN** a seat declares a reserve of 1 and 40% of its week has elapsed
- **THEN** work may start on it while its week reading is below 40%
- **AND** not once the reading reaches 40%

#### Scenario: Both windows must pass

- **WHEN** a seat's session reading is below its line and its week reading is at or past its line
- **THEN** the Igor starts no new work on that seat

#### Scenario: Human capacity preserved

- **WHEN** an Igor shares a seat with the person who owns it
- **THEN** the reserved share of what remains of the window is left for that person, whatever
  Igor does, less the one run by which an Igor can pass its line

#### Scenario: The floor holds without observing the owner

- **WHEN** nothing reports how much of a seat its owner in particular has consumed
- **THEN** the line is still enforced, against the whole seat's reading
- **AND** when the owner has used much of the window Igor reaches the line with less spend of its
  own, and when the owner has used little Igor may take more

#### Scenario: A role holds back more than its seat

- **WHEN** a seat declares reserve 0, the role `frontend` declares a reserve of 0.3, and the seat's
  session has just reset with a reading of 72%
- **THEN** `frontend`'s Igor starts no new work on that seat, because its line is 70%
- **AND** a role declaring no reserve may still start work there, because its line is 100%

#### Scenario: A role cannot hold back less than its seat

- **WHEN** a seat declares a reserve of 0.5 and a role drawing on it declares 0.2
- **THEN** that role's line on the seat is computed with 0.5

#### Scenario: Several Igors share one bound

- **WHEN** two Igors spend from the same seat
- **THEN** each compares the same whole-seat reading, which counts both
- **AND** each may carry the seat past the line by its own run

#### Scenario: A capacity figure decides nothing

- **WHEN** a seat has a capacity figure in dollars
- **THEN** whether work may start on it is the same as it would be without one

#### Scenario: A refusal is the reading until its reset

- **WHEN** a seat's newest observation of its session is a refusal recorded from a run's envelope,
  and its reset has not passed
- **THEN** the session's reading is 100%, and no work starts on the seat
- **AND** once the reset passes, that row no longer bears on the session

#### Scenario: An unresolved reset holds the whole reserve

- **WHEN** a seat's most recent unreset reading of a window states a reset that cannot be resolved
- **THEN** that window's line is `1 − r`

### Requirement: Capacity is recorded spend divided by the fraction it consumed

A seat's capacity for a window SHALL be derived as recorded Igor spend within that window
instance divided by the fraction of the window an observation reported consumed. The numerator
SHALL be the spend recorded for that seat within the instance the observation belongs to —
bounded by the observation's reset time and the window's length — and not spend over all
recorded history. It is reported, so an operator can see what a window is worth in dollars. It
SHALL NOT be an input to whether Igor may start work on a seat (*The reserve is untouchable*).

Where a window runs on a fixed schedule, instances tile the timeline: each ends exactly where the
next begins, and no moment belongs to neither. One observed reset therefore fixes every boundary
before and after it by subtraction, which is what lets spend be assigned to an instance at all.
Where a window starts at first use, an instance is placed only from its own reset. The length and
the schedule are the ones *A window's length is measured, and so is whether it starts at first
use* gives: five hours and seven days on a fixed schedule until measurement says otherwise.

Where a seat has consumers Igor cannot see, the quotient is lower than the seat's true capacity,
because the numerator counts only Igor's share of a denominator that everybody moved. That error
is accepted: a figure that understates the window misleads nobody into spending, because no
decision to spend rests on it.

It is a property of one observation, not a ceiling on what can be known. A seat read repeatedly
is also read across intervals its owner happened to sit out, and those yield the capacity
outright. Which observations to combine, and how, wants a season of them to decide.

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
- **AND** no decision to spend rests on it

#### Scenario: No spend in the instance derives nothing

- **WHEN** an observation's window instance has no recorded Igor spend
- **THEN** no capacity figure is derived from it

### Requirement: Budget reporting states what each seat has left

Reporting SHALL show, per seat and per window, the seat's most recent unreset reading and when it
was taken, the reserve, the line now and the headroom between the reading and it, when the window
resets, and what Igors have spent. Where a role drawing on the seat declares a larger reserve of
its own, the line that role checks SHALL be shown for it too. Where a capacity figure exists it SHALL be shown with the
observation it came from and when that observation was taken, as information: it decides nothing.
A seat with no unreset reading of a window SHALL be reported as unread, distinctly from a seat at
its line and from a seat the provider refused.

A reading taken an hour ago and one taken a day ago are not the same claim, though either bounds
the window from below until it resets. An operator who cannot tell them apart cannot tell a seat
that is current from a stale one, and cannot tell either from a seat that has never been read.

#### Scenario: Headroom legible per window

- **WHEN** an operator inspects the budget
- **THEN** each seat's reading, reserve, line, headroom and reset time are shown for every window
- **AND** each reading is shown with its source and the time it was taken

#### Scenario: An unmeasured seat reads as unmeasured

- **WHEN** a seat has no observation for a window
- **THEN** reporting says so
- **AND** it does not report that seat as having no capacity left

#### Scenario: A capacity figure is information

- **WHEN** a seat has a capacity figure for a window
- **THEN** reporting shows it with the observation it came from
- **AND** it does not present it as what admits or stops the seat

### Requirement: A limit error lowers the estimate that permitted it

An observation implying a capacity lower than the seat's current estimate SHALL lower that
estimate. A limit error is such an observation by construction: it says the window was full at a
moment when the estimate said there was room, so whatever capacity was assumed was too high.

The estimate is reported, not a gate input. What a refusal does to the gate it does directly, as a
reading at 100%, which is past every line until its reset. The reported figure improves from the
same failure with nobody re-running a reading, editing a configuration, or noticing.

#### Scenario: The estimate falls after a refusal

- **WHEN** the provider refuses a run on a seat whose estimate said capacity remained
- **THEN** the seat's capacity estimate for that window is lowered to what the refusal implies

#### Scenario: Correction requires no operator

- **WHEN** an estimate has been corrected by a limit error
- **THEN** no reading is re-run and no configuration is edited to make the correction take
  effect

### Requirement: `budget_share` is a ceiling, not a reservation

A role's `budget_share` SHALL bound what that role may consume from its pool. It MUST NOT
reserve capacity for that role, and shares across roles MUST NOT be required to sum to one —
several roles may each declare the same ceiling.

A role's consumption of a seat SHALL be measured against the seat's reading: the role's share of
recorded Igor spend on the seat, times the fraction of the window the seat's latest unreset
reading reports used. It SHALL NOT be measured by dividing recorded spend by a capacity figure. No
figure in dollars is an input to any gate (*The reserve is untouchable*), and this is the same
measure a seat read live already uses. The reading counts the owner's use too, so on a shared seat
a role reaches its ceiling sooner than its own spend alone would carry it; that errs toward
holding the role back. A seat with no unreset reading of a window gives the ceiling nothing to
measure there, and is decided for the role as *A seat with no reading is drawn on only where its
line is the whole window* says.

Reservations were rejected: they would idle capacity a quiet role is not using, and adding a
role would require editing every other role to make room. A ceiling composes, inherits
monotonically like every other permission, and needs no coordination when the fleet changes.

#### Scenario: Ceilings need not sum to one

- **WHEN** three roles sharing a pool each declare a share of 0.4
- **THEN** configuration is valid
- **AND** each is capped at 0.4 of the pool rather than allotted a third of it

#### Scenario: Unused capacity is available to another role

- **WHEN** one role is idle and another is working
- **THEN** the working role may consume up to its own ceiling
- **AND** it is not limited to a fraction reserved for it

#### Scenario: A busy role cannot starve the seat's owner

- **WHEN** a role reaches its ceiling while a person's seat is in its pool
- **THEN** that seat's reserve is still untouched
- **AND** the reserve is enforced independently of any role's ceiling

#### Scenario: A share is measured against the reading

- **WHEN** a role accounts for half of Igor's recorded spend on a seat whose latest unreset week
  reading is 60%, and the role declares a `budget_share` of 0.3
- **THEN** the role is at its ceiling for the week on that seat
- **AND** no capacity figure enters the decision
