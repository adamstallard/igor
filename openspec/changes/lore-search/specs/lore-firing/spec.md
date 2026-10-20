## MODIFIED Requirements

### Requirement: Lore reaches the worker unbidden

Active, in-scope entries SHALL be injected into the worker's context before it runs. The
worker MUST NOT be required to request them.

A worker MAY be offered a search over the lore store. A *search* here is a lookup over the
store made to find lore or an answer for an agent. A search is *during a run* when the agent
works for an Igor, under that Igor's role: a worker on an item, for example, or the inquisitor
skill run by an Igor whose work a question has stopped.

A search during a run SHALL apply firing's scope rule for the run's role, from *Status and scope
are exact filters, always applied*. It MUST NOT return an entry whose scope does not cover that
role, nor give any count or mention of one.

Every search, during a run or not, SHALL present only `active` entries as lore or as answers. A
search MAY also return an in-scope `provisional` or `deprecated` entry, and SHALL label each one
with its status, as not lore.

A check that compares a candidate entry against the store, to avoid proposing a duplicate, is
curation and not a search. It MAY compare against `provisional` entries, and against
candidates a reviewer has already rejected. During an Igor's run, it MUST NOT compare against an
entry whose scope does not cover the run's role.

A search's results MUST NOT be recorded as firings.

Scope decides what a role may see, so a search holds to it exactly as firing does. Status
filters firing only. In a search it is review state, shown as a label: an unreviewed or retired
entry can still inform an agent, as long as nobody takes it for reviewed lore.

#### Scenario: Entries present without being requested

- **WHEN** a worker begins an item and matching entries exist
- **THEN** those entries are already in its context
- **AND** it issued no query to obtain them

#### Scenario: Injection does not wait on a search

- **WHEN** a worker is offered a search over the store and never uses it
- **THEN** the active, in-scope entries are in its context all the same

#### Scenario: A search never shows an out-of-scope entry

- **WHEN** a search during a run matches an entry scoped to another role, or to a project the
  run's role does not work
- **THEN** that entry is not returned
- **AND** the results give no count or mention of it

#### Scenario: A search labels in-scope entries that are not active

- **WHEN** a search during a run matches an in-scope `provisional` entry, an in-scope
  `deprecated` entry and an in-scope `active` entry
- **THEN** only the `active` entry is presented as lore
- **AND** each of the other two that is returned is labelled with its status, as not lore

#### Scenario: A search hit is not a firing

- **WHEN** a search during a run returns an entry
- **THEN** no firing is recorded for that entry

#### Scenario: A duplicate check is curation, not a search

- **WHEN** an Igor compares a candidate entry against the store during its run, to avoid
  proposing a duplicate
- **THEN** it may compare against `provisional` entries and rejected candidates
- **AND** it compares against no entry whose scope does not cover that Igor's role
