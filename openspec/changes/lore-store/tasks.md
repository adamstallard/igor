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
- [ ] 5.5 Let `create` take more than one provenance item — a mined entry normally cites several comments, and the command currently cannot express that

## 6. Propose and review

- [x] 6.1 Group candidates by dominant author, breaking an equal split toward the later contribution
- [x] 6.2 Open one pull request per dominant author on a prefixed branch, via the git tree API so nothing is cloned
- [x] 6.3 Write the review contract into the pull request body with each candidate's claim, conditions, and provenance links
- [x] 6.4 Credit other contributing authors by plain name and request them as reviewers, never by @mention
- [x] 6.5 Read assignment back and fall back to the store reviewers when the dominant author is not a collaborator
- [x] 6.6 Refuse privately-sourced provenance when the destination is public, with visibility declarable in config
- [x] 6.7 Reconcile on invocation: promote merged entries with a reviewed block, report rejections and quiet pull requests
- [x] 6.8 Treat closed-unmerged as deferred rather than rejected
- [ ] 6.9 *(optional)* Record rejections durably. Largely covered by the processed-comment ledger in `lore-from-reviews`: a comment never reprocessed cannot re-form its cluster. Only adds value if the ledger is lost, or to suppress a rule regardless of new evidence — which is a stronger claim than a deletion should make
- [x] 6.10 Ship a merge-triggered workflow template plus an `init-workflow` command, so promotion does not depend on someone having igor installed
- [x] 6.11 Report when the merger was not an assigned reviewer rather than recording them silently
- [x] 6.12 Document lore repository setup: require-a-pull-request but never require-approvals, and the Actions bypass entry a protected branch needs

## 7. First real store

- [ ] 6.1 Hand-author a seed store of conventions already known, using the CLI
- [ ] 6.2 Read the result end to end and note what the schema made awkward to express
- [ ] 6.3 Record the seed workflow and any schema friction in the README
