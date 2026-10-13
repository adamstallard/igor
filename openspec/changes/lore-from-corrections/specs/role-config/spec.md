## MODIFIED Requirements

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`, `send`,
`propose-lore`. A role that lists any other word is refused at load, naming the valid actions.
The safe default an org base should ship with is `[draft-pr, comment]` — everything reversible,
nothing final.

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it.
- **Override** for settings (`seat`, poll interval, settle interval, cooldown): the most specific
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
