## ADDED Requirements

### Requirement: A refusal met during triage is recorded as a full reading of the seat that refused

Where the provider refuses a triage call on a seat the gate named, and it carried no reading of
the refusal that Igor records, a 100% observation SHALL be recorded for that seat with
source `limit`, its window and any stated reset decided by the rules a refused run uses. The
refusal SHALL be recognised by the recogniser a refused run uses, from a field the provider filled;
a limit named only in the call's result text SHALL NOT record one. The row holds the seat until
the window resets.

#### Scenario: A refused triage call records the observation

- **WHEN** the provider refuses a triage call on a seat the gate named, in a field the provider
  fills
- **THEN** an observation is recorded at 100% for that seat and window, with source `limit`
- **AND** the reset the refusal stated is recorded with it

#### Scenario: A refusal the call's own reading reports is left to that reading

- **WHEN** a refused triage call carries a rate-limit event that Igor records as a reading of the
  seat
- **THEN** this requirement records no observation for that call
- **AND** the refusal is recorded once, from the reading

#### Scenario: A refusal with no reading behind it is still recorded

- **WHEN** a refused triage call carries no rate-limit event Igor recognises, and the refusal is
  named in a field the provider fills
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
caller that owns the batch rather than by the code that makes a call. The candidates it did not
reach SHALL be reconsidered by the next cycle with capacity to triage them.

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
