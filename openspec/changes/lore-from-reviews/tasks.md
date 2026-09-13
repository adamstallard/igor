## 1. Project setup

- [ ] 1.1 Initialize a TypeScript project with `package.json`, `tsconfig.json`, and a CLI entry point
- [ ] 1.2 Add dependencies: GitHub API client, YAML parsing, glob matching, and a local embedding runtime
- [ ] 1.3 Implement config loading for lore path, repositories in scope, store-level `reviewers`, batch cap, recency half-life, substance thresholds, and embedding provider
- [ ] 1.4 Make config refuse to run when no repositories are listed, rather than defaulting to all accessible repositories

## 2. Verify the stick-detection premise

Do this before building anything that depends on it — if the data isn't there, the filter
design changes.

- [ ] 2.1 Against one real repository, determine whether the GitHub API exposes review comment line ranges and subsequent in-PR commit diffs well enough to detect whether a correction stuck
- [ ] 2.2 If insufficient, evaluate the Timeline API or per-comment position tracking, and pick an approach
- [ ] 2.3 Record the finding and chosen approach in `design.md`, replacing the corresponding open question

## 3. Lore store

- [ ] 3.1 Define the entry frontmatter type and a validator rejecting missing required fields, unrecognized `scope` or `status` values, and any stored `support` or `recency` field
- [ ] 3.2 Implement id generation as a kebab slug derived from the claim, with a numeric discriminator on collision
- [ ] 3.3 Implement entry read and write at `<lore-path>/entries/<id>.md`, with the id never changing on a claim edit
- [ ] 3.4 Implement derived scoring from provenance: support count, exponential recency decay by half-life, and author weighting
- [ ] 3.5 Verify `scope: role:<name>` validates with no role definitions present anywhere
- [ ] 3.6 Tests covering each validation rejection and the recomputation of recency across two dates

## 4. Review mining

- [ ] 4.1 Extract review comments for configured repositories, retaining body, author, file path, line range, permalink, and timestamp
- [ ] 4.2 Implement stick classification using the approach confirmed in 2.2, recording it as a per-comment signal rather than an include/exclude gate
- [ ] 4.3 Exclude bot and automated-reviewer authors by default, with named re-inclusion via config
- [ ] 4.4 Implement substance filtering on length, absence of reasoning, and nit markers, recording each exclusion and its reason
- [ ] 4.5 Resolve comment authors and apply expert weighting from config
- [ ] 4.6 Implement the processed-comment ledger
- [ ] 4.7 Verify a re-run over unchanged history produces no new candidates, and a re-run after new merges processes only new comments

## 5. Consolidation

- [ ] 5.1 Define a pluggable embedding provider interface and implement the local default
- [ ] 5.2 Implement clustering, and verify that two differently worded comments expressing the same rule land in one cluster while unrelated comments do not
- [ ] 5.3 Compute support count and recency weight per cluster as independent scores
- [ ] 5.4 Route clusters whose most recent comment exceeds the staleness threshold into the "did you stop doing this?" queue instead of the promotion queue
- [ ] 5.5 Draft candidates with claim, prose condition, scope label, and one provenance item per contributing comment
- [ ] 5.6 Derive `conditions.paths` from the common path pattern of a cluster's comments, omitting it when no pattern is shared
- [ ] 5.7 Deduplicate against existing entries, proposing an edit that appends provenance rather than a second entry
- [ ] 5.8 Enforce the batch cap by combined score, and block opening a new batch while a previous one has unresolved candidates

## 6. Review workflow

- [ ] 6.1 Group a batch by mined author and open exactly one pull request per author, assigned to them
- [ ] 6.2 Support accepting or declining each candidate independently within a pull request
- [ ] 6.3 Record declined candidates and their source comments so re-clustering cannot re-propose them
- [ ] 6.4 Implement non-response escalation to the store-level `reviewers` after the configured window, recording the original assignee as non-responding rather than declining
- [ ] 6.5 Handle departed authors: assign to store reviewers, phrase the claim as team convention, and keep provenance naming the original author
- [ ] 6.6 On approval, write the entry with `status: active`, a `reviewed` block, and provenance unmodified from the proposal

## 7. First real run

- [ ] 7.1 Run the full pipeline against one real repository and read the first batch by hand
- [ ] 7.2 Tune staleness, substance, and cluster-distance thresholds against what that batch actually produced
- [ ] 7.3 Record observed candidate quality and the tuned defaults in the README
