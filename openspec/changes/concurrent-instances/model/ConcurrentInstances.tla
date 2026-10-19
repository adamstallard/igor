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
(* A heartbeat file holds a counter the rank increments on each write, an *)
(* id the process picks when it starts, and whether the rank is           *)
(* available: free, holding no claim, and with a seat it may spend. The   *)
(* model has no seats, so there available means free. A process judges a  *)
(* sibling gone only once it has itself watched the sibling's file fail   *)
(* to change for three of its polls. So what the model tracks, for each   *)
(* watching process and watched rank, is that count, `watch`, which a     *)
(* heartbeat write resets and each poll interval advances. A lost state   *)
(* branch changes no count. A rolled-back one may put an older counter    *)
(* back, which reads as a change, so it may reset some counts: that only  *)
(* postpones a verdict.                                                   *)
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
(* other than losing: a verification read that errors, which removes      *)
(* nothing, or a set-down after a repeated failure before the worker      *)
(* (#173), which only the rank whose claim message holds the item makes,  *)
(* removing the label; any other rank drops out silently. A stop on a     *)
(* handed-over item is answered only by the rank whose message holds it,  *)
(* or, where no message counts, by whichever rank reaches it.             *)
(*                                                                         *)
(* Not modelled: `deferred.json` (no requirement here reads it for        *)
(* safety), the settle interval's length (claims are visible at once, and *)
(* the rank-proportional wait is not assumed to order anything), a        *)
(* go-ahead or cooldown after a stop (a stop here is permanent), the      *)
(* triage call itself (triage always says proceed), the tree sweep, and   *)
(* the catch-up's triage, which passes over an item whose pull request    *)
(* still merges until the item or its pull request changes.               *)
(*                                                                         *)
(* Each item has an owner among the roster's ranks, picked by a hash of   *)
(* its id: here the declared rank at place (id - 1) mod n of the n ranks  *)
(* the roster declares, in order, counting places from 0. The owner goes  *)
(* first for it; where the owner is not available, the next available     *)
(* rank after it in roster order, wrapping, goes first. A process         *)
(* attempts the items it goes first for before the others. That only      *)
(* orders the attempts: the claim message and its verification still      *)
(* decide who works an item, so a stale heartbeat read causes contention, *)
(* never two workers.                                                     *)
(*                                                                         *)
(* Processes and ranks are not one-to-one. Process r, for r in 1..NRanks, *)
(* is the serving rank r. Each process after those is an `igor run`, at   *)
(* rank 0: outside the roster, with its own heartbeat file, contending    *)
(* for items as any rank does. It runs one cycle, starts at most once,    *)
(* and takes over no claim message, its own rank's included. It owns no   *)
(* item, and comes after every available serving rank in each item's      *)
(* order. Two of them (NRuns = 2) may run at once, as two people running  *)
(* `igor run` would.                                                      *)
(*                                                                         *)
(* A person may edit a claim message (`EditMsg`), and an edited message   *)
(* counts for nothing, so an edit removes it from the messages that       *)
(* count, wherever it stands among them.                                  *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    NRanks,            \* serving ranks 1..NRanks
    NRuns,             \* `igor run` processes, each at rank 0: 0, 1 or 2
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
    VerifyClaims,      \* a process verifies every claim it posts; FALSE: it
                       \* works at once an item it goes first for, trusting
                       \* ownership and its heartbeat read
    OwnerFirst         \* a process attempts the items it goes first for
                       \* before the others; FALSE: every process attempts
                       \* them in the source's order

Items == 1..NItems

\* The ranks: 0 is `igor run`'s, present only where an `igor run` may start.
Ranks == IF NRuns > 0 THEN 0..NRanks ELSE 1..NRanks

\* The processes: the serving rank r is process r, and each process after
\* NRanks is an `igor run`, at rank 0.
Procs == 1..(NRanks + NRuns)
IsRun(p) == p > NRanks
Rank(p) == IF IsRun(p) THEN 0 ELSE p

NoMark   == -1  \* a rank with no line in the discovery log
NoHolder == -1  \* no claim message that counts holds the item

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
    hbAvail,   \* hbAvail[q]: what rank q's heartbeat file says: "available",
               \* "unavailable", or "none" for a missing file
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
    fails, edits,
    \* ghost
    wrote      \* wrote[r]: process r has written its heartbeat since it last
               \* started; read by LiveRankNeverGone

procVars    == <<up, pc, seen, watch, alive, cand, cur, polled, markPend,
                 markReady, beat, missed>>
branchVars  == <<hbAge, mark, hbAvail>>
trackerVars == <<label, msgs, upd, stop, done, clk, handed, asked, fresh, pr>>
envVars     == <<crashes, losses, stops, misses, handovers, retires,
                 clockSteps, prs, fails, edits>>
vars        == <<procVars, branchVars, roster, trackerVars, behind, envVars,
                 wrote>>

-----------------------------------------------------------------------------
(* Helpers *)

Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Range(s) == {s[k] : k \in 1..Len(s)}
Older(a) == IF a >= Bound THEN Bound ELSE a + 1

\* Item i is above mark k: discovery offers it to a cycle replaying k.
Above(i, k) == upd[i] > k

\* What r would read now from the heartbeat files: its own watch counts, or
\* under ~WatchAdvance the ages of the files.
ReadNow(r) == IF WatchAdvance THEN watch[r]
            ELSE [q \in Ranks |-> IF q = Rank(r) THEN 0 ELSE hbAge[q]]

\* What r decides by: a fresh read, or the read at the start of its cycle.
View(r) == IF ReReadHeartbeats THEN ReadNow(r) ELSE seen[r]

\* Rank q is gone to process r: past the bound, or under ~RosterWaits a
\* serving rank missing from the roster. A process never counts its own
\* rank gone. Rank 0 is outside the roster, so only the bound makes it gone.
Gone(r, q) == q # Rank(r)
              /\ ((~RosterWaits /\ q # 0 /\ q \notin roster) \/ View(r)[q] >= Bound)

\* A process stands down when it has failed to write its heartbeat for
\* StandDownAt intervals, whether or not its rank is still in the roster.
StoodDown(r) == StandDownOnMisses /\ missed[r] >= StandDownAt

\* A serving process whose rank has left the roster starts no claim,
\* finishes or hands off its item (Finish, HandOff), and then exits (Exit).
\* Leaving the roster alone does not make it stand down.
Retiring(r) == ~IsRun(r) /\ Rank(r) \notin roster

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
\* message that counts whose rank is not gone; NoHolder if none.
Holder(r, i) ==
    LET ks == {k \in 1..Len(msgs[i]) : ~Gone(r, msgs[i][k])}
    IN  IF ks = {} THEN NoHolder ELSE msgs[i][Min(ks)]

\* Item i is held, in r's view, by a sibling whose claim message counts.
HeldBySibling(r, i) == label[i] /\ Holder(r, i) \notin {NoHolder, Rank(r)}

\* Under ~HolderStops, r answers a stop on a handed-over item a sibling
\* holds, rather than passing it over.
AnswersSiblingStop(r, i) == ~HolderStops /\ stop[i] /\ handed[i]

\* The roster's ranks in order, and item i's ranks in the order they go
\* first for it: its owner, the declared rank at place (i - 1) mod n of the
\* n declared ranks in order, then each declared rank after it, wrapping,
\* then `igor run`'s rank 0.
RosterSeq == SelectSeq([j \in 1..NRanks |-> j], LAMBDA q : q \in roster)
ItemRanks(i) ==
    LET s == RosterSeq
        n == Len(s)
        o == IF n = 0 THEN 0 ELSE (i - 1) % n
        tail == IF NRuns > 0 THEN <<0>> ELSE <<>>
    IN  [j \in 1..n |-> s[((o + j - 1) % n) + 1]] \o tail

\* Rank q is available to r: r itself, or a rank whose heartbeat file says
\* available and that r does not count gone.
Avail(r, q) == q = Rank(r) \/ (hbAvail[q] = "available" /\ ~Gone(r, q))

\* In r's view, r goes first for item i: no available rank comes before it
\* in the item's order.
GoesFirst(r, i) ==
    LET s == ItemRanks(i)
        ks == {k \in 1..Len(s) : Avail(r, s[k])}
    IN  ks # {} /\ s[Min(ks)] = Rank(r)

\* The order r attempts candidates C in: under OwnerFirst, those it goes
\* first for, then the rest, each in the source's order.
Ident == [j \in 1..NItems |-> j]
Order(r, C) ==
    IF OwnerFirst
      THEN SelectSeq(Ident, LAMBDA i : i \in C /\ GoesFirst(r, i))
           \o SelectSeq(Ident, LAMBDA i : i \in C /\ ~GoesFirst(r, i))
      ELSE SelectSeq(Ident, LAMBDA i : i \in C)

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
\* only the rank whose own message holds it takes it. `igor run` takes over
\* no claim message, so it passes over every labelled item that carries one.
Passed(r, i) == \/ done[i] \/ (HeldBySibling(r, i) /\ ~AnswersSiblingStop(r, i))
                \/ (stop[i] /\ ~label[i])
                \/ (~CatchUpAny /\ pr[i] /\ label[i] /\ Holder(r, i) # Rank(r))
                \/ (IsRun(r) /\ label[i] /\ msgs[i] # <<>>)

RECURSIVE SkipPassed(_, _)
SkipPassed(r, s) == IF s = <<>> THEN s
                    ELSE IF Passed(r, Head(s)) THEN SkipPassed(r, Tail(s))
                    ELSE s

-----------------------------------------------------------------------------
Init ==
    /\ up = [r \in Procs |-> ~IsRun(r)]
    /\ pc = [r \in Procs |-> IF IsRun(r) THEN "never" ELSE "read"]
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
    /\ hbAvail = [q \in Ranks |-> IF q = 0 THEN "none" ELSE "available"]
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
    /\ edits = 0
    /\ wrote = [r \in Procs |-> ~IsRun(r)]

-----------------------------------------------------------------------------
(* A process's cycle *)

\* The cycle begins: read the heartbeat files, then discover. Every item
\* above the replayed mark is a candidate, and so under LabelSweep is every
\* labelled item, except an item a sibling holds, which is passed over
\* before triage. Triage is taken to say proceed for each candidate not
\* done. The cycle's mark passes the newest update time among the items
\* above the replayed mark. A serving process whose rank has left the
\* roster starts no cycle.
Begin(r) ==
    /\ up[r] /\ pc[r] = "read" /\ (IsRun(r) \/ Rank(r) \in roster)
    /\ HeartbeatFirst => wrote[r]
    /\ LET M    == ReplayMark(r)
           Seen == {i \in Items : Above(i, M)}
       IN  /\ cand' = [cand EXCEPT ![r] =
                        Order(r,
                              {i \in Seen \cup {j \in Items : LabelSweep /\ label[j]} :
                                 ~done[i] /\ (~HeldBySibling(r, i)
                                               \/ AnswersSiblingStop(r, i))})]
           /\ IF Seen # {}
                THEN /\ markPend' = [markPend EXCEPT ![r] = Max({upd[i] : i \in Seen})]
                     /\ markReady' = [markReady EXCEPT ![r] = ~MarkAfterAttempts]
                ELSE UNCHANGED <<markPend, markReady>>
    /\ seen' = IF ReReadHeartbeats THEN seen ELSE [seen EXCEPT ![r] = ReadNow(r)]
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
            ELSE IF label[i] /\ h = Rank(r) /\ ~(ReleaseOnTakeover /\ overGone)
              \* Its own rank's claim: the predecessor died. Work it again,
              \* or, with its pull request open, catch it up. Under
              \* ReleaseOnTakeover, only when no gone rank's message is on the
              \* item; otherwise the next branch takes it over. `igor run`
              \* never comes here: Passed skips every labelled item carrying
              \* a claim message.
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
\* Under ~HandoverContest a handed-over item is worked at once, unverified,
\* and under ~VerifyClaims so is an item the poster goes first for.
Post(r) ==
    /\ up[r] /\ pc[r] = "post"
    /\ LET i == cur[r]
           kept == IF pr[i] /\ CatchUpSupersedes
                     THEN SelectSeq(msgs[i], LAMBDA q : ~Gone(r, q))
                     ELSE msgs[i]
       IN  msgs' = IF fresh[i] THEN msgs
                   ELSE [msgs EXCEPT ![i] = Append(kept, Rank(r))]
    /\ Touch(cur[r])
    /\ pc' = [pc EXCEPT ![r] = IF (~HandoverContest /\ handed[cur[r]])
                                    \/ (~VerifyClaims /\ GoesFirst(r, cur[r]))
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
         THEN /\ IF ~HolderReleases \/ Holder(r, i) \in {NoHolder, Rank(r)}
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
                   beat, missed, branchVars, roster, behind, envVars, wrote>>

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
                   stops, misses, handovers, retires, clockSteps, prs,
                   edits, wrote>>

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
                   misses, handovers, retires, clockSteps, fails, edits,
                   wrote>>

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

\* The next cycle begins once a poll interval has passed. `igor run` runs
\* one cycle only.
NextCycle(r) ==
    /\ up[r] /\ pc[r] = "idle" /\ polled[r] /\ ~IsRun(r)
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, markPend, markReady, beat,
                   missed, branchVars, roster, trackerVars, behind, envVars,
                   wrote>>

\* A process whose rank has left the roster exits once its item is finished
\* or handed off and its cycle's mark has landed. Its exit is clean, so the
\* supervisor does not restart it.
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

\* `igor run` ends once its one cycle is over and its mark has landed.
RunExit(r) ==
    /\ up[r] /\ IsRun(r) /\ pc[r] = "idle" /\ markPend[r] = NoMark
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "ended"]
    /\ UNCHANGED <<seen, watch, alive, cand, cur, polled, markPend, markReady,
                   beat, missed, branchVars, roster, trackerVars, behind,
                   envVars, wrote>>

-----------------------------------------------------------------------------
(* Writes to the state branch *)

\* The cycle's mark lands in the log: this rank's latest line.
AppendMark(r) ==
    /\ up[r] /\ markPend[r] # NoMark /\ markReady[r]
    /\ mark' = [mark EXCEPT ![Rank(r)] = markPend[r]]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, pc, seen, watch, alive, cand, cur, polled, beat, missed,
                   hbAge, hbAvail, roster, trackerVars, behind, envVars, wrote>>

\* This process's heartbeat lands, from a timer that runs whatever the cycle
\* is doing: its counter goes up by one, and the file says whether the
\* process is available, which in the model is having no claim in hand:
\* not between posting a claim message and finishing or giving it back. A
\* process that has stood down has written no heartbeat since, and one that
\* resumes keeps the claims it left in silence. The file changes, so every watcher's count for
\* this rank restarts, and every watcher has now seen it alive. Under
\* ~CounterLiveness a watcher compares times instead, and a write from a
\* process whose clock is behind lands without counting for anyone, though
\* the process itself counts it as written.
\*
\* With one item, every process attempts the same one item whatever it
\* goes first for, so a configuration with one item does not track
\* availability, which only orders the attempts, and keeps its state space
\* smaller.
WriteHeartbeat(r) ==
    /\ up[r] /\ ~beat[r]
    /\ LET k == Rank(r) IN
       /\ beat' = [beat EXCEPT ![r] = TRUE]
       /\ missed' = [missed EXCEPT ![r] = 0]
       /\ IF CounterLiveness \/ ~behind[r]
            THEN /\ watch' = [x \in Procs |-> [watch[x] EXCEPT ![k] = 0]]
                 /\ alive' = [x \in Procs |-> [alive[x] EXCEPT ![k] = TRUE]]
            ELSE UNCHANGED <<watch, alive>>
       /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [hbAge EXCEPT ![k] = 0]
       /\ hbAvail' = IF NItems > 1
                      THEN [hbAvail EXCEPT ![k] = IF Busy(r) THEN "unavailable"
                                                                 ELSE "available"]
                      ELSE hbAvail
    /\ wrote' = [wrote EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady,
                   mark, roster, trackerVars, behind, envVars>>

-----------------------------------------------------------------------------
(* Time and the environment *)

\* One poll interval passes. A running process whose heartbeat has not
\* landed in the interval that is ending has missed one, which MaxMisses
\* bounds. Only a running process's counts advance: a process that is down
\* starts its counts afresh when it starts. A process that stood down for
\* missed heartbeats has halted any claim or run within HaltGap intervals
\* (MustHaveHalted). Under VerifyWithinPoll no claim is still between its
\* message and its verification, which is how the model makes verification
\* come within one poll interval of the message. Every release's second has
\* passed.
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
                   mark, hbAvail, roster, label, msgs, upd, stop,
                   done, clk, handed, asked, pr, behind, crashes, losses, stops,
                   handovers, retires, clockSteps, prs, fails, edits, wrote>>

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
                   clockSteps, prs, fails, edits>>

\* A process starts: it watches every sibling afresh, has seen none alive,
\* and counts the intervals without a heartbeat of its own from its start.
\* It picks a new id for its heartbeat file, so its first write changes the
\* file whatever the file held.
Start(r) ==
    /\ up' = [up EXCEPT ![r] = TRUE]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ watch' = [watch EXCEPT ![r] = [q \in Ranks |-> 0]]
    /\ alive' = [alive EXCEPT ![r] = [q \in Ranks |-> FALSE]]
    /\ beat' = [beat EXCEPT ![r] = FALSE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ UNCHANGED <<seen, cand, cur, polled, markPend, markReady,
                   branchVars, roster, trackerVars, behind, envVars, wrote>>

\* The supervisor restarts a crashed serving rank, if the roster still
\* declares it. On a host whose clock is behind, ClockStep may follow.
Restart(r) ==
    /\ ~IsRun(r) /\ ~up[r] /\ pc[r] = "down" /\ r \in roster
    /\ Start(r)

\* An `igor run` starts, once, at rank 0. It waits for nothing and checks
\* no serving rank first.
StartRun(r) ==
    /\ IsRun(r) /\ pc[r] = "never"
    /\ Start(r)

\* A rank's clock steps back, or the rank restarted on a host whose clock is
\* behind: the times it writes are earlier than the latest any watcher has
\* read from its file, and stay so. Only ~CounterLiveness reads this.
ClockStep(q) ==
    /\ up[q] /\ ~behind[q] /\ clockSteps < MaxClockSteps
    /\ behind' = [behind EXCEPT ![q] = TRUE]
    /\ clockSteps' = clockSteps + 1
    /\ UNCHANGED <<procVars, branchVars, roster, trackerVars, crashes, losses,
                   stops, misses, handovers, retires, prs, fails, edits,
                   wrote>>

\* The state branch is lost, reset or rolled back to an old commit. A lost
\* or reset branch changes no heartbeat file a watcher could read, so no
\* watch count changes. A rolled-back one puts older files back: under
\* CounterLiveness an older counter differs from the one last read, so it
\* reads as a change: for each rank in a chosen set S, every watcher's
\* count restarts and every watcher has now seen it alive. That only
\* postpones a verdict, and lets that rank's latest mark count again where
\* it had stopped counting, which can only lower the mark. Under
\* ~WatchAdvance every file reads as old. The log is lost, or returns to an
\* old commit. An old commit's marks are no higher than today's, so the
\* model keeps today's: the highest they could be, which is the worst case
\* for MarkNeverPassesUntaken. A lost branch takes the availability flags
\* with the files, so every rank reads as missing until it writes again; a
\* rollback is taken to leave them, since the order of attempts decides
\* nothing the invariants check. No process stops on what a loss or a
\* rollback puts in a file.
LoseBranch ==
    /\ losses < MaxLosses
    /\ \/ mark' = [q \in Ranks |-> NoMark]
       \/ UNCHANGED mark
    /\ \E S \in (IF CounterLiveness THEN SUBSET Ranks ELSE {{}}) :
          /\ watch' = [x \in Procs |-> [q \in Ranks |->
                          IF q \in S THEN 0 ELSE watch[x][q]]]
          /\ alive' = [x \in Procs |-> [q \in Ranks |->
                          IF q \in S /\ q # Rank(x) THEN TRUE ELSE alive[x][q]]]
    /\ \/ NItems > 1 /\ hbAvail' = [q \in Ranks |-> "none"]
       \/ UNCHANGED hbAvail
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [q \in Ranks |-> Bound]
    /\ losses' = losses + 1
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady, beat,
                   missed, roster, trackerVars, behind, crashes,
                   stops, misses, handovers, retires, clockSteps, prs, fails,
                   edits, wrote>>

\* A person says stop on an item.
SayStop(i) ==
    /\ stops < MaxStops /\ ~stop[i] /\ ~done[i]
    /\ stop' = [stop EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ stops' = stops + 1
    /\ UNCHANGED <<procVars, branchVars, roster, label, msgs, done, handed,
                   asked, fresh, pr, behind, crashes, losses, misses,
                   handovers, retires, clockSteps, prs, fails, edits, wrote>>

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
                   prs, fails, edits, wrote>>

\* An operator removes a serving rank from the roster.
Retire(q) ==
    /\ retires < MaxRetires /\ q \in roster
    /\ roster' = roster \ {q}
    /\ retires' = retires + 1
    /\ UNCHANGED <<procVars, branchVars, trackerVars, behind, crashes, losses,
                   stops, misses, handovers, clockSteps, prs, fails,
                   edits, wrote>>

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
                   handovers, retires, clockSteps, prs, fails, wrote>>

-----------------------------------------------------------------------------
Step(r) == Begin(r) \/ Choose(r) \/ Post(r) \/ Verify(r) \/ Checkpoint(r)
           \/ Halt(r) \/ Finish(r) \/ HandOff(r) \/ NextCycle(r)
           \/ RunExit(r)

Next ==
    \/ \E r \in Procs : Step(r) \/ AppendMark(r) \/ WriteHeartbeat(r)
                        \/ OpenPR(r) \/ FailClaim(r) \/ Exit(r) \/ Crash(r)
                        \/ Restart(r) \/ StartRun(r) \/ ClockStep(r)
    \/ \E q \in 1..NRanks : Retire(q)
    \/ Tick
    \/ NextSecond
    \/ LoseBranch
    \/ \E i \in Items : SayStop(i) \/ HandOver(i) \/ EditMsg(i)

\* Running processes make progress, their writes land, workers finish, a
\* process whose rank left the roster exits, and time passes. Nothing obliges
\* a crashed process to restart, an `igor run` to start, or a person to say
\* anything.
Fairness ==
    /\ \A r \in Procs : WF_vars(Step(r)) /\ WF_vars(AppendMark(r))
                        /\ WF_vars(WriteHeartbeat(r)) /\ WF_vars(Exit(r))
    /\ WF_vars(Tick)
    /\ WF_vars(NextSecond)

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* The view TLC fingerprints states by *)

\* Update times matter only by the order of the items they belong to, and
\* a mark only by which items it passes. Every guard asks Above(i, k), takes
\* the least or greatest of marks, or takes the greatest update time among
\* some items; a new update time is always the latest, and a new mark is
\* an item's update time or one less, so it passes exactly the items
\* updated before that item, or that item too. Times are whole numbers, and no
\* item's time lies strictly between an item's time less one and the next
\* lower time any item had, so a mark at either passes the same items. So a state is fixed, up to
\* everything any step can tell apart, by each item's place among the
\* items' update times and each mark's count of items it passes: a
\* renaming of times that keeps those maps every step of one state onto a
\* step of the other. StateView keeps just those. clk is left out: it is
\* always the greatest update time.
ItemPlace(i) == Cardinality({j \in Items : upd[j] < upd[i]})
Passes(k) == IF k = NoMark THEN NoMark ELSE Cardinality({j \in Items : upd[j] <= k})

StateView == <<up, pc, seen, watch, alive, cand, cur, polled,
          [p \in Procs |-> Passes(markPend[p])], markReady, beat, missed,
          hbAge, [q \in Ranks |-> Passes(mark[q])], hbAvail, roster,
          label, msgs, [i \in Items |-> ItemPlace(i)], stop, done, handed,
          asked, fresh, pr, behind, envVars, wrote>>

-----------------------------------------------------------------------------
(* Invariants. Each names, by its exact title, the requirement it proves. *)

TypeOK ==
    /\ up \in [Procs -> BOOLEAN]
    /\ pc \in [Procs -> {"never", "down", "read", "choose", "post", "verify",
                         "work", "idle", "ended"}]
    /\ cur \in [Procs -> 0..NItems]
    /\ watch \in [Procs -> [Ranks -> 0..Bound]]
    /\ alive \in [Procs -> [Ranks -> BOOLEAN]]
    /\ missed \in [Procs -> 0..Bound]
    /\ hbAvail \in [Ranks -> {"available", "unavailable", "none"}]
    /\ roster \subseteq 1..NRanks
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
\* ranks is contested like found work", "A claim left on the Igor's open
\* pull request is caught up" and "A run by hand runs as rank 0"
\* (work-claiming).
\* Never two live workers on one item, a catch-up's and an `igor run`'s
\* included.
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
        Below(i)   == \E r \in Procs : up[r] /\ pc[r] # "read" /\ Above(i, ReplayMark(r))
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
