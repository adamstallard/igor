## 1. Project setup

- [x] 1.1 Initialize a TypeScript project with `package.json`, `tsconfig.json`, and a CLI entry point
- [x] 1.2 Add dependencies: YAML frontmatter parsing and glob matching
- [x] 1.3 Implement config loading for the lore destination and the store-level `reviewers` list
- [x] 1.4 Refuse to start when no destination is configured, or when it resolves inside Igor's own repository

## 2. Entry schema

- [x] 2.1 Define the entry type: `id`, `claim`, `scope`, `status`, `conditions` (`paths`, `prose`), `provenance`, `supersedes`, `reviewed`
- [x] 2.2 Implement validation rejecting missing required fields and unrecognized `scope` or `status` values
- [x] 2.3 Reject `support` and `recency` as stored fields, since both are derived
- [x] 2.4 Verify `scope: role:<name>` validates with no role definitions present anywhere — scope is a label, not a reference
- [x] 2.5 Accept provenance items that carry `author` and `at` with no `url`, while still rejecting empty provenance

## 3. Identity and storage

- [x] 3.1 Implement id generation as a kebab slug derived from the claim, with a numeric discriminator on collision
- [x] 3.2 Implement read and write at `<destination>/entries/<id>.md`, frontmatter plus body
- [x] 3.3 Verify the id does not change when a claim is later edited, and that `supersedes` pointers still resolve
- [x] 3.4 Implement supersession resolution: a reference to a superseded entry resolves to its replacement

## 4. Derived scoring

- [x] 4.1 Compute support count from the number of provenance items
- [x] 4.2 Compute recency as exponential decay over provenance dates, with a configurable half-life
- [x] 4.3 Compute author weighting from provenance authors and configured expert designations
- [x] 4.4 Verify recency recomputes lower on a later date with no change to the file

## 5. CLI

- [x] 5.1 Implement `create`: scaffold a well-formed entry from a claim, assign the id, write the file
- [x] 5.2 Implement `validate`: report every invalid entry with its reason, exit non-zero on any failure
- [x] 5.3 Implement `list`: show entries with derived support and recency
- [x] 5.4 Verify a created entry passes validation with no further editing

## 6. First real store

- [ ] 6.1 Hand-author a seed store of conventions already known, using the CLI
- [ ] 6.2 Read the result end to end and note what the schema made awkward to express
- [ ] 6.3 Record the seed workflow and any schema friction in the README
