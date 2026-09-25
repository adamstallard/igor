## ADDED Requirements

### Requirement: A refusal met during triage calibrates the seat that refused

Where the provider refuses a triage call on a seat the budget gate named, an observation SHALL be
recorded at 100% for that seat and window, with the reset the refusal stated where it stated one,
and source `limit` — the same record a refusal met during a run produces, decided by the same rules
about which window was exhausted and whether the reset can be placed on a clock.

A refusal met during triage SHALL be recognised by the same recogniser that reads a run's refusal,
not by a second one written for triage. The patterns that say what a refusal looks like are
unverified against a live one, and a second reader of them is a second thing to correct when the
first live refusal is finally captured — with nothing to make anyone notice the two had drifted
apart in the meantime.

The refusal SHALL be recognised from a field the provider filled. A limit named only in the call's
own result text SHALL NOT record an observation. That text is model output written about an item,
so an item about rate limits says the same words; a run has its own classification behind it before
the observation is written, and a triage call has nothing but the recogniser's verdict. The cost of
being wrong is not a wasted call but a permanent row asserting a seat was full when it was not.

Where the gate named no seat, nothing is recorded. An observation owes a seat, and a call made on a
credential no seat names is attributable to none.

This is the only way a seat bought for a fleet is ever calibrated. Every other route to an
observation needs a person signed in on the seat to take a reading, and nobody signs in as a
dedicated seat. Triage is the first model call of a cycle, so an exhausted window is likelier to be
discovered there than anywhere else — and the refusal is worth most at that moment, because it
proves the window was full at a known instant with the spend record complete behind it. A refusal
recognised only at the execution stage means the seats that most need calibrating are the ones
least likely to get it.

#### Scenario: A refused triage call records the observation

- **WHEN** the provider refuses a triage call on a seat the gate named, in a field the provider
  fills
- **THEN** an observation is recorded at 100% for that seat and window, with source `limit`
- **AND** the reset the refusal stated is recorded with it

#### Scenario: The same reading as a refused run

- **WHEN** a triage refusal and a run's refusal carry the same limit fields
- **THEN** the same window is concluded and the same reset is recorded for each
- **AND** neither is read by a recogniser the other does not use

#### Scenario: Prose alone records nothing

- **WHEN** a triage call fails and only its result text mentions a usage limit, with no field the
  provider fills naming one
- **THEN** no observation is recorded
- **AND** the call is reported as the failure it otherwise is

#### Scenario: A refusal with no seat behind it records nothing

- **WHEN** a triage call is refused and the gate named no seat for the role
- **THEN** no observation is recorded
- **AND** nothing is attributed to a seat that was not named

#### Scenario: An ordinary triage failure is not a refusal

- **WHEN** a triage call fails for a reason that is not a usage limit
- **THEN** no observation is recorded
- **AND** the seat's estimate is unchanged

#### Scenario: A refusal naming no reset is still recorded

- **WHEN** a triage refusal names no return, or names one already past
- **THEN** the observation is recorded without a reset
- **AND** it yields no capacity figure, on the rules already governing such a row

### Requirement: One refusal is one observation, however many calls met it

A triage stage SHALL record at most one observation per seat and window, however many of its calls
met the refusal. The stage SHALL stop calling a seat once the provider has refused it, and the
observation SHALL be written once, outside whatever loop makes the per-candidate calls, by the
caller that owns the batch rather than by the code that makes a call.

Exactly-once has to come from the shape of the loop, not from the writer checking whether a row is
already there. Observations are appended and never rewritten, and the reason given for that is that
there is no read-modify-write and so no row is lost to another being written. A writer that reads
the log to ask whether this seat and window are already recorded reintroduces exactly that, and two
Igors sharing a state branch can both read before either writes. It is also unnecessary: an
exhausted window refuses the next call too, so a stage that stops at the first refusal has one
refusal to record.

Without the stop, one exhausted window becomes one row per candidate, permanently. The log is
append-only, so nothing removes the surplus rows; and capacity is recorded spend divided by the
fraction it consumed, so a denominator counted many times over is a wrong capacity figure that
outlives the cycle that wrote it. A refusal is supposed to make the estimate better.

Stopping costs nothing that was not already lost. Every remaining call would have been refused too,
so the candidates left untriaged are the same ones that would each have failed in turn. Those
candidates SHALL be reconsidered by the next cycle with capacity: nothing about them produced this
outcome, and nothing about them will change to lift them past a watermark allowed to advance over
them.

Verdicts the stage reached before the refusal stand. They were paid for and they are correct, and
discarding them would make a refusal cost more than the capacity it reported.

#### Scenario: Many refused calls record one row

- **WHEN** a triage stage would meet the same refusal on each of several candidates
- **THEN** exactly one observation is recorded for that seat and window
- **AND** no further triage call is made on that seat in that stage

#### Scenario: The row is not written per call

- **WHEN** a refusal is recognised at a candidate's call
- **THEN** the observation is written by the caller that owns the batch, once the batch has ended
- **AND** it is not written from inside the per-candidate call

#### Scenario: Exactly-once is not read-modify-write

- **WHEN** an observation is recorded for a triage refusal
- **THEN** the log is not read first to decide whether to write
- **AND** two Igors recording refusals on the same seat neither lose a row nor depend on having
  read each other's

#### Scenario: Earlier verdicts survive the refusal

- **WHEN** some candidates were triaged before the refusal was met
- **THEN** their verdicts stand and are acted on as usual
- **AND** the cost already reported for them is still counted

#### Scenario: The untriaged candidates come back

- **WHEN** a stage stops early because the seat refused it
- **THEN** the candidates it did not reach are considered again by the next cycle with capacity
- **AND** none of them needs an edit or a reply to be reconsidered

#### Scenario: A later cycle records its own refusal

- **WHEN** a subsequent cycle meets a refusal on the same seat and window
- **THEN** it records its own observation
- **AND** the earlier row is still present, as the log's append-only rule requires
