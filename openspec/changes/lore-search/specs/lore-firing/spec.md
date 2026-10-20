## MODIFIED Requirements

### Requirement: Lore reaches the worker unbidden

Active, in-scope entries SHALL be injected into the worker's context before it runs, whenever
they fit the firing budget (*Exceeding the budget is reported, never silently resolved*). The
worker MUST NOT be required to request them.

A worker MAY be offered a search over the lore store. A *search* here is a lookup over the
store made to find lore or an answer for an agent. An agent works *during an Igor's run* when it
works for an Igor, under that Igor's role: for example a worker on an item, or an agent running
a skill such as shared-skills' inquisitor, which an Igor runs before asking a person a question.
A search such an agent makes is a *search during a run*.

An entry's scope *covers* a role when firing's scope rule, from *Status and scope are exact
filters, always applied*, admits the entry for that role: its scope is `global`, `role:` naming
that role, or `project:` naming a repository that role works.

A search during a run SHALL apply that rule for the run's role. It MUST NOT return an entry
whose scope does not cover that role, nor give any count or mention of one.

A search during a run SHALL present only `active` entries as lore or as answers. It MAY also
return an in-scope `provisional` or `deprecated` entry, and SHALL label each one with its
status, as not lore.

A search's results SHALL come back to the agent as search output. They MUST NOT be placed in
the trusted channel that carries injected lore (*Injected lore is trusted; the work item is
not*).

A check that compares a candidate entry against the store, to avoid proposing a duplicate, is
curation and not a search. It MAY compare against `provisional` entries, and against
candidates a reviewer has already rejected. During an Igor's run, it MUST NOT compare against an
entry or a rejected candidate whose scope does not cover the run's role, and a rejection that
records no scope counts as outside it. A rejection *records a scope* when its file holds the
rejected candidate's `scope`. Checking that a candidate's id is free is not
such a check: *An entry already in the store is never overwritten by proposing* governs it.

A search's results MUST NOT be recorded as firings.

#### Scenario: Entries present without being requested

- **WHEN** a worker begins an item and matching entries exist
- **THEN** those entries are already in its context
- **AND** it issued no query to obtain them

#### Scenario: Injection does not wait on a search

- **WHEN** a worker is offered a search over the store and never uses it
- **AND** the active, in-scope entries fit the firing budget
- **THEN** those entries are in its context all the same

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

#### Scenario: Search results never arrive as injected lore

- **WHEN** a search during a run returns entries
- **THEN** they reach the agent as search output
- **AND** none is placed in the channel that carries injected lore

#### Scenario: A search hit is not a firing

- **WHEN** a search during a run returns an entry
- **THEN** no firing is recorded for that entry

#### Scenario: A duplicate check is curation, not a search

- **WHEN** an Igor compares a candidate entry against the store during its run, to avoid
  proposing a duplicate
- **THEN** it may compare against `provisional` entries and rejected candidates
- **AND** it compares against no entry or rejected candidate whose scope does not cover that
  Igor's role, nor against a rejection that records no scope

## ADDED Requirements

### Requirement: An Igor publishes the citations its worker reports

A *citation* is an agent's record that a lore entry answered a question, so that no person was
asked. The *lore repository* is the repository the run's lore store is read from. A question
has a *category* when shared-skills #25's inquisitor gives it one: `vulnerability`, `secret`
or `personal`.

During an Igor's run, the worker SHALL report each citation it makes, by the cited entry's id
and nothing else, and the Igor reads only that id from a report. The worker SHALL NOT report a
citation for a question with a category. When the Igor runs the inquisitor skill itself, with
no worker, each citation that run makes SHALL be handled as a worker's report is below, and
none SHALL be made for a question with a category.

When the run publishes an artifact, or ends in the Igor's handoff comment on the item
(*graceful-handoff*), the Igor SHALL push the run's citations to the lore repository's
`questions` branch. A run that publishes neither SHALL push no citations. The worker holds no
credential for the lore repository (*The worker is given an explicit environment holding no
credential but its seat's*), and the role's `allow` list does not govern the push (*Only
reversible artifacts are produced*).

The Igor SHALL push a citation only when its id names an entry that is `active`, with a scope
that covers the run's role, in the lore store as the run read it. The Igor SHALL refuse any
other citation, and a refused citation writes nothing to the lore repository.

During a run, a search, including the inquisitor's first filter, which looks for an answer
already recorded, SHALL read only the lore store the Igor injects from: the lore repository
the Igor's configuration names as its destination. So a citation's entry id names one entry
in one lore repository.

The `questions` branch is an orphan branch of the lore repository, separate from the state
branch where the Igor records its runs. The Igor SHALL create it, as an orphan, where it is
missing. Each citation SHALL be written to it in the format that shared-skills #25's
requirement
[*A citation file has one format*](https://github.com/adamstallard/shared-skills/blob/spec/inquisitor/openspec/changes/inquisitor/specs/inquisitor/spec.md)
sets for a citation an Igor pushes from a run. That format has a `run` key, whose value is the
*run's id*: a random identifier the Igor mints for the run. The *run's record* is the run's row
in the execution ledger, `executions.ndjson` on the state branch, which has one row per run. The Igor records the run's id there,
with the run's item, time and outcome. Where a push is rejected because the branch moved, the Igor SHALL retry it on the branch's new tip, at most three times; a citation
still not pushed after the third retry counts as failed to push.

A citation SHALL go to no place more visible than the repository the question concerns, where
private is less visible than internal and internal less than public. During a run, the
repository the question concerns is the repository of the item the run works; the Igor never
takes it from the worker's output. A lore repository whose visibility the Igor cannot read
counts as public, and a repository the question concerns whose visibility it cannot read counts
as private. A citation that this rule withholds is not pushed.

The Igor SHALL record, in the run's record on the state branch, how many of the run's
citations it did not push, by reason: refused, withheld by the visibility rule, failed to push,
or the run published neither an artifact nor a handoff. That record SHALL NOT repeat a refused
citation's id or any other text the worker wrote, and SHALL NOT say why a citation was refused.

#### Scenario: A worker's citation is published by its Igor

- **WHEN** a worker reports that an `active` entry in the run's role's scope answered a
  question
- **AND** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the lore repository is no more visible than the repository of the item the run works
- **THEN** the Igor pushes a citation of that entry to the lore repository's `questions` branch
- **AND** the worker held no credential for the lore repository

#### Scenario: A worker's report of a citation holds only the entry's id

- **WHEN** a worker reports a citation
- **THEN** the report holds the cited entry's id and nothing else: no category, for example
- **AND** the Igor reads only that id from it

#### Scenario: A worker reports no citation for a question with a category

- **WHEN** an `active` entry in the run's role's scope answers a worker's question that has a
  category
- **THEN** the worker reports no citation for it

#### Scenario: A citation from the Igor's own inquisitor run is pushed under the same rules

- **WHEN** the Igor runs the inquisitor skill itself, with no worker, and an `active` entry in its
  role's scope answers a question with no category
- **AND** the run ends in the Igor's handoff comment on the item
- **AND** the lore repository is no more visible than the repository of the item the run works
- **THEN** the Igor pushes a citation of that entry to the lore repository's `questions` branch

#### Scenario: The Igor's own inquisitor run makes no citation for a question with a category

- **WHEN** the Igor runs the inquisitor skill itself and an entry answers a question with a category
- **THEN** the Igor makes and pushes no citation for that question

#### Scenario: A run that publishes nothing pushes no citations

- **WHEN** a worker reports a citation
- **AND** the run publishes no artifact and does not end in the Igor's handoff comment
- **THEN** the Igor pushes no citation for that run
- **AND** the run's record counts that citation as from a run that published neither

#### Scenario: A citation takes the one citation-file format, with the run's id

- **WHEN** the Igor writes a citation to the `questions` branch
- **THEN** the file's path, its keys, and its commit's message, author, committer and date are
  those shared-skills #25's *A citation file has one format* sets for a citation an Igor pushes
  from a run
- **AND** its `run` is the run's id

#### Scenario: A search during a run reads only the Igor's lore store

- **WHEN** an agent searches lore during an Igor's run, whether directly or through the
  inquisitor's filter 1
- **AND** other lore repositories are configured for the inquisitor
- **THEN** the search reads only the lore store the Igor injects from

#### Scenario: A citation is checked against the store as the run read it

- **WHEN** a worker cites an entry that was `active` and in the run's role's scope when the run
  read the store
- **AND** that entry is deprecated or rescoped on the lore repository before the Igor pushes
- **THEN** the Igor still pushes the citation, if the run's other rules allow it

#### Scenario: A citation's run can be found from its run id

- **WHEN** a review reads a citation's run id
- **THEN** the run's row in the execution ledger on the state branch holds the same id, with
  the run's item, time and outcome

#### Scenario: A missing questions branch is created as an orphan

- **WHEN** the Igor pushes a citation and the lore repository has no `questions` branch
- **THEN** it creates the branch with no history shared with any other branch

#### Scenario: A push that loses a race is retried

- **WHEN** the Igor's push of a citation is rejected because the `questions` branch moved
- **AND** it has retried that push fewer than three times
- **THEN** it pushes the citation again on the branch's new tip

#### Scenario: A push that keeps losing the race is counted as failed

- **WHEN** the Igor's third retry of a citation's push is rejected because the `questions`
  branch moved
- **THEN** it does not retry again
- **AND** the run's record counts one citation that could not be pushed

#### Scenario: A citation of an entry that cannot be cited is refused

- **WHEN** a worker reports a citation of an id that names no `active` entry whose scope covers
  the run's role
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused citation, without repeating its id or saying why

#### Scenario: A citation is not pushed somewhere more visible than its question

- **WHEN** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the repository of the item the run works is private and the lore repository is
  internal or public, or the item's repository is internal and the lore repository is public
- **THEN** the Igor does not push the citation
- **AND** the run's record counts one withheld citation

#### Scenario: The worker cannot choose the repository a question concerns

- **WHEN** a worker's output names a repository that a cited question concerns
- **THEN** the Igor ignores that name and judges visibility by the repository of the item the
  run works

#### Scenario: An unreadable visibility counts against pushing

- **WHEN** the Igor cannot read the visibility of the lore repository, or of the repository of
  the item the run works
- **THEN** it treats the lore repository as public and the item's repository as private

#### Scenario: A citation that cannot be pushed is counted

- **WHEN** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the Igor cannot push a citation to the `questions` branch
- **THEN** the run's record counts one citation that could not be pushed
