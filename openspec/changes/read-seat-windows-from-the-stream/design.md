## Context

The finding is recorded in `docs/architecture.md` §6.3.3 and not repeated here beyond what the
decisions need. In short: a `setup-token` credential cannot read its windows through `/usage` or
the usage endpoint, and does receive them in a `rate_limit_event` on the stream every worker run
already produces. The event's fields:

| field | meaning |
|---|---|
| `status` | `allowed`, `allowed_warning`, or `rejected` |
| `surpassedThreshold` | present with `allowed_warning`: the fraction crossed, e.g. `0.75` |
| `rateLimitType` | the window the top-level `utilization`/`resetsAt` describe: `five_hour` or `seven_day` |
| `utilization`, `resetsAt` | 0..1, and epoch seconds, for that window |
| `unifiedWindows.<window>` | `utilization` and `resetsAt` for every window, whichever is warned about |
| `isUsingOverage` | whether extra usage (usage credits) is being spent |

What is measured and what is not, carried into every decision below:

- **Measured:** one capture, on one seat, past 75% of its week, with status `allowed_warning`.
- **Known without numbers:** events appear on ordinary runs. `progress-timeout` saw them with
  `status: "allowed"` and `rateLimitType: five_hour`; whether those carried `utilization` and
  `unifiedWindows` was not recorded.
- **Unverified:** that a seat below every threshold reports the numbers; the `rejected` shape,
  contributor-reported as `status: "rejected"`, `utilization: 1` and a non-zero exit (#57, #15).
- **Absent:** per-model weekly windows.
- **Undocumented:** the event itself. Reading it is an optimisation and never a correctness
  dependency.

## Decisions

### Where it is read: the worker's stream consumer, kept beside the result

`claudeWorker`'s `consume` in `src/execute.ts` already parses every line and keeps the one with
`type === 'result'`. It keeps the last `rate_limit_event` the same way, with the instant it
arrived, and returns both. Parsing is tolerant in the way `asIso` and `limitSignals` already are:
a missing field, a wrong type or an unknown window name yields no reading for that window, never
a throw on the stream path — a throw there abandons the rest of the chunk, which is where the
terminal event is.

### One reading per run: the last event received

A run can carry several events. Within one window instance fullness only rises, so the last event
is the freshest lower bound and the earlier ones add nothing it does not. A row per event would
grow `capacity.ndjson` by the length of the run for no information. If a window resets mid-run,
the last event describes the new instance, which is the one that bears on the present.

### Timestamped at arrival, not at the end of the run

`capacityFor` divides the spend recorded inside `observedSpan` — the instance, up to the
observation's `at` — by the fullness it reports. A run's spend is stamped when `recordExecution`
runs, after the run. So:

- **`at` = when the event arrived.** The run's own spend falls after `at` and is excluded. The
  reading may already include some of the run's consumption (the figures are presumably relayed
  from the first API response's headers), so the numerator is slightly low against its
  denominator and the capacity slightly low. That is the safe direction, the same one
  `capacity-from-observation` already accepts from a co-consumer.
- **`at` = when the run ended** would count the whole run's spend against a fullness measured
  before most of it. Capacity comes out high: the unsafe direction. This is not a precision
  preference; it decides which way the error falls.

Concurrent runs on one seat whose spend is recorded after `at` but was consumed before it are
excluded the same way, and err the same way.

### Whose reading it is: the seat the gate chose

The worker's environment is written out, and carries exactly the token of the seat the gate chose
(§6.3.2). So the reading is attributed to that seat, the one `recordExecution` already names as
having paid. A seat naming no token source runs on the ambient login and is still the seat the
gate chose, so its reading is attributed to it too — which is exactly as true as the existing
claim that it paid.

### The record: the existing shape, two sources, and a route

A stream reading is written as the `Observation` `capacity-from-observation` defines, through
`recordObservation`, to `capacity.ndjson` — one row per window the event reports, with
`percentUsed = utilization × 100`, `resetsAt` from epoch seconds, `five_hour` → `session` and
`seven_day` → `week`. A window name the code does not know is not recorded as either.

The in-force requirement says an observation records "which of two sources it came from: a
usage reading, or a provider limit error", and argues for one record type because the two say the
same thing. A stream reading is a usage reading by that argument, so it is `source: "usage"`; a
`rejected` event is a refusal, so it is `source: "limit"`. What distinguishes it is how it was
obtained, not what it asserts, so it carries a new optional field, `via: "stream"`, and a row
without one came from `/usage` or from the envelope as today. Reporting uses `via` to say where a
figure came from, which *Budget reporting states what each seat has left* already requires.

The event-level fields — `status`, `surpassedThreshold`, `isUsingOverage` — are recorded on the
row for the window `rateLimitType` names; `isUsingOverage`, being about the seat, on every row
from the event.

**Open for the reviewer:** whether `stream` should instead be a third `source`. That is the more
literal record and contradicts the in-force "two sources" wording, so it would need a `MODIFIED`
delta on *An observation records how full a window was, and when it resets*. The field avoids
that; it does not make the question go away.

### A refusal is recorded once

Today a refusal is recognised from the terminal envelope by `usageLimit` and recorded at 100% by
`recordExecution`. A run whose stream also carried a `rejected` event would write that fact twice.
The stream's reading wins when both exist: it names the window and a machine-readable reset,
where the envelope path guesses the window from the reset's distance (`limitWindow`). The envelope
path stays as the fallback for a refusal with no event, which is every refusal until the `rejected`
shape is confirmed.

A `rejected` event on a run the envelope calls successful (`is_error: false`) is recorded as a
reading at what it says, not as a refusal — `usageLimit`'s rule that a finished run is not an
exhausted seat applies to the stream too.

### A stale reading is a lower bound until its window resets

Fullness only rises within one window instance. So a reading taken at `at` says the window is
*at least* that full at every later moment up to `resetsAt`, and nothing at all about the instance
after. That settles staleness without a threshold:

- Until `resetsAt`, a reading may be used as a lower bound however old it is. Reporting shows it
  as one, with its time.
- After `resetsAt`, it no longer describes the present. It stays in the log as calibration, the
  expiry-is-not-deletion rule already in force.
- A reading with no resolvable reset places no boundary and expires one window length after it
  was taken, as the in-force rule for any observation does.

What a lower bound on fullness is *used for* beyond reporting — for instance refusing work once a
seat-wide figure passes `1 − reserve` — changes what a reserve means (a cap on Igor's spend today,
a floor under the owner's use then) and is left open. See *Still open*.

### Newest-wins, against `src/capacity.ts`

`capacityFor` takes the newest observation that divides into a figure; `resetAnchor` takes the
newest that resolved a reset; `spentFor` takes the latest-expiring unexpired row at 100%. Stream
readings need no new selection rule. They will usually be the newest rows, and that is the
point: after every worker run the estimate is re-derived from a reading one run old.

Two consequences worth stating:

- **On a shared seat the dollar capacity is still low.** The numerator is Igor's spend, the
  denominator the whole seat's fullness. That is unchanged from the in-force text and still in
  the safe direction. What is new is that readings now arrive often enough for two in one instance
  to bracket an interval the owner sat out, where the difference in fullness against the spend
  between them gives capacity without that error. Which readings to combine that way is left to
  the season of data `capacity-from-observation` §3 already asks for. Reported to two decimals, a
  reading resolves one percent, so a difference is informative on the session window well before
  it is on the week.
- **A reading at 0% derives nothing**, as today. A fresh window is not evidence of infinite
  capacity.

### `allowed_warning`: recorded and reported, no gate decision of its own

The warning says the provider's threshold was crossed. `utilization` already carries the same
fact in finer grain, and the threshold is the provider's, not the operator's — the operator's is
`reserve`. So the warning changes no gate decision in this change. It is recorded, and `igor
budget` shows it, because a seat the provider is warning about is worth an operator's glance.

Two uses are left open and assigned:

- **As a pacing input** — slowing down before a cap rather than stopping at one — it belongs to
  `budget-pacing`, which owns the pace line.
- **As a proactive wind-down inside a running worker** — handing off before the refusal rather
  than after — it would be a change to graceful handoff. Not proposed here: the reactive handoff
  is what is known to work, and a warning past 75% of a week can precede the cap by days.

### `isUsingOverage`: a seat spending extra usage is spent

`isUsingOverage: true` says the subscription's window is past its cap and further use is being
billed as extra usage — money, beyond what the seat was lent for. No reserve anybody declared
contemplates that, and a seat's owner who lent a subscription did not lend a card. So an unexpired
reading with `isUsingOverage: true` is treated like an unexpired observation at 100%: no
headroom in that window until its reset, independently of any capacity estimate.

**Flagged for the reviewer:** whether a seat should be able to opt in — an owner who wants the
fleet to spend extra usage. Nothing here adds a key for it; `strict-config-keys` would refuse one
until a change declares it.

### Triage's model call produces no reading, as invoked

`runClaude` in `src/triage.ts` spawns `claude -p … --output-format json` with no `--verbose`, and
`parseEnvelope` keeps `result`, `total_cost_usd` and `is_error` and discards the rest. Buffered JSON
prints one terminal envelope and no stream events, so **no `rate_limit_event` reaches Igor from
triage.**

Whether that buffered envelope repeats the reading as `rate_limit_info` is **unverified**.
`WorkerOutput` in `src/execute.ts` types a `rate_limit_info` on the terminal event "in whatever
shape the envelope repeats it from the stream", but every fixture that sets it in
`test/execute.test.ts` is hand-written; none is a capture. Finding out means spending a triage
call on a seat, which this change does not do.

Two ways to get one, neither decided here: switch triage to `stream-json --verbose` as the worker
runs, or read `rate_limit_info` off the JSON envelope if a capture shows it is there. **Which
change owns that is flagged for the reviewer:** #55 says the question is being settled on #75
(`triage-refusal-calibrates`), which records a triage *refusal*; a triage *reading* is the
general case of the same plumbing. This change leaves #75's branch alone and requires nothing of
triage.

### Degrading to today

No event, a malformed event, or an event with no numbers produces no row, and the run is recorded
exactly as it is today. Nothing waits on an event, nothing is refused for lacking one, and the
envelope-based refusal path is not removed. A seat whose runs stop carrying readings falls back
to the observations and record it had, which is the in-force behaviour.

## In-force text this overtakes

`openspec validate` does not cross-check deltas against the prose of requirements they do not
touch. These passages in `openspec/specs/seat-budget/spec.md` state the premise this change
removes, and stay false-by-omission once it is implemented:

- ***Usage is read from the seat, not supplied by a person*** — "The credential a seat holds is a
  `setup-token` one, which carries no subscription identity, so the provider reports a
  per-invocation cost summary instead of window percentages and there is nothing to read." True of
  `/usage`; false of the stream.
- ***An observation records how full a window was, and when it resets*** — "which of two sources
  it came from". Accommodated by `via` above rather than contradicted; see the open question.
- ***Recorded spend attributes a seat between its roles*** — "The record is the only quantity
  available for both questions on a seat whose credential reports no window." A seat's credential
  does report its windows.
- ***A seat with no capacity figure at all protects no floor*** — "What it requires is a machine
  with such a login — the seat's owner — rather than the seat's own credential." The seat's own
  credential suffices, through the stream.

**Flagged for the reviewer:** whether this change should also carry `MODIFIED` deltas rewording
these four, or leave them for a follow-up once the reading is built. This change carries `ADDED`
requirements only, as briefed.

## Still open

- **A seat below every threshold.** If ordinary events carry no numbers, a fresh seat still gets
  no reading until it crosses one, and the in-force paths (a declared figure, a refusal, `igor
  observe`) remain its only start. A fresh seat's first run settles it; task 1.1 asks for that
  capture before the rest is built against it.
- **A reserved seat with no figure is never run, so never read.** The in-force rule passes it over,
  and a stream reading needs a run. It still starts from a declared `capacity_estimate`, a period
  at `reserve: 0`, or `igor observe` — or from a deliberate small probe run under its own token,
  which costs something and is specified nowhere. `scheduled-observation`'s `design.md` records
  the same gap from the other side.
- **The `rejected` shape** (#57). The single-row rule above is written against the
  contributor-reported shape and must be checked against the first captured refusal.
- **Whether a seat-wide reading past `1 − reserve` should stop Igor.** It would turn the reserve
  from a cap on Igor into a floor under the owner. That is a change to what a reserve means and
  belongs with `budget-pacing`'s adaptive reserve, not here.
- **Per-model weekly windows** still need another source.
