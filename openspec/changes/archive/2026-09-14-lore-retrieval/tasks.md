## 1. Remove recency

- [x] 1.1 Drop the decayed recency weight from scoring; report the date of the newest provenance instead
- [x] 1.2 Remove `scoring.halfLifeDays` from config and its default
- [x] 1.3 Update `igor list` to show the newest-evidence date rather than a decay score
- [x] 1.4 Verify two entries differing only in provenance age are ranked identically

## 2. Selecting what fires

- [x] 2.1 Filter to `active` entries — `provisional` and `deprecated` never reach a worker
- [x] 2.2 Match `global` always, `role:<name>` against the running role
- [x] 2.3 Match `project:<name>` against the repository names in the role's sources, so project scope is usable without new config
- [x] 2.4 Verify an entry scoped to another role or project does not fire

## 3. The token budget

- [x] 3.1 Estimate the size of what would be injected, and say plainly that it is an estimate
- [x] 3.2 Inject everything in scope when it fits
- [x] 3.3 When it does not fit, report the count, the size and the budget, and inject nothing — no subset, no ordering
- [x] 3.4 Verify a store over budget produces the report rather than a truncated selection

## 4. Injection

- [x] 4.1 Render an entry with its claim, conditions, body and support count
- [x] 4.2 Place lore in the worker's trusted channel, distinct from the ingested item
- [x] 4.3 Verify an item body formatted to resemble a lore entry is not treated as lore
- [x] 4.4 Verify a worker is offered no means of searching the store

## 5. Recording what fired

- [x] 5.1 Append the item, the entries that fired, and the time to the state branch
- [x] 5.2 Leave entry files untouched
- [x] 5.3 Verify a fire count is derivable from the record

## 6. Against the real store

- [x] 6.1 Run an Igor on `adamstallard/igor` with `adamstallard/igor-lore` as its destination
- [x] 6.2 Read what actually reached the worker, and whether the lore changed what it produced
- [x] 6.3 Record what the run contradicted, since every previous one has contradicted something
