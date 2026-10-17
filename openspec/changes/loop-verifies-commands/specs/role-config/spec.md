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

## MODIFIED Requirements

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`, `send`. A role
that lists any other word is refused at load, naming the valid actions. The safe default an org
base should ship with is `[draft-pr, comment]` — everything reversible, nothing final.

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it.
- **Override** for settings (`seat`, poll interval, settle interval, cooldown, `check_minutes`):
  the most specific level wins.
- **Append** for `instructions`, `lane` and `checks`: levels accumulate, with lane constraints
  conjoined. A role may add to an appended list it inherits and never drop an entry from it.

#### Scenario: Role narrows a permission

- **WHEN** the org base allows `[draft-pr, comment]` and a role allows `[comment]`
- **THEN** the role's effective allow list is `[comment]`

#### Scenario: Role attempting to widen a permission is rejected

- **WHEN** the org base allows `[comment]` and a role allows `[draft-pr, comment]`
- **THEN** validation fails, because widening an inherited permission is self-escalation

#### Scenario: Role attempting to widen its commands is rejected

- **WHEN** the org base permits the command `npm test` and a role also declares `npm install`
- **THEN** validation fails, for the reason widening `allow` fails: a role that can grant
  itself a command can grant itself every command, since only an exact match can be checked
  without a pattern matcher, and a matcher that lets one wider pattern through also lets `*`
  through

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

#### Scenario: Checks accumulate down inheritance

- **WHEN** the org base declares the check `npm test` and a role declares `npx tsc --noEmit`
- **THEN** the role's effective `checks` is `npm test` then `npx tsc --noEmit`
