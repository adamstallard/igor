## 1. Not suppressing what was never about the item

- [x] 1.1 `shouldDefer` exempts a handoff carrying a cure key, on the same grounds it exempts
      budget, and keeps deferring one that carries none (#43)
- [x] 1.2 Tests: a refused command does not defer, a failure with no key still does, budget
      still does not
- [x] 1.3 A key minted at every site that enforces one of this Igor's own configurations — the
      seat's token source and the role's action space alongside the sandbox allowlist — and
      `cure` widened to a list, so a run that proved two wrong records both (#48)
- [x] 1.4 Tests: one run carrying two keys keeps both, a worker that cannot start for an unset
      seat token names the seat, an action-space refusal names the role's `allow`, and a crash
      whose cause is unknown still mints none and still defers

## 2. The condition record

- [ ] 2.1 One record — cure key, scope, first and last occurrence, count, state — in the state
      branch, keyed by cure key so several Igors write one condition
- [ ] 2.2 Scope derived from the key rather than declared alongside it: role, seat or Igor
- [ ] 2.3 Concurrent writers converge on one count rather than overwriting each other
- [ ] 2.4 Tests: two Igors on one key, a restart mid-condition, a key whose scope is a seat

## 3. Stopping

- [ ] 3.1 The gate declines where an open condition covers the role, before triage rather than
      per item
- [ ] 3.2 The decline names the cure key and what would change it
- [ ] 3.3 A distinct reason from exhaustion, pacing and an empty queue, in the cycle report and
      the decision record
- [ ] 3.4 Tests: a role stopped and a role sharing nothing still working; an operator telling
      the four idle reasons apart from the record alone

## 4. Clearing

- [ ] 4.1 After the cooldown, one item — whichever the scope would take next — runs with the
      condition still open
- [ ] 4.2 An outcome without the condition closes it; one with it reopens and lengthens the
      cooldown
- [ ] 4.3 A probe that produces no outcome at all leaves the condition open rather than
      clearing it by default
- [ ] 4.4 Tests: cured, still broken, probe item unavailable, a second probe after a longer
      cooldown

## 5. Not grading

- [ ] 5.1 Config validation rejects any severity, rank or fatal flag on a condition
- [ ] 5.2 Test that it does, with the rejection saying why rather than naming an unknown key

## 6. Constants

- [ ] 6.1 Threshold and cooldown configurable, defaults marked provisional in the code
- [ ] 6.2 Record what they were reasoned from, since nothing has measured them
