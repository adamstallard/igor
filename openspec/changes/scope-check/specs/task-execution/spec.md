## ADDED Requirements

### Requirement: A pull request states which changed paths its item does not name

Before opening a new pull request, execution SHALL compare every path the artifact carries, written
or removed, with the paths its item names, using only the rules of *What an item names* and no
model call, and SHALL state the result in the pull request body and the run's record: **in scope**
(every carried path is named), **outside** (each unnamed path listed), or **not checked**, with its
reason (the item names nothing, or a reason the two-gate requirements add).

#### Scenario: An item that names nothing

- **WHEN** a role not under the two-gate workflow works an issue whose title and body name no
  path, directory, glob, capability or change
- **THEN** the pull request states that scope was not checked, and lists no path as outside

#### Scenario: The same item and artifact always give the same result

- **WHEN** the same item and the same artifact are compared twice
- **THEN** both comparisons give the same result, and neither makes a model call

#### Scenario: The run's record carries the result

- **WHEN** a run opens a new pull request
- **THEN** its row in `executions.ndjson` records whether scope was checked and every path found
  outside it

### Requirement: What an item names

A path SHALL be treated as **named** when the item's title or body names it as a file (a token
with a `/` that ends in an extension, so `README.md` alone names nothing), or names a directory
(written with a trailing `/`) or glob the path falls under, or when the next two requirements name
it. A directory or glob whose first segment is not literal, such as `**/*.ts` or `/` (an empty
first segment), names nothing. Nor do the item's comments or the role's `lane.paths.under`.

#### Scenario: A named directory covers the paths under it

- **WHEN** an issue's body names `src/api/` and the artifact changes `src/api/users.ts`
- **THEN** `src/api/users.ts` is in scope

#### Scenario: A file name with no slash names nothing

- **WHEN** a role not under the two-gate workflow works an issue whose body names `README.md` and
  nothing else, and the artifact changes `README.md`
- **THEN** scope is not checked, because the item names nothing

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
directory name of a capability under `openspec/specs/` or an open change under `openspec/changes/`
(not `archive`), as the tree was before the worker ran, and the path is in that directory or is
named, by *What an item names*'s rules, in its scope files: a capability's `spec.md` and
`decisions.md`; a change's `proposal.md`, `tasks.md`, `design.md` and files under `specs/`.

#### Scenario: An item that names an OpenSpec change

- **WHEN** an issue names the change `budget-pacing`, whose `tasks.md` names `src/budget.ts`, and
  the artifact changes `openspec/changes/budget-pacing/tasks.md` and `src/budget.ts`
- **THEN** both paths are in scope

#### Scenario: A capability's decision record names source paths

- **WHEN** an issue names the capability `task-execution`, whose `decisions.md` has an entry with
  `Paths: src/execute.ts`, and the artifact changes `src/execute.ts`
- **THEN** `src/execute.ts` is in scope

#### Scenario: The worker cannot widen scope by editing a named change

- **WHEN** an issue names the change `budget-pacing`, and the worker adds `src/auth.ts` to that
  change's `tasks.md` and also changes `src/auth.ts`
- **THEN** `src/auth.ts` is outside, because the change's files are read as they were before the
  worker ran

### Requirement: A file sharing a named file's stem is named

A path SHALL also be treated as named when its file name has the same non-empty stem, the part
before the first `.`, as a file that the item names directly as a file, or that a file read under
*Naming a capability or change names what its files name* names as a file. A file in scope only
because a named directory holds it brings no file sharing its stem into scope.

#### Scenario: A change inside what the item names

- **WHEN** an issue names `src/api/users.ts` and the artifact changes `src/api/users.ts` and
  `test/users.test.ts`
- **THEN** the pull request states that every changed path is in scope

#### Scenario: A file held by a named directory brings in no stem

- **WHEN** an issue names `src/api/`, and the artifact changes `src/api/users.ts` and
  `test/users.test.ts`
- **THEN** `test/users.test.ts` is outside, because `src/api/users.ts` is in scope only through
  the directory

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
such as a resolution (a push that merges the base branch in) or a revision answering a change
request at either gate, records no scope result, leaving the last in force. The evidence table built after it states the pull request's last
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

For a role whose effective `workflow` setting is `two-gate` (#150's
`follow-the-two-gate-workflow`), each gate SHALL be checked against what it is expected to
change. At gate one, only paths in the pull request's own change are named, whatever the item
names: the one directory directly under `openspec/changes/`, other than
`archive`, that the artifact adds and the base lacks. With none or several, scope SHALL
be not checked, and the result says which.

#### Scenario: Gate one's own change is in scope

- **WHEN** a gate-one artifact adds `openspec/changes/rate-limits/proposal.md` and
  `openspec/changes/rate-limits/specs/api/spec.md`
- **THEN** both paths are in scope

#### Scenario: Gate one flags another change's files

- **WHEN** a gate-one artifact adds `openspec/changes/rate-limits/` and also edits
  `openspec/changes/budget-pacing/tasks.md`, which the issue names
- **THEN** `openspec/changes/budget-pacing/tasks.md` is outside

#### Scenario: Gate one checks its own change even when the item names nothing

- **WHEN** an issue names nothing, and a gate-one artifact adds
  `openspec/changes/rate-limits/proposal.md` and changes `src/auth.ts`
- **THEN** the proposal is in scope and `src/auth.ts` is outside

#### Scenario: Gate one with no change directory, or several

- **WHEN** a gate-one artifact adds no directory under `openspec/changes/`, or adds two
- **THEN** scope is not checked, and the result says whether none or several were added

### Requirement: Gate two is checked against the item and the approved change

Gate two's push SHALL be checked before it is published, comparing every path it carries with what
the item and the approved change name. The approved change is every change directory the pull
request's diff held before gate two's worker ran, all of them where there are several. Each names:
every path in it; every path its scope files name, as *Naming a capability or change names what its
files name* defines them; and every file sharing a stem with a file its scope files name as a file.

#### Scenario: Gate two is checked against the approved change

- **WHEN** the approved change's `tasks.md` names `src/budget.ts`, and gate two's push changes
  `src/budget.ts`, `test/budget.test.ts` and `src/auth.ts`, none of which the issue names
- **THEN** `src/auth.ts` is outside, and the other two are in scope

### Requirement: At gate two, scope is not checked only when nothing is named

At gate two, an item that names nothing SHALL NOT make the result not checked, because the approved
change is still compared. Where the pull request's diff held no change directory before gate two's
worker ran, so the approved change names nothing, and the item names nothing too, the result is not
checked. Gate two's result is stated and recorded as for a new pull request.

#### Scenario: Gate two with an item that names nothing

- **WHEN** an issue names nothing, and the approved change's `tasks.md` names `src/budget.ts`
- **AND** gate two's push changes `src/budget.ts` and `src/auth.ts`
- **THEN** scope is checked, not reported as not checked because the item names nothing
- **AND** `src/auth.ts` is outside, and `src/budget.ts` is in scope

#### Scenario: Gate two with nothing named

- **WHEN** an issue names nothing, and the pull request's diff held no change directory before
  gate two's worker ran, so the approved change names nothing
- **THEN** gate two's push is reported as not checked, because nothing is named

#### Scenario: Gate two's result is recorded like a new pull request's

- **WHEN** gate two's push is checked and finds `src/auth.ts` outside
- **THEN** the run's row in `executions.ndjson` records that scope was checked and that
  `src/auth.ts` is outside, and the Files changed row states it

### Requirement: Files read for scope follow no link

The Igor SHALL read each scope file of a capability or change as #175's *Every file read from the
worker is a regular file with one link* requires: opened without following a symbolic link, and read
only if it is a regular file with one link. A file that fails is not read, and names nothing.

#### Scenario: A symbolic link in a change directory is not followed

- **WHEN** the approved change's `tasks.md` is a symbolic link to a file outside the tree
- **THEN** the Igor does not follow it, and that file names nothing
