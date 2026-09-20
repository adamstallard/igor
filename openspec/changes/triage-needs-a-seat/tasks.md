## 1. The gate reaches the model stage

- [x] 1.1 `planCycle` consults the budget gate at the point of the triage call — after
      `dropStopped` and `dropDeferred`, still only where candidates survived to it — and makes
      no call where the gate names no seat
- [x] 1.2 The refusal is distinguishable at the call site between a pool that is spent and a
      pool that could not be used, from `gate.blocked` rather than from `reason` prose (#49)
- [x] 1.3 Tests: a held pool makes no call; a gate with a seat still calls with that seat's
      token; no seats declared still calls on the ambient login

## 2. Nothing above the model call moves

- [x] 2.1 Discovery, `oneFetchPerItem`, the stop gate, the deferral gate, the universal skips
      and the lane predicates all run on a held cycle
- [x] 2.2 Tests: a stop arriving while the pool is held is acted on that cycle; a reply to a
      handed-back item is read that cycle

## 3. The watermark waits

- [x] 3.1 Each candidate that reached the model stage and was not triaged is recorded with the
      held-pool reason and holds the mark back, via the same `held` path `heldBelow` reads
- [x] 3.2 Nothing records those candidates as skipped, deferred or handed back
- [x] 3.3 Tests: the mark does not pass the oldest untriaged candidate; the next cycle with
      capacity triages it unedited; a held cycle leaves the deferral record untouched

## 4. Saying it

- [x] 4.1 The cycle report carries the count left untriaged, the reason, and the reset time
      where one is known, distinctly from a cycle that had nothing to triage
- [x] 4.2 `serve.ts`'s summary and the decision record express the same state
- [x] 4.3 No comment is posted to any candidate: nothing was claimed
- [x] 4.4 Tests: an operator can tell a held pool from an empty queue, and a spent pool from an
      unusable one, from the report alone

## 5. Closing out

- [x] 5.1 The comment at `src/loop.ts:436-439` describes what the code now does
- [x] 5.2 `docs/deployment.md` says what a held pool looks like from the operator's side, so
      the `/login` reading is not the first guess
- [x] 5.3 Close #33 and #66 — by `Closes #33` / `Closes #66` in PR #70's description, which
      closes them on merge rather than before it
