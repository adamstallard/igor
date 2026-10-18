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
(* other than losing: a verification that fails, or a failure before the  *)
(* worker that repeats (#173). Only the rank whose claim message holds    *)
(* the item removes the label then; any other drops out silently. A stop  *)
(* on a handed-over item is answered only by the rank whose message holds *)
(* it, or, where no message counts, by whichever rank reaches it.         *)
(*                                                                         *)
(* Not modelled: `deferred.json` (no requirement here reads it for        *)
(* safety), the settle interval's length (claims are visible at once, and *)
(* the rank-proportional wait is not assumed to order anything), a        *)
(* go-ahead or cooldown after a stop (a stop here is permanent), the      *)
(* triage call itself (triage always says proceed), the tree sweep, and   *)
(* two processes at one rank (which the change makes the operator's job   *)
(* to prevent, and declares unhandled).                                   *)
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
    HolderStops        \* a stop on a handed-over item a live sibling holds is
                       \* left to that sibling; FALSE: any rank reaching the
                       \* item answers it, releasing the claim

Ranks == 1..NRanks
Items == 1..NItems

NoMark  == -1   \* a rank with no line in the discovery log

VARIABLES
    \* processes
    up,        \* up[r]: rank r's process is running
    pc,        \* pc[r]: where rank r is in its cycle
    seen,      \* seen[r]: the counts r read at the start of its cycle
    watch,     \* watch[r][q]: polls since r last saw q's heartbeat change,
               \* or since r started watching; capped at Bound
    alive,     \* alive[r][q]: r has seen q's heartbeat change since r started
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
    fails,
    \* ghost, read only by LiveRankNeverGone
    wrote      \* wrote[q]: q has written its heartbeat since it last started

procVars    == <<up, pc, seen, watch, alive, cand, cur, polled, markPend,
                 markReady, beat, missed>>
branchVars  == <<hbAge, mark>>
trackerVars == <<label, msgs, upd, stop, done, clk, handed, asked, fresh, pr>>
envVars     == <<crashes, losses, stops, misses, handovers, retires,
                 clockSteps, prs, fails>>
vars        == <<procVars, branchVars, roster, trackerVars, behind, envVars,
                 wrote>>

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

\* Rank q is gone to r: past the bound, or under ~RosterWaits missing from
\* the roster. A process never counts itself gone.
Gone(r, q) == q # r /\ ((~RosterWaits /\ q \notin roster) \/ View(r)[q] >= Bound)

\* A process stands down when it has failed to write its heartbeat for
\* StandDownAt intervals, whether or not its rank is still in the roster.
StoodDown(r) == StandDownOnMisses /\ missed[r] >= StandDownAt

\* A process whose rank has left the roster starts no claim, finishes or
\* hands off its item (Finish, HandOff), and then exits (Exit). Leaving the
\* roster alone does not make it stand down.
Retiring(r) == r \notin roster

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
HeldBySibling(r, i) == label[i] /\ Holder(r, i) \notin {0, r}

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
        cnt == {q \in has : ~Gone(r, q) /\ (q = r \/ alive[r][q])}
    IN  IF cnt # {} THEN Min({mark[q] : q \in cnt})
        ELSE IF has # {} THEN Max({0, Min({mark[q] : q \in has})})
        ELSE 0

Worked(i) == \E r \in Ranks : up[r] /\ pc[r] = "work" /\ cur[r] = i
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
                \/ (~CatchUpAny /\ pr[i] /\ label[i] /\ Holder(r, i) # r)

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
    /\ alive = [r \in Ranks |-> [q \in Ranks |-> FALSE]]
    /\ cand = [r \in Ranks |-> <<>>]
    /\ cur = [r \in Ranks |-> 0]
    /\ polled = [r \in Ranks |-> FALSE]
    /\ markPend = [r \in Ranks |-> NoMark]
    /\ markReady = [r \in Ranks |-> FALSE]
    /\ beat = [r \in Ranks |-> TRUE]
    /\ missed = [r \in Ranks |-> 0]
    /\ hbAge = [q \in Ranks |-> 0]
    /\ mark = [q \in Ranks |-> NoMark]
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
    /\ behind = [q \in Ranks |-> FALSE]
    /\ crashes = 0 /\ losses = 0 /\ stops = 0 /\ misses = 0
    /\ handovers = 0 /\ retires = 0 /\ clockSteps = 0 /\ prs = 0 /\ fails = 0
    /\ wrote = [q \in Ranks |-> TRUE]

-----------------------------------------------------------------------------
(* A process's cycle *)

\* The cycle begins: read the heartbeat files, then discover. Every item
\* updated after the replayed mark is a candidate, and so under LabelSweep is
\* every labelled item, except an item a sibling holds, which is passed over
\* before triage. Triage is taken to say proceed for each candidate not
\* done. The cycle's mark is the newest update time among the items updated
\* after the replayed mark. A process whose rank has left the roster starts
\* no cycle.
Begin(r) ==
    /\ up[r] /\ pc[r] = "read" /\ r \in roster
    /\ HeartbeatFirst => wrote[r]
    /\ LET M    == ReplayMark(r)
           Seen == {i \in Items : upd[i] > M}
       IN  /\ cand' = [cand EXCEPT ![r] =
                        Order(r, {i \in Seen \cup {j \in Items : LabelSweep /\ label[j]} :
                                     ~done[i] /\ (~HeldBySibling(r, i)
                                                   \/ AnswersSiblingStop(r, i))})]
           /\ IF Seen # {}
                THEN /\ markPend' = [markPend EXCEPT ![r] = Max({upd[i] : i \in Seen})]
                     /\ markReady' = [markReady EXCEPT ![r] = ~MarkAfterAttempts]
                ELSE UNCHANGED <<markPend, markReady>>
    /\ seen' = IF ReReadHeartbeats THEN seen ELSE [seen EXCEPT ![r] = Fresh(r)]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, watch, alive, cur, polled, beat, missed,
                   branchVars, roster, trackerVars, behind, envVars, wrote>>

\* Pass over candidates that need no write, then act on the next one. A
\* cycle with no candidate left is over, and its mark may be appended. A
\* process that has stood down, or whose rank has left the roster, starts
\* nothing, and its cycle's mark is held below the oldest candidate it did
\* not attempt.
Choose(r) ==
    /\ up[r] /\ pc[r] = "choose"
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
            ELSE IF label[i] /\ h = r /\ ~(ReleaseOnTakeover /\ overGone)
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
                   roster, behind, envVars, wrote>>

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
                   ELSE [msgs EXCEPT ![i] = Append(kept, r)]
    /\ Touch(cur[r])
    /\ pc' = [pc EXCEPT ![r] = IF ~HandoverContest /\ handed[cur[r]]
                                 THEN "work" ELSE "verify"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, polled, markPend,
                   markReady, beat, missed, label, stop, done, handed, asked,
                   fresh, pr, branchVars, roster, behind, envVars, wrote>>

\* Re-read the item after the settle interval. A process that has stood down
\* stands down from the claim too, leaving its message. A process whose rank
\* has left the roster goes on with a claim it holds, as shutdown finishes
\* the item in hand. A stop seen here is answered, releasing the claim, only
\* under ~HolderReleases or where no sibling's message holds the item;
\* otherwise the process drops out silently, leaving the stop to the holder.
Verify(r) ==
    /\ up[r] /\ pc[r] = "verify"
    /\ LET i == cur[r] IN
       IF stop[i]
         THEN /\ IF ~HolderReleases \/ Holder(r, i) \in {0, r}
                   THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                   ELSE UNCHANGED trackerVars
              /\ cur' = [cur EXCEPT ![r] = 0]
              /\ pc' = [pc EXCEPT ![r] = "choose"]
       ELSE IF label[i] /\ Holder(r, i) = r /\ ~StoodDown(r)
         THEN /\ pc' = [pc EXCEPT ![r] = "work"]
              /\ UNCHANGED <<cur, trackerVars>>
       ELSE /\ cur' = [cur EXCEPT ![r] = 0]
            /\ pc' = [pc EXCEPT ![r] = "choose"]
            /\ IF ~LoserKeepsLabel /\ label[i] /\ ~StoodDown(r)
                 THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                 ELSE UNCHANGED trackerVars
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote>>

\* The claim is given back before its worker starts, for a reason other
\* than losing: its verification fails, or a failure before the worker
\* repeats (#173). Under HolderReleases the process removes the label only
\* where its own message holds the item; otherwise it drops out silently,
\* leaving the label to whichever rank holds the item.
FailClaim(r) ==
    /\ up[r] /\ pc[r] = "verify" /\ fails < MaxFails
    /\ LET i == cur[r] IN
       /\ ~stop[i]
       /\ IF label[i] /\ (~HolderReleases \/ Holder(r, i) = r)
            THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
            ELSE UNCHANGED trackerVars
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ fails' = fails + 1
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, crashes, losses,
                   stops, misses, handovers, retires, clockSteps, prs, wrote>>

\* A checkpoint in the worker's run sees a stop: the run halts and the claim
\* is released, a person's label included.
Checkpoint(r) ==
    /\ up[r] /\ pc[r] = "work" /\ stop[cur[r]]
    /\ Release(cur[r]) /\ UNCHANGED <<stop, done, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote>>

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
                   envVars, wrote>>

\* The run opens the Igor's pull request, and has not yet finished. A crash
\* now leaves a claim on an item whose pull request is open.
OpenPR(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]] /\ ~pr[cur[r]]
    /\ prs < MaxPRs
    /\ pr' = [pr EXCEPT ![cur[r]] = TRUE]
    /\ prs' = prs + 1
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, upd, stop, done,
                   clk, handed, asked, fresh, behind, crashes, losses, stops,
                   misses, handovers, retires, clockSteps, fails, wrote>>

\* The run finishes, after any number of poll intervals: its artifact is in
\* place, and it gives the claim back. A catch-up keeps a person's label.
Finish(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]]
    /\ done' = [done EXCEPT ![cur[r]] = TRUE]
    /\ GiveBack(cur[r]) /\ UNCHANGED <<stop, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote>>

\* A process whose rank has left the roster may hand its item off instead of
\* finishing it, out loud, giving the claim back as a finished run does.
HandOff(r) ==
    /\ up[r] /\ pc[r] = "work" /\ Retiring(r) /\ ~stop[cur[r]]
    /\ GiveBack(cur[r]) /\ UNCHANGED <<stop, done, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, branchVars, roster, behind, envVars, wrote>>

\* The next cycle begins once a poll interval has passed.
NextCycle(r) ==
    /\ up[r] /\ pc[r] = "idle" /\ polled[r]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, markPend, markReady, beat,
                   missed, branchVars, roster, trackerVars, behind, envVars,
                   wrote>>

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
                   branchVars, roster, trackerVars, behind, envVars>>

-----------------------------------------------------------------------------
(* Writes to the state branch *)

\* The cycle's mark lands in the log: this rank's latest line.
AppendMark(r) ==
    /\ up[r] /\ markPend[r] # NoMark /\ markReady[r]
    /\ mark' = [mark EXCEPT ![r] = markPend[r]]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, pc, seen, watch, alive, cand, cur, polled, beat, missed,
                   hbAge, roster, trackerVars, behind, envVars, wrote>>

\* This rank's heartbeat lands, from a timer that runs whatever the cycle is
\* doing: its counter goes up by one. The file changes, so every watcher's
\* count for this rank restarts, and every watcher has now seen it alive.
\* Under ~CounterLiveness a watcher compares times instead, and a write from
\* a rank whose clock is behind lands without counting for anyone,
\* though the rank itself counts it as written.
WriteHeartbeat(r) ==
    /\ up[r] /\ ~beat[r]
    /\ beat' = [beat EXCEPT ![r] = TRUE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ IF CounterLiveness \/ ~behind[r]
         THEN /\ watch' = [x \in Ranks |-> [watch[x] EXCEPT ![r] = 0]]
              /\ alive' = [x \in Ranks |-> [alive[x] EXCEPT ![r] = TRUE]]
         ELSE UNCHANGED <<watch, alive>>
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [hbAge EXCEPT ![r] = 0]
    /\ wrote' = [wrote EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady,
                   mark, roster, trackerVars, behind, envVars>>

-----------------------------------------------------------------------------
(* Time and the environment *)

\* One poll interval passes. A running process whose heartbeat has not
\* landed in the interval that is ending has missed one, which MaxMisses
\* bounds. A process that stood down for missed heartbeats has halted any
\* claim or run within HaltGap intervals (MustHaveHalted). Under VerifyWithinPoll no claim is still
\* between its message and its verification, which is how the model makes
\* verification come within one poll interval of the message. Every
\* release's second has passed.
Tick ==
    /\ LET M == {r \in Ranks : up[r] /\ ~beat[r]}
       IN  /\ misses + Cardinality(M) <= MaxMisses
           /\ misses' = misses + Cardinality(M)
    /\ \A r \in Ranks : (up[r] /\ MustHaveHalted(r)) => ~Busy(r)
    /\ VerifyWithinPoll => \A r \in Ranks : up[r] => pc[r] \notin {"post", "verify"}
    /\ watch' = [r \in Ranks |-> [q \in Ranks |->
                   IF q = r THEN 0 ELSE Older(watch[r][q])]]
    /\ missed' = [r \in Ranks |-> Older(missed[r])]
    /\ hbAge' = IF WatchAdvance THEN hbAge
                ELSE [q \in Ranks |-> Older(hbAge[q])]
    /\ beat' = [r \in Ranks |-> FALSE]
    /\ polled' = [r \in Ranks |-> TRUE]
    /\ fresh' = [i \in Items |-> FALSE]
    /\ UNCHANGED <<up, pc, seen, alive, cand, cur, markPend, markReady,
                   mark, roster, label, msgs, upd, stop, done, clk,
                   handed, asked, pr, behind, crashes, losses, stops,
                   handovers, retires, clockSteps, prs, fails, wrote>>

\* The second of the latest releases passes.
NextSecond ==
    /\ \E i \in Items : fresh[i]
    /\ fresh' = [i \in Items |-> FALSE]
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, upd, stop, done,
                   clk, handed, asked, pr, behind, envVars, wrote>>

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
                   clockSteps, prs, fails>>

\* The supervisor restarts it, if the roster still declares its rank. It
\* starts watching every sibling afresh, has seen none alive, and counts the
\* intervals without a heartbeat of its own from its start. It picks a new
\* id for its heartbeat file, so its first write changes the file whatever
\* the file held. On a host whose clock is behind, ClockStep may follow.
Restart(r) ==
    /\ ~up[r] /\ r \in roster
    /\ up' = [up EXCEPT ![r] = TRUE]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ watch' = [watch EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ alive' = [alive EXCEPT ![r] = [q \in Ranks |-> FALSE]]
    /\ beat' = [beat EXCEPT ![r] = FALSE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ UNCHANGED <<seen, cand, cur, polled, markPend, markReady,
                   branchVars, roster, trackerVars, behind, envVars, wrote>>

\* A rank's clock steps back, or the rank restarted on a host whose clock is
\* behind: the times it writes are earlier than the latest any watcher has
\* read from its file, and stay so. Only ~CounterLiveness reads this.
ClockStep(q) ==
    /\ up[q] /\ ~behind[q] /\ clockSteps < MaxClockSteps
    /\ behind' = [behind EXCEPT ![q] = TRUE]
    /\ clockSteps' = clockSteps + 1
    /\ UNCHANGED <<procVars, branchVars, roster, trackerVars, crashes, losses,
                   stops, misses, handovers, retires, prs, fails, wrote>>

\* The state branch is lost, reset or rolled back to an old commit. A lost
\* or reset branch changes no heartbeat file a watcher could read, so no
\* watch count changes. A rolled-back one puts older files back: under
\* CounterLiveness an older counter differs from the one last read, so it
\* reads as a change: for each rank in a chosen set S, every watcher's
\* count restarts and every watcher has now seen it alive. That only
\* postpones a verdict, and lets an old mark count, which lowers the mark. Under ~WatchAdvance every file reads as
\* old. The log is lost, or returns to an old commit. An old commit's marks
\* are no higher than today's, so the model keeps today's: the highest they
\* could be, which is the worst case for MarkNeverPassesUntaken.
LoseBranch ==
    /\ losses < MaxLosses
    /\ \/ mark' = [q \in Ranks |-> NoMark]
       \/ UNCHANGED mark
    /\ \E S \in (IF CounterLiveness THEN SUBSET Ranks ELSE {{}}) :
          /\ watch' = [x \in Ranks |-> [q \in Ranks |->
                          IF q \in S THEN 0 ELSE watch[x][q]]]
          /\ alive' = [x \in Ranks |-> [q \in Ranks |->
                          IF q \in S /\ q # x THEN TRUE ELSE alive[x][q]]]
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [q \in Ranks |-> Bound]
    /\ losses' = losses + 1
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady, beat,
                   missed, roster, trackerVars, behind, crashes, stops, misses,
                   handovers, retires, clockSteps, prs, fails, wrote>>

\* A person says stop on an item.
SayStop(i) ==
    /\ stops < MaxStops /\ ~stop[i] /\ ~done[i]
    /\ stop' = [stop EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ stops' = stops + 1
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, done, handed,
                   asked, fresh, pr, behind, crashes, losses, misses,
                   handovers, retires, clockSteps, prs, fails, wrote>>

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
                   prs, fails, wrote>>

\* An operator removes a rank from the roster.
Retire(q) ==
    /\ retires < MaxRetires /\ q \in roster
    /\ roster' = roster \ {q}
    /\ retires' = retires + 1
    /\ UNCHANGED <<procVars, branchVars, trackerVars, behind, crashes, losses,
                   stops, misses, handovers, clockSteps, prs, fails, wrote>>

-----------------------------------------------------------------------------
Step(r) == Begin(r) \/ Choose(r) \/ Post(r) \/ Verify(r) \/ Checkpoint(r)
           \/ Halt(r) \/ Finish(r) \/ HandOff(r) \/ NextCycle(r)

Next ==
    \/ \E r \in Ranks : Step(r) \/ AppendMark(r) \/ WriteHeartbeat(r)
                        \/ OpenPR(r) \/ FailClaim(r) \/ Exit(r) \/ Crash(r)
                        \/ Restart(r)
                        \/ Retire(r) \/ ClockStep(r)
    \/ Tick
    \/ NextSecond
    \/ LoseBranch
    \/ \E i \in Items : SayStop(i) \/ HandOver(i)

\* Running processes make progress, their writes land, workers finish, a
\* process whose rank left the roster exits, and time passes. Nothing obliges
\* a crashed process to restart, or a person to say anything.
Fairness ==
    /\ \A r \in Ranks : WF_vars(Step(r)) /\ WF_vars(AppendMark(r))
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
            \cup {markPend[q] : q \in {x \in Ranks : markPend[x] # NoMark}}
Canon(v) == IF v = NoMark THEN NoMark
            ELSE Cardinality({w \in TimeVals : w < v})

StateView == <<up, pc, seen, watch, alive, cand, cur, polled,
          [q \in Ranks |-> Canon(markPend[q])], markReady, beat, missed,
          hbAge, [q \in Ranks |-> Canon(mark[q])], roster,
          label, msgs, [i \in Items |-> Canon(upd[i])], stop, done, handed,
          asked, fresh, pr, behind, envVars, wrote>>

-----------------------------------------------------------------------------
(* Invariants. Each names, by its exact title, the requirement it proves. *)

TypeOK ==
    /\ up \in [Ranks -> BOOLEAN]
    /\ pc \in [Ranks -> {"down", "read", "choose", "post", "verify", "work",
                         "idle"}]
    /\ cur \in [Ranks -> 0..NItems]
    /\ watch \in [Ranks -> [Ranks -> 0..Bound]]
    /\ alive \in [Ranks -> [Ranks -> BOOLEAN]]
    /\ missed \in [Ranks -> 0..Bound]
    /\ roster \subseteq Ranks
    /\ label \in [Items -> BOOLEAN]
    /\ stop \in [Items -> BOOLEAN]
    /\ done \in [Items -> BOOLEAN]
    /\ handed \in [Items -> BOOLEAN]
    /\ fresh \in [Items -> BOOLEAN]
    /\ pr \in [Items -> BOOLEAN]
    /\ behind \in [Ranks -> BOOLEAN]
    /\ fails \in 0..MaxFails

\* Requirements: "A claim names the process that took it", "Assignment
\* expresses a claim; ordering resolves it", "A hand-over among one role's
\* ranks is contested like found work" and "A claim left on the Igor's open
\* pull request is caught up" (work-claiming).
\* Never two live workers on one item, a catch-up's included.
NoTwoWorkers ==
    \A i \in Items :
        Cardinality({r \in Ranks : up[r] /\ pc[r] = "work" /\ cur[r] = i}) <= 1

\* Requirement: "A retired rank does not hold its items forever"
\* (work-claiming), with its scenarios "The bound does not shorten a run",
\* "A lost state branch takes no live rank's claim", "A rolled-back state
\* branch takes no live rank's claim" and "A rank whose clock goes back is
\* still counted".
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

-----------------------------------------------------------------------------
(* Liveness, in behaviours where some process is eventually always running *)

SomeUpForever == <>[](\E r \in Ranks : up[r])

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
            (label[i] /\ ~done[i] /\ \A r \in Ranks : ~(up[r] /\ cur[r] = i))
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
