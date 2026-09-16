## 1. The observation record

- [ ] 1.1 One record type — seat, window, `percentUsed`, `at`, `resetsAt`, `source`, and the
      model where the window is scoped to one — written by both a reading and a limit error
- [ ] 1.2 Resolve the provider's reset phrase ("Sep 18 at 4pm (America/Los_Angeles)") to a
      comparable instant; an unresolvable one records the phrase and yields no instant
- [ ] 1.3 Append to `capacity.ndjson`, day-partitioned by `appendRecord`, never rewritten
- [ ] 1.4 Tests: both sources produce one shape, an unresolvable reset neither expires nor
      derives, a second observation appends rather than replaces

## 2. Is this seat spent

- [ ] 2.1 A seat with an unexpired observation at 100% for a window has no headroom in it
- [ ] 2.2 The reset from that observation is what the budget handoff states
- [ ] 2.3 Expiry is time passing, not a sweep: nothing deletes rows
- [ ] 2.4 Tests, including a row that expires between two cycles

## 3. What is this seat's capacity

- [ ] 3.1 Window instance boundaries from `resetsAt` and the window's cadence, so the numerator
      is the spend inside one instance
- [ ] 3.2 `capacityFrom(spendInInstance, percentUsed)` — pure, and the only place the division
      happens
- [ ] 3.3 An observation with no spend in its instance yields nothing, rather than a number
- [ ] 3.4 An observation implying a lower capacity than the current estimate lowers it
- [ ] 3.5 Tests: the division, instance bounding, the monotone correction after a limit error,
      and that a co-consumer makes the estimate low rather than high

## 4. The bound

- [ ] 4.1 The gate compares summed Igor spend for the window against
      `(1 − reserve) × capacity`, across every Igor and role on the seat
- [ ] 4.2 A seat with a reserve and no capacity figure is passed over, with that reason
- [ ] 4.3 A seat with no reserve and no capacity figure is usable
- [ ] 4.4 Tests: the bound holds with the owner unobserved, two Igors share one bound, a
      reserved uncalibrated seat is never the pool's fallback

## 5. Saying which

- [ ] 5.1 Budget reporting shows Igor spend, reserve, headroom, reset, and the observation each
      headroom figure derives from with its time
- [ ] 5.2 Never observed, unreadable credential, and spent are three distinct reported states
- [ ] 5.3 Test that an operator can tell the three apart from the report alone

## 6. Cutting what cannot be satisfied

- [ ] 6.1 Remove "A reserve protects projected need, not a fixed fraction" from
      `openspec/changes/budget-pacing`, recording that it requires observing the owner and that
      no surface exposes that to a seat
- [ ] 6.2 Reconcile the rest of `budget-pacing` with capacity coming from a division:
      `elapsed` still comes from a reset time, but `percentUsed` no longer comes from a reading

## 7. Getting the first observation

- [ ] 7.1 Issue for `igor calibrate`: the owner runs a reading on their own machine and it
      lands as an observation. The reading and its parsing already exist; the interface and the
      service-user constraint do not
- [ ] 7.2 Issue for constants — target utilisation, dead band, staleness — to be fitted once a
      week of observations exists, rather than to the two items measured so far
