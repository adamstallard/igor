## ADDED Requirements

### Requirement: A role is a file whose name is its identity

A role SHALL be a YAML file under the destination's `roles/` directory, and its name SHALL be
the filename without extension. A role file MUST NOT carry a redundant `name` field.

#### Scenario: Role located by filename

- **WHEN** a role file exists at `roles/frontend.yaml`
- **THEN** the role is named `frontend`
- **AND** it is loadable by that name without scanning file contents

#### Scenario: Redundant name field rejected

- **WHEN** a role file declares a `name` field
- **THEN** validation fails, because the filename already carries identity

### Requirement: A role declares sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `completion`,
`claim`, `allow`, `budget_share`, and `reviewers`. Each `sources` entry MUST name a `tracker`
and carry that tracker's own query verbatim. Entries failing validation SHALL be rejected
rather than loaded.

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

### Requirement: Tracker queries pass through verbatim

A source's query SHALL be sent to the tracker unmodified. The system MUST NOT define a
canonical label, and MUST NOT translate a query between tracker syntaxes.

#### Scenario: Native syntax preserved

- **WHEN** a source declares a GitHub query of `is:issue is:open label:ai`
- **THEN** that exact string is sent to GitHub
- **AND** no rewriting or normalization is applied to it

#### Scenario: No canonical label imposed

- **WHEN** an organization marks eligible work with its own existing convention
- **THEN** that convention is expressible entirely through the query and lane
- **AND** no additional label is required for the system's benefit

### Requirement: Lane is declarative, never an expression language

`lane` SHALL be declarative constraints over normalized candidate fields — such as `labels`
with `includes` and `excludes`, `paths` with `under`, and `age` with `max_days`. It MUST NOT
support operators, boolean composition, or any syntax requiring a parser.

#### Scenario: Declarative constraints evaluated

- **WHEN** a lane declares `labels.includes: [ai]` and `labels.excludes: [Human]`
- **THEN** a candidate labelled `ai` and not `Human` matches
- **AND** a candidate labelled both does not match

#### Scenario: Expression syntax rejected

- **WHEN** a lane field contains an operator expression rather than declarative constraints
- **THEN** validation fails, because a role wanting boolean logic should be split instead

### Requirement: Roles inherit an org-level base of the same shape

A role SHALL inherit from bases named in `extends`, defaulting to the org-level base. A base
SHALL use the identical file shape, so intermediate bases are possible without a second
artifact type.

#### Scenario: Org base inherited

- **WHEN** a role extends the org base and declares no completion action of its own
- **THEN** the org base's completion action applies

#### Scenario: Intermediate base composed

- **WHEN** a role extends a base that itself extends the org base
- **THEN** values resolve through the whole chain

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `assign`, `unassign`,
`close`, `merge`, `send`. The safe default an org base should ship with is `[draft-pr, comment]` —
everything reversible, nothing final.

- **Monotonic** for permission-shaped fields (`allow`, `budget_share`, repositories and
  surfaces in reach): a role MAY restrict what it inherits and MUST NOT widen it.
- **Override** for settings (`completion`, `claim`, poll interval): the most specific level wins.
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

### Requirement: The effective configuration of a role is explainable

The system SHALL provide a command reporting a role's effective merged configuration,
annotating each value with the level it came from.

#### Scenario: Effective config reported with provenance

- **WHEN** a role inheriting from an org base is explained
- **THEN** every effective value is shown
- **AND** each is annotated with whether it came from the role, a base, or a default

### Requirement: A role can be dry-run without acting

The system SHALL provide a command that runs discovery and triage for a role over recent items
and reports what it *would* have claimed and why. A dry run MUST NOT claim, post, or write to
any surface.

#### Scenario: Dry run reports decisions without acting

- **WHEN** a role is dry-run against a tracker
- **THEN** each candidate considered is reported with its triage outcome and reason
- **AND** no claim, comment, or assignment is made on any surface

#### Scenario: Dry run surfaces a mis-scoped lane

- **WHEN** a lane predicate is wrong such that out-of-scope items would be claimed
- **THEN** those items appear in the dry run output
- **AND** the mistake is visible before anything is posted publicly

### Requirement: A completion action must be permitted by `allow`

`completion` names an action — `unassign`, `close`, or `assign` — and that action MUST appear
in the role's effective `allow`. Otherwise completion is a permission bypass: a role forbidden
from closing could close by naming it as its completion behaviour.

#### Scenario: Completion outside allow is rejected

- **WHEN** a role sets `completion: close` and its effective `allow` omits `close`
- **THEN** validation fails

#### Scenario: Default completion requires its permission

- **WHEN** a role relies on the default `completion: unassign`
- **THEN** `unassign` must be present in its effective `allow`

### Requirement: Timing values are configurable with stated defaults

Every interval SHALL be configurable and SHALL have a default, since an unstated default is a
value someone guesses differently each time: a **settle interval** of 10 seconds before a claim
is verified, and a **cooldown** of 1 hour before a stopped item returns to the pool.

These are starting points to tune against observation, not derived values, and SHALL be
recorded as such rather than presented as considered.

#### Scenario: Default applied when unset

- **WHEN** a role does not set the settle interval
- **THEN** the inherited or default value is used
- **AND** the effective value is visible via `role explain`

