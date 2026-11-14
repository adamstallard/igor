# work-triage Specification

## Purpose
Decide which candidate items an Igor takes, cheaply enough to run every cycle. Triage filters in
three stages, cheapest first: the tracker's own query, which discovery runs, then declarative
lane predicates over the normalized item, then a model call for only the items left. The outcome
is proceed or skip, with no confidence score, and every decision records its reason. This spec
also covers the skips every role applies (an item closed, held by someone else, with work
already in flight, or handed back by an Igor and not yet answered by anyone) and a cycle in which
no seat can pay for the model call.
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
human-readable reason. Skips MUST be recorded as fully as proceeds. A cycle that decided nothing,
such as a preview, SHALL write no record. Where a cycle could have acted, every candidate it
examined is recorded, and a candidate it decided not to act on is a decision like any other.

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
recorded, and the item SHALL NOT be worked again while nothing has answered it. An answer is a
reply from anyone other than the Igor, or an edit to the item itself. The item SHALL NOT be
suppressed where the cause was a fact about the Igor rather than the item, such as a seat whose
token is unset, a command its allowlist refuses, a capacity never observed, or an exhausted budget.

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

#### Scenario: A seat that could not be read is no more a decision about the item

- **WHEN** an item was handed back because the worker could not start, its seat's token unset
- **THEN** it is not suppressed, on the same grounds: the Igor's configuration produced that
  outcome, and the next item would meet it identically

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing

### Requirement: The model stage does not run where no seat can pay for it

Triage's model call SHALL be charged to the seat the budget gate chooses for the role, with that
seat's credential where it names one. Where the gate names no seat, for any reason, the model
stage SHALL NOT run, and no credential SHALL be substituted. Every earlier stage SHALL run as
usual: discovery, reading comments, the stop gate, the deferral gate (holding a handed-back item
until answered), the universal skips and the lane predicates. The gate is consulted at the model
call, after those.

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

Where no model call is made about a candidate that reached the model stage, it SHALL be recorded as
untriaged, with the reason, and SHALL hold its source's watermark back. It MUST NOT be recorded as a
skip, and MUST NOT be suppressed on any ground. Where a cycle's cap on model calls is the cause, the
candidates left over SHALL be the newest. A candidate sharing its `updatedAt` with one its own
source triaged that cycle SHALL be dropped: the mark passes it, and it returns only if it changes.

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
be used at all (a name resolving to nothing, a seat nothing can read, a seat never observed). Where a reset is known, it SHALL state when capacity returns.

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

