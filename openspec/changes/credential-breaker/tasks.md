## 1. Recognising it

- [x] 1.1 A run whose envelope carries the provider's 401 mints `seat:<id>:credential`, on the
      path where the worker threw and on the path where it returned the envelope — and only
      where the run did not finish, asked per path against what its exit code already said
- [x] 1.2 Kept out of `limitSignals` and `usageLimit`, so a refused credential is never a budget
      stop, captures no refusal envelope, and records no capacity observation
- [x] 1.3 Tests at each, including that a failure which is not a credential refusal mints nothing

## 2. The fingerprint

- [x] 2.1 A full SHA-256 of the resolved token, taken in `workerEnv` where the value exists and
      nowhere downstream of it
- [x] 2.2 Written to the execution record only beside the cure key that reads it
- [x] 2.3 Carried onto `SeatUsage` from `readAllSeats`, resolved once per seat and kept even
      where the reading throws — which it always does on the seat this is for
- [x] 2.5 A seat naming no token source is named by the ambient login `workerEnv` forwards, on
      both the read side and the run side, so the breaker reaches that configuration too
- [x] 2.4 Tests: the digest holds no part of the token, and a failed reading keeps it

## 3. The breaker

- [x] 3.1 `credentialBreaker` counts trailing rows per seat, matched on the fingerprint resolving
      now, with no store of its own
- [x] 3.2 `BREAKER_TRIP_AFTER = 3`, marked provisional
- [x] 3.3 Cooldown from the most recent refusal, doubling from 15m and capped at 6h, marked
      provisional
- [x] 3.4 `chooseSeat` passes a held seat over ahead of anything a reading says, on both the live
      and the derived path
- [x] 3.5 Tests: trips at three and not two, never on other failures, clears on a different
      fingerprint, closes on a successful run, one run through after the cooldown, the backoff
      and its cap, per seat, and across roles

## 4. Saying which

- [x] 4.1 `SeatVerdict` gains `rejected`, with a case wherever it is switched on
- [x] 4.2 The handoff says the provider refused the credential, not that nothing could be read
- [x] 4.3 `renderBudget` states it once per seat rather than per window
- [x] 4.4 `igor budget --credentials` prints the credential, the count and the hour, and clears
      nothing
- [x] 4.5 Tests at each

## 5. Fitting the constants

- [ ] 5.1 Revisit `BREAKER_TRIP_AFTER` and the backoff once a breaker has actually tripped. File
      an issue before archiving if it has not.
