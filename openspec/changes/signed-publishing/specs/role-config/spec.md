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
