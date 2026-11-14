## Context

`igor serve <role>` runs one cycle at a time and one worker at a time. Nothing stops a second
process of the same role from starting, and two such processes both claim with the role's
`igor:<role>` label, so neither can tell the other's claim from its own. #179 answered that by
running a role as several coordinating processes told apart by rank; #241 replaced that design
with this one: one process per role, with its throughput coming from workers inside it.

A role's process is light. Its workers, which edit trees and run builds, carry the cost, and a
role's seats usually cap how many workers it can run before its host does. So one process can
carry all of a role's workers: it runs up to the role's `workers` workers at once and
coordinates them in memory. The only coordination between processes left to specify is keeping
a second one out, including across a crash and a restart.

## Goals / Non-Goals

**Goals:**
- Up to `workers` items worked at once by one process, each in its own slot and on its own seat.
- A second process of a role, started by mistake, never works beside the first.
- A process starting after a crash or restart adopts or gives back every claim its role left.

**Non-Goals:**
- One role across several hosts, or a role that keeps working while its host is down.
- Failover. This change has each serving process rewrite a record on the state branch every
  5 minutes, and stop itself once its last landed write is 20 minutes old; a starting process that sees the record
  change exits with status 78. That record is the lease the planned active/standby design
  needs: a standby would wait instead of exiting, and take over once the record stops changing.
  The waiting is not built here.
- Coordinating `igor run` with a served role.

## Decisions

### Adam's, in #241

1. **One process per role.** A role's throughput comes from N concurrent workers inside its
   process. A role scales by a bigger host, by cloud-agent workers (which spend seats), or by
   splitting it into two roles.
2. **Never two servers for one role at once; a restart is the recovery.** Active/standby with
   a lease is the direction for failover, and this change leaves room for it (*Non-Goals*).
3. **`igor run` is a dev tool.** It keeps its label claim, and the docs say not to point it at
   a served role. Nothing else coordinates the two. The next two sentences are this change's, not Adam's.
   `igor run` takes no serving lock or record; the lock #174 gives a run on its own files is a
   different lock. `igor run` runs one worker at a time whatever `workers`, because #174 gives
   each run one home directory and leaves open what several workers sharing it would need.
4. **Duplicate roles are allowed, not recommended for redundancy.** A duplicate does not rescue
   a dead host's items, since the dead role's label still holds them; it doubles triage; and
   where both claim one item, the loser's retraction is noise on the item.

### Carried over from #179

Each is restated here for one process per role; the number is #179's decision.

5. **A second process is detected as a start id other than one's own, whose counter rises**
   (from #179's decision 63, which was Adam's, and its decision 72). The serving record holds
   the writer's start id, picked at random at each start, and a counter it raises at each write.
   #179 kept a record per rank and watched for a rank's; here there is one record per role: the
   starting process watches it, and any write that lands on it means another live process. A
   record that disappears means nothing about liveness, so the watcher exits with status 1 and
   its supervisor starts it again to watch afresh.
6. **Host names and process ids go on the state branch, even where it is public** (from #179's
   decision 74, Adam's). The serving record carries them so the operator can find the other
   process a refusal names.
7. **A stop said while the holder cannot answer is answered by whoever next holds the item**
   (from #179's decision 75, Adam's). Here that is the process taking over, at adoption.
8. **Where a claim is left on an item with the Igor's open pull request, the pull request is
   brought up to date and the claim released** (from #179's decision 15, Adam's). Adoption covers only labels the Igor's own bot account
   added, so a person's label is never given back by it.
9. **A retried state write discards nothing** (from #179's decision 21, Adam's). Roles still
   share the state branch, and a write conflicts on the branch's ref whichever path it writes,
   so a refused write re-applies its own change to what the branch now holds.
10. **Trees are named by role and slot, and the process taking over removes its role's trees
    with no age check** (from #179's decision 18, Adam's). The name also carries the id of the
    process's lock directory (this document's decision 18), and the process taking over removes
    only trees named for its own lock directory. A process from another checkout can take over
    while the old process is paused, before the old one stands down; the old process's workers
    may still hold their trees, and the different id keeps them out of that removal. Every tree the process taking over does
    not remove at once, `igor run`'s included, is left to the age-based sweep at the in-force
    abandoned-tree threshold, which is the rule #175 relies on for `igor run`'s trees.
11. **A starting process that finds another live process exits with status 78** (from #179's
    decisions 24 and 32, Adam's). #82 (open) makes the shipped systemd unit leave a process that
    exits with status 78 stopped. Until it
    lands, the unit's `Restart=always` starts a refused process again every 30 seconds, and
    each start refuses again: safe, and noisy in the journal.
12. **A process stops its own workers on a timer the cycle cannot delay** (from #179's decision
    76). It fires on its own schedule, whatever the cycle and the workers are doing, and stands
    the process down before a starting process's watch can end, at the timings decision 17 sets.
    The process also checks before each claim, publication or post, which covers a process
    resuming from a pause before its timer has fired.

### Settled by this change

Each was settled because it has one good option, is cheap to reverse, can wait, or has a proof
behind it.

13. **`workers` is a role-file key, defaulting to 1, set like `poll_minutes`.** #241 placed it in
    `igor.config.yaml`. A role file already holds the role's other settings, and the most
    specific level winning lets an org base set a default that roles override. No upper bound:
    seats bound it (decision 15). *Cheap to reverse.*
14. **Items go to free slots in the order the cycle would claim them; a new claim waits
    for the next cycle.** Today's claim order is kept, and the poll interval bounds the wait for
    a slot freed mid-interval. An adopted item, already claimed, starts as soon as a slot and a seat are free. Starting a cycle early when a slot frees is an optimisation for later. Leaving an item
    unclaimed for want of a slot is not the deferral graceful-handoff's *Busy is not a reason*
    forbids: that scenario is about a claimed item handed off, and nothing here is claimed. An
    adopted item is already claimed, so it is never given back for want of a slot or seat: it
    stays claimed and is worked before any new item, each as a slot and a seat free. *Cheap to reverse.*
15. **No two running workers of a process share a seat, and nothing opts in to sharing.** Igor
    sees its own spend on a seat only at the next reading, so each worker running on a seat can
    carry it past its reserve line by up to one run (`docs/architecture.md` §6.3.4); with one
    worker per seat, that stays one run. It also stays clear of the per-account concurrency
    limits §6.5 warns of. A role with fewer seats than workers runs as many workers as it has
    seats. The rule filters the seats the budget gate chooses among, so it holds whether the
    gate takes the first seat in a pool's order, as `seat-budget` has it now, or the one with the
    most headroom, as #171 proposes. An opt-in can be added once someone needs one. *Can wait.*
16. **The serving record is one file per role, and every write to it is conditional on what its
    writer last read or wrote.** Per-process files were rejected for two reasons. Two processes starting
    together would each see the other's file rise and both refuse. And a serving process would
    have to stop whenever another process's file rose, since that could be a second server; so a
    late write landing in the file of a process that had already stood down would stop the
    process that replaced it. With one conditional
    file, one of two simultaneous starters wins. This is the state branch's own compare-and-swap
    on a file, which the Contents API offers through the file's `sha`; it is not a claim, so it
    does not touch `work-claiming`'s rule that claims never depend on a conditional write. *Proof:*
    TLC, `negative/NoConditionalWrites.cfg`. A lost
    record costs a starting process one restart: it exits with status 1, which its supervisor
    restarts, unlike status 78, and on its next watch a live process has written the record
    again, within 5 minutes of the loss; with no live process, the next watch takes over.
17. **The record's timing is fixed in code, the same for every process, and independent of the
    poll interval: a write every 5 minutes, a stand-down at 20 minutes without a landed write,
    and a watch of 30.** The record carries no interval, and a starting process watches for 30
    minutes whether or not a record exists.
    - Timing tied to each process's poll interval is unsafe. With the record lost, a starter has
      no declared interval and watches three of its own. A live process whose interval is 1.5
      times the starter's or more, and whose writes stop landing, stands down only at two of its
      own intervals, which is three or more of the starter's: at or after the watch's end, so
      both serve. TLC
      finds exactly that, at 3 times and at 1.5 times: `model/rejected/IntervalTimed.tla` is
      that timing, and its configurations `SlowPollLost.cfg` and `MidPollLost.cfg` violate
      `OneProcessWorks`. Waiting three of a 30-minute maximum poll interval, which #228 proposes, is safe, but makes every
      first start wait 90 minutes.
    - A fixed timing leaves no mismatch to bound: every process writes, stands down and watches
      alike, the case the main configurations check. `OneProcessPerRoleSlowPollLost.cfg`,
      `OneProcessPerRoleMidPollLost.cfg` and `OneProcessPerRoleSlowPollPause.cfg` give the two
      processes poll intervals of 30 or 15 minutes against 10, and pass.
    - The values match what interval-tied timing gave a process polling every 10 minutes: the same
      write load, 12 writes an hour per role, against a REST limit of 5,000 requests an hour; the
      same tolerance, three writes that fail in a row before a stand-down; and a first start
      that waits 30 minutes, not 90. A 5-minute period with a 10-minute stand-down and a
      15-minute watch would halve the wait, but one failed write would then end every run.
    - #179 needed per-heartbeat declarations (a heartbeat was its equivalent of a record write) and a stand-down in the shortest interval applied
      (its decisions 49 and 76) because a process's interval could change while it ran; a
      fixed timing needs neither. *Proof:* TLC.
18. **A starting process takes its role's lock, and a restart from its own checkout takes over
    at once.** The lock lives in a lock directory beside the process's lore checkout, with a
    random id written there once, and the operating system releases it when its holder ends.
    Without it, every restart, including each upgrade, would wait 30 minutes before working. With it, a restart from the same checkout takes over
    at once, and a second process from that checkout is refused at once. Another checkout has
    another lock directory and id, so it watches as a process on another host does. *Proof:*
    TLC, `OneProcessPerRoleSameHost.cfg` and `negative/NoLock.cfg`.
19. **A stand-down, a displaced process, and a start that cannot reach GitHub exit with status 1,
    not 78.** #82 keeps 78 for a refusal at start. Status 1 is restarted, and the restart runs
    the startup guard, which either takes over (nobody else did) or refuses (somebody did).
    *One good option.*
20. **A refused start opens no condition.** #241 recommended one, naming both hosts. A
    condition, in `stuck-conditions`, is a recorded fault that stops a role, a seat or an Igor
    from taking new items, and the refused process is not running to take any; its log
    names both processes' hosts, and #82 leaves the unit failed. *Cheap to reverse.*
21. **The age check uses a clock that counts time the host was suspended.** On Linux,
    `CLOCK_MONOTONIC`, which Node's monotonic timers read, does not count a suspend
    ([clock_gettime(2)](https://man7.org/linux/man-pages/man2/clock_gettime.2.html)), which
    would let a host resumed after a long suspend act on an age that is too young. The
    implementation takes the larger of the elapsed monotonic and elapsed wall-clock times.
    *One good option.*
22. **Two surface failures in a row still stop a cycle, counted in the order runs end.**
    `work-claiming` stops a cycle at two runs in a row that a surface did not answer. Runs now
    end in any order, some after the cycle that claimed them; a run counts toward whichever cycle
    is running when it ends, or, where none is, toward the next one. *One good option.*
23. **On its own host, slot 1 runs as #175's `igor-worker-<role>`; slot `k` of 2 and above as
    `igor-worker-<role>-<k>`.** This is how a local host meets decision 29's guarantees. Workers
    running at once need users of their own to stay out of each other's `/proc` and trees, as
    #175 requires, and #175 builds one user per role from the
    unit's `%i`, which carries no slot number. So the extra users are this change's: the setup
    that creates #175's user also creates `igor-worker-<role>-2` to `-<workers>`, #175's sudoers
    rule names them, each slot's tree and outbox take its own user's group, and the unit gives the
    Igor every slot's group and write access to every slot's home, where #175's unit names only
    `igor-worker-%i`'s. Keeping slot 1 on
    #175's name leaves a one-worker role exactly as #175 builds it, with #175's 20-character
    limit; naming every slot `-<k>` would cut that limit to 18 for every role, one worker or
    many. *Cheap to reverse.*
24. **The six-hour worker ceiling stays.** #179 removed it (its decision 18, Adam's), and #241
    lists that removal among what carries over. This change no longer needs it removed: the
    sweep of slot trees reads no age. The ceiling still bounds the age at which `igor run`'s
    crashed trees are swept, and `igor run` gains nothing here (decision 3), so removing the
    ceiling needs its own change with a sweep for those trees. *Can wait.*
25. **Left to the changes that own them:** the probe keepalive and the 30-minute maximum poll
    interval go to #228 (`probe-claim`); the reply giving a seat's reset time goes to #140
    (`directed-asks`); the reread of the configuration at each cycle goes to #208
    (`lore-pull`). None of them is needed for one process per role. *Can wait.*
26. **The in-force text that assumed one item at a time is modified here, compacted to fit.**
    `work-claiming`'s *A claim is verified after a settle interval* and *A claim that cannot be
    kept is given back, out loud*, and `work-discovery`'s *Watermarks reduce reconsideration
    without governing it*, now state decisions 14 and 22. Refinements added beside them would
    leave contradicting text in force. Each was over OpenSpec's 500-character limit, so each is
    compacted in #232's order: cut, then move detail into scenarios, then split. Only the
    give-back requirement needed a split, into *Two runs in a row that the surface failed stop a
    cycle* and *A write says what the surface recorded*; every in-force scenario stays under its
    old name. The reasons cut are in the archived changes that added them. *Cheap to reverse.*
27. **`seat-budget` gets no delta here.** #171, which archives first, removes *A pool is an
    ordered list of seats…* and adds *A role draws on the seat with the most headroom*, and
    spec-check simulates the archive against `main`, where #171's requirement is not yet in
    force, and a `MODIFIED` copy of a requirement not in force fails that simulation. Once #171 is on `main`, this change modifies that requirement to choose among seats
    the process's running workers do not hold (task 6.9). Until then the in-force *first seat in
    that list with headroom* reads as if a busy seat were chosen; role-process's seat rule governs.
    *Can wait.*
28. **Where `workers` is 2 or more, a role whose
    `igor-worker-<role>-<workers>` would pass 32 characters is refused at load.** Linux refuses to
    create such a user, so the role would otherwise fail at its first worker, after it had
    claimed. #175's check, a role name of at most 20 characters, stays for every role; this one
    is stricter only for several workers. `igor-worker-` takes 12 characters and `-<k>` two or
    more, so a role name may have at most 18 characters for up to 9 workers, and 17 for 10 to 99.
    *One good option.*
29. **What Igor guarantees about a worker is stated as properties, not as Linux users.** #175's
    *The worker runs as a separate, unprivileged user* already keeps a worker from the Igor's
    credentials and from another role's worker; *Every worker is kept apart and can be ended*
    extends it to every other worker of the same role, and requires that Igor can end the
    worker's run and everything it started.
    The worker users, their groups, the unit's paths, the takeover kill and the tree removals are
    how a process meets those on its own host, and each requirement for them is scoped to workers
    on the process's host. Igor intends to run workers as cloud Claude Code sessions, with
    `igor serve` as the coordinator, so that one process can run more workers than a host could.
    That cannot be built yet: the documented sessions give a caller no way to see their status,
    learn they finished, or stop them (#244). Requirements tied to Linux users would have to
    be rewritten for it; requirements stated as properties need only a new way of meeting them.
    Because workers may later run off the host, `workers` limits how many items a role works at
    once, not how many a host can hold. *Cheap to reverse.*

## What the model proves

`model/OneProcessPerRole.tla` models the processes that may be started for one role: the lock,
the serving record, the watch, the conditional takeover, the record writes, the stand-down,
adoption, crashes, restarts, a pause, a lost record, and writes that fail, land late or never
land. Each process counts ticks itself, with counters that stop at the watch and stand-down
bounds, so the state space is finite without a time horizon. A running process's timer firing
is urgent: time does not advance past a firing that is due. A paused process does nothing while
its counters still advance. The workers
inside one process are not modelled.

| Invariant | Requirement it proves |
| --- | --- |
| `OneProcessWorks` | *One process serves a role at a time* |
| `EveryClaimAccountedFor` | *A process that takes over adopts or gives back every claim of its role* |

Every configuration has two processes and two items. A tick is 5 minutes: a record write every
tick, a stand-down at 4 ticks (20 minutes) and a watch of 6 (30). Poll intervals are 2 ticks (10
minutes) unless a configuration says otherwise. TLC 2.19 (tla2tools v1.7.4) ran each with no error found:

| Configuration | What it covers | Distinct states |
| --- | --- | --- |
| `OneProcessPerRole.cfg` | p1 serves on h1, p2 may start on h2; one pause; 3 starts, counting p1's | 516,622 |
| `OneProcessPerRoleLostRecord.cfg` | the same, with a lost record instead of a pause | 264,470 |
| `OneProcessPerRoleSameHost.cfg` | p1 serves, p2 may start from the same checkout; a pause | 180,859 |
| `OneProcessPerRoleFirstStart.cfg` | no record; both may start at once, on two hosts; a pause | 1,204,717 |
| `OneProcessPerRoleStale.cfg` | a crash on h1 left the record and claims; a pause | 2,051,079 |
| `OneProcessPerRoleSlowPollLost.cfg` | p1 polls every 30 minutes, p2 every 10; a lost record | 554,273 |
| `OneProcessPerRoleMidPollLost.cfg` | p1 polls every 15 minutes, p2 every 10; a lost record | 309,770 |
| `OneProcessPerRoleSlowPollPause.cfg` | p1 polls every 30 minutes, p2 every 10; a pause | 1,041,752 |
| `OneProcessPerRoleAllFaults.cfg` | two hosts; a pause and a lost record; 4 starts | 9,099,302 |

Each finishes in under three minutes on a laptop. Each negative configuration removes one
guard, and TLC finds a violation in it:

| Negative configuration | Guard removed | Violates |
| --- | --- | --- |
| `NoLock.cfg` | the role's lock, with the restart shortcut kept | `OneProcessWorks` |
| `NoWatch.cfg` | the watch | `OneProcessWorks` |
| `NoConditionalWrites.cfg` | conditional record writes | `OneProcessWorks` |
| `NoStandDownTimer.cfg` | the stand-down | `OneProcessWorks` |
| `LateStandDown.cfg` | the margin: stand-down at 30 minutes, equal to the watch | `OneProcessWorks` |
| `NoAdoption.cfg` | adoption at takeover | `EveryClaimAccountedFor` |
| `rejected/SlowPollLost.cfg` | the fixed timing, replaced by `IntervalTimed.tla`'s; intervals 3 times apart | `OneProcessWorks` |
| `rejected/MidPollLost.cfg` | the fixed timing, replaced by `IntervalTimed.tla`'s; intervals 1.5 times apart | `OneProcessWorks` |

**What the model assumes:**
- A process's poll interval spaces only the claims its cycles make. The record's timing reads
  no poll interval, in the model as in the spec.
- A resumed process's overdue timer runs before anything else it does. A real process resumes
  its workers at the same moment, but a worker changes only its own tree, because the serving
  process, not the worker, publishes; and that process checks the age before each claim,
  publication or post.
- The lock directory is on a local filesystem, where the operating system's lock is exclusive,
  and its id is unique to it. A copied directory, as from a cloned VM or a restored volume, keeps
  the id, but its lock is a separate operating-system lock that the original's holder does not
  hold, so a process using the copy would take over at once beside a live one; nothing in the
  spec compares the record's host name to rule that out.
- A paused process's workers do nothing. When only `igor serve` is paused, as by SIGSTOP, its
  workers, each in a process group of its own, keep running. A process on another host then
  takes over after its watch and works their items again while they still spend seats, since
  its takeover kill reaches only its own host. The model does not check this case; *Risks*
  lists it.
- A write's age is counted from when it was sent, so a write that lands late makes its process
  stand down sooner, never later; *A serving process that cannot rewrite its record stops its
  workers* says so.
- A crash ends a process's workers with it. Under systemd or Compose they die with the unit or
  container; a hand-run process killed with SIGKILL leaves them, and *A process that takes over
  ends its predecessor's surviving workers* ends them after the takeover write and before the
  process removes a tree or starts a worker.

## Risks / Trade-offs

- **A restart from another checkout or host, and a role's first start, wait 30 minutes before
  working.** A restart from the same checkout does not wait.
- **A GitHub outage of 20 minutes ends every running worker's run**, whatever the poll interval. The process exits
  with status 1, and its restart adopts the claims and works them again, paying twice. That is
  the price of never letting a process work after it may have been replaced.
- **An upgrade or a crash interrupts all N workers together**, and the process taking over works
  again each item without a pull request (#241's accepted costs).
- **Open pull requests overlap this change.** #140 (`directed-asks`)
  also modifies work-triage's *An item held by another party is never a candidate*. Its copy of
  *Items with work already in flight are skipped*, a requirement this change does not modify,
  lets a process carry on the claim of a rank that has gone; that rule rests on ranks, which
  this change removes, and competes with this change's adoption rule. #175
  (`worker-user`) modifies task-execution's *Igor forwards the termination it is sent*: in #175's
  copy, a kill under `igor serve` reaches every process the worker user owns, where this change's
  copy kills each worker's process group, so the merged text needs both. Whichever archives second
  carries the other's text; #204 orders the archives. #106 (`role-keyed-watermark`) archives
  after this change and modifies *Watermarks reduce reconsideration without governing it*, so
  its copy must carry this change's text. #173 (`pre-worker-breaker`) adds requirements about
  surface failures beside *Two runs in a row that the surface failed stop a cycle*; neither
  modifies the other's, so nothing is merged by hand, but #173's rules have to read the count in
  the order runs end. This change
  archives after #171, and its `seat-budget` delta waits for #171 (decision 27). It also
  archives after #175, four of whose requirements name the role's one worker user: one for the
  kill, the release and the startup sweep, one for the start check, and two for the sudoers
  condition. Once #175 is on `main`, this change adds `MODIFIED` copies of those four that cover
  every slot user (task 6.12). #204 archives #175 first, so this
  change's copy of *Igor forwards the termination it is sent* is the one left in force and must
  carry #175's kill by worker user (task 6.12). #175 also runs `igor serve` workers only on a
  local host, whereas this change's *Every worker is kept apart and can be ended* allows workers
  elsewhere. #175 is being reworded, by its own author, to state its guarantees as properties
  too (decision 29); until it is, the two disagree on where a worker may run, and they must agree
  before this change archives.
- **The open change `directed-interaction` on `main` assumes one item at a time.** Its proposal
  reasons from ranks, and says *"a process already working an item is not planning a cycle"*,
  which is false once a cycle runs while workers run.
- **A hand-run `igor serve` killed with SIGKILL leaves its workers running.** Each worker is in a
  process group of its own; under systemd or Compose they die with the unit or container, but
  by hand they survive, and the restart's fast takeover removes their trees while they spend
  seats. Task 2.5 kills them at takeover.
- **A paused `igor serve`'s workers can run beside a process on another host that took over**, each working the same item, until they end (*What the model assumes*).
- **A worker that could write the lock directory could delay a restart.** By changing the
  directory's id, it would make a restart from that checkout watch for 30 minutes instead of
  taking over; and since the restart's trees would then be named for an id that no longer matches,
  they would be left to the age-based sweep. No requirement here or in
  #175 keeps an `igor serve` worker from writing it: #175's write barrier names the lore
  checkout, not a directory beside it. An `igor run` worker, which #175 always runs as the
  Igor's own user, can write it; decision 3 accepts that, since `igor run` is a dev tool.
- **The takeover kill is by worker user, not by process group.** It reaches every process of the
  role's slot worker users on the host, including the workers of a paused process from another
  checkout on the same host, which is the intent: that process has been replaced. A process group
  kill would miss commands Claude Code starts in new sessions, as #175 measured. The kill at
  shutdown in this change's copy of *Igor forwards the termination it is sent* is still by
  process group, and #175's copy extends it to every process of the worker user; whichever
  archives second carries both.

- **A refused App credential stands every process down after 20 minutes.** Every state-branch
  write then fails, so the process stops its workers and exits, and on restart the startup guard's first
  read of the record fails while GitHub refuses the credential, so it exits 1 and restarts in a
  loop. `surface-adapter`'s *An Igor that cannot act as its App does not start* instead has a running
  process take no new item and resume once a token mints again, without exiting, and #82
  (`stopped-scope`) keeps `igor serve` running through a condition. This change has to be
  reconciled with both before it is built, by this change's and #82's authors.

## Open Questions

None for Adam. The refused-credential stand-down in *Risks* is open for this change's and #82's
authors. Three facts the design relies on are unmeasured, each with a task that measures it
before the code depends on it:
- whether the clock behind the age check counts a suspend (task 2.3, decision 21);
- whether the lock is exclusive on a bind mount and on Docker Desktop's file sharing (task 2.4);
- whether the Contents API answers *branch moved* differently from *file changed* (task 2.6). If
  it does not, a refused write other than the serving record's is read again and re-applied in
  either case. That is safe for any file, since the change is re-applied to what the file now
  holds; it costs only a read.
