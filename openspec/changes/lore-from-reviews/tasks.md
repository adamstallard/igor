## 1. Mining setup

Builds on the project and store delivered by `lore-store` — destination config, entry
schema, validation, and derived scoring all come from there and are not rebuilt here.

- [ ] 1.1 Add mining dependencies to the existing project: GitHub API client and an embedding runtime
- [ ] 1.2 Implement mining config: repositories in scope, embedding provider, batch cap, staleness threshold, and substance thresholds
- [ ] 1.3 Refuse to run when no repositories are listed, rather than defaulting to everything the credential can reach

## 2. Verify the stick-detection premise

Do this before building anything that depends on it — if the data isn't there, the filter
design changes.

- [x] 2.1 Against one real repository, determine whether the GitHub API exposes review comment line ranges and subsequent in-PR commit diffs well enough to detect whether a correction stuck — `position: null` ruled out, zero of 277 comments carried it
- [ ] 2.2 If insufficient, evaluate the Timeline API or per-comment position tracking, and pick an approach
- [ ] 2.3 Record the finding and chosen approach in `design.md`, replacing the corresponding open question

## 3. Review mining

- [ ] 3.1 Extract review comments for configured repositories, retaining body, author, file path, line range, permalink, and timestamp
- [ ] 3.2 Implement stick classification using the approach confirmed in 2.2, recording it as a per-comment signal rather than an include/exclude gate
- [ ] 3.3 Exclude bot and automated-reviewer authors by default, with named re-inclusion via config
- [ ] 3.4 Implement substance filtering on length, absence of reasoning, and nit markers, recording each exclusion and its reason
- [ ] 3.5 Resolve comment authors and apply expert weighting from config
- [ ] 3.6 Implement the processed-comment ledger
- [ ] 3.7 Verify a re-run over unchanged history produces no new candidates, and a re-run after new merges processes only new comments

## 4. Consolidation

- [ ] 4.1 Define a pluggable embedding provider interface and implement the local default
- [ ] 4.2 Implement clustering, and verify that two differently worded comments expressing the same rule land in one cluster while unrelated comments do not
- [ ] 4.3 Compute support count and recency weight per cluster as independent scores
- [ ] 4.4 Route clusters whose most recent comment exceeds the staleness threshold into the "did you stop doing this?" queue instead of the promotion queue
- [ ] 4.5 Draft candidates with claim, prose condition, scope label, and one provenance item per contributing comment
- [ ] 4.6 Derive `conditions.paths` from the common path pattern of a cluster's comments, omitting it when no pattern is shared
- [ ] 4.7 Deduplicate against existing entries, proposing an edit that appends provenance rather than a second entry
- [ ] 4.8 Enforce the batch cap by combined score, and block opening a new batch while a previous one has unresolved candidates

## 5. Review workflow

- [ ] 5.1 Group a batch by mined author and open exactly one pull request per author, assigned to them
- [ ] 5.2 Support accepting or declining each candidate independently within a pull request
- [ ] 5.3 Record declined candidates and their source comments so re-clustering cannot re-propose them
- [ ] 5.4 Implement non-response escalation to the store-level `reviewers` after the configured window, recording the original assignee as non-responding rather than declining
- [ ] 5.5 Handle departed authors: assign to store reviewers, phrase the claim as team convention, and keep provenance naming the original author
- [ ] 5.6 On approval, write the entry with `status: active`, a `reviewed` block, and provenance unmodified from the proposal

## 6. First real run

- [ ] 6.1 Run the full pipeline against one real repository and read the first batch by hand
- [ ] 6.2 Tune staleness, substance, and cluster-distance thresholds against what that batch actually produced
- [ ] 6.3 Record observed candidate quality and the tuned defaults in the README
