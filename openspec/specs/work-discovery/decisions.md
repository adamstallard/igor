# work-discovery: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: Watermarks reduce reconsideration without governing it.**
  A cycle that a two-in-a-row rule ends leaves its later items unreached, and the mark must stay below them, since discovery offers only items updated after the mark: an item the mark has passed returns only when something updates it, and nothing updates an item no run reached. A claim refused for a missing App permission holds the mark at its item for the same reason: the fault is the Igor's, so the item, still unchanged once the permission is granted, would never return. Holding the mark costs re-triage of the items after it while the condition lasts.
  Evidence: a cooling-down item fell behind the watermark and never returned, #17
  Evidence: `freshCandidates` keeps only items updated after the mark, https://github.com/adamstallard/igor/blob/7d969cd/src/discovery.ts#L64-L73
  Evidence: `condition-backoff` records a fault in the Igor's own setup against the Igor, since the item is fine, https://github.com/adamstallard/igor/blob/7d969cd/openspec/changes/archive/2026-10-24-condition-backoff/proposal.md#L4-L5
