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

### The record: the existing shape, and a third source, `stream`

A stream reading is written as the `Observation` `capacity-from-observation` defines, through
`recordObservation`, to `capacity.ndjson` — one row per window the event reports, with
`percentUsed = utilization × 100`, `resetsAt` from epoch seconds, `five_hour` → `session` and
`seven_day` → `week`. A window name the code does not know is not recorded as either.

**Every row taken from the stream is `source: "stream"`** (decided by Adam, 2026-09-27, in place
of the optional `via: "stream"` field this design first proposed). The in-force requirement said
an observation records "which of two sources it came from"; this change carries a `MODIFIED`
delta on *An observation records how full a window was, and when it resets* making it three:
`usage`, `limit`, `stream`. The argument for one record type is unchanged — the sources say the
same thing — and `stream` records the route, which *Budget reporting states what each seat has
left* needs to say where a figure came from.

Whether a stream row reports a refusal is carried by the event's `status` on the row, not by the
source. A `rejected` event on a run that ended in error is written at 100% of the window it names,
with its reset; that is what makes it a refusal to everything downstream. Nothing in force selects
rows by `source: "limit"`: `spentFor` looks for an unexpired row at 100%, `capacityFor` divides
whatever row is newest, and the budget report prints the source verbatim in the tail of a figure.
So a refusal recorded as `stream` holds the seat shut and lowers the estimate exactly as a `limit`
row would. The envelope path keeps writing `limit` for a refusal the stream did not report.

The event-level fields — `status`, `surpassedThreshold`, `isUsingOverage` — are recorded on the
row for the window `rateLimitType` names; `isUsingOverage`, being about the seat, on every row
from the event.

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
reading with `isUsingOverage: true` is treated like an unexpired observation at 100% of the window
the event was about — the one `rateLimitType` names — with no headroom there until its reset,
independently of any capacity estimate. The flag is recorded on every row from the event, because
it is a fact about the seat at that moment, but it shuts only that window: overage met in a session
says nothing about the week, and shutting the week for it could hold a seat out for days.

**No opt-in (decided by Adam, 2026-09-27).** No configuration key lets an owner allow the fleet
to spend extra usage. Overage costs real money, and a key for it is added only when somebody asks
for one; until a change declares it, `strict-config-keys` refuses it like any other unread key.

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
runs, or read `rate_limit_info` off the JSON envelope if a capture shows it is there. Neither is
required here.

**Who owns what (settled 2026-09-27 by Adam's decision on #75).** #75
(`triage-refusal-calibrates`) is narrowed to a fallback (`08be738` on `triage-refusal`). If
triage ever reads the stream, a triage call's *reading* belongs to this change, including a
refusal that reading reports, which is recorded once under *A refusal the stream reports is not
recorded twice*. #75 records a triage *refusal* only where the call carried no reading. While
triage runs `--output-format json`, that is every triage refusal. Whether triage should switch is
still an open question for this change.

### `scheduled-observation` is withdrawn, `igor observe` included

Decided by Adam on 2026-09-27, in two steps. First, a scheduled job on a seat holder's machine
should not exist. In his words, "Any services or queries need to be done on the server that runs
the igors. It should have the tokens and the seat info in its config." Then, the same day, the
rest of the change goes too, including the shipped `igor observe`. Services and queries run only
on the Igor server. `igor observe` needs an interactive login, so it can only run on a person's
machine. And the stream plus the probe replace what it read.

That was not possible when `scheduled-observation` was written, because a seat's token was
believed to read no windows, so the only sensor was a person's login on their own machine. It is
possible now for two reasons. The seat's own token reads the seat's windows from the stream
(§6.3.3), on the server, with the token already in the server's config. And the seats stream
readings leave unread are read here too, on the same server: a reserved seat with no figure, and
a seat the fleet is not using.

**What is done on this branch.** `openspec/changes/scheduled-observation/` is deleted. None of
its requirements was ever archived into `openspec/specs/`, so nothing in force specifies
`igor observe`, the schedule, or the refusal of a seat credential, and no `REMOVED` delta is
needed. Two of its requirements were neither shipped nor laptop-specific, and they move here as
`ADDED` requirements, adapted to stream readings (see *Moved from `scheduled-observation`*
below). Everything else in it is withdrawn:

- the launchd, cron and systemd timers and their installation procedure;
- the half-hourly schedule, and its premise that the reading is free;
- the refusal of a seat credential, which existed to keep the job on a person's login;
- lending's dependence on push access for the lender's readings;
- `igor observe` itself.

**What is removed in gate two.** `igor observe` is shipped code: the `observe` command in
`src/cli.ts`, `observeSeat` and `seatToObserve` in `src/capacity.ts`, and `test/observe.test.ts`.
It is removed in gate two, along with the remedies in `src/budget.ts` that send an operator to it
and the `scheduled-observation` citations in `src/capacity.ts` and `test/capacity.test.ts`. The
built-in window lengths those citations justify are justified by *A window's length is measured
from successive resets* here. The docs that describe `igor observe` say, until then, that it is
being withdrawn by this change.

**What is not removed.** The live `/usage` read in `readAllSeats` (`readUsage`, `parseUsage`,
`runUsage`, `hasSubscription` in `src/budget.ts`) is not `igor observe`. It reads a seat on the
server, when the gate asks, through whatever credential the seat resolves to, and it produces
the "read live" rows of `igor budget`. It is specified by the in-force *Usage is read from the
seat, not supplied by a person*, which this change does not withdraw. `parseUsage` is shared by
both paths and stays.

**The `usage` source.** Only `igor observe` wrote observations with `source: "usage"`; the live
read never records what it reads. After gate two nothing writes it. Existing `capacity.ndjson`
rows carry it and are still read, because the log is never rewritten and those rows are
calibration. The `MODIFIED` observation requirement says both.

**What is lost: per-model weekly caps for a token seat.** `/usage` prints per-model weekly
limits, and `igor observe` recorded them as week observations carrying `model`. Nothing else
reads them for a seat whose credential is a `setup-token`: the stream event carries no per-model
window, and the live `/usage` read answers such a credential with no windows at all. For
capacity this loses nothing, because `capacityFor`, `whyNoFigure` and `resetAnchor` already skip
any observation with a `model` (`src/capacity.ts`, the per-model skip around line 253). What goes
is a display line: the `wk:<model>` rows `renderBudget` prints from observation rows for such a
seat, which *Limits the provider reports but the loop does not enforce are still shown* asks for.
Existing rows still print until they are superseded. A seat that reads live through an
interactive login keeps its `wk:` rows from the live read. Where per-model caps are taken up is
#75 task 5.1 (`triage-refusal-calibrates`), which decides whether a refusal records
`Observation.model`.

### Moved from `scheduled-observation`

*Observations arrive irregularly and nothing depends on their arriving* keeps its name and its
rule. Its reason changes. It used to be a laptop that sleeps. Now it is that readings come with
the work: with runs, and with probes only when a seat has no unexpired reading.

*A window's length is measured from successive resets, not configured* keeps its name. It changes
in three ways:

- **No phrase resolution.** A stream reading's reset is epoch seconds, so the old dependency on
  `capacity-from-observation` task 1.2 resolving a reset phrase falls away.
- **The smallest difference.** The old text took "the difference between two observations".
  Readings come from some instances of a window and not others, so two successive resets can be
  several window lengths apart and are never less than one. The smallest positive difference is
  the estimate, and its error is on the long side.
- **A longer figure is reported, not used.** A measured length longer than the built-in one is
  exactly what unread instances produce, so it is no evidence that the provider changed the
  window. A shorter one cannot come from unread instances, so it replaces the built-in. The old
  text's scenario *A changed window follows the provider* therefore holds only for a window the
  provider shortens. A lengthened window is reported beside the built-in length and not
  followed. That is a question for Adam under *Still open*.

Neither name is used anywhere else on `main` or on any `origin/*` branch, except inside copies of
`scheduled-observation` itself.

The in-force *Capacity is recorded spend divided by the fraction it consumed* says "The session
window runs five hours and the weekly window seven days". It carries a `MODIFIED` delta that
makes those the built-in lengths until measurement says otherwise.

### A seat probe, on the server, for the seats no run reads

Decided by Adam on 2026-09-27, and specified as *A seat nothing has read is probed on the Igor
server with its own token*. Stream readings arrive only with runs, which leaves two seats unread:
a reserved seat with no figure, which the gate admits only once something has read it, and a
seat the fleet is not using. The server that runs the Igors already holds every seat's token, so it reads them
itself. It makes one minimal `claude -p` call per seat with that seat's token and
`--output-format stream-json --verbose`, and records the `rate_limit_event` as a `stream` reading.

**It is not free.** The earlier case for scheduling `/usage` rested on it costing nothing. A probe
is a real model call, so it uses the cheapest model with a trivial prompt and no tools. Triage
already calls the same model with tools denied (`TRIAGE_MODEL`, `src/triage.ts`). Its cost is
recorded against the seat it read and counts toward that seat's bound. A probe is made on no
role's behalf, so the record says "seat probe" where a role would go. That needs `MODIFIED`
deltas on *Every invocation records which role spent from which seat* and *A spend with no seat
behind it does not happen*, whose in-force text requires a role and a seat the gate chose. A probe
is the stated exception to the second, and only for a seat that names its own token.

**When a seat needs one: no unexpired reading of a window.** A reading is a lower bound on its
window until that window resets (above), so a clock threshold shorter than the reset would spend
money to learn something the log already bounds. So "stale" means past its reset. For an idle seat
whose probes return events, that is about one probe per session window, roughly five a day.

**Bounds (settled by Adam, 2026-09-27).** At most one probe per seat per hour, and none while one
is running. After a probe that got no event, or none that could be read, none for five hours: one
session window. A failed probe is never retried in a loop. Both numbers were proposed in the first
draft of this design and Adam settled them as written. The requirement states them, and tasks 6.1
and 6.4 build and test them.

**Never on a refused seat, nor on one spending extra usage.** An unexpired observation at 100%
means the provider has already said no until its reset, so a probe there only spends a failed
call. An unexpired overage reading means a probe would be billed beyond the subscription, and no
opt-in exists (see above).

**Never on a seat at its bound.** A probe's spend is Igor spend, and *The reserve is untouchable*
says Igor spend never exceeds `(1 − reserve) × capacity`. A seat's session reading can expire
while its week window is at that bound, and probing it then would spend into the owner's week
reserve. So a seat at its bound in any window is not probed. The one reason for passing a seat
over under which it is still probed is having no capacity figure. That seat has no bound to
exceed, and the no-figure requirement's delta says so.

**Never on a seat with no token source.** Such a seat runs on the ambient login. A probe of it
would read that login, which is not the seat.

**What a probe's reading unlocks, and what it does not.** A reading gives the seat's fullness in
percent. The in-force gate works in dollars: a capacity is Igor's recorded spend inside the
window, divided by the fullness a reading reports (`capacityFor`). A seat Igor has not spent from
inside the instance therefore has a reading and still no figure. `whyNoFigure` already reports
that case as "no Igor spend is recorded inside the instance it observed, so there is nothing to
divide". The probe's own spend does not rescue it: that spend is recorded after the reading it
produced, which the arrival rule excludes on purpose, and a trivial call moves a window far less
than the 1% a reading resolves. So:

- **An idle seat that already has a figure** gets its fullness refreshed. That serves reporting,
  and a later derivation once Igor spends there again. This gap is closed.
- **A reserved seat with no figure** gets a fullness reading. The reading alone yields no
  figure, and under the in-force gate the seat would still be passed over. Calibration
  admission, below, is what starts it: the probe's reading lets in one item, and that item's
  spend and the next reading derive a figure.

**If a seat below every threshold gets no event.** This is task 1.1's measurement, and it gates
the rest. If the answer is no, a probe of a fresh seat returns nothing and records nothing. Its
cost is bounded by the five-hour back-off, and it can never produce a figure for that seat. The
probe would then read only seats already past a provider threshold. In practice those are seats
whose owner has used them heavily. A fresh reserved seat would start only as in force: from a
declared `capacity_estimate`, or from a period at `reserve: 0`. Calibration admission would
still start a reserved seat whose owner had used it past a threshold, but a fresh one never gets
the reading it needs. In that case, tasks 6.x are not
built as written, and whether a probe that reads only past-threshold seats is worth building goes
back to Adam.

### Calibration admission: a reserved seat with no figure is let in one item at a time

Decided by Adam on 2026-09-27, and written as a `MODIFIED` delta on *A seat with no capacity
figure at all protects no floor* (the same block the probe's delta already amends, not a second
one). A reserved seat with no capacity figure for a window is admitted for one item at a time
while the most recent unreset observation of every window reports it below `1 − reserve`. Once
the item's recorded spend and a later reading yield a figure, the ordinary bound applies. With no
unreset reading of some window it is not admitted; the probe reads it first.

**Why it is safe enough.** The reading is of the whole seat, owner's use included. Below
`1 − reserve` means at least the reserved fraction of the window was unspent, by anyone, when it
was taken. The risk is one item's spend past that margin, taken knowingly. The alternative is a
seat nobody declared a figure for never being used at all, or its owner guessing a
`capacity_estimate`.

**Why one item does not finish the job in one step.** The arrival rule stamps a stream reading
when the event arrives, before the run's spend is recorded. So the admitted item's own reading
excludes its own spend and yields no figure. The figure comes from the next reading inside the
same instance. The probe does not fire while the item's reading is unexpired, so in practice that
next reading is the one carried by the next item admitted under the same rule. Admission
therefore continues one item at a time until a figure exists. Typically that happens as the
second item's event arrives.

**Per window.** The rule applies window by window. A window that has a figure is bounded by
`(1 − reserve) × capacity` as always, and the seat is admitted only if that bound holds too. A
seat whose week is calibrated and whose session is not is let in one item at a time, and only
while its week spend is within the week's bound.

**A run that crosses the bound.** If an admitted run's own reading is at or past `1 − reserve`
in any window, the run finishes. Stopping it mid-item would waste what it already spent and hand
off work for no gain. Nothing further is admitted on that ground while the reading is unreset.
After the reset the seat has no unreset reading, so the probe reads it first.

**This is a reading used as a gate, for this case only.** The in-force reserve is a bound on
Igor's own spend, never a distance from a reading. Calibration admission is the stated exception,
written into *The reserve is untouchable*, and it lasts only until the seat has a figure. Whether
a seat-wide reading past `1 − reserve` should also stop a calibrated seat is a different question
and stays with `budget-pacing` (see *Still open*). The pool requirement's "drawn on only once it
has a capacity figure", and its scenario *An uncalibrated reserved seat is not the pool's
fallback*, carry `MODIFIED` deltas for the same reason.

**Several Igors sharing the seat.** "One item at a time" is held per Igor. Within one Igor it
holds by construction: `serve` works `toClaim` items one after another, each behind its own
`options.gate()`. Across Igors nothing coordinates, so N Igors sharing the seat can have N
admitted items running at once. That is the same slack the dollar bound already has. Spend is
recorded only when a run ends, so two Igors can both pass the gate on the last of a seat's
headroom (*Several Igors share one bound* sums what has been recorded, not what is in flight).

To make it strict across Igors would take a marker that every Igor checks and at most one can
set. The state branch offers one: `appendRecord` writes through the contents API with the file's
`sha`, which the server refuses if the file moved. Writing "calibrating on seat X, by process P"
that way, and admitting only on a successful write, is a compare-and-swap. It is also a
read-modify-write, which *Observations are appended to their own log and never rewritten* was
written to keep out of the record, and it needs a lease so that a crashed Igor does not hold the
seat forever. The other option is `work-claiming`'s claim, settle and verify, which costs a
settle interval per admission. Neither is specified here. This is under *Still open*.

### Degrading to today

No event, a malformed event, or an event with no numbers produces no row, and the run is recorded
exactly as it is today. Nothing waits on an event, nothing is refused for lacking one, and the
envelope-based refusal path is not removed. A seat whose runs stop carrying readings falls back
to the observations and record it had, which is the in-force behaviour.

## In-force text this overtakes, and the `MODIFIED` deltas that correct it

`openspec validate` does not cross-check deltas against the prose of requirements they do not
touch. These passages in `openspec/specs/seat-budget/spec.md` stated the premise this change
removes, or a rule this change's decisions make an exception to. **Adam decided on 2026-09-27
that this change corrects them now**, so `specs/seat-budget/spec.md` carries a `MODIFIED` delta
for each, changing only what is false:

- ***Usage is read from the seat, not supplied by a person*** — "The credential a seat holds is a
  `setup-token` one, which carries no subscription identity, so the provider reports a
  per-invocation cost summary instead of window percentages and there is nothing to read." True of
  `/usage`; false of the stream. Also "a reserved seat with no figure at all is passed over rather
  than spent from", which now points at calibration admission.
- ***An observation records how full a window was, and when it resets*** — "which of two sources
  it came from". Now three, with `stream`; see *The record* above. It also now says that nothing
  writes `usage` any more and that existing `usage` rows are still read, and its scenario *A
  reading becomes an observation* is replaced by two saying so.
- ***Recorded spend attributes a seat between its roles*** — "The record is the only quantity
  available for both questions on a seat whose credential reports no window." A seat's credential
  does report its windows.
- ***A seat with no capacity figure at all protects no floor*** — "What it requires is a machine
  with such a login — the seat's owner — rather than the seat's own credential." The seat's own
  credential suffices, through the stream. The delta also states what the old paragraph left
  implicit: a reading yields a figure only once Igor has spent from the seat inside the window it
  reads. It now carries calibration admission, with its scenarios.
- ***A pool is an ordered list of seats, and order is the allocation mechanism*** — "A seat
  declaring a reserve is drawn on only once it has a capacity figure". Calibration admission is
  the exception, and the scenario *An uncalibrated reserved seat is not the pool's fallback* gains
  the condition that the seat has no reading below `1 − reserve`.
- ***The reserve is untouchable*** — the reserve is enforced "rather than as a distance from a
  reading of how full the seat is". Calibration admission is the stated exception, for a seat with
  no figure, until it has one.
- ***Capacity is recorded spend divided by the fraction it consumed*** — "The session window runs
  five hours and the weekly window seven days." Those are now the built-in lengths, until
  measurement says otherwise.

Two more deltas are about the probe rather than about this premise: *Every invocation records
which role spent from which seat* and *A spend with no seat behind it does not happen* (see *A
seat probe*).

No in-force requirement specifies `igor observe`, the scheduled reading, or the refusal of a seat
credential, since `scheduled-observation` was never archived. So its withdrawal needs no
`REMOVED` delta.

## Still open

- **A seat below every threshold.** Whether it gets a `rate_limit_event` at all is unmeasured.
  The only capture fired with the week at 86%, past the 0.75 threshold. The session window
  was reported at 0.07 inside that same event, so low windows are reported *when an event fires*.
  Whether a completely fresh seat gets one is the open part. Task 1.1 takes that capture on the
  fresh Max seat Adam is buying, before anything else is built. What the probe and calibration
  admission degrade to if the answer is no is under *A seat probe* above.
- **"One item at a time" across several Igors** (question for Adam). As written it holds per
  Igor, so N Igors sharing an uncalibrated reserved seat can have N items running on it. That is
  the slack the dollar bound already has. Making it strict needs a compare-and-swap marker on the
  state branch, with a lease, or `work-claiming`'s claim and settle. See *Calibration admission*.
  Recommended: accept the per-Igor slack now, and take the marker up once more than one Igor
  actually shares a reserved seat, together with the same race on the dollar bound.
- **A lengthened window** (question for Adam). *A window's length is measured from successive
  resets* follows the provider only when a window gets shorter. A longer measured length is
  reported and not used, because unread instances produce the same figure. Recommended: keep it
  so. A lengthened window leaves the built-in length too short, which undercounts a numerator,
  and an operator sees the measured figure beside it.
- **Whether a session window instance tiles or floats.** The in-force capacity requirement
  assumes instances tile the timeline. If a session instead starts at the first use after a
  reset, successive resets still differ by at least one length, so the smallest-difference rule
  holds. What would be wrong is placing one instance from another's reset by tiling, as
  `resetAnchor` does, across a gap in which nobody used the seat. Unmeasured. Stream readings
  supply the resets that would show it.
- **A probe of an uncalibrated seat whose reading is past its reserve** (question for Adam). The
  probe skips a seat at its dollar bound. A seat with no figure has no dollar bound, so it is
  still probed when one window's reading has expired and the other's is at or past
  `1 − reserve`. Recommended: skip it too, for the same reason calibration admission stops there.
  It is a trivial spend, but it is Igor spend into what the reading says is the reserve.
- **The `rejected` shape** (#57). The single-row rule above is written against the
  contributor-reported shape and must be checked against the first captured refusal.
- **The observation log's size.** *Observations are appended to their own log and never
  rewritten* justifies a separate log partly because it stays "small enough to read whole". Up to
  two rows per worker run grows it at the execution log's rate. Still small at today's volumes;
  whether it should stay read whole is worth deciding before a fleet runs many seats.
- **Whether a seat-wide reading past `1 − reserve` should stop Igor on a calibrated seat.** It
  would turn the reserve from a cap on Igor into a floor under the owner. That is a change to what
  a reserve means and belongs with `budget-pacing`'s adaptive reserve, not here. Calibration
  admission uses a reading this way only for a seat with no figure.
- **Per-model weekly windows** have no source for a token seat once `igor observe` is removed.
  See *What is lost* above. #75 task 5.1 is where they are taken up.
