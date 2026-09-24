## MODIFIED Requirements

### Requirement: Entry files are markdown with frontmatter, named by id

The store SHALL live under the configured `destination`, which is required and has no default,
because lore belongs to the operating team and nothing in Igor can guess where that is. Beneath
the destination the store SHALL keep one markdown file per lore entry in `entries/`, and the
filename SHALL be the entry's `id` plus `.md`, so an entry is locatable directly from a
supersession pointer or a provenance reference.

#### Scenario: Entry written to disk

- **WHEN** an entry with id `use-query-hook-not-useeffect-fetch` is written
- **THEN** the file is created at `<destination>/entries/use-query-hook-not-useeffect-fetch.md`
- **AND** the file contains YAML frontmatter followed by a markdown body

#### Scenario: Entry located by id

- **WHEN** a supersession pointer references id `migrations-need-a-backfill-plan`
- **THEN** the referenced entry is resolvable by filename without scanning the store
