## ADDED Requirements

### Requirement: A worker run's rate-limit event is recorded as a reading of the seat that paid

Where a worker run's stream carries a `rate_limit_event`, the run's last one SHALL be recorded as a
`stream` observation of the seat the gate chose, read with its own credential, with each window's
fraction consumed and reset. The row of the window `rateLimitType` names SHALL be marked as named
and carry the event's status; every row SHALL record whether extra usage is spent. A `rejected`
event SHALL be a refusal, at 100% of the named window with its reset, only where the run ended in
error.

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

- **WHEN** the event carries `isUsingOverage`, true or false
- **THEN** every observation recorded from that event carries its value

#### Scenario: A rejection that ended the run is a refusal

- **WHEN** a run's last event has status `rejected` about the seven-day window, with its reset, and
  the run ended in error
- **THEN** the week observation is recorded at 100%, with that reset

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
- **AND** it is not recorded at all, unless it is one model's weekly window

#### Scenario: A per-model weekly window keeps its model

- **WHEN** the event reports a weekly window of one model
- **THEN** it is recorded as a week observation carrying that model

### Requirement: A stream reading is timed when it arrived, not when the run ended

An observation taken from a worker's stream SHALL carry the instant the event was received as the
instant it was taken.

#### Scenario: A stream reading carries its arrival instant

- **WHEN** a run's `rate_limit_event` arrives at 10:00 and the run ends at 10:20
- **THEN** the observations from it are recorded as taken at 10:00

#### Scenario: The run's own spend is not in the numerator

- **WHEN** a capacity is derived from a stream reading
- **THEN** the spend of the run that carried it is not counted in the numerator

### Requirement: A reading bounds its window from below until the window resets

A reading's fullness SHALL be treated as a lower bound on its window from when it was taken until
the reset it reports, which this spec calls unreset or unexpired, and SHALL NOT describe any later
instance of the window, an instance being one stretch from one reset to the next. A reading whose
reset never resolved is unreset until one window length after it was taken. Where a newer reading
of an instance is lower than an older one, the newer SHALL govern.

#### Scenario: An old reading still bounds the present

- **WHEN** a seat's newest reading of a window is hours old and its reset has not passed
- **THEN** the window is treated as at least that full
- **AND** reporting shows the figure as a lower bound with the time it was taken

#### Scenario: A reset ends what the reading says

- **WHEN** the reset a reading reported has passed
- **THEN** the reading no longer bears on that window's fullness
- **AND** it remains in the log

### Requirement: A seat spending extra usage has no headroom

A seat whose newest unexpired reading reports extra usage being spent, billed past the
subscription's cap, SHALL be treated as having no headroom in the window its `rateLimitType` names
until that window resets, whatever any capacity estimate says. Its other window SHALL NOT be shut
on that ground.

#### Scenario: Overage stops the seat

- **WHEN** a seat's newest unexpired reading reports extra usage being spent
- **THEN** that seat is passed over for the window the event's `rateLimitType` names, with that as
  the reason
- **AND** it is usable again once that window resets, without intervention

#### Scenario: Overage in one window does not shut the other

- **WHEN** a reading reports extra usage being spent, with `rateLimitType` `five_hour`
- **THEN** the session window has no headroom until its reset
- **AND** the week window is bounded as it would otherwise be

### Requirement: A refusal the stream reports is not recorded twice

Where a call's stream, a worker run's or a triage call's, reports it rejected and its terminal
envelope is also recognised as a usage limit, one observation of the refusal SHALL be recorded,
from the stream. Where only the envelope reports the refusal, or the stream's `rejected` event
names a window that is neither the session nor the week, so that no stream observation is recorded,
the refusal SHALL be recorded from the envelope.

#### Scenario: One refusal, one row

- **WHEN** a run's stream carries a `rejected` event and `usageLimit` also recognises its envelope
- **THEN** exactly one observation of the refusal is recorded, from the stream

#### Scenario: A refusal of a window the stream does not record is recorded from the envelope

- **WHEN** a run's stream carries a `rejected` event naming a window that is neither the session
  nor the week, and `usageLimit` recognises its envelope
- **THEN** the refusal is recorded from the envelope, so the seat is held as for any refusal

#### Scenario: No event, the envelope still records

- **WHEN** a run is refused and its stream carried no `rate_limit_event`
- **THEN** the refusal is recorded from the envelope as before

### Requirement: A missing reading closes a reserved seat and changes nothing else

The absence of a `rate_limit_event`, or an event that cannot be read, SHALL record no observation
from the stream, SHALL leave the run's recording as it would otherwise have been, and SHALL NOT
fail the run. Its one effect on a budget decision is the one *A seat with no reading is drawn on
only where its line is the whole window* states.

#### Scenario: No event, no observation

- **WHEN** a worker run's stream carries no `rate_limit_event`
- **THEN** no observation is recorded from the stream
- **AND** the run is recorded as it would have been otherwise

#### Scenario: A malformed event is not a failed run

- **WHEN** a `rate_limit_event` is missing fields or carries values of the wrong type
- **THEN** no observation is recorded for what cannot be read
- **AND** the run's outcome is unaffected

### Requirement: A seat nothing has read is probed on the Igor server with its own token

In a deployment that declares seats, the server running the Igors, and no other machine, SHALL
probe each seat that names a token and has no unexpired `usage` or `stream` reading of a window.
Where a reading expired at a reset with a post-reset probe due, that probe serves, and no other is
made; where none is due, or that probe is excluded, the seat SHALL be probed as soon as no
exclusion applies, not at the next reset.

#### Scenario: A reserved seat with no reading is probed

- **WHEN** a seat declares a reserve, and has no reading of any window
- **THEN** the server running the Igors makes one seat probe with that seat's token
- **AND** the probe's `rate_limit_event`, if there is one, is recorded as a `stream` reading of
  that seat

#### Scenario: An idle seat is read again once its reading expires

- **WHEN** a seat's newest reading of its session window has passed its reset and no run has been
  made on the seat since
- **THEN** the seat is probed

#### Scenario: A seat with an unexpired reading of every window is not probed

- **WHEN** a seat has an unexpired reading of both its windows
- **THEN** no probe is made on it to read it, though a crossing or a check of its credential may
  still probe it

#### Scenario: An excluded post-reset probe does not leave the seat unread

- **WHEN** a seat's session reading expires at a known reset, its post-reset probe is excluded by
  the hourly limit, and no run is made on the seat
- **THEN** the seat is probed once the hourly limit allows, without waiting for another reset

#### Scenario: An expiry at a known reset waits for the post-reset probe

- **WHEN** a seat's session reading expires at its reset and no run is made on the seat
- **THEN** the seat is probed ten minutes after that reset, once, and that probe also measures the
  window

#### Scenario: A probe never runs on a person's machine

- **WHEN** a seat is probed
- **THEN** the call is made by the server running the Igors, with the seat's token as the server
  holds it
- **AND** nothing is installed anywhere else for it

### Requirement: A seat probe is one minimal call on the seat's own token alone

A seat probe SHALL be one minimal `claude -p` call with the seat's own token, run from the
directories *A seat probe runs where only the Igor can write* places, its environment set
explicitly, as task-execution requires of a worker's, holding no other credential. Its
`rate_limit_event` SHALL be recorded as a `stream` reading of the seat, exactly as a worker run's
is.

#### Scenario: A probe loads no project's settings

- **WHEN** a seat is probed
- **THEN** the call runs from an empty directory, with `HOME` set to a second empty directory
- **AND** no directory above the first holds a `.claude` directory or a `CLAUDE.md`, as *A seat
  probe runs where only the Igor can write* checks

#### Scenario: A probe is minimal

- **WHEN** a seat is probed
- **THEN** the call uses the cheapest model, a trivial prompt and no tools

#### Scenario: A probe reads the stream

- **WHEN** a seat is probed
- **THEN** the call runs with `--output-format stream-json --verbose`, on the seat's token alone

### Requirement: Every seat probe is recorded as spend on the seat it read

Every seat probe SHALL be recorded on a spend row against the seat it read, marked as a seat probe,
with its cost (0 if none was reported) and whether a `rate_limit_event` arrived. Spend attribution,
capacity and reporting SHALL count that row, and any Igor, after a restart too, SHALL compute the
hourly limit and the five-hour back-off from these rows. The spend row SHALL NOT count toward
opening or clearing any condition on the seat; a credential check is a separate row, without the
cost.

#### Scenario: A probe's cost is recorded

- **WHEN** a seat probe completes
- **THEN** its reported cost is recorded against the seat it read, as a seat probe
- **AND** spend attribution, capacity and reporting count it

### Requirement: A seat is probed at most once an hour, and not for five hours after a probe got no event

A seat SHALL NOT be probed more than once an hour, counted from the most recent probe of it any
Igor recorded, nor while a probe this process started on it is still running; two Igors starting at
once may both probe. A probe that receives no readable `rate_limit_event` SHALL record no
observation, and the seat SHALL NOT be probed again for five hours, unless it was answered with an
authentication failure. A failed probe SHALL NOT be retried at once, only when those limits allow.

#### Scenario: No event, no observation, no loop

- **WHEN** a seat probe's stream carries no `rate_limit_event`
- **THEN** no observation is recorded
- **AND** that seat is not probed again for five hours

#### Scenario: Probes are rate-limited

- **WHEN** a seat was probed less than an hour ago
- **THEN** it is not probed again, whatever its readings

#### Scenario: A probe still running is not doubled

- **WHEN** a probe this process started on a seat has not yet returned
- **THEN** this process starts no other probe of that seat

#### Scenario: Another Igor's probe counts toward the hour

- **WHEN** another Igor recorded a probe of a seat less than an hour ago
- **THEN** this Igor does not probe it

#### Scenario: A failed probe is not retried at once

- **WHEN** a seat probe ends in an error exit with no `rate_limit_event`
- **THEN** no other probe of that seat is made at once
- **AND** the next waits for the hourly limit and the five-hour back-off

### Requirement: A seat that could not be used is not probed

No seat probe SHALL be made on a seat while an unexpired refusal, an observation at 100% of a
window, holds it, until its stated reset; while its unexpired reading reports extra usage, until
the window that reading's `rateLimitType` names resets; or while its most recent unreset reading of
any window is at or past that window's line computed with the seat's own reserve, since a probe is
made on no role's behalf. The crossing probe is the one exception to the last.

#### Scenario: A refused seat is not probed

- **WHEN** a seat has an unexpired observation at 100% of a window
- **THEN** it is not probed until that observation's reset has passed

#### Scenario: A seat spending extra usage is not probed

- **WHEN** a seat's unexpired reading reports extra usage being spent
- **THEN** it is not probed until the window the reading's `rateLimitType` names resets

#### Scenario: A seat past its line is not probed

- **WHEN** a seat's session reading has expired, and its most recent unreset week reading is at or
  past the week's line
- **THEN** it is not probed while that remains so

### Requirement: A seat is probed at its crossing before it is drawn on again

Where a seat's most recent unreset reading of a window was at or past the line the gate checks for
the role, and that line has since risen past it, the gate SHALL NOT start work on that reading
alone: it SHALL probe the seat first and decide on the reading the probe records. Once a probe made
after the crossing records no observation, the gate SHALL decide on the reading it has. Until one
is made the seat stays held, recorded as holding back at the line.

#### Scenario: A crossing is checked before work starts

- **WHEN** a seat's week reading was at its line, and the line has since risen past it
- **THEN** a seat probe is made before any work starts on the seat
- **AND** the gate decides on the probe's reading

#### Scenario: A probe at the crossing that finds the seat fuller holds it

- **WHEN** the probe made at a crossing returns a reading at or past the line
- **THEN** no work starts on the seat

#### Scenario: A probe at the crossing that returns nothing does not shut the seat out

- **WHEN** the probe made at a crossing records no observation
- **THEN** the gate decides on the reading it already had

#### Scenario: A seat probed just before its crossing waits for the hour

- **WHEN** a seat was probed less than an hour before its line crossed its reading
- **THEN** it stays held, as holding back at the line, until the hourly limit allows the next probe

### Requirement: A seat probe checks the seat's credential too

A probe answered with an authentication failure (HTTP 401) SHALL be recorded as an execution-log
row carrying the key `seat:<id>:credential` and a full hash of the credential used, which opens the
seat's credential condition; one that succeeds SHALL be recorded as a check of that key that found
the condition not holding, which clears it. A seat whose condition is open SHALL be probed as that
check at most hourly, even with an unexpired reading of every window, unless another exclusion
applies.

#### Scenario: A probe refused its credential opens the condition

- **WHEN** a seat probe is answered with an authentication failure
- **THEN** the seat's credential condition `seat:<id>:credential` is opened
- **AND** no observation is recorded

#### Scenario: A probe that succeeds clears the condition

- **WHEN** a seat's credential condition is open and a probe of it succeeds
- **THEN** the condition is cleared
- **AND** any reading the probe carried is recorded as usual

#### Scenario: A stopped credential is checked hourly

- **WHEN** a seat's credential condition is open and it was probed less than an hour ago
- **THEN** it is not probed again
- **AND** once an hour has passed it is probed again, with no five-hour back-off

### Requirement: A seat probe runs where only the Igor can write

For each seat probe the Igor SHALL create two new, empty directories of mode `0700`, the probe's
working directory and its `HOME`, in `<state dir>/probes/<role>-<rank>`, with `<state dir>` as
`graceful-handoff` defines it and `<rank>` as `concurrent-instances` numbers it. The Igor SHALL
remove both once the probe exits, and `igor serve` SHALL remove at start any left in its own probe
directory, and none in another's.

#### Scenario: A probe runs under the Igor's state directory

- **WHEN** `igor serve` probes a seat
- **THEN** the probe's working directory and its `HOME` are new directories of mode `0700` in
  `<state dir>/probes/<role>-<rank>`, which under the shipped unit is in `/var/lib/igor/probes`
- **AND** neither is under the system's temporary directory

#### Scenario: A probe's directories do not outlive it

- **WHEN** a seat probe exits, or `igor serve` starts after a crash left a probe's directories
  behind
- **THEN** no directory of that probe remains in the probe directory of the process that made
  it

#### Scenario: A start leaves another process's probe alone

- **WHEN** `igor serve` for rank 1 of a role starts while rank 2 of the same role is making a
  seat probe
- **THEN** rank 2's probe directories remain until rank 2's probe exits

#### Scenario: The shipped unit and image provide the state directory

- **WHEN** Igor is deployed with the shipped systemd unit or container image
- **THEN** the unit sets `StateDirectory=igor`, so the state directory is `/var/lib/igor`
- **AND** the image creates `/var/lib/igor` for the user Igor runs as

### Requirement: Every directory above a seat probe is checked before it is spawned

Immediately before each seat probe the Igor SHALL check every directory from the probe's working
directory up to the root: owned by root or the Igor's user, with neither the group nor the other
write bit set, and holding no `.claude` directory or `CLAUDE.md`. Where one fails, or the two
directories cannot be created, the probe SHALL NOT be spawned, and SHALL be recorded as one that
errored: a spend row with no cost and no event, and no observation or check row.

#### Scenario: A directory others could write stops the probe

- **WHEN** a directory above the probe's working directory is owned by a user other than root
  and the Igor's own, or has its group or other write bit set
- **THEN** no probe is spawned, and no observation or check row is recorded
- **AND** a spend row records the probe with no cost and no event
- **AND** the Igor's log names that directory and the condition it failed
- **AND** the next attempt waits for the hourly limit and the five-hour back-off

#### Scenario: A refused crossing probe does not shut the seat out

- **WHEN** the probe made at a crossing is refused by the directory check
- **THEN** the gate decides on the reading it already had

### Requirement: A role has a seat it can spend when the gate would choose one now

A role SHALL have *a seat it can spend* exactly when the budget gate, deciding for that role now,
would choose a seat: some seat serving the role is admitted by every rule the gate applies, so it
is below the role's line in every window, and not refused, not spending extra usage, and not passed
over for want of a reading. A role whose every seat is at or past its line, or passed over for any
other reason, has none. Other changes SHALL cite this rather than restate the gate.

#### Scenario: Seats at their lines leave none to spend

- **WHEN** every seat serving a role is at or past that role's line in some window
- **THEN** the role has no seat it can spend

#### Scenario: One admitted seat is enough

- **WHEN** one seat serving a role is below the role's line in both windows, and nothing else
  passes it over
- **THEN** the role has a seat it can spend

### Requirement: Observations arrive irregularly, and a gap is waiting, not a fault

No behaviour SHALL require that a reading of a seat was taken at a particular time or interval. A
gap between readings SHALL NOT be treated as an error, nor filled by interpolating or repeating a
reading, including a gap past a reset that leaves a reserved seat waiting for its next reading.
Every observation carries the instant it was taken, so a consumer judges at the point of use
whether a figure is current enough.

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
after a reset, SHALL be measured, never configured. Until measured, five hours for the session and
seven days for the week stand, on a fixed schedule. Wherever a length or schedule is reported it
SHALL say whether it is built-in or measured, and how. On a fixed schedule one reset fixes every
boundary; at first use an instance SHALL be placed only from its own reset, one length before it.

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

### Requirement: A seat probe just after a reset measures its window

Per seat and window type, the Igor server SHALL make a seat probe ten minutes after a reset it
knows of: until that type's length and schedule are measured, then about weekly. The new reset less
the old is the length on a fixed schedule, and the new reset less the probe's time is the length at
first use; whichever equals the built-in or last measured length names the schedule and the length.
A length so measured SHALL supersede the built-in length, longer or shorter.

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

#### Scenario: One probe against no expected length settles nothing

- **WHEN** neither difference a post-reset probe gives equals the built-in length or the last
  measured one
- **THEN** neither the length nor the schedule in use changes
- **AND** a post-reset probe after a later reset, at a different delay, settles it

#### Scenario: A second probe at another delay settles the schedule

- **WHEN** a post-reset probe after a later reset, at a different delay, reads its new reset
- **THEN** a new reset that does not move with the probe's delay names a fixed schedule, and one
  that moves by the same amount names instances starting at first use

#### Scenario: A post-reset probe keeps the probe's limits

- **WHEN** a seat's session has just reset, and the seat was probed less than an hour ago or its
  unreset week reading is at or past the week's line
- **THEN** no post-reset probe is made on it after that reset
- **AND** the measurement waits for the next reset Igor knows of

#### Scenario: The measurement is repeated

- **WHEN** a window's length and schedule were measured after a reset about a week ago
- **THEN** a post-reset probe is made after that window's next known reset

#### Scenario: A longer length measured after a reset is followed

- **WHEN** post-reset probes after two resets, at different delays, measure a session length
  longer than five hours
- **THEN** that length is used, and reported as measured after a reset

### Requirement: A shorter window length is also taken from ordinary readings

The smallest positive difference between two differing reset instants among a window's observations
is a passive estimate of its length. It SHALL replace the length in use only where shorter; a
longer one SHALL be reported and not used.

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

### Requirement: Holding back at the line is distinguishable from having nothing to do

An Igor that takes no work because every seat it may draw on is at or past its line SHALL record
that as the reason, distinct from a refused seat, a seat passed over for want of a reading, and an
empty queue, naming each seat with its own reason where they differ. Budget reporting SHALL say
such a seat is holding back, and name when its line reaches its newest reading, `resetsAt − (1 −
reading) ÷ r × window length`, when it would admit work again if nothing more were used.

#### Scenario: The record says which

- **WHEN** a cycle takes no work because the role's seats are at their lines
- **THEN** the decision record names holding back at the line rather than exhaustion or an empty
  queue

#### Scenario: Seats passed over for different reasons are each named

- **WHEN** a cycle takes no work because one of the role's seats is at its line and another was
  refused
- **THEN** the decision record names the first as holding back and the second as refused

#### Scenario: Reporting says when the line passes the reading

- **WHEN** a seat declares a reserve of 0.3, its week reading is 94%, and 30% of the week remains,
  so its line is 91%
- **THEN** reporting says the seat is holding back
- **AND** it names the instant at which 20% of the week remains, when the line reaches 94%

### Requirement: A handoff for a window the line shut states its crossing, marked approximate

Where a window is shut because its reading is at or above the seat's reserve line, and the reading
is below 100%, the hour a handoff states for that window SHALL be the instant the line rises past
the reading, not the window's reset, and it SHALL be marked approximate.

#### Scenario: A reserve line's crossing is stated, and hedged

- **WHEN** a window is shut because its reading, below 100%, is at or above the seat's reserve line
- **THEN** the hour stated for it is the instant the line rises past that reading, not its reset
- **AND** it is marked approximate

#### Scenario: A refused window still returns at its reset

- **WHEN** a window is shut because its reading is 100%
- **THEN** the hour stated for it is its reset

### Requirement: A seat's fullness is read from the seat, not supplied by a person

How full a seat is SHALL be established from the seat itself: by the live `/usage` read where its
credential yields windows to it, which a `setup-token` one does not, and otherwise from its
recorded observations. The system MUST NOT require a person to submit a usage figure, and neither a
usage figure nor a capacity SHALL be configured. A seat whose named token is not available SHALL be
reported unreadable, and no other credential SHALL be used in its place.

#### Scenario: Capacity established without a person

- **WHEN** an Igor needs to know whether it may spend
- **THEN** the seat's usage comes from the live `/usage` read where its credential yields windows
  to it
- **AND** otherwise from recorded observations of that seat, including readings taken with its own
  credential in a run's or a probe's stream
- **AND** no human supplies how full the window is, in either case

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
- **AND** where it has no unreset observation, it is judged as *A seat with no reading is drawn on
  only where its line is the whole window* says

#### Scenario: A configured capacity is refused

- **WHEN** a seat declares `capacity_estimate`
- **THEN** configuration is refused, naming the key, as any key nobody reads is

#### Scenario: One unreadable seat does not blind the rest

- **WHEN** one seat of several cannot be read
- **THEN** the others are still reported and still usable

### Requirement: Recorded spend attributes a seat between its roles, and decides no headroom

Recorded cost, an equivalent value at list prices, SHALL be used to apportion a seat between the
roles drawing on it, and to derive the seat's capacity in dollars for reporting. It SHALL NOT
decide whether the seat has anything left: that is decided by the seat's reading against its line
(*The reserve is untouchable*).

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

A role MAY declare a `reserve`, a fraction from 0 to 1, both included, applying to every seat it
draws on and not set per seat. The line its Igor checks on a seat SHALL use the larger of the
seat's reserve and the role's (*The reserve is untouchable*), so a role can hold back more than a
seat does and never less; on a seat declaring 0, the role's alone sets it. A role reserve is valid
whatever seats the role draws on, a seat no person uses included.

#### Scenario: A higher-reserve role yields to a lower one

- **WHEN** `frontend` declares a reserve of 0.3 and `generalist` declares none, both draw on one
  seat declaring reserve 0, half its week remains, and its week reading is 88%
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

#### Scenario: A role reserve with a dedicated seat is valid

- **WHEN** a role naming a seat that no person uses, at reserve 0, declares a reserve of 0.4
- **THEN** configuration is valid

### Requirement: The line is checked against the newest unreset reading, a refusal included

The reading the line is checked against SHALL be the newest unreset reading of the window, all
models, whatever its source: a live `/usage` read at the gate, a `stream` reading, a `usage` row,
or a refusal. A refusal counts as an observation at 100% of the window it names until its reset,
from a refused worker run's envelope or a refused triage call, and needs no `rate_limit_event`. A
reading whose reset cannot be resolved SHALL take `remaining` as 1, so its line is `1 − r`.

#### Scenario: A refusal is the reading until its reset

- **WHEN** a seat's newest observation of its session is a refusal recorded from a run's envelope,
  and its reset has not passed
- **THEN** the session's reading is 100%, and no work starts on the seat
- **AND** once the reset passes, that row no longer bears on the session

#### Scenario: An unresolved reset holds the whole reserve

- **WHEN** a seat's most recent unreset reading of a window states a reset that cannot be resolved
- **THEN** that window's line is `1 − r`

## REMOVED Requirements

### Requirement: Usage is read from the seat, not supplied by a person

**Reason**: It made a declared `capacity_estimate` what starts a reserved seat, and said the
absence of a reading "must bound the seat" through recorded spend. Under the moving line a seat
is admitted on its reading and no figure in dollars admits it. So its scenario *A declared
capacity gets a reserved seat started* is false, and so is *An observation supersedes what was
declared*, since nothing is declared any more. openspec will not archive a `MODIFIED` block that
drops a scenario.

**Migration**: Replaced by *A seat's fullness is read from the seat, not supplied by a person*,
added by this change. It keeps every other rule and scenario, and removes `capacity_estimate`,
which is no longer a seat key.

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

Organization configuration SHALL declare seats, each with an identifier, an `owner`, the person who
can read that seat's usage, and a `reserve`, a fraction from 0 to 1, both included, of the
remaining window held back from Igors, as *The reserve is untouchable* defines it; a seat nobody
works on has reserve 0 by default. A role SHALL reference the seat it spends from, and MAY hold
back more of it than the seat does, never less (*A role may hold back more of a seat than the seat
does*).

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

- **WHEN** a seat that nobody works on declares a reserve of 0.5
- **THEN** configuration is valid
- **AND** the seat is held to its line as any other seat is

#### Scenario: A reserve of 1 is accepted

- **WHEN** a seat declares a reserve of 1
- **THEN** configuration is valid

### Requirement: An observation records how full a window was, and when it resets

A capacity observation SHALL record the seat, the window, the fraction consumed, the instant it was
taken, the instant the window resets, and its source: a usage reading (`usage`), a provider limit
error (`limit`), or a run's `rate_limit_event` (`stream`). New observations SHALL be `limit` or
`stream` only; rows already recorded as `usage` SHALL still be read like any other. The reset SHALL
be recorded as an instant comparable with the present.

#### Scenario: A recorded usage reading is still read

- **WHEN** the log holds an observation with source `usage`
- **THEN** it is read, and bears on capacity, expiry and reporting as any observation does

#### Scenario: Nothing new is recorded as a usage reading

- **WHEN** any observation is recorded
- **THEN** its source is `limit` or `stream`

#### Scenario: One record shape for every source

- **WHEN** a reading of seat `adam`'s week is recorded from a run's stream
- **THEN** it is a row such as
  `{"at":…,"seat":"adam","window":"week","percentUsed":86,"resetsAt":…,"source":"stream"}`, the
  shape a `limit` or `usage` row also has

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

A seat SHALL be drawn on only where it is known to be below its line in every window (*The reserve
is untouchable*). Where it has no unreset reading of a window and the reserve its line uses is not
0, it SHALL be passed over for that role, saying so; where that reserve is 0 it MAY be drawn on,
stopped by the provider's refusal. No capacity figure SHALL admit a seat or keep one out. Apart
from the probe and the live `/usage` read, no call is made on a seat passed over this way.

#### Scenario: A reserved seat is not spent from on a guess

- **WHEN** a seat declares a reserve of 0.5 and has no unreset reading of its week
- **THEN** it is passed over
- **AND** the reason given is that nothing has read it
- **AND** it is left to the seat probe

#### Scenario: A role's reserve needs a reading even on a reserve-0 seat

- **WHEN** a seat declares reserve 0, a role drawing on it declares 0.3, and the seat has no unreset
  reading of a window
- **THEN** that role's Igor does not draw on the seat until something reads it
- **AND** a role declaring no reserve still may

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

### Requirement: The reserve is untouchable

An Igor SHALL start work on a seat only while, in both windows, the seat's reading is below its
line:

    line      = 1 − r × remaining
    r         = max(the seat's reserve, the role's reserve as `role-config` resolves it), none = 0
    remaining = (resetsAt − now) ÷ window length, clamped to [0, 1]

with `resetsAt` that reading's reset and the length that *A window's length is measured, and so
is whether it starts at first use* gives.

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
  Igor does, minus an overshoot for each Igor process drawing on the seat: the item it admits and
  what the previous run spent after its last event arrived

#### Scenario: The floor holds without observing the owner

- **WHEN** nothing reports how much of a seat its owner in particular has consumed
- **THEN** the line is still enforced, against the whole seat's reading
- **AND** when the owner has used much of the window Igor reaches the line with less spend of its
  own, and when the owner has used little Igor may take more

#### Scenario: Several Igors share one bound

- **WHEN** two Igors spend from the same seat
- **THEN** each compares the same whole-seat reading, which counts both
- **AND** each may carry the seat past the line by its own overshoot

#### Scenario: A capacity figure decides nothing

- **WHEN** a seat has a capacity figure in dollars
- **THEN** whether work may start on it is the same as it would be without one

### Requirement: Capacity is recorded spend divided by the fraction it consumed

A seat's capacity for a window SHALL be derived as Igor's spend recorded for that seat within the
window instance an observation belongs to, bounded by its reset and the window's length, divided by
the fraction of the window it reported consumed, never from spend over all recorded history. An
observation with no recorded spend in its instance SHALL yield none. The capacity is reported, and
SHALL NOT be an input to whether Igor may start work on a seat.

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

Reporting SHALL show, per seat and window, the newest unreset reading and when it was taken, the
reserve, the line now and the headroom to it, the reset, and what Igors have spent, and beside them
the line of any role drawing on the seat with a larger reserve of its own. A capacity figure SHALL
be shown with its observation and that observation's time, as information. A window with no unreset
reading SHALL be reported as unread, distinct from one at its line or refused.

#### Scenario: Headroom legible per window

- **WHEN** an operator inspects the budget
- **THEN** each seat's reading, reserve, line, headroom and reset time are shown for every window
- **AND** each reading is shown with its source and the time it was taken

#### Scenario: A role's own line is shown

- **WHEN** a seat declares reserve 0 and a role drawing on it declares 0.3
- **THEN** reporting shows the seat's line and, beside it, the line that role checks

#### Scenario: An unmeasured seat reads as unmeasured

- **WHEN** a seat has no observation for a window
- **THEN** reporting says so
- **AND** it does not report that seat as having no capacity left

#### Scenario: A seat whose readings have all reset reads as unread

- **WHEN** every reading of a seat's window has passed its reset, and none was a refusal
- **THEN** reporting says the window is unread
- **AND** it does not report the seat as at its line or as refused

#### Scenario: A capacity figure is information

- **WHEN** a seat has a capacity figure for a window
- **THEN** reporting shows it with the observation it came from
- **AND** it does not present it as what admits or stops the seat

### Requirement: A limit error lowers the estimate that permitted it

An observation implying a capacity lower than the seat's current estimate SHALL lower that
estimate. A limit error always does: it says the window was full when the estimate said there was
room. The estimate is reported, not a gate input; a refusal acts on the gate directly, as a reading
at 100%.

#### Scenario: The estimate falls after a refusal

- **WHEN** the provider refuses a run on a seat whose estimate said capacity remained
- **THEN** the seat's capacity estimate for that window is lowered to what the refusal implies

#### Scenario: Correction requires no operator

- **WHEN** an estimate has been corrected by a limit error
- **THEN** no reading is re-run and no configuration is edited to make the correction take
  effect

### Requirement: `budget_share` is a ceiling, not a reservation

A role's `budget_share` SHALL bound what it may consume from its pool, the seats it may draw on. It
MUST NOT reserve capacity, and shares MUST NOT be required to sum to one. Its consumption of a seat
SHALL be its share of Igor's recorded spend on the seat times the fraction of the window the seat's
latest unreset reading reports used, not spend over a capacity figure. Without an unreset reading
of a window, *A seat with no reading is drawn on only where its line is the whole window* decides.

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

### Requirement: An hour is marked approximate where a stated reset does not fix it

An hour a handoff states SHALL be marked approximate unless a reset the provider stated fixes it.
An hour the provider stated, the later of two such hours, and a boundary placed from one by whole
lengths on a fixed schedule are fixed. A cadence ceiling and a reserve line's crossing are not, nor
is the hour for a seat shut in both windows where either window named no return or is shut at a
crossing. A marked hour SHALL read "back around", an unmarked one "back at".

#### Scenario: A compared pair of stated hours is exact

- **WHEN** both of a seat's blocked windows name a provider-stated return and the later is taken
- **THEN** the hour stated is not marked approximate

#### Scenario: An unstated return still hedges the hour

- **WHEN** a seat is blocked in both windows and one of them names no return
- **THEN** the hour stated is marked approximate

#### Scenario: A cadence ceiling is still approximate

- **WHEN** the hour stated is a cadence ceiling: the latest a window can return judged from its
  length alone, standing in for a reset the provider never named
- **THEN** it is marked approximate

#### Scenario: A tiled boundary is still exact

- **WHEN** the hour stated is the end of a window instance, placed by whole window lengths from a
  reset the provider stated, on a window that runs on a fixed schedule
- **THEN** it is not marked approximate

