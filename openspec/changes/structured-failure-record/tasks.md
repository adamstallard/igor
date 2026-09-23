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
