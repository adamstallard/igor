## 1. Before building against it

- [ ] 1.1 **Taken before anything below is built, and gates the seat probe.** Measure whether a seat below every warning threshold emits
      a `rate_limit_event` at all, and if it does, whether the event carries `utilization` and
      `unifiedWindows`. Take the capture on the fresh Max seat Adam is buying, before anything
      else runs on it: one minimal `claude -p … --output-format stream-json --verbose` call under
      its `setup-token`, with the full stream kept. Record the answer in `design.md` and in
      `docs/architecture.md` §6.3.3. If no event arrives, the stream reading (sections 2–5) is
      still built, because a reading that arrives only past a threshold is still worth recording.
      The seat probe (section 6) is not built as written, and goes back to Adam as `design.md`
      *A seat probe* describes
- [ ] 1.2 Keep the capture as a test fixture beside the 2026-09-27 one from §6.3.3, so the parser
      is tested against what the provider sent rather than what was guessed

## 2. Parsing, in `src/execute.ts`

- [ ] 2.1 In `claudeWorker`'s `consume`, keep the last `event.type === 'rate_limit_event'` and the
      instant it arrived, beside the terminal `result` (around line 985); return both from the
      runner without changing what `final` means
- [ ] 2.2 `readingFrom(event, arrivedAt)` — pure, non-throwing, in the style of `asIso`: per window,
      `utilization` × 100 and `resetsAt` from epoch seconds via `fromEpoch`; `five_hour` →
      `session`, `seven_day` → `week`, any other window name dropped; `status`,
      `surpassedThreshold`, `isUsingOverage` kept where they are the right type and dropped where
      not
- [ ] 2.3 Prefer `unifiedWindows` for per-window figures; fall back to the top-level
      `utilization`/`resetsAt` for the window `rateLimitType` names only when `unifiedWindows` is
      absent
- [ ] 2.4 Tests: the §6.3.3 capture parses to both windows; several events keep the last; a
      malformed or partial event yields no reading for what is missing and never throws; valid
      JSON that is not an object is still skipped; an unknown window name is not mapped

## 3. Recording

- [ ] 3.1 Extend `Observation`'s `source` to `'usage' | 'limit' | 'stream'`, and add optional
      `status`, `surpassedThreshold` and `isUsingOverage`; rows without them read exactly as today
- [ ] 3.2 In `recordExecution`, write one observation per window from the run's reading through
      `recordObservation`, against the seat the run was charged to, with `at` the arrival instant
      from 2.1 — never the time `recordExecution` runs
- [ ] 3.3 Every stream row is `source: 'stream'`. A `rejected` event on a run whose envelope is an
      error is written at 100% of the window it names, with its reset; a `rejected` event on a run
      with `is_error: false` is written at the figure it gives, not as a refusal
- [ ] 3.4 When the stream reading is a refusal, the envelope path in `recordExecution` writes no
      second row for the same run; when there is no event, the envelope path is unchanged
- [ ] 3.5 Rows are appended one at a time, as `observeSeat` does, since `appendRecord` drops
      concurrent appends to one day's file
- [ ] 3.6 Tests: a run with an event appends two rows against the charged seat with the arrival
      instant; a run without one appends none; a seat naming no token source still gets its row;
      a refusal carried by both stream and envelope appends one row; an aborted run that received
      an event still records it

## 4. Feeding capacity, in `src/capacity.ts` and the gate

- [ ] 4.1 `capacityFor`, `resetAnchor` and `spentFor` read stream rows through their existing
      newest-wins paths; add no selection rule. Test that a stream row newer than a `/usage` row
      supersedes it, and that the run's own spend is excluded from the numerator by `at`
- [ ] 4.2 A row with `isUsingOverage: true` for the window its event's `rateLimitType` named is
      treated by `spentFor` like a row at 100%: no headroom in that window until its reset, with
      its own reason. The same flag on the event's other row shuts nothing. Tests: passed over
      while unexpired, usable after the reset with nothing run, a session overage leaves the week
      bounded as before
- [ ] 4.3 Reporting presents an unexpired reading as a lower bound with its time, and a reading past
      its reset as not bearing on the present. Tests for both
- [ ] 4.4 Nothing in the gate waits for or requires a stream row. Test that a seat whose runs carry
      no events is bounded exactly as before this change

## 5. Saying so, in `igor budget`

- [ ] 5.1 A figure derived from a stream row names its route. The tail currently ends
      `(usage)` or `(limit)`; for a stream row it ends as below. **May be reworded**, provided it
      still distinguishes a stream reading from a `/usage` one:

      ```
      $20.00 capacity observed, from 86% used at 2026-09-27T14:02:11.000Z (worker stream)
      ```

- [ ] 5.2 A seat whose newest unexpired reading carries `allowed_warning` shows a line under its
      rows. **May be reworded**, provided it names the provider as the source of the threshold,
      the window, and the time of the reading:

      ```
      !  the provider warned at 2026-09-27T14:02:11.000Z that seat "adam" is past 75% of its week
      ```

- [ ] 5.3 A seat passed over for overage gives this reason. **May be reworded**, provided it says
      extra usage and names when the seat returns:

      ```
      spending extra usage beyond its subscription — passed over until 2026-10-02T23:00:00.000Z
      ```

- [ ] 5.4 The shipped `!  seat "…" carries no subscription, so no window is reported against it`
      line is false for a seat with stream readings. Where such a seat has an unexpired stream
      row, omit the line; where it has none, keep the line but reword it to what is true. **May be
      reworded:**

      ```
      !  seat "adam" has no reading yet: /usage reports no window to its token, and no worker run or probe has reported one
      ```

- [ ] 5.5 Tests that each of 5.1–5.4 appears where it should and nowhere else

## 6. The seat probe, on the server (only if 1.1 found an event below threshold)

- [ ] 6.1 In the serve loop, select the seats to probe: seats are declared; the seat names a token
      source; some window has no unexpired `usage` or `stream` observation; no unexpired row at
      100%; no unexpired overage reading; recorded Igor spend below `(1 − reserve) × capacity` in
      every window that has a figure; not probed in the last hour; no probe of it running; and
      none in the last five hours returned no event
- [ ] 6.2 Spawn the probe as `claudeWorker` spawns a worker, with the environment written out
      (§6.3.2) and only that seat's token. Use `TRIAGE_MODEL`, a trivial prompt, tools denied and
      `--output-format stream-json --verbose`. Reuse 2.1–2.3's parsing
- [ ] 6.3 Record its event through 3.2's path as `stream` rows, timed at arrival. Record its cost
      against the seat, marked as a seat probe in place of a role. Record no observation when no
      event arrived
- [ ] 6.4 Tests: a reserved seat with no reading is probed once; a seat with both windows unexpired
      is not; a refused or overage seat is not until the reset; a seat at its bound in the week is not
      though its session reading has expired; a seat with no token source is not;
      the hourly bound and the five-hour back-off hold; a probe's cost counts toward the bound; a
      probe with no event records nothing and is not retried in a loop
- [ ] 6.5 `igor budget` names a figure that came from a probe, or says a seat was probed and
      returned nothing, so an operator can tell a probed seat from an unread one. **May be
      reworded**

## 7. Docs, once built

- [ ] 7.1 `README.md` Budgets, `docs/seats.md` "What the floor rests on" and `docs/deployment.md`
      step 4: describe the stream reading as shipped, and what a lender no longer has to install.
      Replace the links from `README.md` and `docs/seats.md` into
      `openspec/changes/read-seat-windows-from-the-stream/`, which archiving moves
- [ ] 7.2 `docs/architecture.md` §6.3.1 and §6.3.3: move from "what this changes" to what was built

## 8. Left open, recorded so they are not lost

- [ ] 8.1 Triage: capture whether `--output-format json`'s single envelope carries
      `rate_limit_info`, and record the answer in `design.md` — the owner of any triage reading is
      the reviewer's decision (this change or `triage-refusal-calibrates`, #75)
- [x] 8.2 `MODIFIED` deltas for the four in-force passages `design.md` lists under *In-force text
      this overtakes* — written in gate one, on Adam's decision of 2026-09-27
