## Why

Every worker run already carries a reading of the seat that paid for it, and Igor throws it
away.

A worker is spawned with `claude -p … --output-format stream-json --verbose` under the seat's
own `setup-token` credential (§6.3.2). Measured on 2026-09-27
([`docs/architecture.md` §6.3.3](../../../docs/architecture.md#633-a-seat-token-is-measured-from-the-workers-own-stream)),
that stream includes a `rate_limit_event`:

```json
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1790982000,
 "rateLimitType":"seven_day","utilization":0.86,"isUsingOverage":false,"surpassedThreshold":0.75,
 "unifiedWindows":{"five_hour":{"utilization":0.07,"resetsAt":1790569200},
                   "seven_day":{"utilization":0.86,"resetsAt":1790982000}}}}
```

Both windows, how full each is, when each resets, whether the provider is warning, and whether
extra usage is being spent — for the whole seat, owner's use included, taken with the seat's
own credential and nobody signed in. `src/execute.ts` keeps only the terminal `result` event
and discards this one.

The in-force `seat-budget` text was written on the opposite premise: that a `setup-token`
credential yields no window reading at all, so a seat is bounded by recorded spend against
observations taken elsewhere — a limit error, or `igor observe` run on the owner's machine. That
premise was true of where the reading was looked for (`/usage`, and `GET /api/oauth/usage`,
which refuses the credential for want of `user:profile`) and false of the stream.

So a dedicated fleet seat need no longer wait for its first refusal to be calibrated, and a
shared seat need no longer depend on a job on its lender's laptop. Adam has decided that no such
job should exist: services and queries run on the server that runs the Igors, which holds the
tokens and the seat config.

## What Changes

- **A worker run's `rate_limit_event` is read and recorded as an observation of the seat that
  paid for the run** — both windows' fullness and reset, the event's status (including
  `allowed_warning` and the threshold it crossed), and whether extra usage is being spent.
- **It is timestamped when the event arrived**, not when the run ended, so the reported capacity
  never counts the run's own spend against a fullness figure taken before it.
- **One run contributes one reading** — the last event it received — however many events the
  stream carried.
- **A reading bounds the window from below until that window resets**, and says nothing about
  the instance after.
- **A seat reported spending extra usage is not spent from** in the window the event is about,
  until that window resets.
- **A refusal is recorded once.** A run whose stream carries a `rejected` event and whose
  envelope also trips `usageLimit` records one observation, not two.

- **A seat nothing has read is probed on the server that runs the Igors**, with its own token: a
  minimal call on the cheapest model, read for its `rate_limit_event` and recorded as a `stream`
  reading. The probe is not free, and its cost is recorded. It is rate-limited, never runs on a
  refused seat, and never runs on a person's machine. It is built only if a seat below every
  threshold proves to emit the event (task 1.1).
- **The reserve becomes a line on the reading that moves toward the reset** (Adam, 2026-09-28).
  For each window, Igor starts work on a seat only while its most recent unreset reading is below
  `1 − r × remaining`, where `remaining` is the fraction of the window still to come and `r` is the
  larger of the seat's reserve and the role's. The reserve is held back at the start of a window
  and released evenly toward the reset: at 0.3 the line is 70% just after a reset, 85% halfway,
  97% with a tenth left and 100% at the reset. At 0 it is the whole window; at 1 it is even pacing.
  It needs no figure for the owner's use and no dollar capacity, and Igor takes more when the owner
  uses less. It **replaces** the dollar bound `(1 − reserve) × capacity`. A capacity in dollars is
  still derived and reported, and gates nothing. An item already running finishes, so each Igor can
  pass the line by about one run's spend; that is accepted, per Igor.
- **A seat with no unreset reading is drawn on only where its line is 100%**, that is at `r` = 0.
  Any other seat is left to the probe. Calibration admission, which let a reserved seat with no
  figure in one item at a time to get it one, is removed: the line needs no figure. The probe holds
  off a seat at or past its line.
- **No figure in dollars gates anything.** A role's `budget_share` is measured against the
  reading on every path, and `capacity_estimate` is removed; a config that still carries it is
  refused with a message saying to delete the line.
- **A role may declare a `reserve`**, raised by inheritance and never lowered, and applied to every
  seat it draws on. The larger of the seat's and
  the role's governs, so a role can hold back more than a lender and never less. It gives roles on a
  shared seat a priority, not a guaranteed share.
- **A reserve on a dedicated seat is pacing**, holding capacity back for work later in the window.
  It is allowed, from 0 to 1, and a dedicated seat defaults to 0.
- **A window's length, and whether it starts at first use, are measured by a probe just after a
  known reset**, once per window type and then weekly. The smallest gap between observed resets
  stays as a passive fallback that can only shorten the length.
- **Holding back at the line is a reason of its own**, distinct from a refusal, an unread seat and an
  empty queue. It is the one requirement of `budget-pacing` that survives: the line is the pace line,
  so `budget-pacing` is withdrawn and its directory deleted.
- **`scheduled-observation` is withdrawn entirely, `igor observe` included**, and its change
  directory is deleted. Nothing is installed on a lender's machine, and nothing reads a seat
  through a person's login. Its two requirements that still apply, on irregular arrival and on
  measuring a window's length from successive resets, move here, adapted to stream readings.
  `igor observe`'s shipped code is removed in gate two. Existing `usage` rows are still read;
  nothing writes them any more. The reasons, and what is lost, are in `design.md`.

This makes the event a dependency. It is undocumented and could change or vanish without notice.
Without it a run is recorded as today, and nothing fails. But a seat whose line uses a non-zero
reserve is then drawn on only while an older reading is unreset, and goes idle after. That is the
fail-closed direction, and `design.md` records it as the rule's cost.

Explicitly out of scope:

- **Triage's model call.** As invoked it produces no reading (see `design.md`); whether to change
  that, and where, is open.
- **Per-model weekly windows.** The event carries none. With `igor observe` removed, nothing reads
  them for a token seat; capacity never used them, and `igor budget` loses a display line. #75
  task 5.1 is where they are taken up.

## Capabilities

### Modified Capabilities

- `seat-budget`: a worker run's own output stream is a source of observations of the seat that
  paid for it, read with that seat's credential and recorded with a third source, `stream`. The
  reserve becomes a line on that reading that moves toward the reset, replacing the dollar bound,
  and a role may declare a reserve of its own. A seat nothing has read is probed on the Igor server,
  and window length and schedule are measured just after a reset. The in-force passages this makes
  false are corrected by `MODIFIED`, `RENAMED` and `REMOVED`-plus-`ADDED` deltas, listed in
  `design.md`.

## Impact

- `src/execute.ts`: the stream consumer keeps the last `rate_limit_event` beside the terminal
  `result`, and `recordExecution` writes it through `recordObservation`.
- `src/capacity.ts`: the observation's `source` gains `stream`, and the shape gains optional
  fields. Capacity is still derived, for reporting only. Window lengths and the schedule come from
  post-reset probes and observed resets. `observeSeat` and `seatToObserve` are removed.
- `src/budget.ts`: the gate compares each window's newest unreset reading with the moving line,
  on both the live and the derived path, instead of recorded spend with the dollar bound. The
  dedicated-seat reserve refusal and the reserve-below-1 check go. The remedies that name `igor
  observe` are reworded.
- Role configuration gains an optional `reserve`.
- `src/cli.ts`: the `observe` command is removed, with `test/observe.test.ts`.
- The serve loop gains the seat probe.
- `capacity.ndjson` grows by up to two rows per worker run, at the execution log's rate rather
  than a refusal's. It is still read whole; whether it should stay so is open in `design.md`.
- `igor budget` shows each window's reading against its line, per role where a role reserves more,
  says when a seat is holding back, and can name a figure's route and show the provider's warning
  and overage state.
- Every caveat in §6.3.3 carries over: whether a seat below every threshold reports numbers is
  unverified, and the `rejected` shape is contributor-reported, not captured (#57, #15).
