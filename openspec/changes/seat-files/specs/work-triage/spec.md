## ADDED Requirements

### Requirement: Triage's model call is made only where a seat can pay for it

Triage's model call is a spend, and SHALL be charged to the seat the budget gate chooses for the
role, using that seat's token, which every seat names. Where the gate names no seat —
every seat serving the role at its line, or none of them usable for any other reason — the model
stage SHALL NOT run, and no credential SHALL be substituted for the seat the gate did not name.

Every stage before the model call SHALL be unaffected: discovery, reading an item's comments,
the stop gate, the deferral gate, the universal skips and the lane predicates all run as they
otherwise would. The gate is consulted where the model call is made, after those have run, so a
cycle in which nothing survives to the model stage still reads no seat's usage.

The boundary sits there because it is the only place it can sit. Comments are fetched per
discovered candidate, and both the stop gate and the deferral gate read that fetch. An Igor that
stopped discovering while out of capacity would stop reading comments with it, and a stop
directed at it, or the reply that answers a handed-back item, arrives as a comment on a
discovered item. It would go deaf exactly when somebody is most likely to be trying to reach it,
and could not process the message that would change what it does next.

Cost is not the reason. Triage is a small call — cents against items costing dollars — and a
rule derived from those figures would say it is too cheap to gate. The reason is that finding
work it cannot take is wasted motion, and that a spend no seat can be named for is a spend
outside every ceiling the budget exists to impose.

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
all — a role no seat serves, as after a pull removes the last seat file listing it, a seat whose
credential cannot be read, a reserved seat nothing has read —
and where a reset is known it SHALL state when capacity returns.

An Igor that goes quiet for hours without explaining itself is a second failure on top of the
first. The distinction is the difference between a fault an operator fixes and a wait they only
have to understand: only spend means the budget ran out, and an operator sent to look at spend
for a role no seat serves looks in the wrong place. Without this report, an operator who ran
`claude` by hand to find out why would see only its complaint that it is not logged in, since no
seat token is in their shell. That would send them to sign in on a host where Igor never uses a stored login and
whose only problem is that every seat is held.

#### Scenario: Silence is explained

- **WHEN** a cycle makes no triage call because every seat serving the role is held
- **THEN** the report says so and states how many candidates were left untriaged
- **AND** it is distinguishable from a cycle that had nothing to triage

#### Scenario: Spent is told apart from unusable

- **WHEN** the role's seats could not be used for a reason that is not spend
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

Where the model stage does not run, each candidate that reached it SHALL be recorded as
untriaged, with the reason, and SHALL hold its source's watermark back so that the next cycle
with capacity considers it again. It MUST NOT be recorded as a skip, and MUST NOT be suppressed
on any ground.

An item dropped before anything examined it holds the mark back; every other skip was a
decision, and the edit or the reply that reverses one lifts the item by itself. Nothing about
these items produced this outcome and nothing about them will change to lift them, so a mark
allowed past them drops them for good. That would make skipping the call worse
than the spend it prevents: a call, when made, at least gives such an item a verdict.

This is the same reading as "Running out of budget is not a decision about the item", one stage
earlier — there an item handed back for want of budget is not suppressed, here an item never
triaged for want of budget is not marked as seen.

The rule is about the outcome and not about its cause. Every seat serving the role being held is
one way the model stage does not run; a seat whose credential will not resolve and a cycle that
reaches its own cap on model calls are others, and an item left by any of them is in the same
position — nothing about it produced this, and nothing about it will lift it.

Where the cap is the cause, **the candidates left over SHALL be the newest of them**. This is
not a preference about which work comes first: a mark held below an arbitrary remainder is
pulled under candidates the same cycle triaged, so the next cycle triages them again and the
mark never advances — a full cap's worth of calls every cycle on a backlog that never drains.
Taking the oldest first puts the cap above everything decided, so the mark moves and the
backlog clears a cap's worth at a time.

A coarse clock is the one case the hold cannot serve. A mark held below an untriaged candidate
still has to sit above every candidate that source triaged, and where the two share an
`updatedAt` no instant lies between them. Tracker timestamps are seconds, so one bulk edit ties
a page of items and this is not a corner. Such a candidate SHALL be passed over rather than
held: being dropped is the outcome it already had, where holding it would buy the same verdicts
again every cycle for as long as the tie lasted. This is a limit the clock imposes, not a result
worth keeping — a candidate that can be separated from everything its source decided is always
held, and narrowing what counts as separable is how the loss comes back.

Separable **by that source's own verdicts**, because marks advance per source. What one source
triaged is nothing another source's mark has to clear, so a tie measured across the whole cycle
concedes candidates their own source could have been held below cleanly — the same permanent
loss stated above, reached from the other side. A comparison recomputed over every source's
verdicts is that loss, however the tie is worded.

The reason has to be that no call was made. A call that was made and failed is a different
fact — the item was examined and paid for — and what becomes of it is #78, not this
requirement.

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
  serving the role is held, because the seat the gate named has no readable credential, or because the cycle reached
  its cap on model calls first
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
