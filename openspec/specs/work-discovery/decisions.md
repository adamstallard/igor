# work-discovery: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: Watermarks reduce reconsideration without governing it.**
  The watermark only spares discovery from examining items again; it must never decide that an item goes unworked. Discovery offers only items updated after the mark, so an item the mark has passed returns only when something updates it. `work-claiming` ends a cycle early in two cases: two runs in a row that the tracker or code host did not answer, and two runs in a row that failed identically before the worker started. The items the cycle had not reached are unchanged, so the cycle keeps the mark below them; passed, they would never return. The cycle also keeps the mark below an item whose claim was refused because the Igor's GitHub App lacks a permission: the item is unchanged and the cause is the Igor's own setup, so, passed, it would not return once someone grants the permission. Until then, discovery triages the items updated after it again each cycle.
  Evidence: a cooling-down item fell behind the watermark and never returned, #17
  Evidence: `freshCandidates` keeps only items updated after the mark, https://github.com/adamstallard/igor/blob/7d969cd/src/discovery.ts#L64-L73
  Evidence: `condition-backoff` treats a fault in the Igor's own setup as the Igor's, not the item's, and `work-claiming` treats a missing App permission as such a fault, https://github.com/adamstallard/igor/blob/7d969cd/openspec/changes/archive/2026-10-24-condition-backoff/proposal.md#L4-L5
