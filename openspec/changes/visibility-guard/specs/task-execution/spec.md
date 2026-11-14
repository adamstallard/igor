## MODIFIED Requirements

### Requirement: Transcripts and outcomes are captured to the state branch

Execution SHALL record the worker transcript, the reported cost, and the outcome. These SHALL
be written to the state branch, never to the destination's default branch. Where
`visibility-guard`'s *Nothing from a private repository is written to a public state branch*
withholds a run's content, no transcript SHALL be written, and the cost and outcome still are.

#### Scenario: Transcript persisted off the main line

- **WHEN** execution completes for a run whose content the visibility guard does not withhold
- **THEN** the transcript and outcome are written to the state branch
- **AND** the default branch is unchanged

#### Scenario: Cost recorded per invocation

- **WHEN** the worker reports its cost for an invocation
- **THEN** that figure is recorded and accumulated against the seat

#### Scenario: A withheld run keeps its cost and outcome

- **WHEN** the visibility guard withholds a run's content
- **THEN** no transcript is written, and the run's cost and outcome are
