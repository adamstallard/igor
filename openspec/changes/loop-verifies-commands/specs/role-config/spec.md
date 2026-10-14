## ADDED Requirements

### Requirement: A role declares the checks the loop runs

A role file SHALL accept `checks`, a list of exact command lines, and `check_minutes`, the time
limit for all of one run's checks.

`checks` SHALL accumulate down the inheritance chain: a role adds to what it inherits and cannot
remove any of it. A check is run as its words, split on spaces, with no shell. A check holding a
shell operator, quote, backslash, `$`, backtick or newline SHALL be refused at load, naming it.
Each effective check SHALL be a line the role's effective `commands` permits: a `cmd:*` entry
permits `cmd` alone or followed by a space and arguments, and any other entry permits only that
exact line. A role with a check its `commands` does not permit SHALL be refused at load, naming
the check.

`check_minutes` SHALL default to 15. Every value set for it, at any level of the inheritance
chain, SHALL be a whole number from 1 to 60; a role whose chain sets any other value SHALL be
refused at load, naming the key. The most specific level, a role over the org base, SHALL win.

#### Scenario: Checks accumulate

- **WHEN** the org base declares the check `npm test` and a role declares `npx tsc --noEmit`
- **THEN** the role's effective checks are `npm test` and `npx tsc --noEmit`

#### Scenario: A check the role may not run is refused

- **WHEN** the org base declares the check `npm test` and a role narrows `commands` to drop
  `npm test:*`
- **THEN** the role is refused at load, naming `npm test`

#### Scenario: A shell line is refused

- **WHEN** a role permits `npm test:*` and declares the check `npm test && curl example.com`
- **THEN** the role is refused at load, naming the check

#### Scenario: The time limit defaults and is capped

- **WHEN** no level sets `check_minutes`
- **THEN** the effective limit is 15 minutes
- **AND** a role that sets `check_minutes: 90` is refused at load, naming `check_minutes`
