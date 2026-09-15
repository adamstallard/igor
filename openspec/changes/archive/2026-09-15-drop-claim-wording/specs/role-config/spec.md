## MODIFIED Requirements

### Requirement: A role declares sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `completion`,
`allow`, `budget_share`, and `reviewers`. Each `sources` entry MUST name a `tracker`
and carry that tracker's own query verbatim. Entries failing validation SHALL be rejected
rather than loaded.

The claim message is not among them. It carries the stop instruction, which is the only notice
a reader gets that stopping is possible and permitted, so it is not an org's to replace.

#### Scenario: Well-formed role accepted

- **WHEN** a role declares a tracker source, a lane, standing instructions, a completion
  action, an allow list, and reviewers
- **THEN** validation passes and the role loads

#### Scenario: Unrecognized completion action rejected

- **WHEN** a role declares a `completion` value outside the recognized set
- **THEN** validation fails naming the field and the permitted values

#### Scenario: Source without a tracker rejected

- **WHEN** a `sources` entry omits `tracker`
- **THEN** validation fails, because a query cannot be dispatched without knowing who executes it

#### Scenario: Claim wording is not a role setting

- **WHEN** a role file sets `claim`
- **THEN** it does not become part of the effective role, and `role explain` does not report it

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `assign`, `unassign`,
`close`, `merge`, `send`. The safe default an org base should ship with is `[draft-pr, comment]` —
everything reversible, nothing final.

- **Monotonic** for permission-shaped fields (`allow`, `budget_share`, repositories and
  surfaces in reach): a role MAY restrict what it inherits and MUST NOT widen it.
- **Override** for settings (`completion`, poll interval): the most specific level wins.
- **Append** for `instructions` and `lane`: levels accumulate, with lane constraints conjoined.

#### Scenario: Role narrows a permission

- **WHEN** the org base allows `[draft-pr, comment]` and a role allows `[comment]`
- **THEN** the role's effective allow list is `[comment]`

#### Scenario: Role attempting to widen a permission is rejected

- **WHEN** the org base allows `[comment]` and a role allows `[draft-pr, comment]`
- **THEN** validation fails, because widening an inherited permission is self-escalation

#### Scenario: Setting overridden

- **WHEN** the org base sets `completion: unassign` and a role sets `completion: close`
- **THEN** the role's effective completion action is `close`

#### Scenario: Instructions accumulate

- **WHEN** both the org base and a role declare `instructions`
- **THEN** both texts apply to the worker

#### Scenario: Org lane exclusion is inescapable

- **WHEN** the org base excludes label `Human` and a role declares its own lane
- **THEN** the effective lane still excludes `Human`
- **AND** no role-level declaration can remove it, because lane constraints are conjoined
