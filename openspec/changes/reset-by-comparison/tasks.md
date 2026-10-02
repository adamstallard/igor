## 1. The live path compares instead of preferring

- [x] 1.1 In `budgetGate`'s `live` block (`src/budget.ts`), where both of a readable seat's
      windows are shut and both name a return, state the later of the two rather than the week's
- [x] 1.2 Order the two on instants, not on text: these are provider phrases, so they go through
      the same placement `resetInstant` uses before they can be compared
- [x] 1.3 Leave the unplaceable cases exactly as they are — a shut week naming no return still
      takes the seat off the clock, and a shut session naming none still yields the week's hour
- [x] 1.4 Leave `derivedReset` alone: it already takes the later, and this change is the other
      path catching up to it

## 2. `resetApproximate` stops covering the compared case

- [x] 2.1 Where both shut windows named a return and the later was taken, the hour is a
      provider-stated one and the flag is not raised
- [x] 2.2 Where one of the two named none, the flag is still raised — that hour can be early by
      up to the missing window's own length
- [x] 2.3 The cadence-ceiling case on the derived path is untouched and still raises it
- [x] 2.4 A boundary tiled from a stated reset stays unmarked — `derivedWindow`'s over-bound
      branch returns `bound.resetsAt` with no `estimated`, and `test/budget.test.ts:1416` asserts
      it. Nothing here should move it

## 3. Tests

- [x] 3.1 **`test/budget.test.ts:1617` pins the behaviour being removed and has to change.**
      'hedges the hour where the week was preferred over a session nothing can order it
      against' asserts the week's 5pm with `resetApproximate: true` where the session returns at
      8pm. Under the new rule it is 8pm and the flag is absent. Its failure is the change
      landing, not a regression — rewrite the test and its comment to state the rule, do not
      work around it
- [x] 3.2 **`test/budget.test.ts:1722` keeps its assertions and loses its reasoning.** 'states a
      shut week's hour though the session that also shut the seat named none' justifies itself
      by "the same error the week preference already carries". The preference will not exist;
      restate the comment on the cadence bound it actually rests on
- [x] 3.3 New: both windows shut with both hours stated and the session later — the session's
      hour, unhedged
- [x] 3.4 New: both windows shut with both hours stated and the week later — the week's hour,
      unhedged, so the change is not a swapped preference
- [x] 3.5 New: a readable seat and a derived seat with the same two returns state the same hour
- [x] 3.6 Unchanged and worth asserting: the pool still states the earliest hour across its
      seats once each seat states the later of its own two
- [x] 3.7 Not enumerated above, found while implementing: `test/budget.test.ts`'s 'hedges the
      handoff hour once its week is at the reserve too' is a fourth test that pins the
      preference — a `0.57` seat with the week at `43%`, session 8pm, week 4pm, asserting 4pm
      hedged. Under the new rule it is 8pm unhedged, which is also what a seat shut on the
      session alone would state, so the test would pass while testing nothing. Its two hours
      are swapped so the week is the later, and both arms are asserted — shut at `0.57`, open
      at `0.56` — which is what keeps it an assertion about the week being shut

## 4. What the code says about itself

- [x] 4.1 The `Gate` doc comment at `src/budget.ts:849` documents `resetApproximate` as covering
      "the week where both of a readable seat's windows are shut and the week is preferred over
      the session". That clause goes
- [x] 4.2 The comment inside the `live` block that argues for the preference is replaced by one
      that says why the later is taken and why the unplaceable cases are still asymmetric
