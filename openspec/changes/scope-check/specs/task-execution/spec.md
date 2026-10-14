## ADDED Requirements

### Requirement: A pull request states which changed paths its item does not name

Before opening a new pull request, execution SHALL compare every path the artifact carries,
written or removed, with the paths its item names, and SHALL state the result in the pull request
body and in the run's record. The comparison follows these rules alone, with no model call.

A path is **named** when any of these holds:

- the item's title or body names it as a file;
- the item's title or body names a directory (written with a trailing `/`) or a glob that it falls
  under. A directory or glob whose first segment is not literal, such as `**/*.ts` or `/`, names
  nothing;
- the item's title or body contains, as a whole word, the directory name of an OpenSpec capability
  under `openspec/specs/` or of an open change under `openspec/changes/` (not `archive`), in the
  working tree as it was before the worker ran, and the path is in that directory or is named, by
  the first two rules, by a file in it;
- its file name has the same non-empty stem, the part before the first `.`, as a file that the
  item, or a file read under the third rule, names as a file.

The item's comments, and the role's `lane.paths.under`, name nothing.

The result SHALL be stated after the worker's summary, or the signed description where
`signed-publishing` (#153) applies, outside the summary's length limit, where `review-evidence`
(#190) places it: in the scope part of its table's Files changed row, or, before that change
ships, as one line in the order that change sets. The result is one of:

- **in scope**: every carried path is named;
- **outside**: the paths that are not named, each listed;
- **not checked**, with its reason: here, that the item names nothing, so no path is compared.
  *Under the two-gate workflow, scope follows the gate* adds reasons of its own.

The result SHALL NOT stop publishing, make the pull request a draft, or change who is asked to
review it.

Of the pushes onto an existing pull request, only gate two's is checked (*Under the two-gate
workflow, scope follows the gate*). Any other push, such as a resolution or a revision answering a
change request, is not checked, and leaves the pull request's last result in force. That run
records no scope result. Wherever the body is written again after that push, as
`review-evidence` (#190) and gate two each write it, it states the last
result recorded for the pull request, marked as from an earlier push, or, where none is recorded,
that no push to the pull request has been checked.

#### Scenario: A change inside what the item names

- **WHEN** an issue names `src/api/users.ts` and the artifact changes `src/api/users.ts` and
  `test/users.test.ts`
- **THEN** the pull request states that every changed path is in scope

#### Scenario: A change outside what the item names

- **WHEN** an issue names `src/api/users.ts` and the artifact also changes `src/auth.ts`
- **THEN** the pull request states that `src/auth.ts` is outside what the issue names
- **AND** it is opened exactly as it would have been without the check: the same draft status
  and the same reviewers

#### Scenario: An item that names an OpenSpec change

- **WHEN** an issue names the change `budget-pacing`, whose `tasks.md` names `src/budget.ts`, and
  the artifact changes `openspec/changes/budget-pacing/tasks.md` and `src/budget.ts`
- **THEN** both paths are in scope

#### Scenario: An item that names nothing

- **WHEN** an issue's title and body name no path, directory, glob, capability or change
- **THEN** the pull request states that scope was not checked, and lists no path as outside

#### Scenario: A glob that would cover everything

- **WHEN** an issue's body contains `**/*`
- **THEN** that glob names no path

#### Scenario: A resolution keeps the last result

- **WHEN** a pull request's last checked push found `src/auth.ts` outside what the issue names,
  and a run then publishes a resolution onto it
- **THEN** the run's record has no scope result
- **AND** where the body is written again, it states that `src/auth.ts` was outside, as found by
  an earlier push, and that this push was not checked

#### Scenario: The run's record carries the result

- **WHEN** a run opens a new pull request
- **THEN** its row in `executions.ndjson` records whether scope was checked and every path found
  outside it

### Requirement: Under the two-gate workflow, scope follows the gate

For a role whose `workflow` setting, after inheritance, is `two-gate` (the setting the change
`follow-the-two-gate-workflow`, #150, adds), each gate SHALL be checked against what that gate is
expected to change, in place of the named set alone.

**Gate one.** A pull request's own change is the one directory directly under
`openspec/changes/`, other than `archive`, that the artifact adds and the base does not hold.
Only paths in that directory are named. Every other carried path is outside, even one the item
names. Where the artifact adds no change directory, or more than one, scope SHALL be not checked,
and the result says which.

**Gate two.** Gate two's push onto the pull request SHALL be checked before it is published.
Every path that push carries is compared with what the item names, by the rules of *A pull
request states which changed paths its item does not name*, and with what the approved change
names. The approved change is the change directory, or directories, that the pull request
carried before gate two's worker ran. Each names every path in it, and every path that its
`tasks.md`, its `design.md` or a file under its `specs/` names by the first two of those rules, together with a
file sharing a named file's stem. The result is stated and recorded as for a new pull request.

A revision answering a change request, at either gate, is not checked.

#### Scenario: Gate one's own change is in scope

- **WHEN** a gate-one artifact adds `openspec/changes/rate-limits/proposal.md` and
  `openspec/changes/rate-limits/specs/api/spec.md`
- **THEN** both paths are in scope

#### Scenario: Gate one flags another change's files

- **WHEN** a gate-one artifact adds `openspec/changes/rate-limits/` and also edits
  `openspec/changes/budget-pacing/tasks.md`, which the issue names
- **THEN** `openspec/changes/budget-pacing/tasks.md` is outside

#### Scenario: Gate two is checked against the approved change

- **WHEN** the approved change's `tasks.md` names `src/budget.ts`, and gate two's push changes
  `src/budget.ts`, `test/budget.test.ts` and `src/auth.ts`, none of which the issue names
- **THEN** `src/auth.ts` is outside, and the other two are in scope

#### Scenario: A revision is not checked

- **WHEN** a gate-one revision answering a change request is pushed onto the pull request
- **THEN** the run records no scope result, and the pull request's last result stays in force

