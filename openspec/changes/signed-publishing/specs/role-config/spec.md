## ADDED Requirements

### Requirement: A role declares the skills its worker uses

A role SHALL declare `skills: [<name>, …]`, the pinned skills its worker uses, named from the
skills of the `igor` plugin under `skills_dir` (#174). The list decides which skills the worker is
directed to use and which checks Igor's code makes on what it publishes. It does not decide what
loads: #174 loads every installed skill, as `igor:<name>`, for every role. The org base MAY set
`skills` for every role, and the list is inherited by appending, as *Merge semantics differ by
field kind* sets out.

A name that is not a skill installed under `skills_dir` SHALL be refused at load, naming it and
the installed skills.

Listing a skill does not add to `commands`. Whether it grants the skill's scripts beside
`commands`, as `signed-publishing`'s design proposes, is open (proposal, *For Adam*); until that is
decided, *A role declares its sources, lane, behaviour, permissions, and reviewers* stands as
written.

A role that declares no `skills`, and inherits none, uses no pinned skill.

#### Scenario: The org base sets the list for every role

- **WHEN** the org base declares `skills: [prose]` and a role declares none
- **THEN** the role's effective `skills` is `[prose]`

#### Scenario: A role cannot drop an inherited skill

- **WHEN** the org base declares `skills: [prose]` and a role declares `skills: []`
- **THEN** the role's effective `skills` is still `[prose]`

#### Scenario: An unknown skill is refused

- **WHEN** a role declares `skills: [prose, bughunter]` and no skill `bughunter` is installed
  under `skills_dir`
- **THEN** loading the role fails, naming `bughunter` and the installed skills

## MODIFIED Requirements

### Requirement: A role declares its sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `allow`,
`commands`, `budget_share`, `reviewers` and `skills`. Each `sources` entry MUST name a
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

#### Scenario: A role may declare its skills

- **WHEN** a role file declares `skills: [prose]`
- **THEN** the key is accepted, not refused as unknown


### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`, `send`. A role
that lists any other word is refused at load, naming the valid actions. The safe default an org
base should ship with is `[draft-pr, comment]` — everything reversible, nothing final.

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it.
- **Override** for settings (`seat`, poll interval, settle interval, cooldown): the most specific
  level wins.
- **Append** for `instructions`, `lane` and `skills`: levels accumulate, with lane constraints
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

#### Scenario: Skills accumulate down inheritance

- **WHEN** the org base declares `skills: [prose]` and a role declares `skills: [bug-hunter]`
- **THEN** the role's effective `skills` holds both, and the role cannot drop the org base's
  entry
