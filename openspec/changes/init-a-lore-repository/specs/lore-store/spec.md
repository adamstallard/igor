## ADDED Requirements

### Requirement: One command writes the files a lore repository needs

An `init` command SHALL write, into an existing repository, every file a lore repository needs
that Igor can write without knowing anything only the operator knows: the configuration, the
org-level role, one role stub, and the merge-triggered reconciliation workflow. Each SHALL be
nameable as a target, so that one can be replaced by itself; the separate command that wrote the
workflow alone SHALL be retired, because two ways to write one file is one too many once `init`
can write it alone.

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
supply — `reviewers`, `experts`, the seat and where its token is read from, and the role's
`sources` query — and the steps that are not files, namely branch protection and the Actions
bypass list. A setup command that reports success without saying it produced something not yet
runnable is how an operator finds out by watching nothing happen.

#### Scenario: A repository is initialized in one command

- **WHEN** `init` is run inside a repository that holds none of these files
- **THEN** the configuration, the org role, one role stub and the reconciliation workflow are
  all written
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
- **AND** the configuration, the org role and the role stub are left exactly as they are, whether
  or not each is present

#### Scenario: Overwriting without naming a target

- **WHEN** an overwrite is asked for with no target named
- **THEN** the run refuses and says which targets can be named
- **AND** nothing is written

#### Scenario: The worker can remove, rename and read history

- **WHEN** an Igor runs under the org role as shipped, in a setup where a removal reaches the
  published artifact
- **THEN** its worker may remove and rename tracked files through git, and may read the
  repository's history

#### Scenario: Removal commands wait for removals to be publishable

- **WHEN** a removal a worker makes does not survive into the published artifact
- **THEN** the shipped `git rm:*` and `git mv:*` entries are commented
- **AND** a note beside them names what unlocks them

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

### Requirement: Initialization writes files and touches nothing outside them

The `init` command SHALL confine itself to writing files inside a repository that already
exists. It SHALL NOT create a repository, and where it is run outside one it SHALL refuse and
say so rather than making one: a scaffolding command that creates repositories is a different
and more dangerous tool, and creating one is already a command of the code host's.

It SHALL likewise refuse where the enclosing repository is Igor's own installation. A config
resolving inside Igor is refused whether or not a file is there, so writing one there produces
a repository that cannot load its own configuration — and it leaves a team's files in a tool
every team shares.

It SHALL NOT change branch protection, a ruleset, or a ruleset's bypass list. Those are
outward-facing repository settings, and a command whose job is writing files must not mutate
who may push to the default branch. It SHALL print what remains to be set by hand instead.

It SHALL NOT overwrite a file that is already there. Each existing target SHALL be skipped and
named, every other target SHALL still be written, and the run SHALL succeed — so a second run
after a role has been added is safe, and adds only what is missing.

**Overwriting SHALL be possible only for named targets.** A force option SHALL take the targets it
applies to, overwrite exactly those, and leave every other target untouched whether present or
absent. It SHALL refuse when given no target, rather than overwriting all four: replacing the
configuration, the org role, the role stub and the workflow together is starting over, which is a
deletion followed by a plain run, and it is not what someone reaches for a flag to do. Filling in
what is missing is what the plain run is for, so there is no unforced way to name a subset — a
narrowing that could not overwrite would either do nothing or duplicate the plain run.

#### Scenario: Run where there is no repository

- **WHEN** `init` is run outside any repository
- **THEN** it refuses, and says that creating the repository is not its job

#### Scenario: Run inside a clone of Igor

- **WHEN** `init` is run inside Igor's own installation
- **THEN** it refuses and writes nothing
- **AND** it says that the configuration describes one team while Igor is shared

#### Scenario: Repository settings are left alone

- **WHEN** `init` runs against a repository whose default branch is unprotected and whose
  ruleset has no Actions bypass
- **THEN** neither the protection nor the bypass list is changed
- **AND** both are named in what it prints as remaining

#### Scenario: A second run adds only what is missing

- **WHEN** `init` is re-run in a repository that already has the configuration and the org role
  but no workflow
- **THEN** the workflow is written
- **AND** the configuration and the org role are left as they are, and both are named as
  skipped
- **AND** the run succeeds rather than refusing at the first file it found

#### Scenario: Overwriting is explicit

- **WHEN** `init` is run with the force option in a repository that already holds these files
- **THEN** the files are overwritten
