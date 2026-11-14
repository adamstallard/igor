-------------------------- MODULE OneProcessPerRole --------------------------
(***************************************************************************)
(* The startup guard and claim adoption of the OpenSpec change             *)
(* one-process-per-role, for the processes that may be started for one     *)
(* role.                                                                   *)
(*                                                                         *)
(* A process starts, takes its role's lock, reads the role's serving       *)
(* record on the state branch, and either takes over at once (the record   *)
(* names its own lock directory, whose lock it now holds) or watches the   *)
(* record for Watch ticks first. It takes over with one write, conditional *)
(* on the record not having changed since it read it. A serving process    *)
(* rewrites the record every WritePeriod ticks, each write conditional on the     *)
(* record still holding its own last write, and stands down once its last  *)
(* landed write is StandDown ticks old. Processes crash, restart, pause    *)
(* and resume; the record can be lost; writes can fail, land late or never *)
(* land.                                                                   *)
(*                                                                         *)
(* Time passes in ticks. Each process counts ticks itself, and its         *)
(* counters stop at the bound that matters (Watch, StandDown), so the      *)
(* state space is finite without a time horizon. A running, unpaused       *)
(* process's timer firing is urgent: a tick waits for every firing that is *)
(* due. A paused process does nothing, and its counters still advance, as  *)
(* on a clock that counts time the host was suspended.                     *)
(*                                                                         *)
(* The record's timing (WritePeriod, StandDown, Watch) is fixed in code and the   *)
(* same for every process. A process's poll interval, PollOf, only spaces  *)
(* its cycles' claims, so processes polling at different intervals still   *)
(* time the record alike.                                                  *)
(*                                                                         *)
(* The record is modelled by its writer's start id and lock directory. A   *)
(* real record also carries a counter, so every write changes it; here a   *)
(* watching process's `seen` flag records that a write landed, or the      *)
(* record was lost, since its watch began.                                 *)
(*                                                                         *)
(* The workers inside one process are not modelled: one in-memory set of   *)
(* items in flight schedules them, and nothing there is shared between     *)
(* processes. workers[p] stands for the items p's workers are working.     *)
(*                                                                         *)
(* Each guard is a TRUE or FALSE constant. Every file in negative/ sets one *)
(* of them FALSE, or StandDown equal to Watch, and TLC must find a         *)
(* violation there.                                                        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Procs,          \* processes that may be started for the role
    LockDirOf,      \* the lock directory each process uses: its host, in effect
    Items,          \* items the role may claim
    WritePeriod,           \* the record's write period, fixed in code and the same for every process
    PollOf,         \* each process's poll interval, which spaces its cycles; the record ignores it
    StandDown,      \* age of the last landed write at which a serving process stands down
    Watch,          \* how long a starting process watches the record before taking over
    MaxStarts,      \* starts allowed, all processes together, counting one serving at the outset
    MaxPauses,      \* pauses allowed, all processes together
    MaxLosses,      \* losses of the record allowed
    InitServing,    \* p1 already serves at the outset, working every item
    InitRecord,     \* when InitServing is FALSE: "none", or "stale" for a record a crashed process left
    StaleDir,       \* the lock directory the stale record names, when InitRecord is "stale"
    \* The guards. Each is TRUE in the change as specified.
    TakeLock,           \* a starting process takes its role's lock, and refuses without it
    WatchFirst,         \* a process whose record names another lock directory watches first
    ConditionalWrites,  \* every record write is conditional on the record its writer expects
    StandDownTimer,     \* a serving process stops once its last landed write is StandDown old
    AdoptClaims         \* a process that takes over adopts or gives back every labelled item

\* Where the processes run, for LockDirOf: each on a host of its own, or both on one.
TwoHosts == [p \in Procs |-> IF p = "p1" THEN "h1" ELSE "h2"]
OneHost  == [p \in Procs |-> "h1"]

\* Poll intervals, for PollOf, in ticks: WritePeriod is 5 minutes, so 2 ticks is the default 10.
EqualPoll == [p \in Procs |-> 2]
SlowPoll == [p \in Procs |-> IF p = "p1" THEN 6 ELSE 2]   \* p1 at 30 minutes, p2 at 10
MidPoll == [p \in Procs |-> IF p = "p1" THEN 3 ELSE 2]  \* p1 at 15 minutes, p2 at 10

NoRec  == [sid |-> <<"none", 0>>, dir |-> "none"]
NoPend == [kind |-> "none", new |-> NoRec, age |-> 0, cur |-> FALSE, ok |-> FALSE]
Dirs   == {LockDirOf[p] : p \in Procs}

VARIABLES
    phase,      \* "down", "watching", "taking" (takeover write sent) or "serving"
    starts,     \* how many times each process has started; with p, its start id
    paused,
    pauses,     \* pauses used so far
    losses,     \* record losses used so far
    lock,       \* the holder of each lock directory's role lock, or "free"
    rec,        \* the serving record on the state branch
    fast,       \* the watching process may take over at once (its own lock directory)
    seen,       \* a write landed, or the record was lost, since this process's watch began
    watched,    \* ticks since the watch began, stopping at Watch
    fireIn,     \* ticks until this process's timer fires; 0 when it is due
    age,        \* ticks since this process sent its last write that landed, stopping at StandDown
    pend,       \* this process's write in flight, or NoPend
    workers,    \* items this process's workers are working
    labelled,   \* items carrying the role's `igor:<role>` label
    adopt,      \* items this process took over and has not yet adopted or given back
    cycleIn     \* ticks until this process's next cycle may claim

vars == <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched, fireIn,
          age, pend, workers, labelled, adopt, cycleIn>>

Sid(p)      == <<p, starts[p]>>
Mine(p)     == [sid |-> Sid(p), dir |-> LockDirOf[p]]
Running(p)  == phase[p] \in {"watching", "taking", "serving"}
Timed(p)    == phase[p] \in {"watching", "serving"} /\ ~paused[p]
TotalStarts == LET F[S \in SUBSET Procs] ==
                     IF S = {} THEN 0 ELSE LET q == CHOOSE q \in S : TRUE IN starts[q] + F[S \ {q}]
               IN F[Procs]
Up(x, bound) == IF x < bound THEN x + 1 ELSE bound

\* A serving process may claim, publish or post only while its last landed write is young.
CanAct(p) == /\ phase[p] = "serving"
             /\ ~paused[p]
             /\ StandDownTimer => age[p] < StandDown

\* A process works the role's items while it may act, or while its workers run.
Working(p) == ~paused[p] /\ (CanAct(p) \/ workers[p] # {})

\* What a process gives up when it ends, and the counters that no longer mean anything.
End(p) ==
    /\ phase'   = [phase   EXCEPT ![p] = "down"]
    /\ workers' = [workers EXCEPT ![p] = {}]
    /\ adopt'   = [adopt   EXCEPT ![p] = {}]
    /\ paused'  = [paused  EXCEPT ![p] = FALSE]
    /\ fast'    = [fast    EXCEPT ![p] = FALSE]
    /\ seen'    = [seen    EXCEPT ![p] = FALSE]
    /\ watched' = [watched EXCEPT ![p] = 0]
    /\ fireIn'  = [fireIn  EXCEPT ![p] = 0]
    /\ age'     = [age     EXCEPT ![p] = 0]
    /\ lock'    = [d \in Dirs |-> IF lock[d] = p THEN "free" ELSE lock[d]]

\* The record changing marks it seen by every process watching or taking over.
SeenNow == [q \in Procs |-> phase[q] \in {"watching", "taking"} \/ seen[q]]

Init ==
    /\ phase = [p \in Procs |-> IF InitServing /\ p = "p1" THEN "serving" ELSE "down"]
    /\ starts = [p \in Procs |-> IF InitServing /\ p = "p1" THEN 1 ELSE 0]
    /\ paused = [p \in Procs |-> FALSE]
    /\ pauses = 0
    /\ losses = 0
    /\ lock = [d \in Dirs |-> IF InitServing /\ d = LockDirOf["p1"] THEN "p1" ELSE "free"]
    /\ rec = CASE InitServing          -> [sid |-> <<"p1", 1>>, dir |-> LockDirOf["p1"]]
               [] InitRecord = "stale" -> [sid |-> <<"old", 0>>, dir |-> StaleDir]
               [] OTHER                -> NoRec
    /\ fast = [p \in Procs |-> FALSE]
    /\ seen = [p \in Procs |-> FALSE]
    /\ watched = [p \in Procs |-> 0]
    /\ fireIn = [p \in Procs |-> IF InitServing /\ p = "p1" THEN WritePeriod ELSE 0]
    /\ age = [p \in Procs |-> 0]
    /\ pend = [p \in Procs |-> NoPend]
    /\ workers = [p \in Procs |-> IF InitServing /\ p = "p1" THEN Items ELSE {}]
    \* A live process, or a crashed predecessor, holds every item.
    /\ labelled = IF InitServing \/ InitRecord = "stale" THEN Items ELSE {}
    /\ adopt = [p \in Procs |-> {}]
    /\ cycleIn = [p \in Procs |-> 0]

(* A supervisor or a person starts a process. Without the role's lock it refuses
   (exit 78) at once. With it, it reads the record: one naming its own lock
   directory was written by a process that has ended, since that process held
   the lock while it lived, so this process may take over at once. *)
Start(p) ==
    /\ phase[p] = "down"
    /\ TotalStarts < MaxStarts
    /\ starts' = [starts EXCEPT ![p] = @ + 1]
    /\ IF TakeLock /\ lock[LockDirOf[p]] # "free"
         THEN UNCHANGED <<phase, lock, fast>>
         ELSE /\ phase' = [phase EXCEPT ![p] = "watching"]
              /\ lock' = IF TakeLock THEN [lock EXCEPT ![LockDirOf[p]] = p] ELSE lock
              /\ fast' = [fast EXCEPT ![p] = (rec.dir = LockDirOf[p])]
    /\ UNCHANGED <<paused, pauses, losses, rec, seen, watched, fireIn, age, pend, workers,
                   labelled, adopt>>

Ready(p) == fast[p] \/ ~WatchFirst \/ watched[p] >= Watch

(* A watching process's timer firing. A record changed since the watch began means
   another live process: refuse (exit 78). Once the watch is over, send the
   takeover write, conditional on the record not having changed, and wait in
   "taking" for its answer. *)
WatchFire(p) ==
    /\ phase[p] = "watching"
    /\ ~paused[p]
    /\ fireIn[p] = 0
    /\ IF WatchFirst /\ ~fast[p] /\ seen[p]
         THEN /\ End(p)
              /\ UNCHANGED pend
         ELSE IF ~Ready(p)
           THEN /\ fireIn' = [fireIn EXCEPT ![p] = WritePeriod]
                /\ UNCHANGED <<phase, workers, adopt, paused, fast, seen, watched, age, lock, pend>>
           ELSE /\ phase' = [phase EXCEPT ![p] = "taking"]
                /\ pend' = [pend EXCEPT ![p] =
                              [kind |-> "takeover", new |-> Mine(p), age |-> 0, cur |-> TRUE,
                               ok |-> ~seen[p]]]
                /\ UNCHANGED <<fireIn, workers, adopt, paused, fast, seen, watched, age, lock>>
    /\ UNCHANGED <<starts, pauses, losses, rec, labelled>>

(* A takeover write that gets no answer: the process exits with status 1. The
   write may still land later, naming a process that has ended. *)
TakeTimeout(p) ==
    /\ phase[p] = "taking"
    /\ End(p)
    /\ pend' = [pend EXCEPT ![p].cur = FALSE]
    /\ UNCHANGED <<starts, pauses, losses, rec, labelled>>

(* A serving process's timer firing: stand down once its last landed write is
   StandDown old, and otherwise send the next write. While a write is still in
   flight it sends none, as the real timer waits for the answer to its last. *)
ServeFire(p) ==
    /\ phase[p] = "serving"
    /\ ~paused[p]
    /\ fireIn[p] = 0
    /\ IF StandDownTimer /\ age[p] >= StandDown
         THEN /\ End(p)
              /\ pend' = [pend EXCEPT ![p].cur = FALSE]
         ELSE /\ fireIn' = [fireIn EXCEPT ![p] = WritePeriod]
              /\ pend' = IF pend[p] = NoPend
                           THEN [pend EXCEPT ![p] =
                                  [kind |-> "serve", new |-> Mine(p), age |-> 0, cur |-> TRUE,
                                   ok |-> rec = Mine(p)]]
                           ELSE pend
              /\ UNCHANGED <<phase, workers, adopt, paused, fast, seen, watched, age, lock>>
    /\ UNCHANGED <<starts, pauses, losses, rec, labelled>>

Others(p) == [q \in Procs |-> IF q = p \/ pend[q] = NoPend THEN pend[q]
                              ELSE [pend[q] EXCEPT !.ok = FALSE]]

(* A write in flight reaches the state branch, at any later time, even after its
   process paused or ended. Each write is conditional on the record its writer
   expected when it sent it: its `ok` flag holds while the record has not changed
   since, and a landed write or a loss of the record clears every other write's `ok` flag.
   - A takeover write that lands makes its writer serve; one that does not makes it
     exit with status 78.
   - A serving process's write that does not land finds the record changed. Where
     its writer is still serving and awake to read the answer, an absent record is
     written again, conditional on its absence; a record naming another start id
     means it was displaced, and it stops its workers and exits with status 1. *)
Land(p) ==
    /\ pend[p] # NoPend
    /\ LET w       == pend[p]
           taking  == w.cur /\ phase[p] = "taking"
           serving == w.cur /\ phase[p] = "serving" /\ ~paused[p]
           create  == w.kind = "serve" /\ serving /\ rec = NoRec
       IN IF ~ConditionalWrites \/ w.ok \/ create
            THEN /\ rec' = w.new
                 /\ IF taking
                      THEN /\ phase' = [phase EXCEPT ![p] = "serving"]
                           /\ fireIn' = [fireIn EXCEPT ![p] = 0]
                           /\ age' = [age EXCEPT ![p] = w.age]
                           /\ adopt' = [adopt EXCEPT ![p] = IF AdoptClaims THEN labelled ELSE {}]
                           /\ seen' = [SeenNow EXCEPT ![p] = FALSE]
                      ELSE /\ age' = IF w.cur /\ phase[p] = "serving"
                                        THEN [age EXCEPT ![p] = w.age] ELSE age
                           /\ seen' = SeenNow
                           /\ UNCHANGED <<phase, fireIn, adopt>>
                 /\ pend' = [Others(p) EXCEPT ![p] = NoPend]
                 /\ UNCHANGED <<workers, paused, fast, watched, lock>>
            ELSE /\ IF taking \/ serving
                      THEN End(p)
                      ELSE UNCHANGED <<phase, workers, adopt, paused, fast, seen, watched,
                                       fireIn, age, lock>>
                 /\ pend' = [pend EXCEPT ![p] = NoPend]
                 /\ UNCHANGED rec
    /\ UNCHANGED <<starts, pauses, losses, labelled>>

(* A write the network loses entirely. *)
Drop(p) ==
    /\ pend[p] # NoPend
    /\ pend' = [pend EXCEPT ![p] = NoPend]
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched,
                   fireIn, age, workers, labelled, adopt>>

(* The tracker writes a serving process makes for items. *)
Claim(p, i) ==
    /\ CanAct(p)
    /\ cycleIn[p] = 0
    /\ i \notin labelled
    /\ labelled' = labelled \cup {i}
    /\ workers' = [workers EXCEPT ![p] = @ \cup {i}]
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched,
                   fireIn, age, pend, adopt>>

Finish(p, i) ==
    /\ CanAct(p)
    /\ i \in workers[p]
    /\ workers' = [workers EXCEPT ![p] = @ \ {i}]
    /\ labelled' = labelled \ {i}
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched,
                   fireIn, age, pend, adopt>>

AdoptWork(p, i) ==
    /\ CanAct(p)
    /\ i \in adopt[p]
    /\ adopt' = [adopt EXCEPT ![p] = @ \ {i}]
    /\ workers' = [workers EXCEPT ![p] = @ \cup {i}]
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched,
                   fireIn, age, pend, labelled>>

AdoptGiveBack(p, i) ==
    /\ CanAct(p)
    /\ i \in adopt[p]
    /\ adopt' = [adopt EXCEPT ![p] = @ \ {i}]
    /\ labelled' = labelled \ {i}
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched,
                   fireIn, age, pend, workers>>

Crash(p) ==
    /\ Running(p)
    /\ End(p)
    /\ pend' = [pend EXCEPT ![p].cur = FALSE]
    /\ UNCHANGED <<starts, pauses, losses, rec, labelled>>

Pause(p) ==
    /\ Running(p)
    /\ ~paused[p]
    /\ pauses < MaxPauses
    /\ paused' = [paused EXCEPT ![p] = TRUE]
    /\ pauses' = pauses + 1
    /\ UNCHANGED <<phase, starts, losses, lock, rec, fast, seen, watched, fireIn, age, pend,
                   workers, labelled, adopt>>

(* A resumed process's overdue timer runs before anything else it does. *)
Resume(p) ==
    /\ paused[p]
    /\ IF phase[p] = "serving" /\ StandDownTimer /\ age[p] >= StandDown
         THEN /\ End(p)
              /\ pend' = [pend EXCEPT ![p].cur = FALSE]
         ELSE /\ paused' = [paused EXCEPT ![p] = FALSE]
              /\ UNCHANGED <<phase, workers, adopt, fast, seen, watched, fireIn, age, lock, pend>>
    /\ UNCHANGED <<starts, pauses, losses, rec, labelled>>

(* The state branch is lost or reset, and the record with it. *)
LoseRecord ==
    /\ losses < MaxLosses
    /\ rec # NoRec
    /\ rec' = NoRec
    /\ losses' = losses + 1
    /\ seen' = SeenNow
    /\ pend' = [q \in Procs |-> IF pend[q] = NoPend THEN NoPend ELSE [pend[q] EXCEPT !.ok = FALSE]]
    /\ UNCHANGED <<phase, starts, paused, pauses, lock, fast, watched, fireIn, age,
                   workers, labelled, adopt>>

(* A tick waits for every due firing of a running, unpaused process. Time passes
   for paused processes too, and for writes in flight. *)
Tick ==
    /\ \A p \in Procs : Timed(p) => fireIn[p] > 0
    /\ fireIn' = [p \in Procs |-> IF Running(p) /\ fireIn[p] > 0 THEN fireIn[p] - 1 ELSE fireIn[p]]
    /\ watched' = [p \in Procs |-> IF phase[p] = "watching" THEN Up(watched[p], Watch) ELSE watched[p]]
    /\ age' = [p \in Procs |-> IF phase[p] = "serving" THEN Up(age[p], StandDown) ELSE age[p]]
    /\ pend' = [p \in Procs |-> IF pend[p] = NoPend THEN NoPend
                                ELSE [pend[p] EXCEPT !.age = Up(@, StandDown)]]
    /\ cycleIn' = [p \in Procs |-> IF cycleIn[p] > 0 THEN cycleIn[p] - 1 ELSE 0]
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, workers,
                   labelled, adopt>>

(* A cycle ends, and the process's next one claims after its poll interval. *)
CycleEnd(p) ==
    /\ CanAct(p)
    /\ cycleIn[p] = 0
    /\ cycleIn' = [cycleIn EXCEPT ![p] = PollOf[p]]
    /\ UNCHANGED <<phase, starts, paused, pauses, losses, lock, rec, fast, seen, watched,
                   fireIn, age, pend, workers, labelled, adopt>>

Next ==
    \/ Tick
    \/ \E p \in Procs : CycleEnd(p)
    \/ /\ UNCHANGED cycleIn
       /\ \/ LoseRecord
          \/ \E p \in Procs :
               \/ Start(p) \/ WatchFire(p) \/ TakeTimeout(p) \/ ServeFire(p)
               \/ Land(p) \/ Drop(p) \/ Crash(p) \/ Pause(p) \/ Resume(p)
               \/ \E i \in Items : Claim(p, i) \/ Finish(p, i) \/ AdoptWork(p, i) \/ AdoptGiveBack(p, i)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
    /\ phase \in [Procs -> {"down", "watching", "taking", "serving"}]
    /\ \A p \in Procs : workers[p] \subseteq Items /\ adopt[p] \subseteq Items
    /\ labelled \subseteq Items
    /\ \A d \in Dirs : lock[d] \in Procs \cup {"free"}
    /\ \A p \in Procs : age[p] \in 0..StandDown /\ watched[p] \in 0..Watch /\ fireIn[p] \in 0..WritePeriod
    /\ \A p \in Procs : cycleIn[p] \in 0..PollOf[p]

(* Proves role-process, "One process serves a role at a time": at no moment do two
   processes work the role's items, counting a process that may claim, publish or
   post, and one whose workers are running. *)
OneProcessWorks ==
    \A p, q \in Procs : p # q => ~(Working(p) /\ Working(q))

(* Proves role-process, "A process that takes over adopts or gives back every claim
   of its role": every item carrying the role's `igor:<role>` label is one the serving
   process works or has still to adopt or give back. *)
EveryClaimAccountedFor ==
    \A p \in Procs : CanAct(p) => labelled \subseteq workers[p] \cup adopt[p]

=============================================================================
