## Context

`condition-backoff` (#101, archived as `openspec/changes/archive/2026-10-24-condition-backoff/`)
lets one item through a stopped scope after its cooldown: the probe. The Igor taking it first
appends a probe row naming the item, and `probeRunning` in `src/conditions.ts` reads the scope as
`probing` while the newest probe row since the last occurrence has not ended. A probe row ends
with a run row for its item, or with a `void` row, or after `SWEEP_AFTER_MS`.

The race is in how the row is used, not in the row. `gate()` in `src/wiring.ts` reads the log and
reports the probe due; the caller in `src/serve.ts` or `src/cli.ts` then appends the probe row and
takes the item, never reading the log again. Two Igors that both read before either row lands both
take an item. A bug-hunter run on 2026-10-24 proved it with a failing test, and its reviewer could
not refute it (#226, candidate 4).

Three more defects sit in the same code, and each is a separate route to a second probe or to a
scope held for nothing:

- **The newest row decides.** `probeRunning` walks back from the newest row and answers from the
  first probe row it meets. A row that lands after an Igor's own row changes the answer that
  Igor would read.
- **A `void` row ends whichever probe row is newest**, not the one it was written for.
- **A failed append still takes the item.** `probe` in `src/wiring.ts` catches the failure with
  `warnOnly` and the caller goes on to claim.

How appends behave decides what any fix can rely on. `appendRecord` in `src/state.ts` reads the
day's partition and writes it back. Every write to the state branch moves its one ref, and #179
measured that two concurrent writes conflict on that ref even when they touch different files
(#179's proposal, under its measurements). So the store accepts rows one at a time, in a single
order. Today a conflict is not retried, so the race most often shows as a failed append, and the Igor
whose append failed takes the item anyway. #179's *A conflicted state write discards nothing* would retry it.

Within a day's partition, a file's line order is the order the store accepted its rows. Across
partitions, `readLog` puts the earlier day first, and that can disagree with acceptance order at
midnight. A row stamped just before midnight goes to the earlier day's file, and can be accepted
after a row already in the later day's file. A second hazard sits beside it: `readLog` caches a
past day's partition for the life of the process, so a row accepted late into yesterday's file is
never read by a process that cached the file first.

## Decision: the first row accepted decides, read again after a settle interval

An Igor that finds the probe due appends its probe row, waits a settle interval, reads the log
again, and takes the item only when its own row is the oldest probe row for the condition that
has not ended. Rows that do not decide are voided by the Igors that wrote them. A void names its
row by an identifier, not by item. This is #226's suggested fix, plus two corrections the model
found necessary (below).

It is the rule #179 already adopts for claims among processes of one role: the claim message
earliest in storage order holds the item, counted after a settle interval, and storage order is
the surface's own sequence, never a timestamp (#179's *Assignment expresses a claim; ordering
resolves it*). A reader who knows how claims are decided then already knows how probes are.

What each part buys, and the model's negative that shows it is needed:

| Rule | Without it | Negative configuration |
| --- | --- | --- |
| Re-read after the row lands | Two Igors that read before either row lands both take an item | `NoReread.cfg` |
| Wait the settle interval first | An append still in flight lands ahead of a row already read as deciding, and its Igor decides too | `NoSettle.cfg` |
| The oldest unended row decides | A stale re-read, which misses rows that landed after the Igor's own, shows that Igor its own row as the newest, so it takes the item; another Igor reading the full log sees its own, later row as the newest and takes it too | `NoOldestDecides.cfg` |
| A void names its row | Two processes of one role pick the same item; the loser's void ends the winner's probe, and another Igor probes beside a running one | `NoVoidById.cfg` |
| The loser voids its row | The winner's probe ends with a run that observed nothing, and the loser's row then holds the scope with nobody working it | `NoVoidLoser.cfg` |
| A failed append takes no item | The Igor whose row was lost takes an item beside the winner | `NoFailedTakesNone.cfg` |
| A failed append voids its row | The append landed after all, and its row holds the scope with nobody working it | `NoVoidFailed.cfg` |

**The two corrections to #226's fix.** #226 had a void end "the probe of the item it names". Two
processes of one role can name the same item, so a void by item ends the winner's probe too:
`NoVoidById.cfg` shows the second probe that follows. And #226's fix read the log again
immediately. At midnight a row can land ahead of one already read, so the read waits a settle
interval: `NoSettle.cfg` shows the second probe without it.

**The settle interval, and its one gap.** The interval only has to outlast an append, so each
append gets a deadline that covers its retries, and the probe settle interval is longer. An append
past its deadline is treated as failed: its Igor takes no item and voids the row. The read that
decides bypasses the cache of past days (task 2.3), so a late row in yesterday's file is read. The
gap is a write the store accepts after its client gave up on it. Only at midnight can such a write
land ahead of a row already read as deciding, and it then gives a second probe. Closing it means
taking the log's order from the state branch's commit history rather than its files, which is a
larger change than the race it would close. Whether to accept the gap is the proposal's first open
question.

**One item, several conditions.** An item can probe a role's condition and a seat's at once, and
`probe` in `src/wiring.ts` appends one probe row per key. The Igor takes the item only where its
row decides for every key, and otherwise voids all of them. A row that decides for one key and is
voided leaves that key's probe due again, and the next item the scope takes probes it, so the
cost is a delay, not an extra item.

### Rejected

- **A conditional append, from the read that decided.** The append would name the state branch's
  commit the Igor read the probe as due from, and the store would refuse it if the branch had
  moved since. It decides in one step, with no settle interval and no midnight gap. Rejected for
  two reasons. Every write to the state branch moves that commit, run rows and discovery marks of
  every role included, so on a busy fleet a probe append is refused for reasons unrelated to it
  and retried, each retry re-reading whether the probe is still due. And correctness would rest
  on one store's compare-and-set. #179's *No dependence on conditional writes* rules that out for
  claims, and a later change may move the log to a store that has no compare-and-set. It is the alternative to revisit if the
  midnight gap turns out to matter.
- **A lock file per condition**, created only if absent. It is condition state stored apart from
  the log, which the in-force *A condition's scope is its cure's scope* forbids ("No condition
  state is stored apart from the log"), and it needs the same conditional create.
- **A designated prober**, such as the lowest rank of the lowest-named role. Seat and Igor scopes
  span roles, and under #179 a process watches only its own role's heartbeats, so no process can
  tell whether another role's designee is alive (the conflict #179's proposal records with #101).
  A dead designee holds every probe until somebody notices.
- **Letting the newest row decide, with a re-read.** It is the smaller edit to `probeRunning`, and
  wrong: an Igor whose re-read is stale sees its own row as newest, while another Igor reading the
  full log sees its own (`NoOldestDecides.cfg`).
- **Accepting the race and weakening the requirement** to "about one item". Adam decided on
  2026-10-24 to fix it.

## The model

`model/ProbeClaim.tla` models three Igors in one seat-scoped condition: two processes of one role
and one of another. Each role has one item, so the two processes of one role always pick the same
item, the case a void by item gets wrong. Appends are in flight between issue and landing,
and may be lost, land while their Igor is told they failed, or land late, ahead of rows that
landed while they were in flight. A re-read may be stale, returning a prefix of the log. A process
may crash, and a claim may be lost to somebody else. A probe may meet the condition again, clear
it, or observe nothing. Time is abstract: the cooldown is a step, and the settle interval is the
condition that no append which could land ahead of the Igor's row is in flight.

Its properties, each naming the requirement it proves:

- **`ExactlyOneProbe`**: at most one Igor is ever taking a probe item.
- **`HeldOnlyByItsProbe`**: a probe row holds the scope only while its own Igor is working it, its
  end is in flight, or its Igor crashed or its end was lost, so it is left to lapse.
- **`DueProbed`** (liveness): once the cooldown has passed, some Igor runs the probe item, unless a
  run row already on its way closes the condition, or meets it again and starts a new cooldown.
  It is stated from the cooldown rather than from the probe reading as due. A row nobody works
  makes the probe read as not due, so a property stated from "due" would be met, vacuously, while
  the scope is held for good.

Each configuration directly in `model/` checks the change as specified, and allows a few kinds
of fault, at most one of each kind it allows. All the kinds at once make too large a model to
check within CI's hour. The safety
configurations cover three Igors (two processes of one role and one of another); the liveness
ones cover two, except `ProbeClaimLivenessLosses.cfg`. Each file in `model/negative/` turns one
rule off and must fail. `NoVoidLoserLiveness.cfg` also shows that `DueProbed` is not met
vacuously.

**What the model does not cover.** A lapse is modelled as possible only for a row whose Igor
crashed or whose end was lost, because the lapse is longer than any run; a live run outlasting
it is out of scope here, as it is in #101. A clean run of an item that was already running when
the scope stopped also ends the condition; the model starts with nothing running, so it leaves
that out. The model has one condition, so the
rule for an item probing several is argued above, not checked. A stale read is modelled as a
prefix of the log: a snapshot taken after the settle interval, which the requirement's "every row
the store had accepted by then" makes the only kind. A write accepted after its client gave up is
not modelled, which is the gap above.

**How the model stays small.** Rows older than the last occurrence are never read again, so the
log is cut to start at it. With nothing in flight and every probe row ended, the log is cut to the
last occurrence and any run that cleared it. Neither cut changes what any step reads. Processes of
one role are interchangeable, which the safety configurations use as a symmetry.

**CI after archive.** `openspec archive` moves `model/` under `openspec/changes/archive/`. The
workflow watches both paths and runs whichever exists, so the model is still checked when a later
change edits it.

## Coordination

- **#179 (`concurrent-instances`)** numbers the processes serving one role as ranks, and judges a
  rank gone when its heartbeat file stops changing. This change needs every Igor in a scope to
  agree on which rows have lapsed, or they disagree on the oldest unended row, so the requirement
  says a lapse is judged alike by every Igor from the log. A condition scoped to a seat or to
  the whole Igor is shared by every role on it, and a process of one role cannot see another
  role's heartbeat files, so a rank's heartbeat cannot meet that rule. The code on `main` lapses
  a probe row once it is older than `SWEEP_AFTER_MS`, the worker's run ceiling plus an hour,
  measured from the timestamp written in the row; every Igor reads the same timestamp, so that
  meets the rule too, but #179 removes the run ceiling it rests on. So Adam decided on
  2026-10-24 that #179 replaces `SWEEP_AFTER_MS` with a keepalive in the log (its decision 22 and
  task 4.9): the Igor working a probe item appends a row naming its probe row every poll interval
  configured for its own role, and the probe lapses once 90 minutes pass with no such row, three times #179's
  30-minute maximum poll interval, the longest any role may set: an Igor that misses three of its keepalives in a row is treated as no longer working the item. The probe settle interval is unrelated to the keepalive: it is derived from the append deadline, not from any poll interval, and is not #179's claim settle interval.
- **The in-force scenario *A probe is taken once*** (under *A condition's scope is its cure's
  scope*), and #171's copy of it, stay true under this change: no other Igor takes a probe item
  until the probe's outcome is in. This change defines that outcome, which includes a void row and
  a lapse, and leaves the scenario as it is. Editing it would mean modifying that requirement,
  which #171 also replaces whole, so whichever archived second would have to carry the other's
  text.
- **#171 (`seat-files`)** modifies *A condition clears by not recurring, and a probe is what
  observes that*, *A condition's scope is its cure's scope* and *A condition that recurs stops the
  affected scope from taking new work*. This change modifies none of them; it adds one
  requirement, so the two do not collide in `openspec archive`.
- **#143's seat probe** is a different thing that shares the name: a minimal model call that
  spends no item. It writes a check row, not a probe row, and this change does not touch it.
