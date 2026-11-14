## Decisions

Terms used below. A **seat** is a Claude subscription Igors spend from. A **reading** is the
provider's report of how full a seat's window is, carried in each run's output as a
`rate_limit_event`. A window's **instance** is one stretch of it from one reset to the next. A
reading is **unreset**, or **unexpired**, until the reset it states; one whose reset never resolved
to a time (such as an old `usage` row, written by `igor observe`, whose reset phrase nothing could place) is unreset until one
window length after it was taken. A **probe** is one minimal model call made
on the server that runs the Igors, with a seat's own token, to get a reading. The **session** window is the five-hour
one and the **week** the seven-day one. A **dedicated** seat is one nobody but Igors works on; a **lender** is the person whose seat Igors share, and the
seat's own reserve is what the lender holds back. **Gate two** is this change's implementation;
gate one is its specification. Adam owns Igor and decides the questions sent back to him.

Other changes named below: PR #101 is `condition-backoff`, which records stuck conditions; it is
merged, and its requirements are in force as the capability `stuck-conditions`, in
`openspec/specs/stuck-conditions/spec.md`. #171 is `seat-files`, which moves seat configuration
into one file per seat and stores, encrypted, the token of a seat its owner lends to someone
else's Igor. #75 (`triage-refusal-calibrates`) records a refused triage call as an observation of
its seat. #174 (`pinned-skills`) gives every model call one shared set of arguments, and #175
(`worker-user`) runs the worker as a separate Unix user. `budget-pacing` and
`scheduled-observation` are proposed changes, never archived, that this one withdraws.

1. **The reserve is a line on the seat's reading that moves toward the reset**.
   For each window, Igor starts work on a seat only while its newest unreset reading is below
   `1 − r × remaining`, with `r` the larger of the seat's and the role's reserve and `remaining`
   the fraction of the window still to come. The **line** rises as the window runs out, and the
   instant it rises past a seat's last reading is the seat's **crossing**. *Rejected:* the
   dollar bound `(1 − reserve) × capacity` on Igor's recorded spend, which needed a capacity in
   dollars for every window before a reserved seat could start, and held the whole reserve back
   until the reset, where whatever nobody used was lost.
2. **A refusal is a reading at 100% of its window until its reset**.
3. **A seat with no unreset reading is drawn on only where `r` is 0**; any other such seat is
   passed over until a probe reads it. If the provider stops sending the event, reserved seats go
   idle and `igor budget` says why.
4. **Each worker may pass the line by about two runs, and workers do not coordinate.**
   Between readings an Igor does not see its own spend, so it can pass the line by the item the
   gate admits plus whatever its previous run spent after that run's last event. That is one run
   where a run's only event comes at its end, and two where it comes early, since the reading
   then misses nearly all of the previous run's spend. In both runs task 1.1a captured, the one event came
   right after the first call, so the figure is two. Task 1.1b checks ordinary worker runs; if
   one carries an event later than its first call, the two-run figure goes back to Adam. *Rejected for now:* a coordination marker across Igors, taken up
   once a reserved seat is actually shared by several.
5. **A role may declare a `reserve`**, applied to every seat it draws on, which a child role may raise
   above its parent's and never lower. Since the larger of the seat's and the role's governs, a
   role can hold back more than the seat's lender and never less. It gives roles on a shared seat a priority, not a guaranteed
   share.
6. **A reserve on a dedicated seat is valid, and is pacing**, holding capacity back for work later in the
   window: allowed from 0 to 1 inclusive, defaulting to 0.
7. **A seat nothing has read is probed on the Igor server with its own token**:
   Any probe of a seat is made at most once an hour, and not again until five hours after one
   that got no event. No probe is made on a refused seat or one spending extra usage. Nor is it made on a seat held back
   by its line, whose newest unreset reading is at or past the line computed with the seat's own
   reserve (decision 22), with one exception, the **crossing probe**: once the rising line passes
   a held seat's last reading, the gate does not admit work on that old reading, which is only a
   lower bound, but probes the seat first and decides on the probe's reading. A crossing probe
   that records no reading, because it errored, got no event or was refused by the directory
   check (decision 41), does not shut the seat out: the gate then decides on the reading it
   already had, which is now below the line, and admits work unless another rule holds the seat. *Rejected:* `igor observe` run on a lender's
   machine (see *What Changes*).
8. **A post-reset probe, ten minutes after a known reset, measures a window's length and its
   schedule** (whether its instances start at fixed times or at first use), once per window type
   until its length is measured, then about weekly. The smallest gap between observed resets is a passive fallback
   that can only shorten the length in use, never lengthen it, since unread instances between two
   observed resets make the gap longer than the window.
9. **No figure in dollars gates anything**. A role's `budget_share`, its ceiling on what it
   consumes from its pool, is measured against the reading, and `capacity_estimate` is removed
   with no handling of an old config beyond `strict-config-keys`' refusal of an unknown key.
10. **`budget-pacing` is withdrawn and its directory deleted**: the line is its pace line, and its
    one surviving requirement moves here: holding back at the line is a reason of its own for not starting work,
    distinct from a refusal, an unread seat and an empty queue.
11. **No overage opt-in**: no configuration key lets an owner allow the fleet to spend extra
    usage, which costs real money; one is added only when somebody asks for it.
12. **Three rules on warnings, triage and the observation log**. `allowed_warning` changes no
    gate decision. Triage's model call switches to the stream only after this change is built;
    until then a triage call yields no reading, and #75's row for a refused triage call is its
    only observation. The observation log stays read whole, though this change grows it (see
    *Impact*).
13. **A probe's credential rules are in a `stuck-conditions` delta**, on *A seat's refused
    credential is a condition on that seat*. A probe's 401 is one occurrence of
    `seat:<id>:credential`, like a run's, so the condition opens once occurrences reach #101's
    recurrence threshold, configurable and provisionally 3, not on a single probe 401. A probe
    that succeeds clears the condition (task 15.1). That clearing probe keeps the once-an-hour
    limit rather than waiting for #101's cooldown, which grows from 15 minutes to 6 hours, so a
    seat whose token is fixed is back within the hour. *Rejected:* opening the condition on a
    single probe 401 beside #101's threshold, so that one condition opens by two rules.
14. **Every seat has a token, and Igor never uses a stored Claude login**, the credentials
    `claude` keeps in a home directory. So this change has no rule for a seat without a token:
    every seat may be probed with its own token, and every reading is of a seat whose token paid.
    #171 (`seat-files`) refuses a seat file that names no token, forbids any model call on a
    stored login under `igor serve` or `igor run`, and archives after this change (decision 16).
    The in-force *A spend with no seat behind it does not happen* needs the probe as an
    exception, since a probe spends from a seat the gate did not choose. #171 makes that edit when
    it archives, removing the requirement and re-adding it with the exception and without its
    scenarios of a seat with no token and an organization with no seats. This change carries no
    block on it, because openspec will not let a `MODIFIED` block drop those scenarios. *Rejected:* a seat naming no token that runs on the server's
    stored login and is never probed.
15. **Issue #69, which asks how old a reading may be before the line distrusts it, is closed with
    this change's reasoning once task 1.3 confirms that fullness does not fall within an
    instance**. A reading bounds its window from below until the reset, so it needs no age limit
    (task 1.6).
16. **This change and #171 archive in separate commits, this change first**, in the order issue
    #204 holds, which places seven other changes between them. Until #171 archives, in-force text
    that only #171 replaces contradicts this change: the pool requirement still names
    `capacity_estimate`, *A spend with no seat behind it does not happen* allows no probe
    (decision 14), two `work-triage` passages treat a seat with no capacity figure as unusable,
    and a `stuck-conditions` scenario says "from pacing" (task 15.3). Igor's code does not read
    the specs, so the gap changes no behaviour (task 16.1). *Rejected:* one commit holding both
    archives and the seven between them, which closes the gap but holds this change's archive
    until #171 and all seven are built, though a change archives once its own requirements are met.
17. **The `dedicated` seat key is dropped in #171, not here**. Once this change stops refusing a
    reserve on a dedicated seat and stops forcing its reserve to 0, the key does nothing, and #171
    is where seat keys are declared.
18. **#171 adds two probe exclusions, not this change**: the probe skips a seat whose token Igor
    could not decrypt, and `igor run` makes no probe. #171's `seat-budget` delta carries them in
    `MODIFIED` blocks, each copied with its scenarios, on *A seat nothing has read is probed on
    the Igor server with its own token*, *A seat probe is one minimal call on the seat's own token
    alone*, *A seat is probed at most once an hour, and not for five hours after a probe got no
    event* and *A seat that could not be used is not probed*. They replace this change's text when
    #171 archives.
19. **Every row taken from the stream is `source: "stream"`**. *Rejected:* an
    optional `via: "stream"` field beside an existing source.
20. **A stream reading is timed when its event arrived, not when the run ended.** This change's
    choice. *Rejected:* timing at the run's end, which would make a reading look newer than it is, as
    if the run's spend after the event were already in it.
21. **Overage shuts only the window its reading names, until that window resets.** This change's choice: a session past
    its cap says nothing about the week. *Rejected:* shutting both windows, which could hold a
    seat out for days.
22. **A probe's exclusions use the seat's own reserve**, since a probe is made for no role; only
    the crossing probe, made while deciding for a role, uses that role's line. This change's
    choice.
23. **A role *has a seat it can spend* when the gate, deciding now, would choose a seat for it
    under every rule it applies**. A role whose seats are all past their reserve lines, or passed
    over for any other reason, has none. The requirement *A role has a seat it can spend when the
    gate would choose one now* is the one definition, and #171 cites it.
24. **One run contributes one reading, the last event it received.** This change's choice.
    *Rejected:* a row per event, which grows the log by the run's length for no new information.
25. **A refusal is recorded once, from the stream where the stream names its window.** This
    change's choice. *Rejected:* a row from the stream and another from the envelope, the run's
    final result message, which also reports a usage limit.
26. **A `rejected` event on a run that succeeded is recorded at the figures it gives, not as a
    refusal.** This change's choice: a limit the run retried past is not why it stopped.
27. **Two Igors that start a probe of one seat at once may both make it.** This change's choice.
    *Rejected:* coordinating probes across Igors.
28. **A probe checks the seat's credential too**, counted as decision 13 says, and the five-hour
    back-off does not follow a 401, so a seat whose credential condition is open is re-checked
    hourly.
29. **A probe with settings files above its directory is not spawned**; decision 41 gives the
    full check and how the refusal is recorded. This change's choice, from task 6.0's measurement
    that a probe run under a home loaded that home's skills. *Rejected:* relying on
    `--setting-sources user` alone, the flag that limits which settings files Claude Code loads:
    the check costs nothing, and the probe holds a seat token.
30. **A reading whose reset never resolved takes `remaining` as 1**, so its line is `1 − r`, the
    most the line holds back. This change's choice. *Rejected:* `remaining` as 0, which would put
    the line at 100% and hold nothing back, and excluding the reading, which would leave a
    reserved seat unread.
31. **A handoff for a window the line shut states the line's crossing, marked approximate, not
    the reset**. The crossing is when the window reopens for Igor, and it is approximate because
    the reading it is computed from is only a lower bound.
32. **A seat whose credential condition is open is still not probed while the refusal, overage or
    line exclusion applies to it.** This change's choice: such a seat could not be used even with
    its credential cleared. *Rejected:* probing it regardless, which spends on a seat nothing
    could use.
33. **A probe's spend row names a seat probe in place of a role, and no reader of conditions
    counts that row**, because a probe serves no role and the row says nothing about any
    condition. The probe's credential result is
    recorded on rows of its own, which decision 13 counts (task 6.3). This change's choice. *Rejected:* charging it to the
    role the gate was deciding for.
34. **A post-reset probe due at a reset is also the probe that a reading expiring there, leaving the seat unread, calls for.**
    This change's choice. *Rejected:* a second probe at the same reset.
35. **A seat whose crossing comes within the hour after its last probe stays held until the next
    probe**, which the one-probe-an-hour limit, and the five-hour back-off where it applies,
    delays. This change's choice. *Rejected:* admitting the seat on its old reading before any
    crossing probe is made. Only a crossing probe that was made and recorded nothing admits on
    the old reading (decision 7).
36. **Capacity in dollars is still derived, and only reported.** This change's choice, under
    decision 9. *Rejected:* removing the derivation, which would drop the figure `igor budget`
    shows.
37. **The live `/usage` read is removed by #175 (`worker-user`), the first change built after
    #171's code lands, in its task 1.10, not by this change**. With a token, `/usage`
    reports no window (`design.md`, *What is not removed*), and once #171's code lands every seat
    has a token, so the read returns a window for no seat yet still spawns `claude` twice per seat
    at each gate. #175 removes `readUsage`, `runUsage`, `hasSubscription`, `parseUsage` and the
    live paths of `chooseSeat`, `budgetGate` and `renderBudget`; the edits #174's and #175's
    tasks make to `runUsage` go with it. This change's code is built before #171's, so it keeps
    the live read and compares its reading with decision 1's line (task 7.3).
38. **If task 1.4 has no capture of `isUsingOverage: true` when the rest of gate two is built,
    *A seat spending extra usage has no headroom* moves to a follow-up issue**. A requirement
    whose code is not built keeps this change from archiving, and so holds back #171, which
    archives after it (decision 16, task 16.1). Every capture so far is of a seat whose
    organization disables overage, so a true value may never be seen.
39. **Until #171's code lands, the probe skips a seat that names no token**. This change's code
    is built first, since #171 builds on it, and until #171's code lands the in-force
    `seat-budget` still lets a seat name no token and run on a stored login. This is the one rule
    here for such a seat, an exception to decision 14 for that interval. The probe requirement states it
    with no scenario, because #171's `MODIFIED` block replaces that requirement at archive and
    openspec refuses a block that drops a scenario: a scenario here would have to be carried into
    #171's copy. *Rejected:* holding this
    change's code until #171's merges.
40. **The two captures under `captures/` keep only their `rate_limit_event` lines and, from the
    `init` line, `type`, `subtype`, `claude_code_version`, `model` and `apiKeySource`**, after a
    first `capture_note` line saying what each shows, which a parser skips as an unknown type. The
    rest is the operator's local setup (session ids, the skills and plugins loaded), which a
    public repository should not hold. The trimmed lines lose when each event arrived in its run,
    so task 1.1a records that instead. The capture
    `2026-10-11-three-call-run-its-one-event.jsonl` is named for its run's one event, after the
    first call.
41. **A probe runs from a probe directory under `<state dir>/probes`, and only where no directory
    from its own up to `/` can be written by any user but root and the Igor's own user.** This change's
    choice. `<state dir>` is the Igor's state directory as #216 (`lore-search`) defines it
    (decision 42); under the shipped systemd unit and the shipped compose file, the only ways
    `igor serve` runs, it is `/var/lib/igor`. Each probe gets two new directories, its working directory
    and its `HOME`, in the probe directory of the `igor serve` role making it, each named with the id of the process making
    it (decision 43). Immediately before the
    probe, each directory from the working directory up to `/` must be owned by root or the Igor,
    writable by no other user, and hold no `.claude`, `CLAUDE.md`, `CLAUDE.local.md` or
    `.mcp.json`. Once #175's code runs the worker as a separate user, nothing can be planted in
    those directories between the check and the spawn; until then the worker runs as the Igor's
    own user and can write them, which this decision accepts. A probe the check refuses is
    recorded as one that errored, a spend row with no cost and no event, so the hourly limit and
    the five-hour back-off space out its retries. A refused crossing probe admits work on the
    reading the gate had, as decision 7 says. *Rejected:* a directory under the system's temporary
    directory with only decision 29's check for a `.claude` or `CLAUDE.md`. Any user, the worker
    user among them, can write `/tmp/.claude`, which fails every probe if it is there at the
    check, or loads into a call holding a seat token if it is written after.
42. **The probe directory is named by #216's state-directory definition, not by a path of its
    own**. #216's decision 105 makes that change the one owner of the state directory:
    `$STATE_DIRECTORY` where it is set, else `$XDG_STATE_HOME/igor`, as #216's `graceful-handoff`
    delta states it. Until #216 archives, after this change in issue #204's order, this cites a
    requirement not yet in force, which #204 accepts. Where
    `STATE_DIRECTORY` and `XDG_STATE_HOME` are both unset, the state directory is
    `~/.local/state/igor`, under the Igor user's home. Claude Code creates `~/.claude` in that
    home, so the home fails the ancestor check and every probe is refused and recorded as one that
    errored. Neither shipped way of running `igor serve` leaves `STATE_DIRECTORY` unset.
43. **Each role keeps its probes in a directory of its own, and a start sweeps only what an
    ended process left there.** This change's choice. Every role on a host shares the state
    directory, so one process sweeping all of `<state dir>/probes` at its start would delete a
    probe another process is making. A role's probe directory is `<state dir>/probes/<role>`, and
    each probe's directories carry the id of the process making it, so a starting `igor serve`
    removes only those whose process is no longer running, and a second process of the role
    deletes no live probe. Only `igor serve` probes, since #171 states that `igor run` makes none
    (decision 18). *Rejected:* one shared `probes/` swept by every start, which deletes another
    process's running probe; and sweeping a role's whole directory at start, which deletes a
    running probe whenever two processes of the role share a host.

**Still open:**

- **A guaranteed per-role share.** Not specified; added only if a role's reserve proves too weak a
  priority.
- **The `rejected` shape** (#57) is contributor-reported, not captured (task 1.5).
- **A never-used seat is unmeasured.** Task 1.1 measured a seat below every threshold, at 43% and
  11%, not one with no current instance; task 1.1c measures one when a fresh seat is available.
- **Per-model weekly windows** have no source for a token seat (#75 task 5.1).
- **Which readings combine into a capacity on a shared seat** is not decided; it waits until a
  long run of readings has been collected (`design.md`, *Newest-wins, against `src/capacity.ts`*).
- **The probe with #174's shared arguments is unmeasured.** Task 6.0 measured the probe without
  `--plugin-dir`, `--setting-sources` or `--strict-mcp-config`; once #174 is built, task 6.0a
  measures whether it still gets an event, and at what cost.
- **Other unmeasured facts the gate rests on:** that fullness does not fall within an instance
  (task 1.3, decision 15); what `isUsingOverage` means (task 1.4), so the overage rule is not
  built until 1.4 confirms it; whether an ordinary worker run carries an event after its first
  call (task 1.1b, decision 4); and whether triage's single `--output-format json` envelope
  carries the reading as `rate_limit_info` (task 11.1), which decides whether a triage call
  yields a reading.
- **Whether `/usage` reports a window to a stored login** is unmeasured. Until #171's code
  lands, a reserved seat that names no token is read only by the live read (decision 39), and
  stays idle if that read gets no window either. Task 5.4's message says `/usage` reports no
  window to the seat's token, which is wrong for a seat that has no token.
- **Consistency-read findings not yet fixed.** Each is for this change's author to fix, unless it
  names another change or Adam:
  - A refusal the stream reports for one model's weekly window is recorded as a per-model row,
    which the gate does not read, so the refused seat is chosen again. Whether such a refusal
    should hold the seat, or fall back to the envelope, is a question for Adam, and which window
    a per-model refusal names is unmeasured (task 1.5).
  - That the probe runs as the Igor's own user, which holds every seat token, is a choice not
    among the decisions.
  - #82 (`stopped-scope-visible`) shows a seat as unread using only the seat's own reserve, not
    decision 1's larger of the seat's and the role's.
  - #216's `role-config` copies drop `reserve`, which task 16.3 and #216's task 5.2 must carry
    (reported to #216).
  - #171 forbids the live `/usage` read that decision 37 keeps until the change after #171
    (reported to #171).
  - A seat that names no token contradicts "the credential a seat holds is a `setup-token` one",
    in the in-force `seat-budget`'s *Usage is read from the seat, not supplied by a person*.
  - The post-reset probe's fixed delay contradicts "no behaviour SHALL require a reading at a
    particular time".
  - The per-model weekly window is unmeasured but specified.
  - The crossing instant and the reserve's monotonic rule are each stated twice.
  - A post-reset probe's scenario omits that it is due only until the window is measured, then
    about weekly.
  - The instant a handoff names is not when the seat admits work, since a crossing probe comes
    first.
  - "Probe" also names #101's (`condition-backoff`) cooldown item, the one item a stopped scope
    is allowed to test whether its fault recurs; "seat probe" throughout would avoid that.
  - Some SHALLs lack scenarios, one rule sits in both `graceful-handoff` and `seat-budget`, and
    some rationale sits in requirement text.
  - The crossing probe's exception to *A seat that could not be used is not probed* is not
    scoped to the crossed window, so a session crossing probes a seat whose week reading is still
    past its line.
  - #174's startup check, one minimal call per start to confirm its pinned skills load, counts
    under `igor serve` as the first probe of any seat due one. It refuses to start the Igor when that
    probe's directory is refused,
    where this change records the probe as errored and retries. #174's decision 41 makes its check the exception
    to *Every directory above a seat probe is checked before it is spawned*; since #174 archives
    after this change, the exception belongs in #174's own `MODIFIED` block on that requirement
    (reported to #174).
  - #236 compacts the in-force *A seat shut in both windows returns on the later of the two*,
    which this change also modifies, and says no open pull request touches it; whichever
    archives later replaces the other's wording (reported to #236).
  - #140's `directed-interaction` spec declares a fraction of a cycle budget; under the line no cycle
    budget exists to take a fraction of.
  - The crossing formula has no hour for a reading whose reset never resolved.

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

It gives both windows, how full each is, when each resets, whether the provider is warning, and
whether extra usage is being spent: for the whole seat, owner's use included, taken with the
seat's own credential and nobody signed in. `src/execute.ts` keeps only the terminal `result`
event and discards this one.

The in-force `seat-budget` assumes a `setup-token` credential yields no window reading, so it
bounds a seat by recorded spend against observations taken elsewhere: a limit error, or
`igor observe` run on the owner's machine. That holds where the reading was looked for (`/usage`,
and `GET /api/oauth/usage`, which refuses the credential for want of `user:profile`), and not for
the stream.

So a dedicated fleet seat need not wait for its first refusal to get a reading, and a shared seat
need not depend on a job on its lender's laptop. Adam has decided that no such job should exist:
services and queries run on the server that runs the Igors, which holds the tokens and the seat
config.

## What Changes

- **A worker run's `rate_limit_event` is recorded as an observation of the seat that paid for the
  run**: both windows' fullness and reset, the event's status (including `allowed_warning` and the
  threshold it crossed), and whether extra usage is being spent. It is timed when the event
  arrived, one run contributes one reading, and a refusal is recorded once (decisions 20, 24, 25).
- **A reading bounds its window from below until that window resets**, and says nothing about
  the instance after. A seat spending extra usage is not spent from in the window the event names
  (decision 21).
- **Probes** (decisions 7 and 8): a minimal call on the cheapest model, read for its
  `rate_limit_event` and recorded as a `stream` reading. A probe is not free, and its cost is
  recorded. It never runs on a person's machine. A seat below every threshold emits the event
  (task 1.1), so a probe gives an idle reserved seat the reading the gate needs before it draws on it; a never-used one is still to be measured
  (task 1.1c).
- **The reserve becomes the line of decision 1**, replacing the dollar bound. The reserve is held
  back at the start of a window and released evenly toward the reset: at 0.3 the line is 70% just
  after a reset, 85% halfway, 97% with a tenth left and 100% at the reset. At 0 the line is 100%
  throughout. At 1 the whole window is held back just after a reset and released evenly across
  its length, which is even pacing. The line needs no figure for the owner's use and no dollar
  capacity, and Igor takes more when the owner uses less. An item already running finishes, so
  each Igor process can pass the line by about two runs' spend (decision 4).
- **No figure in dollars gates anything**: a role's `budget_share` is measured against the
  reading on every path (decision 9). Roles and dedicated seats may set a reserve (decisions 5
  and 6), and holding back at the line is a reason of its own (decision 10).
- **`scheduled-observation` and `igor observe` are withdrawn**, and that change's directory is
  deleted. Nothing is installed on a lender's machine, and nothing reads a seat through a person's
  login. Its two requirements that still apply, on irregular arrival and on measuring a window's
  length from successive resets, move here, adapted to stream readings. `igor observe`'s shipped
  code is removed in gate two. Existing `usage` rows are still read; nothing writes them any more.
  The reasons, and what is lost, are in `design.md`.

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
  (`signed-publishing`) and #140 (branch `directed-asks`, change `directed-interaction`) modify the same two, and `lore-from-corrections`
  modifies *Merge semantics differ by field kind*; their `MODIFIED` blocks, which replace this
  change's when they archive later, must carry `reserve` (task 16.3).
- `surface-adapter`: `observe` leaves the list of commands that take no role, in *On GitHub,
  every call an Igor makes acts as its App*, since this change removes the command; the
  requirement, shortened for #232, names only `budget` as an example of such a command. #171
  modifies the same requirement after this change, adding `seat` to that list.
- `stuck-conditions`: a seat probe's 401 counts as an occurrence of the seat's credential
  condition, and a probe that succeeds clears it at once (decision 13).
- `graceful-handoff`: where the line shut a window whose reading is below 100%, a budget handoff
  states the line's crossing, not the reset.
- `seat-budget`: a worker run's own output stream is a source of observations of the seat that
  paid for it, read with that seat's credential and recorded with a third source, `stream`. It
  also gains the line, a role's reserve, and the probes. The in-force passages this makes false
  are corrected by `MODIFIED`, `RENAMED` and `REMOVED`-plus-`ADDED` deltas, listed in
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
- `capacity.ndjson` gains up to two rows per worker run, one per window of its reading, so it
  grows at the execution log's rate rather than a refusal's. It is still read whole, a known limit
  to revisit before a fleet runs many seats.
- `igor budget` shows each window's reading against its line, per role where a role reserves more,
  says when a seat is holding back, and can name which source a figure came from (a run's stream,
  a probe or a refusal) and show the provider's warning and overage state.
- Every caveat in §6.3.3 carries over: the `rejected` shape is contributor-reported, not captured
  (#57, #15).
