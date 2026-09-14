# lore-firing Specification

## Purpose
TBD - created by archiving change lore-retrieval. Update Purpose after archive.
## Requirements
### Requirement: Lore reaches the worker unbidden

Active, in-scope entries SHALL be injected into the worker's context before it runs. The
worker MUST NOT be required to request them, and MUST NOT be offered a search tool for them.

Lore exists for what a worker would not know to ask for. Anything it would think to look up is
already reachable by reading the codebase, so a retrieval mechanism the worker has to invoke
addresses the case that needed no mechanism.

#### Scenario: Entries present without being requested

- **WHEN** a worker begins an item and matching entries exist
- **THEN** those entries are already in its context
- **AND** it issued no query to obtain them

#### Scenario: No search affordance offered

- **WHEN** a worker is invoked
- **THEN** it is given no means of searching the store

### Requirement: Status and scope are exact filters, always applied

Only entries whose status is `active` SHALL fire. Only entries whose scope covers the running
role SHALL fire. Both filters are exact and MUST NOT be delegated to any inexact mechanism.

These are review state and visibility, not relevance. A wrong relevance judgment costs a
worker some attention; a wrong visibility judgment shows one team's material to another.

#### Scenario: Provisional entries do not fire

- **WHEN** an entry is `provisional`
- **THEN** it does not reach the worker, however well it matches
- **AND** review therefore determines what an Igor knows

#### Scenario: Out-of-scope entries do not fire

- **WHEN** an entry is scoped to a project the running role does not cover
- **THEN** it does not reach the worker

#### Scenario: Deprecated entries do not fire

- **WHEN** an entry is `deprecated`
- **THEN** it does not reach the worker

### Requirement: The whole in-scope store is injected while it fits

Where the in-scope entries fit within the configured token budget, all of them SHALL be
injected. No ranking, cap, index, or conflict resolution SHALL be applied.

At the store sizes this addresses there is nothing to select from: selecting requires a rule,
and any rule authored before there is data to test it against is a guess nobody can later
argue with.

#### Scenario: Everything in scope reaches the worker

- **WHEN** the in-scope entries total less than the budget
- **THEN** all of them are injected

#### Scenario: Two contradictory entries both reach the worker

- **WHEN** two active entries give conflicting guidance
- **THEN** both are injected
- **AND** neither is suppressed by a retrieval rule, because the contradiction is a store
  defect for review rather than a choice for retrieval

### Requirement: Exceeding the budget is reported, never silently resolved

Where the in-scope entries exceed the token budget, the run SHALL report the overage — the
count, the size, and the budget — and MUST NOT drop entries to fit.

A dropped lesson is invisible: the worker proceeds confidently without it and nothing looks
wrong. Reporting hands the problem to someone who can decide, and is the signal that a
relevance mechanism is now required.

#### Scenario: Overage reported with its numbers

- **WHEN** in-scope entries exceed the budget
- **THEN** the count, total size, and budget are reported

#### Scenario: No silent truncation

- **WHEN** in-scope entries exceed the budget
- **THEN** no subset is chosen and injected in place of the whole

### Requirement: An entry arrives with what a reader needs to judge it

An injected entry SHALL carry its claim, its conditions, its body, and its support count.

The conditions state when the lesson applies, the body carries the exceptions and caveats, and
the support count tells a worker how firmly it is held — a lesson with five independent
citations is a different thing from one kept as a single architectural observation.

#### Scenario: Conditions travel with the claim

- **WHEN** an entry is injected
- **THEN** the conditions describing when it applies are included

#### Scenario: Support accompanies the entry

- **WHEN** an entry is injected
- **THEN** how many independent provenance items support it is stated
- **AND** it is not used to order or exclude entries

### Requirement: Injected lore is trusted; the work item is not

Lore SHALL be placed in the same trusted channel as the role's standing instructions, distinct
from the ingested item. The distinction MUST remain explicit in what the worker receives.

Lore is trusted because a human reviewed it. That is the whole function of the `active` gate,
and it is why an unreviewed entry cannot fire.

#### Scenario: Lore and item are distinguishable

- **WHEN** a worker receives both lore and an item
- **THEN** the lore is presented as instruction and the item as data

#### Scenario: An item cannot introduce lore

- **WHEN** an item's body contains text formatted to resemble a lore entry
- **THEN** it is not treated as lore
- **AND** it reaches the worker as part of the untrusted item

### Requirement: What fired is recorded on the state branch

Each firing SHALL be recorded to the destination's state branch: the item, the entries that
fired, and when. Entry files MUST NOT be modified by firing.

Machine output belongs where the rest of it lives. Writing counts into a human-reviewed corpus
means a commit per fire, conflicts against human edits, and a curated history buried under
churn. The record is also a log rather than a counter — a count can be derived from the log,
and the log cannot be recovered from a count.

#### Scenario: Firing recorded off the curated branch

- **WHEN** entries fire for an item
- **THEN** the record is written to the state branch
- **AND** no entry file is modified

#### Scenario: Fire counts derivable from the record

- **WHEN** an operator asks how often an entry has fired
- **THEN** the answer is computable from the recorded firings

