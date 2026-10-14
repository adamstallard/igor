## ADDED Requirements

### Requirement: A role declares the skills its worker uses

A role SHALL declare `skills: [<name>, …]`, the pinned skills its worker uses: the skills of the
`igor` plugin under `skills_dir` (#174), each loaded as `igor:<name>`. The org base MAY set
`skills` for every role, and a role MAY add to what it inherits. Inheritance SHALL add and
SHALL NOT remove: a role's effective list is every level's names together, so a skill the org
base requires cannot be dropped by a role.

A name that is not a skill installed under `skills_dir` SHALL be refused at load, naming it and
the installed skills. A misspelt name would otherwise turn a check off without a word.

A role that declares no `skills`, and inherits none, uses no pinned skill.

#### Scenario: The org base sets the list for every role

- **WHEN** the org base declares `skills: [prose]` and a role declares none
- **THEN** the role's effective `skills` is `[prose]`

#### Scenario: A role adds to what it inherits

- **WHEN** the org base declares `skills: [prose]` and a role declares `skills: [bug-hunter]`
- **THEN** the role's effective `skills` is `[prose, bug-hunter]`

#### Scenario: A role cannot drop an inherited skill

- **WHEN** the org base declares `skills: [prose]` and a role declares `skills: []`
- **THEN** the role's effective `skills` is still `[prose]`

#### Scenario: An unknown skill is refused

- **WHEN** a role declares `skills: [prose, bughunter]` and no skill `bughunter` is installed
  under `skills_dir`
- **THEN** loading the role fails, naming `bughunter` and the installed skills

## MODIFIED Requirements

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it.
- **Override** for settings (`seat`, poll interval, settle interval, cooldown): the most specific
  level wins.
- **Append** for `instructions`, `lane` and `skills`: levels accumulate, with lane constraints
  conjoined. A role may add to an appended list it inherits and never drop an entry from it.

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`, `send`. A role
that lists any other word is refused at load, naming the valid actions. The safe default an org
base should ship with is `[draft-pr, comment]` — everything reversible, nothing final.

#### Scenario: Role narrows a permission

- **WHEN** the org base allows `[draft-pr, comment]` and a role allows `[comment]`
- **THEN** the role's effective allow list is `[comment]`

#### Scenario: Role attempting to widen a permission is rejected

- **WHEN** the org base allows `[comment]` and a role allows `[draft-pr, comment]`
- **THEN** validation fails, because widening an inherited permission is self-escalation

#### Scenario: Role attempting to widen its commands is rejected

- **WHEN** the org base permits the command `npm test` and a role also declares `npm install`
- **THEN** validation fails, for the reason widening `allow` fails: a role that may give itself one
  command it was not given may give itself any, since nothing bounds which

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

#### Scenario: Skills accumulate down inheritance

- **WHEN** the org base declares `skills: [prose]` and a role declares `skills: [bug-hunter]`
- **THEN** the role's effective `skills` holds both, and the role cannot drop the org base's entry
