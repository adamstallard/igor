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

- **Measured:** one capture, on one seat, past 75% of its week, with status `allowed_warning`; and
  one on a seat below every threshold (task 1.1), which still emits the event, with `utilization`
  and `resetsAt` per window in `unifiedWindows` and none at the top level.
- **Known without numbers:** events appear on ordinary runs. `progress-timeout` saw them with
  `status: "allowed"` and `rateLimitType: five_hour`; whether those carried `utilization` and
  `unifiedWindows` was not recorded.
- **Unverified:** the `rejected` shape, contributor-reported as `status: "rejected"`,
  `utilization: 1` and a non-zero exit (#57, #15).
- **Absent:** per-model weekly windows.
- **Undocumented:** the event itself. A seat's reserve line, which decides whether it may take
  work, rests on the event's readings, so the event is a dependency; *Degrading*, below, says what
  holds when it is missing.

## Decisions

### Where it is read: the worker's stream consumer, kept beside the result

`claudeWorker`'s `consume` in `src/execute.ts` already parses every line and keeps the one with
`type === 'result'`. It keeps the last `rate_limit_event` the same way, with the instant it
arrived, and returns both. Parsing is tolerant in the way `asIso` and `limitSignals` already are:
a missing field, a wrong type or an unknown window name yields no reading for that window, never
a throw on the stream path — a throw there abandons the rest of the chunk, which is where the
terminal event is.

### One reading per run: the last event received

A run can carry several events. Within one window instance fullness is assumed to only rise; task
1.3 has yet to measure it. On that assumption the last event
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
having paid. Every seat has a token of its own, and Igor never uses a stored Claude login, the
credentials `claude` keeps in a home directory (Adam, 2026-10-18; proposal, decision 14), so the
token that ran is always the chosen seat's. `seat-files` (#171) refuses a seat file that names no
token. It archives in the same commit as this change, but its code is built after this change's;
until it is, the in-force spec still allows a seat with no token, which the proposal lists for
Adam.

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

Fullness is assumed to only rise within one window instance, which task 1.3 has yet to measure.
On that assumption, a reading taken at `at` says the window is
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
Decided by Adam on 2026-10-11.

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

**What the flag means is unmeasured.** No capture holds `isUsingOverage: true`, and the event also
carries `overageStatus` and `overageDisabledReason`. If the flag meant overage is enabled rather
than being spent, this rule would shut every such seat window after window. So the rule is not
built until task 1.4 captures a true value, and if the flag means something else the rule reads
the field that does.

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

There are two ways to get one: switch triage to `stream-json --verbose` as the worker runs, or read
`rate_limit_info` off the JSON envelope if a capture shows it is there. **The switch is deferred
until this change is built (Adam, 2026-10-11)**, and #75 is the fallback until then.

**Who owns what (settled 2026-09-27 by Adam's decision on #75).** #75
(`triage-refusal-calibrates`) is narrowed to a fallback (`08be738` on `triage-refusal`). If
triage ever reads the stream, a triage call's *reading* belongs to this change, including a
refusal that reading reports, which is recorded once under *A refusal the stream reports is not
recorded twice*. #75 records a triage *refusal* only where the call carried no reading. While
triage runs `--output-format json`, that is every triage refusal.

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
and so is whether it starts at first use* here. The docs on this branch already describe no
`igor observe` command (task 9.5).

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
Rows already in the log keep printing as the code prints them now, and nothing writes new ones
for a token seat. Since proposal decision 14 no seat reads through an interactive login, so no
live read supplies them either. Where per-model caps are taken up is
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
    r         = max(seat reserve, role's effective reserve), a role with none, declared or
                inherited, counting as 0
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
seat could be used, which is what `capacity_estimate` existed to supply,
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
rests on a reading, and a reading is the undocumented event. That is recorded under *Degrading*,
and it is settled (Adam, 2026-09-28): seats whose effective reserve is 0 run without a reading, reserved
seats go idle, and `igor budget` says why a seat is idle.

**Which readings count.** The newest observation of the window, all-models, whose reset has not
passed, whatever its source: a `stream` reading, an existing `usage` row, or a `limit` refusal.
Fullness does not fall within an instance, one stretch of a window from one reset to the next, so
the newest unreset reading is also the fullest (unmeasured; task 1.3). **A
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
was spent.

**How far past the line one Igor can go.** Between readings an Igor does not see its own spend. The
gate before an item sees the last reading the previous run carried, and that reading is timed when
its event arrived. So an Igor can pass the line by the item it admits plus whatever the previous run
spent after its last event. Measured 2026-10-11 on two captured calls (task 1.1a; ordinary worker
runs are task 1.1b): a run gets one event, right after its first API call's response, so the last event is also the first, and nearly all of the previous run's
spend comes after it. So one Igor process can overshoot by about two runs: the previous run, which
its reading missed, and the item the gate admits. On 2026-09-28 Adam accepted an overshoot of one
run, or two where a run's last event comes early; the measurement shows the event always comes
early, so the accepted figure is two. Every run carries a fresh reading, so the overshoot does not
compound.

**Per Igor, not coordinated (settled by Adam, 2026-09-28).** Every Igor on a seat reads the same
whole-seat reading, so they are held to one line without adding up each other's books. Each
process can overshoot by about two runs, so N processes on one seat can pass it by about 2N runs.
That counts several Igors, and the several processes of one role that `concurrent-instances` runs
at once. A coordination marker, a compare-and-swap on the
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

### A role's reserve

Decided by Adam on 2026-09-28, and added as *A role may hold back more of a seat than the seat
does*. A role file may declare one `reserve`. It applies to every seat the role draws on, and is
not set per role and seat. The line that role's Igor checks
uses `max(seat reserve, role reserve)`, so a role can hold back more than a seat and never less,
and a lender's reserve holds whatever a role declares. On a seat at reserve 0 the role's reserve
alone sets its line.

It is priority without coordination. With `frontend` at 0.3 and `generalist` at none on one seat,
once the reading passes `frontend`'s line only `generalist` takes items, so `generalist` tends to
use more of the seat. It is **not a guaranteed share**, and that is accepted. A low-reserve role
that always has work can crowd a higher-reserve role out for most of a window. No mechanism is
added. The two remedies are choosing which roles a seat serves, and adding seats so that the
low-reserve role is fully served elsewhere. A guaranteed per-role minimum is not
specified, and is added only if it proves to be needed.

**It is raised by inheritance, never lowered (Adam, 2026-09-28).** A child role may hold back more
than `roles/org.yaml` or its parent, never less, and config validation refuses a child reserve below
its parent's, naming both. That is the same protective direction as `max(seat, role)`. It runs the
opposite way to `budget_share`, which a child may only lower, because both inherit toward holding a
role back.

### A reserve on a dedicated seat is pacing

Decided by Adam on 2026-09-28. On a seat nobody works on, a reserve holds capacity back for work
that arrives later in the window, and at 1 it spends the window evenly. A dedicated seat defaults to
reserve 0, because burning early is not waste when the work is there. So the validation that refuses
a reserve on a dedicated seat (`parseOrgBudget` in `src/budget.ts`, "is dedicated, so nobody is
there to reserve capacity for") is removed in gate two. So are the parser forcing a dedicated seat's
reserve to 0 and its range check that refuses a reserve of 1,
since a reserve of 1 now means even pacing. The `MODIFIED` *Seats are named configuration entities
with an owner and a reserve* says a reserve is the share of the remaining window held back, from 0
to 1 inclusive, on any seat. The key keeps its name `reserve` (confirmed by Adam, 2026-09-28).
With the refusal and the forced zero gone, the `dedicated` key does nothing, and `seat-files`
(#171), which declares seat keys, drops it (Adam, 2026-10-17).

### What the dollar bound leaves behind

**Capacity in dollars is kept, as a report.** `capacityFor`, `whyNoFigure`, `resetAnchor` and the
capacity half of `boundsForSeats` (`src/capacity.ts`) still derive a figure, and `igor budget` still
shows it with its source. No gate reads it. The in-force *Capacity is recorded spend…* and *A limit
error lowers the estimate that permitted it* carry `MODIFIED` deltas saying so.

**`capacity_estimate` is removed in gate two (Adam, 2026-09-28).** It existed to start a reserved
seat under the dollar bound, and the line does not need it. It leaves `SEAT_KEYS`, and nothing
handles a config that still carries it beyond the strict check that refuses any unknown key: nobody
runs Igor yet, so there is no config to migrate (Adam, 2026-10-11). The one case it used to cover,
a fresh reserved seat below every threshold, needs nothing in its place: task 1.1 measured that
such a seat still emits a `rate_limit_event`.

**`budget_share` is measured against the reading (Adam, 2026-09-28).** It is a ceiling on one
role's share of a seat, and is not the seat reserve. On the live path it is already measured against
the reading: the role's share of Igor's recorded spend times the reading's `percentUsed`
(`chooseSeat`'s live path in `src/budget.ts`). The derived path, used where no live `/usage`
reading answers and the gate works from recorded observations, divides by the capacity figure
instead, `capacity.spentUsd / capacity.capacityUsd`, and checks nothing where there is no figure.
Gate two moves that path to the reading too, so no figure in dollars is a gate input
anywhere. The reading counts the owner's use, so on a shared seat a role meets its ceiling sooner
than its own spend would take it, which errs toward holding it back. *`budget_share` is a ceiling,
not a reservation* carries a `MODIFIED` delta saying so.

**No other operator-configured dollar ceiling exists.** `git grep` over `src/config.ts`, `docs` and
`README.md` for ceilings, allowances and reserves finds only the seat `reserve`, `budget_share`, and
`capacity_estimate`. After gate two none of them is measured in dollars, and the last does not exist.

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
already calls the same model with tools denied (`TRIAGE_MODEL`, `src/triage.ts`). A probe's cost
is recorded against the seat it read, on a spend row. Spend attribution, capacity and `igor budget`
all count spend rows. #101 also records a credential check as a row of kind `check`, and its
`loadSpend` skips those rows, so the cost must not ride on one. Where #101 records the probe as a
credential check, the check row is a second row, and it carries no cost. A probe is made on no role's behalf, so the record says "seat probe" where
a role would go. That needs a `MODIFIED` delta on *Every invocation records which role
spent from which seat*, whose in-force text requires a role. The in-force *A spend with no seat
behind it does not happen* also requires a seat the gate chose. This change cannot carry a
`MODIFIED` block for it. Every seat now has a token, so the requirement's scenarios about a seat
with no token no longer hold, and the block would have to drop them; openspec refuses a block
that drops scenarios. `seat-files` (#171), which
archives with this change, removes that requirement and re-adds it with a probe as the stated
exception.

**When a seat needs one: no unexpired reading of a window.** A reading is a lower bound on its
window until that window resets, so a clock threshold shorter than the reset would spend money to
learn something the log already bounds. So "stale" means past its reset. For an idle seat whose
probes return events, that is about one probe per session window, roughly five a day.

**Bounds (settled by Adam, 2026-09-27).** At most one probe per seat per hour, and none while one is
running. After a probe that got no event, or none that could be read, none for five hours. A failed
probe is never retried in a loop. Tasks 6.1 and 6.4 build and test them. Each Igor holds one role,
so a server runs one loop per role, and a seat several roles draw on would be probed by each. So
the hour is counted from the most recent probe of the seat any Igor recorded in the log. Two Igors
that start a probe in the same moment can both make it. That costs one extra probe, which is
accepted as the overshoot is.

**From an empty directory.** A probe carries a seat token. Run from a directory holding a project's
`.claude/settings.json` or `CLAUDE.md`, it would load that project's hooks beside the token, and
"no tools" does not stop a hook. So it runs from a fresh empty temporary directory.

**One probe per known reset, not two.** *Window length and schedule, measured just after a reset*
above places a post-reset probe ten minutes after each reset a reading stated. On an idle seat a
reading also expires at that reset, which would call for a probe at once, and the post-reset probe
would then fall inside the hour and never run. Where the reset is known, the post-reset probe is the probe for the expiry,
and it measures the window too.

**Never on a refused seat, nor on one spending extra usage.** An unexpired observation at 100% means
the provider has already said no until its reset, so a probe there only spends a failed call. An
unexpired overage reading means a probe would be billed beyond the subscription, and no opt-in
exists. Probes of the seat stop until the window that the overage reading's `rateLimitType` names
resets, not any other: the flag is on every row of the event, and a session overage read off the
week row would otherwise hold probes off for a week.

**The line a probe checks is the seat's own.** The line is per role, and a probe is made for none,
so a probe's exclusion uses the seat's reserve. The crossing probe (*Probed at a crossing*, below)
is the exception: the gate makes it while deciding for a role, so it uses that role's line.

**Never on a seat at or past its line (settled 2026-09-28).** A probe's consumption is Igor's. A
seat's session reading can expire while its week reading is past the week's line, and probing it
then would spend into what the line holds back. So a seat whose most recent unreset reading of any
window is at or past that window's line is not probed. The line moves, so the same seat can be
probed later in the window without anything else changing. This replaces the earlier exclusion of a
seat at its dollar bound, and settles the earlier question about probing an uncalibrated seat past
`1 − reserve`: the moving line applies, not a fixed one.

**A probe checks the credential too (decided 2026-09-28).** A probe answered with an authentication
failure (401) is not a probe that got no event: the five-hour back-off does not apply to it, so a
stopped seat is re-checked hourly. It is recorded as a row in `executions.ndjson` carrying
`seat:<id>:credential` and the credential's full hash, and #101 rebuilds the seat's credential
condition from that row (#65's breaker is folded into #101). A probe that succeeds is recorded
without the key, which is the check that clears it. Against the exclusions: a seat whose credential
stop is open is probed only as that clearing check, whatever its readings, and within the hourly
limit. The refusal, overage and line exclusions still hold it off, because a seat any of them
excludes could not be used even with its credential cleared, so the stop costs nothing while they
last.

**Once #101's stuck-conditions spec is in force, these credential rules move into a
stuck-conditions delta (Adam, 2026-10-17; task 15.1).** This change's own rule opens the seat's
credential condition on one probe 401, and clears it with a successful probe made at most once an
hour. #101 opens a condition once its key's occurrences reach a configurable recurrence threshold,
provisionally 3, and clears it by running an
item after a cooldown that grows from 15 minutes to 6 hours. In the delta, a probe's 401 counts as
one occurrence of `seat:<id>:credential`, like a run's. One probe 401 therefore no longer opens the
condition alone; it opens at #101's threshold. A probe that succeeds clears the condition. That
clearing probe keeps this change's limit of once an hour; it does not wait for #101's growing
cooldown (Adam, 2026-10-17). A seat whose token has been fixed is therefore back within the hour,
however long the condition has been open.

**What a probe's reading unlocks.** Under the line, a reading below the line is all a seat needs. A
probe of an idle reserved seat that returns a reading below its line opens it for work with no
capacity figure and no calibration step. A probe of an idle seat that has a figure refreshes its
fullness for the gate and the report.

**A seat below every threshold gets an event** (task 1.1, measured 2026-10-11). So a probe of a
fresh reserved seat returns a reading, and that reading is what starts the seat: no capacity
figure is needed.

**Probed at a crossing (Adam, 2026-10-10).** When the line rises past a seat's reading, the seat
reopens on a reading that is only a lower bound. If the owner has used the seat since, the first
item Igor starts there spends into the margin the line keeps for them, before that worker's own
reading stops further work. A probe at the crossing reads the seat first, at the cost of one probe
per crossing, and no more than one an hour. A probe that returns nothing leaves the gate on the old
reading, which is the behaviour without the probe, so the probe can only add caution, never lock a
seat out. It is built with the rest of section 6, so task 1.1 gates it too.

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
  seat, and its scenarios are kept as instances of the no-reading rule.
- ***A pool is an ordered list of seats, and order is the allocation mechanism*** — "A seat declaring
  a reserve is drawn on only once it has a capacity figure". This change carries no delta for it,
  because the `seat-files` change removes it (see *Pools are dropped* below).
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
- ***`budget_share` is a ceiling, not a reservation*** — its text said nothing about how a share is
  measured, and the derived path measured it with a capacity figure. Now it is measured against the
  reading, on every path.

One more `MODIFIED` delta is about the probe rather than the dollar bound: *Every invocation
records which role spent from which seat*, so that a probe's spend row may name no role.

No in-force requirement specifies `igor observe`, the scheduled reading, the refusal of a seat
credential, or anything in `budget-pacing`, since neither change was archived. So their withdrawal
needs no `REMOVED` delta.

## Pools are dropped (amended 2026-10-04)

Adam decided that pools are dropped
([#148](https://github.com/adamstallard/igor/issues/148)). A seat's own file lists the roles it
serves, and among the eligible seats under their line the Igor picks the one with the most
headroom, with the soonest reset breaking ties
([#147](https://github.com/adamstallard/igor/issues/147)). The open change `seat-files`
specifies it, and builds after this one.

**This change carries no delta for *A pool is an ordered list of seats, and order is the
allocation mechanism*.** `seat-files` removes that requirement (decided 2026-10-04, Adam), and a
block here modifying it would fail archive once that removal lands. What a block here would have
said, that a seat has headroom while read below its line and that exhausting every seat is a
handoff, is in `seat-files`' requirement on choosing a seat.

**This change and `seat-files` archive together (Adam, 2026-10-17; task 16.1).** The in-force pool
requirement says a reserved seat is drawn on only once it has a capacity figure, and names
`capacity_estimate`, which this change removes. Archived alone, this change would leave that text in
force, contradicting *A seat with no reading is drawn on only where its line is the whole window*.

Pools also appear as **a remedy for a greedy role**, in *A role may hold back more of a seat than
the seat does*. The requirement and this design name the remedy as choosing which roles a seat
serves, which is true of a pool today and of a seat's own file under `seat-files`. Its scenario
says the role may draw on three seats, not a pool of three.

## Settled on 2026-09-28, after the questions this design raised

- **`budget_share` is measured against the reading**, on every path. No figure in dollars is a gate
  input anywhere (task 7.10).
- **`capacity_estimate` is removed in gate two**, with no handling of an old config beyond the
  strict check on unknown keys (task 14.1).
- **A role's reserve is raised by inheritance, never lowered**, and a child reserve below its
  parent's is refused, naming both (task 12.1).
- **The overshoot is accepted at about two runs per process.** Adam accepted one run, or two where
  a run's last event comes early. In task 1.1a's two captured calls it came early, so the figure
  is two; task 1.1b checks ordinary worker runs.
- **Losing the event:** seats whose effective reserve is 0 run without a reading, reserved seats go
  idle, and `igor budget` says why a seat is idle (task 7.6).
- **The names:** the rename to *A seat with no reading is drawn on only where its line is the whole
  window*, the re-added *A seat's fullness is read from the seat…* and *Recorded spend attributes a
  seat between its roles, and decides no headroom*, and the key name `reserve`, are confirmed.
- **Coordination across Igors** stays per process, until a reserved seat is actually shared by
  several Igors.

## Settled on 2026-10-11

- **What starts a fresh reserved seat:** the probe. Task 1.1 measured that a seat below every
  threshold still emits a `rate_limit_event`, so the probe reads it.
- **`allowed_warning` changes no gate decision.** It is recorded and reported, and the line uses
  the utilization.
- **Triage stays on `--output-format json` until this change is built.** Switching it to
  `stream-json --verbose` is deferred to then, and #75 is the fallback until it switches.
- **The observation log is read whole.** Up to two rows per worker run grows it at the execution
  log's rate, which is still small. This is a known limit, to revisit before a fleet runs many
  seats.

## Settled on 2026-10-17

- **A probe's credential rules move into a stuck-conditions delta** once #101's spec is in force
  (*A seat probe*, above; task 15.1). The probe that clears the seat's credential condition,
  `seat:<id>:credential`, keeps the hourly limit and does not wait for #101's cooldown.

- **Issue #69, which asks how old a reading may be before the line distrusts it, is closed with this
  change's reasoning** (*A stale reading is a lower bound until its window resets*) once task 1.3 confirms that fullness does not fall within an instance (task 1.6).
- **This change and `seat-files` (#171) archive together** (*Pools are dropped*; task 16.1).
- **`dedicated` is dropped in `seat-files` (#171)** (*A reserve on a dedicated seat is pacing*).

## Settled on 2026-10-18

- **Every seat has a token** (Adam): every seat may be probed with its own token, and Igor never
  uses a stored Claude login (*Whose reading it is*; proposal, decision 14). It replaces Adam's
  rule of 2026-10-17, recorded then as decision 14, that a seat naming no token ran on the
  server's stored login and was never probed.
- **#171 adds two probe exclusions** (Adam; proposal, decision 18). #171 carries a seat's token as
  ciphertext in its seat file. A `MODIFIED` block in #171 adds to *A seat nothing has read is
  probed on the Igor server with its own token* that a seat whose token Igor could not decrypt is
  not probed, and that `igor run` makes no probe.

## Still open

- **A guaranteed per-role share.** Not specified. Add it only if a role's reserve proves too weak a
  priority in practice. Choosing which roles a seat serves, and more seats, are the remedies.
- **The `rejected` shape** (#57). The single-row rule is written against the contributor-reported
  shape and must be checked against the first captured refusal.
- **Per-model weekly windows** have no source for a token seat once `igor observe` is removed. See
  *What is lost* above. #75 task 5.1 is where they are taken up.
