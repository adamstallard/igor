## ADDED Requirements

### Requirement: A role may opt into the two-gate workflow

A role file SHALL accept a `workflow` key whose value is one of a closed set, `one-gate` or
`two-gate`. An unset `workflow` SHALL mean `one-gate`, where each item is worked in one run that
publishes one artifact. `workflow` SHALL merge as a setting, with the most specific level winning. Any
other value SHALL be refused, naming the key and the accepted values. `role explain` SHALL show
the effective value and where it came from.

#### Scenario: A role opts in

- **WHEN** a role sets `workflow: two-gate`
- **THEN** its items are worked in two gates

#### Scenario: A role without the key behaves as before

- **WHEN** neither a role nor any base it extends sets `workflow`
- **THEN** its items are worked in one run

#### Scenario: A role overrides its base

- **WHEN** the org base sets `workflow: two-gate` and a role sets `workflow: one-gate`
- **THEN** the role's effective workflow is `one-gate`

#### Scenario: An unknown workflow is refused

- **WHEN** a role sets `workflow: two-gates`
- **THEN** the role is refused, naming `workflow` and the accepted values

#### Scenario: The effective workflow is explainable

- **WHEN** a role inheriting `workflow` from its base is explained
- **THEN** the effective value is shown, with the level it came from

## MODIFIED Requirements

### Requirement: A role declares its sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `allow`,
`commands`, `budget_share`, `reviewers`, and `workflow`. Each `sources` entry MUST name a
`tracker` and carry that tracker's own query verbatim. Entries failing validation SHALL be
rejected rather than loaded.

`commands` names the shell commands a worker may run, and is the only thing that lets one
run anything at all. It is declared only in role files and their bases, never in the repository
the worker is working.

#### Scenario: Well-formed role accepted

- **WHEN** a role declares a tracker source, a lane, standing instructions, an allow list, and
  reviewers
- **THEN** validation passes and the role loads

#### Scenario: Declared commands bound what the worker may run

- **WHEN** a role declares `commands` and an item is executed
- **THEN** the worker may run those commands and nothing else

#### Scenario: Source without a tracker rejected

- **WHEN** a `sources` entry omits `tracker`
- **THEN** validation fails, because a query cannot be dispatched without knowing who executes it

#### Scenario: A role declaring its workflow loads

- **WHEN** a role declares `workflow: two-gate`
- **THEN** validation passes and the role loads

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it.
- **Override** for settings (`seat`, `workflow`, poll interval, settle interval, cooldown): the most specific
  level wins.
- **Append** for `instructions` and `lane`: levels accumulate, with lane constraints conjoined.

#### Scenario: Role narrows a permission

- **WHEN** the org base allows `[draft-pr, comment]` and a role allows `[comment]`
- **THEN** the role's effective allow list is `[comment]`

#### Scenario: Role attempting to widen a permission is rejected

- **WHEN** the org base allows `[comment]` and a role allows `[draft-pr, comment]`
- **THEN** validation fails, because widening an inherited permission is self-escalation

#### Scenario: Role attempting to widen its commands is rejected

- **WHEN** the org base permits the command `npm test` and a role also declares `npm install`
- **THEN** validation fails, for the reason widening `allow` fails: a role that can grant
  itself a command can grant itself every command

#### Scenario: Setting overridden

- **WHEN** the org base sets `poll_minutes: 10` and a role sets `poll_minutes: 2`
- **THEN** the role's effective poll interval is 2 minutes

#### Scenario: Instructions accumulate

- **WHEN** both the org base and a role declare `instructions`
- **THEN** both texts apply to the worker

#### Scenario: Org lane exclusion is inescapable

- **WHEN** the org base excludes label `Human` and a role declares its own lane
- **THEN** the effective lane still excludes `Human`
- **AND** no role-level declaration can remove it, because lane constraints are conjoined
