# work-triage Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: Triage runs in three stages, cheapest first

Triage SHALL proceed in order: the tracker's own query, then declarative lane predicates over
normalized candidates, then a model call for only the residue. A candidate rejected by an
earlier stage MUST NOT reach a later one.

#### Scenario: Predicates gate the model call

- **WHEN** a discovery run returns candidates and most fail the lane predicates
- **THEN** only the survivors are sent to the model
- **AND** model cost scales with what survives predicates rather than with what the tracker returned

#### Scenario: Predicate stage costs nothing

- **WHEN** a candidate is excluded by a lane predicate
- **THEN** no model call is made for it

#### Scenario: Residue reaches the model

- **WHEN** a candidate satisfies every lane predicate but in-lane-ness still requires judgment
- **THEN** it is sent to the model for a verdict

### Requirement: The triage outcome is binary and carries no confidence score

Triage SHALL produce a binary outcome — proceed or skip — determined by whether the work is in
lane and worth doing. The system MUST NOT compute, store, or act on a confidence score.

#### Scenario: Binary verdict returned

- **WHEN** triage evaluates a candidate
- **THEN** the outcome is either proceed or skip
- **AND** no intermediate or graded state exists

#### Scenario: No confidence-gated behaviour

- **WHEN** triage is uncertain about a candidate
- **THEN** it still returns proceed or skip
- **AND** no alternative handling path is selected on the basis of uncertainty

### Requirement: Every decision records its reason, including skips

Triage SHALL record, for each candidate, the outcome, the stage that decided it, and a
human-readable reason. Skips MUST be recorded as fully as proceeds.

A cycle that decided nothing SHALL write no record. A record is what the Igor decided, and one
written by a cycle that had no option to act makes the ledger lie about which cycles acted — both
to somebody asking what an Igor has been doing, and to the skip ratio below, which is a ratio over
records and would count previews as decisions.

This is about the cycle, not about any candidate within it. Where a cycle acted, every candidate
it examined is recorded, skips as fully as proceeds, and a candidate the cycle declined to act on
is a decision like any other.

#### Scenario: Skip reason recorded

- **WHEN** a candidate is skipped by a lane predicate
- **THEN** the record names the predicate that excluded it

#### Scenario: Model verdict reason recorded

- **WHEN** the model decides a candidate is out of lane
- **THEN** its stated reason is recorded alongside the outcome

#### Scenario: Skip ratio observable

- **WHEN** an operator inspects triage records over a period
- **THEN** the proportion of candidates skipped at each stage is determinable from the record
  rather than estimated

#### Scenario: A preview writes no record

- **WHEN** a cycle runs to show what it would claim, and claims nothing
- **THEN** no decision record is written for that cycle
- **AND** the records over a period contain only cycles that could have acted

### Requirement: A closed item is never a candidate

Stage one is deliberately loose and written in the tracker's own language, so a source query
may legitimately omit a state filter. Triage SHALL skip any candidate whose normalized state is
closed. This is a universal skip rather than a lane, because an organization forgetting to
write it would produce work on a settled item — visible on a surface people watch.

#### Scenario: Closed item skipped whatever the query returned

- **WHEN** a source query returns a closed item
- **THEN** triage skips it before any model call
- **AND** the reason recorded identifies the item as closed

### Requirement: Predicate inputs derived from ingested text are hints, not authority

Some normalized fields are read out of item text rather than supplied by the surface — the
paths an issue names, for one. Such fields MAY route work and MUST NOT widen it: a predicate
input derived from ingested text SHALL NOT be able to place an item inside a lane the item's
surface-supplied fields exclude it from, nor grant any permission.

#### Scenario: Text-derived field routes but does not widen

- **WHEN** an item's body names a path belonging to another Igor's lane
- **THEN** that may make the item match a path predicate
- **AND** it does not override a label exclusion or any other surface-supplied constraint

#### Scenario: Text cannot grant authority

- **WHEN** an item's text is crafted to place itself in a more permissive Igor's lane
- **THEN** the action space still comes from that role's configuration
- **AND** nothing in the item's text alters it

### Requirement: Items with work already in flight are skipped

Triage SHALL skip any item the adapter reports as having work already in flight, unless that
artifact is the Igor's own and cannot merge. This rule is universal and MUST NOT be
configurable; only its detection is adapter-supplied.

The exception preserves the reason rather than qualifying it. Work in flight is skipped because
duplicating work in review is never an organizational preference — and an artifact of one's own
that cannot merge is not duplication, it is the same work, unfinished, which nothing else will
bring back.

#### Scenario: Item with an open linked artifact skipped

- **WHEN** an item already has work in flight against it
- **THEN** triage skips it
- **AND** the reason recorded identifies work in flight

#### Scenario: Rediscovery after completion does not duplicate work

- **WHEN** an Igor has completed an item, unassigned itself, and the item is rediscovered
- **THEN** the open artifact is detected and the item is skipped
- **AND** no second artifact is produced

#### Scenario: Rule not overridable by configuration

- **WHEN** a role or org base attempts to disable the in-flight skip
- **THEN** validation fails, because duplicating work in review is never an organizational preference

#### Scenario: An Igor's own artifact that cannot merge is a candidate

- **WHEN** an item's in-flight artifact was produced by this Igor and no longer merges
- **THEN** it is not skipped

#### Scenario: A healthy artifact of one's own is still skipped

- **WHEN** an item's in-flight artifact was produced by this Igor and merges cleanly
- **THEN** it is skipped, as before

#### Scenario: Somebody else's conflicting artifact is not adopted

- **WHEN** an item's in-flight artifact was produced by another party and cannot merge
- **THEN** it is skipped, because it is theirs

### Requirement: An item held by another party is never a candidate

Triage SHALL skip any item whose holder field names a party other than the running Igor. This
rule is universal and MUST NOT be configurable.

Acting on work that is visibly someone else's is not an organizational preference. Left to a
lane, an org that forgets to write it gets an Igor that claims and retracts on a colleague's
issue every cycle — noise directed at exactly the people a claim exists to inform.

#### Scenario: An item someone else holds is skipped before any claim

- **WHEN** a candidate is held by a party other than the running Igor
- **THEN** triage skips it before any model call and before any claim
- **AND** the reason recorded names who holds it

#### Scenario: A second holder alongside the Igor still means someone else's

- **WHEN** a candidate is held by both the running Igor and another party
- **THEN** it is skipped, on the same reading a mid-run claim check uses: people add
  themselves to a holder list rather than replacing what is there

#### Scenario: An item the Igor itself holds is still a candidate

- **WHEN** a candidate is held only by the running Igor and has no work in flight
- **THEN** it is not skipped, because that is a claim left behind by a process that stopped

#### Scenario: Nobody named means nobody holds it

- **WHEN** a candidate names no holder
- **THEN** the skip does not apply

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome: a reply from anyone other than the Igor,
or an edit to the item itself. Both are required, because a handoff *invites* a reply — an item
suppressed until its title or labels change would stay silent precisely where a person supplied
the missing context in a comment.

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply lifts the suppression

- **WHEN** anyone other than the Igor comments on a handed-back item
- **THEN** it is worked again

#### Scenario: An edit lifts the suppression

- **WHEN** a handed-back item is retitled, rewritten, relabelled, or its holder changes
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing

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

The rule is about the outcome and not about its cause. A held pool is one way the model stage
does not run; a seat whose credential will not resolve and a cycle that reaches its own cap on
model calls are others, and an item left by any of them is in the same position — nothing about
it produced this, and nothing about it will lift it.

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

#### Scenario: The reason the call did not happen does not change the handling

- **WHEN** a candidate reaches the model stage and no call is made about it, because the pool is
  held, because the seat the gate named has no readable credential, or because the cycle reached
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

