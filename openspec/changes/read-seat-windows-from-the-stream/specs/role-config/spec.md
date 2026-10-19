## ADDED Requirements

### Requirement: A role's reserve is raised by inheritance and never lowered

A role file MAY declare `reserve`, as seat-budget's *A role may hold back more of a seat than the
seat does* defines it. A role's reserve SHALL be
raised by inheritance and never lowered. A role MAY declare a larger reserve than the one it
inherits from its parent or from `roles/org.yaml`, and SHALL NOT declare a smaller one:
configuration declaring a child reserve below its parent's SHALL be refused, naming both values and
the role each came from. A role declaring none SHALL take its parent's.

This runs the opposite way to `budget_share`, which a child may only lower. Each moves in the
direction that holds a role back: a lower share, a higher reserve. A role's reserve merges as a monotonic field of *Merge semantics differ by field kind*. How it combines with a
seat's reserve is seat-budget's *A role may hold back more of a seat than the seat does*.

#### Scenario: A child role may raise its inherited reserve

- **WHEN** `roles/org.yaml` declares a reserve of 0.2 and a role extending it declares 0.4
- **THEN** configuration is valid, and the role's reserve is 0.4

#### Scenario: A child role may not lower its inherited reserve

- **WHEN** a role's parent declares a reserve of 0.3 and the role declares 0.1
- **THEN** validation fails
- **AND** the refusal names both reserves and the role each came from

#### Scenario: A role declaring none inherits its parent's

- **WHEN** a role's parent declares a reserve of 0.3 and the role declares none
- **THEN** the role's reserve is 0.3

## MODIFIED Requirements

### Requirement: A role declares its sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `allow`,
`commands`, `budget_share`, `reserve`, and `reviewers`. Each `sources` entry MUST name a
`tracker` and carry that tracker's own query verbatim. Entries failing validation SHALL be
rejected rather than loaded.

`commands` names the shell commands a worker may run, and is the only thing that lets one
run anything at all. It is declared on the role and nowhere else: a worker that can edit
files can edit a settings file in the repository it is working, so an allowlist read from
there is one the worker can widen for itself.

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

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`, `reserve`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it. For `reserve` the restriction is a higher value.
- **Override** for settings (`seat`, poll interval, settle interval, cooldown): the most specific
  level wins.
- **Append** for `instructions` and `lane`: levels accumulate, with lane constraints conjoined.

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
