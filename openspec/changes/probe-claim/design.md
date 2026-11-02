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
after a row already in the later day's file. This change's one requirement, *Exactly one Igor takes a due probe, decided by the log after it
writes*, defines storage order as this read order, the order every Igor sees, rather than the
store's acceptance order, which no Igor can read. A second hazard sits beside it: `readLog` caches a
past day's partition for the life of the process, so a row accepted late into yesterday's file is
never read by a process that cached the file first.

## Decisions

1. **Adopt *Exactly one Igor takes a due probe, decided by the log after it writes*** as a new
   `stuck-conditions` requirement. It adds to the in-force probe rules and modifies none of them.
2. **The oldest unended probe row decides, in the order a fresh read of the log returns rows, read again after a settle interval.** An Igor
   that finds the probe due appends its probe row, waits until any append that could land ahead
   of it has landed, reads the log again, and takes the item only when its own row is the oldest
   probe row that has not ended. This is #226's suggested fix with two corrections: a void names
   its row rather than its item (decision 3), and the read waits a settle interval rather than
   come at once (this decision). It orders rows
   by storage order, the order a fresh read of the log returns them, and uses no conditional write, as `work-claiming` already requires of
   claims, and lets the earliest row decide, as #179 does among one role's processes. *Rejected:* a conditional append from the read that decided,
   because the store would refuse a pending probe append whenever any write to the state branch,
   by any role, landed first; a lock
   file per condition, because it is condition state stored apart from the log; a designated
   prober, because seat scopes span roles whose processes cannot see each other's heartbeats; the
   newest row deciding, because a stale re-read then gives two Igors the item. *Rejected*, below,
   gives each in full.
3. **A void row names its probe row, not its item.** Two processes of one role can pick the same
   item, and a void by item would end the winner's probe too. This corrects #226, which had a void
   end its item's probe.
4. **Every Igor whose row does not decide voids it, and so does one whose append failed or may
   have failed.** A row nobody is working would otherwise hold the scope until it lapses.
5. **An item that would probe several conditions probes them one at a time, in key order, and is
   taken only where its rows decide for all of them** (Adam, 2026-10-24, replacing bids for every
   key at once). Adam's words were "one condition at a time, the one whose key sorts first",
   which could also mean that an item probes only its first-sorting condition. The agent
   coordinating this work for Adam confirmed the same day the reading taken here: the Igor
   appends a probe row for each key in turn, each only once its row for the previous key
   decides. Where a row does not decide, the Igor voids every row it appended for the item,
   those that had decided included, as decision 4 voids a row that does not decide. With bids
   for every key at once, two Igors could each win one key, void both, bid again at their next
   item, and collide the same way without end; bidding in one shared order leaves only the
   holder of the first key bidding for the second.
6. **A lapse is judged alike by every Igor in the scope, from the log.** Otherwise Igors disagree on
   the oldest unended row. This change decides only that property; it does not choose the lapse
   rule. The code on `main` lapses a row older than `SWEEP_AFTER_MS`, the worker's run ceiling
   plus an hour, counted from the timestamp in the row, which every Igor reads alike, and this
   change leaves that rule as it is. #179 removes the run ceiling, and Adam decided on 2026-10-24
   that #179's task 4.9 replaces the rule with a keepalive: the Igor working a probe item
   appends a row naming its probe row every poll interval of its own role, and the probe lapses
   once 90 minutes, three times #179's 30-minute maximum poll interval, pass with no such row.
   A process of any role can judge that lapse from the log alone. A rank's heartbeat, the rule
   #179 first had, could not be judged that way, since a process sees only its own role's
   heartbeat files.
7. **A TLA+ model, `model/ProbeClaim.tla`, proves the requirement**, with one negative
   configuration per rule, run by `.github/workflows/tla-probe-claim.yml`.
8. **A lapse that compares a log timestamp with a reader's clock allows 5 minutes of clock
   skew** (2026-10-24, at Adam's request to bound the skew; the figure is this change's choice).
   Every lapse rule's bound must cover it, so no Igor reads a live Igor's row as lapsed while
   the hosts' clocks agree within 5 minutes, as NTP keeps them. Hosts further apart are outside
   what the requirement covers; the model holds no clocks. Igors whose clocks differ can still
   disagree on a row near its bound. That delays a probe but takes no item twice, since an Igor
   that still counts the row as holding takes no item.
9. **The append deadline and the probe settle interval are fixed in code** (Adam, 2026-10-24),
   an exception to `role-config`'s rule that every interval is configurable. An Igor's probe settle interval has to outlast every other Igor's append deadline, not only its own; were either configurable, one Igor's settle interval could end while another's append is still within its deadline. The deadline is set from this change's task 4.1, a
   measurement of an append. The settle interval is the longer of twice the deadline and the
   deadline plus 5 minutes (Adam, 2026-10-24, amending "twice the deadline"): twice is a margin
   chosen because a probe is rare, so the wait costs little. The 5 minutes cover the clock skew
   the requirement assumes: at midnight a slow host can begin a row up to 5 minutes after another Igor's row landed in the new day's partition, yet stamp it before midnight by its own clock, so the row is filed in the earlier day's partition, ahead of that row in storage order; such a row lands within the deadline, so it has landed once the deadline plus 5 minutes have passed.
10. **Of the appends to the log, this change gives a deadline only to a probe row's** (Adam,
    2026-10-24). A void row's append has none, and nor does any other append this change
    leaves as it is; #179 gives its own keepalive append a deadline of its own. Once #179
    archives, its rule that a conflicted state write is retried until it succeeds applies to
    the appends without a deadline, and it is met once #179's code, which builds that retry, is
    built. Until then, a void row whose append fails is not retried, and its probe row holds the
    scope until it lapses.
11. **This change stays second in #204's archive order** (Adam, 2026-10-24). Issue #204 sets
    the order in which open changes archive. First is #101, already archived, so this change is
    the first still open, and so this fix to a rule in force waits behind no change it does not
    depend on.
12. **The midnight gap is accepted** (2026-11-01, settled by the agents coordinating this work
    under the rule Adam set for which questions they may settle without him; it stands until he
    says otherwise). The gap: at midnight, a probe-row write that the store accepts after its
    Igor gave up on it can land ahead of a row already read as deciding, and so give a second
    probe (*The settle interval, and its one gap*, below). It needs that late write, at
    midnight, while two Igors race for one probe. Its cost is one extra probe, a worker run
    against a fault that is probably still there, and it shows in the log as two probe rows
    that each led to a run. The conditional append under *Rejected*, below, would close the
    gap; revisit it if a double probe is ever seen. How the late row escapes the void its Igor
    appends is not spelled out, so the gap may be narrower than described (*Open Questions*);
    the acceptance holds either way.

## How decision 2 works: the oldest row in storage order decides, read again after a settle interval

An Igor that finds the probe due appends its probe row, waits a settle interval, reads the log
again, and takes the item only when its own row is the oldest probe row for the condition that
has not ended. Rows that do not decide are voided by the Igors that wrote them. A void names its
row by an identifier, not by item. This is #226's suggested fix, plus two corrections the model
found necessary (below).

This decision has three parts. Two are already in force for claims, in `work-claiming`'s
*Assignment expresses a claim; ordering resolves it*: it orders by the store's order of writes,
never a timestamp, and it uses no conditional write. The third, that the earliest row decides
after a settle interval, is not in force for claims, where the later write wins; it is the rule
#179 brings in for claims among processes of one role, so a reader who knows #179's claims
already knows how probes are decided.

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

**The settle interval, and its one gap.** Only a probe row landing late can change which row
decides, so the interval only has to outlast a probe row's append, and only that append gets a
deadline (decision 10). The deadline covers the
append's retries, once #179's retry of a conflicted write is built, and the probe settle interval
is the longer of twice the deadline and the deadline plus 5 minutes (decision 9). An append
past its deadline is treated as failed: its Igor takes no item and voids the row. The read that
decides reads every partition from yesterday on fresh (task 2.3), so a late row in yesterday's
file is read. A row lands in the partition of the day its writer's clock gives it, within its
deadline and so within minutes, so no partition from before yesterday can take a new row; the
cache, which saves a request per day of history (`docs/architecture.md`), still serves those. The
gap is a write the store accepts after its client gave up on it. Only at midnight can such a write
land ahead of a row already read as deciding, and it then gives a second probe. Clock skew gives
no second gap: a slow host can begin a row up to 5 minutes after another Igor's row landed in the new day's partition, yet stamp it before midnight by its own clock, so the row is filed in the earlier day's partition, ahead of that row in storage order; such a row lands within the deadline, so it has landed once the deadline plus 5 minutes have passed. Closing the gap means
taking the log's order from the state branch's commit history rather than its files, which is a
larger change than the race it would close. Decision 12 accepts the gap.

**One item, several conditions.** An item can probe a role's condition and a seat's at once, and
`probe` in `src/wiring.ts` appends one probe row per key at once. Bidding for every key at once
lets two Igors each win one key, void both, and repeat without end. So the Igor bids for the keys
one at a time, in key order, bidding for the next only once its row for the previous decides, and
takes the item only where its row decides for every key (decision 5). Every Igor bids in
that one order, so of the Igors whose items probe both keys, only the one holding the first bids
for the second. An Igor whose item probes only the second key can still win the second key from
that holder, and then takes its own item. Where items probe different but overlapping sets of
keys, the one order works as locks taken in one fixed order do: some Igor wins every key it bids
for. That is argued, not checked.

### Rejected

- **A conditional append, from the read that decided.** The append would name the state branch's
  commit the Igor read the probe as due from, and the store would refuse it if the branch had
  moved since. It decides in one step, with no settle interval and no midnight gap. Rejected
  because every write to the state branch moves that commit, run rows and discovery marks of
  every role included. On a busy fleet a probe append would be refused for reasons unrelated to
  it, and each retry would mean making the deciding read again. `appendRecord`'s own
  compare-and-set, its PUT carrying the partition file's sha, is narrower: it conflicts only
  with a write to that day's file, and is not a decision about the probe. It is the
  alternative to revisit if the midnight gap turns out to matter.
- **A lock file per condition**, created only if absent. It is condition state stored apart from
  the log, which the in-force *A condition's scope is its cure's scope* forbids ("No condition
  state is stored apart from the log"), and it needs the same conditional create.
- **A designated prober**, such as the lowest rank of the lowest-named role. Seat and Igor scopes
  span roles, and under #179 a process watches only its own role's heartbeats, so no process can
  tell whether another role's designee is alive (the conflict #179's `design.md` records with #101, under its decision 22).
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
crashed or whose end was lost: under `SWEEP_AFTER_MS` because the lapse is longer than any
run, and under #179's keepalive because a live Igor's keepalives keep its row from lapsing. Each
bound leaves more than the assumed 5 minutes of clock skew between hosts
(decision 8) beyond what a live Igor needs: `SWEEP_AFTER_MS` an hour beyond the run ceiling, and
the keepalive's 90 minutes, three times #179's 30-minute maximum poll interval, 60 minutes
beyond the longest gap between two keepalives. Whether the keepalive bound also keeps that
margin before the first keepalive is an open question (*Open Questions*). The model holds no
clocks. A live run outlasting
`SWEEP_AFTER_MS`, which no run does while the run ceiling stands, is out of scope here, as it is
in #101. A clean run of an item that was already running when
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
  scope*), and #171's copy of it, keep their meaning under this change: no other Igor takes a
  probe item until the probe's outcome is in. The row they call "a row saying it is taking the
  probe" is now a bid that may lose. Rewording it belongs in #171's copy, since editing
  it here would collide with that copy, as described next. This change defines that outcome, which includes a void row and
  a lapse, and leaves the scenario as it is. Editing it would mean modifying that requirement,
  which #171 also replaces whole, so whichever archived second would have to carry the other's
  text.
- **#171 (`seat-files`)** modifies *A condition clears by not recurring, and a probe is what
  observes that*, *A condition's scope is its cure's scope* and *A condition that recurs stops the
  affected scope from taking new work*. This change modifies none of them; it adds one
  requirement, so the two do not collide in `openspec archive`.
- **#143's seat probe** is a different thing that shares the name: a minimal model call that
  spends no item. It writes a check row, not a probe row, and this change does not touch it.

## Open Questions

Each is a fact nobody has measured, with a task that measures it:

- **Whether GitHub's contents API returns every write another client had landed.** The probe
  settle interval assumes it; task 4.2 measures it, and reports to Adam before task 2.1 ships
  where it does not hold.
- **Whether each lapse bound keeps its 5 minutes of margin.** Both bounds count from the probe
  row's time. Before the first run row or keepalive, an Igor waits one probe settle interval
  per key, then `work-claiming`'s claim settle interval, which each role configures, and, under
  #179, up to one poll interval before its first keepalive. With two keys and #179's
  30-minute maximum poll interval, #179's 90-minute bound keeps the margin only while two probe
  settle intervals plus the claim settle interval stay under 55 minutes. A claim settle
  interval of 30 minutes, for example, needs each probe settle interval under 12.5 minutes,
  and so an append deadline under about 6 minutes, since the interval is at least twice the
  deadline. Task 4.3 checks it once task 4.1 sets the deadline.
- **How the midnight gap gives a second probe.** An Igor that gives up on its probe-row
  append voids the row (decision 4), and a void ends the row it names once both have landed.
  *The settle interval, and its one gap* does not say how a late row still gives a second
  probe: whether through a deciding read between the row landing and its void, or a void whose
  append fails, which decision 10 leaves unretried until #179's retry is built. Decision 12
  accepts the gap whatever its exact size.
- **Whether bidding for several keys in one order always lets some Igor win every key it bids
  for.** It is argued under *One item, several conditions*, not checked: the model has one
  condition.

## Still to settle with other changes

- #171 keeps the in-force scenario *A probe is taken once*. Its "a row saying it is taking the
  probe" is, in this change's terms, a bid that may lose, so the scenario should say so. #171's
  copy is where to reword it, and the request to #171 has yet to be made.
- The in-force *A condition clears by not recurring, and a probe is what observes that* says
  "After a cooldown the affected scope SHALL take exactly one item", with no exception, and
  #171's copy keeps those words. This change's requirement leaves out the midnight gap that
  decision 12 accepts, so the two disagree in that one case. #171's copy is where to name the
  gap, and that request has yet to be made too.
- #179's `work-discovery` retries, until it lands, every conflicted write to a state file that
  several processes write, and names no exception for a probe row's append, which this change
  gives up on at its deadline; #179 should name it.
- Between this change's archive and #179's, the in-force `role-config` still says every
  interval is configurable, contradicting this change's fixed timings. #179's copy of that
  requirement already names them and replaces it whole when #179 archives; the contradiction
  between the two archives is accepted, since nothing is built from the specs in between.
