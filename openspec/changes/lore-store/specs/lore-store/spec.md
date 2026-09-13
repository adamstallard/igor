## ADDED Requirements

### Requirement: Entry files are markdown with frontmatter, named by id

The store SHALL keep one markdown file per lore entry under a configurable path (default
`lore/entries/`), and the filename SHALL be the entry's `id` plus `.md`, so an entry is
locatable directly from a supersession pointer or a provenance reference.

#### Scenario: Entry written to disk

- **WHEN** an entry with id `use-query-hook-not-useeffect-fetch` is written
- **THEN** the file is created at `<lore-path>/entries/use-query-hook-not-useeffect-fetch.md`
- **AND** the file contains YAML frontmatter followed by a markdown body

#### Scenario: Entry located by id

- **WHEN** a supersession pointer references id `migrations-need-a-backfill-plan`
- **THEN** the referenced entry is resolvable by filename without scanning the store

### Requirement: Frontmatter conforms to a validated schema

Every entry's frontmatter MUST contain `id`, `claim`, `scope`, `status`, `conditions`,
`provenance`, `supersedes`, and `reviewed`. `conditions` MUST contain a `prose` string and
MAY contain a `paths` array of glob patterns. `scope` MUST be `global`, `role:<name>`, or
`project:<name>`. `status` MUST be `provisional`, `active`, or `deprecated`. Entries failing
validation SHALL be rejected rather than written.

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

### Requirement: Provenance is the sole source of derived scores

Each provenance item MUST carry `author` and `at`, and MUST carry `url` when it cites a mined
artifact. Support count, recency weight, and author weighting SHALL be computed from
provenance at read time. The store MUST NOT persist `support` or `recency` as frontmatter
fields.

#### Scenario: Support derived from provenance

- **WHEN** an entry has 14 provenance items
- **THEN** its support count reads as 14 without any stored field

#### Scenario: Recency recomputed as time passes

- **WHEN** the same entry is scored on two different dates with no change to its file
- **THEN** the later scoring yields a lower recency weight

#### Scenario: Stored score rejected

- **WHEN** an entry's frontmatter includes a `support` field
- **THEN** validation fails, because the field is derived rather than stored

### Requirement: Entries can be created, validated, and listed from a CLI

The store SHALL provide commands to create an entry, validate the store, and list its
contents. `create` SHALL scaffold a well-formed entry and assign its id. `validate` SHALL
report every invalid entry with its reason rather than stopping at the first. `list` SHALL
show entries with their derived support and recency.

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
- **THEN** each shows a support count and recency weight computed from provenance
- **AND** neither is read from a stored field

### Requirement: The lore destination is configured and bounded

The store SHALL read a configured **destination** — the repository and path entries are
written to — independently of anything else Igor is pointed at, so that knowledge derived
from one repository can be stored in another. The tool SHALL refuse to start when the
destination resolves inside Igor's own repository.

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
