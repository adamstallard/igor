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

## 2. Conditions from the execution log

- [ ] 2.1 Rebuild each condition (cure key, scope, first and last occurrence, count, state,
      cooldown, and the discriminator where the cure key does not identify what is stuck) from
      `executions.ndjson`: every row carrying the cure key, of whatever kind (a run, or a seat
      probe once #143 writes one), and its condition rows. A row of the condition's scope without
      the key is an outcome that does not meet it. Store nothing else
- [ ] 2.2 Scope derived from the key rather than declared alongside it: role, seat or Igor
- [ ] 2.3 Add a `kind` to execution-log rows, defaulting to a run so existing rows stay valid,
      and append a condition row when a probe is taken. Update every reader of the log that
      counts runs (spend attribution, capacity, `igor budget`, the credential report) to skip
      rows of any other kind
- [ ] 2.4 A handoff observed against a different discriminator closes the open occurrence and
      starts a new count rather than adding to it, with scope still derived from the key alone
- [ ] 2.5 Tests: two Igors on one key, a restart mid-condition, a key whose scope is a seat, and
      a seat's second credential counting from one rather than inheriting the first's count

## 3. Stopping

- [ ] 3.1 The gate declines where an open condition covers the role, before triage rather than
      per item
- [ ] 3.2 The decline names the cure key and what would change it
- [ ] 3.3 A distinct reason from exhaustion, pacing and an empty queue, in the cycle report and
      the decision record
- [ ] 3.4 Tests: a role stopped and a role sharing nothing still working; an operator telling
      the four idle reasons apart from the record alone
- [ ] 3.5 Resolve each seat's credential and its hash before the condition gate declines a scope,
      so a credential condition still sees a replaced credential while its scope is stopped and
      clears at once rather than after the cooldown. Test: a seat stopped on token A, given token
      B, is chosen on the next cycle with no probe taken

## 4. Clearing

- [ ] 4.1 After the cooldown, one item — whichever the scope would take next — runs with the
      condition still open
- [ ] 4.2 An outcome without the condition closes it; one with it reopens and lengthens the
      cooldown
- [ ] 4.3 A probe that produces no outcome at all leaves the condition open rather than
      clearing it by default
- [ ] 4.4 A condition carrying a discriminator also clears the moment a different one resolves,
      with no cooldown waited and no item spent
- [ ] 4.5 Build the credential condition from #65's branch (`breaker`), which is folded in here
      instead of merging (Adam, 2026-10-11). Carry over `credentialCure`, the full-hash
      `tokenFingerprint` on execution records (including `ambientFingerprint` for a seat naming no
      token source), the 401 test with its two paths, the `rejected` verdict that `chooseSeat`
      checks before any headroom, `igor budget --credentials`, and their tests. Leave out
      `credentialBreaker`'s own trailing count, trip count and cooldown: the condition's count,
      rebuilt from the log, and its threshold and cooldown replace them, so no seat is held by two
      mechanisms
- [ ] 4.6 The seat's credential line in `igor budget` is its condition line, and its messages say
      that a credential condition clears both on a different credential and on a probe that does
      not meet it
- [ ] 4.7 Tests: cured, still broken, probe item unavailable, a second probe after a longer
      cooldown, a replaced credential clearing at once, and no seat held by two mechanisms
- [ ] 4.8 The GitHub App credential stop `serve` holds in memory becomes an Igor-scoped
      condition, `app:<identity>:credential`, observed against a full hash of the App's private
      key, so a rotated key clears it at once as a replaced seat token does (#170). It opens on
      the first refusal, not after the recurrence threshold, as `app-identity` requires: a
      refused App can do nothing on GitHub, so no item could find the cure. Its clearing check is
      `serve`'s mint attempt, which spends no item, as a seat probe does for a seat

## 5. Not grading

- [ ] 5.1 Config validation rejects any severity, rank or fatal flag on a condition
- [ ] 5.2 Test that it does, with the rejection saying why rather than naming an unknown key

## 6. Constants

- [ ] 6.1 Threshold and cooldown configurable, defaults marked provisional in the code
- [ ] 6.2 Record what they were reasoned from, since nothing has measured them. #65's reasoning
      is the starting point (`design.md`, *Folded in from #65*): a threshold of 3, and a cooldown
      of 15 minutes doubling to a ceiling of 6 hours

## 7. Merging

- [ ] 7.1 When merging, reword `docs/architecture.md` §6.3.4's "or by the condition record if
      #101 lands" as present
- [ ] 7.2 When merging, if `main` still says "until a reply or an edit answers it"
      (`docs/architecture.md` §5.0.2), reword it to say only someone with write access lifts a
      deferral. #141 carries the same task; whichever merges first does it
