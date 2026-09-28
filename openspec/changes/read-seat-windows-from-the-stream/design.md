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

That property is what lets the gate run on readings (*The reserve is a line on the reading*,
below): an old reading understates the present, so comparing it against the line can admit work
only where a fresher reading would have too, less the spend since it was taken.

### Newest-wins, against `src/capacity.ts`

`capacityFor` takes the newest observation that divides into a figure; `resetAnchor` takes the
newest that resolved a reset; `spentFor` takes the latest-expiring unexpired row at 100%. Stream
readings need no new selection rule. They will usually be the newest rows, and that is the
point: after every worker run the estimate is re-derived from a reading one run old.

Two consequences worth stating, both now about a reported figure only, since a capacity in
dollars no longer gates anything:

- **On a shared seat the dollar capacity is still low.** The numerator is Igor's spend, the
  denominator the whole seat's fullness. What is new is that readings now arrive often enough for two in one instance
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

Two uses were considered:

- **As a pacing input** — slowing down before a cap rather than stopping at one. The line
  (*The reserve is a line on the reading*) already does that from the utilization itself, at the
  operator's reserve rather than the provider's threshold, so the warning adds nothing to it.
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
readings leave unread are read here too, on the same server: a reserved seat nothing has read, and
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
built-in window lengths those citations justify are justified by *A window's length is measured,
and so is whether it starts at first use* here. The docs that describe `igor observe` say, until then, that it is
being withdrawn by this change.

**What is not removed.** The live `/usage` read in `readAllSeats` (`readUsage`, `parseUsage`,
`runUsage`, `hasSubscription` in `src/budget.ts`) is not `igor observe`. It reads a seat on the
server, when the gate asks, through whatever credential the seat resolves to, and it produces
the "read live" rows of `igor budget`. It was specified by the in-force *Usage is read from the
seat, not supplied by a person*, which this change replaces with *A seat's fullness is read from
the seat, not supplied by a person*; the live read keeps its rule there. `parseUsage` is shared by
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

*Observations arrive irregularly and nothing depends on their arriving* is renamed *Observations
arrive irregularly, and a gap is waiting, not a fault*, and keeps most of its rule. Its reason changes. It used to be a laptop that sleeps. Now it is that readings come
with the work: with runs, and with probes. It no longer says nothing requires a reading "at all":
a seat whose line uses a non-zero reserve is drawn on only on an unreset reading, so a gap past a
reset leaves it waiting, and the requirement now says that waiting is not a fault.

*A window's length is measured from successive resets, not configured* is renamed *A window's
length is measured, and so is whether it starts at first use*, and rewritten around the post-reset
probe (see *Window length and schedule, measured just after a reset*, below). The old rule
survives in it as the passive fallback:

- **No phrase resolution.** A stream reading's reset is epoch seconds, so the old dependency on
  `capacity-from-observation` task 1.2 resolving a reset phrase falls away.
- **The smallest difference.** Readings come from some instances of a window and not others, so
  two successive resets can be several window lengths apart and are never less than one. The
  smallest positive difference is the passive estimate, and its error is on the long side.
- **A longer passive figure is reported, not used.** It is exactly what unread instances produce.
  A longer figure measured by a post-reset probe is followed, because no unread instance lies
  between the reset the probe follows and the one it reads. That settles the earlier open
  question on a lengthened window.

Neither name is used anywhere else on `main` or on any `origin/*` branch, except inside copies of
`scheduled-observation` itself.

The in-force *Capacity is recorded spend divided by the fraction it consumed* says "The session
window runs five hours and the weekly window seven days" and that instances tile. It carries a
`MODIFIED` delta that makes those the built-in length and schedule until measured.

### The reserve is a line on the reading

Decided by Adam on 2026-09-28, replacing the dollar bound. In his words: "If there's 10% of the
cycle left and we want to give igor 70% it shouldn't stop just because we're at 70% usage. It
should leave 10% × 0.3 (reserve) — so igor can have 97%. This accomplishes two things: we don't
need to know how much the seat holder is using, and igor will adapt to fill the usage whether
they're using more or less."

**The rule.** For each window, Igor starts work on a seat only while the seat's most recent
unreset reading of that window is below

    line      = 1 − r × remaining
    r         = max(seat reserve, role reserve), a role declaring none counting as 0
    remaining = (resetsAt − now) ÷ window length, clamped to [0, 1]

Both windows must pass. It is written into the `MODIFIED` *The reserve is untouchable*. The same
line is `(1 − r) + r × elapsed`: the reserve is held back at the start of the window and released
evenly as it runs out.

| `r` | just after a reset | Monday of a week | halfway | 10% left | at the reset |
|---|---|---|---|---|---|
| 0 | 100% | 100% | 100% | 100% | 100% |
| 0.3 | 70% | 74% | 85% | 97% | 100% |
| 0.5 | 50% | 57% | 75% | 95% | 100% |
| 1 | 0% | 14% | 50% | 90% | 100% |

"Monday of a week" is one day of seven elapsed. Put as a promise to an owner: at any moment
Igor leaves `r` × the part of the window still to come, which assumes the owner's own use is
spread across the window. An owner who finds Igor takes too much, or who uses the seat late in the
window, raises the reserve. There is no other setting. At `r` = 0 the seat is filled to the whole
window, stopped only by the provider's refusal. At `r` = 1 the line is the fraction elapsed, which
is even pacing.

**Why it replaces the dollar bound.** The bound held Igor's recorded spend under
`(1 − reserve) × capacity`. It needed a capacity in dollars for every window before a reserved
seat could be used, which is what calibration admission and `capacity_estimate` existed to supply,
and it held the whole reserve back until the reset, where whatever nobody used was lost. The line
compares a fraction of the window against a fraction of the window, so it needs no dollar figure,
and it compares against the whole seat, so it needs no figure for the owner's use. The owner who
uses less leaves Igor more, and the owner who uses more leaves Igor less, without Igor knowing
which.

**What it gives up.** The bound's argument was that capping Igor's own spend guarantees the
owner's floor "by construction", with no observation of the owner, and that a floor that waited on
a reading would lapse when readings stopped. The line answers the second half by failing closed: a
seat whose line uses a non-zero reserve is not drawn on without an unreset reading (below), so a
seat whose readings stop goes idle rather than open. It does give up the first half. The floor now
rests on a reading, and a reading is the undocumented event. That is recorded under *Degrading*
and *Still open*.

**Which readings count.** The newest observation of the window, all-models, whose reset has not
passed, whatever its source: a `stream` reading, an existing `usage` row, or a `limit` refusal.
Fullness does not fall within an instance, so the newest unreset one is also the fullest. **A
refusal counts as a reading** (Adam, 2026-09-28): an observation at 100% of its window until its
reset, past every line. That covers the row a refused worker run already records from its envelope
(#39) and the row #75 records for a refused triage call. It is the one gate input that does not
depend on the stream. The live `/usage` read of a seat whose credential
answers with windows is a reading too. Today that path enforces a fixed line,
`100 − reserve − used` (`seatStatus` and `hasHeadroom`, `src/budget.ts`), which becomes the moving
line with the live reading's reset. `remaining` uses the reset of the reading being checked and
the window length in use. A reading whose reset never resolved, such as an old `usage` row with a
phrase nothing could place, takes `remaining` as 1, so its line is `1 − r`, the most the line holds
back.

**A running item finishes.** The line decides whether work starts. The in-force scenario said
Igor "hands off any in progress" at the bound, and that is replaced: stopping mid-item wastes what
was spent. This is the rule calibration admission already had for a run that crossed.

**How far past the line one Igor can go.** Between readings an Igor does not see its own spend.
The gate before an item sees the last reading the previous run carried, and that reading is
timed when its event arrived. So an Igor can pass the line by the item it admits plus whatever the
previous run spent after its last event. Where a run's last event arrives near its end, that is
about one run's spend, which is the cost Adam accepted. Where it arrives near the start, it can
approach two. How late in a run the last event arrives is unmeasured. Task 1.1 records it, and it
is under *Still open*. Every run carries a fresh reading, so the overshoot does not compound.

**Per Igor, not coordinated (settled by Adam, 2026-09-28).** Every Igor on a seat reads the same
whole-seat reading, so they are held to one line without adding up each other's books. Each can
overshoot once, so N Igors can pass it by N runs. A coordination marker, a compare-and-swap on the
state branch with a lease or `work-claiming`'s claim and settle, is taken up only once a reserved
seat is actually shared by several Igors, together with the same gap on any spend bound that
remains then. `budget_share` is one such bound (below).

### No reading: known below the line only where `r` is 0

Written into the renamed block *A seat with no reading is drawn on only where its line is the
whole window* (formerly *A seat with no capacity figure at all protects no floor*). With no unreset
reading of a window, all that is known is that the provider has not refused it: the window is below
100%. That is below the line only where the line is 100% at every moment, which is `r` = 0. So one
rule covers every seat. A seat whose line uses a non-zero reserve and has no unreset reading is
passed over for that role and left to the probe. A seat at `r` = 0 runs with no reading, as a
dedicated seat does today, and its first run's reading or first refusal reads it. The in-force
scenarios *A dedicated seat runs uncalibrated* and *The first refusal calibrates it* are kept under
their names as instances of that rule.

**Calibration admission is removed.** It let a reserved seat with no capacity figure in one item at
a time on a reading below `1 − reserve`, and existed only to get the seat a figure. The line needs
no figure, so a reserved seat read below its line is admitted outright. Its one-at-a-time state,
its own verdict and its tasks go with it.

A reserve-0 seat naming no token source is never probed, and runs with no reading as before. A
seat whose line uses a non-zero reserve and names no token source can only be read by a run, and
it is not run without a reading. It is therefore never drawn on unless a live `/usage` read
answers for it. That is the fail-closed direction, and `igor budget` says why.

### A role's reserve

Decided by Adam on 2026-09-28, and added as *A role may hold back more of a seat than the seat
does*. A role file may declare one `reserve`. It applies to every seat the role draws on through
its `seat`, a seat or a pool, and is not set per role and seat. The line that role's Igor checks
uses `max(seat reserve, role reserve)`, so a role can hold back more than a seat and never less,
and a lender's reserve holds whatever a role declares. On a seat at reserve 0 the role's reserve
alone sets its line.

It is priority without coordination. With `frontend` at 0.3 and `generalist` at none on one seat,
once the reading passes `frontend`'s line only `generalist` takes items, so `generalist` tends to
use more of the seat. It is **not a guaranteed share**, and that is accepted. A low-reserve role
that always has work can crowd a higher-reserve role out for most of a window. No mechanism is
added. The two remedies that exist are pools, since a role draws only on its own pool, and adding
seats so that the low-reserve role is fully served elsewhere. A guaranteed per-role minimum is not
specified, and is added only if it proves to be needed.

### A reserve on a dedicated seat is pacing

Decided by Adam on 2026-09-28. On a seat nobody works on, a reserve holds capacity back for work
that arrives later in the window, and at 1 it spends the window evenly. A dedicated seat defaults to
reserve 0, because burning early is not waste when the work is there. So the validation that refuses
a reserve on a dedicated seat (`src/budget.ts:1395-1397`, "is dedicated, so nobody is there to
reserve capacity for") is removed in gate two. So are the parser forcing a dedicated seat's reserve
to 0 (`src/budget.ts:1413`) and the range check that refuses a reserve of 1 (`src/budget.ts:1392`),
since a reserve of 1 now means even pacing. The `MODIFIED` *Seats are named configuration entities
with an owner and a reserve* says a reserve is the share of the remaining window held back, from 0
to 1 inclusive, on any seat. The key keeps its name `reserve`. Whether to rename it is a minor
question under *Still open*.

### What the dollar bound leaves behind

**Capacity in dollars is kept, as a report.** `capacityFor`, `whyNoFigure`, `resetAnchor` and the
capacity half of `boundsForSeats` (`src/capacity.ts`) still derive a figure, and `igor budget` still
shows it with its source. No gate reads it. The in-force *Capacity is recorded spend…* and *A limit
error lowers the estimate that permitted it* carry `MODIFIED` deltas saying so.

**`capacity_estimate` becomes a reported figure that admits nothing.** It existed to start a
reserved seat under the dollar bound, and the line does not need it. Removing the key outright would
make `strict-config-keys` refuse every existing config that carries it, which is a breaking change for
no gain in this change. So it stays parsed, is reported as declared, and gates nothing. Whether to
deprecate and later remove it is a question for Adam under *Still open*. There is one case it
used to cover that nothing now covers: a fresh reserved seat that emits no event below every
threshold (task 1.1).

**`budget_share` depends on a capacity figure, on one path.** It is a ceiling on one role's share of
a seat, and is not the seat reserve. On the live path it is measured against the reading: the role's
share of Igor's recorded spend times the reading's `percentUsed` (`src/budget.ts:697-708`). On the
derived path, for a seat `/usage` cannot read, it divides by the capacity figure instead:
`capacity.spentUsd / capacity.capacityUsd` (`src/budget.ts:648-663`), and it is unchecked where there
is no figure. That is the one gate input left on a capacity figure, and this change does not resolve
it on its own. It is a question for Adam under *Still open*. Until he answers, gate two leaves
`budget_share` as it is.

**No other operator-configured dollar ceiling exists.** `git grep` over `src/config.ts`, `docs` and
`README.md` for ceilings, allowances and reserves finds only the seat `reserve`, `budget_share`, and
`capacity_estimate`.

### Window length and schedule, measured just after a reset

Decided by Adam on 2026-09-28. Every reading carries an exact `resetsAt`, so the server probes each
seat ten minutes after a reset it knows of, once per window type, and again about weekly to catch a
change. On a fixed schedule the new reset is the old reset plus one length. At first use it is the
probe's time plus one length. Built-in lengths of five hours and seven days, on a fixed schedule,
are used until measured. This settles the earlier open question, whether a session tiles or floats,
as "measured by the post-reset probe". The answer itself is still unknown until the probe runs.

**One probe is ambiguous without a prior.** The two differences, new reset less old reset and new
reset less probe time, differ by the probe's delay under either schedule. "Fixed, length x" and
"first use, length x less ten minutes" produce the same pair. A single probe therefore names the
schedule only against a length already expected: whichever difference equals the built-in length,
or the last measured one. Where neither does, a probe after a later reset at a different delay
settles it, because on a fixed schedule the new reset does not move with the delay. The requirement
says both.

**Its costs.** It is a seat probe. It counts against the hourly limit and every exclusion,
including the line, and its cost is recorded. On a first-use window the probe itself starts the
instance, which then runs from the probe rather than from the owner's first use. On a shared seat
the owner's use between the reset and the probe makes the first-use difference short. Ten minutes
keeps that small. The weekly repeat bounds how often the first cost is paid.

**The smallest-gap rule is kept, as the passive fallback.** It costs nothing, arrives with every
run, and catches a shortened window between weekly probes. It cannot tell the schedules apart, and a
longer figure from it is what unread instances produce, so it only ever shortens the length in use.
The post-reset probe is the only source for the schedule and for a longer length. Subsuming the
passive rule would leave a shortened window unnoticed for up to a week.

**Placing one instance from another uses the measured behaviour.** `resetAnchor` tiles, which holds
only on a fixed schedule. At first use an instance is placed only from its own reset. That affects
the reported capacity's numerator, and nothing the gate decides: the line uses each reading's own
reset and the length, and never places one instance from another.

### `budget-pacing` is withdrawn, and its one surviving requirement moves here

Decided by Adam on 2026-09-28. The line is the pace line. `1 − r × remaining` equals
`(1 − r) + r × elapsed`, and at `r` = 1 it is exactly `elapsed`, which is `budget-pacing`'s
`target × elapsed` at a target of 1. `target × elapsed` with a target below 1 stops short of 100% at
the reset and strands capacity, where the line always reaches 100%. So there is one line, not two,
and nothing to decide about which binds.

- ***Capacity is paced across the window, not consumed on sight*** is removed. The line does it.
- ***Pacing tolerates a margin*** is removed. Overshooting by one run and then waiting is harmless.
- ***A reserve decays toward the reset, on the clock or on the owner's consumption*** is superseded
  by the line. Its owner's-consumption term, `percentUsed − Igor spend ÷ capacity`, needed a dollar
  capacity. Its throughput cap guarded a relaxation the line does not make. Its carve-out, that the
  weekly reserve decays no further, is gone: the week's line moves like the session's, so at `r` =
  0.3 with about seventeen hours of the week left, Igor may take the seat to 97%.
- ***Waiting on pace is distinguishable from having nothing to do*** survives, restated as *Holding
  back at the line is distinguishable from having nothing to do* and `ADDED` here, so that `igor
  budget` says "holding back" rather than looking idle.

That leaves `budget-pacing` with nothing of its own, so it is withdrawn, and
`openspec/changes/budget-pacing/` is deleted on this branch, as `scheduled-observation` was. None of
its requirements was archived, so no `REMOVED` delta is needed. The constants it wanted fitted (a
target, a tolerance, a decay shape; #69) no longer exist, and the reserve is the operator's to set.
Its design's open problem, relating a percentage of a window to dollars of spend, does not arise,
because the line compares percent with percent.

### A seat probe, on the server, for the seats no run reads

Decided by Adam on 2026-09-27, and specified as *A seat nothing has read is probed on the Igor
server with its own token*. Stream readings arrive only with runs, which leaves two seats unread:
a seat whose line uses a non-zero reserve and that has no unreset reading, which the gate does not
draw on until something reads it, and a seat the fleet is not using. The server that runs the Igors
already holds every seat's token, so it reads them itself. It makes one minimal `claude -p` call
per seat with that seat's token and `--output-format stream-json --verbose`, and records the
`rate_limit_event` as a `stream` reading. The post-reset probe above is the same call, placed.

**It is not free.** The earlier case for scheduling `/usage` rested on it costing nothing. A probe
is a real model call, so it uses the cheapest model with a trivial prompt and no tools. Triage
already calls the same model with tools denied (`TRIAGE_MODEL`, `src/triage.ts`). Its cost is
recorded against the seat it read. A probe is made on no role's behalf, so the record says "seat
probe" where a role would go. That needs `MODIFIED` deltas on *Every invocation records which role
spent from which seat* and *A spend with no seat behind it does not happen*, whose in-force text
requires a role and a seat the gate chose. A probe is the stated exception to the second, and only
for a seat that names its own token.

**When a seat needs one: no unexpired reading of a window.** A reading is a lower bound on its
window until that window resets, so a clock threshold shorter than the reset would spend money to
learn something the log already bounds. So "stale" means past its reset. For an idle seat whose
probes return events, that is about one probe per session window, roughly five a day.

**Bounds (settled by Adam, 2026-09-27).** At most one probe per seat per hour, and none while one is
running. After a probe that got no event, or none that could be read, none for five hours: one
session window. A failed probe is never retried in a loop. Tasks 6.1 and 6.4 build and test them.

**Never on a refused seat, nor on one spending extra usage.** An unexpired observation at 100% means
the provider has already said no until its reset, so a probe there only spends a failed call. An
unexpired overage reading means a probe would be billed beyond the subscription, and no opt-in
exists.

**Never on a seat at or past its line (settled 2026-09-28).** A probe's consumption is Igor's. A
seat's session reading can expire while its week reading is past the week's line, and probing it
then would spend into what the line holds back. So a seat whose most recent unreset reading of any
window is at or past that window's line is not probed. The line moves, so the same seat can be
probed later in the window without anything else changing. This replaces the earlier exclusion of a
seat at its dollar bound, and settles the earlier question about probing an uncalibrated seat past
`1 − reserve`: the moving line applies, not a fixed one.

**A probe checks the credential too (decided 2026-09-28).** A probe answered with an
authentication failure (401) is not a probe that got no event: the five-hour back-off does not
apply to it, so a stopped seat is re-checked hourly. It opens the seat's credential stop, `seat:<id>:credential`, in whichever
record owns it: #65's breaker or #101's condition record, whichever lands first. A probe that
succeeds is the check that clears it. Against the exclusions: a seat whose credential stop is open
is probed only as that clearing check, whatever its readings, and within the hourly limit. The
refusal, overage and line exclusions still hold it off, because a seat any of them excludes could
not be used even with its credential cleared, so the stop costs nothing while they last.

**Never on a seat with no token source.** Such a seat runs on the ambient login. A probe of it would
read that login, which is not the seat.

**What a probe's reading unlocks.** Under the line, a reading below the line is all a seat needs. A
probe of an idle reserved seat that returns a reading below its line opens it for work with no
capacity figure and no calibration step. A probe of an idle seat that has a figure refreshes its
fullness for the gate and the report.

**If a seat below every threshold gets no event.** This is task 1.1's measurement, and it gates the
probe. If the answer is no, a probe of a fresh seat returns nothing and records nothing. Its cost is
bounded by the five-hour back-off. Under the line, the consequence is sharper than it was: a fresh
seat whose line uses a non-zero reserve is not drawn on until a reading exists, and a declared
`capacity_estimate` no longer starts it. Such a seat would start only once its owner's own use
carried it past a provider threshold, or from a period at reserve 0. In that case tasks 6.x are
not built as written, and what starts a fresh reserved seat goes back to Adam.

### Degrading: closed, not open

No event, a malformed event, or an event with no numbers produces no row, and the run is recorded
exactly as it would otherwise be. Nothing fails a run for lacking one, and the envelope-based
refusal path is not removed.

What changes is the budget decision, and it is stated rather than promised away. The earlier design
said the event was "an optimisation, never a correctness dependency", because the dollar bound
worked without it. The line does not. It rests on readings, and for a `setup-token` seat the stream
is the only source of one, a refusal aside. If the provider drops or changes the event, every seat
whose line uses a non-zero reserve goes idle once its last reading resets, and stays idle until
readings return. Nobody's reserve is spent on a guess. A seat at `r` = 0 keeps running, stopped by
refusal, as today. *A missing reading closes a reserved seat and changes nothing else* says so.

## In-force text this overtakes, and the deltas that correct it

`openspec validate` does not cross-check deltas against the prose of requirements they do not
touch, and `openspec archive` refuses a `MODIFIED` block that drops an in-force scenario. These
passages in `openspec/specs/seat-budget/spec.md` stated the premise this change removes, the dollar
bound, or a rule these decisions make an exception to. Adam decided on 2026-09-27 that this change
corrects them now. Each `MODIFIED` block keeps every in-force scenario name, and two blocks whose
scenarios became false are `REMOVED` and re-`ADDED` under new names.

- ***Seats are named configuration entities with an owner and a reserve*** — "a fraction of capacity
  Igors MUST NOT consume". Now the share of the remaining window held back, from 0 to 1 inclusive, on
  any seat, a dedicated one included.
- ***Usage is read from the seat, not supplied by a person*** — `REMOVED`, and `ADDED` as *A seat's
  fullness is read from the seat, not supplied by a person*. Its scenario *A declared capacity gets a
  reserved seat started* is false. It also said "the bound is `(1 − reserve) × capacity`", and that
  a seat's credential reports no window.
- ***An observation records how full a window was, and when it resets*** — "which of two sources".
  Now three, with `stream`. Nothing writes `usage` any more, and existing `usage` rows are still read.
  Its scenario *A reading becomes an observation* is kept, now about a stream reading. An earlier
  revision of this change dropped it, which would have failed archive.
- ***Recorded spend attributes a seat between its roles*** — `REMOVED`, and `ADDED` as *Recorded spend
  attributes a seat between its roles, and decides no headroom*. Its scenario *The record decides
  exhaustion where no reading can* is false.
- ***A seat with no capacity figure at all protects no floor*** — `RENAMED` to *A seat with no reading
  is drawn on only where its line is the whole window*, and `MODIFIED`. No capacity figure admits a
  seat, calibration admission is gone, and its scenarios are kept as instances of the no-reading rule.
- ***A pool is an ordered list of seats, and order is the allocation mechanism*** — "A seat declaring
  a reserve is drawn on only once it has a capacity figure". Now it is drawn on while read below its
  line.
- ***The reserve is untouchable*** — the dollar bound, and "rather than as a distance from a reading".
  Now the moving line on the reading, with the role's reserve, the overshoot, and the per-Igor note.
- ***Capacity is recorded spend divided by the fraction it consumed*** — "a bound on Igor that is
  tighter than intended", the fixed lengths, and tiling. Now it is a reported figure, on a measured
  length and schedule.
- ***Budget reporting states what each seat has left*** — headroom derived from a capacity figure.
  Now it is the reading against the line, per role where a role reserves more, with capacity as
  information.
- ***A limit error lowers the estimate that permitted it*** — the estimate no longer permits
  anything. The refusal gates as a reading at 100%.

Two more deltas are about the probe: *Every invocation records which role spent from which seat* and
*A spend with no seat behind it does not happen*.

`budget_share is a ceiling, not a reservation` is not modified. Its text does not say how a share is
measured, and how it is measured on the derived path is the open question above.

No in-force requirement specifies `igor observe`, the scheduled reading, the refusal of a seat
credential, or anything in `budget-pacing`, since neither change was archived. So their withdrawal
needs no `REMOVED` delta.

## Still open

- **A seat below every threshold** (task 1.1). Whether it gets a `rate_limit_event` at all is
  unmeasured. The only capture fired with the week at 86%. The session was reported at 0.07 in that
  same event, so low windows are reported when an event fires. Under the line this gates more than
  the probe: if a fresh seat emits nothing, a fresh seat whose line uses a non-zero reserve cannot
  start at all. See *A seat probe*.
- **`budget_share` on the derived path** (question for Adam). It divides by a capacity figure
  (`src/budget.ts:648-663`), the one gate input left on one. Recommended: measure it against the
  reading, as the live path already does (`src/budget.ts:697-708`), so no gate reads a capacity figure.
  That counts the owner's use against a role's share, which the live path already does. The
  alternative is to keep the figure there as the one exception.
- **`capacity_estimate`** (question for Adam). It is now a reported figure that admits nothing.
  Recommended: keep it parsed and reported until task 1.1 answers, then deprecate it if fresh seats
  do emit events, since removing the key makes `strict-config-keys` refuse existing configs. If they do
  not, what starts a fresh reserved seat has to be decided, and a declared figure is one candidate.
- **How far past the line one run can carry a seat.** About one run's spend if a run's last event
  arrives near its end, and up to two if near the start. Task 1.1 records when events arrive in a
  run. Recommended: accept it as measured. If last events come early, read the event at the end of a
  run, or add the previous run's recorded spend to the reading as a correction.
- **The gate rests on the event, for reserved seats.** It rests on an undocumented event. If the
  event goes, seats with an effective reserve above 0 fail closed, and seats at 0 keep running until
  refused. Recommended: accept it, and have `igor budget` say plainly when a reserved seat is idle for
  want of a reading.
- **Coordination across Igors** (settled for now, 2026-09-28). The line and the overshoot are per
  Igor. A coordination marker is taken up only once a reserved seat is actually shared by several
  Igors, together with the same gap on any remaining spend bound, such as `budget_share`.
- **A guaranteed per-role share.** Not specified. Add it only if a role's reserve proves too weak a
  priority in practice. Pools and more seats are the remedies that exist.
- **How a role's reserve inherits** (minor). `budget_share` inherits so that a child may only lower
  it. Task 12.1 has a role's reserve inherit in the protective direction instead: a child may raise
  an inherited reserve and never lower it. Recommended: that.
- **The key's name** (minor). `reserve` now means the share of the remaining window held back, for
  an owner on a lent seat and for later work on a dedicated one. Recommended: keep the name.
- **The `rejected` shape** (#57). The single-row rule is written against the contributor-reported
  shape and must be checked against the first captured refusal.
- **`allowed_warning` has no gate behaviour.** The line uses the utilization itself. Please review this
  rather than let it pass by default.
- **Whether triage should switch to `stream-json --verbose`.**
- **The observation log's size.** Up to two rows per worker run grows it at the execution log's rate.
  Still small at today's volumes. Whether it should stay read whole is worth deciding before a fleet
  runs many seats.
- **Per-model weekly windows** have no source for a token seat once `igor observe` is removed. See
  *What is lost* above. #75 task 5.1 is where they are taken up.
