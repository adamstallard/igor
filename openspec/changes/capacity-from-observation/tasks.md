## 1. The observation record

- [x] 1.1 One record type — seat, window, `percentUsed`, `at`, `resetsAt`, `source`, and the
      model where the window is scoped to one — written by both a reading and a limit error
- [x] 1.2 Resolve the provider's reset phrase ("Sep 18 at 4pm (America/Los_Angeles)") to a
      comparable instant; an unresolvable one records the phrase and yields no instant
- [x] 1.3 Append to `capacity.ndjson`, day-partitioned by `appendRecord`, never rewritten
- [x] 1.4 Tests: both sources produce one shape, an unresolvable reset neither expires nor
      derives, a second observation appends rather than replaces

## 2. Is this seat spent

- [x] 2.1 A seat with an unexpired observation at 100% for a window has no headroom in it
- [x] 2.2 The reset from that observation is what the budget handoff states
- [x] 2.3 Expiry is time passing, not a sweep: nothing deletes rows
- [x] 2.4 Tests, including a row that expires between two cycles

## 3. What is this seat's capacity

- [x] 3.1 Window instance boundaries from `resetsAt` and the window's cadence, so the numerator
      is the spend inside one instance
- [x] 3.2 `capacityFrom(spendInInstance, percentUsed)` — pure, and the only place the division
      happens
- [x] 3.3 An observation with no spend in its instance yields nothing, rather than a number
- [x] 3.4 An observation implying a lower capacity than the current estimate lowers it
- [x] 3.5 A `capacity_estimate` declared on a seat, per window, is the figure until an
      observation of that window exists, and is then superseded outright rather than combined
- [x] 3.6 Tests: the division, instance bounding, the monotone correction after a limit error,
      and that a co-consumer makes the estimate low rather than high

## 4. The bound

- [x] 4.1 The gate compares summed Igor spend for the window against
      `(1 − reserve) × capacity`, across every Igor and role on the seat
- [x] 4.2 A seat with a reserve and neither an observation nor a declared capacity is passed
      over, with that reason
- [x] 4.3 A seat with no reserve and no capacity figure is usable
- [x] 4.4 Tests: the bound holds with the owner unobserved, two Igors share one bound, a
      reserved uncalibrated seat is never the pool's fallback

## 5. Saying which

- [x] 5.1 Budget reporting shows Igor spend, reserve, headroom, reset, and the observation each
      headroom figure derives from with its time
- [x] 5.2 Each window of a seat is reported in one of five distinct states — bounded, at its
      bound, spent, never observed, and observed but still uncalibrated — and a credential
      nothing could read gets a line of its own in place of them, no record rescuing it.
      Merging the last two window states is what made a seat with three observations
      behind it read as broken
- [x] 5.3 Test that an operator can tell all of them apart from the report alone

## 6. Reconciling the sibling change

- [ ] 6.1 Rewrite `budget-pacing`'s reserve requirement as one rule in two information states —
      decay on the clock without a recent observation, decay on the owner's consumption with one
      — so that it stands whether or not `scheduled-observation` has landed
- [ ] 6.2 Reconcile the rest of `budget-pacing` with capacity coming from a division:
      `elapsed` still comes from a reset time, but `percentUsed` no longer comes from a reading

## 7. Getting the first observation

- [ ] 7.1 `scheduled-observation` carries the command that takes a reading on the owner's
      machine and the schedule it runs on; nothing here defines either
- [ ] 7.2 Issue for constants — target utilisation, dead band, staleness — to be fitted once a
      week of observations exists, rather than to the two items measured so far
