# lore-store Specification

## Purpose
Hold a team's lore: the lessons it has learned, kept as markdown files in git, one entry per file,
at the root of a repository the team owns rather than Igor's own. An entry states a claim, the
scope it applies to, its review status, the conditions under which it applies, and its
provenance: the sources it rests on. This spec covers the entry format and its validation, ids
derived from the claim and then frozen, which repository the store may use, its configuration,
and the CLI that creates, validates and lists entries and sets up that repository. Reviewing
entries into force is `lore-review`; delivering them to a worker is `lore-firing`.
## Requirements
### Requirement: Entry files are markdown with frontmatter, named by id

The configured `destination`, which is required and has no default, SHALL be the root of the
repository that holds it, so the store's access and visibility are that repository's own. A
`destination` that resolves below that root SHALL be refused when the configuration is loaded.
The store SHALL keep one markdown file per lore entry in `<destination>/entries/`, named by the
entry's `id` plus `.md`.

#### Scenario: Entry written to disk

- **WHEN** an entry with id `use-query-hook-not-useeffect-fetch` is written
- **THEN** the file is created at `<destination>/entries/use-query-hook-not-useeffect-fetch.md`
- **AND** the file contains YAML frontmatter followed by a markdown body

#### Scenario: Entry located by id

- **WHEN** a supersession pointer references id `migrations-need-a-backfill-plan`
- **THEN** the referenced entry is resolvable by filename without scanning the store

### Requirement: Frontmatter conforms to a validated schema

Every entry's frontmatter MUST contain `id`, `claim`, `scope`, `status`, `conditions`,
`provenance`, and `supersedes`, and MUST contain `reviewed` when `status` is `active`.
`conditions` MUST hold a `prose` string and MAY hold `paths`, an array of globs. `scope` MUST be
`global`, `role:<name>` or `project:<name>`, and `status` `provisional`, `active` or
`deprecated`. The tool SHALL reject an invalid entry, not write it. A date anywhere in the
frontmatter MUST be accepted quoted or unquoted.

#### Scenario: Provisional entry needs no review block

- **WHEN** an entry with `status: provisional` and no `reviewed` block is validated
- **THEN** validation passes

#### Scenario: Active entry requires a review block

- **WHEN** an entry with `status: active` and no `reviewed` block is validated
- **THEN** validation fails naming `reviewed`

#### Scenario: Unquoted date accepted

- **WHEN** an entry's provenance carries an unquoted `at: 2026-09-13`
- **THEN** validation passes
- **AND** the value reads back as the string `2026-09-13`

#### Scenario: Valid entry accepted

- **WHEN** an entry with all required fields and a recognized `scope` and `status` is validated
- **THEN** validation passes and the entry is written

#### Scenario: Missing required field rejected

- **WHEN** an entry omits `provenance`
- **THEN** validation fails with an error naming the missing field
- **AND** no file is written

#### Scenario: Unrecognized scope rejected

- **WHEN** an entry declares `scope: team:frontend`
- **THEN** validation fails, because `team:` is not one of the recognized prefixes

### Requirement: Scope is a label, not a reference

`scope` SHALL be treated as a free label. A `role:<name>` scope MUST NOT require that a role
of that name exists anywhere, and validation MUST NOT attempt to resolve it.

#### Scenario: Role-scoped entry with no roles defined

- **WHEN** an entry declares `scope: role:frontend` and no role definitions exist in the repo
- **THEN** validation passes

### Requirement: Ids are derived from the claim and then immutable

An entry's `id` SHALL be generated at creation as a kebab-case slug derived from its `claim`.
Once assigned, the `id` MUST NOT change, including when the `claim` is later edited. When a
generated slug collides with an existing entry, a numeric discriminator SHALL be appended.

#### Scenario: Slug generated from claim

- **WHEN** an entry is created with the claim "Fetch data with the shared query hook rather than calling fetch inside useEffect"
- **THEN** its id is a kebab-case slug derived from that claim

#### Scenario: Claim reworded later

- **WHEN** an existing entry's `claim` is edited
- **THEN** its `id` is unchanged
- **AND** any entry whose `supersedes` references that id still resolves

#### Scenario: Slug collision

- **WHEN** a generated slug matches the id of an existing entry
- **THEN** a numeric discriminator is appended to produce a unique id

### Requirement: Entries may be authored directly, without mining

The store SHALL accept entries written by hand, with no mined provenance. A directly authored
entry SHALL record provenance as an authorship item carrying `author` and `at` and no `url`.
Mining is one way to populate lore, not a precondition for it.

#### Scenario: Hand-written entry accepted

- **WHEN** a person writes an entry directly with a provenance item of `{author, at}` and no
  `url`
- **THEN** validation passes and the entry is written

#### Scenario: Empty provenance rejected

- **WHEN** an entry carries no provenance items at all
- **THEN** validation fails, because an entry must record where it came from even when the
  answer is "someone wrote it"

### Requirement: Entries can be created, validated, and listed from a CLI

The store SHALL provide commands to create an entry, validate the store, and list its
contents. `create` SHALL scaffold a well-formed entry and assign its id. `validate` SHALL
report every invalid entry with its reason rather than stopping at the first. `list` SHALL
show entries with their derived support and the date of their newest evidence.

#### Scenario: Entry created from the CLI

- **WHEN** a person runs the create command with a claim
- **THEN** a well-formed entry file is written with an id derived from that claim
- **AND** the entry passes validation without further editing

#### Scenario: Validation reports every failure

- **WHEN** the store contains three invalid entries and validate is run
- **THEN** all three are reported with their reasons
- **AND** the command exits non-zero

#### Scenario: Listing shows derived scores

- **WHEN** entries are listed
- **THEN** each shows a support count and the newest provenance date, both computed
- **AND** neither is read from a stored field
- **AND** no time-decayed weight is shown, because none is computed

### Requirement: Configuration belongs to the team's repository, not the tool's

Configuration SHALL be located outside the Igor installation, and the tool SHALL refuse to
start when it is given a config path resolving inside it — whether or not a file is there.
Absent an explicit path, the tool SHALL search upward from the working directory, so running
it anywhere inside the destination repository requires no flags. An explicit path and an
environment variable SHALL override the search.

#### Scenario: Config found by searching upward

- **WHEN** the tool runs in a nested directory beneath a repository holding the config
- **THEN** the config is found without a flag

#### Scenario: Config inside the installation refused

- **WHEN** a config path resolves inside the Igor installation
- **THEN** the tool refuses and explains that configuration describes a team while Igor is
  shared
- **AND** the refusal does not depend on a file existing at that path

#### Scenario: No config anywhere above

- **WHEN** no config exists in the working directory or any parent
- **THEN** the error names the example file to copy and where it belongs

### Requirement: The lore destination is configured and bounded

The store SHALL read a configured **destination** — the repository that entries are written
to, at whose root the store sits — independently of anything else Igor is pointed at, so that
knowledge derived from one repository can be stored in another. The tool SHALL refuse to start
when the destination resolves inside Igor's own repository.

#### Scenario: Destination independent of other configuration

- **WHEN** the destination is configured as one repository and Igor is operating against
  others
- **THEN** entries are written to the configured destination
- **AND** no entry is written to a repository merely because it was operated against

#### Scenario: Destination inside the Igor installation refused

- **WHEN** the configured destination resolves inside the Igor tool's own repository
- **THEN** the run refuses to start
- **AND** the error states that lore belongs to the operating team, not to Igor

#### Scenario: Destination not configured

- **WHEN** no destination is configured
- **THEN** the run refuses rather than choosing one

#### Scenario: Destination below the repository root refused

- **WHEN** the configured `destination` resolves to a subdirectory of a repository rather than to
  its root
- **THEN** the configuration fails to load
- **AND** the error names the path the destination sits at within that repository
- **AND** the error states that a store nested in a repository takes that repository's access,
  visibility and lifecycle, which is why the root is the only place a store may be

### Requirement: Provenance is the sole source of support and authorship

Each provenance item MUST carry `author` and `at`, and MUST carry `url` when it cites a mined
artifact. Support count, author weighting, and the date of the newest provenance SHALL be
computed from provenance at read time. The store MUST NOT persist `support` as a frontmatter
field. A time-decayed weight SHALL NOT be derived.

#### Scenario: Support derived from provenance

- **WHEN** an entry has 14 provenance items
- **THEN** its support count reads as 14 without any stored field

#### Scenario: Newest evidence reported as a date

- **WHEN** an entry is listed
- **THEN** the date of its most recent provenance item is shown
- **AND** no decayed weight is derived from it

#### Scenario: Age does not diminish an entry

- **WHEN** two entries have equal support and differ only in the age of their provenance
- **THEN** neither is ranked above the other on that basis

#### Scenario: Stored score rejected

- **WHEN** an entry's frontmatter includes a `support` field
- **THEN** validation fails, because the field is derived rather than stored

### Requirement: The config file refuses a key nobody reads

The config SHALL refuse a key outside the set it reads, naming the offending key and the
accepted ones, and SHALL do so before reporting a required key missing.

#### Scenario: An unreadable key is named

- **WHEN** the config names a key the tool does not read
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: A misspelt required key reads as a typo, not an absence

- **WHEN** `destination` is misspelt
- **THEN** the refusal names the misspelling rather than reporting the destination missing

### Requirement: One command writes the files a lore repository needs

An `init` command SHALL write, into an existing repository, every file a lore repository needs that
Igor can write without what only the operator knows: the configuration, the org-level role, one role
stub, and the merge-triggered reconciliation workflow. Each SHALL be nameable as a target of the
force option, so no separate command SHALL write the workflow alone.

The configuration SHALL be written at the **root of the enclosing repository** and SHALL set
`destination: .`.

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

#### Scenario: Placeholders are blank rather than plausible

- **WHEN** the written configuration and role stub are read
- **THEN** `reviewers`, `experts` and the stub's `sources` are present and commented, with no
  value that would load as though it had been chosen

### Requirement: `init` ships a bounded org role

The org role `init` writes SHALL ship a `commands` list granting only what a worker's own read,
edit, write, grep and glob tools cannot do, carrying `git rm:*`, `git mv:*`, `git log:*`, `git
show:*` and `git blame:*`. It SHALL NOT carry `rm:*`, `git commit:*`, `git push:*`, `node:*`, bare
`npx:*` (one scoped to no package), `curl`, `sh`, `bash`, `cat`, `grep` or `find`.

#### Scenario: The worker can remove, rename and read history

- **WHEN** an Igor runs under the org role as shipped
- **THEN** its worker may remove and rename tracked files through git, and may read the
  repository's history

#### Scenario: The worker cannot publish for itself

- **WHEN** an Igor runs under the org role as shipped
- **THEN** its worker may not commit or push
- **AND** it may not run an unscoped removal, nor an interpreter or fetcher that would execute
  what it was handed with the seat's token in its environment

### Requirement: `init` names what it leaves undone

On success, `init` SHALL name the values only the operator can supply (`reviewers`, `experts`,
the seat and its token source, the role's `sources` query) and the steps that are not files
(branch protection, and GitHub Actions on the ruleset's bypass list).

#### Scenario: What one command cannot finish is said out loud

- **WHEN** `init` succeeds
- **THEN** it names the values only the operator can supply and the repository settings that
  are not files
- **AND** it does not report a runnable Igor

### Requirement: Initialization writes files and touches nothing outside them

The `init` command SHALL confine itself to writing files inside a repository that already
exists. It SHALL NOT create a repository, and where it is run outside one it SHALL refuse and
say so rather than making one. It SHALL likewise refuse where the enclosing repository is Igor's
own installation.

It SHALL NOT change branch protection, a ruleset, or a ruleset's bypass list. It SHALL print what
remains to be set by hand instead.

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

### Requirement: Initialization skips files already there and overwrites only named targets

`init` SHALL NOT overwrite a file that is already there. Each existing target SHALL be skipped
and named, every other target SHALL still be written, and the run SHALL succeed.

**Overwriting SHALL be possible only for named targets.** A force option SHALL take the targets
it applies to, overwrite exactly those, and leave every other target untouched whether present or
absent. It SHALL refuse when given no target. There is no unforced way to name a subset.

#### Scenario: A second run adds only what is missing

- **WHEN** `init` is re-run in a repository that already has the configuration and the org role
  but no workflow
- **THEN** the workflow is written
- **AND** the configuration and the org role are left as they are, and both are named as
  skipped
- **AND** the run succeeds rather than refusing at the first file it found

#### Scenario: Overwriting is explicit

- **WHEN** `init` is run with the force option naming some of its targets, in a repository that
  already holds these files
- **THEN** the named targets are overwritten, and only those

