## Context

`condition-backoff` (#101, archived as `openspec/changes/archive/2026-10-24-condition-backoff/`)
lets one item through a stopped scope after its cooldown: the probe. The Igor taking it first
appends a probe row naming the item, and `probeRunning` in `src/conditions.ts` reads the scope as
`probing` while the newest probe row since the last occurrence has not ended. A probe row ends
with a run row for its item, a `void` row, or after `SWEEP_AFTER_MS`.

Two Igors can both take a due probe item, and the fault is in how the row is used, not in the row. `gate()` in `src/wiring.ts` reads the log and
reports the probe due; the caller in `src/serve.ts` or `src/cli.ts` then appends the probe row and
takes the item without reading the log again. A bug-hunter run on 2026-10-24 proved with a failing
test that two Igors can both take an item, and its reviewer could not refute it (#226, candidate 4).

Three more defects in the same code each give a second probe or hold a scope for nothing:

- **The newest row decides.** `probeRunning` walks back from the newest row and answers from the
  first probe row it meets, so a row landing after an Igor's own row changes the answer that Igor
  reads.
- **A `void` row ends whichever probe row is newest**, not the one it was written for.
- **A failed append still takes the item.** `probe` in `src/wiring.ts` catches the failure with
  `warnOnly` and the caller goes on to claim.

`appendRecord` in `src/state.ts` reads the day's partition and writes it back. Every write to the
state branch moves its one ref, and two concurrent writes conflict on that ref even when they
touch different files, as #179's proposal measured (in its section on measurements, on the branch
`concurrent-instances-restated`). So the store accepts rows one at a
time, in a single order. No rule in force retries a conflict, so a racing Igor's append can fail,
and the Igor then takes the item anyway.

Within a day's partition, a file's line order is the order the store accepted its rows. Across
partitions, `readLog` puts the earlier day first, which can disagree with acceptance order at
midnight: a row stamped just before midnight goes to the earlier day's file and can be accepted
after a row already in the later day's file. *The read that decides a probe is fresh, in storage order* defines storage order as this read
order, which every Igor sees, not the store's acceptance order, which no Igor can read. `readLog`
also caches a past day's partition for the life of the process, so a row accepted late into
yesterday's file is never read by a process that cached the file first.

## Decisions

The requirements cover Igors in `role-config`'s sense, each a role: within one Igor a single
process appends probe rows, one per key at a time, because a role runs as one serving process
whose cycle appends them. Two processes
of one role bidding at once, such as an `igor run` beside the role's `igor serve`, are outside
them.

1. **Adopt eight new `stuck-conditions` requirements**: *Exactly one Igor takes a due probe,
   decided by the log after it writes*, and seven that define its terms and its other rules. They
   add to the in-force probe rules and modify none of them.
2. **The oldest unended probe row decides, in the order a fresh read of the log returns rows, read
   again after a settle interval.** An Igor that finds the probe due appends its probe row, waits
   until any append that could land ahead of it has landed, reads the log again, and takes the
   item only when its own row is the oldest probe row for the condition that has not ended. This
   is #226's suggested fix with two corrections: a void names its row rather than its item
   (decision 3), and the re-read waits a settle interval rather than come at once, because at
   midnight a row can land ahead of one already read (`NoSettle.cfg`). Each `.cfg` named here is a
   configuration of the TLA+ model of decision 7 (*The model*). See *How decision 2 works* and
   *Rejected*.
3. **A void row names its probe row by an identifier, not its item.** Two Igors can pick the same
   item, as two roles set up to do the same work do. A void by item would end the winner's probe
   too (`NoVoidById.cfg`).
4. **Every Igor whose row does not decide voids it, and so does one whose append failed or may
   have failed.** A row nobody is working would otherwise hold the scope until it lapses.
5. **An item that would probe several conditions probes them one at a time, in key order, and is
   taken only where its rows decide for all of them**. The Igor appends a probe row for each key in turn,
   each only once its row for the previous key decides. Where a row does not decide, the Igor
   voids every row it appended for the item, those that had decided included. *Rejected:* bidding
   for every key at once, which lets two Igors each win one key, void both, and collide the same
   way at their next item without end.
6. **A lapse is judged alike by every Igor in the scope, from the log**, or Igors disagree on the
   oldest unended row. This change decides only that property, not the lapse rule. The code on
   `main` lapses a row older than `SWEEP_AFTER_MS`, the worker's run ceiling plus an hour, counted
   from the timestamp in the row, which every Igor reads alike; this change leaves that rule as it
   is, and needs no keepalive row while the run ceiling stands, since a live run ends before the
   bound. A change that removes the run ceiling must give the probe a lapse rule that every Igor
   judges alike from the log, such as a keepalive row the Igor working the probe appends at a
   fixed period, with the probe lapsing once a stated time passes with none. *Rejected:* a lapse
   judged from a signal one role keeps for its own processes. A condition scoped to a seat is shared
   by every role that draws on it, and a process of one role cannot read such a signal
   for another role.
7. **A TLA+ model, `model/ProbeClaim.tla`, proves the requirement**, with one negative
   configuration per rule, run by `.github/workflows/tla-probe-claim.yml`.
8. **A lapse that compares a log timestamp with a reader's clock allows 5 minutes of clock
   skew**.
   Every lapse bound must cover it, so no Igor reads a live Igor's row as lapsed while the hosts'
   clocks agree within 5 minutes, as NTP keeps them. Hosts further apart are outside what the
   requirements cover. The model holds no clocks, so it checks neither case. Igors whose clocks differ can still disagree on
   a row near its bound. That delays a probe but takes no item twice, since an Igor that still
   counts the row as holding takes no item.
9. **The append deadline and the probe settle interval are fixed in code**, an exception to `role-config`'s rule that every interval is configurable. An Igor's probe
   settle interval has to outlast every other Igor's append deadline, not only its own; were
   either configurable, one Igor's settle interval could end while another's append is still
   within its deadline. Task 4.1 sets the deadline from a measurement of an append. The settle
   interval is the longer of twice the deadline and the deadline plus 5 minutes. The factor of two is a chosen margin against error in the measured deadline, not a fitted value. The 5
   minutes cover clock skew: at midnight a slow host can begin a row up to 5 minutes after another
   Igor's row landed in the new day's partition, yet stamp it before midnight by its own clock, so
   the row is filed in the earlier day's partition, ahead of that row in storage order. Such a row
   begins at most 5 minutes after that row landed and lands at most one deadline after it begins,
   so it has landed once the deadline plus 5 minutes have passed since that row landed. The
   probe settle interval derives from the append deadline, not from any poll interval, and is not
   `work-claiming`'s claim settle interval.
10. **Of the appends to the log, this change gives a deadline only to a probe row's.** A void row's append has none, nor does any other append this change leaves as it
    is. No rule in force retries a conflicted append, so a void row whose append fails is not
    retried, and its probe row holds the scope until it lapses. A change that retries conflicted
    state writes must let a probe row's append stop at its deadline, retries included.
11. **This change archives second in #204's order**, just after #101, already archived, whose
    rule in force it fixes. #204 sets the order in which open changes archive, so this fix waits
    behind no change it does not depend on.
12. **The midnight gap is accepted.** The gap is described under *The settle interval, and its one gap*. It needs a
    late write, at midnight, while two Igors race for one probe. Its cost is one extra probe, a
    worker run against a fault that is probably still there, and it shows in the log as two probe
    rows that each led to a run. The conditional append under *Rejected* would close it; revisit
    that if a double probe is ever seen. The acceptance holds however narrow the gap turns out to
    be (*Open Questions*).

## How decision 2 works: the oldest row in storage order decides, read again after a settle interval

Two of its parts are already in force for claims, in `work-claiming`'s *Assignment expresses a
claim; ordering resolves it*: it orders by storage order, never a timestamp, and it
uses no conditional write. The third, that the earliest row decides after a settle interval, is not
in force for claims, where the later write wins.

What each rule buys, and the model's negative that shows it is needed:

| Rule | Without it | Negative configuration |
| --- | --- | --- |
| Re-read after the row lands | Two Igors that read before either row lands both take an item | `NoReread.cfg` |
| Wait the settle interval first | An append still in flight lands ahead of a row already read as deciding, and its Igor decides too | `NoSettle.cfg` |
| The oldest unended row decides | A stale re-read, which misses rows that landed after the Igor's own, shows that Igor its own row as the newest, so it takes the item; another Igor reading the full log sees its own, later row as the newest and takes it too | `NoOldestDecides.cfg` |
| A void names its row | Two Igors pick the same item; the loser's void ends the winner's probe, and another Igor probes beside a running one | `NoVoidById.cfg` |
| The loser voids its row | The winner's probe ends with a run that observed nothing, and the loser's row then holds the scope with nobody working it | `NoVoidLoser.cfg` |
| A failed append takes no item | The Igor whose row was lost takes an item beside the winner | `NoFailedTakesNone.cfg` |
| A failed append voids its row | The append landed after all, and its row holds the scope with nobody working it | `NoVoidFailed.cfg` |

**The settle interval, and its one gap.** Only a probe row landing late can change which row
decides, so the interval only has to outlast a probe row's append, and only that append gets a
deadline (decision 10). The deadline covers the whole append, including any retry the code makes; none is made today. An append past its deadline is treated as failed: its Igor takes no item and voids
the row. The read that decides reads every partition from yesterday on fresh (task 2.3), so a late
row in yesterday's file is read. A row lands in the partition of the day its writer's clock gives
it, within its deadline and so within minutes, so no partition from before yesterday can take a
new row; the cache, which saves a request per day of history (`docs/architecture.md`), still
serves those. The gap is a write the store accepts after its client gave up on it: at midnight
such a write can land ahead of a row already read as deciding and give a second probe, even though
its Igor voids the row. How it escapes that void is open (*How the midnight gap gives a second
probe*, under *Open Questions*). Clock skew
adds no second gap (decision 9).

**One item, several conditions.** An item can probe a role's condition and a seat's at once, and
`probe` in `src/wiring.ts` appends one probe row per key at once; decision 5 replaces that with
bids in key order. Because every Igor bids in that one order, of the Igors whose items probe both
keys only the one whose row decides the first key bids for the second. An Igor whose item probes
only the second key can still win it from that Igor, and then takes its own item. Where items probe different
but overlapping sets of keys, the one order works as locks taken in one fixed order do: some Igor
wins every key it bids for. That is argued, not checked.

### Rejected

- **A conditional append from the read that decided**, refused by the store if the state
  branch's commit had moved since. It decides in one step with no settle interval and no midnight
  gap, but every write to the state branch by any role moves that commit, so on a busy fleet a
  probe append would be refused for unrelated reasons and each retry would need a new deciding
  read. `appendRecord`'s own compare-and-set, its PUT carrying the partition file's sha, covers one
  partition file, and a retry of it needs only that file read again; it decides nothing about the
  probe. Revisit if a double
  probe is seen (decision 12).
- **Taking the log's order from the state branch's commit history** rather than its files. It
  closes the midnight gap, but changes how every reader of the log orders rows, to close a gap
  decision 12 accepts.
- **A lock file per condition**, created only if absent. It is condition state stored apart from
  the log, which the in-force *A condition's scope is its cure's scope* forbids ("No condition
  state is stored apart from the log"), and it needs the same conditional create.
- **A designated prober**, such as the lowest-named role. Seat and Igor scopes span roles, and
  nothing in force tells one role's process whether another role's process is alive, so no process
  can tell whether the designee is. A dead designee holds every probe until somebody notices.
- **The newest row deciding, with a re-read.** It is the smaller edit to `probeRunning`, and wrong
  (`NoOldestDecides.cfg`).
- **Accepting the race and weakening the requirement** to "about one item". Each double probe
  spends a worker against a fault that is probably still there.

## The model

`model/ProbeClaim.tla` models three Igors in one seat-scoped condition: two that cover the same
work, as two roles set up to do it do, and one that covers other work. Each body of work has one
item, so the first two always pick the same item, the case a void by item gets wrong. Appends are in flight between issue and landing, and may
be lost, land while their Igor is told they failed, or land late, ahead of rows that landed while
they were in flight. A re-read may be stale, returning a prefix of the log. An Igor may crash,
and a claim may be lost to somebody else. A probe may meet the condition again, clear it, or
observe nothing. Time is abstract: the cooldown is a step, and the settle interval is the
condition that no append which could land ahead of the Igor's row is in flight.

Its properties, each naming the requirement it proves:

- **`ExactlyOneProbe`**: at most one Igor is ever taking a probe item.
- **`HeldOnlyByItsProbe`**: a probe row holds the scope only while its own Igor is working it, its
  end is in flight, or its Igor crashed or its end was lost, so it is left to lapse.
- **`DueProbed`** (liveness): once the cooldown has passed, some Igor runs the probe item, unless a
  run row already on its way closes the condition, or meets it again and starts a new cooldown.
  It is stated from the cooldown, not from the probe reading as due: a row nobody works makes the
  probe read as not due, so a property stated from "due" would be met vacuously while the scope is
  held for good.

Each configuration directly in `model/` checks the change as specified and allows a few kinds of
fault, at most one of each. All kinds at once make too large a model to check within CI's hour.
Safety configurations use all three Igors; liveness ones use two, except
`ProbeClaimLivenessLosses.cfg`, which uses three with one lost append. Each file in `model/negative/` turns one rule off and must fail.
`NoVoidLoserLiveness.cfg` must fail `DueProbed`, which a vacuously met property could not, so it
shows that `DueProbed` is not met vacuously.

**What the model does not cover.** A lapse is modelled as possible only for a row whose Igor
crashed or whose end was lost, because `SWEEP_AFTER_MS` is longer than any run. `SWEEP_AFTER_MS` is
the run ceiling plus an hour, well over decision 8's 5 minutes of skew. Whether it keeps those 5
minutes of margin once the waits before the run are counted is open (*Open Questions*). A live run outlasting
`SWEEP_AFTER_MS`, which no run does while the run ceiling stands, is out of scope, as it is in
#101. A clean run of an item already running when the scope stopped also ends the condition; the
model starts with nothing running, so it leaves that out. The model has one condition, so the rule
for an item probing several is argued, not checked. A stale read is modelled as a prefix of the
log, missing only rows that landed after some point: *The read that decides a probe is fresh, in
storage order* requires the deciding read to show every row landed before it, so a stale read
served after the settle interval can lack only later rows. An append that lands while its Igor is
told it failed is modelled (`Failed`, then `Land`); a write the store accepts only after its Igor has given up on
it is not, and that write is the midnight gap. A deciding read that fails is not modelled either:
its Igor takes no item and voids its row, the same steps a failed append takes, which the model
checks.

**How the model stays small.** Rows older than the last occurrence are never read again, so the
log is cut to start at it. With nothing in flight and every probe row ended, the log is cut to the
last occurrence and any run that cleared it. Neither cut changes what any step reads. Igors that
cover the same work are interchangeable, which the safety configurations use as a symmetry.

**CI after archive.** `openspec archive` moves `model/` under `openspec/changes/archive/`. The
workflow watches both paths and runs whichever exists, so the model is still checked when a later
change edits it.

## Coordination

- **#175 (`worker-user`) and #171 (`seat-files`)** modify requirements this change leaves alone.
  #175 modifies *A condition clears by not recurring, and a probe is what observes that* and *A
  condition's scope is its cure's scope*, and its copy of the first says the scope takes "one
  item, the next it would take", without "exactly". #171 modifies five: *A condition
  clears by not recurring, and a probe is what observes that*, *A condition's scope is its cure's
  scope*, *A condition that recurs stops the affected scope from taking new work*, *A seat's
  refused credential is a condition on that seat* and *Reporting tells a refused credential from an
  unreadable one, and clears nothing*. This change
  only adds requirements, so none of them collide in `openspec archive`.
- **The in-force scenario *A probe is taken once*** (under *A condition's scope is its cure's
  scope*), and #175's and #171's copies of it, keep their meaning under this change except in the midnight gap: no other Igor takes a
  probe item until the probe's outcome is in. This change defines that outcome, which includes a
  void row and a lapse, and leaves the scenario as it is. In the gap, a row landing ahead at
  midnight can decide after another Igor's row was first to land, which the scenario does not
  allow. Editing it would mean modifying that
  requirement, which #175 and #171 also replace whole, so whichever archived later would have to
  carry the others' text.
- **#143's seat probe** is a different thing that shares the name: a minimal model call that
  spends no item. It writes a spend row marked as a seat probe, and its credential check as a
  separate row, never a probe row, and this change does not touch it.

## Open Questions

Each is a fact nobody has measured or argued through. Of the five questions below, tasks 4.2 to 4.4 measure the first three;
the last two are argued, and task 4.6 files them as an issue for a later model to check:

- **Whether GitHub's contents API returns every write another client had landed.** The probe
  settle interval assumes it; task 4.2 measures it, and reports to Adam before task 2.1 ships
  where it does not hold.
- **Whether `SWEEP_AFTER_MS` keeps its 5 minutes of margin.** It counts from the probe row's
  time, and the run ceiling from the worker's start. A live probe row ends only with the run row,
  appended after the run is published. So the bound has to cover one probe settle interval per
  key, `work-claiming`'s claim settle interval, the tree's provisioning, the run up to its
  ceiling, publication and the run row's append. The claim settle interval is configured per role
  with no upper bound, so a configuration alone can break the margin. With two keys and
  provisioning and publication taking a few minutes, the hour beyond the run ceiling keeps the
  margin only while two probe settle intervals plus the claim settle interval stay well under 55
  minutes. Task 4.3 measures the parts and states the largest claim settle interval the bound
  allows, once task 4.1 sets the deadline.
- **Whether hosts' clocks stay within 5 minutes of each other.** The lapse bound's margin and the
  settle interval's midnight term assume it, from NTP, and nothing has measured it on the hosts
  that run Igor. Task 4.4 measures it.
- **How the midnight gap gives a second probe.** An Igor that gives up on its probe-row append
  voids the row (decision 4), and a void ends the row it names once both have landed. It is not
  established whether a late row still gives a second probe through a deciding read between the
  row landing and its void, or through a void whose append fails, which decision 10 leaves
  unretried. So the gap may be narrower than described.
- **Whether bidding for several keys in one order always lets some Igor win every key it bids
  for.** It is argued under *One item, several conditions*, not checked: the model has one
  condition.

## Still to settle with other changes

- *A probe is taken once* calls the probe row "a row saying it is taking the probe"; in this
  change's terms that is a bid that may lose, and the scenario should say so. #171's copy is where
  to reword it, and the request to #171 has yet to be made.
- The in-force *A condition clears by not recurring, and a probe is what observes that* says
  "After a cooldown the affected scope SHALL take exactly one item", with no exception, as does
  #171's copy; #175's copy says "one item". This change's requirement does not promise exactly
  one item in the midnight gap that decision 12 accepts, so the two disagree in that one case.
  #175's and #171's copies are where to name the gap, and those requests have yet to be made
  too.
- A change that retries every conflicted state write must name a probe row's append as an
  exception, since this change gives up on it at its deadline (decision 10).
- The in-force `role-config` requirement *Timing values are configurable with stated defaults*
  says every interval is configurable. *A probe's append deadline and settle interval are fixed
  in code* names itself as the exception. A change that rewrites the `role-config` requirement
  should name the probe's two timings among its exceptions.
