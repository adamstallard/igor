## ADDED Requirements

### Requirement: A refusal met during triage is recorded as a full reading of the seat that refused

Where the provider refuses a triage call on a seat the gate named, a 100% observation SHALL be
recorded for that seat with source `limit`, its window and reset decided as for a refused run,
unless the call's own `rate_limit_event` reports it `rejected` and an observation of the refusal is
recorded from that event. The refusal SHALL be recognised as a refused run's is, from a field the
provider filled; a limit named only in the result text SHALL NOT record one, nor SHALL a preview.

#### Scenario: A refused triage call records the observation

- **WHEN** the provider refuses a triage call on a seat the gate named, in a field the provider
  fills
- **THEN** an observation is recorded at 100% for that seat and window, with source `limit`
- **AND** the reset the refusal stated is recorded with it

#### Scenario: A refusal the call's own reading reports is left to that reading

- **WHEN** a refused triage call carries a `rate_limit_event` reporting it `rejected`, and an
  observation of the refusal, at 100% of the window it names, is recorded from that event
- **THEN** this requirement records no observation for that call

#### Scenario: A refusal with no reading behind it is still recorded

- **WHEN** a refused triage call carries no `rate_limit_event` reporting it `rejected`, or one
  from which no observation of the refusal is recorded, and the refusal is named in a field the
  provider fills
- **THEN** an observation is recorded at 100% for that seat and window, with source `limit`

#### Scenario: A triage call run with `--output-format json` takes this route

- **WHEN** a triage call run with `--output-format json` is refused on a seat the gate named, in a
  field the provider fills
- **THEN** an observation is recorded at 100% for that seat and window, with source `limit`
- **AND** this requirement records it, since that format carries no `rate_limit_event`

#### Scenario: The same reading as a refused run

- **WHEN** a triage refusal and a run's refusal carry the same limit fields
- **THEN** the same window is concluded and the same reset is recorded for each
- **AND** neither is read by a recogniser the other does not use

#### Scenario: Prose alone records nothing

- **WHEN** a triage call fails and only its result text mentions a usage limit, with no field the
  provider fills naming one
- **THEN** no observation is recorded
- **AND** the call is reported as the failure it otherwise is

#### Scenario: A preview records no refusal

- **WHEN** a preview of a cycle meets a triage refusal
- **THEN** no observation is recorded

#### Scenario: A refusal with no seat behind it records nothing

- **WHEN** an organization declares no seats, so budget is not enforced and the triage call is made
  with no seat named, and the provider refuses it
- **THEN** no observation is recorded
- **AND** nothing is attributed to a seat that was not named

#### Scenario: An ordinary triage failure is not a refusal

- **WHEN** a triage call fails for a reason that is not a usage limit
- **THEN** no observation is recorded
- **AND** the seat's estimate is unchanged

#### Scenario: A refusal naming no reset is still recorded

- **WHEN** a triage refusal names no return, or names one already past
- **THEN** the observation is recorded without a reset
- **AND** like an observation whose reset cannot be resolved, it places no window boundary, yields
  no capacity figure, and expires one window length after it was taken

### Requirement: One refusal is one observation, however many calls met it

A cycle's model stage SHALL stop calling a seat once it recognises a refusal from it, and SHALL
record at most one observation per seat, window and stage, written once, after the per- candidate
loop, by the caller that owns the batch, without reading the log first. Verdicts reached before the
refusal SHALL stand. The refused candidate and those not reached SHALL be left untriaged, naming the
refusal, under work-triage's *A candidate left untriaged is not a candidate triage decided about*.

#### Scenario: Many refused calls record one row

- **WHEN** a cycle's model stage would meet the same refusal on each of several candidates
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
- **THEN** the refused candidate and each candidate the stage did not reach are recorded as
  untriaged, naming the refusal as the reason, and hold their source's watermark back
- **AND** the next cycle with capacity considers them again, with no edit or reply needed

#### Scenario: A later cycle records its own refusal

- **WHEN** a subsequent cycle meets a refusal on the same seat and window
- **THEN** it records its own observation
- **AND** the earlier row is still present, as the log's append-only rule requires
