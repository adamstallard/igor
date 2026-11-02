## MODIFIED Requirements

### Requirement: Merge semantics differ by field kind

Inheritance SHALL merge each field one of three ways. Monotonic, for `allow`, `commands`,
`budget_share`, `conversation_share` and repositories and surfaces within reach: a role MAY narrow
and MUST NOT widen what it inherits. Override, for `seat` and the poll, settle and cooldown
intervals: the most specific wins. Append, for `instructions` and `lane`: levels
accumulate.

`allow` is a closed set: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`,
`send`, `propose-lore`, `issue`.

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

#### Scenario: An action outside the vocabulary is refused

- **WHEN** a role's `allow` lists `unassign`
- **THEN** the role is refused at load, naming the valid actions

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

#### Scenario: The safe org base allows only what is reversible

- **WHEN** an organization writes its org base
- **THEN** the recommended `allow` is `[draft-pr, comment]`, everything reversible and nothing
  final

#### Scenario: Opening an issue is granted like any action

- **WHEN** the org base allows `[comment, issue]` and a role allows `[comment]`
- **THEN** the role may not open an issue

### Requirement: A role declares its sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `allow`,
`commands`, `budget_share`, `conversation_share`, and `reviewers`. Each `sources` entry MUST
name a `tracker` and carry that tracker's query verbatim; entries failing validation SHALL be
rejected. Only `commands` lets a worker run a shell command. It is read from the role alone,
since a worker could widen a list read from the repository it edits.

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

#### Scenario: A conversation share cannot exceed what is inherited

- **WHEN** the org base sets `conversation_share: 0.1` and a role sets `conversation_share: 0.3`
- **THEN** validation fails, as for any widened permission
