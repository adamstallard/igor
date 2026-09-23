## ADDED Requirements

### Requirement: A recorded failure carries what a reader who was not there can act on

Where a cycle records a failure to the state branch, the entry SHALL carry — separately readable
from the sentence a person reads — whatever machine-readable identity the fault arrived with, such
as an error code, a response status or an exit status, and the origin of the fault, being where it
was raised and the descriptions wrapped around it on the way out. A fault that arrived with no such
identity SHALL still be recorded with its origin, and SHALL NOT be given an invented one.

The measure is that the entry holds no less than printing the caught fault to a console would have.
Igor is built to run where there is no console. When it fails there the record is the only artifact
that survives, and it is read hours later by somebody who was not present and has nobody to ask.
`triage: fetch failed` is close to unactionable, and it is unactionable permanently: the object it
was derived from was discarded at the one moment it could still have been inspected.

Structure is what makes it actionable rather than merely longer. A trace flattened into the same
prose is a bigger sentence — nothing in it can be matched, counted or compared across entries
without a person reading each one, which is the work the record exists to spare them.

A fault SHALL reach the record with its origin intact. Where it is re-thrown or re-described on the
way, the original SHALL be carried along rather than replaced by a description of it, because the
record can hold only what reached it, and a wrap that keeps the prose and drops the object decides
on the reader's behalf what they will be allowed to know.

The entry SHALL still yield the single line a live reader gets. The structured parts are for the
record and the sentence is for whoever is watching a run; widening one MUST NOT cost the other.

Where an entry is bounded, the identity and the origin SHALL survive the bound and the fuller trace
SHALL be what is shortened, so that bounding costs detail rather than costing the reader the two
things they act on.

This governs the record a cycle writes of its own faults — the source that would not answer, the
credential that could not be read, the call that threw, the write that failed — and nothing else. It
does not govern the outcome record an execution writes, whose stated reason is filled on a success
as readily as on a failure and is therefore a different field with a different shape. That record
carries the same defect and is not addressed here.

#### Scenario: A fault carrying a code

- **WHEN** a cycle records a failure whose fault carried a machine-readable identity
- **THEN** that identity is readable from the entry on its own
- **AND** reading it does not require parsing the sentence

#### Scenario: A fault carrying no code

- **WHEN** a cycle records a failure whose fault carried no machine-readable identity
- **THEN** the entry is still recorded, with the origin of the fault
- **AND** no identity is invented for it

#### Scenario: A fault wrapped before it was recorded

- **WHEN** a fault is re-thrown or re-described between where it was raised and where it is recorded
- **THEN** the entry names where it was raised, not only the outermost description
- **AND** the identity the original carried is readable from the entry

#### Scenario: A live reader still gets a sentence

- **WHEN** a cycle's failures are shown to somebody watching the run
- **THEN** each one renders as a single line

#### Scenario: A bounded entry keeps the two things a reader acts on

- **WHEN** an entry is shortened to stay within whatever bound the record applies
- **THEN** the identity and the origin are still present
- **AND** what was shortened is the fuller trace

### Requirement: A candidate whose triage call failed is asked about again

Where a cycle makes a triage call about a candidate and that call fails, the cycle SHALL record
that it reached no verdict on that candidate, with the reason, and the candidate's source mark
SHALL NOT advance past it, so a later cycle asks about it again. The failure entry MUST NOT be the
only record the cycle leaves of that candidate, and the candidate MUST NOT be recorded as decided
about.

A failed call is not a decision, and the item cannot lift itself out of one. Nothing about the
candidate produced the fault and nothing about it will change to clear it: it was not edited,
nobody replied to it, and the fault was on this side of the call. Freshness is measured against the
mark, so a mark allowed past such a candidate does not defer it until the fault clears — it drops
it from the pool for good, with a failure entry as the only trace that it was ever seen. That makes
a failed call worse than a call never made: today such an item at least stayed in the pool.

This states the outcome and not the mechanism. Where a cycle already carries candidates it reached
no verdict on, a failed call is one more reason to be carried that way; where it carries none, the
requirement is met by anything that leaves the mark below the candidate and says why it is there.

A fault that stops a call being made at all is a different fact and is not governed here. There the
model stage did not run and nothing was spent on the item; here it ran, the item was examined and
paid for, and only the answer is missing. What becomes of a candidate no call was made about
belongs with the stage that declined to make it.

A coarse clock is the one case the hold cannot serve. A mark held below such a candidate still has
to sit above every candidate that same source did get a verdict for, and where the two share an
`updatedAt` no instant lies between them. Tracker timestamps are coarse enough for one bulk edit to
tie a page of items, so this is not a corner. Such a candidate SHALL be passed over rather than
held: being dropped is the outcome it already had, where holding it would buy the same verdicts
again every cycle for as long as the tie lasted. The comparison is against what **that source**
decided, because marks move per source — a verdict in another source is nothing this one's mark has
to clear, and conceding to it drops a candidate this mark could have sat cleanly below.

#### Scenario: A failed call is not a verdict

- **WHEN** a cycle's triage call about a candidate fails
- **THEN** that source's mark does not advance past the candidate
- **AND** a later cycle asks about it again, with nothing about the item having changed

#### Scenario: The failure entry is not the whole record

- **WHEN** a candidate's triage call fails
- **THEN** the cycle records that no verdict was reached on that candidate, and why
- **AND** nothing records it as skipped, out of lane, or otherwise decided about

#### Scenario: A failure beside a verdict holds only its own candidate

- **WHEN** some of a cycle's triage calls fail and the rest return verdicts
- **THEN** the candidates that got verdicts are not asked about a second time
- **AND** the candidates whose calls failed are

#### Scenario: A tie the clock cannot separate is conceded

- **WHEN** a candidate whose call failed shares its `updatedAt` with a candidate its own source got
  a verdict for in that cycle
- **THEN** the mark is not held below it, since no instant separates the two
- **AND** that source's decided candidates are not triaged a second time

#### Scenario: A verdict in another source is nothing to concede to

- **WHEN** a candidate whose call failed shares its `updatedAt` only with candidates decided in a
  different source
- **THEN** its own source's mark is held below it
- **AND** the next cycle asks about it again rather than having dropped it
