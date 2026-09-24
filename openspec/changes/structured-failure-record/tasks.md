## 1. The requirement

- [x] 1.1 One added `work-discovery` requirement: a failure a cycle records carries the fault's
      machine-readable identity and its origin, separately readable from the sentence
- [x] 1.2 Say in the requirement that a fault must reach the record with its origin intact, since
      the record can hold only what reached it
- [x] 1.3 Say that the single line a live reader gets survives the widening, so it cannot be read
      as mandating objects in a terminal
- [x] 1.4 Say what a bound may cost and what it may not — the trace shortens, the identity and the
      origin do not
- [x] 1.5 Argue the placement in the proposal: `task-execution` governs `executions.ndjson` and not
      the cycle record, `work-triage` would put a triage requirement over a discovery fault, and
      `work-discovery` already reaches across stages to say what the state branch holds
- [x] 1.6 Name what is deliberately not covered, and file the one piece that outlives this change —
      `executions.ndjson`'s `reason`, [#98](https://github.com/adamstallard/igor/issues/98)

## 2. The record widens

Blocked behind [#65](https://github.com/adamstallard/igor/pull/65), which holds `src/loop.ts`.

- [ ] 2.1 Widen `CycleReport.failures` past `string[]` to an entry carrying the sentence, the
      fault's identity where it had one, and its origin
- [ ] 2.2 Carry the caught object to the push sites rather than a string derived from it — the five
      at `src/loop.ts:504`, `:609`, `:627`, `:633` and `:651`
- [ ] 2.3 Write the structured parts into `decisions.ndjson` beside the sentence, not in place of it
- [ ] 2.4 Keep the two CLI readers rendering one line each (`src/cli.ts:322`, `src/cli.ts:537`)
- [ ] 2.5 Bound the entry so the identity and the origin survive and the trace is what shortens;
      the existing `error.message.slice(0, 80)` at `src/loop.ts:627` truncates the wrong thing
- [ ] 2.6 A failure whose fault carried no code is still recorded, with its origin, and no code is
      invented for it
- [ ] 2.7 Tests: a fault with a code, a fault without one, a fault wrapped twice before it is
      recorded, and a bounded entry — each asserted on what reaches `decisions.ndjson`, not on
      what `planCycle` returned

## 3. The wrap sites keep the original

Blocked behind the same [#65](https://github.com/adamstallard/igor/pull/65), which holds
`src/budget.ts`. No requirement governs this half: it is the mechanism by which 2.2 has anything to
carry.

- [ ] 3.1 `src/budget.ts:144`, `:155` and `:275` throw with `{ cause: e }` — ES2022, and this repo
      runs Node 26 — so a caller can read the original's `code` rather than guess at it from prose
- [ ] 3.2 The `${(e as Error).message}` interpolation goes from all three. It is a cast rather than
      a check, so anything thrown that is not an `Error` renders today as
      `which could not be read: undefined`; with the original on `cause` the message no longer needs
      `e` to have a `.message` at all
- [ ] 3.3 A test throwing a non-`Error` through each of the three, asserting the message reads
      correctly and the original is reachable on `cause`

## 4. The candidate a failed call loses

[#78](https://github.com/adamstallard/igor/issues/78). The same field, read the other way: the
first requirement is about the entry being legible, this one about the item it was written for
surviving the cycle.

- [x] 4.1 A second added `work-discovery` requirement: a candidate whose triage call failed is
      recorded as one the cycle reached no verdict on, and stays in the pool a later cycle triages
- [x] 4.2 State it as an outcome rather than as a fourth reason code, so the text is true both on
      `main` and on [#70](https://github.com/adamstallard/igor/pull/70), where the destination for
      the "no verdict was reached" record differs
- [x] 4.3 Say in the requirement why the mark cannot express this — one instant per source cannot
      sit both above a cycle's verdicts and below a candidate older than them — and carry the
      candidate by id instead, with the mark advancing normally
- [x] 4.4 Say in the requirement that a fault which stopped a call being made at all is a different
      fact and is not governed here, which is the boundary #70's requirement names from its side
- [x] 4.5 Bound the carried record in the requirement: how many are kept, that carried candidates
      never prevent a cycle reaching untriaged ones, that what is shed is what has been carried
      longest, and that the cycle reports what it stopped carrying
- [x] 4.6 Record in the proposal that `src/loop.ts:606`'s `workerEnv` throw is a second instance of
      the same class on `main`, that #70 covers it and this change deliberately does not, and that
      it needs a home here if #70 is closed unmerged
- [x] 4.7 Say in the proposal why one change carries both requirements — both edit `work-discovery`,
      and `openspec validate` cannot see a collision between two open changes
- [x] 4.8 A `design.md`, earned by this half alone: the proof that the held mark cannot satisfy the
      third scenario, the `reconcile` precedent and how far it transfers, the two prior refusals of
      the carry answered clause by clause, and the alternatives refused

## 5. The candidate stops being lost

Blocked behind the same [#65](https://github.com/adamstallard/igor/pull/65), which holds
`src/loop.ts`. Ordering against [#70](https://github.com/adamstallard/igor/pull/70) decides where
the "no verdict was reached" record lands, not the carry.

- [ ] 5.1 A candidate whose triage call failed (`src/loop.ts:626`) reaches a destination besides
      `report.failures` that names it and says no verdict was reached
- [ ] 5.2 Where #70 has landed, that destination is a fourth untriaged reason; where it has not,
      the set is this change's own
- [ ] 5.3 `DiscoveryState` gains the carried ids, scoped as the marks are, **in `discovery.json`
      beside them**. Not a file of its own: `writeState` writes one whole document per call
      (`src/state.ts:117`), so sharing the document makes the mark and the carry one write that
      cannot half-land. Two files can, and the cycle whose mark write lands while its carry write
      fails drops the candidate — #78's bug restored by its own fix
- [ ] 5.4 The mark advances over everything the cycle examined, the failed candidate included. The
      watermark block (`src/loop.ts:643`) needs no change for this half
- [ ] 5.5 Discovery offers carried candidates to triage regardless of the mark, taking them from
      `result.candidates`, which is already everything the query returned (`src/discovery.ts:88`),
      so nothing extra is fetched
- [ ] 5.6 A carried id is dropped as soon as a cycle reaches a decision about the candidate — a
      verdict, or a screening that puts it out of the pool, such as the closed-item skip at
      `src/predicate.ts:63`
- [ ] 5.7 The provisional constants, commented the way `BREAKER_TRIP_AFTER` is — the reasoning, and
      that nothing has failed deterministically yet so anything fitted now is fitted to nothing:
      **three carried candidates per source**, and **at most half a cycle's triage capacity** spent
      on carried candidates. Do not copy `MAX_PENDING = 100`: a carried pull request costs a handful
      of requests against no competing budget, a carried candidate costs one slot of
      `options.limit ?? 10`
- [ ] 5.8 Shedding at the bound drops what has been carried longest, and the cycle reports what it
      stopped carrying on the surface a person watching sees, not only in `decisions.ndjson`
- [ ] 5.9 Tests: a batch where one call fails and others return verdicts, asserting the failed one
      comes back next cycle and the decided ones do not; a carried candidate offered although its
      `updatedAt` is below the mark; a carried candidate cleared by a verdict and by a closed-item
      screen; the mark advancing over a cycle that had a failure; shedding at the bound reported
      rather than silent; and a cycle offered more carried candidates than its capacity still
      triaging one it has never seen
