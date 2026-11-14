## ADDED Requirements

### Requirement: A pull request states which changed paths its item does not name

Before opening a new pull request, execution SHALL compare every path the artifact carries, written
or removed, with the paths its item names, using only the rules of *What an item names* and no
model call, and SHALL state the result in the pull request body and the run's record: **in scope**
(every carried path is named), **outside** (each unnamed path listed), or **not checked**, with its
reason (the item names nothing, or a reason the two-gate requirements add).

#### Scenario: An item that names nothing

- **WHEN** an issue's title and body name no path, directory, glob, capability or change
- **THEN** the pull request states that scope was not checked, and lists no path as outside

#### Scenario: The run's record carries the result

- **WHEN** a run opens a new pull request
- **THEN** its row in `executions.ndjson` records whether scope was checked and every path found
  outside it

### Requirement: What an item names

A path SHALL be treated as **named** when the item's title or body names it as a file, or names a
directory (written with a trailing `/`) or glob that the path falls under, or when the next two
requirements name it. A directory or glob whose first segment is not literal, such as `**/*.ts` or
`/` (whose first segment is empty), names nothing. Nor do the item's comments or the role's
`lane.paths.under` name anything.

#### Scenario: A glob that would cover everything

- **WHEN** an issue's body contains `**/*`
- **THEN** that glob names no path

#### Scenario: Comments and lane paths name nothing

- **WHEN** an issue's title and body name `src/api/users.ts`, a comment on the issue names
  `src/auth.ts`, and the role's `lane.paths.under` covers `src/**`
- **AND** the artifact changes `src/api/users.ts` and `src/auth.ts`
- **THEN** `src/auth.ts` is outside: neither the item's comments nor the role's
  `lane.paths.under` name anything

### Requirement: Naming a capability or change names what its files name

A path SHALL be treated as named when the item's title or body contains, as a whole word, the
directory name of an OpenSpec capability under `openspec/specs/` or of an open change under
`openspec/changes/` (not `archive`), in the working tree as it was before the worker ran, and the
path is in that directory, or any file in that directory names the path by the file, directory and
glob rules of *What an item names*.

#### Scenario: An item that names an OpenSpec change

- **WHEN** an issue names the change `budget-pacing`, whose `tasks.md` names `src/budget.ts`, and
  the artifact changes `openspec/changes/budget-pacing/tasks.md` and `src/budget.ts`
- **THEN** both paths are in scope

### Requirement: A file sharing a named file's stem is named

A path SHALL also be treated as named when its file name has the same non-empty stem, the part
before the first `.`, as a file that the item names directly as a file, or that a file read under
*Naming a capability or change names what its files name* names as a file. A file in scope only
because a named directory holds it brings no file sharing its stem into scope.

#### Scenario: A change inside what the item names

- **WHEN** an issue names `src/api/users.ts` and the artifact changes `src/api/users.ts` and
  `test/users.test.ts`
- **THEN** the pull request states that every changed path is in scope

### Requirement: The scope result is stated in the evidence table's Files changed row

The scope result SHALL be stated in the scope part of the Files changed row of the evidence table
that `review-evidence` (#190) adds to the pull request body, in that row's wording, and nowhere
else in the body.

#### Scenario: The result appears only in the Files changed row

- **WHEN** a run opens a new pull request whose artifact changes a path its item does not name
- **THEN** the scope part of the evidence table's Files changed row lists that path as outside,
  in that row's wording
- **AND** no other part of the pull request body states the scope result

### Requirement: The scope result never blocks publishing

The scope result SHALL NOT stop publishing, make the pull request a draft, or change who is asked
to review it.

#### Scenario: A change outside what the item names

- **WHEN** an issue names `src/api/users.ts` and the artifact also changes `src/auth.ts`
- **THEN** the pull request states that `src/auth.ts` is outside what the issue names
- **AND** it is opened exactly as it would have been without the check: the same draft status
  and the same reviewers

### Requirement: A push that is not checked keeps the last scope result

Of pushes onto a pull request, only gate two's implementation push SHALL be checked. Any other,
such as a resolution or a revision answering a change request at either gate, records no scope
result, leaving the last in force. The evidence table built after it states the pull request's last
recorded result, marked as an earlier push's, or, where none is recorded, what *With no scope
result recorded, the table says so* requires.

#### Scenario: A resolution keeps the last result

- **WHEN** a pull request's last checked push found `src/auth.ts` outside what the issue names,
  and a run then publishes a resolution onto it
- **THEN** the run's record has no scope result
- **AND** if the body is written again after that push, it states that `src/auth.ts` was outside,
  as found by an earlier push, and that the resolution's push was not checked

#### Scenario: A revision is not checked

- **WHEN** a gate-one revision answering a change request is pushed onto the pull request
- **THEN** the run records no scope result, and the pull request's last result stays in force

### Requirement: With no scope result recorded, the table says so

When the evidence table built after a push that is not checked finds no scope result recorded for
the pull request, because no earlier push was checked or the record was lost, it SHALL state that
the push was not checked and no earlier result is recorded. It SHALL NOT state that no push was
checked, because it cannot tell those two causes apart.

#### Scenario: The record of earlier results is lost

- **WHEN** the record holding a pull request's earlier scope results has been lost, and a run then
  publishes a resolution onto it
- **THEN** the body states that the resolution's push was not checked and no earlier result is
  recorded
- **AND** it does not state that no push was checked

### Requirement: Under the two-gate workflow, scope follows the gate

For a role whose `workflow` setting, after inheritance from its base, is `two-gate` (added by
`follow-the-two-gate-workflow`, #150), each gate SHALL be checked against what it is expected to
change. At gate one, this replaces the named set. Only paths in the pull request's own change are
named: the one directory directly under `openspec/changes/`, other than `archive`, that the
artifact adds and the base lacks. With none or several, scope SHALL be not checked, and the result
says which.

#### Scenario: Gate one's own change is in scope

- **WHEN** a gate-one artifact adds `openspec/changes/rate-limits/proposal.md` and
  `openspec/changes/rate-limits/specs/api/spec.md`
- **THEN** both paths are in scope

#### Scenario: Gate one flags another change's files

- **WHEN** a gate-one artifact adds `openspec/changes/rate-limits/` and also edits
  `openspec/changes/budget-pacing/tasks.md`, which the issue names
- **THEN** `openspec/changes/budget-pacing/tasks.md` is outside

### Requirement: Gate two is checked against the item and the approved change

Gate two's push SHALL be checked before it is published, comparing every path it carries with what
the item and the approved change name. The approved change is whatever change directories the pull
request's diff held before gate two's worker ran. Each names: every path in it; every path its
`proposal.md`, `tasks.md`, `design.md` or a file under its `specs/` names, by the file, directory
and glob rules of *What an item names*; and every file sharing a stem with a file so named.

#### Scenario: Gate two is checked against the approved change

- **WHEN** the approved change's `tasks.md` names `src/budget.ts`, and gate two's push changes
  `src/budget.ts`, `test/budget.test.ts` and `src/auth.ts`, none of which the issue names
- **THEN** `src/auth.ts` is outside, and the other two are in scope

### Requirement: At gate two, scope is not checked only when nothing is named

At gate two, an item that names nothing SHALL NOT make the result not checked, because the approved
change is still compared. Where the pull request's diff held no change directory before gate two's
worker ran, so the approved change names nothing, and the item names nothing too, the result is not
checked, because nothing is named. Gate two's result is stated and recorded as for a new pull
request.

#### Scenario: Gate two with an item that names nothing

- **WHEN** an issue names nothing, and the approved change's `tasks.md` names `src/budget.ts`
- **AND** gate two's push changes `src/budget.ts` and `src/auth.ts`
- **THEN** scope is checked, not reported as not checked because the item names nothing
- **AND** `src/auth.ts` is outside, and `src/budget.ts` is in scope

#### Scenario: Gate two with nothing named

- **WHEN** an issue names nothing, and the pull request's diff held no change directory before
  gate two's worker ran, so the approved change names nothing
- **THEN** gate two's push is reported as not checked, because nothing is named
