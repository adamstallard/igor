## MODIFIED Requirements

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
The overflow position in a pool is therefore conditional on that seat having a figure, and a
pool whose only reserved seat has neither has nothing to overflow into.

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
reserved seat with no figure at all is passed over rather than spent from, so without one
nothing ever accumulates for a derivation to divide. It is reported as declared until an
observation replaces it, so nobody mistakes an assumption for a measurement.

What must never be configured is a *usage figure*. Capacity is a property of the plan and
changes rarely; how full the window is right now changes by the minute and is the thing a
person cannot supply usefully. Even capacity is not fixed — the provider has moved the weekly
allowance for every subscriber at least once, without any plan changing — so a declared figure
is a starting point with a shelf life and not a constant.

A reading is available only to a credential the provider can resolve a subscription for. The
credential a seat holds is a `setup-token` one, which carries no subscription identity, so the
provider reports a per-invocation cost summary instead of window percentages and there is
nothing to read. Where a reading can be taken it remains the better answer and is taken; its
absence must bound the seat rather than blind the system to it, because a seat nothing can
measure is otherwise a seat with no ceiling at all.

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

### Requirement: Recorded spend attributes a seat between its roles

Recorded cost SHALL be used both to apportion a seat between the roles drawing on it and, taken
against an observed capacity, to decide whether that seat has anything left. What fraction of a
seat a role is responsible for comes from the record; whether capacity remains comes from the
record measured against an observation of how full the window was.

The record is the only quantity available for both questions on a seat whose credential reports
no window. Cost is reported as an equivalent value at list prices rather than an amount billed,
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
- **AND** the decision does not wait on a reading that cannot be taken

### Requirement: Budget reporting states what each seat has left

Reporting SHALL show, per seat and per window, what Igors have spent, the reserve, the
remaining headroom, when the window resets, and where the capacity figure came from — which
observation it was derived from and when that observation was taken. A seat with no observed
capacity SHALL be reported as having no capacity figure, distinctly from a seat reported as
having no headroom left.

Headroom derived from a limit error an hour ago and headroom derived from a month-old reading
are not the same claim. An operator who cannot tell them apart cannot tell a calibrated seat
from a stale one, and cannot tell either from a seat that has never been measured.

#### Scenario: Headroom legible per window

- **WHEN** an operator inspects the budget
- **THEN** each seat's Igor spend, reserve, headroom and reset time are shown for every window
- **AND** each headroom figure is shown with the observation it derives from and that
  observation's time

#### Scenario: An unmeasured seat reads as unmeasured

- **WHEN** a seat has no observation for a window
- **THEN** reporting says so
- **AND** it does not report that seat as having no capacity left

## ADDED Requirements

### Requirement: An observation records how full a window was, and when it resets

A capacity observation SHALL record the seat, the window, the fraction of that window consumed,
the instant the observation was taken, the instant the window resets, and which of two sources
it came from: a usage reading, or a provider limit error.

    {"at":…,"seat":"adam","window":"session","percentUsed":100,"resetsAt":…,"source":"limit"}
    {"at":…,"seat":"adam","window":"week","percentUsed":36,"resetsAt":…,"source":"usage"}

One record type, because the two sources say the same thing. A limit error is a reading at
exactly 100% with a reset time attached, and treating it as a second kind of fact would mean
two mechanisms deciding the same question from the same information.

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

Executions and observations are the two halves of one division — executions are the numerator,
observations the denominator — so a consumer joins them rather than filtering one stream. Keeping
them apart also keeps the observation log small enough to read whole for a question that scans
every row.

Append-only is what makes the log safe to write from several Igors and useful afterwards. There
is no read-modify-write, so no row is lost to another being written; and a row that no longer
answers "is this seat spent" still answers "what was this seat's capacity", permanently.

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

A seat's capacity for a window SHALL be derived as recorded Igor spend within that window
instance divided by the fraction of the window an observation reported consumed. The numerator
SHALL be the spend recorded for that seat within the instance the observation belongs to —
bounded by the observation's reset time and the window's fixed cadence — and not spend over all
recorded history.

Instances tile the timeline: each ends exactly where the next begins, and no moment belongs to
neither. One observed reset therefore fixes every boundary before and after it by subtraction,
which is what lets spend be assigned to an instance at all. The session window runs five hours
and the weekly window seven days.

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

### Requirement: A limit error lowers the estimate that permitted it

An observation implying a capacity lower than the seat's current estimate SHALL lower that
estimate. A limit error is such an observation by construction: it says the window was full at a
moment when Igor believed there was room, so whatever capacity was assumed was too high.

This is the argument for the whole arrangement. The reactive layer — stopping when the provider
refuses — costs a failed run and yields, for free, a measurement at exactly 100% with the time
and the model mix already recorded. The predictive layer improves from that failure with nobody
re-running a reading, editing a configuration, or noticing. A fleet that hits limits gets better
at not hitting them.

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

The same rows answer both questions asked of a seat. "Is this seat spent right now" is a scan
for an unexpired row at 100%; "what is this seat's capacity" is a division over the same rows.
A second store for the first question would be a second thing to keep true.

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

A reserve is a fraction of capacity, so without a capacity figure it expresses no quantity at
all. Spending somebody's subscription against a denominator nobody chose is worse than declining
to use their seat, because the failure is invisible to them until their own work is refused. A
declared figure is not that: somebody named it, it is reported as declared, and the first
observation replaces it. Where nobody's floor is at stake, the same ignorance costs only a
failed run, which is the calibration the seat needed.

The unlock is a reading, and the reading half already exists: the provider returns window
percentages headlessly to an interactive login, and those percentages already parse. What it
requires is a machine with such a login — the seat's owner — rather than the seat's own
credential.

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
