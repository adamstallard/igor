## MODIFIED Requirements

### Requirement: Roles inherit an org-level base of the same shape

A role SHALL inherit from the base named in `extends`, defaulting to the org-level base. A base
SHALL use the identical file shape, so intermediate bases are possible without a second
artifact type.

`extends` SHALL name at most one base. A role naming two or more SHALL be refused, naming the
bases and saying how to build a role that spans several areas: give it its own lane and its own
`allow` and `commands`, and share what roles have in common through an intermediate base.

A role with two bases would take whatever both allow, so a change to either base would change
what it may do without its own file or its single line of ancestors changing, and nobody
reviewing that change would see the role it widened. Two bases would also have to be reconciled
on every field where the last level wins, such as `poll_minutes`. With one base, a role's own file
and its ancestors say all it may do.

#### Scenario: Org base inherited

- **WHEN** a role extends the org base and declares no poll interval of its own
- **THEN** the org base's poll interval applies

#### Scenario: Intermediate base composed

- **WHEN** a role extends a base that itself extends the org base
- **THEN** values resolve through the whole chain

#### Scenario: Two bases refused

- **WHEN** a role declares `extends: [backend, frontend]`
- **THEN** the role is refused, naming both bases
- **AND** the refusal says to give a role spanning both areas its own lane and permissions,
  extending a shared base

#### Scenario: A role spanning two areas through one base

- **WHEN** `fullstack` extends `engineering`, which extends the org base, and declares a lane
  covering both the frontend and backend paths, with its own `allow` and `commands`
- **THEN** the role loads
- **AND** a later change to a `frontend` role extending `engineering` does not change what
  `fullstack` may do

### Requirement: A role declares sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `allow`,
`commands`, `budget_share`, and `reviewers`. Each `sources` entry MUST name a
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

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`, `send`. A role
that lists any other word is refused at load, naming the valid actions. The safe default an org
base should ship with is `[draft-pr, comment]` — everything reversible, nothing final.

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

## ADDED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. A person reading a
claim sees which role took the item, and hands work to a role by naming it. Igors of different
roles MAY draw on the same seat, since a seat is capacity and not an identity.

Processes running the same role under the same identity are one Igor and are interchangeable.

#### Scenario: Two roles are two Igors

- **WHEN** an organization wants backend and frontend work done
- **THEN** it runs a `backend` Igor and a `frontend` Igor, each with its own identity
- **AND** both may reference the same seat

#### Scenario: A claim names the role

- **WHEN** an Igor claims an item
- **THEN** the identity in the holder field, or the `igor:<role>` label, names that Igor's role

#### Scenario: More processes of one role are one Igor

- **WHEN** three processes run the `backend` role under the `backend` identity
- **THEN** they are one Igor
- **AND** a claim made by any of them names the same identity

## REMOVED Requirements

### Requirement: A completion action must be permitted by `allow`

**Reason**: A role no longer names a completion action. Under label claiming a finished run always
releases its claim, which is what the default action did, and `close` and `assign` existed only to
be refused (Adam, 2026-10-11). With no action to choose, there is no choice for `allow` to bound.
*A claim that cannot be kept is given back, out loud* in `work-claiming` says a finished run
releases its claim.

**Migration**: Delete `completion` from role files. A role file that still sets it is refused as
any key that is not a role key is.
