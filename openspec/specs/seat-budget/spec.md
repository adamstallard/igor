# seat-budget Specification

## Purpose
Let Igors spend from paid model subscriptions, called seats, that people also use, while leaving
each seat's owner a reserve. Each seat is named in configuration with that owner and reserve.
This spec covers which seats a role may spend from and how much; how a seat's capacity is learned
from its usage reports and limit errors; how each spend is recorded against a role and a seat;
when a used-up seat's window resets so it can be spent again; and what budget reporting shows for
each seat.
## Requirements
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

### Requirement: A pool is an ordered list of seats, and order is the allocation mechanism

Organization configuration MAY declare pools, each an **ordered** list of seat identifiers. A role
referencing a pool SHALL spend from the first seat in that list with headroom. A role MAY reference
a single seat instead. In the expected setup, unchecked, a dedicated seat declares no reserve, and a
person's seat declares one and is listed after those, so it is drawn on last. A seat declaring a
reserve is drawn on only once it has a capacity figure, observed or declared (`capacity_estimate`).

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
- **THEN** the pool is treated as having no headroom
- **AND** the reserved seat is not spent from against a guessed capacity

#### Scenario: Exhausting every seat in a pool is a handoff

- **WHEN** no seat in a role's pool has headroom
- **THEN** the Igor hands off rather than stopping silently

#### Scenario: Pool referencing an undeclared seat rejected

- **WHEN** a pool lists a seat not declared in organization configuration
- **THEN** validation fails

### Requirement: `budget_share` is a ceiling, not a reservation

A role's `budget_share` SHALL bound what that role may consume from its pool. It MUST NOT
reserve capacity for that role, and shares across roles MUST NOT be required to sum to one —
several roles may each declare the same ceiling.

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

### Requirement: Every invocation records which role spent from which seat

Because a seat is chosen at run time, configuration alone cannot say which seat paid for a
given piece of work. Each invocation SHALL record the role, the seat, the reported cost, and
the time, so the question is answerable from the record.

#### Scenario: Attribution recoverable after the fact

- **WHEN** an operator asks which Igor consumed a person's spare capacity
- **THEN** the answer is determinable from recorded invocations
- **AND** it does not depend on inferring anything from configuration

### Requirement: The reserve is untouchable

An Igor SHALL treat the seat's reserve as unavailable, enforced as a cap on what Igors spend, not
as a threshold on a reading of how full the seat is: recorded spend against the seat, summed across
every Igor and role drawing on it within the window, SHALL NOT exceed `(1 − reserve) × capacity`.
Every Igor on the seat records its executions to the same state branch, so the sum can be read.
Work MUST stop at that bound rather than at exhaustion, so that a person sharing the seat retains
capacity.

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

### Requirement: Usage is read from the seat, not supplied by a person

A seat's usage, and so what it has left, SHALL be established from the seat itself: read through its
credential where that yields a reading, otherwise derived from its recorded observations and spend.
The system MUST NOT require a person to submit a usage figure, nor SHALL a usage figure ever be
configured.

#### Scenario: Capacity established without a person

- **WHEN** an Igor needs to know whether it may spend
- **THEN** the seat's usage is read directly where its credential yields a reading
- **AND** otherwise capacity is derived from recorded observations of that seat and recorded
  spend against it
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
- **THEN** it is bounded by observation and record rather than passed over on that ground alone
- **AND** a seat with neither a reading nor an observation is passed over, with the reason

#### Scenario: One unreadable seat does not blind the rest

- **WHEN** one seat of several cannot be read
- **THEN** the others are still reported and still usable

### Requirement: A declared capacity is a starting figure for each window it names

A seat MAY declare a `capacity_estimate` in configuration, a starting figure **per window**, for one
window or both; a window it leaves undeclared has no capacity figure until an observation of it
arrives. Any observation of that seat and window SHALL supersede the figure rather than be averaged
with it; until then the figure is reported as declared.

#### Scenario: A declared capacity gets a reserved seat started

- **WHEN** a seat declares both a reserve and a capacity, and has no observation
- **THEN** the declared capacity bounds it and it may be spent from
- **AND** the figure is reported as declared rather than observed

#### Scenario: An observation supersedes what was declared

- **WHEN** a seat with a declared capacity is observed
- **THEN** the observed capacity is used and the declared one is not combined with it
- **AND** later observations supersede earlier ones in the same way

### Requirement: Limits the provider reports but the loop does not enforce are still shown

Where the provider reports a limit the loop does not act on — a per-model weekly limit
alongside the overall one — that figure SHALL appear in budget reporting.

A fleet concentrated on one model can exhaust a limit the headline figures never show, and
omitting it would make that failure unexplainable.

#### Scenario: Per-model limit surfaced

- **WHEN** the provider reports a limit scoped to one model
- **THEN** budget reporting includes it

### Requirement: Recorded spend attributes a seat between its roles

Recorded cost SHALL be used both to apportion a seat between the roles drawing on it and, taken
against an observed capacity, to decide whether that seat has anything left. What fraction of a
seat a role is responsible for comes from the record; whether capacity remains comes from the
record measured against an observation of how full the window was. Cost is an equivalent value
at list prices, not an amount billed.

#### Scenario: A role's share derived from its spend

- **WHEN** two roles have drawn on one seat
- **THEN** each role's share of the consumed limit follows its share of recorded cost

#### Scenario: No recorded spend attributes nothing

- **WHEN** a seat has no recorded spend
- **THEN** no role is held to have consumed any of it

#### Scenario: The record decides exhaustion where no reading can

- **WHEN** a seat's recorded spend reaches its bound and no reading is available
- **THEN** the seat is treated as having no headroom
- **AND** the decision does not wait on a reading that cannot be taken

### Requirement: Budget reporting states what each seat has left

Reporting SHALL show, per seat and per window, what Igors have spent, the reserve, the
remaining headroom, when the window resets, and where the capacity figure came from — which
observation it was derived from and when that observation was taken. A seat with no observed
capacity SHALL be reported as having no capacity figure, distinctly from a seat reported as
having no headroom left.

#### Scenario: Headroom legible per window

- **WHEN** an operator inspects the budget
- **THEN** each seat's Igor spend, reserve, headroom and reset time are shown for every window
- **AND** each headroom figure is shown with the observation it derives from and that
  observation's time

#### Scenario: An unmeasured seat reads as unmeasured

- **WHEN** a seat has no observation for a window
- **THEN** reporting says so
- **AND** it does not report that seat as having no capacity left

### Requirement: A seat names its token through exactly one mechanism

A seat SHALL be able to name where its token is held by exactly one of three mechanisms: an
environment variable, a file path, or a command whose stdout is the token. Configuration
naming more than one on a single seat SHALL be rejected. A seat naming none of the three is
unaffected by this requirement: it reads through whatever login is ambient.

#### Scenario: A seat reads its token from a file

- **WHEN** a seat names a file holding its token
- **THEN** the token is read from that file's contents at the moment it is needed

#### Scenario: A seat reads its token from a command

- **WHEN** a seat names a command to run for its token
- **THEN** the command's stdout, taken at the moment the token is needed, is the token

#### Scenario: Naming more than one mechanism is rejected

- **WHEN** a seat's configuration names more than one of an environment variable, a file, and a
  command for its token
- **THEN** validation fails

#### Scenario: A file or command that cannot produce a token is refused, not substituted

- **WHEN** a seat names a file that cannot be read or is empty, or a command that fails, prints
  nothing, or never returns
- **THEN** the seat is reported unreadable
- **AND** no other credential is used in its place

#### Scenario: A command that never answers does not hang the reading

- **WHEN** a seat's command runs past a bounded timeout without exiting
- **THEN** it is killed and treated as a failure to produce a token
- **AND** reading the seat's usage, or spawning a worker, does not wait on it indefinitely

### Requirement: A budget refuses a key nobody reads, and a list that is not a list

The budget mapping, each seat and each pool SHALL refuse a key the parser does not read, naming
the offending key and the accepted ones. `seats` and `pools` SHALL be lists where they are
declared at all; anything else SHALL be refused rather than read as empty. Omitting them
entirely SHALL remain the way to run with budget unenforced.

#### Scenario: A misspelt seats key is not an empty budget

- **WHEN** a budget declares `seast:` in place of `seats:`
- **THEN** it is refused, naming the key and the accepted ones
- **AND** the run does not proceed with budget unenforced

#### Scenario: A seats list that is not a list is refused

- **WHEN** `seats` or `pools` is declared as anything other than a list
- **THEN** it is refused rather than read as an empty list

#### Scenario: No budget declared still means unenforced

- **WHEN** a config declares no budget, or a budget with no seats and no pools
- **THEN** it loads and budget is not enforced, as before

#### Scenario: A misspelt id reads as the typo, not as an absence

- **WHEN** a seat or a pool misspells `id`
- **THEN** the refusal names the misspelt key, rather than reporting the id missing over a line
  that has one

#### Scenario: A pool key nobody reads is refused

- **WHEN** a pool names a key other than `id` or `seats`
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: One wording for every level

- **WHEN** any of these refusals is raised
- **THEN** it names what is being read, the offending key, and the accepted keys, in the shape
  the seat level already uses

### Requirement: An observation records how full a window was, and when it resets

A capacity observation SHALL record the seat, the window, the fraction of it consumed, the
instant it was taken, the instant the window resets, and its source: a usage reading or a
provider limit error.

    {"at":…,"seat":"adam","window":"session","percentUsed":100,"resetsAt":…,"source":"limit"}

An observation of a window scoped to one model SHALL record that model, and no bound is derived
against such a window here. The reset SHALL be recorded as an instant comparable against the
present.

#### Scenario: A reading becomes an observation

- **WHEN** a usage reading reports a window percentage and a reset time
- **THEN** an observation is recorded with that percentage, that reset, and source `usage`

#### Scenario: A limit error becomes an observation at 100%

- **WHEN** the provider refuses a run because a window is exhausted
- **THEN** an observation is recorded at 100% for that window, with the reset the provider
  stated and source `limit`

#### Scenario: A per-model window is recorded as one

- **WHEN** an observation concerns a limit scoped to a single model
- **THEN** the record names that model
- **AND** it is not recorded as the all-models window

#### Scenario: A reset that cannot be resolved is not invented

- **WHEN** an observation's reset time cannot be resolved to a comparable instant
- **THEN** the observation is still recorded
- **AND** it yields no capacity figure and places no window boundary
- **AND** it stops bearing on the present one window length after it was taken

### Requirement: Observations are appended to their own log and never rewritten

Observations SHALL be appended to a log of their own, separate from the execution log, and SHALL
NOT be modified or deleted once written. An observation stops bearing on the present when its
reset time passes; it is not removed when it does.

#### Scenario: An observation is never overwritten

- **WHEN** a second observation is recorded for the same seat and window
- **THEN** it is appended
- **AND** the earlier row is still present and still readable

#### Scenario: Expiry is not deletion

- **WHEN** an observation's reset time has passed
- **THEN** it no longer indicates that the seat is spent
- **AND** it remains available as calibration data

#### Scenario: Observations are not mixed into the execution log

- **WHEN** an operator reads the execution log
- **THEN** it contains what was spent and not how full a window was

### Requirement: Capacity is recorded spend divided by the fraction it consumed

A seat's capacity for a window SHALL be its recorded Igor spend within the window
instance an observation belongs to, divided by the fraction of the window it reported consumed.
That instance is bounded by the observation's reset time and the window's fixed cadence; spend
over all recorded history SHALL NOT be the numerator. Instances tile the timeline, so one
observed reset fixes every boundary before and after it. The session window runs five hours and
the weekly window seven days.

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

### Requirement: A limit error lowers the estimate that permitted it

An observation implying a capacity lower than the seat's current estimate SHALL lower that
estimate. A limit error is such an observation by construction: it says the window was full at a
moment when Igor believed there was room, so whatever capacity was assumed was too high.

#### Scenario: The estimate falls after a refusal

- **WHEN** the provider refuses a run on a seat whose estimate said capacity remained
- **THEN** the seat's capacity estimate for that window is lowered to what the refusal implies

#### Scenario: Correction requires no operator

- **WHEN** an estimate has been corrected by a limit error
- **THEN** no reading is re-run and no configuration is edited to make the correction take
  effect

### Requirement: A seat at 100% is spent until its window resets

A seat with an observation at 100% for a window whose reset time has not yet passed SHALL be
treated as having no headroom in that window, independently of any capacity estimate. Once that
reset time passes the observation SHALL stop having that effect.

#### Scenario: A spent seat is passed over

- **WHEN** a seat has an unexpired observation at 100% for a window
- **THEN** that seat has no headroom and is passed over

#### Scenario: The reset time reaches the handoff

- **WHEN** an Igor hands off because every seat is spent
- **THEN** the reset time recorded with the observation is what the handoff states

#### Scenario: A seat recovers without intervention

- **WHEN** the reset time on a 100% observation passes
- **THEN** the seat is no longer treated as spent
- **AND** nothing had to be run to clear it

### Requirement: A seat with no capacity figure at all protects no floor

A seat declaring a non-zero reserve and having neither an observation nor a declared capacity
SHALL be passed over, with that as the stated reason, rather than spent from against a
denominator nobody supplied. A seat declaring no reserve MAY be spent from with neither,
bounded reactively: its first limit error is its first calibration point.

#### Scenario: A reserved seat is not spent from on a guess

- **WHEN** a seat declares a reserve and has neither an observation for the window nor a
  declared capacity
- **THEN** it is passed over
- **AND** the reason given is that no capacity figure exists for it

#### Scenario: A dedicated seat runs uncalibrated

- **WHEN** a seat declares no reserve and has no observation
- **THEN** work may be charged to it

#### Scenario: The first refusal calibrates it

- **WHEN** an uncalibrated seat with no reserve is refused by the provider
- **THEN** that refusal is recorded as an observation
- **AND** the seat has a capacity estimate it did not have before

### Requirement: A spend with no seat behind it does not happen

Where seats are declared, every model call Igor makes on its own behalf SHALL be charged to the
seat the gate chose for the role, and SHALL be made with that seat's credential where the seat
names one. Where the gate names no seat, the call SHALL NOT be made, and no ambient credential
SHALL be substituted for the seat the gate did not name. Where an organization declares no
seats, budget is not enforced and this requirement places no condition on anything.

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

### Requirement: A seat shut in both windows returns on the later of the two

Where a seat is blocked in both its session and its weekly window, and both returns can be
placed on a clock, the hour stated for that seat SHALL be the later of the two — whichever
window it belongs to, and however the figure was arrived at. A reading taken from the seat and a
figure derived from observations of it SHALL answer this question the same way. This does not change how a
role's seats are compared: across them, a handoff still states the earliest of their hours.

#### Scenario: The later hour is stated for a seat that could be read

- **WHEN** a seat's own reading reports both windows exhausted, the week returning at 5pm and
  the session at 8pm
- **THEN** the hour stated for that seat is 8pm
- **AND** the week's hour is not chosen for being the week's

#### Scenario: The later hour is stated for a seat that could not be read

- **WHEN** a seat with no reading is blocked in both windows by what was observed and recorded
- **THEN** the hour stated for that seat is the later of the two returns

#### Scenario: Both paths answer alike

- **WHEN** two seats are blocked in both windows with the same two return times, one judged on
  its own reading and one on derived figures
- **THEN** the same hour is stated for each

#### Scenario: A return that cannot be placed is not ordered against

- **WHEN** one of a seat's two blocked windows names no return, or names one that cannot be
  resolved to a comparable instant
- **THEN** the hour stated for that seat is not arrived at by comparing the two
- **AND** which hour is stated is decided by the rules already governing an unplaceable return,
  which this requirement does not disturb

#### Scenario: The role is still back on its earliest seat

- **WHEN** several seats that serve the role are each blocked in both windows
- **THEN** each seat answers with the later of its own two returns
- **AND** the role's stated return is the earliest of those

### Requirement: An hour is marked approximate where a stated reset does not fix it

An hour a handoff states SHALL be marked approximate where no reset the provider stated fixes it: a
cadence ceiling (a bound from the window's length) where a refusal named no reset, and an hour
stated for one window while another window also blocking the seat stated no return. An hour the
provider stated, a window boundary counted from one along the window's cadence, and the later of two
stated hours SHALL NOT be marked. A marked hour is reported as "back around", an unmarked one as
"back at".

#### Scenario: A compared pair of stated hours is exact

- **WHEN** both of a seat's blocked windows name a provider-stated return and the later is taken
- **THEN** the hour stated is not marked approximate

#### Scenario: An unstated return still hedges the hour

- **WHEN** a seat is blocked in both windows and one of them names no return
- **THEN** the hour stated is marked approximate

#### Scenario: A cadence ceiling is still approximate

- **WHEN** the hour stated stands in for a reset the provider never named
- **THEN** it is marked approximate

#### Scenario: A tiled boundary is still exact

- **WHEN** the hour stated is the end of the instance a seat's spend was summed inside, tiled
  from a reset the provider stated
- **THEN** it is not marked approximate

