## Decisions

Terms used below. A **seat** is a Claude subscription Igors spend from. A **reading** is the
provider's report of how full a seat's window is, carried in each run's output as a
`rate_limit_event`. A window's **instance** is one stretch of it from one reset to the next. A reading is
**unreset**, or **unexpired**, until the reset it states; one whose reset never resolved is
unreset until one window length after it was taken. A
**probe** is one minimal model call made on the server that runs the Igors, with a seat's own
token, to get a reading. #101 is `condition-backoff`, which records stuck conditions and is about
to merge; #171 is `seat-files`, which moves seat configuration into one file per seat and carries
a lent seat's token as ciphertext; #179 is `concurrent-instances`, which runs several processes of
one role, each with a number, its **rank**, and each writing a **heartbeat** file its siblings
read. #75 (`triage-refusal-calibrates`) records a refused triage call as an observation of its
seat. #174 (`pinned-skills`) gives every model call one shared set of arguments, and #175
(`worker-user`) runs the worker as a separate Unix user.

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
   On 2026-09-28 Adam accepted one run, or two where a run's reading comes early in the run. In
   the two calls task 1.1a captured, the reading came right after the first call, so the figure
   approved here is two, and Adam kept it on 2026-10-19 until task 1.1b reports. Task 1.1b checks
   ordinary worker runs, and sends the figure back to Adam if a run carries an event after its first call. *Rejected for now:* a coordination marker across Igors, taken up once a reserved
   seat is actually shared by several.
5. **A role may declare a `reserve`**, applied to every seat it draws on, raised by inheritance and
   never lowered (Adam, 2026-09-28).
6. **A reserve on a dedicated seat is pacing**, from 0 to 1 inclusive, defaulting to 0 (Adam,
   2026-09-28).
7. **A seat nothing has read is probed on the Igor server with its own token** (Adam, 2026-09-27):
   at most once an hour, and not again until five hours after a probe that got no event. It is
   never made on a refused seat, one spending extra usage, or one at its line. A seat is probed at its crossing before it is drawn on
   again (Adam, 2026-10-10). *Rejected:* `igor observe` run on a lender's machine;
   `scheduled-observation` is withdrawn with it.
8. **A window's length, and its schedule (whether its instances start at fixed times or at first
   use), are measured by a probe ten minutes after a known reset**, once per window type and then about
weekly (Adam, 2026-09-28). The smallest gap between observed resets is a fallback that only shortens a length.
9. **No figure in dollars gates anything** (Adam, 2026-09-28). `budget_share` is measured against
   the reading, and `capacity_estimate` is removed with no handling of an old config beyond the
   unknown-key refusal (Adam, 2026-10-11).
10. **`budget-pacing` is withdrawn**; its one surviving requirement, holding back at the line, moves
    here (Adam, 2026-09-28).
11. **No overage opt-in** (Adam, 2026-09-27).
12. **Three rules of 2026-10-11** (Adam). `allowed_warning` changes no gate decision. Triage's
    model call switches to the stream only after this change is built; until then a triage call
    yields no reading, and #75's row for a refused triage call is its only observation. The
    observation log stays read whole, although this change grows it by up to two rows per worker
    run (see *Impact*).
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
14. **Every seat has a token, and Igor never uses a stored Claude login** (Adam, 2026-10-18). A
    stored login is the
    credentials `claude` keeps in a home directory. This change therefore has no rule for a seat
    without a token: every seat may be probed with its own token, and every reading is of a seat
    whose token paid. #171 (`seat-files`) refuses a seat file that names no token, forbids any model
    call on a stored login under `igor serve` or `igor run`, and archives with this change
    (decision 16). This change carries no block on the in-force *A spend with no seat behind it
    does not happen*, whose scenarios describe a seat with no token and an organization with no
    seats; openspec will not let a `MODIFIED` block drop them. #171 removes that requirement in
    the same commit and re-adds it without them, naming the probe as an exception to it: a probe
    spends from a seat the gate did not choose.
    *Rejected:* a seat naming no token that runs on the server's stored login and is never
    probed, Adam's rule of 2026-10-17, which this replaces.
15. **Issue #69, which asks how old a reading may be before the line distrusts it, is closed with
    this change's reasoning once task 1.3 confirms that fullness does not
    fall within an instance** (Adam, 2026-10-17). A reading bounds its window from below until the
    reset, so it needs no age limit (task 1.6).
16. **This change and #171 archive together** (Adam, 2026-10-17). The in-force pool requirement
    names `capacity_estimate`, which this change removes, and only #171 removes that requirement,
    so archiving this change alone would leave in-force text naming a key that no longer exists
    (task 16.1). The order of every open change's archive is in issue #204.
17. **The `dedicated` seat key is dropped in #171, not here** (Adam, 2026-10-17). Once this change
    stops refusing a reserve on a dedicated seat and stops forcing its reserve to 0, the key does
    nothing. #171 is where seat keys are declared.
18. **#171, not this change, adds two probe exclusions, by modifying this change's probe
    requirement** (Adam, 2026-10-18). #171's `seat-budget` delta has a `MODIFIED` block on *A seat
    nothing has read is probed on the Igor server with its own token*, copied from this change
    with its scenarios. It adds that the probe skips a seat whose token Igor could not decrypt,
    and that `igor run` makes no probe. #171 archives after this change, so once this requirement
    is in force, #171's block replaces it. This change states neither exclusion itself.
19. **Every row taken from the stream is `source: "stream"`** (Adam, 2026-09-27). *Rejected:* an
    optional `via: "stream"` field beside an existing source.
20. **A stream reading is timed when its event arrived, not when the run ended.** This change's
    choice, which Adam approves with it. *Rejected:* timing at the run's end, which would count
    the run's own spend against a fullness taken before it.
21. **Overage shuts only the window its reading names.** This change's choice: a session past
    its cap says nothing about the week. *Rejected:* shutting both windows, which could hold a
    seat out for days.
22. **A probe's exclusions use the seat's own reserve**, since a probe is made for no role; only
    the crossing probe, made while deciding for a role, uses that role's line. This change's
    choice.
23. **A role *has a seat it can spend* when the gate would choose one for it now** (Adam,
    2026-10-18, for #179): when the gate, deciding now, would choose a seat for it under every
    rule it applies. Adam decided it for #179's heartbeat, which says a rank is available only
    while it is free and its role has a seat it can spend. #179's branch already cites the term. A role whose seats are all past their reserve lines, or
    passed over for any other reason, has none. This change defines the term once, in *A role has a seat it can spend when
    the gate would choose one now*, which #179 cites.

24. **One run contributes one reading, the last event it received.** This change's choice.
    *Rejected:* a row per event, which grows the log by the run's length for no new information.
25. **A refusal is recorded once, from the stream where the stream names its window.** This
    change's choice. *Rejected:* a row from the stream and another from the envelope, the run's
    final result message, which also reports a usage limit.
26. **A `rejected` event on a run that succeeded is recorded at the figures it gives, not as a
    refusal.** This change's choice: a limit the run retried past is not why it stopped.
27. **Two Igors that start a probe of one seat at once may both make it.** This change's choice.
    *Rejected:* coordinating probes across Igors.
28. **A probe checks the seat's credential too** (Adam, 2026-09-28). A probe answered 401 opens
    the seat's credential condition, a probe that succeeds clears it, and the five-hour back-off
    does not follow a 401, so a stopped seat is re-checked hourly. Decision 13 moves these rules
    into a `stuck-conditions` delta once #101 is in force.
29. **A probe whose directory has a `.claude` directory or `CLAUDE.md` above it is not spawned,
    and is recorded as a probe that errored** (decision 41 says how it is recorded). This change's choice, from task 6.0's measurement that a probe run under a home
    loaded that home's skills. *Rejected:* probing anyway and relying alone on `--setting-sources user`,
    the flag that limits which settings files Claude Code loads: checking the directory costs
    nothing, and the probe holds a seat token.
30. **A reading whose reset never resolved takes `remaining` as 1**, so its line is `1 − r`, the
    most the line holds back. This change's choice. *Rejected:* `remaining` as 0, which would put
    the line at 100% and hold nothing back, and excluding the reading, which would leave a
    reserved seat unread.
31. **A handoff for a window the line shut states the line's crossing, marked approximate, not
    the reset** (Adam, 2026-10-10, moved here from #74). The crossing is the instant the rising
    line passes the seat's last reading, when the window reopens for Igor. It is marked because
    that reading is only a lower bound.
32. **A seat whose credential condition is open is still not probed while the refusal, overage or
    line exclusion applies to it.** This change's choice: such a seat could not be used even with its credential
    cleared. *Rejected:* probing it regardless, which spends on a seat nothing could use.
33. **A probe's spend row names a seat probe in place of a role.** This change's choice, since a
    probe is made for no role. *Rejected:* charging it to the role the gate was deciding for.
34. **A post-reset probe due at a reset is also the probe a reading expiring there calls for.**
    This change's choice. *Rejected:* a second probe at the same reset.
35. **A seat whose crossing comes within the hour after its last probe stays held until the next
    probe**, which the one-probe-an-hour limit delays. This change's choice. *Rejected:* admitting
    the seat on its old reading without a probe.
36. **Capacity in dollars is still derived, and only reported.** This change's choice, under
    decision 9. *Rejected:* removing the derivation, which would drop the figure `igor budget`
    shows.

37. **The live `/usage` read is removed in the first change built after #171's code lands, not in
    this change** (Adam, 2026-10-19). With a token, `/usage` reports no window (`design.md`, *What
    is not removed*), and once #171's code lands every seat has a token, so the read returns a window
    for no seat while still spawning `claude` twice per seat at each gate. That change removes
    `readUsage`, `runUsage`, `hasSubscription`, `parseUsage` and the live paths of `chooseSeat`,
    `budgetGate` and `renderBudget`. This change's code is built before #171's, so it keeps the
    read and gives it decision 1's line, which rises toward the reset (task 7.3). When that later
    change removes `runUsage`, the edits #174's and #175's tasks make to it go too.
38. **If task 1.4 has no capture of `isUsingOverage: true` when the rest of gate two is built,
    *A seat spending extra usage has no headroom* moves to a follow-up issue** (Adam, 2026-10-19),
    so this change and #171 can archive. The two archive in one commit, this change's archive step
    first (decision 16, task 16.1), so a requirement left unbuilt here holds #171 back too. The captures so far are of seats whose overage is
    disabled for the organization, so a true value may never be seen, and a requirement whose code
    is not built would keep this change from archiving.
39. **Until #171's code lands, the probe skips a seat that names no token** (Adam, 2026-10-19).
    This change's code is built first, since #171 builds on it, and until #171's code lands the
    in-force `seat-budget` still lets a seat name no token and run on a stored login. This is the
    one rule here for such a seat, a narrowing of decision 14 for that interval. The probe
    requirement states it with no scenario of its own. #171's `MODIFIED` block on that
    requirement replaces it at archive, so a scenario added here would be missing from #171's
    copy, and openspec refuses a block that drops a scenario the requirement has. *Rejected:* holding this change's code
    until #171's merges.
40. **The two captures under `captures/` keep only their `rate_limit_event` lines and, from the
    `init` line, `type`, `subtype`, `claude_code_version`, `model` and `apiKeySource`** (Adam,
    2026-10-19). The rest was the operator's local setup (session ids, the skills and plugins
    loaded), which a public repository should not hold. When each event arrived in its run is
    recorded in task 1.1a. The capture of a three-call run is named
    `2026-10-11-three-call-run-its-one-event.jsonl`, since that run got one event, after its
    first call (task 1.1a); whether ordinary runs do too is task 1.1b.

41. **A probe runs from a probe directory under `<state dir>/probes`, and only where no directory from its own up to `/`
    can be written by any user but root and the Igor.** This change's choice, which approving the
    change approves. It fixes a gap the 2026-10-19 consistency read found: the probe ran under
    `/tmp`, which every user can write. `<state dir>` is the Igor's state directory as #216
    (`lore-search`) defines it, by Adam's decision of 2026-10-21 (decision 42). Under the shipped
    systemd unit and the shipped compose file, the only ways `igor serve` runs, it is
    `/var/lib/igor`. Each probe gets two new directories in its process's probe directory
    (decision 43), its working directory and its `HOME`. Immediately before the probe,
    each directory from the working directory up to `/` must be owned by root or the Igor, writable
    by no other user, and hold no `.claude` or `CLAUDE.md`. Once #175's (`worker-user`) code runs
    the worker as a separate user, nobody else can write those directories, so nothing can be
    planted between the check and the spawn. This decision accepts that until then the worker runs
    as the Igor's own user, and can write wherever the Igor can, these directories included. A
    probe the check refuses is recorded as one that errored: a spend row with no cost and no event.
    The hourly limit on probes and the five-hour back-off after a probe with no event then space
    out its retries. And the probe made at a seat's crossing, once its line has risen past its last
    reading, cannot hold the seat forever: once it is refused, the gate decides on the reading it
    has.
    *Rejected:* a directory under the system's temporary directory with only decision 29's check,
    for a `.claude` or `CLAUDE.md` alone. Any user, the worker user among them, can write
    `/tmp/.claude`, which fails every probe if it is there at the check, or loads into a call
    holding a seat token if it is written after.
42. **The probe directory is named by #216's state-directory definition, not by a path of its
    own** (Adam, 2026-10-21). #216's decision 105 makes that change the one owner of the state
    directory: `$STATE_DIRECTORY` where it is set, else `$XDG_STATE_HOME/igor`, as #216's
    `graceful-handoff` delta states it. This change cites it. #216 archives after this change in
    issue #204's order, so until #216 archives this change cites a requirement not yet in force,
    which Adam accepted with the decision. Where `STATE_DIRECTORY` and `XDG_STATE_HOME` are both
    unset, the state directory is `~/.local/state/igor`, under the Igor user's home. Claude Code
    creates `~/.claude` in that home, so the home fails the ancestor check, and every probe is
    refused and recorded as one that errored. Neither shipped way of running `igor serve` leaves
    `STATE_DIRECTORY` unset.
43. **Each process keeps its probes in a directory of its own, and sweeps only that one at
    start.** This change's choice, which approving the change approves. Every role and rank on a host shares the state directory, so a sweep of all of
    `<state dir>/probes` at one process's start would delete a probe another process is making.
    A process's probe directory is `<state dir>/probes/<role>-<rank>`, `<rank>` as #179
    (`concurrent-instances`) numbers a role's `igor serve` processes. Only `igor serve` probes,
    so `igor run` has none. *Rejected:* one shared
    `probes/` swept by every start, which a consistency read found deletes a running sibling's
    probe.

**Still open:**

- **A guaranteed per-role share.** Not specified; added only if a role's reserve proves too weak a
  priority.
- **The `rejected` shape** (#57) is contributor-reported, not captured (task 1.5).
- **A never-used seat is unmeasured.** Task 1.1 measured a seat below every threshold, at 42% and
  11%, not one with no current instance; task 1.1c measures one when a fresh seat is available.
- **Per-model weekly windows** have no source for a token seat (#75 task 5.1).
- **Which readings combine into a capacity on a shared seat** is not decided; it waits until a
  long run of readings has been collected (`design.md`, *Newest-wins, against `src/capacity.ts`*).
- **The probe with #174's arguments is unmeasured.** #174 gives every `claude` call a shared set of
  arguments. Task 6.0 measured it without
  `--plugin-dir`, `--setting-sources` or `--strict-mcp-config`; task 6.0a measures whether it
  still gets an event, and at what cost, once #174 is built.
- **Facts the gate rests on are unmeasured:** that fullness does not fall within an instance
  (task 1.3); what `isUsingOverage` means (task 1.4); whether an ordinary worker run carries an
  event after its first call (task 1.1b); and whether triage's single JSON envelope, from
  `--output-format json`, carries the reading as `rate_limit_info` (task 11.1), which decides
  whether a triage call yields a reading. The overage rule is not built until 1.4
  confirms it.
- **Whether `/usage` reports a window to a stored login** is unmeasured. Until #171's code
  lands, a reserved seat that names no token is read only by the live read (decision 39); if
  that read gets no window either, such a seat stays idle. Task 5.4's message assumes a seat
  with a token, saying `/usage` reports no window to the seat's token, so it would be wrong for
  such a seat.
- **Findings of the 2026-10-19 consistency read, for this change's next revision.** Each is for
  this change's author to fix, unless it names another change or Adam, and none is fixed yet:
  - A refusal the stream reports for one model's weekly window is recorded as a per-model row,
    which the gate does not read, so the refused seat is chosen again. Whether such a refusal
    should hold the seat, or fall back to the envelope, is a question for Adam, and which window
    a per-model refusal names is unmeasured (task 1.5).
  - That the probe runs as the Igor's own user, which holds every seat token, is a choice not
    among the decisions.
  - The in-force *A seat shut in both windows returns on the later of the two* still speaks of
    a seat with no reading that is bounded by its recorded spend, the dollar bound decision 1
    rejected, and no block here modifies it.
  - #82 (`stopped-scope-visible`) shows a seat as unread using only the seat's own reserve, where
    this change uses the larger of the seat's and the role's.
  - #174's task 5.3 note to operators says the service user's home "reaches every triage
    call and seat probe". A seat probe runs with its own `HOME` in `<state dir>/probes`
    (decision 41), so the note is wrong for the probe.
  - #171's copy of the probe requirement drops "In a deployment that declares seats". It also
    still says the probe runs from "an empty temporary directory", which decision 41 replaces
    with a pointer to *A seat probe runs where only the Igor can write*. #204, the issue that
    sets the order every open change archives in, puts #171 after this change, so #171's copy
    replaces this change's text, and #171 must copy the requirement again.
  - **From the 2026-10-21 consistency read, new and not yet fixed.** Unlike the items above,
    the first four concern another change as well as this one, and are reported to it: #174
    makes the skills check it runs at startup one of this change's seat probes while keeping arguments that load skills and
    allow tools, against the probe's "no tools" rule (#174 lists it as open); #216's
    `role-config` copies drop `reserve`, which task 16.3 and #216's task 5.2 must carry; #179
    restates the gate and names pacing, which decision 10 withdraws; #171 forbids the live
    `/usage` read that decision 37 keeps until the change after #171. The rest are this
    change's: the probe's spend row must be a run row for `loadSpend` to return it, and #101
    counts every run row as evidence for each condition on its seat, so a probe would count
    toward conditions it says nothing about; an error exit and a 401 both bring no event, so each trips the five-hour
    back-off the spec says a 401 must not; a seat that names no token contradicts "the
    credential a seat holds is a `setup-token` one"; the post-reset probe's fixed delay
    contradicts "no behaviour SHALL require a reading at a particular time"; the per-model
    weekly window is unmeasured but specified; the crossing instant and the reserve's
    monotonic rule are each stated twice; the ancestor check names `.claude` and `CLAUDE.md`
    but not `CLAUDE.local.md` or `.mcp.json`; keeping the probe's row out of what #101's
    condition reader counts is a choice with no decision; and task 1.1a is ticked though its ordinary-run
    half was not done.
  - A post-reset probe's scenario omits that it is due only until the window is measured, then
    about weekly.
  - The instant a handoff names is not when the seat admits work, since a crossing probe comes
    first.
  - `docs/architecture.md` presents what two captured calls showed as true of every run.
  - "Probe" also names #101's (`condition-backoff`) cooldown item, the one item a stopped scope
    is allowed to test whether its fault recurs; "seat probe" throughout would avoid that.
  - Some SHALLs lack scenarios, one rule sits in both `graceful-handoff` and `seat-budget`, and
    some rationale sits in requirement text.

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
  event (task 1.1), so the probe can start an idle seat; a never-used one is still to be measured
  (task 1.1c).
- **The reserve becomes a line on the reading that moves toward the reset** (Adam, 2026-09-28).
  For each window, Igor starts work on a seat only while its most recent unreset reading is below
  `1 − r × remaining`, where `remaining` is the fraction of the window still to come and `r` is the
  larger of the seat's reserve and the role's. The reserve is held back at the start of a window
  and released evenly toward the reset: at 0.3 the line is 70% just after a reset, 85% halfway,
  97% with a tenth left and 100% at the reset. At 0 the line is 100% throughout. At 1 the whole
  window is held back just after a reset and released evenly across its length, which is even
  pacing.
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

- `role-config`: a role file accepts `reserve`, which a child role may raise and never lower,
  as a monotonic field. This modifies *A role declares its sources, lane, behaviour, permissions,
  and reviewers* and *Merge semantics differ by field kind*. #153
  (`signed-publishing`) and `lore-from-corrections` modify the same two, and their `MODIFIED` blocks, which replace this
  change's when they archive later, must carry `reserve` (task 16.3).
- `surface-adapter`: `observe` leaves the list of commands that take no role, in *On GitHub,
  every call an Igor makes acts as its App*, since this change removes the command. #171 modifies
  the same requirement after this change, adding `seat` to that list.
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
  instead of recorded spend with the dollar bound, whether the reading came from the live `/usage`
  read or from recorded observations. The dedicated-seat reserve refusal and the check that
  refuses a reserve of 1 go. The remedies that name `igor observe` are reworded.
- Role configuration gains an optional `reserve`.
- `src/cli.ts`: the `observe` command is removed, with `test/observe.test.ts`.
- The serve loop gains the seat probe.
- `capacity.ndjson` grows by up to two rows per worker run, one per window of its one reading, at the execution log's rate rather
  than a refusal's. It is still read whole, a known limit to revisit before a fleet runs many seats.
- `igor budget` shows each window's reading against its line, per role where a role reserves more,
  says when a seat is holding back, and can name which source a figure came from (a run's stream,
  a probe or a refusal) and show the provider's warning
  and overage state.
- Every caveat in §6.3.3 carries over: the `rejected` shape is contributor-reported, not captured
  (#57, #15).
