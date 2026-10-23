## ADDED Requirements

### Requirement: A role may opt into the two-gate workflow

A role file SHALL accept a `workflow` key whose value is one of a closed set, `one-gate` or
`two-gate`. An unset `workflow` SHALL mean `one-gate`, which is the behaviour of a role before
this key existed. `workflow` SHALL merge as a setting, with the most specific level winning. Any
other value SHALL be refused, naming the key and the accepted values. `role explain` SHALL show
the effective value and where it came from.

#### Scenario: A role opts in

- **WHEN** a role sets `workflow: two-gate`
- **THEN** its items are worked in two gates

#### Scenario: A role without the key behaves as before

- **WHEN** neither a role nor any base it extends sets `workflow`
- **THEN** its items are worked in one run, as before

#### Scenario: A role overrides its base

- **WHEN** the org base sets `workflow: two-gate` and a role sets `workflow: one-gate`
- **THEN** the role's effective workflow is `one-gate`

#### Scenario: An unknown workflow is refused

- **WHEN** a role sets `workflow: two-gates`
- **THEN** the role is refused, naming `workflow` and the accepted values

#### Scenario: The effective workflow is explainable

- **WHEN** a role inheriting `workflow` from its base is explained
- **THEN** the effective value is shown, with the level it came from
