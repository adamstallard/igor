## ADDED Requirements

### Requirement: A role declares the checks the loop runs

A role file SHALL accept `checks`, a list of exact command lines, and `check_minutes`, the time
limit for all of one run's checks.

`checks` SHALL accumulate down the inheritance chain: a role adds to what it inherits and cannot
remove any of it. Each effective check SHALL be a line the role's effective `commands` permits:
a `cmd:*` entry permits `cmd` with any arguments, and any other entry permits only that exact
line. A role with a check its `commands` does not permit SHALL be refused at load, naming the
check.

`check_minutes` SHALL default to 15, SHALL be at most 60, and the most specific level SHALL win.

#### Scenario: Checks accumulate

- **WHEN** the org base declares the check `npm test` and a role declares `npx tsc --noEmit`
- **THEN** the role's effective checks are `npm test` and `npx tsc --noEmit`

#### Scenario: A check the role may not run is refused

- **WHEN** the org base declares the check `npm test` and a role narrows `commands` to drop
  `npm test:*`
- **THEN** the role is refused at load, naming `npm test`

#### Scenario: The time limit is capped

- **WHEN** a role sets `check_minutes: 90`
- **THEN** the role is refused at load, naming the maximum of 60
