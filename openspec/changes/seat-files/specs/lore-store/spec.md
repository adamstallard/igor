## MODIFIED Requirements

### Requirement: One command writes the files a lore repository needs

An `init` command SHALL write, into an existing repository, every file a lore repository needs
that Igor can write without knowing anything only the operator knows: the configuration, the
org-level role, one role stub, the merge-triggered reconciliation workflow, and the seat-notice
workflow (`seat-budget`'s *A pull request that changes a seat file mentions that seat's owner*).
Each SHALL be nameable as a target, so that one can be replaced by itself; the separate command
that wrote the reconciliation workflow alone SHALL be retired, because two ways to write one file
is one too many once `init` can write it alone.

The configuration SHALL be written at the **root of the enclosing repository** and SHALL set
`destination: .`, because the store is at its repository's root and a destination resolving
below it is refused — a scaffolder that writes its config into the working directory would
produce, from a subdirectory, a repository whose own config the loader rejects. `reviewers` and
`experts` SHALL be present as commented placeholders rather than as plausible values, since a
name nobody chose is worse than a blank the operator has to fill. A role stub's `sources` SHALL
likewise be commented: the tracker query is the operator's, and no default is guessable.

The org role SHALL ship a `commands` list that is the action space a worker cannot otherwise
reach. It SHALL carry:

- `git rm:*` and `git mv:*` — the only way to remove or rename a tracked file, since no file
  tool deletes. `git mv` stages both sides, so the change reads as a rename rather than as an
  unrelated add and delete.
- `git log:*`, `git show:*` and `git blame:*` — why the code is as it is.

It SHALL NOT carry:

- `rm:*` — unscoped, it reaches outside the repository, which `git rm` cannot.
- `git commit:*` or `git push:*` — the design is *worker edits, Igor publishes*. A worker that
  can push routes around every check the publishing path makes on its behalf.
- `node:*`, bare `npx:*`, `curl`, `sh` or `bash` — the worker's environment holds the seat's
  token, and each of these executes whatever it is handed.

It SHALL NOT carry `cat`, `grep` or `find`. `commands` governs Bash alone and the worker keeps
its own read, edit, write, grep and glob tools regardless, so such an entry grants nothing while
reading as though it does.

The command SHALL state, on success, what it did not do: the values only the operator can
supply — `reviewers`, `experts`, the seat files and the `seatKey` that decrypts them, and the
role's `sources` query — and the steps that are not files, namely branch protection and the
Actions bypass list. A setup command that reports success without saying it produced something not yet
runnable is how an operator finds out by watching nothing happen.

#### Scenario: A repository is initialized in one command

- **WHEN** `init` is run inside a repository that holds none of these files
- **THEN** the configuration, the org role, one role stub, the reconciliation workflow and the
  seat-notice workflow are all written
- **AND** the configuration sets `destination: .`

#### Scenario: The configuration lands at the repository root

- **WHEN** `init` is run from a subdirectory of the repository
- **THEN** the configuration is written at the repository's root rather than in the working
  directory
- **AND** the `destination: .` it sets therefore resolves to a root the store accepts

#### Scenario: One target replaced, the rest untouched

- **WHEN** a store's reconciliation workflow has been superseded by a newer shipped one, and the
  workflow is named as the target to overwrite
- **THEN** the workflow is replaced from what ships with Igor
- **AND** the configuration, the org role, the role stub and the seat-notice workflow are left
  exactly as they are, whether or not each is present

#### Scenario: Overwriting without naming a target

- **WHEN** an overwrite is asked for with no target named
- **THEN** the run refuses and says which targets can be named
- **AND** nothing is written

#### Scenario: The worker can remove, rename and read history

- **WHEN** an Igor runs under the org role as shipped
- **THEN** its worker may remove and rename tracked files through git, and may read the
  repository's history

#### Scenario: The worker cannot publish for itself

- **WHEN** an Igor runs under the org role as shipped
- **THEN** its worker may not commit or push
- **AND** it may not run an unscoped removal, nor an interpreter or fetcher that would execute
  what it was handed with the seat's token in its environment

#### Scenario: Placeholders are blank rather than plausible

- **WHEN** the written configuration and role stub are read
- **THEN** `reviewers`, `experts` and the stub's `sources` are present and commented, with no
  value that would load as though it had been chosen

#### Scenario: What one command cannot finish is said out loud

- **WHEN** `init` succeeds
- **THEN** it names the values only the operator can supply and the repository settings that
  are not files
- **AND** it does not report a runnable Igor
