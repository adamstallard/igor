## Decisions

Terms used below. A **seat** is a Claude subscription Igors spend from. A **reading** is the
provider's report of how full a seat's window is, carried in each run's output as a
`rate_limit_event`. A window's **instance** is one stretch of it from one reset to the next. A
**probe** is one minimal model call made on the server that runs the Igors, with a seat's own
token, to get a reading. #101 is `condition-backoff`, which records stuck conditions and is about
to merge; #171 is `seat-files`, which moves seat configuration into one file per seat.

1. **The reserve is a line on the seat's reading that moves toward the reset** (Adam, 2026-09-28).
   For each window, Igor starts work on a seat only while its newest unreset reading is below
   `1 − r × remaining`, with `r` the larger of the seat's and the role's reserve and `remaining`
   the fraction of the window still to come. The **line** rises as the window runs out, and the
   instant it rises past a seat's last reading is the seat's **crossing**. *Rejected:* the
   dollar bound `(1 − reserve) × capacity` on Igor's recorded spend, which needed a capacity in
   dollars for every window before a reserved seat could start, and held the whole reserve back
   until the reset, where whatever nobody used was lost.
2. **A refusal is a reading at 100% of its window until its reset** (Adam, 2026-09-28).
3. **A seat with no unreset reading is drawn on only where `r` is 0** (Adam, 2026-09-28). If the
   provider stops sending the event, reserved seats go idle and `igor budget` says why.
4. **Each Igor process may pass the line by about two runs, and processes do not coordinate.**
   On 2026-09-28 Adam accepted one run, or two where a run's reading comes early in the run. Task
   1.1a measured that it always comes early, right after the first call, so the figure approved
   here is two. *Rejected for now:* a coordination marker across Igors, taken up once a reserved
   seat is actually shared by several.
5. **A role may declare a `reserve`**, applied to every seat it draws on, raised by inheritance and
   never lowered (Adam, 2026-09-28).
6. **A reserve on a dedicated seat is pacing**, from 0 to 1 inclusive, defaulting to 0 (Adam,
   2026-09-28).
7. **A seat nothing has read is probed on the Igor server with its own token** (Adam, 2026-09-27):
   at most once an hour, five hours after a probe that got no event, never on a refused seat, one
   spending extra usage, or one at its line. A seat is probed at its crossing before it is drawn on
   again (Adam, 2026-10-10). *Rejected:* `igor observe` run on a lender's machine;
   `scheduled-observation` is withdrawn with it.
8. **Window length and schedule are measured by a probe ten minutes after a known reset** (Adam,
   2026-09-28). The smallest gap between observed resets is a fallback that only shortens a length.
9. **No figure in dollars gates anything** (Adam, 2026-09-28). `budget_share` is measured against
   the reading, and `capacity_estimate` is removed with no handling of an old config beyond the
   unknown-key refusal (Adam, 2026-10-11).
10. **`budget-pacing` is withdrawn**; its one surviving requirement, holding back at the line, moves
    here (Adam, 2026-09-28).
11. **No overage opt-in** (Adam, 2026-09-27).
12. **`allowed_warning` changes no gate decision; triage switches to the stream only after this is
    built, with #75 the fallback; the observation log is read whole** (Adam, 2026-10-11).
13. **Once #101's stuck-conditions spec is in force, a probe's credential rules move into a
    `stuck-conditions` delta** (Adam, 2026-10-17). There a probe's 401 counts as one occurrence of
    `seat:<id>:credential`, like a run's, so one probe 401 no longer opens the condition alone: it
    opens once its occurrences reach #101's recurrence threshold, which is
    configurable and provisionally 3. A probe that succeeds clears the condition (task 15.1).
    That clearing probe keeps this change's limit of once an hour and does not wait for #101's
    cooldown, which grows from 15 minutes to 6 hours (Adam, 2026-10-17), so a seat whose token
    is fixed is back within the hour. *Rejected:* keeping the probe's own opening rule, a single
    401, beside #101's, which opens the same condition only at its threshold: one condition would
    open by two different rules.
14. **A seat naming no token source keeps its runs' readings, and is never probed** (Adam,
    2026-10-17). Its runs are work the gate put on that seat, which the operator set up to spend the
    server's default Claude login, so their readings are the seat's. A probe is a call Igor makes
    for itself, with no item behind it, and would spend that login, which no seat names as its
    token and which may be a pay-per-use API key or a person's own subscription. #171 refuses a
    seat file that names no token (Adam, 2026-10-17), and archives with this change (decision 16),
    so once #171 is built no seat names no token source and neither rule applies to any seat.
15. **Issue #69, which asks how old a reading may be before the line distrusts it, is closed with
    this change's reasoning once task 1.3 confirms that fullness does not
    fall within an instance** (Adam, 2026-10-17). A reading bounds its window from below until the
    reset, so it needs no age limit (task 1.6).
16. **This change and #171 archive together** (Adam, 2026-10-17). The in-force pool requirement
    names `capacity_estimate`, which this change removes, and only #171 removes that requirement,
    so archiving this change alone would leave in-force text naming a key that no longer exists
    (task 16.1).
17. **The `dedicated` seat key is dropped in #171, not here** (Adam, 2026-10-17). Once this change
    stops refusing a reserve on a dedicated seat and stops forcing its reserve to 0, the key does
    nothing. #171 is where seat keys are declared.

**Still open:**

- **A guaranteed per-role share.** Not specified; added only if a role's reserve proves too weak a
  priority.
- **The `rejected` shape** (#57) is contributor-reported, not captured (task 1.5).
- **Per-model weekly windows** have no source for a token seat (#75 task 5.1).
- **Two facts the gate rests on are unmeasured:** that fullness does not fall within an instance
  (task 1.3), and what `isUsingOverage` means (task 1.4). The overage rule is not built until 1.4
  confirms it.

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
  refused seat, and never runs on a person's machine. A seat below every threshold emits the
  event (task 1.1), so the probe can start a fresh seat.
- **The reserve becomes a line on the reading that moves toward the reset** (Adam, 2026-09-28).
  For each window, Igor starts work on a seat only while its most recent unreset reading is below
  `1 − r × remaining`, where `remaining` is the fraction of the window still to come and `r` is the
  larger of the seat's reserve and the role's. The reserve is held back at the start of a window
  and released evenly toward the reset: at 0.3 the line is 70% just after a reset, 85% halfway,
  97% with a tenth left and 100% at the reset. At 0 it is the whole window; at 1 it is even pacing.
  It needs no figure for the owner's use and no dollar capacity, and Igor takes more when the owner
  uses less. It **replaces** the dollar bound `(1 − reserve) × capacity`. A capacity in dollars is
  still derived and reported, and gates nothing. An item already running finishes, so each Igor
  process can pass the line by about two runs' spend (decision 4).
- **A seat with no unreset reading is drawn on only where its line is 100%**, that is at `r` = 0.
  Any other seat is passed over until a probe reads it.
- **No figure in dollars gates anything.** A role's `budget_share` is measured against the
  reading on every path, and `capacity_estimate` is removed.
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

- **Triage's model call.** As invoked it produces no reading (see `design.md`). Switching it to
  the stream is deferred until this change is built, and #75 is the fallback until then.
- **Per-model weekly windows.** The event carries none. With `igor observe` removed, nothing reads
  them for a token seat; capacity never used them, and `igor budget` loses a display line. #75
  task 5.1 is where they are taken up.

## Capabilities

### Modified Capabilities

- `role-config`: a role's `reserve` is raised by inheritance and never lowered.
- `graceful-handoff`: where the line shut a window whose reading is below 100%, a budget handoff
  states the line's crossing, not the reset.
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
  than a refusal's. It is still read whole, a known limit to revisit before a fleet runs many seats.
- `igor budget` shows each window's reading against its line, per role where a role reserves more,
  says when a seat is holding back, and can name a figure's route and show the provider's warning
  and overage state.
- Every caveat in §6.3.3 carries over: the `rejected` shape is contributor-reported, not captured
  (#57, #15).
