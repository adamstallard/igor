## 1. Before building against it

- [ ] 1.1 **Taken before anything below is built, and gates the seat probe.** Measure whether a seat below every warning threshold emits
      a `rate_limit_event` at all, and if it does, whether the event carries `utilization` and
      `unifiedWindows`. Take the capture on the fresh Max seat Adam is buying, before anything
      else runs on it: one minimal `claude -p … --output-format stream-json --verbose` call under
      its `setup-token`, with the full stream kept. Record the answer in `design.md` and in
      `docs/architecture.md` §6.3.3. If no event arrives, the stream reading (sections 2–5) is
      still built, because a reading that arrives only past a threshold is still worth recording.
      The seat probe (section 6) is not built as written, and what starts a fresh reserved seat
      goes back to Adam as `design.md` *A seat probe* describes, since under the line such a seat
      is not drawn on without a reading
- [ ] 1.1a In the same capture, and on the next few ordinary worker runs, record **when** in a run
      each `rate_limit_event` arrives relative to the run's first and last API call. This bounds
      how far past its line one run can carry a seat (`design.md`, *How far past the line one
      Igor can go*); record the answer there
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


## 4. Feeding the gate and the report, in `src/capacity.ts`

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
- [ ] 4.4 Hand the gate, per seat and window, the newest unreset all-models observation of any
      source, a refusal row (#39, and #75's triage refusal) counting as 100% until its reset (a new field on `SeatBound`, `src/capacity.ts:419-442`, or a sibling of it), with its
      `resetsAt`. That is the gate's only input for the line; the capacity half stays for the
      report. Test that a seat whose runs carry no events keeps its older unreset readings until
      they reset, and has none after
- [ ] 4.5 Capacity stays, as a report only. Reword the comments that make it a bound:
      `CapacityAndSpend` (`src/capacity.ts:395-418`, "the spend cancel out of
      `spend ≥ (1 − reserve) × capacity`", "the one shared sum the reserve is a bound on"),
      `SpentWindow.estimated` (`:390-392`, "cannot overrun anybody's floor"), the `vouched` comment
      in `boundsForSeats` (`:512-516`), and the co-consumer paragraph on `capacityFor`
      (`:256-258`). Keep the tests in `test/capacity.test.ts` 'a seat capacity estimate' (`:308`),
      'a limit error lowers the estimate that permitted it' (`:390`), 'a co-consumer makes the
      estimate low, not high' (`:434`) and 'a declared capacity' (`:448`) as tests of a reported
      figure, and reword any that assert it bounds a seat

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
      100%; no unexpired overage reading; no window whose newest unreset reading is at or past
      that window's line (7.1, with the seat's own reserve, since a probe is made for no role);
      not probed in the last hour; no probe of it running; and none in the last five hours
      returned no event
- [ ] 6.2 Spawn the probe as `claudeWorker` spawns a worker, with the environment written out
      (§6.3.2) and only that seat's token. Use `TRIAGE_MODEL`, a trivial prompt, tools denied and
      `--output-format stream-json --verbose`. Reuse 2.1–2.3's parsing
- [ ] 6.3 Record its event through 3.2's path as `stream` rows, timed at arrival. Record its cost
      against the seat, marked as a seat probe in place of a role. Record no observation when no
      event arrived
- [ ] 6.4 Tests: a reserved seat with no reading is probed once; a seat with both windows unexpired
      is not; a refused or overage seat is not until the reset; a seat whose week reading is past
      the week's line is not though its session reading has expired, and is once the line has
      risen past the reading; a seat with no token source is not; the hourly bound and the
      five-hour back-off hold; a probe's cost is recorded as a probe; a probe with no event
      records nothing and is not retried in a loop
- [ ] 6.5 `igor budget` names a figure that came from a probe, or says a seat was probed and
      returned nothing, so an operator can tell a probed seat from an unread one. **May be
      reworded**
- [ ] 6.6 The two limits are settled (Adam, 2026-09-27): at most one probe per seat per hour, and
      five hours before re-probing after a probe that got no event. Build them as constants, not
      configuration
- [ ] 6.7 A probe answered with an authentication failure (401) opens `seat:<id>:credential` in
      whichever record owns the credential stop when this is built: #65's breaker or #101's
      condition record. A probe that succeeds clears it. A 401 is not "no event": the five-hour
      back-off does not follow it. A seat whose stop is open is selected by
      6.1 as a clearing check whatever its readings, still under the hourly limit and the refusal,
      overage and line exclusions. Tests: a 401 opens the stop and records nothing; a success
      clears it and records its reading; a stopped seat is not re-probed within the hour

## 7. The line, in `src/budget.ts`'s gate (replaces the dollar bound and calibration admission)

- [ ] 7.1 `lineFor(reserve, resetsAt, length, now)` — pure, the only place the line is computed:
      `1 − r × clamp((resetsAt − now) ÷ length, 0, 1)`, with `remaining` = 1 where `resetsAt` is
      absent or does not resolve. `r` is `max(seat.reserve, role.reserve ?? 0)` (section 12).
      Tests: the table in `design.md` (0, 0.3, 0.5 and 1, at each column), clamping before and
      after the window, an unresolved reset
- [ ] 7.2 **Derived path.** Replace the dollar bound in `derivedWindow` (`src/budget.ts:508-595`):
      the allowance `(1 − seat.reserve) * capacity.capacityUsd` (`:538`), `overBound` / `overWhy`
      (`:539-545`), the no-figure branch (`:568-584`) and `remainingUsd` (`:594`). A window is
      blocked when its newest unreset reading (4.4) is at or past its line, with a reason naming
      the reading, its time and the line. A window with no unreset reading is blocked only where
      `r` > 0, with its own verdict and reason, not `no-figure`. A refusal (`bound.spent`) still
      blocks as it does, and its reset still reaches the handoff
- [ ] 7.3 **Live path.** Replace the fixed line in `seatStatus` / `hasHeadroom`
      (`src/budget.ts:367-402`): `headroomPercent = line × 100 − percentUsed`, with the live
      reading's reset resolved through `resolveRecentReset` and `remaining` = 1 where it does not
      resolve. Its callers: `chooseSeat`'s live path (`:680-716`, the reason at `:691` and the
      chosen reason at `:713`), `budgetGate`'s shut windows (`:912-915`) and `renderBudget`'s live
      rows (`:1242-1246`)
- [ ] 7.4 `chooseSeat` (`src/budget.ts:597-735`): the chosen-seat reason on the derived path
      (`:670-677`) says the headroom to the line rather than dollars of the session bound, and the
      "no capacity figure and no reserve" wording goes. Its doc comment (`:597-610`, "judged on
      `bounds` instead, in dollars") is reworded
- [ ] 7.5 Verdicts and states. `SeatVerdict` (`src/budget.ts:452`) replaces `no-figure` with a
      verdict for a seat with no unreset reading (e.g. `unread`) and adds one for a seat at its
      line (e.g. `holding`); its comment (`:440-451`) drops "`no-figure` to `igor observe` or a
      declared capacity". `NO_CAPACITY_FIGURE` (`:482-487`) and `hasBoundHeadroom` (`:489-506`) go.
      `poolVerdict` (`:469-485`) orders the new verdicts. `derivedReset` (`:747-788`) states the
      instant a seat holding back passes its line (section 13), and keeps "not known" for an
      unread one. `src/handoff.ts:204-208` and `:223-224` say "nothing has read" and "holding
      back" instead of "no capacity figure". `src/keys.ts:5-6`'s example is reworded
- [ ] 7.6 `WindowState` (`src/budget.ts:968-979`): `at-bound` and `bounded` become states on the
      line (e.g. `holding`, `within`); `unobserved` and `unmeasured` become one `unread` state;
      `describeWindow` (`src/budget.ts:1040-1160`) is rewritten around the reading and the line:
      the allowance at `:1042`, `overBound` / `overWhy` at `:1071-1075`, the no-figure branch and its
      consequence at `:1112-1136` (including "run `igor observe`" at `:1122-1123`), and the
      at-bound / bounded branches at `:1139-1159`. The capacity figure stays in the note, as
      information. `WindowReport.used` (`:987-989`) shows the reading in percent where there is one
- [ ] 7.7 A running item is not stopped when a reading reaches the line; the next gate call finds
      the reading and starts nothing. Test it
- [ ] 7.8 Tests to rewrite in `test/budget.test.ts`, each against the line rather than the dollar
      bound: 'headroom is percent, straight from the reading' (`:219`, including 'gives a dedicated
      seat the whole limit' at `:227`), 'a seat sitting exactly on its reserve' (`:236`), 'a seat
      sitting exactly on its dollar bound' (`:327`, which becomes a seat exactly on its line),
      'pool order is the allocation mechanism' (`:491`), 'the gate the loop consumes' (`:574`),
      'an operator can tell the states apart from the report alone' (`:634`, including `:694` and
      `:700`), 'a pool nobody could read is not a pool that ran out' (`:1002`, including `:1018`),
      'a seat nothing can read is bounded by observation and record' (`:1102`, including `:1227`,
      `:1233` and `:1259`), 'a seat the provider refused is spent until it resets' (`:1316`) and
      'regression: what the hunt on §5 found' (`:1752`). In `test/handoff.test.ts`, 'names an
      uncalibrated pool as uncalibrated rather than as spent' (`:209`). In
      `test/capacity.test.ts`, 'the bounds the gate is handed' (`:538`) and 'a window read and
      still uncalibrated is not a window nobody has read' (`:587`)
- [ ] 7.9 New tests: a reserved seat with a reading below its line and no capacity figure is
      chosen; one at or past it is passed over; one with no unreset reading is passed over at
      `r` > 0 and chosen at `r` = 0; the line rises with time on unchanged readings; both windows
      must pass; a capacity figure, observed or declared, changes no verdict
- [ ] 7.10 `budget_share` on the derived path (`src/budget.ts:648-663`) divides by
      `capacity.capacityUsd`. **Left as it is until Adam answers the question in `design.md`**
      (*What the dollar bound leaves behind*). Recommended: measure it against the reading as the
      live path does (`:697-708`). 'budget_share is a ceiling, not a reservation' (`:534`) follows
      whichever is decided

## 8. Window length and schedule

- [ ] 8.1 The post-reset probe: for each seat with a token source, schedule a seat probe ten minutes
      after each reset a reading has stated, once per window type until measured, then again about
      weekly. It goes through 6.1's selection, so every limit and exclusion applies, and an
      excluded one waits for the next known reset
- [ ] 8.2 From the probe's reading: new reset less old reset, and new reset less the probe's
      arrival time. Whichever equals the built-in (or last measured) length names the schedule and
      the length; where neither does, the next post-reset probe for that window uses a different
      delay, and the schedule is the one whose difference did not move. Record the measurement as
      its own row (or as fields on the observation), with the time, so it survives restarts
- [ ] 8.3 The passive fallback: the smallest positive difference between two differing
      `resetsAt` among a window's observations, used only where shorter than the length in use,
      and reported either way
- [ ] 8.4 `WINDOW_LENGTH` (`src/capacity.ts:73-76`) becomes the built-in default of a per-seat,
      per-window length and schedule. Replace the `scheduled-observation` citations on it in
      `src/capacity.ts` and `test/capacity.test.ts` with this change's requirement
- [ ] 8.5 `resetAnchor` (`src/capacity.ts:223-258`), `instanceBounds` (`:93`) and
      `currentInstance` (`:360`) tile only on a fixed schedule; at first use an instance is placed
      only from its own reset. This affects the reported capacity only
- [ ] 8.6 Tests: fixed schedule from a probe ten minutes after a reset; first use from the same;
      the ambiguous case asks for a second probe at another delay; a post-reset probe skipped by
      the hourly limit or the line; a longer length measured after a reset is used; a longer
      passive one is not; a shorter passive one is; before any measurement the built-in length
      and fixed schedule are used and reported as built-in
- [ ] 8.7 Test that a long gap between readings raises nothing and records nothing for the gap

## 9. Withdrawing `igor observe` (gate two)

- [ ] 9.1 Remove the `observe` command from `src/cli.ts`, and `observeSeat`, `seatToObserve` and
      `reported` from `src/capacity.ts`. Keep `readUsage`, `parseUsage`, `runUsage` and
      `hasSubscription` in `src/budget.ts`: `readAllSeats` still reads live through them
- [ ] 9.2 Remove `test/observe.test.ts`. Keep the `source: 'usage'` fixtures in the other tests:
      they are existing rows, which must still be read
- [ ] 9.3 Reword the remedies in `src/budget.ts` that send an operator to `igor observe`
      (`SeatVerdict`'s comment, `WindowState`'s comment, and the "run `igor observe …` on the
      owner's machine" consequence in `describeWindow`) to what starts a seat now: a reading below
      its line, from a run or the probe. A declared `capacity_estimate` no longer starts one. Also the `whyNoFigure` comment in
      `src/capacity.ts` that says an unread seat "wants `igor observe`". Update the tests that
      assert the old text
- [ ] 9.4 Leave `Observation.source`'s `'usage'` member in place, and test that a `usage` row is
      still read while nothing writes one
- [ ] 9.5 `README.md`, `docs/deployment.md` and `docs/seats.md`: remove the descriptions of
      `igor observe` that say it is being withdrawn, and the example `igor budget` row that names it

## 10. Docs, once built

- [ ] 10.1 `README.md` Budgets, `docs/seats.md` "What the floor rests on" and `docs/deployment.md`
      step 4: describe the stream reading as shipped, and what a lender no longer has to install.
      Replace the links from `README.md` and `docs/seats.md` into
      `openspec/changes/read-seat-windows-from-the-stream/`, which archiving moves
- [ ] 10.2 `docs/architecture.md` §6.3.1 and §6.3.3: move from "what this changes" to what was built
- [ ] 10.3 `README.md` Budgets, `docs/seats.md` and `docs/deployment.md` describe the line as
      specified and not built, and keep the shipped dollar-bound behaviour beside it. Once 7.x and
      12.x are built, drop the conditional wording, replace the example `igor budget` output with
      the line's columns, and remove the description of the dollar bound

## 11. Left open, recorded so they are not lost

- [ ] 11.1 Triage: capture whether `--output-format json`'s single envelope carries
      `rate_limit_info`, and record the answer in `design.md` — the owner of any triage reading is
      the reviewer's decision (this change or `triage-refusal-calibrates`, #75)
- [x] 11.2 `MODIFIED`, `RENAMED` and `REMOVED`-plus-`ADDED` deltas for the in-force passages
      `design.md` lists under *In-force text this overtakes* — written in gate one, on Adam's
      decisions of 2026-09-27 and 2026-09-28, and archive-tested in a scratch copy

## 12. A role's reserve, and a reserve on any seat

- [ ] 12.1 `src/role.ts`: an optional `reserve`, a number from 0 to 1 inclusive, beside
      `budget_share` (`:72`, `:105`, `:332`, `:441-449`), refused outside that range. Inheritance
      follows the protective direction, a role may raise an inherited reserve and never lower it,
      unless Adam decides otherwise (`design.md`, *Still open*)
- [ ] 12.2 The gate takes the role's reserve (`chooseSeat`'s and `budgetGate`'s `role` parameter,
      `src/budget.ts:615` and `:871`) and uses `max(seat.reserve, role.reserve ?? 0)` for the line
      on every seat the role draws on
- [ ] 12.3 `parseOrgBudget` (`src/budget.ts:1376-1416`): remove the dedicated-seat refusal
      (`:1395-1397`), stop forcing a dedicated seat's reserve to 0 (`:1413`; it defaults to 0),
      and accept a reserve of 1 (`:1392`, `>= 1` becomes `> 1`). The `Seat` comments
      (`src/budget.ts:60-74`: "Fraction of the limit Igors must not consume", "its reserve is
      zero", and the `capacityEstimate` comment that a reserved seat with no figure is passed
      over) are reworded. Rewrite 'rejects a reserve on a dedicated seat'
      (`test/budget.test.ts:873`) to accept it, and add a test for a reserve of 1
- [ ] 12.4 Tests: `frontend` at 0.3 and `generalist` at none on one seat, with a reading between
      their lines, choose for `generalist` and not for `frontend`; a role at 0.2 on a seat at 0.5
      uses 0.5; a role reserve with a dedicated seat is valid; one out of range is refused
- [ ] 12.5 `igor budget` shows, per seat and window, the line each role drawing on it checks where
      a role's reserve is larger than the seat's. **May be reworded**

## 13. Holding back, from `budget-pacing`

- [ ] 13.1 A gate that chooses nothing because every seat is at or past its line returns the
      holding verdict (7.5), distinct from `spent`, from an unread seat and from an empty queue,
      and the cycle report and decision record name it
- [ ] 13.2 `igor budget` says a seat is holding back and names the instant its line reaches its
      reading, `resetsAt − (1 − reading) ÷ r × length`. **May be reworded**:

      ```
      holding back — 94% used at 2026-09-27T14:02:11.000Z is past its 91% line; the line reaches it at 2026-09-29T08:00:00.000Z
      ```

- [ ] 13.3 Test that an operator can tell holding back, a refusal, an unread seat and an empty
      queue apart from the record alone

## 14. `capacity_estimate`

- [ ] 14.1 Keep the key parsed (`src/budget.ts:1298-1330`, `:1340`) and reported as declared; it
      admits nothing (7.9). Whether to deprecate and then remove it waits on Adam's answer in
      `design.md` and on task 1.1
