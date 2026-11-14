# work-discovery: constraints, rejected alternatives and rationale

## Rejected
- **Rejected: a state file per role instead of a composite key.**
  Facing: how to store one mark per role and source.
  Lost because: per-role files buy no concurrency, since a write to the state branch conflicts on that branch's ref whichever path it writes, and one file whose keys carry the role keeps the marks where `advance` already writes them, #242 (design, decision 9).
  Instead: one `discovery.json` whose keys carry the role.
  Paths: src/discovery.ts

- **Rejected: normalizing query strings so a reordered query keeps its mark.**
  Facing: `sourceKey` hashes the raw query string, so reordering a query starts its mark cold.
  Lost because: a normalizer would have to parse each tracker's query syntax, when Igor keeps no query language of its own (no DSL for remote queries), and all it would save is one bounded re-examination of a window that hides nothing from anybody, [docs/architecture.md](https://github.com/adamstallard/igor/blob/0c6e9f2/docs/architecture.md#L697)
  Instead: a reordered query costs one cold start, bounded by the look-back window.
  Paths: src/discovery.ts

## Rationale
- **Rationale: Watermarks reduce reconsideration without governing it.**
  A cycle that acted advances a role's mark past an item its lane rejected, as past any item triage skipped, because deciding not to act on an item is still having considered it. Holding the mark below anything a lane rejected would never advance a narrow role's mark: every cycle would re-fetch and re-screen the whole window, and the role whose lane rejects most of what its query returns would hold its mark at the oldest item it ever saw. Another role polling the same source finds the item through its own mark.
  Evidence: a held item pulls its source's mark back below the oldest held item, so a mark held below every lane rejection stops at the oldest one, https://github.com/adamstallard/igor/blob/0c6e9f2/src/discovery.ts#L150-L175
- **Rationale: A role's watermark is its own.**
  A mark records how far one role has considered a source, so a role that moves to another seat has considered the same items and keeps its mark, and a mark per run would start every restarted process from the look-back window. A role and source with no mark start cold rather than being seeded from the old shared entry, because that entry was advanced by whichever role ran first, its lane rejections included, so seeding would hand a role a mark claiming it considered items it never saw. A mark no configured role and source resolves to is kept, because a cycle runs one role and cannot tell another role's live mark from a dead one: removing unresolved marks would let every cycle delete the marks of every role not running, so each of those roles would start cold at its own next cycle. Scoping roles by query instead of by lane, leaving the mark shared, would not do: GitHub's issue search has no qualifier for the paths a pull request touches, so a lane's `paths.under` cannot be written as a query, and a lane a role inherits from its defaults and narrows in its own file combines into an AND of ORs that no single query string can express, so only label-scoped roles could be expressed, https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests and [src/role.ts](https://github.com/adamstallard/igor/blob/0c6e9f2/src/role.ts#L41-L54). Leaving the shared mark and documenting it would not do either: the colliding configuration, the same query with a narrower lane, is the one a person reaches for first. A renamed role has no mark and starts cold, bounded by the look-back window, the same cost editing a query already has, accepted as the consequence of keying by name. A sweep that sees every role file, from the CLI, is not built either: each entry is one timestamp string under its key, and nothing reads an unresolved one.
  Evidence: a lane's skip carries no `held` flag, so the shared mark advanced past a lane rejection, https://github.com/adamstallard/igor/blob/0c6e9f2/src/loop.ts#L989-L990
  Evidence: `planCycle` takes a single role, https://github.com/adamstallard/igor/blob/0c6e9f2/src/loop.ts#L916-L920
  Evidence: a mark is one `Watermark`, a `lastSeen` timestamp string, per key in `discovery.json`, https://github.com/adamstallard/igor/blob/0c6e9f2/src/discovery.ts#L20-L26
  Evidence: `advance` copies the stored map and overwrites only the keys it has, https://github.com/adamstallard/igor/blob/0c6e9f2/src/discovery.ts#L177-L179
