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
shared seat need no longer depend on a job on its lender's laptop.

## What Changes

- **A worker run's `rate_limit_event` is read and recorded as an observation of the seat that
  paid for the run** — both windows' fullness and reset, the event's status (including
  `allowed_warning` and the threshold it crossed), and whether extra usage is being spent.
- **It is timestamped when the event arrived**, not when the run ended, so the capacity division
  never counts the run's own spend against a fullness figure taken before it.
- **One run contributes one reading** — the last event it received — however many events the
  stream carried.
- **A reading bounds the window from below until that window resets**, and says nothing about
  the instance after.
- **A seat reported spending extra usage is not spent from** in the window the event is about,
  until that window resets.
- **A refusal is recorded once.** A run whose stream carries a `rejected` event and whose
  envelope also trips `usageLimit` records one observation, not two.

This is an optimisation, never a correctness dependency. The event is undocumented and could
change or vanish without notice; every behaviour it adds has to degrade to what the loop does
today — reactive handling of a refusal, bounds from recorded spend and observations — when it is
absent or malformed.

Explicitly out of scope:

- **Triage's model call.** As invoked it produces no reading (see `design.md`); whether to change
  that, and where, is open.
- **Pacing and the reserve's meaning.** `allowed_warning` and a seat-wide fullness figure are
  inputs `budget-pacing` may consume; this change records them and decides no pacing behaviour.
- **Per-model weekly windows.** The event carries none.
- **Rewording the in-force requirements whose premise this overtakes.** Listed in `design.md`;
  whether this change should also carry `MODIFIED` deltas for them is a reviewer's decision.

## Capabilities

### Modified Capabilities

- `seat-budget`: a worker run's own output stream is a source of observations of the seat that
  paid for it, read with that seat's credential.

## Impact

- `src/execute.ts`: the stream consumer keeps the last `rate_limit_event` beside the terminal
  `result`, and `recordExecution` writes it through `recordObservation`.
- `src/capacity.ts`: the observation shape gains optional fields; `capacityFor`, `spentFor` and
  the gate read the new rows through the paths they already have.
- `capacity.ndjson` grows by up to two rows per worker run, at the execution log's rate rather
  than a refusal's. It is still read whole; whether it should stay so is open in `design.md`.
- `igor budget` can name a figure's route and show the provider's warning and overage state.
- Every caveat in §6.3.3 carries over: whether a seat below every threshold reports numbers is
  unverified, and the `rejected` shape is contributor-reported, not captured (#57, #15).
