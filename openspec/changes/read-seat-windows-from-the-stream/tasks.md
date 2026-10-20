## 1. Before building against it

- [x] 1.1 **Taken before anything below is built, and gates the seat probe.** Measure whether a seat
      below every warning threshold emits a `rate_limit_event` at all, and if it does, whether the
      event carries `utilization` and `unifiedWindows`. Take the capture on the fresh Max seat Adam
      is buying, before anything else runs on it: one minimal `claude -p … --output-format
      stream-json --verbose` call under its `setup-token`, with the full stream kept. Record the
      answer in `design.md` and in `docs/architecture.md` §6.3.3. If no event arrives, the stream
      reading (sections 2–5) is still built, because a reading that arrives only past a threshold is
      still worth recording. The seat probe (section 6) is not built as written, and what starts a
      fresh reserved seat goes back to Adam as `design.md` *A seat probe* describes, since under the
      line such a seat is not drawn on without a reading. Measured 2026-10-11 on
      `claude-adam-personal` rather than a fresh seat, since it was below every threshold (42% of
      the five-hour window, 11% of the week, `allowed`): an event arrives, with `utilization` and
      `resetsAt` per window in `unifiedWindows` and none at the top level. The probe is built as
      written. Captures in `captures/`
- [x] 1.1a In the same capture, and on the next few ordinary worker runs, record **when** in a run
      each `rate_limit_event` arrives relative to the run's first and last API call. This bounds how
      far past its line one run can carry a seat (`design.md`, *How far past the line one Igor can
      go*); record the answer there. Measured 2026-10-11 on two captured runs only, one of one API
      call and one of three: one event per run, right after the first API call's response, none
      after later calls; so the bound is about two runs per process (`design.md`). Ordinary worker
      runs were not captured; 1.1b covers them. The captures keep only their events and five
      `init` fields (decision 40), so this task, not the captures, records when each event
      arrived: right after the first API call's response, in both runs. Both captured events read
      the five-hour window at 43% and the week at 11%, with the same resets
- [ ] 1.1b On several ordinary worker runs, including one that crosses a warning threshold
      mid-run, record how many `rate_limit_event`s arrive and when. If a run carries an event
      after its first call, the two-run bound of decision 4 goes back to Adam
- [ ] 1.1c When a never-used seat is available, before anything else runs on it, repeat 1.1's
      capture on it and record in `design.md`, *A seat below every threshold gets an event*,
      whether a seat with no current instance gets an event. If it does not, what starts a fresh
      reserved seat goes back to Adam
- [ ] 1.2 Keep the capture as a test fixture beside the 2026-09-27 one from §6.3.3, so the parser
      is tested against what the provider sent rather than what was guessed
- [ ] 1.3 Check that fullness does not fall within an instance: compare the successive readings of
      one window instance across several runs on one seat, and record in `design.md` whether any
      later reading is lower. If one is, treating an old reading as a lower bound (*A reading
      bounds its window from below until the window resets*) goes back to Adam; the gate already
      reads the newest reading either way
- [ ] 1.4 Capture an event with `isUsingOverage: true` and record in `design.md` what it means
      beside `overageStatus` and `overageDisabledReason`. Task 4.2 is not built until this
      confirms the flag means extra usage is being spent; if it means something else, 4.2 reads
      the field that does. If there is still no capture when the rest of gate two, this change's
      implementation, is built, file
      *A seat spending extra usage has no headroom* as a follow-up issue, move the requirement out
      of this change's `seat-budget` delta, and tick 4.2 and this task with a pointer to the issue
      (decision 38)
- [ ] 1.5 Capture a `rejected` event from a real refusal (#57), worker run and triage call, and
      check *A refusal the stream reports is not recorded twice* and 3.3 against it, including
      which window a per-model refusal names
- [ ] 1.6 Once 1.3 confirms that no later reading of an instance is lower, close issue #69, which
      asks how old a reading may be before the line distrusts it, with this change's reasoning: a reading bounds its window from below until its reset, so it needs no
      age limit (*A reading bounds its window from below until the window resets*; Adam,
      2026-10-17), and remove the *Still open* line naming #69 from `docs/architecture.md` §6.3.
      If 1.3 finds a lower reading, leave #69 open


## 2. Parsing, in `src/execute.ts`

- [ ] 2.1 In `claudeWorker`'s `consume`, keep the last `event.type === 'rate_limit_event'` and the
      instant it arrived, beside the terminal `result`; return both from the
      runner without changing `final`, the terminal `result` the runner returns now
- [ ] 2.2 `readingFrom(event, arrivedAt)` — pure, non-throwing, in the style of `asIso`: per window,
      `utilization` × 100 and `resetsAt` from epoch seconds via `fromEpoch`; `five_hour` →
      `session`, `seven_day` → `week`, a per-model weekly window → `week` with its `model` (its
      name is unmeasured, task 1.5), any other window name dropped; which window
      `rateLimitType` names; `status`,
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
      `named` (this row is the window the event's `rateLimitType` named), `status`,
      `surpassedThreshold` and `isUsingOverage`; rows without them read exactly as today
- [ ] 3.2 In `recordExecution`, write one observation per window from the run's reading through
      `recordObservation`, against the seat the run was charged to, with `at` the arrival instant
      from 2.1 — never the time `recordExecution` runs
- [ ] 3.3 Every stream row is `source: 'stream'`. A `rejected` event on a run whose envelope is an
      error is written at 100% of the window it names, with its reset; a `rejected` event on a run
      with `is_error: false` is written at the figure it gives, not as a refusal
- [ ] 3.4 When the stream reading is a refusal, the envelope path in `recordExecution` writes no
      second row for the same run; when there is no event, the envelope path is unchanged
- [ ] 3.5 Append each row only once the previous append has finished, the pattern `observeSeat`
      follows until 9.1 removes it:
      `appendRecord` can lose one of two appends made at once to the same day's file
- [ ] 3.6 Tests: a run with an event appends two rows against the charged seat with the arrival
      instant; a run without one appends none;
      a refusal carried by both stream and envelope appends one row; an aborted run that received
      an event still records it


## 4. Feeding the gate and the report, in `src/capacity.ts`

- [ ] 4.1 `capacityFor`, `resetAnchor` and `spentFor` read stream rows through their existing
      newest-wins paths; add no selection rule. Test that a stream row newer than a `/usage` row
      supersedes it, and that the run's own spend is excluded from the numerator by `at`
- [ ] 4.2 A row with `isUsingOverage: true` for the window its event's `rateLimitType` named is
      treated by `spentFor` like a row at 100%: no headroom in that window until its reset, with
      its own reason, once 1.4 has confirmed the flag. The same flag on the event's other row
      shuts nothing. Tests: passed over
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
      `CapacityAndSpend` (`src/capacity.ts:396-415`, "the spend cancel out of
      `spend ≥ (1 − reserve) × capacity`", "the one shared sum the reserve is a bound on"),
      `SpentWindow.estimated` (`:390-392`, "cannot overrun anybody's floor"), the `vouched` comment
      in `boundsForSeats` (`:512-516`), and the co-consumer paragraph on `capacityFor`
      (`:256-258`). Keep the tests in `test/capacity.test.ts` 'a seat capacity estimate' (`:308`),
      'a limit error lowers the estimate that permitted it' (`:390`), 'a co-consumer makes the
      estimate low, not high' (`:434`) as tests of a reported figure, and reword any that assert
      it bounds a seat. 'a declared capacity' (`:448`) goes with `capacity_estimate` (14.1)

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

- [ ] 5.4 The shipped line saying a seat `is authenticated … but its credential carries no
      subscription, and a window is only ever reported against one` (`src/budget.ts:289-291`) is
      false for a seat with stream readings. Where such a seat has an unexpired stream
      row, omit the line; where it has none, keep the line but reword it to what is true. **May be
      reworded:**

      ```
      !  seat "adam" has no reading yet: /usage reports no window to its token, and no worker run or probe has reported one
      ```

- [ ] 5.5 Tests that each of 5.1–5.4 appears where it should and nowhere else


## 6. The seat probe, on the server (only if 1.1 found an event below threshold)

- [x] 6.0 Before building 6.1-6.3, measure that a probe in the specified configuration, `HOME`
      and working directory both empty, no tools and only the seat's token, still gets a
      `rate_limit_event`. If it does not, the probe goes back to Adam. Confirmed 2026-10-18 on
      Claude Code 2.1.303: `design.md`, *A seat probe*, *Measured*
- [ ] 6.0a Once #174 (`pinned-skills`) is built, measure that the probe with #174's shared
      arguments, `--plugin-dir` among them, still gets a `rate_limit_event`, and its cost, and
      record both in `design.md`, *A seat probe*. If it gets no event, the probe goes back to Adam
- [ ] 6.1 In the serve loop, select the seats to probe: the deployment declares seats; some window has no unexpired `usage` or `stream` observation; no unexpired row at
      100%; no unexpired overage reading for the window its `rateLimitType` names; no window whose
      newest unreset reading is at or past that window's line (7.1), computed with the seat's own
      reserve, since a probe is made for no role (the crossing probe of 6.8 checks the role's line
      instead); no probe of it recorded by any Igor in the last hour; no
      probe of it this process started still running; and every probe of it in the last five
      hours got an event. Where a reading expired at a reset the server knows of and 8.1's post-reset
      probe is due at that reset, the probe is that post-reset probe, not a second one, unless it
      was excluded. Build
      the overage exclusion only once 1.4 confirms what `isUsingOverage` means. Until #171's code
      lands, skip a seat that names no token (decision 39). #171's code refuses such a seat, so the
      skip never fires after that. The change that removes the live read removes it too,
      and task 16.4's issue names it
- [ ] 6.2 Spawn the probe with the environment written out as `claudeWorker` writes a
      worker's (§6.3.2), as the Igor's own Unix user, not through #175's worker user: `sudo` to the
      worker user resets `HOME` to that user's home, which would undo the empty `HOME` below,
      and the probe runs no repository code that needs a separate user.
      Give it only that seat's token. Run it from a fresh empty temporary directory, made under
      the system's temporary directory and never under a home, with `HOME` set to a second empty
      temporary directory, not the home a worker is given. Fail the probe, and
      record nothing, where any directory above the first holds a `.claude` directory or
      `CLAUDE.md`.
      Remove both directories once the probe exits.
      Use `TRIAGE_MODEL`, a trivial prompt, tools denied and `--output-format stream-json
      --verbose`. Where #174 (`pinned-skills`) is built, take the arguments every call gets from
      its shared argument builder, `--setting-sources user` and `--strict-mcp-config` among them:
      measured on 2026-10-18, a call without `--setting-sources user` run under a home holding
      `.claude` loads that home's skills. Where #174 is not built, pass `--setting-sources user` and
      `--strict-mcp-config` directly. Reuse 2.1–2.3's parsing
- [ ] 6.3 Record its event through 3.2's path as `stream` rows, timed at arrival. Record every probe,
      an error exit included, on a spend row that `loadSpend` returns: against the seat, marked
      as a seat probe in place of a role, with its cost (0 where none was reported) and whether
      an event arrived. 6.1's hourly limit and five-hour back-off read these rows. Where #101's
      code has merged, make its condition reader skip a row marked as a seat probe, and test
      that such a row neither opens nor clears any condition. Where #101 has merged, its `check` row for the credential (6.7) is a
      second row and carries no cost. Record no observation when no event arrived
- [ ] 6.4 Tests: a reserved seat with no reading is probed once; a seat whose post-reset probe
      was excluded is probed once no exclusion applies; the probe runs with an empty `HOME`, the
      cheapest model, the trivial prompt and no tools; a seat with both windows unexpired
      is not probed to read it; a probe this process started and is still running is not doubled; a refused or overage seat is not until the reset; a seat whose week reading is past
      the week's line is not though its session reading has expired, and is once the line has
      risen past the reading; the hourly bound and the
      five-hour back-off hold; a probe's cost is recorded as a probe; a probe with no event
      records nothing and is not retried in a loop; another Igor's probe within the hour holds
      this one off; the probe's cost appears in `igor budget`'s spend; the probe runs from an
      empty directory, and refuses one with a `.claude` directory above it
- [ ] 6.5 `igor budget` names a figure that came from a probe, or says a seat was probed and
      returned nothing, so an operator can tell a probed seat from an unread one. **May be
      reworded**
- [ ] 6.6 The two limits are settled (Adam, 2026-09-27): at most one probe per seat per hour, and
      five hours before re-probing after a probe that got no event. Build them as constants, not
      configuration
- [ ] 6.7 A probe answered with an authentication failure (401) appends its row to
      `executions.ndjson` (a row of its own kind, #101's task 2.3) carrying `seat:<id>:credential`
      and the credential's full hash, which opens the seat's credential condition as #101 rebuilds
      it. A probe that succeeds appends a check row of `seat:<id>:credential` that found the
      condition not holding (`met: false`), which clears it. A 401 is not "no
      event": the five-hour back-off does not follow it. A seat whose stop is open is selected by
      6.1 as a clearing check whatever its readings, still under the hourly limit and the refusal,
      overage and line exclusions. Tests: a 401 opens the stop and records nothing; a success clears
      it and records its reading; a stopped seat is not re-probed within the hour
- [ ] 6.8 **A seat is probed at its crossing before it is drawn on again** (Adam, 2026-10-10).
      Where the gate (7.2, 7.3) finds that the line has risen past a seat's most recent unreset
      reading, and that reading was at or past the line when taken, it starts no work on the seat
      and selects it for a probe (6.1); the next gate call decides on the probe's reading. A probe
      that records nothing leaves the gate deciding on the old reading. The hourly limit (6.6)
      holds a seat probed within the hour. Tests: the three crossing scenarios in *A seat nothing
      has read is probed on the Igor server with its own token*, and a seat probed within the hour
      before its crossing staying held until the hour has passed

## 7. The line, in `src/budget.ts`'s gate (replaces the dollar bound)

- [ ] 7.1 `lineFor(reserve, resetsAt, length, now)` — pure, the only place the line is computed:
      `1 − r × clamp((resetsAt − now) ÷ length, 0, 1)`, with `remaining` = 1 where `resetsAt` is
      absent or does not resolve. `r` is `max(seat.reserve, role.reserve ?? 0)` (section 12).
      Tests: the table in `design.md` (0, 0.3, 0.5 and 1, at each column), clamping before and
      after the window, an unresolved reset
- [ ] 7.2 **Derived path.** Replace the dollar bound in `derivedWindow` (`src/budget.ts`):
      the allowance `(1 − seat.reserve) * capacity.capacityUsd`, `overBound` / `overWhy`, the
      no-figure branch and `remainingUsd`. A window is
      blocked when its newest unreset reading (4.4) is at or past its line, with a reason naming
      the reading, its time and the line. A window with no unreset reading is blocked only where
      `r` > 0, with its own verdict and reason, not `no-figure`. A refusal (`bound.spent`) still
      blocks as it does, and its reset still reaches the handoff
- [ ] 7.3 **Live path.** The live `/usage` read stays (`design.md`, *What is not removed*; task
      9.1) until the first change built after #171's code lands removes it (decision 37). Replace today's fixed reserve line with
      decision 1's line, which rises toward the reset, in `seatStatus` / `hasHeadroom`
      (`src/budget.ts`): `headroomPercent = line × 100 − percentUsed`, with the live
      reading's reset resolved through `resolveRecentReset` and `remaining` = 1 where it does not
      resolve. Its callers: `chooseSeat`'s live path (its passed-over and chosen reasons),
      `budgetGate`'s shut windows and `renderBudget`'s live rows
- [ ] 7.4 `chooseSeat` (`src/budget.ts`): the chosen-seat reason on the derived path says the
      headroom to the line rather than dollars of the session bound, and the "no capacity figure
      and no reserve" wording goes. Its doc comment ("judged on `bounds` instead, in dollars") is
      reworded
- [ ] 7.5 Verdicts and states. `SeatVerdict` (`src/budget.ts`) replaces `no-figure` with a
      verdict for a seat with no unreset reading (e.g. `unread`) and adds one for a seat at its
      line (e.g. `holding`); its comment drops "`no-figure` to `igor observe` or a declared
      capacity". Where #101 has merged, `SeatVerdict` also holds its `rejected` verdict, which
      stays. `NO_CAPACITY_FIGURE` and `hasBoundHeadroom` go. `poolVerdict` orders the new
      verdicts, `rejected` included. `derivedReset` states the instant a seat holding back passes
      its line (section 13), and keeps "not known" for an unread one. The handoff text in
      `src/handoff.ts` that says "no seat has a capacity figure to spend against" says "nothing
      has read" and "holding back" instead. The `capacity_estimate` example in `src/keys.ts`'s
      doc comment is reworded
- [ ] 7.6 `WindowState` (`src/budget.ts`): `at-bound` and `bounded` become states on the
      line (e.g. `holding`, `within`); `unobserved` and `unmeasured` become one `unread` state;
      `describeWindow` is rewritten around the reading and the line: the allowance,
      `overBound` / `overWhy`, the no-figure branch and its consequence (including "run
      `igor observe`"), and the at-bound / bounded branches. The capacity figure stays in the
      note, as information. `WindowReport.used` shows the reading in percent where there is one
- [ ] 7.7 A running item is not stopped when a reading reaches the line; the next gate call finds
      the reading and starts nothing. Test it
- [ ] 7.8 Tests to rewrite in `test/budget.test.ts`, each against the line rather than the dollar
      bound, every test inside each of these `describe` blocks: 'headroom is percent, straight
      from the reading' (including 'gives a dedicated seat the whole limit'), 'a seat sitting
      exactly on its reserve', 'a seat sitting exactly on its dollar bound' (which becomes a seat
      exactly on its line), 'pool order is the allocation mechanism', 'the gate the loop
      consumes', 'an operator can tell the states apart from the report alone', 'a pool nobody
      could read is not a pool that ran out', 'a seat nothing can read is bounded by observation
      and record', 'a seat the provider refused is spent until it resets' and 'regression: what
      the hunt on §5 found'. In `test/handoff.test.ts`, 'names an uncalibrated pool as
      uncalibrated rather than as spent'. In `test/capacity.test.ts`, 'the bounds the gate is
      handed' (`:538`) and 'a window read and still uncalibrated is not a window nobody has read'
      (`:587`)
- [ ] 7.9 New tests: a reserved seat with a reading below its line and no capacity figure is
      chosen; one at or past it is passed over; one with no unreset reading is passed over at
      `r` > 0 and chosen at `r` = 0; the line rises with time on unchanged readings; both windows
      must pass; a capacity figure changes no verdict
- [ ] 7.10 `budget_share` is measured against the reading on every path (Adam, 2026-09-28). On
      the derived path in `chooseSeat` replace
      `(capacity.spentUsd / capacity.capacityUsd) * 100` with the window's newest unreset reading
      (4.4), passed to `roleSharePercent` exactly as the live path does. A window with
      no unreset reading gives the ceiling nothing to measure, and the no-reading rule decides the
      seat. Afterwards no gate reads `capacityUsd`. Update 'budget_share is a ceiling, not a
      reservation' (`test/budget.test.ts`) and add a test that a share is reached on a seat
      with a reading and no capacity figure
- [ ] 7.11 **A handoff states the crossing for a window the line shut** (moved from #74,
      `reset-by-comparison`, Adam, 2026-10-10). Where `budgetGate`'s `live` candidate builder, and
      `derivedReset` on the derived path, find a window shut below 100%, the hour is the line's
      crossing, `resetsAt − (1 − reading) ÷ r × window length`, with `resetApproximate` set. A
      window at 100% still states its reset. Where both windows are shut, the later of the two
      hours is stated, as #74 requires. Tests: the two scenarios of *A handoff for a window the
      line shut states its crossing, marked approximate*, and a seat shut in both windows where
      one window's crossing is later than the other's reset

## 8. Window length and schedule

- [ ] 8.1 The post-reset probe: for each seat, schedule a seat probe ten minutes
      after each reset a reading has stated, once per window type until measured, then again about
      weekly. It goes through 6.1's selection, so every limit and exclusion applies. Where one is
      excluded, its measurement waits for the next known reset, but the seat is still read: it
      falls to 6.1's ordinary probe as soon as no exclusion applies
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
- [ ] 8.5 Change `resetAnchor` (`src/capacity.ts:223-233`), `instanceBounds` (`:93`) and
      `currentInstance` (`:360`) so they tile instances only on a measured fixed schedule, and
      place an instance that starts at first use only from its own reset. This affects the reported capacity only
- [ ] 8.6 Tests: fixed schedule from a probe ten minutes after a reset; first use from the same;
      the ambiguous case asks for a second probe at another delay; a post-reset probe skipped by
      the hourly limit or the line; a longer length measured after a reset is used; a longer
      passive one is not; a shorter passive one is; before any measurement the built-in length
      and fixed schedule are used and reported as built-in
- [ ] 8.7 Test that a long gap between readings raises nothing and records nothing for the gap

## 9. Withdrawing `igor observe` (gate two)

- [ ] 9.1 Remove the `observe` command from `src/cli.ts`, and `observeSeat`, `seatToObserve` and
      `reported` from `src/capacity.ts`. Keep `readUsage`, `parseUsage`, `runUsage` and
      `hasSubscription` in `src/budget.ts`: `readAllSeats` still reads live through them, until
      the first change built after #171's code lands removes them (decision 37)
- [ ] 9.2 Remove `test/observe.test.ts`. Keep the `source: 'usage'` fixtures in the other tests:
      they are existing rows, which must still be read
- [ ] 9.3 Reword the remedies in `src/budget.ts` that send an operator to `igor observe`
      (`SeatVerdict`'s comment, `WindowState`'s comment, and the "run `igor observe …` on the
      owner's machine" consequence in `describeWindow`) to what starts a seat now: a reading below
      its line, from a run or the probe. Also the `whyNoFigure` comment in
      `src/capacity.ts` that says an unread seat "wants `igor observe`". Update the tests that
      assert the old text
- [ ] 9.4 Leave `Observation.source`'s `'usage'` member in place, and test that a `usage` row is
      still read while nothing writes one
- [ ] 9.5 Verify that `README.md`, `docs/deployment.md` and `docs/seats.md` still name no
      `igor observe` command and no `capacity_estimate`

## 10. Docs

The docs on this branch already describe the behaviour once this change's implementation merges:
the stream reading, the probe, the line, a role's reserve, and no dollar bound, `igor observe` or
`capacity_estimate`. They carry no "not built" or "until it ships" wording, and none is added.

- [ ] 10.1 Verify `README.md` Budgets, `docs/seats.md` and `docs/deployment.md` step 4 against
      the implementation, and correct any statement it makes untrue, including what 1.1 decides
      about the seat probe
- [ ] 10.2 Verify `docs/architecture.md` §6.3, §6.3.1, §6.3.3 (*What Igor does with it*), §6.3.4
      and §6.5 the same way
- [ ] 10.3 Replace the example `igor budget` output in `README.md` with output the implementation
      actually prints, keeping the same seats and readings

## 11. Left open, recorded so they are not lost

- [ ] 11.1 Triage: capture whether `--output-format json`'s single envelope carries
      `rate_limit_info`, and record the answer in `design.md`
- [x] 11.2 `MODIFIED`, `RENAMED` and `REMOVED`-plus-`ADDED` deltas for the in-force passages
      `design.md` lists under *In-force text this overtakes* — written in gate one, on Adam's
      decisions of 2026-09-27 and 2026-09-28, and archive-tested in a scratch copy

## 12. A role's reserve, and a reserve on any seat

- [ ] 12.1 `src/role.ts`: an optional `reserve`, a number from 0 to 1 inclusive, beside
      `budget_share` in the role's fields, its key list and its parser, refused outside that
      range. Inheritance raises, never lowers (Adam, 2026-09-28; role-config's *A role's reserve
      is raised by inheritance and never lowered*): resolve the effective reserve as the largest
      along the role's parents and `roles/org.yaml` (where `budget_share` takes the smallest), a
      role declaring none inheriting its parent's. A child declaring a reserve below its parent's
      is refused, naming both values and both roles, as the parser does for a raised
      `budget_share`. Tests in `test/role.test.ts`: raise accepted, lower refused naming both,
      none inherits
- [ ] 12.2 The gate takes the role's reserve (`chooseSeat`'s and `budgetGate`'s `role` parameter
      in `src/budget.ts`) and uses `max(seat.reserve, role.reserve ?? 0)` for the line
      on every seat the role draws on
- [ ] 12.3 `parseOrgBudget` (`src/budget.ts`): remove the refusal "is dedicated, so nobody is there
      to reserve capacity for", stop forcing a dedicated seat's reserve to 0 (it defaults to 0),
      and accept a reserve of 1 (the range check's `reserveRaw >= 1` becomes `> 1`). The `Seat`
      interface's comments ("Fraction of the limit Igors must not consume", "its reserve is
      zero", and the `capacityEstimate` comment that a reserved seat with no figure is passed
      over) are reworded. Rewrite 'rejects a reserve on a dedicated seat'
      (`test/budget.test.ts`) to accept it, and add a test for a reserve of 1
- [ ] 12.4 Tests: `frontend` at 0.3 and `generalist` at none on one seat, with a reading between
      their lines, choose for `generalist` and not for `frontend`; a role at 0.2 on a seat at 0.5
      uses 0.5; a role reserve with a dedicated seat is valid; one out of range is refused
- [ ] 12.5 `igor budget` shows, per seat and window, the line each role drawing on it checks where
      a role's reserve is larger than the seat's. **May be reworded**

## 13. Holding back, from `budget-pacing`

- [ ] 13.1 A gate that chooses nothing because every seat is at or past its line returns the
      holding verdict (7.5), distinct from `spent`, from an unread seat and from an empty queue,
      and the cycle report and decision record name it. Where the role's seats are passed over
      for different reasons, the record names each seat with its own reason
- [ ] 13.2 `igor budget` says a seat is holding back and names the instant its line reaches its
      reading, `resetsAt − (1 − reading) ÷ r × length`. **May be reworded**:

      ```
      holding back — 94% used at 2026-09-27T14:02:11.000Z is past its 91% line; the line reaches it at 2026-09-29T08:00:00.000Z
      ```

- [ ] 13.3 Test that an operator can tell holding back, a refusal, an unread seat and an empty
      queue apart from the record alone; that a cycle whose seats are passed over for different
      reasons names each seat's reason; and that a seat whose readings have all reset is
      reported as unread, not as at its line or refused

## 14. Removing `capacity_estimate`

- [ ] 14.1 Remove the key (Adam, 2026-09-28). In `src/budget.ts`: `Seat.capacityEstimate` and its
      comment, `DeclaredEstimate`, `parseDeclaredEstimate`, its call and field in
      `parseOrgBudget`, and the declared-capacity wording in `describeWindow` ("or declare a
      capacity_estimate"). In
      `src/capacity.ts`: the `declared` basis of `CapacityFigure` (`:154`) and `CapacityAndSpend`
      (`:409`), `capacityFor`'s declared argument and fallback (`:276`), and `boundsForSeats`'
      `capacityEstimate` input and rolling-window branch for a declared figure (`:504`, `:528`,
      and the rolling-window comment around `:560-568`). The `capacity_estimate` example in
      `src/keys.ts`'s doc comment
- [ ] 14.2 Take `capacity_estimate` out of `SEAT_KEYS` (`src/budget.ts`). Add no message of
      its own: the generic unknown-key refusal is all an old config gets (Adam, 2026-10-11)
- [ ] 14.3 Tests: remove or rewrite the tests that
      declare it: every test in `test/budget.test.ts` that sets `capacityEstimate` or
      `capacity_estimate`, and
      `test/capacity.test.ts` 'a declared capacity' (`:448-490`) and `:569-571`
- [ ] 14.4 Verify that `README.md` doesn't mention `capacity_estimate`

## 15. After #101 merges

#101 (`condition-backoff`) is approved and about to merge. Once it has, and its stuck-conditions
requirements are in force:

- [ ] 15.1 Move the credential rules of *A probe checks the credential too*, and task 6.7 (a probe's
      401 row), out of seat-budget into a stuck-conditions delta written against #101's text (Adam,
      2026-10-17). In it, a probe's 401 counts as one occurrence of `seat:<id>:credential`, as a
      run's does, so one probe 401 no longer opens the condition alone: it opens once its occurrences
      reach #101's recurrence threshold. A probe that succeeds clears the condition; how else
      #101 clears it is unchanged. That clearing probe keeps this change's limit of once an hour,
      and does not wait for #101's cooldown, which grows from 15 minutes to 6 hours (Adam,
      2026-10-17). The delta modifies #101's *A seat's refused credential is a condition on that
      seat*. #171 (`seat-files`) modifies the same requirement and archives after this change, in
      the same commit, so #171's block would replace this delta's. #171's block must therefore
      carry this delta's rules too: when writing this delta, tell #171. #171 also carries a
      `MODIFIED` block on *A seat nothing has read is probed on the Igor server with its own
      token* (proposal, decision 18), so moving *A probe checks the credential too* out of that
      requirement has to be matched in #171's block.
      When writing that delta, also update the sentence in `docs/architecture.md` that says one
      probe 401 opens `seat:<id>:credential`
- [ ] 15.2 `condition-backoff/design.md` (from #101), `concurrent-instances/design.md` and
      `archive/2026-10-10-reset-by-comparison/design.md` link to `docs/architecture.md` §6.3.4 by
      the anchor `#634-…specified-on-143-not-built`. This change renames the heading to
      "— **built**", so update the three links to the anchor the renamed heading generates. The
      archived link is broken on this branch already, since the heading is renamed here; fix all
      three in gate two
- [ ] 15.3 #101's stuck-conditions spec and its task 3.3 say "from pacing". Pacing is withdrawn
      here; the state is "holding back at the line". Once #101's stuck-conditions spec is in
      force, change that wording in it

## 16. Archiving

- [ ] 16.1 Archive this change and `seat-files` (#171) together, in one commit (Adam, 2026-10-17).
      Archived alone, this change would leave the in-force pool requirement naming
      `capacity_estimate`, which it removes; only `seat-files` removes that requirement. Run the
      `openspec archive` steps in the order issue #204 holds, which runs this change's before
      `seat-files`'; every change #204 places between the two archives in that same commit too.
      This change goes first because `seat-files`' deltas are written against this change's text. Do 15.1
      first: until it is done, one probe 401 here opens a seat condition that #101 opens only at
      its threshold. Before archiving, check that #171's `MODIFIED` blocks on *A seat nothing has
      read is probed on the Igor server with its own token* and *A role may hold back more of a
      seat than the seat does* carry this change's current text of both, since #171's blocks
      replace them
- [ ] 16.2 If #196 (spec-trace) has merged by the time this change archives, its CI fails each new
      scenario with no tagged test. Tag a test for each scenario this change adds
- [ ] 16.3 Before archiving, check that every other change modifying role-config's *A role
      declares its sources, lane, behaviour, permissions, and reviewers* or *Merge semantics
      differ by field kind* (among open changes, #153 and `lore-from-corrections`)
      carries `reserve` in its copy, since a later block replaces this change's
- [ ] 16.4 Before archiving, file as an issue the removal of the live `/usage` read in the first
      change built after #171's code lands (decision 37), naming the functions it removes, the
      edits to `runUsage` in #174's and #175's tasks that go with them, and task 6.1's skip of a
      seat with no token, and tick this task with a
      pointer to it
