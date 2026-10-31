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
(* The state branch holds one heartbeat file per serving rank and per    *)
(* `igor run`, and the replayed `discovery.json` log reduced to what the  *)
(* replay reads: each rank's latest mark for the one source.              *)
(*                                                                         *)
(* A heartbeat file holds a counter its process increments on each write, *)
(* an id the process picks when it starts, and whether the process is     *)
(* available: free, holding no claim, and with a seat it may spend. The   *)
(* model has no seats, so there available means free. A process judges a  *)
(* sibling gone only once it has itself watched the sibling's file fail   *)
(* to change for three of its polls. So what the model tracks, for each   *)
(* watching process and watched process, is that count, `watch`, which a *)
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
(* other than losing: its claim message fails to post, or its             *)
(* verification read errors. The process then reads the item's claim      *)
(* messages again, #173's test. Where another process's message counts,   *)
(* it drops out silently. Where its own message holds the item, it gives  *)
(* the claim back out loud and removes the label, in a step of its own    *)
(* after the test (`withdraw`). Where no message counts, it removes the   *)
(* label only where it set the label in this claim and its message failed *)
(* to post, within half a settle interval of setting it, which the model  *)
(* makes one step with the test; otherwise it leaves the label. Where the *)
(* test read fails too, it removes nothing, and reads again at its next   *)
(* cycle's start (`reread`), or, for an `igor run`, before it exits,      *)
(* deciding as at the test. A stop on a handed-over item is answered only *)
(* by the process whose message holds it, or, where no message counts, by *)
(* whichever process reaches it.                                          *)
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
(* rank 0: outside the roster, contending for items as any rank does. It  *)
(* runs one cycle, starts at most once, and takes over no claim message,  *)
(* its own rank's included. It owns no item, and comes after every        *)
(* available serving rank in each item's order. Two of them (NRuns = 2)   *)
(* may run at once, as two people running `igor run` would. Each run      *)
(* writes a heartbeat file of its own, and its claim messages carry its   *)
(* run id beside rank 0, so a claim message names one process: the model  *)
(* writes the process's number in it, and heartbeat files are indexed by  *)
(* process. A serving rank's restarted process writes its predecessor's   *)
(* number, which is how it recovers its predecessor's claims.             *)
(*                                                                         *)
(* Each process applies the roster and the poll interval of the lore      *)
(* commit it last fetched, at its own cycle start (`rv`, `plen`), so      *)
(* processes run on different commits at once. The lore head, the newest  *)
(* commit of the lore repository's branch, may drop a rank (`Retire`) or  *)
(* double the poll interval (`ChangePoll`); a process applies the head,   *)
(* or keeps what it had, at each cycle start; the head may change back.  *)
(* With the poll interval able to change, time is counted in the shorter  *)
(* interval. Each heartbeat declares its process's interval (`decl`). A    *)
(* process counts a sibling gone after three of the longest of its own     *)
(* interval and the intervals it saw the sibling declare in a write since  *)
(* it started and since the last loss or rollback (`seenDecl`), or three   *)
(* of the maximum poll interval (`CeilLen`) where it saw none. It stands   *)
(* down after two of the shortest interval it has applied since it started *)
(* (`minLen`). It writes a heartbeat every half of its own interval, and   *)
(* one write lands per shorter interval: on the shorter interval two       *)
(* writes count as one, and on the longer each write counts                *)
(* (`WriteHeartbeat`).                                                     *)
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
    MaxPollChanges,    \* times the lore head's poll interval changes: 0, 1
                       \* or 2, the second changing it back
    StartLen,          \* the head's poll interval when every process starts:
                       \* 1, or 2 as after a change made before they started
    CeilLen,           \* the maximum poll interval a configuration may set,
                       \* at least every interval the configuration uses
    MissOnly,          \* 0, or the one process that may miss heartbeats, to
                       \* split a configuration too large for one CI job
    CrashOnly,         \* 0, or the one process that may crash, likewise
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
    OwnerFirst,        \* a process attempts the items it goes first for
                       \* before the others; FALSE: every process attempts
                       \* them in the source's order
    RunIds,            \* an `igor run`'s claim message carries its run id,
                       \* compared where the rank is 0; FALSE: rank 0 only
    SettleWithdraw,    \* where no claim message counts, a process removes
                       \* the label only if it set it in this claim, its
                       \* message failed to post, and half a settle interval
                       \* has not passed; FALSE: whenever no claim message
                       \* counts
    RereadKeepsLabel,  \* a reread that fails again, an unreadable claim,
                       \* gives the claim back or sets the item down and
                       \* leaves the label; FALSE: it removes the label
    DeclaredInterval,  \* a heartbeat declares its process's poll interval; a
                       \* process counts a sibling gone after three of the
                       \* longest of its own interval and those the
                       \* sibling's file has declared to it since it
                       \* started, and stands down after two of the shortest
                       \* interval it has applied since it started; FALSE:
                       \* each counts in its own current interval
    Ceiling            \* a watcher holding no declaration from a sibling,
                       \* written since it started and since the last loss
                       \* or rollback of the state branch, counts in the
                       \* maximum poll interval, and a loss clears what
                       \* it saw; FALSE: it counts in the longest of its
                       \* own interval, what the file says now and what
                       \* it saw the sibling's file declare in a write,
                       \* kept across a loss

Items == 1..NItems

\* The ranks, which discovery marks are kept by: 0 is `igor run`'s, present
\* only where an `igor run` may start.
Ranks == IF NRuns > 0 THEN 0..NRanks ELSE 1..NRanks

\* The processes: the serving rank r is process r, and each process after
\* NRanks is an `igor run`, at rank 0.
Procs == 1..(NRanks + NRuns)
Serving == 1..NRanks
Runs == (NRanks + 1)..(NRanks + NRuns)
IsRun(p) == p > NRanks
Rank(p) == IF IsRun(p) THEN 0 ELSE p

\* What process p's claim message names: its own number, which for a
\* serving process is its rank; under ~RunIds an `igor run` names only
\* rank 0, which every run reads as its own.
Me(p) == IF IsRun(p) /\ ~RunIds THEN 0 ELSE p

\* Time is counted in the shorter poll interval; a process on the longer
\* one has plen = 2. Counts are capped where no threshold reads beyond.
MaxLen == IF MaxPollChanges > 0 \/ StartLen = 2 THEN 2 ELSE 1
Cap == Bound * (IF CeilLen > MaxLen THEN CeilLen ELSE MaxLen)
\* Declarations are tracked wherever two intervals can differ, the maximum
\* counted among them.
Tracked == DeclaredInterval /\ (MaxLen > 1 \/ CeilLen > 1)
ASSUME CeilLen >= MaxLen

\* The states between setting the label and verifying, and the withdrawal
\* after the test. "postnew" is a "post" whose process set the label in
\* this claim; Choose uses it only while fails < MaxFails, since only a
\* failed claim reads the difference.
Window == {"post", "postnew", "verify", "withdraw"}

NoMark   == -1  \* a rank with no line in the discovery log
NoHolder == -1  \* no claim message that counts holds the item

VARIABLES
    \* processes, indexed by Procs
    up,        \* up[r]: process r is running
    pc,        \* pc[r]: where process r is in its cycle
    seen,      \* seen[r]: the counts r read at the start of its cycle
    watch,     \* watch[r][q]: intervals since r last saw process q's
               \* heartbeat change, or since r started watching; capped
    alive,     \* alive[r][q]: r has seen process q's heartbeat change since
               \* r started
    cand,      \* cand[r]: the items r still means to attempt this cycle, in its order
    cur,       \* cur[r]: the item r is claiming or working, 0 for none
    polled,    \* polled[r]: a poll interval has passed since r's cycle began
    markPend,  \* markPend[r]: the mark r's cycle will append, NoMark for none
    markReady, \* markReady[r]: r's cycle has reached the point of appending it
    beat,      \* beat[r]: r has written its heartbeat in this interval
    missed,    \* missed[r]: intervals since r last wrote its heartbeat, capped
    reread,    \* reread[r]: the item whose claim messages r reads again at
               \* its next cycle's start, after a failed test; 0 for none
    rv,        \* rv[r]: the roster r applied at its latest cycle start
    plen,      \* plen[r]: the poll interval r applied then, 1 or 2
    spanned,   \* spanned[r]: r is on the longer poll interval, and an
               \* interval has ended since r set the label for the claim
               \* in hand
    seenDecl,  \* seenDecl[r][q]: the longest poll interval r saw q's file
               \* declare in a write, since r started and, under Ceiling,
               \* since the last loss (LoseBranch clears it); 0 for none;
               \* DeclaredInterval
    minLen,    \* minLen[r]: the shortest poll interval r has applied since it
               \* started; DeclaredInterval
    \* state branch
    hbAge,     \* hbAge[q]: age of q's heartbeat file, read only when ~WatchAdvance
    mark,      \* mark[k]: rank k's latest mark in the discovery log, or NoMark
    hbAvail,   \* hbAvail[q]: what process q's heartbeat file says: "available",
               \* "unavailable", or "none" for a missing file
    decl,      \* decl[q]: the poll interval q's file declares, 0 for a missing
               \* file; DeclaredInterval
    \* configuration: the lore head
    roster,    \* the ranks the head's roster declares
    pollHead,  \* the head's poll interval, 1 or 2
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
    fails, edits, pollChanges,
    \* ghost
    wrote      \* wrote[r]: process r has written its heartbeat since it last
               \* started; read by LiveRankNeverGone

procVars    == <<up, pc, seen, watch, alive, cand, cur, polled, markPend,
                 markReady, beat, missed, reread, rv, plen, spanned, seenDecl,
                 minLen>>
branchVars  == <<hbAge, mark, hbAvail, decl>>
trackerVars == <<label, msgs, upd, stop, done, clk, handed, asked, fresh, pr>>
envVars     == <<crashes, losses, stops, misses, handovers, retires,
                 clockSteps, prs, fails, edits, pollChanges>>
loreVars    == <<roster, pollHead>>
vars        == <<procVars, branchVars, loreVars, trackerVars, behind, envVars,
                 wrote>>

-----------------------------------------------------------------------------
(* Helpers *)

Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Range(s) == {s[k] : k \in 1..Len(s)}
Older(a) == IF a >= Cap THEN Cap ELSE a + 1

\* Item i is above mark k: discovery offers it to a cycle replaying k.
Above(i, k) == upd[i] > k

\* What r would read now from the heartbeat files: its own watch counts, or
\* under ~WatchAdvance the ages of the files.
ReadNow(r) == IF WatchAdvance THEN watch[r]
            ELSE [q \in Procs |-> IF q = r THEN 0 ELSE hbAge[q]]

\* What r decides by: a fresh read, or the read at the start of its cycle.
View(r) == IF ReReadHeartbeats THEN ReadNow(r) ELSE seen[r]

\* Process q's heartbeat file has gone unchanged, as r watched it, for
\* three poll intervals: under Ceiling, the longest of r's own and those q
\* declared in a write r saw since the later of r's start and the last
\* loss, or else the maximum;
\* under ~Ceiling, the longest of r's own, what q's file says now and what
\* r saw q's file declare in a write, kept across a loss; under
\* ~DeclaredInterval, r's own.
HbGone(r, q) ==
    LET len == IF ~DeclaredInterval THEN plen[r]
               ELSE IF Ceiling
                 THEN IF seenDecl[r][q] # 0 THEN Max({plen[r], seenDecl[r][q]})
                                           ELSE CeilLen
                 ELSE Max({plen[r], decl[q], seenDecl[r][q]})
    IN  q # r /\ View(r)[q] >= Bound * len

\* What a claim message names, q, is gone to process r: past the bound, or
\* under ~RosterWaits a serving rank missing from r's roster. A process
\* never counts what its own messages name gone. Under ~RunIds, rank 0 is
\* gone only once every run's file is.
Gone(r, q) ==
    /\ q # Me(r)
    /\ \/ ~RosterWaits /\ q \in Serving /\ q \notin rv[r]
       \/ IF q = 0 THEN \A p \in Runs : HbGone(r, p) ELSE HbGone(r, q)

\* A process stands down when it has failed to write its heartbeat for
\* StandDownAt poll intervals, each the shortest it has applied since it
\* started, or under ~DeclaredInterval its own, whether or not its rank is still in
\* the roster.
StandLen(r) == IF DeclaredInterval THEN minLen[r] ELSE plen[r]
StoodDown(r) == StandDownOnMisses /\ missed[r] >= StandDownAt * StandLen(r)

\* A serving process whose rank has left the roster it applied starts no
\* claim, finishes or hands off its item (Finish, HandOff), and then exits
\* (Exit). Leaving the roster alone does not make it stand down.
Retiring(r) == ~IsRun(r) /\ r \notin rv[r]

\* A process that stood down for missed heartbeats has stopped its worker by
\* the end of the interval in which it stood down, under TimerHalts, or else
\* by the end of the CheckpointGap-th interval counting that one. missed
\* reaches the threshold at the Tick that starts the interval in which the
\* process stands down, and Tick checks this before it advances missed, so
\* the HaltGap intervals end when missed reaches the threshold plus
\* HaltGap - 1. The timer fires every half of the process's own interval:
\* on the shorter interval every half of one, and on the longer one every
\* shorter interval. Either way it fires within one shorter interval.
HaltGap == IF TimerHalts THEN 1 ELSE CheckpointGap
MustHaveHalted(r) ==
    StandDownOnMisses /\ missed[r] >= StandDownAt * StandLen(r) + HaltGap - 1

\* What the earliest claim message on item i that counts, in r's view,
\* names: the earliest whose process is not gone; NoHolder if none.
Holder(r, i) ==
    LET ks == {k \in 1..Len(msgs[i]) : ~Gone(r, msgs[i][k])}
    IN  IF ks = {} THEN NoHolder ELSE msgs[i][Min(ks)]

\* Item i is held, in r's view, by a sibling whose claim message counts.
HeldBySibling(r, i) == label[i] /\ Holder(r, i) \notin {NoHolder, Me(r)}

\* #173's test: some claim message on item i that counts, in r's view,
\* names another process.
OtherCounts(r, i) ==
    \E k \in 1..Len(msgs[i]) : msgs[i][k] # Me(r) /\ ~Gone(r, msgs[i][k])

\* Under ~HolderStops, r answers a stop on a handed-over item a sibling
\* holds, rather than passing it over.
AnswersSiblingStop(r, i) == ~HolderStops /\ stop[i] /\ handed[i]

\* The roster's ranks in order, as r applied it, and item i's processes in
\* the order they go first for it, in r's view: its owner, the declared
\* rank at place (i - 1) mod n of the n declared ranks in order, then each
\* declared rank after it, wrapping, then every `igor run`, at rank 0.
RosterSeq(r) == SelectSeq([j \in 1..NRanks |-> j], LAMBDA q : q \in rv[r])
ItemOrder(r, i) ==
    LET s == RosterSeq(r)
        n == Len(s)
        o == IF n = 0 THEN 0 ELSE (i - 1) % n
    IN  [j \in 1..n |-> s[((o + j - 1) % n) + 1]]
        \o [j \in 1..NRuns |-> NRanks + j]

\* Process q is available to r: r itself, or a process whose heartbeat file
\* says available and that r does not count gone.
Avail(r, q) == q = r \/ (hbAvail[q] = "available" /\ ~HbGone(r, q))

\* In r's view, r goes first for item i: no available process comes before
\* it in the item's order.
GoesFirst(r, i) ==
    LET s == ItemOrder(r, i)
        ks == {k \in 1..Len(s) : Avail(r, s[k])}
    IN  ks # {} /\ s[Min(ks)] = r

\* The order r attempts candidates C in: under OwnerFirst, those it goes
\* first for, then the rest, each in the source's order.
Ident == [j \in 1..NItems |-> j]
Order(r, C) ==
    IF OwnerFirst
      THEN SelectSeq(Ident, LAMBDA i : i \in C /\ GoesFirst(r, i))
           \o SelectSeq(Ident, LAMBDA i : i \in C /\ ~GoesFirst(r, i))
      ELSE SelectSeq(Ident, LAMBDA i : i \in C)

\* Rank k's latest mark counts for r: k is r's own rank, or r has seen a
\* process at rank k alive since it started and does not count it gone.
RankSeen(r, k) ==
    IF k = Rank(r) THEN TRUE
    ELSE IF k = 0 THEN \E p \in Runs : alive[r][p] /\ ~HbGone(r, p)
    ELSE alive[r][k] /\ ~Gone(r, k)

\* The mark discovery uses for r: the lowest latest mark among the ranks
\* whose marks count for r; with none of those, the lowest of every rank's
\* latest, capped at the cold start's look-back; with no line at all, a
\* cold start. Every item in the model is inside the cold start's
\* look-back, so the cold start is 0, which caps nothing.
ReplayMark(r) ==
    LET has == {k \in Ranks : mark[k] # NoMark}
        cnt == {k \in has : RankSeen(r, k)}
    IN  IF cnt # {} THEN Min({mark[k] : k \in cnt})
        ELSE IF has # {} THEN Max({0, Min({mark[k] : k \in has})})
        ELSE 0

Worked(i) == \E r \in Procs : up[r] /\ pc[r] = "work" /\ cur[r] = i
Busy(r) == pc[r] \in Window \cup {"work"}

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
\* process that is not gone, or stopped with nobody's label on it. Under
\* ~CatchUpAny, an item whose pull request is open is work in flight, and
\* only the process whose own message holds it takes it. `igor run` takes
\* over no claim message, so it passes over every labelled item that
\* carries one.
Passed(r, i) == \/ done[i] \/ (HeldBySibling(r, i) /\ ~AnswersSiblingStop(r, i))
                \/ (stop[i] /\ ~label[i])
                \/ (~CatchUpAny /\ pr[i] /\ label[i] /\ Holder(r, i) # Me(r))
                \/ (IsRun(r) /\ label[i] /\ msgs[i] # <<>>)

RECURSIVE SkipPassed(_, _)
SkipPassed(r, s) == IF s = <<>> THEN s
                    ELSE IF Passed(r, Head(s)) THEN SkipPassed(r, Tail(s))
                    ELSE s

\* Where a process goes after a reread, or after the withdrawal a reread
\* starts: the cycle it is starting, at "read", or, for `igor run`, the
\* end of its one cycle, at "idle". A withdrawal after a failed claim goes
\* back to "choose" instead.
AfterReread(r) == IF IsRun(r) THEN "idle" ELSE "read"

-----------------------------------------------------------------------------
Init ==
    /\ up = [r \in Procs |-> ~IsRun(r)]
    /\ pc = [r \in Procs |-> IF IsRun(r) THEN "never" ELSE "read"]
    /\ seen = [r \in Procs |-> [q \in Procs |-> 0]]
    /\ watch = [r \in Procs |-> [q \in Procs |-> 0]]
    /\ alive = [r \in Procs |-> [q \in Procs |-> FALSE]]
    /\ cand = [r \in Procs |-> <<>>]
    /\ cur = [r \in Procs |-> 0]
    /\ polled = [r \in Procs |-> FALSE]
    /\ markPend = [r \in Procs |-> NoMark]
    /\ markReady = [r \in Procs |-> FALSE]
    /\ beat = [r \in Procs |-> TRUE]
    /\ missed = [r \in Procs |-> 0]
    /\ reread = [r \in Procs |-> 0]
    /\ rv = [r \in Procs |-> Roster]
    /\ plen = [r \in Procs |-> StartLen]
    /\ spanned = [r \in Procs |-> FALSE]
    /\ seenDecl = [r \in Procs |-> [q \in Procs |-> 0]]
    /\ minLen = [r \in Procs |-> StartLen]
    /\ hbAge = [q \in Procs |-> 0]
    /\ mark = [k \in Ranks |-> NoMark]
    /\ hbAvail = [q \in Procs |-> IF IsRun(q) THEN "none" ELSE "available"]
    /\ decl = [q \in Procs |-> IF IsRun(q) THEN 0 ELSE StartLen]
    /\ roster = Roster
    /\ pollHead = StartLen
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
    /\ edits = 0 /\ pollChanges = 0
    /\ wrote = [r \in Procs |-> ~IsRun(r)]

-----------------------------------------------------------------------------
(* A process's cycle *)

\* The cycle begins: read the heartbeat files, then discover. Every item
\* above the replayed mark is a candidate, and so under LabelSweep is every
\* labelled item, except an item a sibling holds, which is passed over
\* before triage. Triage is taken to say proceed for each candidate not
\* done. The cycle's mark passes the newest update time among the items
\* above the replayed mark. A serving process whose rank has left the
\* roster it applied starts no cycle. A reread left from the last cycle
\* comes first.
Begin(r) ==
    /\ up[r] /\ pc[r] = "read" /\ reread[r] = 0
    /\ IsRun(r) \/ r \in rv[r]
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
    /\ UNCHANGED <<up, watch, alive, cur, polled, beat, missed, reread, rv,
                   plen, seenDecl, minLen, spanned, branchVars, loreVars,
                   trackerVars, behind, envVars, wrote>>

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
              /\ UNCHANGED <<cur, spanned, trackerVars>>
       ELSE IF s = <<>>
         THEN /\ pc' = [pc EXCEPT ![r] = "idle"]
              /\ cand' = [cand EXCEPT ![r] = <<>>]
              /\ markReady' = IF markPend[r] # NoMark
                                THEN [markReady EXCEPT ![r] = TRUE] ELSE markReady
              /\ UNCHANGED <<cur, markPend, spanned, trackerVars>>
         ELSE
         LET i == Head(s)
             h == Holder(r, i)
             overGone == \E k \in 1..Len(msgs[i]) : Gone(r, msgs[i][k])
         IN
         /\ cand' = [cand EXCEPT ![r] = Tail(s)]
         /\ UNCHANGED <<markPend, markReady>>
         /\ IF stop[i]
              \* Stopped, and labelled by this rank's predecessor, by a
              \* process that is gone, or with no claim message that counts:
              \* Passed has skipped every other stopped item, unless
              \* AnswersSiblingStop. A stop releases the claim.
              THEN /\ Release(i) /\ UNCHANGED <<stop, done, pr>>
                   /\ UNCHANGED <<cur, pc, spanned>>
            ELSE IF label[i] /\ h = Me(r) /\ ~(ReleaseOnTakeover /\ overGone)
              \* Its own rank's claim: the predecessor died. Work it again,
              \* or, with its pull request open, catch it up. Under
              \* ReleaseOnTakeover, only when no gone process's message is on
              \* the item; otherwise the next branch takes it over. `igor run`
              \* never comes here: Passed skips every labelled item carrying
              \* a claim message.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "work"]
                   /\ UNCHANGED <<spanned, trackerVars>>
            ELSE IF label[i]
              \* Labelled, and either held by no live process, or held by
              \* this rank's own message only because an earlier message, of
              \* a gone process, no longer counts: post a claim message. A
              \* handed-over item with no message yet comes here too. Where
              \* it leaves out a gone process's message on an item with no
              \* pull request open, under ReleaseOnTakeover it first removes
              \* the label and adds it again, modelled as one step: the label
              \* stays on, and every earlier message falls before the new
              \* release. Under HandoverRecorded the item still reads as
              \* handed over. With the pull request open it releases nothing:
              \* Post supersedes.
              THEN /\ cur' = [cur EXCEPT ![r] = i]
                   /\ pc' = [pc EXCEPT ![r] = "post"]
                   /\ spanned' = [spanned EXCEPT ![r] = FALSE]
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
              \* message can sit on an unlabelled item, posted by a process
              \* whose claim was given back first. Where such a message is a
              \* gone process's, under ReleaseOnTakeover the process adds the
              \* label, removes it and adds it again, modelled as one step,
              \* so the message falls before the new release.
              /\ cur' = [cur EXCEPT ![r] = i]
              /\ pc' = [pc EXCEPT ![r] = IF fails < MaxFails THEN "postnew"
                                                             ELSE "post"]
              /\ spanned' = [spanned EXCEPT ![r] = FALSE]
              /\ label' = [label EXCEPT ![i] = TRUE]
              /\ Touch(i)
              /\ IF ReleaseOnTakeover /\ overGone
                   THEN /\ msgs' = [msgs EXCEPT ![i] = <<>>]
                        /\ fresh' = [fresh EXCEPT ![i] = TRUE]
                   ELSE UNCHANGED <<msgs, fresh>>
              /\ UNCHANGED <<stop, done, handed, asked, pr>>
    /\ UNCHANGED <<up, seen, watch, alive, polled, beat, missed, reread, rv,
                   plen, seenDecl, minLen, branchVars, loreVars, behind,
                   envVars, wrote>>

\* Post the claim message, naming this process, at once. A message posted
\* in the second of the item's latest release does not count, and the item
\* waits for a later cycle. On an item whose pull request is open, under
\* CatchUpSupersedes, the message supersedes those of processes gone to the
\* poster: they stop counting for good, even once their rank returns.
\* Under ~HandoverContest a handed-over item is worked at once, unverified,
\* and under ~VerifyClaims so is an item the poster goes first for.
Post(r) ==
    /\ up[r] /\ pc[r] \in {"post", "postnew"}
    /\ LET i == cur[r]
           kept == IF pr[i] /\ CatchUpSupersedes
                     THEN SelectSeq(msgs[i], LAMBDA q : ~Gone(r, q))
                     ELSE msgs[i]
       IN  msgs' = IF fresh[i] THEN msgs
                   ELSE [msgs EXCEPT ![i] = Append(kept, Me(r))]
    /\ Touch(cur[r])
    /\ pc' = [pc EXCEPT ![r] = IF (~HandoverContest /\ handed[cur[r]])
                                    \/ (~VerifyClaims /\ GoesFirst(r, cur[r]))
                                 THEN "work" ELSE "verify"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, polled, markPend,
                   markReady, beat, missed, reread, rv, plen, seenDecl, minLen,
                   spanned, label, stop, done, handed, asked, fresh, pr,
                   branchVars, loreVars, behind, envVars, wrote>>

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
         THEN /\ IF ~HolderReleases \/ Holder(r, i) \in {NoHolder, Me(r)}
                   THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                   ELSE UNCHANGED trackerVars
              /\ cur' = [cur EXCEPT ![r] = 0]
              /\ pc' = [pc EXCEPT ![r] = "choose"]
       ELSE IF label[i] /\ Holder(r, i) = Me(r) /\ ~StoodDown(r)
         THEN /\ pc' = [pc EXCEPT ![r] = "work"]
              /\ UNCHANGED <<cur, trackerVars>>
       ELSE /\ cur' = [cur EXCEPT ![r] = 0]
            /\ pc' = [pc EXCEPT ![r] = "choose"]
            /\ IF ~LoserKeepsLabel /\ label[i] /\ ~StoodDown(r)
                 THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                 ELSE UNCHANGED trackerVars
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, reread, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, behind, envVars, wrote>>

\* #173's test, its outcome given: decide how the claim on item i goes back
\* after a failure before its worker, a test read that did not fail, or a
\* reread. back is where the process goes after. newLabel says the process
\* set the label in this claim and its message failed to post; whether the
\* half settle interval has passed is the choice `fast`. Where another
\* process's message counts,
\* or the process has stood down, it drops out silently. Where its own
\* message holds the item, it withdraws: it gives the claim back out loud
\* and removes the label in a later step (Withdraw). Where no message
\* counts, it removes the label at once where newLabel holds and the
\* removal is fast, and otherwise leaves it, an item labelled with no claim
\* message that any process claims at a later cycle. Under ~SettleWithdraw
\* it withdraws wherever no message counts.
GiveBackAfterTest(r, i, back, newLabel) ==
    IF OtherCounts(r, i) \/ StoodDown(r) \/ ~label[i]
      THEN /\ cur' = [cur EXCEPT ![r] = 0]
           /\ pc' = [pc EXCEPT ![r] = back]
           /\ UNCHANGED <<spanned, trackerVars>>
    ELSE IF Holder(r, i) = Me(r) \/ ~SettleWithdraw
      THEN /\ cur' = [cur EXCEPT ![r] = i]
           /\ pc' = [pc EXCEPT ![r] = "withdraw"]
           /\ spanned' = [spanned EXCEPT ![r] = FALSE]
           /\ UNCHANGED trackerVars
    ELSE /\ cur' = [cur EXCEPT ![r] = 0]
         /\ pc' = [pc EXCEPT ![r] = back]
         /\ UNCHANGED spanned
         /\ \E fast \in BOOLEAN :
              IF newLabel /\ fast
                THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                ELSE UNCHANGED trackerVars

\* A claim fails before its worker starts, for a reason other than losing:
\* its claim message fails to post, or its verification read errors. The
\* process then makes #173's test, a read of the item's claim messages.
\* Where that read fails too, it removes nothing and reads again at its next
\* cycle's start. Under ~HolderReleases it removes the label whenever the
\* label is on.
FailClaim(r) ==
    /\ up[r] /\ pc[r] \in {"post", "postnew", "verify"} /\ fails < MaxFails
    /\ reread[r] = 0
    /\ LET i == cur[r] IN
       /\ ~stop[i]
       /\ IF ~HolderReleases
            THEN /\ IF label[i] THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
                                ELSE UNCHANGED trackerVars
                 /\ cur' = [cur EXCEPT ![r] = 0]
                 /\ pc' = [pc EXCEPT ![r] = "choose"]
                 /\ UNCHANGED <<reread, spanned>>
            ELSE \/ /\ reread' = [reread EXCEPT ![r] = i]
                    /\ cur' = [cur EXCEPT ![r] = 0]
                    /\ pc' = [pc EXCEPT ![r] = "choose"]
                    /\ UNCHANGED <<spanned, trackerVars>>
                 \/ /\ UNCHANGED reread
                    /\ GiveBackAfterTest(r, i, "choose", pc[r] = "postnew")
    /\ fails' = fails + 1
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, rv, plen, seenDecl, minLen, branchVars,
                   loreVars, behind, crashes, losses, stops, misses, handovers,
                   retires, clockSteps, prs, edits, pollChanges, wrote>>

\* The reread at the next cycle's start, or before `igor run` exits, more
\* than one poll interval after the claim message: the process never works
\* the item from it. A read that fails again is an unreadable claim: the
\* process gives the claim back, or at the third in a row sets the item
\* down, and since it cannot tell who holds the item it leaves the label.
\* The model tracks neither the posts nor the deferral, so that step
\* changes nothing here but the reread. Otherwise it decides as at the
\* test.
Reread(r) ==
    /\ up[r] /\ reread[r] # 0 /\ pc[r] = AfterReread(r)
    /\ LET i == reread[r] IN
       \/ /\ reread' = [reread EXCEPT ![r] = 0]
          /\ UNCHANGED <<cur, pc, spanned>>
          /\ IF ~RereadKeepsLabel /\ label[i]
               THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
               ELSE UNCHANGED trackerVars
       \/ /\ GiveBackAfterTest(r, i, AfterReread(r), FALSE)
          /\ reread' = IF pc'[r] = "withdraw" THEN reread
                       ELSE [reread EXCEPT ![r] = 0]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, rv, plen, seenDecl, minLen, branchVars,
                   loreVars, behind, envVars, wrote>>

\* The withdrawal's removal, after the test: the process reads the
\* heartbeat files and the item's claim messages again, and removes the
\* label only where its own message still holds the item, no other
\* process's message counts, and it has not stood down. That read and the
\* removal are one step here, as a takeover's read and release are in
\* Choose. A claim message posted after the test, and seen by that read,
\* keeps the label on; one posted after that read is later than the
\* withdrawing process's own message. Under ~SettleWithdraw a process with
\* no message that counts withdraws too, with nothing to order a message
\* posted after its read: its removal is a step of its own, after the test.
Withdraw(r) ==
    /\ up[r] /\ pc[r] = "withdraw"
    /\ LET i == cur[r] IN
       IF /\ label[i] /\ ~StoodDown(r)
          /\ \/ Holder(r, i) = Me(r) /\ ~OtherCounts(r, i)
             \/ ~SettleWithdraw /\ Holder(r, i) # Me(r)
         THEN Release(i) /\ UNCHANGED <<stop, done, pr>>
         ELSE UNCHANGED trackerVars
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = IF reread[r] # 0 THEN AfterReread(r) ELSE "choose"]
    /\ reread' = [reread EXCEPT ![r] = 0]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, behind, envVars, wrote>>

\* A checkpoint in the worker's run sees a stop: the run halts and the claim
\* is released, a person's label included.
Checkpoint(r) ==
    /\ up[r] /\ pc[r] = "work" /\ stop[cur[r]]
    /\ Release(cur[r]) /\ UNCHANGED <<stop, done, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, reread, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, behind, envVars, wrote>>

\* The worker of a process that has stood down stops: at the next tick of
\* Igor's own timer under TimerHalts, or else at the worker's next event.
\* The claim stays, silently: a sibling may already have taken the
\* item over, and a release would undo the sibling's claim.
Halt(r) ==
    /\ up[r] /\ pc[r] = "work" /\ StoodDown(r) /\ ~stop[cur[r]]
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, reread, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, trackerVars, behind, envVars, wrote>>

\* The run opens the Igor's pull request, and has not yet finished. A crash
\* now leaves a claim on an item whose pull request is open.
OpenPR(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]] /\ ~pr[cur[r]]
    /\ prs < MaxPRs
    /\ pr' = [pr EXCEPT ![cur[r]] = TRUE]
    /\ prs' = prs + 1
    /\ UNCHANGED <<procVars, branchVars, loreVars, label, msgs, upd, stop,
                   done, clk, handed, asked, fresh, behind, crashes, losses,
                   stops, misses, handovers, retires, clockSteps, fails, edits,
                   pollChanges, wrote>>

\* The run finishes, after any number of poll intervals: its artifact is in
\* place, and it gives the claim back. A catch-up keeps a person's label.
Finish(r) ==
    /\ up[r] /\ pc[r] = "work" /\ ~stop[cur[r]]
    /\ done' = [done EXCEPT ![cur[r]] = TRUE]
    /\ GiveBack(cur[r]) /\ UNCHANGED <<stop, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, reread, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, behind, envVars, wrote>>

\* A process whose rank has left the roster may hand its item off instead of
\* finishing it, out loud, giving the claim back as a finished run does.
HandOff(r) ==
    /\ up[r] /\ pc[r] = "work" /\ Retiring(r) /\ ~stop[cur[r]]
    /\ GiveBack(cur[r]) /\ UNCHANGED <<stop, done, pr>>
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ pc' = [pc EXCEPT ![r] = "choose"]
    /\ UNCHANGED <<up, seen, watch, alive, cand, polled, markPend, markReady,
                   beat, missed, reread, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, behind, envVars, wrote>>

\* The next cycle begins once a poll interval has passed. At its start the
\* process applies the lore commit it last fetched: the head, or, where its
\* fetch has not brought the head yet, what it applied before. `igor run`
\* runs one cycle only.
NextCycle(r) ==
    /\ up[r] /\ pc[r] = "idle" /\ polled[r] /\ ~IsRun(r)
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ \E nv \in {rv[r], roster}, nl \in {plen[r], pollHead} :
          /\ rv' = [rv EXCEPT ![r] = nv]
          /\ plen' = [plen EXCEPT ![r] = nl]
          /\ minLen' = IF Tracked
                         THEN [minLen EXCEPT ![r] = Min({minLen[r], nl})]
                         ELSE minLen
    /\ UNCHANGED <<up, seen, watch, alive, cand, cur, markPend, markReady,
                   beat, missed, reread, spanned, seenDecl, branchVars,
                   loreVars, trackerVars, behind, envVars, wrote>>

\* A process whose rank has left the roster exits once its item is finished
\* or handed off, its reread is done and its cycle's mark has landed. Its
\* exit is clean, so the supervisor does not restart it.
Exit(r) ==
    /\ up[r] /\ Retiring(r) /\ ~Busy(r) /\ markPend[r] = NoMark
    /\ reread[r] = 0
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "down"]
    /\ cand' = [cand EXCEPT ![r] = <<>>]
    /\ seen' = [seen EXCEPT ![r] = [q \in Procs |-> 0]]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ wrote' = [wrote EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<watch, alive, cur, markPend, markReady, beat, missed,
                   reread, rv, plen, seenDecl, minLen, spanned, branchVars,
                   loreVars, trackerVars, behind, envVars>>

\* `igor run` ends once its one cycle is over, its reread is done and its
\* mark has landed.
RunExit(r) ==
    /\ up[r] /\ IsRun(r) /\ pc[r] = "idle" /\ markPend[r] = NoMark
    /\ reread[r] = 0
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "ended"]
    /\ UNCHANGED <<seen, watch, alive, cand, cur, polled, markPend, markReady,
                   beat, missed, reread, rv, plen, seenDecl, minLen, spanned,
                   branchVars, loreVars, trackerVars, behind, envVars, wrote>>

-----------------------------------------------------------------------------
(* Writes to the state branch *)

\* The cycle's mark lands in the log: this rank's latest line.
AppendMark(r) ==
    /\ up[r] /\ markPend[r] # NoMark /\ markReady[r]
    /\ mark' = [mark EXCEPT ![Rank(r)] = markPend[r]]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<up, pc, seen, watch, alive, cand, cur, polled, beat, missed,
                   reread, rv, plen, seenDecl, minLen, spanned, hbAge, hbAvail,
                   decl, loreVars, trackerVars, behind, envVars, wrote>>

\* This process's heartbeat lands, from a timer that runs whatever the cycle
\* is doing: its counter goes up by one, and the file says whether the
\* process is available, which in the model is having no claim in hand:
\* not between setting the label and finishing or giving the claim back.
\* A process that has stood down has written no heartbeat since, and one that
\* resumes keeps the claims it left in silence. The file changes, so every
\* watcher's count for this process restarts, and every watcher has now
\* seen it alive. Under ~CounterLiveness a watcher compares times instead,
\* and a write from a process whose clock is behind lands without counting
\* for anyone, though the process itself counts it as written. One write
\* lands per shorter interval: for a process on the shorter interval,
\* writing every half of it, that is two writes counted as one; for one on
\* the longer interval, writing every half of its own, that is each write.
\*
\* With one item, every process attempts the same one item whatever it
\* goes first for, so a configuration with one item does not track
\* availability, which only orders the attempts, and keeps its state space
\* smaller.
WriteHeartbeat(r) ==
    /\ up[r] /\ ~beat[r]
    /\ beat' = [beat EXCEPT ![r] = TRUE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ IF CounterLiveness \/ ~behind[r]
         THEN /\ watch' = [x \in Procs |-> [watch[x] EXCEPT ![r] = 0]]
              /\ alive' = [x \in Procs |-> [alive[x] EXCEPT ![r] = TRUE]]
         ELSE UNCHANGED <<watch, alive>>
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [hbAge EXCEPT ![r] = 0]
    /\ hbAvail' = IF NItems > 1
                   THEN [hbAvail EXCEPT ![r] = IF Busy(r) THEN "unavailable"
                                                          ELSE "available"]
                   ELSE hbAvail
    /\ IF Tracked
         THEN /\ decl' = [decl EXCEPT ![r] = plen[r]]
              /\ seenDecl' = [x \in Procs |->
                               [seenDecl[x] EXCEPT ![r] = Max({@, plen[r]})]]
         ELSE UNCHANGED <<decl, seenDecl>>
    /\ wrote' = [wrote EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady,
                   reread, rv, plen, minLen, spanned, mark, loreVars,
                   trackerVars, behind, envVars>>

-----------------------------------------------------------------------------
(* Time and the environment *)

\* One interval passes. A running process whose heartbeat has not landed
\* in the interval that is ending has missed one, which MaxMisses bounds.
\* Only a running process's counts advance: a process that is down starts
\* its counts afresh when it starts. A process that stood down for missed
\* heartbeats has halted any claim or run within HaltGap intervals
\* (MustHaveHalted). Under VerifyWithinPoll no claim is still between
\* setting its label and its verification or withdrawal once one of its
\* process's poll intervals has passed, which is how the model makes
\* verification come within one poll interval of the message: a process on
\* the shorter interval lets no interval end between setting its label and
\* verifying, and one on the longer lets one end there. Every release's second has passed.
Tick ==
    /\ LET M == {r \in Procs : up[r] /\ ~beat[r]}
       IN  /\ misses + Cardinality(M) <= MaxMisses
           /\ MissOnly = 0 \/ M \subseteq {MissOnly}
           /\ misses' = misses + Cardinality(M)
    /\ \A r \in Procs : (up[r] /\ MustHaveHalted(r)) => ~Busy(r)
    /\ VerifyWithinPoll =>
         \A r \in Procs : (up[r] /\ pc[r] \in Window)
                            => (plen[r] = 2 /\ ~spanned[r])
    /\ spanned' = IF MaxPollChanges = 0 THEN spanned
                  ELSE [r \in Procs |-> up[r] /\ pc[r] \in Window]
    /\ watch' = [r \in Procs |-> IF ~up[r] THEN watch[r] ELSE [q \in Procs |->
                   IF q = r THEN 0 ELSE Older(watch[r][q])]]
    /\ missed' = [r \in Procs |-> IF up[r] THEN Older(missed[r]) ELSE missed[r]]
    /\ hbAge' = IF WatchAdvance THEN hbAge
                ELSE [q \in Procs |-> Older(hbAge[q])]
    /\ beat' = [r \in Procs |-> FALSE]
    /\ polled' = [r \in Procs |-> TRUE]
    /\ fresh' = [i \in Items |-> FALSE]
    /\ UNCHANGED <<up, pc, seen, alive, cand, cur, markPend, markReady, reread,
                   rv, plen, seenDecl, minLen, mark, hbAvail, decl, loreVars,
                   label, msgs, upd, stop, done, clk, handed, asked, pr,
                   behind, crashes, losses, stops, handovers, retires,
                   clockSteps, prs, fails, edits, pollChanges, wrote>>

\* The second of the latest releases passes.
NextSecond ==
    /\ \E i \in Items : fresh[i]
    /\ fresh' = [i \in Items |-> FALSE]
    /\ UNCHANGED <<procVars, branchVars, loreVars, label, msgs, upd, stop,
                   done, clk, handed, asked, pr, behind, envVars, wrote>>

\* A process crashes, at any point and between any two writes. Its worker
\* dies with it, and so does everything it held in memory, a pending
\* reread included.
Crash(r) ==
    /\ up[r] /\ crashes < MaxCrashes /\ (CrashOnly = 0 \/ r = CrashOnly)
    /\ up' = [up EXCEPT ![r] = FALSE]
    /\ pc' = [pc EXCEPT ![r] = "down"]
    /\ cand' = [cand EXCEPT ![r] = <<>>]
    /\ cur' = [cur EXCEPT ![r] = 0]
    /\ markPend' = [markPend EXCEPT ![r] = NoMark]
    /\ markReady' = [markReady EXCEPT ![r] = FALSE]
    /\ seen' = [seen EXCEPT ![r] = [q \in Procs |-> 0]]
    /\ polled' = [polled EXCEPT ![r] = FALSE]
    /\ reread' = [reread EXCEPT ![r] = 0]
    /\ crashes' = crashes + 1
    /\ wrote' = [wrote EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<watch, alive, beat, missed, rv, plen, seenDecl, minLen,
                   spanned, branchVars, loreVars, trackerVars, behind, losses,
                   stops, misses, handovers, retires, clockSteps, prs, fails,
                   edits, pollChanges>>

\* A process starts: it watches every sibling afresh, has seen none alive,
\* and counts the intervals without a heartbeat of its own from its start.
\* It picks a new id for its heartbeat file, so its first write changes the
\* file whatever the file held. It applies the lore head.
Start(r) ==
    /\ up' = [up EXCEPT ![r] = TRUE]
    /\ pc' = [pc EXCEPT ![r] = "read"]
    /\ watch' = [watch EXCEPT ![r] = [q \in Procs |-> 0]]
    /\ alive' = [alive EXCEPT ![r] = [q \in Procs |-> FALSE]]
    /\ beat' = [beat EXCEPT ![r] = FALSE]
    /\ missed' = [missed EXCEPT ![r] = 0]
    /\ rv' = [rv EXCEPT ![r] = roster]
    /\ plen' = [plen EXCEPT ![r] = pollHead]
    /\ seenDecl' = [seenDecl EXCEPT ![r] = [q \in Procs |-> 0]]
    /\ minLen' = IF Tracked
                   THEN [minLen EXCEPT ![r] = pollHead] ELSE minLen
    /\ UNCHANGED <<seen, cand, cur, polled, markPend, markReady, reread,
                   spanned, branchVars, loreVars, trackerVars, behind,
                   envVars, wrote>>

\* The supervisor restarts a crashed serving rank, if the roster still
\* declares it: a start whose commit drops the rank is refused. On a host
\* whose clock is behind, ClockStep may follow.
Restart(r) ==
    /\ ~IsRun(r) /\ ~up[r] /\ pc[r] = "down" /\ r \in roster
    /\ Start(r)

\* An `igor run` starts, once, at rank 0. It waits for nothing and checks
\* no serving rank first.
StartRun(r) ==
    /\ IsRun(r) /\ pc[r] = "never"
    /\ Start(r)

\* A process's clock steps back, or it restarted on a host whose clock is
\* behind: the times it writes are earlier than the latest any watcher has
\* read from its file, and stay so. Only ~CounterLiveness reads this.
ClockStep(q) ==
    /\ up[q] /\ ~behind[q] /\ clockSteps < MaxClockSteps
    /\ behind' = [behind EXCEPT ![q] = TRUE]
    /\ clockSteps' = clockSteps + 1
    /\ UNCHANGED <<procVars, branchVars, loreVars, trackerVars, crashes,
                   losses, stops, misses, handovers, retires, prs, fails,
                   edits, pollChanges, wrote>>

\* The state branch is lost, reset or rolled back to an old commit. A lost
\* or reset branch changes no heartbeat file a watcher could read, so no
\* watch count changes. A rolled-back one puts older files back: under
\* CounterLiveness an older counter differs from the one last read, so it
\* reads as a change: for each process in a chosen set S, every watcher's
\* count restarts and every watcher has now seen it alive. That only
\* postpones a verdict, and lets that process's rank's latest mark count
\* again where it had stopped counting, which can only lower the mark.
\* Under ~WatchAdvance every file reads as old. The log is lost, or returns
\* to an old commit. An old commit's marks are no higher than today's, so
\* the model keeps today's: the highest they could be, which is the worst
\* case for MarkNeverPassesUntaken. A lost branch takes the availability
\* flags with the files, so every process reads as missing until it writes
\* again; a rollback is taken to leave them, since the order of attempts
\* decides nothing the invariants check. No process stops on what a loss
\* or a rollback puts in a file.
LoseBranch ==
    /\ losses < MaxLosses
    /\ \/ mark' = [k \in Ranks |-> NoMark]
       \/ UNCHANGED mark
    /\ \E S \in (IF CounterLiveness THEN SUBSET Procs ELSE {{}}) :
          /\ watch' = [x \in Procs |-> [q \in Procs |->
                          IF q \in S THEN 0 ELSE watch[x][q]]]
          /\ alive' = [x \in Procs |-> [q \in Procs |->
                          IF q \in S /\ q # x THEN TRUE ELSE alive[x][q]]]
    /\ \/ NItems > 1 /\ hbAvail' = [q \in Procs |-> "none"]
       \/ UNCHANGED hbAvail
    /\ hbAge' = IF WatchAdvance THEN hbAge ELSE [q \in Procs |-> Cap]
    /\ IF Tracked
         THEN \/ decl' = [q \in Procs |-> 0]
              \/ decl' = [q \in Procs |-> IF decl[q] = 0 THEN 0 ELSE 1]
              \/ UNCHANGED decl
         ELSE UNCHANGED decl
    \* Under Ceiling every process forgets the declarations it saw, as a
    \* running one would on detecting the loss by a missing serving rank's
    \* file or a counter that went back. The model clears them for all on
    \* every loss, where a real process clears them only on detecting it;
    \* design.md, *What the model assumes*, covers a rollback that leaves a
    \* counter where the watcher last read it.
    /\ seenDecl' = IF Tracked /\ Ceiling
                     THEN [x \in Procs |-> [q \in Procs |-> 0]] ELSE seenDecl
    /\ losses' = losses + 1
    /\ UNCHANGED <<up, pc, seen, cand, cur, polled, markPend, markReady, beat,
                   missed, reread, rv, plen, minLen, spanned,
                   loreVars, trackerVars, behind, crashes, stops, misses,
                   handovers, retires, clockSteps, prs, fails, edits,
                   pollChanges, wrote>>

\* A person says stop on an item.
SayStop(i) ==
    /\ stops < MaxStops /\ ~stop[i] /\ ~done[i]
    /\ stop' = [stop EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ stops' = stops + 1
    /\ UNCHANGED <<procVars, branchVars, loreVars, label, msgs, done, handed,
                   asked, fresh, pr, behind, crashes, losses, misses,
                   handovers, retires, clockSteps, prs, fails, edits,
                   pollChanges, wrote>>

\* A person hands an unclaimed item over by adding the role's label.
HandOver(i) ==
    /\ handovers < MaxHandovers /\ ~label[i] /\ ~stop[i] /\ ~done[i]
    /\ label' = [label EXCEPT ![i] = TRUE]
    /\ handed' = [handed EXCEPT ![i] = TRUE]
    /\ asked' = [asked EXCEPT ![i] = TRUE]
    /\ Touch(i)
    /\ handovers' = handovers + 1
    /\ UNCHANGED <<procVars, branchVars, loreVars, msgs, stop, done, fresh, pr,
                   behind, crashes, losses, stops, misses, retires, clockSteps,
                   prs, fails, edits, pollChanges, wrote>>

\* An operator removes a serving rank from the lore head's roster. Each
\* process applies it at a cycle start of its own.
Retire(q) ==
    /\ retires < MaxRetires /\ q \in roster
    /\ roster' = roster \ {q}
    /\ retires' = retires + 1
    /\ UNCHANGED <<procVars, branchVars, pollHead, trackerVars, behind,
                   crashes, losses, stops, misses, handovers, clockSteps, prs,
                   fails, edits, pollChanges, wrote>>

\* An operator changes the lore head's poll interval to the other length.
\* Each process applies it at a cycle start of its own.
ChangePoll ==
    /\ pollChanges < MaxPollChanges
    /\ pollHead' = 3 - pollHead
    /\ pollChanges' = pollChanges + 1
    /\ UNCHANGED <<procVars, branchVars, roster, trackerVars, behind,
                   crashes, losses, stops, misses, handovers, retires,
                   clockSteps, prs, fails, edits, wrote>>

\* A person edits a claim message. An edited message counts for nothing, so
\* it leaves the messages that count, wherever it stood among them.
EditMsg(i) ==
    /\ edits < MaxEdits /\ msgs[i] # <<>>
    /\ \E k \in 1..Len(msgs[i]) :
          msgs' = [msgs EXCEPT ![i] = SubSeq(msgs[i], 1, k - 1)
                                       \o SubSeq(msgs[i], k + 1, Len(msgs[i]))]
    /\ Touch(i)
    /\ edits' = edits + 1
    /\ UNCHANGED <<procVars, branchVars, loreVars, label, stop, done, handed,
                   asked, fresh, pr, behind, crashes, losses, stops, misses,
                   handovers, retires, clockSteps, prs, fails, pollChanges,
                   wrote>>

-----------------------------------------------------------------------------
Step(r) == Begin(r) \/ Choose(r) \/ Post(r) \/ Verify(r) \/ Withdraw(r)
           \/ Reread(r) \/ Checkpoint(r) \/ Halt(r) \/ Finish(r)
           \/ HandOff(r) \/ NextCycle(r) \/ RunExit(r)

Next ==
    \/ \E r \in Procs : Step(r) \/ AppendMark(r) \/ WriteHeartbeat(r)
                        \/ OpenPR(r) \/ FailClaim(r) \/ Exit(r) \/ Crash(r)
                        \/ Restart(r) \/ StartRun(r) \/ ClockStep(r)
    \/ \E q \in 1..NRanks : Retire(q)
    \/ ChangePoll
    \/ Tick
    \/ NextSecond
    \/ LoseBranch
    \/ \E i \in Items : SayStop(i) \/ HandOver(i) \/ EditMsg(i)

\* Running processes make progress, their writes land, workers finish, a
\* process whose rank left the roster exits, and time passes. Nothing obliges
\* a crashed process to restart, an `igor run` to start, a fetch to bring
\* the lore head, or a person to say anything.
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
          reread, rv, plen, spanned, seenDecl, minLen, decl,
          hbAge, [k \in Ranks |-> Passes(mark[k])], hbAvail, loreVars,
          label, msgs, [i \in Items |-> ItemPlace(i)], stop, done, handed,
          asked, fresh, pr, behind, envVars, wrote>>

-----------------------------------------------------------------------------
(* Invariants. Each names, by its exact title, the requirement it proves. *)

TypeOK ==
    /\ up \in [Procs -> BOOLEAN]
    /\ pc \in [Procs -> {"never", "down", "read", "choose", "post", "postnew",
                         "verify", "withdraw", "work", "idle", "ended"}]
    /\ cur \in [Procs -> 0..NItems]
    /\ reread \in [Procs -> 0..NItems]
    /\ watch \in [Procs -> [Procs -> 0..Cap]]
    /\ alive \in [Procs -> [Procs -> BOOLEAN]]
    /\ missed \in [Procs -> 0..Cap]
    /\ rv \in [Procs -> SUBSET (1..NRanks)]
    /\ plen \in [Procs -> {1, 2}]
    /\ hbAvail \in [Procs -> {"available", "unavailable", "none"}]
    /\ roster \subseteq 1..NRanks
    /\ pollHead \in {1, 2}
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
\* A live process's claim is never taken. Take a running process p that
\* has written its heartbeat since it started and has not stood down: no
\* other running process counts gone what p's claim messages name. A process still at "read" has not yet read the heartbeat files
\* this cycle, so under ~ReReadHeartbeats its view is the last cycle's; it
\* is checked once it has begun.
LiveRankNeverGone ==
    \A p, r \in Procs :
        (Me(p) # Me(r) /\ up[r] /\ pc[r] # "read" /\ up[p] /\ wrote[p]
           /\ ~StoodDown(p))
            => ~Gone(r, Me(p))

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

\* Requirement: "Only the rank holding a claim gives it back" (work-claiming),
\* its scenarios "A withdrawal takes no claim that came after its test" and
\* "A claim message that failed to post leaves no label behind".
\* No give-back removes the label from an item a worker runs on.
LabelWhileWorked ==
    \A i \in Items : Worked(i) => label[i]

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
