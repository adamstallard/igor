------------------------- MODULE ConcurrentInstances -------------------------
(***************************************************************************)
(* Several processes of one Igor role, each with a rank, running cycles   *)
(* against a shared tracker and a shared state branch, as the OpenSpec    *)
(* change `concurrent-instances` specifies them.                          *)
(*                                                                         *)
(* The tracker holds, per item: the role's `igor:<role>` label; the ranks *)
(* of the claim messages posted since the item's latest release, in       *)
(* storage order; whether a person has said stop; whether a run finished  *)
(* it; and its update time.                                               *)
(*                                                                         *)
(* The state branch holds one heartbeat file per rank, and the replayed   *)
(* `discovery.json` log reduced to what the replay reads: each rank's     *)
(* latest mark for the one source.                                        *)
(*                                                                         *)
(* Time is counted in poll intervals and held as ages capped at the       *)
(* abandonment bound, so time runs forever in a finite state space. Tick  *)
(* advances it one interval, and only once every running process has      *)
(* rewritten its heartbeat in the interval that is ending: the change     *)
(* states that a live rank rewrites its file within one poll interval.    *)
(*                                                                         *)
(* Update times and marks are values of one counter, `clk`, which every   *)
(* tracker write advances. Only their order matters.                      *)
(*                                                                         *)
(* A write to the state branch that conflicts is retried until it lands,  *)
(* and the retry re-reads and re-appends, so it lands the same line. The  *)
(* model therefore treats a conflict as a delay between deciding a write  *)
(* and its landing, during which anything else may happen, including a    *)
(* crash that loses the write. That a retry discards nothing is assumed,  *)
(* as "A conflicted state write discards nothing" requires, not proved.   *)
(*                                                                         *)
(* Where the change is silent on a choice the model must make, a constant *)
(* selects it. The weaker choice is the one the change permits; the       *)
(* stronger one is what the change would have to add.                     *)
(*                                                                         *)
(* Not modelled: the roster changing (Roster is constant), `deferred.json` *)
(* (no requirement here reads it for safety), the settle interval's       *)
(* length (claims are visible at once, and the rank-proportional wait is  *)
(* not assumed to order anything), a go-ahead or cooldown after a stop (a *)
(* stop here is permanent), and two processes at one rank (which the      *)
(* change makes the operator's job to prevent, and declares unhandled).   *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    NRanks,            \* ranks 1..NRanks
    NItems,            \* items 1..NItems, in the source's search order
    Roster,            \* the declared ranks, a subset of 1..NRanks
    Bound,             \* missed heartbeats that make a rank gone: 3
    MaxCrashes,        \* crashes allowed in one behaviour
    MaxLosses,         \* losses or resets of the state branch
    MaxStops,          \* stops people may say
    \* Choices the change leaves open. Except for VerdictAtRead, each comment
    \* gives the weaker choice first.
    VerdictAtRead,     \* Two readings of the change's once-a-cycle heartbeat
                       \* read, neither weaker; ignored when FreshView is TRUE.
                       \* FALSE: a rank's age read at the start of a cycle is
                       \* counted forward to each later decision in the cycle;
                       \* TRUE: it stays as it was when read
    FreshView,         \* FALSE: heartbeats are read once a cycle, as the change
                       \* says; TRUE: re-read before every claim decision
    HeartbeatFirst,    \* FALSE: a started process's first heartbeat may land at
                       \* any point in its first poll interval; TRUE: it lands
                       \* before the process's first cycle
    MarkAtTriage,      \* TRUE: a cycle writes its mark as soon as triage ends,
                       \* before any claim; FALSE: only after it has attempted
                       \* every candidate
    LoserRemovesLabel, \* TRUE: a process that loses verification removes the
                       \* role's label, as the in-force scenario "Losing Igor
                       \* removes itself from a list" reads; FALSE: it leaves it
    AdoptReleases,     \* FALSE: taking an item over a gone rank's claim message
                       \* only posts a message; TRUE: it first releases the
                       \* item, so the gone rank's message falls before the
                       \* latest release and cannot count again
    SettleWithinPoll,  \* FALSE: a claim's settle wait may outlast poll
                       \* intervals; TRUE: a claim is posted and verified within
                       \* one poll interval
    LabelSweep,        \* FALSE: a cycle's candidates are the items updated
                       \* after the replayed mark; TRUE: every item carrying
                       \* the role's label is a candidate too, whatever the mark
    BranchRollback     \* TRUE: a reset may roll the state branch back to an
                       \* old commit, leaving every heartbeat file present but
                       \* older than the bound; FALSE: a reset deletes them

Ranks == 1..NRanks
Items == 1..NItems

Missing == -2   \* a heartbeat file that is not on the branch
NoTime  == -3   \* nothing noticed missing, in a process's memory
NoMark  == -1   \* a rank with no line in the discovery log

VARIABLES
    \* processes
    up,        \* up[r]: rank r's process is running
    pc,        \* pc[r]: where rank r is in its cycle
    seen,      \* seen[r][q]: age of q's last-seen time, as r read it this cycle
    mem,       \* mem[r][q]: age of when r first noticed q's file missing; memory only
    cand,      \* cand[r]: the items r still means to attempt this cycle, in its order
    cur,       \* cur[r]: the item r is claiming or working, 0 for none
    polled,    \* polled[r]: a poll interval has passed since r's cycle began
    markPend,  \* markPend[r]: the mark r's cycle will append, NoMark for none
    markReady, \* markReady[r]: r's cycle has reached the point of appending it
    \* state branch
    hb,        \* hb[q]: age of rank q's heartbeat file, or Missing
    mark,      \* mark[q]: rank q's latest mark in the discovery log, or NoMark
    \* tracker
    label,     \* label[i]: the role's label is on item i
    msgs,      \* msgs[i]: ranks of claim messages since i's latest release, in storage order
    upd,       \* upd[i]: item i's update time
    stop,      \* stop[i]: a person has said stop on item i
    done,      \* done[i]: a run finished item i and its artifact is in place
    clk,       \* the tracker's clock, advanced by every tracker write
    \* bounds on the environment
    crashes, losses, stops,
    \* ghosts, read only by LiveRankNeverGone
    wrote,     \* wrote[q]: q has written its heartbeat since it last started
    steady     \* steady[r][q]: q was running, its heartbeat written, when r last
               \* read the heartbeat files, and has not crashed since

procVars    == <<up, pc, seen, mem, cand, cur, polled, markPend, markReady>>
branchVars  == <<hb, mark>>
trackerVars == <<label, msgs, upd, stop, done, clk>>
envVars     == <<crashes, losses, stops>>
ghostVars   == <<wrote, steady>>
vars        == <<procVars, branchVars, trackerVars, envVars, ghostVars>>

-----------------------------------------------------------------------------
(* Helpers *)

Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Range(s) == {s[k] : k \in 1..Len(s)}
Older(a) == IF a >= Bound THEN Bound ELSE a + 1

\* Rank r's order over the candidates: rank 1 starts at the first, rank 2 at
\* the second, and each goes on round the list.
Rot(r) == [k \in 1..NItems |-> ((r - 1 + k - 1) % NItems) + 1]
Order(r, C) == SelectSeq(Rot(r), LAMBDA i : i \in C)

\* The ages r would read from the branch now, given what it remembers of
\* files it noticed missing. A file missing and not yet noticed is noticed
\* now.
Ages(r, m) == [q \in Ranks |->
                 IF q = r THEN 0
                 ELSE IF hb[q] # Missing THEN hb[q]
                 ELSE IF m[q] = NoTime THEN 0 ELSE m[q]]

\* The ages r decides by: this cycle's read, or a fresh read under FreshView.
View(r) == IF FreshView THEN Ages(r, mem[r]) ELSE seen[r]

\* Rank q is gone by ages v: undeclared, or past the abandonment bound.
\* A process never counts itself gone.
GoneBy(v, r, q) == q # r /\ (q \notin Roster \/ v[q] >= Bound)
Gone(r, q) == GoneBy(View(r), r, q)

\* The rank whose claim message holds item i in r's view: the earliest
\* message since the latest release whose rank is not gone; 0 if none.
Holder(r, i) ==
    LET ks == {k \in 1..Len(msgs[i]) : ~Gone(r, msgs[i][k])}
    IN  IF ks = {} THEN 0 ELSE msgs[i][Min(ks)]

\* The mark discovery uses, by ages v: the lowest latest mark among ranks
\* not gone; with none of those, the lowest of every rank's latest; with no
\* line at all, a cold start that sees every item.
ReplayMarkBy(v, r) ==
    LET has == {q \in Ranks : mark[q] # NoMark}
        cnt == {q \in has : ~GoneBy(v, r, q)}
    IN  IF cnt # {} THEN Min({mark[q] : q \in cnt})
        ELSE IF has # {} THEN Min({mark[q] : q \in has})
        ELSE 0
ReplayMark(r) == ReplayMarkBy(View(r), r)

Worked(i) == \E r \in Ranks : up[r] /\ pc[r] = "work" /\ cur[r] = i

\* A tracker write to item i: its update time becomes the new clock.
Touch(i) == /\ clk' = clk + 1
            /\ upd' = [upd EXCEPT ![i] = clk + 1]

\* Releasing a claim takes the label off, which is the item's latest
\* release, so no earlier claim message counts any more.
Release(i) == /\ label' = [label EXCEPT ![i] = FALSE]
              /\ msgs' = [msgs EXCEPT ![i] = <<>>]
              /\ Touch(i)

\* A candidate r passes over without writing anything: finished, held by a
\* rank that is not gone, or stopped with nobody's label on it.
Passed(r, i) == done[i] \/ (label[i] /\ Holder(r, i) \notin {0, r})
                        \/ (stop[i] /\ ~label[i])

RECURSIVE SkipPassed(_, _)
SkipPassed(r, s) == IF s = <<>> THEN s
                    ELSE IF Passed(r, Head(s)) THEN SkipPassed(r, Tail(s))
                    ELSE s

-----------------------------------------------------------------------------
Init ==
    /\ up = [r \in Ranks |-> TRUE]
    /\ pc = [r \in Ranks |-> "read"]
    /\ seen = [r \in Ranks |-> [q \in Ranks |-> 0]]
    /\ mem = [r \in Ranks |-> [q \in Ranks |-> NoTime]]
    /\ cand = [r \in Ranks |-> <<>>]
    /\ cur = [r \in Ranks |-> 0]
    /\ polled = [r \in Ranks |-> FALSE]
    /\ markPend = [r \in Ranks |-> NoMark]
    /\ markReady = [r \in Ranks |-> FALSE]
    /\ hb = [q \in Ranks |-> 0]
    /\ mark = [q \in Ranks |-> NoMark]
    /\ label = [i \in Items |-> FALSE]
    /\ msgs = [i \in Items |-> <<>>]
    /\ upd = [i \in Items |-> i]
    /\ stop = [i \in Items |-> FALSE]
    /\ done = [i \in Items |-> FALSE]
    /\ clk = NItems
    /\ crashes = 0 /\ losses = 0 /\ stops = 0
    /\ wrote = [q \in Ranks |-> TRUE]
    /\ steady = [r \in Ranks |-> [q \in Ranks |-> FALSE]]

-----------------------------------------------------------------------------
(* A process's cycle *)

\* The cycle begins: read the role's heartbeat files, then discover. A
\* missing file's last-seen time is when this process first noticed it
\* missing. Every item updated after the replayed mark is a candidate, and
\* so under LabelSweep is every labelled item; triage is taken to say
\* proceed for each one not done. The cycle's mark is the newest update
\* time among the items updated after the replayed mark.
Begin(r) ==
    /\ up[r] /\ pc[r] = "read"
    /\ HeartbeatFirst => wrote[r]
    /\ LET m    == [q \in Ranks |->
                      IF q = r \/ hb[q] # Missing THEN NoTime
                      ELSE IF mem[r][q] = NoTime THEN 0 ELSE mem[r][q]]
           v    == Ages(r, m)
           M    == ReplayMarkBy(v, r)
           Seen == {i \in Items : upd[i] > M}
       IN  /\ mem' = [mem EXCEPT ![r] = m]
           /\ seen' = IF FreshView THEN seen ELSE [seen EXCEPT ![r] = v]
           /\ cand' = [cand EXCEPT ![r] =
                        Order(r, {i \in Seen \cup {j \in Items : LabelSweep /\ label[j]} :
                                     ~done[i]})]
           /\ IF Seen # {}
                THEN /\ markPend' = [markPend EXCEPT ![r] = Max({upd[i] : i \in Seen})]
                     /\ markReady' = [markReady EXCEPT ![r] = MarkAtTriage]
                ELSE UNCHANGED <<markPend, markReady>>
    /\ steady' = [steady EXCEPT ![r] = [q \in Ranks |-> up[q] /\ wrote[q]]]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, cur, polled, branchVars, trackerVars, envVars, wrote>>

\* Pass over candidates that need no write, then act on the next one. A
\* cycle with no candidate left is over, and its mark may be appended.
Choose(r) ==
    /\ up[r] /\ pc[r] = "choose"
    /\ LET s == SkipPassed(r, cand[r]) IN
       IF s = <<>>
         THEN /\ pc' = [pc EXCEPT ![r] = "idle"]
              /\ cand' = [cand EXCEPT ![r] = <<>>]
              /\ markReady' = IF markPend[r] # NoMark
                                THEN [markReady EXCEPT ![r] = TRUE] ELSE markReady
              /\ UNCHANGED <<cur, trackerVars>>
         ELSE
         LET i == Head(s)
             h == Holder(r, i)
             overGone == \E k \in 1..Len(msgs[i]) : Gone(r, msgs[i][k])
         IN
         /\ cand' = [cand EXCEPT ![r] = Tail(s)]
         /\ UNCHANGED markReady
         /\ IF stop[i]
              \* Stopped, and labelled by this rank's predecessor or by a rank
              \* that is gone: a stop releases the claim.
              THEN /\ Release(i) /\ UNCHANGED <<stop, done>>
                   /\ UNCHANGED <<cur, pc>>
            ELSE IF label[i] /\ h = r /\ ~(AdoptReleases /\ overGone)
              \* Its own rank's claim: the predecessor died. Work it again.
              \* Under AdoptReleases, only when no gone rank's message is on
              \* the item; otherwise the next branch adopts it.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "work"]
                   /\ UNCHANGED trackerVars
            ELSE IF label[i]
              \* Labelled, and held by no rank that is not gone, or held by
              \* this rank over a gone rank's message: adopt it by posting a
              \* claim message. Under AdoptReleases it first removes the label
              \* and adds it again, modelled as one step: the label stays on,
              \* and every earlier message falls before the new release.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "post"]
                   /\ IF AdoptReleases
                        THEN /\ msgs' = [msgs EXCEPT ![i] = <<>>]
                             /\ Touch(i)
                             /\ UNCHANGED <<label, stop, done>>
                        ELSE UNCHANGED trackerVars
            ELSE
              \* Unclaimed: the label first, the message after.
              /\ cur' = [cur EXCEPT ![r] = i]
              /\ pc' = [pc EXCEPT ![r] = "post"]
              /\ label' = [label EXCEPT ![i] = TRUE]
              /\ Touch(i)
              /\ UNCHANGED <<msgs, stop, done>>
    /\ UNCHANGED <<up, seen, mem, polled, markPend, branchVars, envVars,
                   ghostVars>>

\* Post the claim message, carrying this rank.
Post(r) ==
    /\ up[r] /\ pc[r] = "post"
    /\ msgs' = [msgs EXCEPT ![cur[r]] = Append(msgs[cur[r]], r)]
    /\ Touch(cur[r])
    /\ pc' = [pc EXCEPT ![r] = "verify"]
    /\ UNCHANGED <<up, seen, mem, cand, cur, polled, markPend, markReady,
                   label, stop, done, branchVars, envVars, ghostVars>>

\* Re-read the item after the settle interval.
Verify(r) ==
    /\ up[r] /\ pc[r] = "verify"
    /\ LET i == cur[r] IN
       IF stop[i]
         THEN /\ Release(i) /\ UNCHANGED <<stop, done>>
              /\ cur' = [cur EXCEPT ![r] = 0]
              /\ pc' = [pc EXCEPT ![r] = "choose"]
       ELSE IF label[i] /\ Holder(r, i) = r
         THEN /\ pc' = [pc EXCEPT ![r] = "work"]
              /\ UNCHANGED <<cur, trackerVars>>
       ELSE /\ cur' = [cur EXCEPT ![r] = 0]
            /\ pc' = [pc EXCEPT ![r] = "choose"]
            /\ IF LoserRemovesLabel /\ label[i]
                 THEN Release(i) /\ UNCHANGED <<stop, done>>
                 ELSE UNCHANGED trackerVars
    /\ UNCHANGED <<up, seen, mem, cand, polled, markPend, markReady,
                   branchVars, envVars, ghostVars>>

\* A checkpoint in the worker's run sees a stop: the run halts and the claim
\* is released.
Checkpoint(r) ==
    /\ up[r] /\ pc[r] = "work" /\ stop[cur[r]]
    /\ Release(cur[r]) /\ UNCHANGED <<stop, done>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, mem, cand, polled, markPend, markReady,
                   branchVars, envVars, ghostVars>>

\* The run finishes, after any number of poll intervals: its artifact is in
\* place and the claim is released.
Finish(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]]
    /\ done' = [done EXCEPT ![cur[r]] = TRUE]
    /\ Release(cur[r]) /\ UNCHANGED stop
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, mem, cand, polled, markPend, markReady,
                   branchVars, envVars, ghostVars>>

\* The next cycle begins once a poll interval has passed.
NextCycle(r) ==
    /\ up[r] /\ pc[r] = "idle" /\ polled[r]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, seen, mem, cand, cur, markPend, markReady,
                   branchVars, trackerVars, envVars, ghostVars>>

-----------------------------------------------------------------------------
(* Writes to the state branch *)

\* The cycle's mark lands in the log: this rank's latest line.
AppendMark(r) ==
    /\ up[r] /\ markPend[r] # NoMark /\ markReady[r]
    /\ mark' = [mark EXCEPT ![r] = markPend[r]]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, pc, seen, mem, cand, cur, polled, hb, trackerVars,
                   envVars, ghostVars>>

\* This rank's heartbeat file is overwritten, from a timer that runs
\* whatever the cycle is doing.
WriteHeartbeat(r) ==
    /\ up[r] /\ hb[r] # 0
    /\ hb' = [hb EXCEPT ![r] = 0]
    /\ wrote' = [wrote EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<procVars, mark, trackerVars, envVars, steady>>

-----------------------------------------------------------------------------
(* Time and the environment *)

\* One poll interval passes. Every running process has rewritten its
\* heartbeat in the interval that is ending, and under SettleWithinPoll no
\* claim is still between its message and its verification.
Tick ==
    /\ \A r \in Ranks : up[r] => hb[r] = 0
    /\ SettleWithinPoll => \A r \in Ranks : up[r] => pc[r] \notin {"post", "verify"}
    /\ hb' = [q \in Ranks |-> IF hb[q] = Missing THEN Missing ELSE Older(hb[q])]
    /\ seen' = IF VerdictAtRead \/ FreshView THEN seen
               ELSE [r \in Ranks |-> [q \in Ranks |->
                      IF q = r THEN 0 ELSE Older(seen[r][q])]]
    /\ mem' = [r \in Ranks |-> [q \in Ranks |->
                 IF mem[r][q] = NoTime THEN NoTime ELSE Older(mem[r][q])]]
    /\ polled' = [r \in Ranks |-> TRUE]
    /\ UNCHANGED <<up, pc, cand, cur, markPend, markReady, mark,
                   trackerVars, envVars, ghostVars>>

\* A process crashes, at any point and between any two writes. Its worker
\* dies with it, and so does everything it held in memory.
Crash(r) ==
    /\ up[r] /\ crashes < MaxCrashes
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "down"]
    /\ cand' = [cand EXCEPT ![r] = <<>>]
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ mem' = [mem EXCEPT ![r] = [q \in Ranks |-> NoTime]]
    /\ seen' = [seen EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ crashes' = crashes + 1
    /\ wrote' = [wrote EXCEPT ![r] = FALSE]
    /\ steady' = [x \in Ranks |-> [steady[x] EXCEPT ![r] = FALSE]]
    /\ UNCHANGED <<branchVars, trackerVars, losses, stops>>

\* The supervisor restarts it.
Restart(r) ==
    /\ ~up[r]
    /\ up' = [up EXCEPT ![r] = TRUE]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ UNCHANGED <<seen, mem, cand, cur, polled, markPend, markReady,
                   branchVars, trackerVars, envVars, ghostVars>>

\* The state branch is lost, or reset: every heartbeat and log line goes,
\* or under BranchRollback the branch returns to an old commit whose
\* heartbeat files are all older than the bound.
LoseBranch ==
    /\ losses < MaxLosses
    /\ \/ /\ hb' = [q \in Ranks |-> Missing]
          /\ mark' = [q \in Ranks |-> NoMark]
       \/ /\ BranchRollback
          /\ hb' = [q \in Ranks |-> Bound]
          /\ UNCHANGED mark
    /\ losses' = losses + 1
    /\ UNCHANGED <<procVars, trackerVars, crashes, stops, ghostVars>>

\* A person says stop on an item.
SayStop(i) ==
    /\ stops < MaxStops /\ ~stop[i] /\ ~done[i]
    /\ stop' = [stop EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ stops' = stops + 1
    /\ UNCHANGED <<procVars, branchVars, label, msgs, done, crashes, losses,
                   ghostVars>>

-----------------------------------------------------------------------------
Step(r) == Begin(r) \/ Choose(r) \/ Post(r) \/ Verify(r) \/ Checkpoint(r)
           \/ Finish(r) \/ NextCycle(r)

Next ==
    \/ \E r \in Ranks : Step(r) \/ AppendMark(r) \/ WriteHeartbeat(r)
                        \/ Crash(r) \/ Restart(r)
    \/ Tick
    \/ LoseBranch
    \/ \E i \in Items : SayStop(i)

\* Running processes make progress, their writes land, workers finish, and
\* time passes. Nothing obliges a crashed process to restart, or a person
\* to say anything.
Fairness ==
    /\ \A r \in Ranks : WF_vars(Step(r)) /\ WF_vars(AppendMark(r))
                        /\ WF_vars(WriteHeartbeat(r))
    /\ WF_vars(Tick)

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Invariants. Each names, by its exact title, the requirement it proves. *)

TypeOK ==
    /\ up \in [Ranks -> BOOLEAN]
    /\ pc \in [Ranks -> {"down", "read", "choose", "post", "verify", "work",
                         "idle"}]
    /\ cur \in [Ranks -> 0..NItems]
    /\ hb \in [Ranks -> (0..Bound) \cup {Missing}]
    /\ label \in [Items -> BOOLEAN]
    /\ stop \in [Items -> BOOLEAN]
    /\ done \in [Items -> BOOLEAN]

\* Requirements: "A claim names the process that took it" and "Assignment
\* expresses a claim; ordering resolves it" (work-claiming).
\* Never two live workers on one item.
NoTwoWorkers ==
    \A i \in Items :
        Cardinality({r \in Ranks : up[r] /\ pc[r] = "work" /\ cur[r] = i}) <= 1

\* Requirement: "A retired rank does not hold its items forever"
\* (work-claiming), with its scenarios "The bound does not shorten a run"
\* and "A lost state branch takes no live rank's claim".
\* A live rank's claim is never taken: a rank that was running, its
\* heartbeat written, when another process read the heartbeat files, and
\* has kept running since, is not gone in that process's view. A process
\* that has not yet read the files this cycle (pc = "read") holds no view.
LiveRankNeverGone ==
    \A q, r \in Ranks :
        (q # r /\ up[r] /\ pc[r] # "read" /\ steady[r][q]) => ~Gone(r, q)

\* Requirement: "Processes saving one source keep the lower watermark"
\* (work-discovery).
\* The replayed mark never passes an item no live process has taken: such
\* an item is still among some live process's candidates this cycle, or is
\* above the mark some live process would replay now. Only processes that
\* have read the heartbeat files this cycle replay a mark, so the check
\* waits until at least one live process has (Settled).
MarkNeverPassesUntaken ==
    LET Untaken(i) == ~label[i] /\ ~done[i] /\ ~stop[i]
        Pending(i) == \E r \in Ranks : up[r] /\ (cur[r] = i \/ i \in Range(cand[r]))
        Below(i)   == \E r \in Ranks : up[r] /\ pc[r] # "read" /\ upd[i] > ReplayMark(r)
        Settled    == \E r \in Ranks : up[r] /\ pc[r] # "read"
    IN  Settled => \A i \in Items : Untaken(i) => (Pending(i) \/ Below(i))

-----------------------------------------------------------------------------
(* Liveness, in behaviours where some process is eventually always running *)

SomeUpForever == <>[](\E r \in Ranks : up[r])

\* Requirements: "A process recovers the claims of its own predecessor" and
\* "A retired rank does not hold its items forever" (work-claiming), with
\* the latter's scenario "A crashed rank is still recovered after the
\* branch is lost".
\* A crashed rank's claims are eventually recovered: a labelled item no
\* running process holds is eventually worked again or released.
OrphanRecovered ==
    SomeUpForever =>
        \A i \in Items :
            (label[i] /\ \A r \in Ranks : ~(up[r] /\ cur[r] = i))
                ~> (~label[i] \/ Worked(i))

\* Requirement: "Processes saving one source keep the lower watermark"
\* (work-discovery), with "A process recovers the claims of its own
\* predecessor" (work-claiming).
\* Every item is eventually finished or stopped.
EveryItemHandled ==
    SomeUpForever => \A i \in Items : <>(done[i] \/ stop[i])

\* Requirement: "Stop is unconditional and open to anyone" (work-claiming,
\* in force).
\* A stop is never lost: eventually no worker runs on the item and its claim
\* is released, for good.
StopNeverLost ==
    SomeUpForever =>
        \A i \in Items : stop[i] ~> [](~label[i] /\ ~Worked(i))

=============================================================================
