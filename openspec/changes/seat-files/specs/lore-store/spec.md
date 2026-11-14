## MODIFIED Requirements

### Requirement: One command writes the files a lore repository needs

An `init` command SHALL write each lore-repository file Igor can write without the operator: the
configuration, the org-level role, one role stub, the reconciliation workflow and the seat-notice
workflow. Each SHALL be nameable as a target; the command that wrote the reconciliation workflow
alone SHALL be retired. The configuration SHALL sit at the repository root and set `destination: .`.
The org role SHALL ship the `commands` its scenarios name. On success it SHALL say what it left
undone.

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
- **THEN** its `commands` carry `git rm:*`, `git mv:*`, `git log:*`, `git show:*` and
  `git blame:*`, so its worker may remove and rename tracked files through git, and may read the
  repository's history

#### Scenario: The worker cannot publish for itself

- **WHEN** an Igor runs under the org role as shipped
- **THEN** its `commands` carry none of `git commit:*`, `git push:*`, `rm:*`, `node:*`, `npx:*` with no package named, `curl`, `sh` or `bash`, so its worker may not commit or push
- **AND** it may not run an unscoped removal, nor an interpreter or fetcher that would execute
  what it was handed with the seat's token in its environment

#### Scenario: Reading tools are not listed as commands

- **WHEN** the org role as shipped is read
- **THEN** its `commands` carry no `cat`, `grep` or `find` entry

#### Scenario: The reconciliation workflow has one command that writes it

- **WHEN** the reconciliation workflow alone is to be written
- **THEN** `init` writes it, named as the target
- **AND** no separate command for writing it exists

#### Scenario: Placeholders are blank rather than plausible

- **WHEN** the written configuration and role stub are read
- **THEN** `reviewers`, `experts` and the stub's `sources` are present and commented, with no
  value that would load as though it had been chosen

#### Scenario: What one command cannot finish is said out loud

- **WHEN** `init` succeeds
- **THEN** it names the values only the operator can supply, namely `reviewers`, `experts`, the
  seat files, `seats/recipient.txt` and the `seatKey` that decrypts them, and the role's `sources` query, and the
  repository settings that are not files, namely branch protection and the Actions bypass list
- **AND** it does not report a runnable Igor

### Requirement: Initialization writes files and touches nothing outside them

`init` SHALL only write files inside an existing repository. It SHALL refuse, saying so, outside one or inside Igor's own installation, never creating one. It SHALL NOT change branch protection or rulesets, and SHALL print what remains to set by hand. It SHALL skip
and name each target already present, write the rest, and succeed. With a force option it SHALL overwrite exactly the targets it is given and write no other, refusing when given none; naming targets without it is not offered.

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
  and a role stub but neither workflow
- **THEN** the reconciliation workflow and the seat-notice workflow are written
- **AND** the configuration, the org role and the role stub are left as they are, and each is
  named as skipped
- **AND** the run succeeds rather than refusing at the first file it found

#### Scenario: Overwriting is explicit

- **WHEN** `init` is run with the force option naming the org role and the seat-notice workflow,
  in a repository that already holds all five files
- **THEN** those two files are overwritten, and the other three are left as they are

#### Scenario: A target the force option does not name is not written

- **WHEN** `init` is run with the force option naming only the org role, in a repository that
  holds the org role but not the role stub
- **THEN** the org role is overwritten
- **AND** the role stub is not written

#### Scenario: The force option given no target

- **WHEN** `init` is run with the force option and no target
- **THEN** it refuses, and nothing is written
