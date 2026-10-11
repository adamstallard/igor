## MODIFIED Requirements

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
