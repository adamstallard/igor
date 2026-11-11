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
  half poll interval, and stop itself once it cannot; a starting process that sees the record
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
   a served role. Nothing else coordinates the two.
4. **Duplicate roles are allowed, not recommended for redundancy.** A duplicate does not rescue
   a dead host's items, since the dead role's label still holds them; it doubles triage; and
   where both claim one item, the loser's retraction is noise on the item.

### Carried over from #179

Each is restated here for one process per role; the number is #179's decision.

5. **A second process is detected as a start id other than one's own, whose counter rises**
   (from #179's decision 63, which was Adam's, and its decision 72). The serving record holds
   the writer's start id, picked at random at each start, and a counter it raises at each write.
   #179 kept a record per rank and watched for a rank's; here there is one record per role: the
   starting process watches it, and any change to it means another live process.
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
    may still hold their trees, and the different id keeps them out of the sweep.
11. **A starting process that finds another live process exits with status 78** (from #179's
    decisions 24 and 32, Adam's). #82 (open) makes the shipped systemd unit leave a process that
    exits with status 78 stopped. Until it
    lands, the unit's `Restart=always` starts a refused process again every 30 seconds, and
    each start refuses again: safe, and noisy in the journal.
12. **A process stops its own workers on a timer the cycle cannot delay** (from #179's decision
    76). It fires every half poll interval whatever the cycle and the workers are doing, and
    stands the process down once its last landed record write is two poll intervals old, inside
    the three poll intervals a starting process watches.
    The process also checks before each claim, publication or post, which covers a process
    resuming from a pause before its timer has fired.

### Settled by this change

Each was settled because it has one good option, is cheap to reverse, can wait, or has a proof
behind it.

13. **`workers` is a role-file key, defaulting to 1, set like `poll_minutes`.** #241 placed it in
    `igor.config.yaml`. A role file already holds the role's other settings, and the most
    specific level winning lets an org base set a default that roles override. No upper bound:
    seats bound it (decision 15). *Cheap to reverse.*
14. **Items go to free slots in the order the cycle would claim them; a slot freed mid-interval
    waits for the next cycle.** Today's claim order is kept, and the poll interval bounds the
    wait. Starting a cycle early when a slot frees is an optimisation for later. Leaving an item
    unclaimed for want of a slot is not the deferral graceful-handoff's *Busy is not a reason*
    forbids: that scenario is about a claimed item handed off, and nothing here is claimed.
    *Cheap to reverse.*
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
    does not touch `work-claiming`'s rule that claims never depend on a conditional write. A lost
    record costs a starting process at most one refused start: a watching process counts the
    loss as a change and exits with status 78, and by its next start a live process has written
    the record again, within half a poll interval of the loss. *Proof:* TLC, `negative/NoConditionalWrites.cfg`.
17. **The record's timing is fixed when the process starts, and declared in the record.** #179
    needed per-heartbeat declarations and a stand-down in the shortest interval applied
    (its decisions 49 and 76) because a process's interval could change while it ran. Here the
    timer's interval never changes, so neither is needed. *One good option.*
18. **A starting process takes its role's lock, and a restart from its own checkout takes over
    at once.** The lock lives in a lock directory beside the process's lore checkout, with a
    random id written there once, and the operating system releases it when its holder ends.
    Without it, every restart, including each upgrade, would wait three poll intervals, 30
    minutes at the default, before working. With it, a restart from the same checkout takes over
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
23. **Slot `k` of role `r` runs as worker user `igor-worker-<r>-<k>`**, as #241 recommended, so
    workers running at once stay isolated from each other's `/proc` as #175 requires. This
    change requires the name. #175 derives the user from the unit's `%i` and generates no
    drop-in per instance; a slot number cannot come from `%i`, so #175 needs another way to
    provide one user per slot, and #175 decides how.
24. **The six-hour worker ceiling stays.** #179 removed it (its decision 18, Adam's), and #241
    lists that removal among what carries over. This change no longer needs it removed: the
    sweep of slot trees reads no age. The ceiling still bounds the age at which `igor run`'s
    crashed trees are swept, and `igor run` gains nothing here (decision 3), so removing the
    ceiling needs its own change with a sweep for those trees. *Can wait.*
25. **Left to the changes that own them:** the probe keepalive and the 30-minute maximum poll
    interval go to #228 (`probe-claim`); the reply giving a seat's reset time goes to #140
    (`directed-asks`); the reread of the configuration at each cycle goes to #208
    (`lore-pull`). None of them is needed for one process per role. *Can wait.*

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

Every configuration has two processes, two items, half a poll interval of 1 tick (so a poll
interval is 2 ticks), a stand-down at 4 ticks (two intervals) and a watch of 6 (three). TLC 2.19 (tla2tools v1.7.4) ran each with no error found:

| Configuration | What it covers | Distinct states |
| --- | --- | --- |
| `OneProcessPerRole.cfg` | p1 serves on h1, p2 may start on h2; one pause; 3 starts, counting p1's | 208,177 |
| `OneProcessPerRoleLostRecord.cfg` | the same, with a lost record instead of a pause | 108,471 |
| `OneProcessPerRoleSameHost.cfg` | p1 serves, p2 may start from the same checkout; a pause | 63,655 |
| `OneProcessPerRoleFirstStart.cfg` | no record; both may start at once, on two hosts; a pause | 485,747 |
| `OneProcessPerRoleStale.cfg` | a crash on h1 left the record and claims; a pause | 797,404 |
| `OneProcessPerRoleAllFaults.cfg` | two hosts; a pause and a lost record; 4 starts | 3,817,929 |

Each finishes in about a minute or less on a laptop. Each negative configuration removes one
guard, and TLC finds a violation in it:

| Negative configuration | Guard removed | Violates |
| --- | --- | --- |
| `NoLock.cfg` | the role's lock, with the restart shortcut kept | `OneProcessWorks` |
| `NoWatch.cfg` | the watch | `OneProcessWorks` |
| `NoConditionalWrites.cfg` | conditional record writes | `OneProcessWorks` |
| `NoStandDownTimer.cfg` | the stand-down | `OneProcessWorks` |
| `LateStandDown.cfg` | the margin: stand-down at three intervals, equal to the watch | `OneProcessWorks` |
| `NoAdoption.cfg` | adoption at takeover | `EveryClaimAccountedFor` |

**What the model assumes:**
- Both processes run the same poll interval. Where the record declares an interval, the watch
  counts the longer of the two, so different intervals are safe there; Open Question 1 is about
  a record that is absent.
- A resumed process's overdue timer runs before anything else it does. A real process resumes
  its workers at the same moment, but a worker changes only its own tree, because the serving
  process, not the worker, publishes; and that process checks the age before each claim,
  publication or post.
- The lock directory is on a local filesystem, where the operating system's lock is exclusive.
- A write's age is counted from when it was sent, so a write that lands late makes its process
  stand down sooner, never later.

## Risks / Trade-offs

- **A restart from another checkout or host, and a role's first start, wait three poll intervals
  before working:** 30 minutes at the default. A restart from the same checkout does not wait.
- **A GitHub outage of two poll intervals ends every running worker's run.** The process exits
  with status 1, and its restart adopts the claims and works them again, paying twice. That is
  the price of never letting a process work after it may have been replaced.
- **An upgrade or a crash interrupts all N workers together**, and the process taking over works
  again each item without a pull request (#241's accepted costs).
- **Two open pull requests modify requirements this change modifies.** #140 (`directed-asks`)
  also modifies work-triage's *An item held by another party is never a candidate*, so whichever
  archives second must carry the other's text; and its exception for a gone rank's claim rests on
  ranks, which this change removes. The open change `directed-interaction` on `main` also reasons
  from ranks. #204 orders the archives.

## Open Questions

1. **For Adam: how long does a starting process watch when the role has no serving record?**
   That happens at a role's first start, and after the state branch is lost or reset. A test
   cannot tell the options apart; they differ in a rare unsafe case and in the wait at every
   first start. The spec is written to option A.
   - **A. Three of its own poll interval** (30 minutes at the default). Unsafe in one case: the
     record was lost while another process of the role serves with a poll interval more than six
     times the starter's. That process writes again up to half its interval after the loss,
     which then comes after the starter's watch of three of its own intervals ends. Processes of one role
     read one role file, so their intervals differ only through `--poll` or a change between
     their starts.
   - **B. Three of the 30-minute maximum poll interval** (90 minutes). Always safe; every first
     start waits 90 minutes. #228 (`probe-claim`) brings that maximum in for its probe lapse. If it
     lands, B adds no new limit; and under A, the unsafe case then needs a starting process whose
     interval is under 5 minutes, since no interval may exceed 30.
   - *Recommended: A.* The unsafe case needs a lost state branch, a second process started by
     mistake within the watch, and poll intervals six times apart, all at once.
