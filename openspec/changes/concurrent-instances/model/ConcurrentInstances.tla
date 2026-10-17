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
(* A process judges a sibling gone only once it has itself watched the    *)
(* sibling's heartbeat fail to move forward for three of its polls. So    *)
(* what the model tracks per pair of ranks is that count, `watch`, which  *)
(* a heartbeat write resets and each poll interval advances. A lost or    *)
(* rolled-back state branch moves no heartbeat forward, so it changes no  *)
(* count: in this model it changes only the marks.                        *)
(*                                                                         *)
(* Time is counted in poll intervals and held as counts capped at the     *)
(* abandonment bound, so time runs forever in a finite state space.       *)
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
(* Each amendment the change adopted after the model's first findings is  *)
(* a constant, TRUE in the change as specified. Setting one FALSE shows   *)
(* that amendment is needed: the configurations under negative/ do that.  *)
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
    Bound,             \* polls without a heartbeat moving forward before a
                       \* watcher judges the rank gone: 3
    MaxCrashes,        \* crashes allowed in one behaviour
    MaxLosses,         \* losses, resets or rollbacks of the state branch
    MaxStops,          \* stops people may say
    MaxMisses,         \* poll intervals in which a running process fails to
                       \* write its heartbeat, summed over processes
    \* The amendments. Each is TRUE in the change as specified.
    WatchAdvance,      \* a process judges a sibling gone by watching its
                       \* heartbeat fail to move forward; FALSE: by the age of
                       \* the file, which a rollback makes old
    ReReadHeartbeats,  \* heartbeats are read again before choosing a candidate
                       \* and before verifying; FALSE: once a cycle
    HeartbeatFirst,    \* a started process's first heartbeat lands before its
                       \* first cycle; FALSE: at any point in its first interval
    ReleaseOnTakeover, \* a process taking over an item despite a gone rank's
                       \* claim message first releases the item; FALSE: it only
                       \* posts a message
    VerifyWithinPoll,  \* a claim is verified within one poll interval of its
                       \* message; FALSE: the settle wait may outlast intervals
    LoserKeepsLabel,   \* a process that loses to its own role leaves the label;
                       \* FALSE: it removes it
    MarkAfterAttempts, \* a cycle appends its mark after attempting every
                       \* candidate; FALSE: as soon as triage ends
    LabelSweep,        \* every labelled item is a candidate, whatever the
                       \* mark; FALSE: only items updated after the mark
    StandDownOnMisses  \* a process that has failed to write its heartbeat for
                       \* two intervals starts nothing and halts its worker;
                       \* FALSE: it carries on

Ranks == 1..NRanks
Items == 1..NItems

NoMark  == -1   \* a rank with no line in the discovery log

VARIABLES
    \* processes
    up,        \* up[r]: rank r's process is running
    pc,        \* pc[r]: where rank r is in its cycle
    seen,      \* seen[r]: the counts r read at the start of its cycle
    watch,     \* watch[r][q]: polls since r last saw q's heartbeat move forward,
               \* or since r started watching; capped at Bound
    cand,      \* cand[r]: the items r still means to attempt this cycle, in its order
    cur,       \* cur[r]: the item r is claiming or working, 0 for none
    polled,    \* polled[r]: a poll interval has passed since r's cycle began
    markPend,  \* markPend[r]: the mark r's cycle will append, NoMark for none
    markReady, \* markReady[r]: r's cycle has reached the point of appending it
    beat,      \* beat[r]: r has written its heartbeat in this interval
    missed,    \* missed[r]: intervals since r last wrote its heartbeat, capped
    \* state branch
    hbAge,     \* hbAge[q]: age of q's heartbeat file, read only when ~WatchAdvance
    mark,      \* mark[q]: rank q's latest mark in the discovery log, or NoMark
    \* tracker
    label,     \* label[i]: the role's label is on item i
    msgs,      \* msgs[i]: ranks of claim messages since i's latest release, in storage order
    upd,       \* upd[i]: item i's update time
    stop,      \* stop[i]: a person has said stop on item i
    done,      \* done[i]: a run finished item i and its artifact is in place
    clk,       \* the tracker's clock, advanced by every tracker write
    \* bounds on the environment
    crashes, losses, stops, misses,
    \* ghost, read only by LiveRankNeverGone
    wrote      \* wrote[q]: q has written its heartbeat since it last started

procVars    == <<up, pc, seen, watch, cand, cur, polled, markPend, markReady,
                 beat, missed>>
branchVars  == <<hbAge, mark>>
trackerVars == <<label, msgs, upd, stop, done, clk>>
envVars     == <<crashes, losses, stops, misses>>
vars        == <<procVars, branchVars, trackerVars, envVars, wrote>>

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

\* What r would read now: its own watch counts, or under ~WatchAdvance the
\* ages of the files.
Fresh(r) == IF WatchAdvance THEN watch[r]
            ELSE [q \in Ranks |-> IF q = r THEN 0 ELSE hbAge[q]]

\* What r decides by: a fresh read, or the read at the start of its cycle.
View(r) == IF ReReadHeartbeats THEN Fresh(r) ELSE seen[r]

\* Rank q is gone to r: undeclared, or past the bound. A process never counts
\* itself gone.
Gone(r, q) == q # r /\ (q \notin Roster \/ View(r)[q] >= Bound)

\* A process that has failed to write its heartbeat for two intervals stands
\* down.
StoodDown(r) == StandDownOnMisses /\ missed[r] >= 2

\* The rank whose claim message holds item i in r's view: the earliest
\* message since the latest release whose rank is not gone; 0 if none.
Holder(r, i) ==
    LET ks == {k \in 1..Len(msgs[i]) : ~Gone(r, msgs[i][k])}
    IN  IF ks = {} THEN 0 ELSE msgs[i][Min(ks)]

\* The mark discovery uses for r: the lowest latest mark among ranks not
\* gone; with none of those, the lowest of every rank's latest; with no line
\* at all, a cold start that sees every item.
ReplayMark(r) ==
    LET has == {q \in Ranks : mark[q] # NoMark}
        cnt == {q \in has : ~Gone(r, q)}
    IN  IF cnt # {} THEN Min({mark[q] : q \in cnt})
        ELSE IF has # {} THEN Min({mark[q] : q \in has})
        ELSE 0

Worked(i) == \E r \in Ranks : up[r] /\ pc[r] = "work" /\ cur[r] = i
Busy(r) == pc[r] \in {"post", "verify", "work"}

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
    /\ watch = [r \in Ranks |-> [q \in Ranks |-> 0]]
    /\ cand = [r \in Ranks |-> <<>>]
    /\ cur = [r \in Ranks |-> 0]
    /\ polled = [r \in Ranks |-> FALSE]
    /\ markPend = [r \in Ranks |-> NoMark]
    /\ markReady = [r \in Ranks |-> FALSE]
    /\ beat = [r \in Ranks |-> TRUE]
    /\ missed = [r \in Ranks |-> 0]
    /\ hbAge = [q \in Ranks |-> 0]
    /\ mark = [q \in Ranks |-> NoMark]
    /\ label = [i \in Items |-> FALSE]
    /\ msgs = [i \in Items |-> <<>>]
    /\ upd = [i \in Items |-> i]
    /\ stop = [i \in Items |-> FALSE]
    /\ done = [i \in Items |-> FALSE]
    /\ clk = NItems
    /\ crashes = 0 /\ losses = 0 /\ stops = 0 /\ misses = 0
    /\ wrote = [q \in Ranks |-> TRUE]

-----------------------------------------------------------------------------
(* A process's cycle *)

\* The cycle begins: read the heartbeat files, then discover. Every item
\* updated after the replayed mark is a candidate, and so under LabelSweep is
\* every labelled item; triage is taken to say proceed for each one not
\* done. The cycle's mark is the newest update time among the items updated
\* after the replayed mark.
Begin(r) ==
    /\ up[r] /\ pc[r] = "read"
    /\ HeartbeatFirst => wrote[r]
    /\ LET M    == ReplayMark(r)
           Seen == {i \in Items : upd[i] > M}
       IN  /\ cand' = [cand EXCEPT ![r] =
                        Order(r, {i \in Seen \cup {j \in Items : LabelSweep /\ label[j]} :
                                     ~done[i]})]
           /\ IF Seen # {}
                THEN /\ markPend' = [markPend EXCEPT ![r] = Max({upd[i] : i \in Seen})]
                     /\ markReady' = [markReady EXCEPT ![r] = ~MarkAfterAttempts]
                ELSE UNCHANGED <<markPend, markReady>>
    /\ seen' = IF ReReadHeartbeats THEN seen ELSE [seen EXCEPT ![r] = Fresh(r)]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, watch, cur, polled, beat, missed, branchVars,
                   trackerVars, envVars, wrote>>

\* Pass over candidates that need no write, then act on the next one. A
\* cycle with no candidate left is over, and its mark may be appended. A
\* process that has stood down starts nothing, and its cycle's mark is held
\* below the oldest candidate it did not attempt.
Choose(r) ==
    /\ up[r] /\ pc[r] = "choose"
    /\ LET s == SkipPassed(r, cand[r]) IN
       IF StoodDown(r)
         THEN /\ pc' = [pc EXCEPT ![r] = "idle"]
              /\ cand' = [cand EXCEPT ![r] = <<>>]
              /\ IF markPend[r] = NoMark \/ markReady[r]
                   THEN UNCHANGED <<markPend, markReady>>
                   ELSE /\ markPend' = [markPend EXCEPT ![r] =
                                          Min({markPend[r]} \cup
                                              {upd[i] - 1 : i \in Range(cand[r])})]
                        /\ markReady' = [markReady EXCEPT ![r] = TRUE]
              /\ UNCHANGED <<cur, trackerVars>>
       ELSE IF s = <<>>
         THEN /\ pc' = [pc EXCEPT ![r] = "idle"]
              /\ cand' = [cand EXCEPT ![r] = <<>>]
              /\ markReady' = IF markPend[r] # NoMark
                                THEN [markReady EXCEPT ![r] = TRUE] ELSE markReady
              /\ UNCHANGED <<cur, markPend, trackerVars>>
         ELSE
         LET i == Head(s)
             h == Holder(r, i)
             overGone == \E k \in 1..Len(msgs[i]) : Gone(r, msgs[i][k])
         IN
         /\ cand' = [cand EXCEPT ![r] = Tail(s)]
         /\ UNCHANGED <<markPend, markReady>>
         /\ IF stop[i]
              \* Stopped, and labelled by this rank's predecessor or by a rank
              \* that is gone: Passed has skipped every other stopped item. A
              \* stop releases the claim.
              THEN /\ Release(i) /\ UNCHANGED <<stop, done>>
                   /\ UNCHANGED <<cur, pc>>
            ELSE IF label[i] /\ h = r /\ ~(ReleaseOnTakeover /\ overGone)
              \* Its own rank's claim: the predecessor died. Work it again.
              \* Under ReleaseOnTakeover, only when no gone rank's message is
              \* on the item; otherwise the next branch takes it over.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "work"]
                   /\ UNCHANGED trackerVars
            ELSE IF label[i]
              \* Labelled, and held by no live rank, or held by this rank only
              \* because a gone rank's earlier message is left out: take it over by
              \* posting a claim message. Under ReleaseOnTakeover it first
              \* removes the label and adds it again, modelled as one step:
              \* the label stays on, and every earlier message falls before
              \* the new release.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "post"]
                   /\ IF ReleaseOnTakeover
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
    /\ UNCHANGED <<up, seen, watch, polled, beat, missed, branchVars, envVars,
                   wrote>>

\* Post the claim message, carrying this rank.
Post(r) ==
    /\ up[r] /\ pc[r] = "post"
    /\ msgs' = [msgs EXCEPT ![cur[r]] = Append(msgs[cur[r]], r)]
    /\ Touch(cur[r])
    /\ pc' = [pc EXCEPT ![r] = "verify"]
    /\ UNCHANGED <<up, seen, watch, cand, cur, polled, markPend, markReady,
                   beat, missed, label, stop, done, branchVars, envVars, wrote>>

\* Re-read the item after the settle interval. A process that has stood down
\* stands down from the claim too, leaving its message.
Verify(r) ==
    /\ up[r] /\ pc[r] = "verify"
    /\ LET i == cur[r] IN
       IF stop[i]
         THEN /\ Release(i) /\ UNCHANGED <<stop, done>>
              /\ cur' = [cur EXCEPT ![r] = 0]
              /\ pc' = [pc EXCEPT ![r] = "choose"]
       ELSE IF label[i] /\ Holder(r, i) = r /\ ~StoodDown(r)
         THEN /\ pc' = [pc EXCEPT ![r] = "work"]
              /\ UNCHANGED <<cur, trackerVars>>
       ELSE /\ cur' = [cur EXCEPT ![r] = 0]
            /\ pc' = [pc EXCEPT ![r] = "choose"]
            /\ IF ~LoserKeepsLabel /\ label[i] /\ ~StoodDown(r)
                 THEN Release(i) /\ UNCHANGED <<stop, done>>
                 ELSE UNCHANGED trackerVars
    /\ UNCHANGED <<up, seen, watch, cand, polled, markPend, markReady, beat,
                   missed, branchVars, envVars, wrote>>

\* A checkpoint in the worker's run sees a stop: the run halts and the claim
\* is released.
Checkpoint(r) ==
    /\ up[r] /\ pc[r] = "work" /\ stop[cur[r]]
    /\ Release(cur[r]) /\ UNCHANGED <<stop, done>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, cand, polled, markPend, markReady, beat,
                   missed, branchVars, envVars, wrote>>

\* A checkpoint in the run of a process that has stood down: the worker
\* stops. The claim stays, since a process that cannot write its heartbeat
\* may not be able to write to the tracker either.
Halt(r) ==
    /\ up[r] /\ pc[r] = "work" /\ StoodDown(r) /\ ~stop[cur[r]]
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, cand, polled, markPend, markReady, beat,
                   missed, branchVars, trackerVars, envVars, wrote>>

\* The run finishes, after any number of poll intervals: its artifact is in
\* place and the claim is released.
Finish(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]]
    /\ done' = [done EXCEPT ![cur[r]] = TRUE]
    /\ Release(cur[r]) /\ UNCHANGED stop
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, cand, polled, markPend, markReady, beat,
                   missed, branchVars, envVars, wrote>>

\* The next cycle begins once a poll interval has passed.
NextCycle(r) ==
    /\ up[r] /\ pc[r] = "idle" /\ polled[r]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, seen, watch, cand, cur, markPend, markReady, beat,
                   missed, branchVars, trackerVars, envVars, wrote>>

-----------------------------------------------------------------------------
(* Writes to the state branch *)

\* The cycle's mark lands in the log: this rank's latest line.
AppendMark(r) ==
    /\ up[r] /\ markPend[r] # NoMark /\ markReady[r]
    /\ mark' = [mark EXCEPT ![r] = markPend[r]]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, pc, seen, watch, cand, cur, polled, beat, missed, hbAge,
                   trackerVars, envVars, wrote>>

\* This rank's heartbeat lands, from a timer that runs whatever the cycle is
\* doing. It moves forward, so every watcher's count for this rank restarts.
WriteHeartbeat(r) ==
    /\ up[r] /\ ~beat[r]
    /\ beat' = [beat EXCEPT ![r] = TRUE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ watch' = [x \in Ranks |-> [watch[x] EXCEPT ![r] = 0]]
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [hbAge EXCEPT ![r] = 0]
    /\ wrote' = [wrote EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady, mark,
                   trackerVars, envVars>>

-----------------------------------------------------------------------------
(* Time and the environment *)

\* One poll interval passes. A running process whose heartbeat has not
\* landed in the interval that is ending has missed one, which MaxMisses
\* bounds. A process that has stood down has halted any claim or run before
\* the interval ends: its next checkpoint comes within the interval. Under
\* VerifyWithinPoll no claim is still between its message and its
\* verification, which is how the model makes verification come within one
\* poll interval of the message.
Tick ==
    /\ LET M == {r \in Ranks : up[r] /\ ~beat[r]}
       IN  /\ misses + Cardinality(M) <= MaxMisses
           /\ misses' = misses + Cardinality(M)
    /\ \A r \in Ranks : (up[r] /\ StoodDown(r)) => ~Busy(r)
    /\ VerifyWithinPoll => \A r \in Ranks : up[r] => pc[r] \notin {"post", "verify"}
    /\ watch' = [r \in Ranks |-> [q \in Ranks |->
                   IF q = r THEN 0 ELSE Older(watch[r][q])]]
    /\ missed' = [r \in Ranks |-> Older(missed[r])]
    /\ hbAge' = IF WatchAdvance THEN hbAge
                ELSE [q \in Ranks |-> Older(hbAge[q])]
    /\ beat' = [r \in Ranks |-> FALSE]
    /\ polled' = [r \in Ranks |-> TRUE]
    /\ UNCHANGED <<up, pc, seen, cand, cur, markPend, markReady, mark,
                   trackerVars, crashes, losses, stops, wrote>>

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
    /\ seen' = [seen EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ crashes' = crashes + 1
    /\ wrote' = [wrote EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<watch, beat, missed, branchVars, trackerVars, losses, stops,
                   misses>>

\* The supervisor restarts it. It starts watching every sibling afresh, and
\* counts the intervals without a heartbeat of its own from its start.
Restart(r) ==
    /\ ~up[r]
    /\ up' = [up EXCEPT ![r] = TRUE]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ watch' = [watch EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ beat' = [beat EXCEPT ![r] = FALSE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ UNCHANGED <<seen, cand, cur, polled, markPend, markReady,
                   branchVars, trackerVars, envVars, wrote>>

\* The state branch is lost, reset or rolled back to an old commit. No
\* heartbeat moves forward, so no watch count changes; under ~WatchAdvance
\* every file reads as old. The log is lost, or returns to an old commit.
\* An old commit's marks are no higher than today's, so the model keeps
\* today's: the highest they could be, which is the worst case for
\* MarkNeverPassesUntaken.
LoseBranch ==
    /\ losses < MaxLosses
    /\ \/ mark' = [q \in Ranks |-> NoMark]
       \/ UNCHANGED mark
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [q \in Ranks |-> Bound]
    /\ losses' = losses + 1
    /\ UNCHANGED <<procVars, trackerVars, crashes, stops, misses, wrote>>

\* A person says stop on an item.
SayStop(i) ==
    /\ stops < MaxStops /\ ~stop[i] /\ ~done[i]
    /\ stop' = [stop EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ stops' = stops + 1
    /\ UNCHANGED <<procVars, branchVars, label, msgs, done, crashes, losses,
                   misses, wrote>>

-----------------------------------------------------------------------------
Step(r) == Begin(r) \/ Choose(r) \/ Post(r) \/ Verify(r) \/ Checkpoint(r)
           \/ Halt(r) \/ Finish(r) \/ NextCycle(r)

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
    /\ watch \in [Ranks -> [Ranks -> 0..Bound]]
    /\ missed \in [Ranks -> 0..Bound]
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
\* (work-claiming), with its scenarios "The bound does not shorten a run",
\* "A lost state branch takes no live rank's claim" and "A rolled-back
\* state branch takes no live rank's claim".
\* A live rank's claim is never taken: no other running process judges gone
\* a running rank that has written its heartbeat since it started and has
\* not stood down. A process still at "read" has not yet read the heartbeat
\* files this cycle, so under ~ReReadHeartbeats its view is the last
\* cycle's; it is checked once it has begun.
LiveRankNeverGone ==
    \A q, r \in Ranks :
        (q # r /\ up[r] /\ pc[r] # "read" /\ up[q] /\ wrote[q] /\ ~StoodDown(q))
            => ~Gone(r, q)

\* Requirement: "Processes saving one source keep the lower watermark"
\* (work-discovery).
\* The replayed mark never passes an item no live process has taken: such
\* an item is still among some live process's candidates this cycle, or is
\* above the mark some live process would replay now. Only processes that
\* have begun their cycle replay a mark, so the check waits until at least
\* one live process has (Settled).
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
\* "A retired rank does not hold its items forever" (work-claiming), and
\* "Every cycle considers the items its role's label holds" (work-discovery).
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
