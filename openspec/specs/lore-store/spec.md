# lore-store Specification

## Purpose
TBD - created by archiving change lore-store. Update Purpose after archive.
## Requirements
### Requirement: Entry files are markdown with frontmatter, named by id

The store SHALL be at the root of its repository, under the configured `destination`, which is
required and has no default, because lore belongs to the operating team and nothing in Igor can
guess where that is. A `destination` that resolves below the root of its repository SHALL be
refused when the configuration is loaded. Beneath the destination the store SHALL keep one
markdown file per lore entry in `entries/`, and the filename SHALL be the entry's `id` plus
`.md`, so an entry is locatable directly from a supersession pointer or a provenance reference.

#### Scenario: Entry written to disk

- **WHEN** an entry with id `use-query-hook-not-useeffect-fetch` is written
- **THEN** the file is created at `<destination>/entries/use-query-hook-not-useeffect-fetch.md`
- **AND** the file contains YAML frontmatter followed by a markdown body

#### Scenario: Entry located by id

- **WHEN** a supersession pointer references id `migrations-need-a-backfill-plan`
- **THEN** the referenced entry is resolvable by filename without scanning the store

### Requirement: Frontmatter conforms to a validated schema

Every entry's frontmatter MUST contain `id`, `claim`, `scope`, `status`, `conditions`,
`provenance`, and `supersedes`. `reviewed` MUST be present when `status` is `active` and MAY
be absent otherwise, since a provisional entry has not been reviewed by definition.
`conditions` MUST contain a `prose` string and MAY contain a `paths` array of glob patterns.
`scope` MUST be `global`, `role:<name>`, or `project:<name>`. `status` MUST be `provisional`,
`active`, or `deprecated`. Entries failing validation SHALL be rejected rather than written.

Dates MUST be accepted whether or not they are quoted in the source YAML, because a person
authoring an entry will not quote them and a YAML parser turns an unquoted date into a
timestamp rather than a string.

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
field.

A time-decayed weight SHALL NOT be derived. Lore is mined from historical review comments and
is old by construction, so a decay curve reports an entire store as stale while saying nothing
about whether any lesson still holds — and it ranks lowest the entries that have held longest.
The date of the newest evidence is a fact a reader can act on; a decayed score is a judgment
presented as one.

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

Every key in this file turns something on. Dropped in silence, a misspelt one leaves the
operator with a file whose text says what they meant and a tool doing something else: no
reviewers where reviewers were named, provenance unguarded where `publicStore` was declared, a
destination reported as absent while it is on the page one letter wrong.

Order matters for that last one. "destination is required" over a file whose second line is
`destinaton: .` sends somebody looking for the key they can already see, so the spelling is
checked first and the requirement second.

#### Scenario: An unreadable key is named

- **WHEN** the config names a key the tool does not read
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: A misspelt required key reads as a typo, not an absence

- **WHEN** `destination` is misspelt
- **THEN** the refusal names the misspelling rather than reporting the destination missing

