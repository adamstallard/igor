## MODIFIED Requirements

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

#### Scenario: Destination below the repository root refused

- **WHEN** the configured `destination` resolves to a subdirectory of a repository rather than to
  its root
- **THEN** the configuration fails to load
- **AND** the error names the path the destination sits at within that repository
- **AND** the error states that a store nested in a repository takes that repository's access,
  visibility and lifecycle, which is why the root is the only place a store may be
