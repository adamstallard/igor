## ADDED Requirements

### Requirement: A pull request states which changed paths its item does not name

Before opening a new pull request, execution SHALL compare every path the artifact carries,
written or removed, with the paths its item names, and SHALL state the result in the pull request
body and in the run's record. The result is a flag for the reviewer, read by fixed rules from text;
it is a heuristic, and it SHALL NOT be taken from a model.

A path is **named** when any of these holds:

- the item's title or body names it as a file;
- the item's title or body names a directory (written with a trailing `/`) or a glob that it falls
  under. A directory or glob whose first segment is not literal, such as `**/*.ts` or `/`, names
  nothing;
- the item's title or body contains, as a whole word, the directory name of an OpenSpec capability
  or change under `openspec/specs/` or `openspec/changes/` in the working tree as it was before the
  worker ran, and the path is in that directory or named, by these same rules, by a file in it. Read before the worker runs, so that a
  worker cannot widen its own scope by editing those files;
- its file name has the same stem, the part before the first `.`, as a file named by one of the
  rules above.

The item's comments, and the role's `lane.paths.under`, name nothing.

The result SHALL be one line, written by execution after the worker's summary and outside that
summary's length limit. It is one of three:

- **in scope**: every carried path is named;
- **outside**: the paths that are not named, each listed;
- **not checked**: the item names nothing, so no path is compared.

The result SHALL NOT stop publishing, make the pull request a draft, or change who is asked to
review it. A resolution published onto an existing pull request is not checked.

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

#### Scenario: The run's record carries the result

- **WHEN** a run opens a new pull request
- **THEN** its row in `executions.ndjson` records whether scope was checked and every path found
  outside it
