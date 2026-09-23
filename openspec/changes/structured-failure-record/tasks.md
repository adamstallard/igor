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
      recorded as one the cycle reached no verdict on, and its source mark does not advance past it
- [x] 4.2 State it as an outcome rather than as a fourth reason code, so the text is true both on
      `main`, where the mark is held from the held skips alone, and on
      [#70](https://github.com/adamstallard/igor/pull/70), where an untriaged set holds it too
- [x] 4.3 Carry the coarse-clock concession in the requirement itself, self-contained, so it cannot
      contradict #70's tie rule whichever merges first — and state that the comparison is per source
- [x] 4.4 Say in the requirement that a fault which stopped a call being made at all is a different
      fact and is not governed here, which is the boundary #70's requirement names from its side
- [x] 4.5 Record in the proposal that `src/loop.ts:606`'s `workerEnv` throw is a second instance of
      the same class on `main`, that #70 covers it and this change deliberately does not, and that
      it needs a home here if #70 is closed unmerged
- [x] 4.6 Say in the proposal why one change carries both requirements — both edit `work-discovery`,
      and `openspec validate` cannot see a collision between two open changes
- [x] 4.7 A `design.md`, earned by this half alone: refuse #78's other two options in writing, and
      state which implementation shape applies depending on whether #70 has landed

## 5. The candidate stops being lost

Blocked behind the same [#65](https://github.com/adamstallard/igor/pull/65), which holds
`src/loop.ts`. Ordering against [#70](https://github.com/adamstallard/igor/pull/70) decides the
shape, not the outcome.

- [ ] 5.1 A candidate whose triage call failed (`src/loop.ts:626`) reaches a destination besides
      `report.failures` that names it and says no verdict was reached
- [ ] 5.2 Where #70 has landed, that destination is a fourth untriaged reason and the existing tie
      concession already applies; where it has not, the set is this change's own and carries the
      concession with it
- [ ] 5.3 The watermark block (`src/loop.ts:643`) holds the source's mark below such a candidate
- [ ] 5.4 The concession is measured against that source's own verdicts, never across the cycle
- [ ] 5.5 Tests: a batch where one call fails and others return verdicts, asserting the failed one
      comes back next cycle and the decided ones do not; a failed call tied on `updatedAt` with a
      verdict in its own source, asserting the mark is conceded; the same tie with a verdict in
      another source only, asserting the mark is held
