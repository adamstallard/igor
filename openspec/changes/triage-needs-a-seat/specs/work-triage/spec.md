## ADDED Requirements

### Requirement: The model stage does not run where no seat can pay for it

Triage's model call is a spend, and SHALL be charged to the seat the budget gate chooses for the
role, using that seat's credential where the seat names one. Where the gate names no seat —
every seat in the pool spent to its bound, or the pool unusable for any other reason — the model
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

#### Scenario: A held pool stops the model stage

- **WHEN** candidates survive the earlier stages and no seat in the role's pool has headroom
- **THEN** no model call is made
- **AND** no candidate is proposed for claiming from that cycle

#### Scenario: No seat means no credential, not an ambient one

- **WHEN** the gate names no seat for the role
- **THEN** the model stage does not fall back to whatever login is ambient
- **AND** no spend is made that no seat can be named for

#### Scenario: A pool that could not be used at all is refused on the same terms

- **WHEN** the role's pool resolves to nothing, or every seat in it is unreadable or has no
  capacity figure
- **THEN** the model stage does not run either
- **AND** the reason recorded is that one, not exhaustion

#### Scenario: An organization with no seats declared still triages

- **WHEN** no seats are declared, so budget is not enforced
- **THEN** the model stage runs as it did before
- **AND** this requirement places no condition on it

#### Scenario: Everything before the model call still runs

- **WHEN** a cycle runs while the pool is held
- **THEN** sources are still polled, comments are still read, and the stop and deferral gates
  still run
- **AND** a stop or a reply arriving during the held period is acted on in that cycle

#### Scenario: A cycle with nothing to triage reads no seat

- **WHEN** no candidate survives the stages before the model call
- **THEN** the budget gate is not resolved for triage
- **AND** no seat's usage is read on triage's behalf

### Requirement: A candidate left untriaged is not a candidate triage decided about

Where the model stage does not run, each candidate that reached it SHALL be recorded as
untriaged, with the reason, and SHALL hold its source's watermark back so that the next cycle
with capacity considers it again. It MUST NOT be recorded as a skip, and MUST NOT be suppressed
on any ground.

An item dropped before anything examined it holds the mark back; every other skip was a
decision, and the edit or the reply that reverses one lifts the item by itself. Nothing about
these items produced this outcome and nothing about them will change to lift them, so a mark
allowed past them drops them from the pool for good. That would make skipping the call worse
than the spend it prevents: today such an item at least gets a verdict.

This is the same reading as "Running out of budget is not a decision about the item", one stage
earlier — there an item handed back for want of budget is not suppressed, here an item never
triaged for want of budget is not marked as seen.

#### Scenario: Untriaged is not decided

- **WHEN** the pool is held and candidates had survived to the model stage
- **THEN** each is recorded as untriaged, naming the held pool as the reason
- **AND** none is recorded as skipped, out of lane, or otherwise decided about

#### Scenario: The watermark waits for them

- **WHEN** a cycle triages nothing because the pool is held
- **THEN** the source's mark does not advance past the oldest candidate left untriaged
- **AND** the next cycle with capacity considers that candidate again, unedited

#### Scenario: An untriaged item is not suppressed

- **WHEN** an item is left untriaged because the pool was held
- **THEN** nothing records it as handed back, deferred or quiet
- **AND** it needs no reply and no edit to be worked once capacity returns

#### Scenario: Nothing is posted to an item nobody claimed

- **WHEN** the model stage is skipped for want of a seat
- **THEN** no comment is posted to any candidate
- **AND** the cycle's own report is where the Igor says what happened

### Requirement: A cycle that triaged nothing says why, and when it can resume

Where a cycle makes no triage call because the gate named no seat, it SHALL report that,
distinguishably from a cycle with nothing to triage, and SHALL say how many candidates were left
untriaged. The report SHALL distinguish a pool whose seats are spent from a pool that could not
be used at all — a name resolving to nothing, a seat nothing can read, a seat never observed —
and where a reset is known it SHALL state when capacity returns.

An Igor that goes quiet for hours without explaining itself is a second failure on top of the
first. The distinction is the difference between a fault an operator fixes and a wait they only
have to understand: only spend means the budget ran out, and an operator sent to look at spend
for an unresolvable pool name looks in the wrong place. Saying it at all is what keeps a
correctly configured machine from reporting that it is not logged in — the message the ambient
fallback produces where no login exists, which sends an operator to re-authenticate a host whose
only problem is that every seat is held.

#### Scenario: Silence is explained

- **WHEN** a cycle makes no triage call because the pool is held
- **THEN** the report says so and states how many candidates were left untriaged
- **AND** it is distinguishable from a cycle that had nothing to triage

#### Scenario: Spent is told apart from unusable

- **WHEN** the pool could not be used for a reason that is not spend
- **THEN** the report names that reason
- **AND** it does not report the budget as exhausted

#### Scenario: The return time is stated

- **WHEN** the seats are spent and a reset time is known
- **THEN** the report states when capacity is expected to return

#### Scenario: A held pool does not read as a login problem

- **WHEN** every seat is held on a machine with no ambient login
- **THEN** the cycle reports the held pool
- **AND** nothing reports the Igor as not logged in
