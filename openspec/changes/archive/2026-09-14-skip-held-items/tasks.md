## 1. The holder skip

- [x] 1.1 `universalSkip(candidate, as?)` skips a candidate naming any holder other than `as`
- [x] 1.2 Thread the identity through `screen` and its call site in `planCycle`
- [x] 1.3 Pass the identity at the `--claim` call site in `cli.ts`, which already has one
- [x] 1.4 Tests: foreign holder, co-holder, self only, none, and no identity supplied

## 2. Asking whether anyone spoke

- [x] 2.1 `commentsSince(candidate, since)` on `Tracker`
- [x] 2.2 Implement on `GitHubTracker` over the endpoint `verifyClaim` already uses
- [x] 2.3 Tests against fixtures for the shape, and for an item with no comments

## 3. The record

- [x] 3.1 `src/decided.ts`: fingerprint over the item's own fields, entry shape, load and save
- [x] 3.2 Prune by age and by cap
- [x] 3.3 `suppress()` — pure, given an entry, a candidate and who has spoken
- [x] 3.4 Tests: fingerprint stability under a timestamp change, sensitivity to each field,
      pruning, and a missing record reading as no suppression

## 4. Wiring

- [x] 4.1 `planCycle` loads the record and drops suppressed survivors, counted and reported
- [x] 4.2 `serve` writes an entry after a handoff that is not about budget
- [x] 4.3 Test: a handed-back item is not re-worked next cycle, and is once someone replies
- [x] 4.4 Test: a budget handoff leaves no record

## 5. Documentation

- [x] 5.1 Note the record in `docs/architecture.md` where the state branch is described
