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

### Requirement: A failed triage call leaves the candidate in the pool

Where a cycle makes a triage call about a candidate and that call fails, the cycle SHALL record
that it reached no verdict on that candidate, with the reason, and the candidate SHALL remain in
the pool a later cycle triages, so it is asked about again with nothing about the item having
changed. The failure entry MUST NOT be the only record the cycle leaves of that candidate, and the
candidate MUST NOT be recorded as decided about.

A failed call is not a decision, and the item cannot lift itself out of one. Nothing about the
candidate produced the fault and nothing about it will change to clear it: it was not edited,
nobody replied to it, and the fault was on this side of the call. Freshness is measured against
the source mark, so a candidate the mark passes is not deferred until the fault clears — it is
dropped from the pool for good, with a failure entry as the only trace that it was ever seen. That
makes a failed call worse than a call never made: today such an item at least stays in the pool.

**The mark cannot express this, and a requirement written against the mark is unsatisfiable.**
Keeping a candidate in the pool by holding its source's mark below it requires the mark to sit
below that candidate, while not re-asking the candidates the same cycle did get verdicts for
requires it to sit at or above the newest of them. One instant per source cannot do both unless
the failed candidate is newer than every verdict in its source, and in the ordinary partial
failure it is older: a batch is triaged oldest first, so the calls that succeed after one that
failed carry newer timestamps. The mark is the wrong instrument for a per-item fact, not a
mis-tuned one.

So the candidate SHALL be carried by its identity rather than by the mark. The source mark SHALL
advance over everything the cycle examined, the failed candidate included, so no candidate the
cycle decided about is asked about a second time. The cycle SHALL carry the failed candidate's
identity in the state it already keeps, scoped as the mark it accompanies is, and a later cycle
SHALL offer that candidate to triage although the mark has passed it. The record SHALL clear as
soon as a cycle reaches a decision about the candidate — a verdict, or a screening that puts it
out of the pool — so that carrying is a condition that ends rather than an entry that accumulates.

Carrying the item costs no correctness if it is lost. State on the state branch is a cache: a
carried record that vanishes leaves the candidate below its source mark, which is exactly today's
behaviour and not a new failure mode.

**The carried record SHALL be bounded, and both of its costs SHALL be bounded.** A candidate whose
own content reproduces the fault — a body that will not fit the call, content that trips a filter,
an envelope the parser will not read — never reaches a decision, so it is carried for as long as
its source is polled. Unbounded, one such candidate is added per permanently broken item and the
record grows without limit; and because a carried candidate is offered every cycle, enough of them
fill a cycle's triage capacity and the pool stops draining. Therefore:

- The number of candidates carried SHALL be bounded.
- Carried candidates SHALL NOT prevent a cycle reaching candidates it has never triaged. A cycle
  that is offered more carried candidates than it has capacity for SHALL still triage fresh ones.
- Where the bound sheds a candidate, what is shed SHALL be what has been carried longest rather
  than what failed most recently, because the chronic case is the one the bound exists for and the
  recent one is the transient fault that is about to clear.
- A candidate the bound sheds falls below its source mark and is lost. The cycle SHALL report what
  it stopped carrying where a person watching the run sees it, and SHALL NOT merely append it to
  the record. A candidate that quietly stops being retried and quietly leaves the pool is the same
  loss this requirement removes, bounded in cost and identical in kind.

This states the outcome and not the mechanism. Where a cycle already carries candidates it reached
no verdict on, a failed call is one more reason to be carried that way; the requirement is met by
anything that leaves the candidate reachable by a later cycle, says why it is there, and bounds
what it keeps.

A fault that stops a call being made at all is a different fact and is not governed here. There
the model stage did not run and nothing was spent on the item; here it ran, the item was examined
and paid for, and only the answer is missing. What becomes of a candidate no call was made about
belongs with the stage that declined to make it.

#### Scenario: A failed call is not a verdict

- **WHEN** a cycle's triage call about a candidate fails
- **THEN** a later cycle asks about that candidate again
- **AND** nothing about the item has to change for it to be asked about

#### Scenario: The failure entry is not the whole record

- **WHEN** a candidate's triage call fails
- **THEN** the cycle records that no verdict was reached on that candidate, and why
- **AND** nothing records it as skipped, out of lane, or otherwise decided about

#### Scenario: A failure beside a verdict costs only its own candidate

- **WHEN** some of a cycle's triage calls fail and the rest return verdicts
- **THEN** the candidates that got verdicts are not asked about a second time
- **AND** the candidates whose calls failed are

#### Scenario: The mark still advances over a cycle that had a failure

- **WHEN** a cycle's triage calls include one that failed
- **THEN** that source's mark advances over everything the cycle examined, the failed candidate
  included
- **AND** the next cycle re-reads nothing on account of the failure

#### Scenario: A carried candidate is offered although the mark has passed it

- **WHEN** a cycle begins and an earlier cycle carried a candidate whose call failed
- **THEN** that candidate is offered to triage even though its `updatedAt` is below the source's
  mark

#### Scenario: A carried candidate clears when something is decided about it

- **WHEN** a cycle reaches a verdict on a carried candidate, or screens it out of the pool
- **THEN** the candidate stops being carried
- **AND** a later cycle does not offer it again unless the item itself changes

#### Scenario: The carried record is bounded, and what it sheds is said out loud

- **WHEN** more candidates would be carried than the bound allows
- **THEN** what is shed is what has been carried longest, not what failed most recently
- **AND** the cycle reports what it stopped carrying where a person watching the run sees it

#### Scenario: Carried candidates do not starve fresh ones

- **WHEN** a cycle is offered more carried candidates than its triage capacity would leave room for
- **THEN** it still triages candidates it has never triaged before
