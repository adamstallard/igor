------------------------- MODULE ConcurrentInstances -------------------------
(***************************************************************************)
(* Several processes of one Igor role, each with a rank, running cycles   *)
(* against a shared tracker and a shared state branch, as the OpenSpec    *)
(* change `concurrent-instances` specifies them.                          *)
(*                                                                         *)
(* The tracker holds, per item: the role's `igor:<role>` label; the ranks *)
(* of the claim messages that count since the item's latest release, in   *)
(* storage order; whether the item reads as handed over by a person;      *)
(* whether a person has said stop; whether a run finished it; and its     *)
(* update time. A ghost variable also records whether a person really     *)
(* handed it over, so HandOverStands can check that the reading matches.  *)
(*                                                                         *)
(* The state branch holds one heartbeat file per rank, and the replayed   *)
(* `discovery.json` log reduced to what the replay reads: each rank's     *)
(* latest mark for the one source.                                        *)
(*                                                                         *)
(* A heartbeat file holds a counter the rank increments on each write,    *)
(* with an id the process picks when it starts. A process judges a        *)
(* sibling gone only once it has itself watched the sibling's file fail   *)
(* to change for three of its polls. So what the model tracks per pair of *)
(* ranks is that count, `watch`, which a heartbeat write resets and each  *)
(* poll interval advances. A lost state branch changes no count. A        *)
(* rolled-back one may put an older counter back, which reads as a        *)
(* change, so it may reset some counts: that only postpones a verdict.    *)
(*                                                                         *)
(* Under ~CounterLiveness a watcher instead compares the times in the     *)
(* file, counting a write only when its time is later than any it has     *)
(* read. A rank whose clock stepped back, or which restarted on a host    *)
(* whose clock is behind, then writes times that never count (`behind`).  *)
(*                                                                         *)
(* Time is counted in poll intervals and held as counts capped at the     *)
(* abandonment bound, so time runs forever in a finite state space.       *)
(* Update times and marks are values of one counter, `clk`, which every   *)
(* tracker write advances. Only their order matters.                      *)
(*                                                                         *)
(* The tracker reports times to the second, and a claim message is        *)
(* ordered against the item's latest release by its time. A message in    *)
(* the release's second does not count. The model tracks, per item,       *)
(* whether the current second is still the latest release's (`fresh`):    *)
(* a release starts it, and the next second, or a poll interval, ends it. *)
(*                                                                         *)
(* A write to the state branch that conflicts is retried until it lands,  *)
(* and the retry re-reads and re-appends, so it lands the same line. The  *)
(* model therefore treats a conflict as a delay between deciding a write  *)
(* and its landing, during which anything else may happen, including a    *)
(* crash that loses the write. That a retry discards nothing is assumed,  *)
(* as "A conflicted state write discards nothing" requires, not proved.   *)
(*                                                                         *)
(* Each rule the change adopted after the model's findings is a constant, *)
(* TRUE in the change as specified. Setting one FALSE shows that rule is  *)
(* needed: the configurations under negative/ do that.                    *)
(*                                                                         *)
(* Pull requests are modelled only as far as a catch-up needs: a run may  *)
(* open the Igor's pull request before it finishes (`pr`), so a crash     *)
(* between the two leaves a claim on an item whose pull request is open.  *)
(* Whoever takes that claim brings the pull request up to date rather     *)
(* than re-working the item, and gives the claim back, keeping a person's *)
(* label. A finished item is not revisited, so what a person's label does *)
(* once the pull request closes is not modelled.                          *)
(*                                                                         *)
(* A claim may also be given back before its worker starts, for a reason  *)
(* other than losing: a verification read that errors, which removes     *)
(* nothing,                                                                *)
(* or a set-down after a repeated failure before the worker (#173),       *)
(* which only the rank whose claim message holds the item makes, removing *)
(* the label; any other rank drops out silently. A stop                   *)
(* on a handed-over item is answered only by the rank whose message holds *)
(* it, or, where no message counts, by whichever rank reaches it.         *)
(*                                                                         *)
(* Not modelled: `deferred.json` (no requirement here reads it for        *)
(* safety), the settle interval's length (claims are visible at once, and *)
(* the rank-proportional wait is not assumed to order anything), a        *)
(* go-ahead or cooldown after a stop (a stop here is permanent), the      *)
(* triage call itself (triage always says proceed), the tree sweep, and   *)
(* the catch-up's triage, which passes over an item whose pull request   *)
(* still merges until the item or its pull request changes.              *)
(*                                                                         *)
(* Processes and ranks are not one-to-one. Process r, for r in Ranks, is  *)
(* the serving rank r. One more process, RunP, is `igor run`: a one-shot  *)
(* cycle at rank 1, started only when rank 1's heartbeat file did not     *)
(* change across its wait. A heartbeat file records which process last    *)
(* wrote it (`hbWriter`), standing for the id that process picked at its  *)
(* start. Under Fence, a process that finds in its own rank's file an id  *)
(* other than its own, written since it started, stops for good.          *)
(*                                                                         *)
(* A person may edit a claim message (`EditMsg`), and an edited message   *)
(* counts for nothing, so an edit removes it from the messages that       *)
(* count, wherever it stands among them.                                  *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    NRanks,            \* ranks 1..NRanks
    NItems,            \* items 1..NItems, in the source's search order
    Roster,            \* the ranks declared at the start, a subset of 1..NRanks
    Bound,             \* polls without a heartbeat changing before a
                       \* watcher judges the rank gone: 3
    StandDownAt,       \* missed heartbeats at which a process stands down: 2
    CheckpointGap,     \* poll intervals a running worker may go between the
                       \* checkpoints its own events give: 1, or 2
    MaxCrashes,        \* crashes allowed in one behaviour
    MaxLosses,         \* losses, resets or rollbacks of the state branch
    MaxStops,          \* stops people may say
    MaxMisses,         \* poll intervals in which a running process fails to
                       \* write its heartbeat, summed over processes
    MaxHandovers,      \* items people may hand over by adding the label
    MaxRetires,        \* ranks that may be removed from the roster
    MaxClockSteps,     \* ranks whose clock may step back
    MaxPRs,            \* runs that may open the Igor's pull request
    MaxFails,          \* claims given back before the worker starts, for a
                       \* reason other than losing
    MaxRuns,           \* times `igor run` may start: 0 or 1
    MaxEdits,          \* claim messages people may edit
    \* The rules. Each is TRUE in the change as specified.
    CounterLiveness,   \* a watcher judges a heartbeat by whether its counter
                       \* changed; FALSE: by whether its time is later than
                       \* any read before, which a clock stepped back defeats
    WatchAdvance,      \* a process judges a sibling gone by watching its
                       \* heartbeat fail to change; FALSE: by the age of
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
    StandDownOnMisses, \* a process that has failed to write its heartbeat for
                       \* StandDownAt intervals starts nothing and halts its
                       \* worker; FALSE: it carries on
    HandoverContest,   \* ranks take a handed-over item by the same contest as
                       \* found work; FALSE: each posts and works at once
    HandoverRecorded,  \* a taker's claim message on a handed-over item records
                       \* the hand-over; FALSE: the item then reads as found
    RosterWaits,       \* a rank missing from the roster is adoptable only once
                       \* gone; FALSE: at once
    CatchUpAny,        \* a gone rank's claim on an item whose pull request is
                       \* open is taken over and caught up; FALSE: only the
                       \* rank's own successor does, and triage skips it as
                       \* work in flight
    CatchUpSupersedes, \* taking over such a claim, a process posts its own
                       \* claim message without releasing the item, and the
                       \* gone rank's message stops counting for good; FALSE:
                       \* it posts, and the gone rank's message counts again
                       \* once the rank returns
    TimerHalts,        \* Igor's own timer, every half poll interval, checks
                       \* for a stand-down and stops the worker itself, so a
                       \* stood-down worker stops within the interval; FALSE:
                       \* at the worker's next event, up to CheckpointGap
                       \* intervals later
    HolderReleases,    \* a claim given back before its worker starts removes
                       \* the label only where this process's message holds
                       \* the item; FALSE: whenever the label is on
    HolderStops,       \* a stop on a handed-over item a live sibling holds is
                       \* left to that sibling; FALSE: any rank reaching the
                       \* item answers it, releasing the claim
    Fence              \* a process that finds another process's id in its own
                       \* rank's heartbeat file, written since it started,
                       \* stops for good; FALSE: it ignores the id

Ranks == 1..NRanks
Items == 1..NItems

\* The processes: the serving rank r is process r, and RunP is `igor run`,
\* which runs at rank 1.
RunP  == NRanks + 1
Procs == 1..RunP
Rank(p) == IF p = RunP THEN 1 ELSE p

NoMark  == -1   \* a rank with no line in the discovery log

VARIABLES
    \* processes, indexed by Procs
    up,        \* up[r]: process r is running
    pc,        \* pc[r]: where process r is in its cycle
    seen,      \* seen[r]: the counts r read at the start of its cycle
    watch,     \* watch[r][q]: polls since r last saw rank q's heartbeat
               \* change, or since r started watching; capped at Bound
    alive,     \* alive[r][q]: r has seen rank q's heartbeat change since r
               \* started
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
    hbWriter,  \* hbWriter[q]: the process whose id rank q's heartbeat file
               \* holds, 0 for a missing file
    startSeen, \* startSeen[r]: no other process has written r's rank's
               \* heartbeat file since r started, so an id there not r's is
               \* its predecessor's
    \* configuration
    roster,    \* the ranks the roster declares now
    \* tracker
    label,     \* label[i]: the role's label is on item i
    msgs,      \* msgs[i]: ranks of claim messages that count since i's latest
               \* release, in storage order
    upd,       \* upd[i]: item i's update time
    stop,      \* stop[i]: a person has said stop on item i
    done,      \* done[i]: a run finished item i and its artifact is in place
    clk,       \* the tracker's clock, advanced by every tracker write
    handed,    \* handed[i]: item i reads as handed over by a person
    asked,     \* asked[i]: a person handed item i over, and neither a release
               \* nor a stop has ended the hand-over; read only by
               \* HandOverStands
    fresh,     \* fresh[i]: the current second is that of i's latest release
    pr,        \* pr[i]: the Igor's pull request for item i is open, so a run
               \* on it is a catch-up
    \* hosts
    behind,    \* behind[q]: q's clock is behind the latest time a watcher has
               \* read from q's file; read only when ~CounterLiveness
    \* bounds on the environment
    crashes, losses, stops, misses, handovers, retires, clockSteps, prs,
    fails, runs, edits,
    \* ghosts
    wrote,     \* wrote[r]: process r has written its heartbeat since it last
               \* started; read by LiveRankNeverGone
    ow,        \* ow (overwrote)[p][r]: p's heartbeat landed over the id of r, a running
               \* process of p's rank, since r last started
    twin,      \* some process p's heartbeat landed over the id of a running
               \* process q, after q's had landed over p's; read only by
               \* OneProcessPerRank
    lapsed     \* lapsed[r]: r was running and wrote no heartbeat in the
               \* poll interval that last ended, and has written none since,
               \* so its file did not change across `igor run`'s wait, which
               \* is shorter than an interval

procVars    == <<up, pc, seen, watch, alive, cand, cur, polled, markPend,
                 markReady, beat, missed>>
branchVars  == <<hbAge, mark, hbWriter, startSeen>>
trackerVars == <<label, msgs, upd, stop, done, clk, handed, asked, fresh, pr>>
envVars     == <<crashes, losses, stops, misses, handovers, retires,
                 clockSteps, prs, fails, runs, edits>>
vars        == <<procVars, branchVars, roster, trackerVars, behind, envVars,
                 wrote, ow, twin, lapsed>>

-----------------------------------------------------------------------------
(* Helpers *)

Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Range(s) == {s[k] : k \in 1..Len(s)}
Older(a) == IF a >= Bound THEN Bound ELSE a + 1

\* Rank k's order over the candidates: rank 1 starts at the first, rank 2 at
\* the second, and each goes on round the list.
Rot(k) == [j \in 1..NItems |-> ((k - 1 + j - 1) % NItems) + 1]
Order(k, C) == SelectSeq(Rot(k), LAMBDA i : i \in C)

\* What r would read now from the heartbeat files: its own watch counts, or
\* under ~WatchAdvance the ages of the files.
ReadNow(r) == IF WatchAdvance THEN watch[r]
            ELSE [q \in Ranks |-> IF q = Rank(r) THEN 0 ELSE hbAge[q]]

\* What r decides by: a fresh read, or the read at the start of its cycle.
View(r) == IF ReReadHeartbeats THEN ReadNow(r) ELSE seen[r]

\* Rank q is gone to process r: past the bound, or under ~RosterWaits
\* missing from the roster. A process never counts its own rank gone.
Gone(r, q) == q # Rank(r) /\ ((~RosterWaits /\ q \notin roster) \/ View(r)[q] >= Bound)

\* A process stands down when it has failed to write its heartbeat for
\* StandDownAt intervals, whether or not its rank is still in the roster.
StoodDown(r) == StandDownOnMisses /\ missed[r] >= StandDownAt

\* A process whose rank has left the roster starts no claim, finishes or
\* hands off its item (Finish, HandOff), and then exits (Exit). Leaving the
\* roster alone does not make it stand down.
Retiring(r) == Rank(r) \notin roster

\* Under Fence, r has found another process's id in its own rank's
\* heartbeat file, written since r started: another process has taken its
\* rank. The id the file held at r's start is its predecessor's.
Foreign(r) == Fence /\ hbWriter[Rank(r)] \notin {0, r} /\ ~startSeen[r]

\* A process that stood down for missed heartbeats has stopped its worker by
\* the end of the interval in which it stood down, under TimerHalts, or else
\* by the end of the CheckpointGap-th interval counting that one. missed
\* reaches StandDownAt at the Tick that starts the interval in which the
\* process stands down, and Tick checks this before it advances missed, so
\* the HaltGap intervals end when missed reaches StandDownAt + HaltGap - 1.
HaltGap == IF TimerHalts THEN 1 ELSE CheckpointGap
MustHaveHalted(r) ==
    StandDownOnMisses /\ missed[r] >= StandDownAt + HaltGap - 1

\* The rank whose claim message holds item i in r's view: the earliest
\* message that counts whose rank is not gone; 0 if none.
Holder(r, i) ==
    LET ks == {k \in 1..Len(msgs[i]) : ~Gone(r, msgs[i][k])}
    IN  IF ks = {} THEN 0 ELSE msgs[i][Min(ks)]

\* Item i is held, in r's view, by a sibling whose claim message counts.
HeldBySibling(r, i) == label[i] /\ Holder(r, i) \notin {0, Rank(r)}

\* Under ~HolderStops, r answers a stop on a handed-over item a sibling
\* holds, rather than passing it over.
AnswersSiblingStop(r, i) == ~HolderStops /\ stop[i] /\ handed[i]

\* The mark discovery uses for r: the lowest latest mark among ranks not
\* gone that r has seen alive since it started, counting its own; with none
\* of those, the lowest of every rank's latest, capped at the cold start's
\* look-back; with no line at all, a cold start. Every item in the model is
\* inside the cold start's look-back, so the cold start is 0, which caps
\* nothing.
ReplayMark(r) ==
    LET has == {q \in Ranks : mark[q] # NoMark}
        cnt == {q \in has : ~Gone(r, q) /\ (q = Rank(r) \/ alive[r][q])}
    IN  IF cnt # {} THEN Min({mark[q] : q \in cnt})
        ELSE IF has # {} THEN Max({0, Min({mark[q] : q \in has})})
        ELSE 0

Worked(i) == \E r \in Procs : up[r] /\ pc[r] = "work" /\ cur[r] = i
Busy(r) == pc[r] \in {"post", "verify", "work"}

\* A tracker write to item i: its update time becomes the new clock.
Touch(i) == /\ clk' = clk + 1
            /\ upd' = [upd EXCEPT ![i] = clk + 1]

\* Releasing a claim takes the label off, which is the item's latest
\* release, so no earlier claim message counts any more. It ends a
\* hand-over too.
Release(i) == /\ label' = [label EXCEPT ![i] = FALSE]
              /\ msgs' = [msgs EXCEPT ![i] = <<>>]
              /\ handed' = [handed EXCEPT ![i] = FALSE]
              /\ asked' = [asked EXCEPT ![i] = FALSE]
              /\ fresh' = [fresh EXCEPT ![i] = TRUE]
              /\ Touch(i)

\* Giving a claim back at the end of a run, or on handing it off. A
\* catch-up keeps a person's label, so the hand-over still stands;
\* otherwise the claim is released.
GiveBack(i) == IF pr[i] /\ handed[i]
                 THEN UNCHANGED <<label, msgs, handed, asked, fresh, upd, clk>>
                 ELSE Release(i)

\* A candidate r passes over without writing anything: finished, held by a
\* rank that is not gone, or stopped with nobody's label on it. Under
\* ~CatchUpAny, an item whose pull request is open is work in flight, and
\* only the rank whose own message holds it takes it.
Passed(r, i) == \/ done[i] \/ (HeldBySibling(r, i) /\ ~AnswersSiblingStop(r, i))
                \/ (stop[i] /\ ~label[i])
                \/ (~CatchUpAny /\ pr[i] /\ label[i] /\ Holder(r, i) # Rank(r))

RECURSIVE SkipPassed(_, _)
SkipPassed(r, s) == IF s = <<>> THEN s
                    ELSE IF Passed(r, Head(s)) THEN SkipPassed(r, Tail(s))
                    ELSE s

-----------------------------------------------------------------------------
Init ==
    /\ up = [r \in Procs |-> r # RunP]
    /\ pc = [r \in Procs |-> IF r = RunP THEN "never" ELSE "read"]
    /\ seen = [r \in Procs |-> [q \in Ranks |-> 0]]
    /\ watch = [r \in Procs |-> [q \in Ranks |-> 0]]
    /\ alive = [r \in Procs |-> [q \in Ranks |-> FALSE]]
    /\ cand = [r \in Procs |-> <<>>]
    /\ cur = [r \in Procs |-> 0]
    /\ polled = [r \in Procs |-> FALSE]
    /\ markPend = [r \in Procs |-> NoMark]
    /\ markReady = [r \in Procs |-> FALSE]
    /\ beat = [r \in Procs |-> TRUE]
    /\ missed = [r \in Procs |-> 0]
    /\ hbAge = [q \in Ranks |-> 0]
    /\ mark = [q \in Ranks |-> NoMark]
    /\ hbWriter = [q \in Ranks |-> q]
    /\ startSeen = [r \in Procs |-> TRUE]
    /\ roster = Roster
    /\ label = [i \in Items |-> FALSE]
    /\ msgs = [i \in Items |-> <<>>]
    /\ upd = [i \in Items |-> i]
    /\ stop = [i \in Items |-> FALSE]
    /\ done = [i \in Items |-> FALSE]
    /\ clk = NItems
    /\ handed = [i \in Items |-> FALSE]
    /\ asked = [i \in Items |-> FALSE]
    /\ fresh = [i \in Items |-> FALSE]
    /\ pr = [i \in Items |-> FALSE]
    /\ behind = [q \in Procs |-> FALSE]
    /\ crashes = 0 /\ losses = 0 /\ stops = 0 /\ misses = 0
    /\ handovers = 0 /\ retires = 0 /\ clockSteps = 0 /\ prs = 0 /\ fails = 0
    /\ runs = 0 /\ edits = 0
    /\ wrote = [r \in Procs |-> r # RunP]
    /\ ow = [p \in Procs |-> [r \in Procs |-> FALSE]]
    /\ twin = FALSE
    /\ lapsed = [r \in Procs |-> FALSE]

-----------------------------------------------------------------------------
(* A process's cycle *)

\* The cycle begins: read the heartbeat files, then discover. Every item
\* updated after the replayed mark is a candidate, and so under LabelSweep is
\* every labelled item, except an item a sibling holds, which is passed over
\* before triage. Triage is taken to say proceed for each candidate not
\* done. The cycle's mark is the newest update time among the items updated
\* after the replayed mark. A process whose rank has left the roster starts
\* no cycle, and one that finds another's id in its heartbeat file fences
\* instead (FenceOnRead).
Begin(r) ==
    /\ up[r] /\ pc[r] = "read" /\ Rank(r) \in roster /\ ~Foreign(r)
    /\ HeartbeatFirst => wrote[r]
    /\ LET M    == ReplayMark(r)
           Seen == {i \in Items : upd[i] > M}
       IN  /\ cand' = [cand EXCEPT ![r] =
                        Order(Rank(r), {i \in Seen \cup {j \in Items : LabelSweep /\ label[j]} :
                                     ~done[i] /\ (~HeldBySibling(r, i)
                                                   \/ AnswersSiblingStop(r, i))})]
           /\ IF Seen # {}
                THEN /\ markPend' = [markPend EXCEPT ![r] = Max({upd[i] : i \in Seen})]
                     /\ markReady' = [markReady EXCEPT ![r] = ~MarkAfterAttempts]
                ELSE UNCHANGED <<markPend, markReady>>
    /\ seen' = IF ReReadHeartbeats THEN seen ELSE [seen EXCEPT ![r] = ReadNow(r)]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, watch, alive, cur, polled, beat, missed,
                   branchVars, roster, trackerVars, behind, envVars, wrote, ow, twin, lapsed>>

\* Pass over candidates that need no write, then act on the next one. A
\* cycle with no candidate left is over, and its mark may be appended. A
\* process that has stood down, or whose rank has left the roster, starts
\* nothing, and its cycle's mark is held below the oldest candidate it did
\* not attempt.
Choose(r) ==
    /\ up[r] /\ pc[r] = "choose" /\ ~Foreign(r)
    /\ LET s == SkipPassed(r, cand[r]) IN
       IF StoodDown(r) \/ Retiring(r)
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
              \* Stopped, and labelled by this rank's predecessor, by a rank
              \* that is gone, or with no claim message that counts: Passed
              \* has skipped every other stopped item, unless
              \* AnswersSiblingStop. A stop releases the claim.
              THEN /\ Release(i) /\ UNCHANGED <<stop, done, pr>>
                   /\ UNCHANGED <<cur, pc>>
            ELSE IF label[i] /\ h = Rank(r) /\ ~(ReleaseOnTakeover /\ overGone)
              \* Its own rank's claim: the predecessor died. Work it again,
              \* or, with its pull request open, catch it up. Under
              \* ReleaseOnTakeover, only when no gone rank's message is on the
              \* item; otherwise the next branch takes it over.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "work"]
                   /\ UNCHANGED <<trackerVars>>
            ELSE IF label[i]
              \* Labelled, and either held by no live rank, or held by this
              \* rank's own message only because an earlier message, of a gone
              \* rank, no longer counts: post a claim message. A handed-over
              \* item with no message yet comes here too. Where it leaves out
              \* a gone rank's message on an item with no pull request open,
              \* under ReleaseOnTakeover it first removes the label and adds
              \* it again, modelled as one step: the label stays on, and every
              \* earlier message falls before the new release. Under
              \* HandoverRecorded the item still reads as handed over. With
              \* the pull request open it releases nothing: Post supersedes.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "post"]
                   /\ IF ReleaseOnTakeover /\ overGone /\ ~pr[i]
                        THEN /\ msgs' = [msgs EXCEPT ![i] = <<>>]
                             /\ fresh' = [fresh EXCEPT ![i] = TRUE]
                             /\ handed' = IF HandoverRecorded THEN handed
                                          ELSE [handed EXCEPT ![i] = FALSE]
                             /\ Touch(i)
                             /\ UNCHANGED <<label, stop, done, asked, pr>>
                        ELSE UNCHANGED <<trackerVars>>
            ELSE
              \* Unclaimed: the label first, the message after. A claim
              \* message can sit on an unlabelled item, posted by a rank whose
              \* claim was given back first. Where such a message is a gone
              \* rank's, under ReleaseOnTakeover the process adds the label,
              \* removes it and adds it again, modelled as one step, so the
              \* message falls before the new release.
              /\ cur' = [cur EXCEPT ![r] = i]
              /\ pc' = [pc EXCEPT ![r] = "post"]
              /\ label' = [label EXCEPT ![i] = TRUE]
              /\ Touch(i)
              /\ IF ReleaseOnTakeover /\ overGone
                   THEN /\ msgs' = [msgs EXCEPT ![i] = <<>>]
                        /\ fresh' = [fresh EXCEPT ![i] = TRUE]
                   ELSE UNCHANGED <<msgs, fresh>>
              /\ UNCHANGED <<stop, done, handed, asked, pr>>
    /\ UNCHANGED <<up, seen, watch, alive, polled, beat, missed, branchVars,
                   roster, behind, envVars, wrote, ow, twin, lapsed>>

\* Post the claim message, carrying this rank, at once. A message posted in
\* the second of the item's latest release does not count, and the item
\* waits for a later cycle. On an item whose pull request is open, under
\* CatchUpSupersedes, the message supersedes those of ranks gone to the
\* poster: they stop counting for good, even once their rank returns.
\* Under ~HandoverContest a handed-over item is worked at once, unverified.
Post(r) ==
    /\ up[r] /\ pc[r] = "post"
    /\ LET i == cur[r]
           kept == IF pr[i] /\ CatchUpSupersedes
                     THEN SelectSeq(msgs[i], LAMBDA q : ~Gone(r, q))
                     ELSE msgs[i]
       IN  msgs' = IF fresh[i] THEN msgs
                   ELSE [msgs EXCEPT ![i] = Append(kept, Rank(r))]
    /\ Touch(cur[r])
    /\ pc' = [pc EXCEPT ![r] = IF ~HandoverContest /\ handed[cur[r]]
                                 THEN "work" ELSE "verify"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, polled, markPend,
                   markReady, beat, missed, label, stop, done, handed, asked,
                   fresh, pr, branchVars, roster, behind, envVars, wrote, ow, twin, lapsed>>

\* Re-read the item after the settle interval. A process that has stood down
\* stands down from the claim too, leaving its message. A process whose rank
\* has left the roster goes on with a claim it holds, as shutdown finishes
\* the item in hand. A stop seen here is answered, releasing the claim, only
\* under ~HolderReleases or where no sibling's message holds the item;
\* otherwise the process drops out silently, leaving the stop to the holder.
Verify(r) ==
    /\ up[r] /\ pc[r] = "verify" /\ ~Foreign(r)
    /\ LET i == cur[r] IN
       IF stop[i]
         THEN /\ IF ~HolderReleases \/ Holder(r, i) \in {0, Rank(r)}
                   THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                   ELSE UNCHANGED trackerVars
              /\ cur' = [cur EXCEPT ![r] = 0]
              /\ pc' = [pc EXCEPT ![r] = "choose"]
       ELSE IF label[i] /\ Holder(r, i) = Rank(r) /\ ~StoodDown(r)
         THEN /\ pc' = [pc EXCEPT ![r] = "work"]
              /\ UNCHANGED <<cur, trackerVars>>
       ELSE /\ cur' = [cur EXCEPT ![r] = 0]
            /\ pc' = [pc EXCEPT ![r] = "choose"]
            /\ IF ~LoserKeepsLabel /\ label[i] /\ ~StoodDown(r)
                 THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                 ELSE UNCHANGED trackerVars
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote, ow, twin, lapsed>>

\* The claim is given back before its worker starts, for a reason other
\* than losing. Either its verification fails, and the process cannot tell
\* whether it holds the item, so it removes nothing; or it sets the item
\* down after a failure before the worker that repeats (#173), which only a
\* process whose own message holds the item does. Under ~HolderReleases
\* either removes the label whenever it is on.
FailClaim(r) ==
    /\ up[r] /\ pc[r] = "verify" /\ fails < MaxFails
    /\ LET i == cur[r] IN
       /\ ~stop[i]
       /\ \E setDown \in BOOLEAN :
            IF label[i] /\ (~HolderReleases \/ (setDown /\ Holder(r, i) = Rank(r)))
              THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
              ELSE UNCHANGED trackerVars
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ fails' = fails + 1
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, crashes, losses,
                   stops, misses, handovers, retires, clockSteps, prs, runs,
                   edits, wrote, ow, twin, lapsed>>

\* A checkpoint in the worker's run sees a stop: the run halts and the claim
\* is released, a person's label included.
Checkpoint(r) ==
    /\ up[r] /\ pc[r] = "work" /\ stop[cur[r]]
    /\ Release(cur[r]) /\ UNCHANGED <<stop, done, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote, ow, twin, lapsed>>

\* The worker of a process that has stood down stops: at the next tick of
\* Igor's own timer under TimerHalts, or else at the worker's next event.
\* The claim stays, silently: a sibling may already have taken the
\* item over, and a release would undo the sibling's claim.
Halt(r) ==
    /\ up[r] /\ pc[r] = "work" /\ StoodDown(r) /\ ~stop[cur[r]]
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, trackerVars, behind,
                   envVars, wrote, ow, twin, lapsed>>

\* The run opens the Igor's pull request, and has not yet finished. A crash
\* now leaves a claim on an item whose pull request is open.
OpenPR(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]] /\ ~pr[cur[r]]
    /\ prs < MaxPRs
    /\ pr' = [pr EXCEPT ![cur[r]] = TRUE]
    /\ prs' = prs + 1
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, upd, stop, done,
                   clk, handed, asked, fresh, behind, crashes, losses, stops,
                   misses, handovers, retires, clockSteps, fails, runs, edits,
                   wrote, ow, twin, lapsed>>

\* The run finishes, after any number of poll intervals: its artifact is in
\* place, and it gives the claim back. A catch-up keeps a person's label.
Finish(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]]
    /\ done' = [done EXCEPT ![cur[r]] = TRUE]
    /\ GiveBack(cur[r]) /\ UNCHANGED <<stop, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote, ow, twin, lapsed>>

\* A process whose rank has left the roster may hand its item off instead of
\* finishing it, out loud, giving the claim back as a finished run does.
HandOff(r) ==
    /\ up[r] /\ pc[r] = "work" /\ Retiring(r) /\ ~stop[cur[r]]
    /\ GiveBack(cur[r]) /\ UNCHANGED <<stop, done, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote, ow, twin, lapsed>>

\* The next cycle begins once a poll interval has passed.
NextCycle(r) ==
    /\ up[r] /\ pc[r] = "idle" /\ polled[r] /\ r # RunP
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, markPend, markReady, beat,
                   missed, branchVars, roster, trackerVars, behind, envVars,
                   wrote, ow, twin, lapsed>>

\* A process whose rank has left the roster exits once its item is finished
\* or handed off and its cycle's mark has landed. The supervisor's restart
\* is refused.
Exit(r) ==
    /\ up[r] /\ Retiring(r) /\ ~Busy(r) /\ markPend[r] = NoMark
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "down"]
    /\ cand' = [cand EXCEPT ![r] = <<>>]
    /\ seen' = [seen EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ wrote' = [wrote EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<watch, alive, cur, markPend, markReady, beat, missed,
                   branchVars, roster, trackerVars, behind, envVars, ow, twin, lapsed>>

\* `igor run` ends once its one cycle is over and its mark has landed.
RunExit(r) ==
    /\ up[r] /\ r = RunP /\ pc[r] = "idle" /\ markPend[r] = NoMark
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "ended"]
    /\ UNCHANGED <<seen, watch, alive, cand, cur, polled, markPend, markReady,
                   beat, missed, branchVars, roster, trackerVars, behind,
                   envVars, wrote, ow, twin, lapsed>>

\* A process that finds another's id in its own rank's heartbeat file when
\* it reads the heartbeat files, before choosing or verifying, stops for
\* good: its worker dies with it, it leaves its claims, and it is never
\* restarted, since it exits with a status the unit does not restart on.
Fenced(r) ==
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "fenced"]
    /\ cand' = [cand EXCEPT ![r] = <<>>]
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]

FenceOnRead(r) ==
    /\ up[r] /\ pc[r] \in {"read", "choose", "verify"} /\ Foreign(r)
    /\ Fenced(r)
    /\ UNCHANGED <<seen, watch, alive, polled, beat, missed, branchVars, roster,
                   trackerVars, behind, envVars, wrote, ow, twin, lapsed>>

-----------------------------------------------------------------------------
(* Writes to the state branch *)

\* The cycle's mark lands in the log: this rank's latest line.
AppendMark(r) ==
    /\ up[r] /\ markPend[r] # NoMark /\ markReady[r]
    /\ mark' = [mark EXCEPT ![Rank(r)] = markPend[r]]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, pc, seen, watch, alive, cand, cur, polled, beat, missed,
                   hbAge, hbWriter, startSeen, roster, trackerVars, behind,
                   envVars, wrote, ow, twin, lapsed>>

\* This process's heartbeat lands, from a timer that runs whatever the cycle
\* is doing: its counter goes up by one. The file changes, so every
\* watcher's count for this rank restarts, and every watcher has now seen it
\* alive. Under ~CounterLiveness a watcher compares times instead, and a
\* write from a process whose clock is behind lands without counting for
\* anyone, though the process itself counts it as written.
\*
\* Under Fence, the write names the file as this process last wrote it, so
\* it is refused where another process has written the file since this
\* process started. The process then reads the file, finds that process's
\* id, and stops for good instead of writing. Under ~Fence it writes, never
\* looking at the id in the file.
WriteHeartbeat(r) ==
    /\ up[r] /\ ~beat[r]
    /\ IF Foreign(r)
         THEN /\ Fenced(r)
              /\ UNCHANGED <<seen, watch, alive, polled, beat, missed,
                             branchVars, roster, trackerVars, behind, envVars,
                             wrote, ow, twin, lapsed>>
         ELSE
         LET k == Rank(r)
             prev == hbWriter[k]
         IN
         /\ beat' = [beat EXCEPT ![r] = TRUE]
         /\ missed' = [missed EXCEPT ![r] = 0]
         /\ IF CounterLiveness \/ ~behind[r]
              THEN /\ watch' = [x \in Procs |-> [watch[x] EXCEPT ![k] = 0]]
                   /\ alive' = [x \in Procs |-> [alive[x] EXCEPT ![k] = TRUE]]
              ELSE UNCHANGED <<watch, alive>>
         /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [hbAge EXCEPT ![k] = 0]
         /\ hbWriter' = [hbWriter EXCEPT ![k] = r]
         /\ startSeen' = [x \in Procs |-> IF Rank(x) = k /\ x # r /\ up[x]
                                           THEN FALSE ELSE startSeen[x]]
         /\ IF prev \notin {0, r} /\ up[prev]
              THEN /\ ow' = [ow EXCEPT ![r][prev] = TRUE]
                   /\ twin' = (twin \/ ow[prev][r])
              ELSE UNCHANGED <<ow, twin>>
         /\ wrote' = [wrote EXCEPT ![r] = TRUE]
         /\ lapsed' = [lapsed EXCEPT ![r] = FALSE]
         /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady,
                        mark, roster, trackerVars, behind, envVars>>

-----------------------------------------------------------------------------
(* Time and the environment *)

\* One poll interval passes. A running process whose heartbeat has not
\* landed in the interval that is ending has missed one, which MaxMisses
\* bounds. Only a running process's counts advance: a process that is down
\* starts its counts afresh when it starts. A process that stood down for missed heartbeats has halted any
\* claim or run within HaltGap intervals (MustHaveHalted). Under VerifyWithinPoll no claim is still
\* between its message and its verification, which is how the model makes
\* verification come within one poll interval of the message. Every
\* release's second has passed.
Tick ==
    /\ LET M == {r \in Procs : up[r] /\ ~beat[r]}
       IN  /\ misses + Cardinality(M) <= MaxMisses
           /\ misses' = misses + Cardinality(M)
    /\ \A r \in Procs : (up[r] /\ MustHaveHalted(r)) => ~Busy(r)
    /\ VerifyWithinPoll => \A r \in Procs : up[r] => pc[r] \notin {"post", "verify"}
    /\ watch' = [r \in Procs |-> IF ~up[r] THEN watch[r] ELSE [q \in Ranks |->
                   IF q = Rank(r) THEN 0 ELSE Older(watch[r][q])]]
    /\ missed' = [r \in Procs |-> IF up[r] THEN Older(missed[r]) ELSE missed[r]]
    /\ hbAge' = IF WatchAdvance THEN hbAge
                ELSE [q \in Ranks |-> Older(hbAge[q])]
    /\ beat' = [r \in Procs |-> FALSE]
    /\ polled' = [r \in Procs |-> TRUE]
    /\ fresh' = [i \in Items |-> FALSE]
    /\ UNCHANGED <<up, pc, seen, alive, cand, cur, markPend, markReady,
                   mark, hbWriter, startSeen, roster, label, msgs, upd, stop,
                   done, clk, handed, asked, pr, behind, crashes, losses, stops,
                   handovers, retires, clockSteps, prs, fails, runs, edits,
                   wrote, ow, twin>>
    /\ lapsed' = [r \in Procs |-> up[r] /\ ~beat[r]]

\* The second of the latest releases passes.
NextSecond ==
    /\ \E i \in Items : fresh[i]
    /\ fresh' = [i \in Items |-> FALSE]
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, upd, stop, done,
                   clk, handed, asked, pr, behind, envVars, wrote, ow, twin, lapsed>>

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
    /\ UNCHANGED <<watch, alive, beat, missed, branchVars, roster, trackerVars,
                   behind, losses, stops, misses, handovers, retires,
                   clockSteps, prs, fails, runs, edits, ow, twin, lapsed>>

\* A process starts: it watches every sibling afresh, has seen none alive,
\* and takes the id its rank's file holds as its predecessor's.
Start(r) ==
    /\ up' = [up EXCEPT ![r] = TRUE]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ watch' = [watch EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ alive' = [alive EXCEPT ![r] = [q \in Ranks |-> FALSE]]
    /\ beat' = [beat EXCEPT ![r] = FALSE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ startSeen' = [startSeen EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<seen, cand, cur, polled, markPend, markReady,
                   hbAge, mark, hbWriter, roster, trackerVars, behind, wrote,
                   twin, lapsed>>
    /\ ow' = [x \in Procs |-> [y \in Procs |->
                IF x = r \/ y = r THEN FALSE ELSE ow[x][y]]]

\* The supervisor restarts a serving rank, if the roster still declares its
\* rank and it did not fence itself. It starts watching every sibling
\* afresh, has seen none alive, and counts the intervals without a
\* heartbeat of its own from its start. It picks a new id for its heartbeat
\* file, so its first write changes the file whatever the file held. On a
\* host whose clock is behind, ClockStep may follow.
Restart(r) ==
    /\ r \in Ranks /\ ~up[r] /\ pc[r] = "down" /\ r \in roster
    /\ Start(r)
    /\ UNCHANGED <<envVars>>

\* `igor run` starts, once, as rank 1, where rank 1's heartbeat file did not
\* change across its wait. That is so in three cases: no process serves
\* rank 1; rank 1 has stood down, which it does only while its writes fail;
\* or one of rank 1's writes failed during the wait. The
\* model lets it start wherever the serving rank 1 missed its heartbeat in
\* the interval that last ended and has written none since, whatever that
\* rank's worker is doing.
StartRun ==
    /\ runs < MaxRuns /\ pc[RunP] = "never" /\ 1 \in roster
    /\ ~up[1] \/ lapsed[1]
    /\ Start(RunP)
    /\ runs' = runs + 1
    /\ UNCHANGED <<crashes, losses, stops, misses, handovers, retires,
                   clockSteps, prs, fails, edits>>

\* A rank's clock steps back, or the rank restarted on a host whose clock is
\* behind: the times it writes are earlier than the latest any watcher has
\* read from its file, and stay so. Only ~CounterLiveness reads this.
ClockStep(q) ==
    /\ up[q] /\ ~behind[q] /\ clockSteps < MaxClockSteps
    /\ behind' = [behind EXCEPT ![q] = TRUE]
    /\ clockSteps' = clockSteps + 1
    /\ UNCHANGED <<procVars, branchVars, roster, trackerVars, crashes, losses,
                   stops, misses, handovers, retires, prs, fails, runs, edits,
                   wrote, ow, twin, lapsed>>

\* The state branch is lost, reset or rolled back to an old commit. A lost
\* or reset branch changes no heartbeat file a watcher could read, so no
\* watch count changes, and leaves no id in any file. A rollback is taken to
\* put back only files written by their rank's own process or by its
\* predecessor, so it leaves each file's writer as it was, a predecessor and its
\* successor being one process in the model: a rollback to a
\* file another process wrote is not modelled. Without `igor run` every
\* file's writer is its own rank's process, whose id no process takes for
\* another's, so a file left with no id changes nothing the model reads.
\* The model therefore lets a loss leave a file with no id only where
\* MaxRuns > 0, which keeps the other configurations' state spaces small. A rolled-back one puts older files back: under
\* CounterLiveness an older counter differs from the one last read, so it
\* reads as a change: for each rank in a chosen set S, every watcher's
\* count restarts and every watcher has now seen it alive. That only
\* postpones a verdict, and lets that rank's latest mark count again where
\* it had stopped counting, which can only lower the mark. Under ~WatchAdvance every file reads as
\* old. The log is lost, or returns to an old commit. An old commit's marks
\* are no higher than today's, so the model keeps today's: the highest they
\* could be, which is the worst case for MarkNeverPassesUntaken.
LoseBranch ==
    /\ losses < MaxLosses
    /\ \/ mark' = [q \in Ranks |-> NoMark]
       \/ UNCHANGED mark
    /\ \E S \in (IF CounterLiveness THEN SUBSET Ranks ELSE {{}}) :
          /\ watch' = [x \in Procs |-> [q \in Ranks |->
                          IF q \in S THEN 0 ELSE watch[x][q]]]
          /\ alive' = [x \in Procs |-> [q \in Ranks |->
                          IF q \in S /\ q # Rank(x) THEN TRUE ELSE alive[x][q]]]
    /\ \/ MaxRuns > 0 /\ hbWriter' = [q \in Ranks |-> 0]
       \/ UNCHANGED hbWriter
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [q \in Ranks |-> Bound]
    /\ losses' = losses + 1
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady, beat,
                   missed, startSeen, roster, trackerVars, behind, crashes,
                   stops, misses, handovers, retires, clockSteps, prs, fails,
                   runs, edits, wrote, ow, twin, lapsed>>

\* A person says stop on an item.
SayStop(i) ==
    /\ stops < MaxStops /\ ~stop[i] /\ ~done[i]
    /\ stop' = [stop EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ stops' = stops + 1
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, done, handed,
                   asked, fresh, pr, behind, crashes, losses, misses,
                   handovers, retires, clockSteps, prs, fails, runs, edits,
                   wrote, ow, twin, lapsed>>

\* A person hands an unclaimed item over by adding the role's label.
HandOver(i) ==
    /\ handovers < MaxHandovers /\ ~label[i] /\ ~stop[i] /\ ~done[i]
    /\ label' = [label EXCEPT ![i] = TRUE]
    /\ handed' = [handed EXCEPT ![i] = TRUE]
    /\ asked' = [asked EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ handovers' = handovers + 1
    /\ UNCHANGED <<procVars, branchVars, roster, msgs, stop, done, fresh, pr,
                   behind, crashes, losses, stops, misses, retires, clockSteps,
                   prs, fails, runs, edits, wrote, ow, twin, lapsed>>

\* An operator removes a rank from the roster.
Retire(q) ==
    /\ retires < MaxRetires /\ q \in roster
    /\ roster' = roster \ {q}
    /\ retires' = retires + 1
    /\ UNCHANGED <<procVars, branchVars, trackerVars, behind, crashes, losses,
                   stops, misses, handovers, clockSteps, prs, fails, runs,
                   edits, wrote, ow, twin, lapsed>>

\* A person edits a claim message. An edited message counts for nothing, so
\* it leaves the messages that count, wherever it stood among them.
EditMsg(i) ==
    /\ edits < MaxEdits /\ msgs[i] # <<>>
    /\ \E k \in 1..Len(msgs[i]) :
          msgs' = [msgs EXCEPT ![i] = SubSeq(msgs[i], 1, k - 1)
                                       \o SubSeq(msgs[i], k + 1, Len(msgs[i]))]
    /\ Touch(i)
    /\ edits' = edits + 1
    /\ UNCHANGED <<procVars, branchVars, roster, label, stop, done, handed,
                   asked, fresh, pr, behind, crashes, losses, stops, misses,
                   handovers, retires, clockSteps, prs, fails, runs, wrote,
                   ow, twin, lapsed>>

-----------------------------------------------------------------------------
Step(r) == Begin(r) \/ Choose(r) \/ Post(r) \/ Verify(r) \/ Checkpoint(r)
           \/ Halt(r) \/ Finish(r) \/ HandOff(r) \/ NextCycle(r)
           \/ RunExit(r) \/ FenceOnRead(r)

Next ==
    \/ \E r \in Procs : Step(r) \/ AppendMark(r) \/ WriteHeartbeat(r)
                        \/ OpenPR(r) \/ FailClaim(r) \/ Exit(r) \/ Crash(r)
                        \/ Restart(r) \/ ClockStep(r)
    \/ \E q \in Ranks : Retire(q)
    \/ StartRun
    \/ Tick
    \/ NextSecond
    \/ LoseBranch
    \/ \E i \in Items : SayStop(i) \/ HandOver(i) \/ EditMsg(i)

\* Running processes make progress, their writes land, workers finish, a
\* process whose rank left the roster exits, and time passes. Nothing obliges
\* a crashed process to restart, or a person to say anything.
Fairness ==
    /\ \A r \in Procs : WF_vars(Step(r)) /\ WF_vars(AppendMark(r))
                        /\ WF_vars(WriteHeartbeat(r)) /\ WF_vars(Exit(r))
    /\ WF_vars(Tick)
    /\ WF_vars(NextSecond)

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* The view TLC fingerprints states by *)

\* Update times and marks matter only by their order: every guard compares
\* them, or takes their least or greatest, and a new update time is always
\* the latest. The one subtraction, a held-back mark of upd[i] - 1, is only
\* ever compared as x > upd[i] - 1, which for whole numbers is x >= upd[i],
\* an order relation too. So two states alike but for those values' gaps
\* have the same futures, and StateView replaces each value by how many distinct
\* values lie below it. clk is left out: it is always the greatest update
\* time.
TimeVals == {0} \cup {upd[i] : i \in Items}
            \cup {mark[q] : q \in {x \in Ranks : mark[x] # NoMark}}
            \cup {markPend[q] : q \in {x \in Procs : markPend[x] # NoMark}}
Canon(v) == IF v = NoMark THEN NoMark
            ELSE Cardinality({w \in TimeVals : w < v})

StateView == <<up, pc, seen, watch, alive, cand, cur, polled,
          [q \in Procs |-> Canon(markPend[q])], markReady, beat, missed,
          hbAge, [q \in Ranks |-> Canon(mark[q])], hbWriter, startSeen, roster,
          label, msgs, [i \in Items |-> Canon(upd[i])], stop, done, handed,
          asked, fresh, pr, behind, envVars, wrote, ow, twin, lapsed>>

-----------------------------------------------------------------------------
(* Invariants. Each names, by its exact title, the requirement it proves. *)

TypeOK ==
    /\ up \in [Procs -> BOOLEAN]
    /\ pc \in [Procs -> {"never", "down", "read", "choose", "post", "verify",
                         "work", "idle", "ended", "fenced"}]
    /\ cur \in [Procs -> 0..NItems]
    /\ watch \in [Procs -> [Ranks -> 0..Bound]]
    /\ alive \in [Procs -> [Ranks -> BOOLEAN]]
    /\ missed \in [Procs -> 0..Bound]
    /\ hbWriter \in [Ranks -> 0..RunP]
    /\ startSeen \in [Procs -> BOOLEAN]
    /\ ow \in [Procs -> [Procs -> BOOLEAN]]
    /\ twin \in BOOLEAN
    /\ lapsed \in [Procs -> BOOLEAN]
    /\ roster \subseteq Ranks
    /\ label \in [Items -> BOOLEAN]
    /\ stop \in [Items -> BOOLEAN]
    /\ done \in [Items -> BOOLEAN]
    /\ handed \in [Items -> BOOLEAN]
    /\ fresh \in [Items -> BOOLEAN]
    /\ pr \in [Items -> BOOLEAN]
    /\ behind \in [Procs -> BOOLEAN]
    /\ fails \in 0..MaxFails

\* Requirements: "A claim names the process that took it", "Assignment
\* expresses a claim; ordering resolves it", "A hand-over among one role's
\* ranks is contested like found work" and "A claim left on the Igor's open
\* pull request is caught up" (work-claiming).
\* Never two live workers on one item, a catch-up's included.
NoTwoWorkers ==
    \A i \in Items :
        Cardinality({r \in Procs : up[r] /\ pc[r] = "work" /\ cur[r] = i}) <= 1

\* Requirement: "A retired rank does not hold its items forever"
\* (work-claiming), with its scenarios "The bound does not shorten a run",
\* "A lost state branch takes no live rank's claim", "A rolled-back state
\* branch takes no live rank's claim" and "A rank whose clock goes back is
\* still counted".
\* A live rank's claim is never taken: no running process of another rank
\* judges gone the rank of a running process that has written its heartbeat
\* since it started and has not stood down. A process still at "read" has
\* not yet read the heartbeat files this cycle, so under ~ReReadHeartbeats
\* its view is the last cycle's; it is checked once it has begun.
LiveRankNeverGone ==
    \A p, r \in Procs :
        (Rank(p) # Rank(r) /\ up[r] /\ pc[r] # "read" /\ up[p] /\ wrote[p]
           /\ ~StoodDown(p))
            => ~Gone(r, Rank(p))

\* Requirement: "Processes saving one source keep the lower watermark"
\* (work-discovery).
\* The replayed mark never passes an item no live process has taken: such
\* an item is still among some live process's candidates this cycle, or is
\* above the mark some live process would replay now. Only processes that
\* have begun their cycle replay a mark, so the check waits until at least
\* one live process has (Settled).
MarkNeverPassesUntaken ==
    LET Untaken(i) == ~label[i] /\ ~done[i] /\ ~stop[i]
        Pending(i) == \E r \in Procs : up[r] /\ (cur[r] = i \/ i \in Range(cand[r]))
        Below(i)   == \E r \in Procs : up[r] /\ pc[r] # "read" /\ upd[i] > ReplayMark(r)
        Settled    == \E r \in Procs : up[r] /\ pc[r] # "read"
    IN  Settled => \A i \in Items : Untaken(i) => (Pending(i) \/ Below(i))

\* Requirement: "A hand-over among one role's ranks is contested like found
\* work" (work-claiming), its scenario "A taken-over hand-over still stands".
\* An item a person handed over reads as handed over for as long as it
\* carries the label, until a release or a stop ends the hand-over. A
\* catch-up gives its claim back without ending it.
HandOverStands ==
    \A i \in Items : (asked[i] /\ label[i]) => handed[i]

\* Requirement: "Only the rank holding a claim gives it back" (work-claiming).
\* A stop is answered, its claim released, only once no worker runs on the
\* item: the receipt never says an item stopped while a sibling's run on it
\* carries on.
NoReceiptWhileWorked ==
    \A i \in Items : (stop[i] /\ ~label[i]) => ~Worked(i)

\* Requirement: "A process that finds another's id in its heartbeat file
\* stops for good" (work-claiming).
\* Two running processes of one rank never each overwrite the other's id
\* in its heartbeat file: once one has, the other stops at its next write
\* or read, before its own write can land over the first's id.
OneProcessPerRank == ~twin

-----------------------------------------------------------------------------
(* Liveness, in behaviours where some process is eventually always running *)

SomeUpForever == <>[](\E r \in Procs : up[r])

\* Requirements: "A process recovers the claims of its own predecessor", "A
\* retired rank does not hold its items forever" and "A claim left on the
\* Igor's open pull request is caught up" (work-claiming), and
\* "Every cycle considers the items its role's label holds" (work-discovery).
\* A crashed or retired rank's claims are eventually recovered: a labelled
\* item no running process holds, and no run has finished, is eventually
\* worked again or released. A finished item may keep a person's label
\* after a catch-up, as the hand-over still standing.
OrphanRecovered ==
    SomeUpForever =>
        \A i \in Items :
            (label[i] /\ ~done[i] /\ \A r \in Procs : ~(up[r] /\ cur[r] = i))
                ~> (~label[i] \/ done[i] \/ Worked(i))

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
