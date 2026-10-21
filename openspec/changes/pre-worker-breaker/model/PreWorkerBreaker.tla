--------------------------- MODULE PreWorkerBreaker ---------------------------
(***************************************************************************)
(* The breaker of the OpenSpec change `pre-worker-breaker`: one role run  *)
(* as several ranks, counting each item's failures before the worker from *)
(* rows in the shared execution log, `executions.ndjson`.                 *)
(*                                                                         *)
(* The tracker holds, per item, the ranks of the claim messages that      *)
(* count since the item's latest release, in storage order; the earliest  *)
(* holds the item, as `concurrent-instances` (#179) says. It also holds   *)
(* whether the item is deferred, that is set down. A set-down lifts on a *)
(* person's change to the item or on another role's successful run on it  *)
(* (`Lift`). Another role's other posts on the item lift nothing; with    *)
(* IgorPostsLiftNothing FALSE they do (`OtherPost`).                      *)
(*                                                                         *)
(* A run of rank r: reads an item as free and claims it (`Claim`), posts  *)
(* its claim message (`Post`), and re-reads to verify (`Verify`). In the  *)
(* claim window, before or after the post, the run may fail               *)
(* (`WindowFail`). A rank that verifies as holder either starts the       *)
(* worker (`StartWorker`) or fails before it (`HeldFail`), the failure    *)
(* thrown or returned by `execute`. A failure may record a cure key, #101's *)
(* mark of a fault in the Igor's own setup. Its `pre-worker` row says so,  *)
(* and the count skips it.                                                 *)
(*                                                                         *)
(* Rows are not written when decided. Each goes into `pending` and lands   *)
(* at the end of the log later (`Land`), in any order when Reorder is      *)
(* TRUE, which is what a write refused and retried does. A pending row may *)
(* also be lost (`Lose`), at most MaxLosses times, as could happen if     *)
(* #179's retry does not cover these appends (task 0.3).                  *)
(*                                                                         *)
(* The breaker reads only the landed log, newest row first, as design.md  *)
(* *Counting* says. The ghost variable `hist` records every failure and   *)
(* every worker start in the order they were decided, with whether the    *)
(* spec counts it. The invariants compare each set-down with `hist`, so   *)
(* they check what the spec requires, not what the log happened to hold.  *)
(*                                                                         *)
(* Each rank applies the two two-in-a-row rules within its cycle: two     *)
(* failures on different items in a row, both surface failures (sigs in   *)
(* SurfaceSigs) or both identical. The second run of such a pair    *)
(* ends the cycle and appends an `outage` row, which excludes the pair's  *)
(* rows (or, for surface failures, every failure before the worker in the *)
(* cycle) by rank, cycle and item. A refused call (sigs in RefusalSigs)   *)
(* counts toward its item's breaker but is never one of a pair, so it     *)
(* never ends a cycle; like any failure that differs from the one before  *)
(* it, it separates the runs on either side of it.                        *)
(*                                                                         *)
(* Each rule of the change is a constant, TRUE in the change as specified. *)
(* The configurations in negative/ each set one FALSE and must find a     *)
(* violation, which shows that rule is needed. PromptRows and             *)
(* AtomicWithdraw are assumptions, not rules. findings/LateRows.cfg drops *)
(* PromptRows; what late rows then cause is a limit Adam accepted.        *)
(* findings/WithdrawRace.cfg drops                                        *)
(* AtomicWithdraw, which stands for #179's mechanism: the withdrawal      *)
(* releases only claim messages posted before the rank's test.            *)
(*                                                                         *)
(* Not modelled: several roles (the count is per role, so roles share     *)
(* nothing here, and `OtherPost` and `Lift` stand for another role's     *)
(* posts and successful runs); failures after the worker; the masks (a    *)
(* signature is a model value); a read of the count that fails, and a     *)
(* failed read of the item's claim messages in the claim window (the spec *)
(* has each count nothing and post no set-down, which only removes        *)
(* set-downs; the reread a cycle later, whatever it finds, counts nothing *)
(* either); `igor run --claim`, whose failure counts like a rank's and    *)
(* never pairs, since it runs outside any cycle, and so only removes      *)
(* cycle ends; the discovery watermark; and how #179 frees an item whose claim messages   *)
(* no running rank works (`Recover` stands for it).                       *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    NRanks,            \* serving ranks 1..NRanks of one role
    NItems,            \* items 1..NItems
    Sigs,              \* signatures of failures that are not surface failures
                       \* or refused calls: the working tree's or the Igor's
    SurfaceSigs,       \* signatures of tracker or code-host calls that got no
                       \* answer
    RefusalSigs,       \* signatures of tracker or code-host calls that were
                       \* answered and refused
    MaxRuns,           \* runs started, summed over ranks
    MaxLosses,         \* pending rows that may be lost
    MaxLifts,          \* deferrals lifted by a person's change to the item
                       \* or by another role's successful run on it
    MaxOtherPosts,     \* other roles' posts on a deferred item, which lift
                       \* it only with IgorPostsLiftNothing FALSE
    MaxWindowFails,    \* claim-window failures, summed over ranks
    Returned,          \* `execute` may return a failure rather than throw it
    Cures,             \* a failure may record a cure key
    Reorder,           \* a pending row may land after rows decided later
    Det,               \* every run of item i fails before the worker with
                       \* DetSig(i): the liveness configurations
    AtomicWithdraw,    \* not a rule but an assumption: a lone claim-window
                       \* rank's test of the item's claim messages and its
                       \* withdrawal are one step; FALSE: two
    PromptRows,        \* not a rule but a timing assumption: a row about an
                       \* item lands before any run claims the item, and
                       \* before any run already on it decides
    \* The rules. Each is TRUE in the change as specified.
    HolderOnly,        \* only the rank whose claim message holds the item
                       \* counts; FALSE: a rank that lost verification counts
    AloneInWindow,     \* a claim-window failure counts only where no other
                       \* rank's claim message is on the item; FALSE: always
    IdenticalOnly,     \* only failures with the same signature count in a
                       \* row; FALSE: every failure before the worker does
    ReturnedRetried,   \* a returned failure is retried twice like a thrown
                       \* one; FALSE: it sets the item down at once
    SkipSecondOfPair,  \* the run that ends its cycle as the second of a pair
                       \* is not counted; FALSE: it is
    OutageExcludes,    \* an `outage` row excludes the rows it names;
                       \* FALSE: those rows count
    CureSkipped,       \* the count skips a failure that records a cure key;
                       \* FALSE: it counts
    SetDownOnce,       \* a run posts no set-down where its item is already
                       \* deferred; FALSE: it posts another
    IgorPostsLiftNothing, \* another role's posts on the item, other than a
                       \* successful run, lift no set-down; FALSE: they lift it
    RefusalsUnpaired   \* a refused call is never one of a pair; FALSE: two
                       \* identical refused calls end the cycle

ASSUME Sigs \cap SurfaceSigs = {}
ASSUME RefusalSigs \cap (Sigs \cup SurfaceSigs) = {}

Ranks == 1..NRanks
Items == 1..NItems
AllSigs == Sigs \cup SurfaceSigs \cup RefusalSigs
CureSig == "cure"
None == [item |-> 0, sig |-> "none"]
Threshold == 3

\* Every item's own failure in the liveness configurations, so that no pair
\* rule can join two items' failures.
DetSig(i) == IF i = 1 THEN "a" ELSE "b"
ASSUME Det => NItems <= 2

VARIABLES
    pc,          \* each rank: "idle", "post", "window", "held", "withdrawing"
                 \* (between a lone claim-window rank's test and its
                 \* withdrawal, with AtomicWithdraw FALSE), or "outranked"
                 \* (lost verification but counts, with HolderOnly FALSE)
    it,          \* the item each rank's run is on
    cyc,         \* each rank's cycle number
    tried,       \* items each rank has attempted in its cycle
    prev,        \* each rank's previous run in its cycle, for the pair rules
    cfails,      \* items that failed before the worker in each rank's cycle
    msgs,        \* each item's claim messages that count, earliest first
    deferred,    \* whether each item is set down
    log,         \* the landed rows of executions.ndjson, oldest first
    pending,     \* rows decided and not yet landed
    runs, losses, lifts, wfails, others,
    answers,     \* ghost: each item's lifts by a person or a successful run
    hist,        \* ghost: each item's failures and worker starts, in order
    downs,       \* ghost: one record per set-down posted
    downsSince   \* ghost: set-downs of each item since its deferral last lifted

vars == <<pc, it, cyc, tried, prev, cfails, msgs, deferred, log, pending,
          runs, losses, lifts, wfails, others, answers, hist, downs,
          downsSince>>

Range(s) == {s[k] : k \in DOMAIN s}

-----------------------------------------------------------------------------
(* The breaker's count, from the landed log (design.md, Counting).          *)

Excluded(row) ==
    /\ OutageExcludes
    /\ \E k \in DOMAIN log :
         /\ log[k].t = "out"
         /\ log[k].rank = row.rank
         /\ log[k].cyc = row.cyc
         /\ row.item \in log[k].items

RECURSIVE Walk(_, _, _, _)
Walk(L, i, s, n) ==
    IF L = <<>> THEN n
    ELSE LET row  == L[Len(L)]
             rest == SubSeq(L, 1, Len(L) - 1)
         IN  IF row.item # i THEN Walk(rest, i, s, n)
             ELSE IF row.t = "pw" THEN
                    IF Excluded(row) \/ (row.cure /\ CureSkipped)
                      THEN Walk(rest, i, s, n)
                    ELSE IF row.sig = s \/ ~IdenticalOnly
                         THEN Walk(rest, i, s, n + 1)
                         ELSE n
             ELSE IF row.t = "run" THEN
                    IF row.worker THEN n ELSE Walk(rest, i, s, n)
             ELSE Walk(rest, i, s, n)

(* The same count over the ghost history: what the spec says the count is. *)
RECURSIVE GWalk(_, _, _)
GWalk(H, s, n) ==
    IF H = <<>> THEN n
    ELSE LET e    == H[Len(H)]
             rest == SubSeq(H, 1, Len(H) - 1)
         IN  IF e.k = "w" THEN n
             ELSE IF ~e.counts THEN GWalk(rest, s, n)
             ELSE IF e.sig = s THEN GWalk(rest, s, n + 1)
             ELSE n

(* How many failures with signature s the spec has the breaker record a   *)
(* row for: a holder's or a lone claim-window rank's, none with a cure key. *)
Recorded(H, s) ==
    Cardinality({k \in DOMAIN H : H[k].k = "pw" /\ H[k].recorded /\ H[k].sig = s})

-----------------------------------------------------------------------------

Init ==
    /\ pc = [r \in Ranks |-> "idle"]
    /\ it = [r \in Ranks |-> 0]
    /\ cyc = [r \in Ranks |-> 0]
    /\ tried = [r \in Ranks |-> {}]
    /\ prev = [r \in Ranks |-> None]
    /\ cfails = [r \in Ranks |-> {}]
    /\ msgs = [i \in Items |-> <<>>]
    /\ deferred = [i \in Items |-> FALSE]
    /\ log = <<>>
    /\ pending = <<>>
    /\ runs = 0 /\ losses = 0 /\ lifts = 0 /\ wfails = 0 /\ others = 0
    /\ answers = [i \in Items |-> 0]
    /\ hist = [i \in Items |-> <<>>]
    /\ downs = <<>>
    /\ downsSince = [i \in Items |-> 0]

Free(i) == msgs[i] = <<>> /\ ~deferred[i]
Avail(r) == {i \in Items : i \notin tried[r] /\ Free(i)}
\* A row about item i, decided and not yet landed.
Unlanded(i) ==
    \E k \in DOMAIN pending :
        \/ pending[k].item = i
        \/ pending[k].t = "out" /\ i \in pending[k].items

EndCycleVars(r) ==
    /\ cyc' = [cyc EXCEPT ![r] = @ + 1]
    /\ tried' = [tried EXCEPT ![r] = {}]
    /\ prev' = [prev EXCEPT ![r] = None]
    /\ cfails' = [cfails EXCEPT ![r] = {}]

Claim(r) ==
    /\ pc[r] = "idle"
    /\ runs < MaxRuns
    /\ \E i \in Avail(r) :
         /\ PromptRows => ~Unlanded(i)
         /\ pc' = [pc EXCEPT ![r] = "post"]
         /\ it' = [it EXCEPT ![r] = i]
         /\ tried' = [tried EXCEPT ![r] = @ \cup {i}]
    /\ runs' = runs + 1
    /\ UNCHANGED <<cyc, prev, cfails, msgs, deferred, log, pending, losses,
                   lifts, wfails, others, answers, hist, downs, downsSince>>

Post(r) ==
    /\ pc[r] = "post"
    /\ msgs' = [msgs EXCEPT ![it[r]] = Append(@, r)]
    /\ pc' = [pc EXCEPT ![r] = "window"]
    /\ UNCHANGED <<it, cyc, tried, prev, cfails, deferred, log, pending, runs,
                   losses, lifts, wfails, others, answers, hist, downs, downsSince>>

Verify(r) ==
    LET i == it[r] IN
    /\ pc[r] = "window"
    /\ IF msgs[i] # <<>> /\ Head(msgs[i]) = r
         THEN pc' = [pc EXCEPT ![r] = "held"]
       ELSE IF HolderOnly
         THEN pc' = [pc EXCEPT ![r] = "idle"]   \* drops out silently
         ELSE pc' = [pc EXCEPT ![r] = "outranked"]   \* counts as if it held
    /\ UNCHANGED <<it, cyc, tried, prev, cfails, msgs, deferred, log, pending,
                   runs, losses, lifts, wfails, others, answers, hist, downs, downsSince>>

(* A run ends, and gives the claim back where `release` says so.          *)
GiveBack(r, release) ==
    /\ pc' = [pc EXCEPT ![r] = "idle"]
    /\ msgs' = IF release THEN [msgs EXCEPT ![it[r]] = <<>>] ELSE msgs

StartWorker(r) ==
    LET i == it[r] IN
    /\ pc[r] = "held"
    /\ ~Det
    /\ PromptRows => ~Unlanded(i)
    /\ hist' = [hist EXCEPT ![i] = Append(@, [k |-> "w", sig |-> "none",
                                              counts |-> FALSE,
                                              recorded |-> FALSE,
                                              endsOn |-> "none"])]
    /\ pending' = Append(pending, [t |-> "run", item |-> i, rank |-> r,
                                   cyc |-> cyc[r], worker |-> TRUE])
    /\ GiveBack(r, TRUE)
    /\ prev' = [prev EXCEPT ![r] = None]
    /\ UNCHANGED <<it, cyc, tried, cfails, deferred, log, runs, losses, lifts,
                   wfails, others, answers, downs, downsSince>>

(***************************************************************************)
(* A failure before the worker that the rank does not drop out of: a       *)
(* holder's, a claim-window failure where the rank is alone on the item,   *)
(* or, with HolderOnly FALSE, a failure of a rank that lost verification.  *)
(* `window` says the failure is in the claim window.                       *)
(***************************************************************************)
Fail(r, s, returned, cure, window) ==
    LET i        == it[r]
        p        == prev[r]
        pair     == /\ ~cure
                    /\ ~(RefusalsUnpaired /\ s \in RefusalSigs)
                    /\ p # None
                    /\ p.item # i
                    /\ \/ p.sig = s
                       \/ s \in SurfaceSigs /\ p.sig \in SurfaceSigs
        surface  == pair /\ s \in SurfaceSigs /\ p.sig \in SurfaceSigs
        outItems == IF surface THEN cfails[r] \cup {i} ELSE {p.item, i}
        holder   == msgs[i] # <<>> /\ Head(msgs[i]) = r
        \* What the spec counts. A rank that lost verification counts
        \* nothing under the spec, whatever HolderOnly says.
        specCounts == ~pair /\ ~cure /\ (holder \/ window)
        \* What this rank's code counts.
        codeCounts == /\ ~(pair /\ SkipSecondOfPair)
                      /\ ~(cure /\ CureSkipped)
        sig      == IF cure THEN CureSig ELSE s
        n        == Walk(log, i, sig, 0) + 1
        down     == /\ codeCounts
                    /\ \/ n >= Threshold
                       \/ returned /\ ~ReturnedRetried
                    /\ ~(SetDownOnce /\ deferred[i])
        entry    == [k |-> "pw", sig |-> sig, counts |-> specCounts,
                     recorded |-> ~cure /\ (holder \/ window),
                     rank |-> r, cyc |-> cyc[r],
                     endsOn |-> IF pair THEN s ELSE "none"]
        \* The ghost history, with the pair's failures marked as not counting.
        h1       == Append(hist[i], entry)
        newHist  == [j \in Items |->
                       LET h == IF j = i THEN h1 ELSE hist[j] IN
                       IF pair /\ j \in outItems
                         THEN [k \in DOMAIN h |->
                                IF h[k].k = "pw" /\ h[k].rank = r
                                   /\ h[k].cyc = cyc[r]
                                THEN [h[k] EXCEPT !.counts = FALSE]
                                ELSE h[k]]
                         ELSE h]
        pwRow    == [t |-> "pw", item |-> i, rank |-> r, cyc |-> cyc[r],
                     sig |-> sig, cure |-> cure]
        wlRow    == [t |-> "run", item |-> i, rank |-> r, cyc |-> cyc[r],
                     worker |-> FALSE]
        outRow   == [t |-> "out", item |-> 0, rank |-> r, cyc |-> cyc[r],
                     items |-> outItems]
        \* A thrown failure writes its `pre-worker` row only. A returned one
        \* also keeps the run row `execute`'s result produces. One that
        \* records a cure key, thrown or returned, also writes a run row, so
        \* #101 still sees the cure key, and its `pre-worker` row says it
        \* recorded one. Both run rows are marked workerless, and Walk skips
        \* them.
        rows1    == IF returned \/ cure THEN <<pwRow, wlRow>> ELSE <<pwRow>>
        rows     == IF pair THEN rows1 \o <<outRow>> ELSE rows1
        otherHolds == \E k \in Ranks \ {r} : pc[k] = "held" /\ it[k] = i
    IN
    /\ PromptRows => ~Unlanded(i)
    /\ hist' = newHist
    /\ pending' = pending \o rows
    /\ IF down
         THEN /\ deferred' = [deferred EXCEPT ![i] = TRUE]
              /\ downs' = Append(downs,
                     [item |-> i, rank |-> r, holder |-> holder,
                      window |-> window, otherHolds |-> otherHolds,
                      cure |-> cure,
                      inARow |-> GWalk(newHist[i], sig, 0),
                      recorded |-> Recorded(newHist[i], sig)])
              /\ downsSince' = [downsSince EXCEPT ![i] = @ + 1]
         ELSE UNCHANGED <<deferred, downs, downsSince>>
    \* Who gives the claim back: the holder, a rank failing in the claim
    \* window, and, with HolderOnly FALSE, an outranked rank that sets the
    \* item down. A lone claim-window rank withdraws in a second step where
    \* AtomicWithdraw is FALSE.
    /\ IF window /\ ~AtomicWithdraw
         THEN /\ pc' = [pc EXCEPT ![r] = "withdrawing"]
              /\ UNCHANGED msgs
         ELSE GiveBack(r, holder \/ window \/ down)
    /\ IF pair
         THEN EndCycleVars(r)
         ELSE /\ prev' = [prev EXCEPT ![r] = IF cure THEN @ ELSE [item |-> i, sig |-> s]]
              /\ cfails' = [cfails EXCEPT ![r] = @ \cup {i}]
              /\ UNCHANGED <<cyc, tried>>

FailSigs(r) == IF Det THEN {DetSig(it[r])} ELSE AllSigs

HeldFail(r) ==
    /\ pc[r] \in {"held", "outranked"}
    /\ \E s \in FailSigs(r), returned \in (IF Returned THEN BOOLEAN ELSE {FALSE}),
          cure \in (IF Cures /\ ~Det THEN BOOLEAN ELSE {FALSE}) :
         Fail(r, s, returned, cure, FALSE)
    /\ UNCHANGED <<it, log, runs, losses, lifts, wfails, others, answers>>

\* A failure in the claim window: the claim message failed to post ("post")
\* or was posted and the item not yet verified ("window").
WindowFail(r) ==
    LET i     == it[r]
        alone == ~\E k \in Range(msgs[i]) : k # r
    IN
    /\ pc[r] \in {"post", "window"}
    /\ wfails < MaxWindowFails
    /\ wfails' = wfails + 1
    /\ IF alone \/ ~AloneInWindow
         THEN /\ \E s \in FailSigs(r) : Fail(r, s, FALSE, FALSE, TRUE)
              /\ UNCHANGED <<it, log, runs, losses, lifts, others, answers>>
         ELSE \* Another rank's claim is on the item: count nothing, record
              \* nothing, leave the label and the messages.
              /\ pc' = [pc EXCEPT ![r] = "idle"]
              /\ UNCHANGED <<it, cyc, tried, prev, cfails, msgs, deferred, log,
                             pending, runs, losses, lifts, others, answers,
                             hist, downs, downsSince>>

EndCycle(r) ==
    /\ pc[r] = "idle"
    /\ tried[r] # {}
    /\ Avail(r) = {} \/ runs = MaxRuns
    /\ EndCycleVars(r)
    /\ UNCHANGED <<pc, it, msgs, deferred, log, pending, runs, losses, lifts,
                   wfails, others, answers, hist, downs, downsSince>>

\* A lone claim-window rank's withdrawal, a step after its test.
Withdraw(r) ==
    /\ pc[r] = "withdrawing"
    /\ GiveBack(r, TRUE)
    /\ UNCHANGED <<it, cyc, tried, prev, cfails, deferred, log, pending, runs,
                   losses, lifts, wfails, others, answers, hist, downs, downsSince>>

Land ==
    \E k \in DOMAIN pending :
      /\ Reorder \/ k = 1
      /\ log' = Append(log, pending[k])
      /\ pending' = [j \in 1..Len(pending) - 1 |->
                       IF j < k THEN pending[j] ELSE pending[j + 1]]
      /\ UNCHANGED <<pc, it, cyc, tried, prev, cfails, msgs, deferred, runs,
                     losses, lifts, wfails, others, answers, hist, downs, downsSince>>

Lose ==
    /\ losses < MaxLosses
    /\ \E k \in DOMAIN pending :
         /\ pending' = [j \in 1..Len(pending) - 1 |->
                          IF j < k THEN pending[j] ELSE pending[j + 1]]
         /\ losses' = losses + 1
    /\ UNCHANGED <<pc, it, cyc, tried, prev, cfails, msgs, deferred, log, runs,
                   lifts, wfails, others, answers, hist, downs, downsSince>>

\* A person's change to a deferred item, or another role's successful run on
\* it, lifts the set-down.
Lift(i) ==
    /\ deferred[i]
    /\ lifts < MaxLifts
    /\ deferred' = [deferred EXCEPT ![i] = FALSE]
    /\ downsSince' = [downsSince EXCEPT ![i] = 0]
    /\ lifts' = lifts + 1
    /\ answers' = [answers EXCEPT ![i] = @ + 1]
    /\ UNCHANGED <<pc, it, cyc, tried, prev, cfails, msgs, log, pending, runs,
                   losses, wfails, others, hist, downs>>

\* Another role's post on a deferred item that is not a successful run, such
\* as its own set-down or a comment. Under IgorPostsLiftNothing it changes
\* nothing the model tracks, so the step exists only with the rule off, where
\* it lifts the set-down.
OtherPost(i) ==
    /\ ~IgorPostsLiftNothing
    /\ deferred[i]
    /\ others < MaxOtherPosts
    /\ deferred' = [deferred EXCEPT ![i] = FALSE]
    /\ downsSince' = [downsSince EXCEPT ![i] = 0]
    /\ others' = others + 1
    /\ UNCHANGED <<pc, it, cyc, tried, prev, cfails, msgs, log, pending, runs,
                   losses, lifts, wfails, answers, hist, downs>>

\* #179 frees an item whose claim messages no running rank is working.
Recover(i) ==
    /\ msgs[i] # <<>>
    /\ ~\E r \in Ranks : it[r] = i /\ pc[r] # "idle"
    /\ msgs' = [msgs EXCEPT ![i] = <<>>]
    /\ UNCHANGED <<pc, it, cyc, tried, prev, cfails, deferred, log, pending,
                   runs, losses, lifts, wfails, others, answers, hist, downs, downsSince>>

Step(r) == Claim(r) \/ Post(r) \/ Verify(r) \/ StartWorker(r) \/ HeldFail(r)
           \/ WindowFail(r) \/ EndCycle(r) \/ Withdraw(r)

Next == \/ \E r \in Ranks : Step(r)
        \/ Land \/ Lose
        \/ \E i \in Items : Lift(i) \/ OtherPost(i) \/ Recover(i)

Fairness ==
    /\ \A r \in Ranks : WF_vars(Claim(r) \/ Post(r) \/ Verify(r)
                                \/ StartWorker(r) \/ HeldFail(r) \/ EndCycle(r)
                                \/ Withdraw(r))
    /\ WF_vars(Land)
    /\ \A i \in Items : WF_vars(Recover(i))

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Invariants. Each names the requirement of specs/work-claiming/spec.md   *)
(* it proves, or says that it proves none.                                 *)

TypeOK ==
    /\ pc \in [Ranks -> {"idle", "post", "window", "held",
                                 "withdrawing", "outranked"}]
    /\ deferred \in [Items -> BOOLEAN]
    /\ runs \in 0..MaxRuns
    /\ losses \in 0..MaxLosses
    /\ others \in 0..MaxOtherPosts

\* *A failure before the worker that repeats sets the item down*, "Only the
\* holder counts" and "In the claim window, a rank alone on the item counts":
\* a set-down comes from the rank whose claim message holds the item, or from
\* a rank in the claim window while no other rank holds it. A set-down must
\* never be posted under a sibling that has verified its claim and is working
\* the item; a sibling that has posted but not verified does not hold it yet.
NoSetDownByNonHolder ==
    \A k \in DOMAIN downs :
        downs[k].holder \/ (downs[k].window /\ ~downs[k].otherHolds)

\* *A failure before the worker that repeats sets the item down*: "When a
\* failure brings the count of identical ones to three or more". At least
\* three failures with the set-down's signature, each one a holder's or a
\* lone claim-window rank's, none recording a cure key.
NoSetDownWithoutThree ==
    \A k \in DOMAIN downs : downs[k].recorded >= Threshold

\* The same requirement in full: three identical failures that the spec
\* counts "in a row", skipping those *An outage is not the item's failure*
\* and the cure-key rule exclude, with no worker start and no different
\* counted failure between them, as the ghost history stood when the set-down
\* was decided, before a later pair could mark earlier failures as not
\* counting.
NoSetDownWithoutThreeInARow ==
    \A k \in DOMAIN downs : downs[k].inARow >= Threshold

\* *A failure before the worker that repeats sets the item down*, "One
\* set-down per deferral": no run posts a set-down on an item already
\* deferred. Without SetDownOnce two ranks can each post one
\* (negative/NoSetDownOnce.cfg).
NoDoubleSetDown ==
    \A i \in Items : downsSince[i] <= 1

\* *A failure before the worker that repeats sets the item down*, "What lifts
\* a set-down": every set-down of an item after its first follows a person's
\* change to it or another role's successful run on it, so two roles' posts
\* cannot keep setting each other's deferrals down and lifting them.
NoSetDownWithoutAnswer ==
    \A i \in Items :
        Cardinality({k \in DOMAIN downs : downs[k].item = i}) <= 1 + answers[i]

\* *A failure before the worker that repeats sets the item down*, "A fault in
\* the Igor's own setup is not the item's failure".
NoSetDownForCure ==
    \A k \in DOMAIN downs : ~downs[k].cure

\* *Two identical failures before the worker on different items end the
\* cycle*, "A refused call SHALL take no part in this rule either": no cycle
\* ends on a pair whose second run is a refused call. A pair's two signatures
\* are equal unless both are surface failures, so checking the second run's
\* signature also checks the first's.
NoCycleEndOnRefusal ==
    \A i \in Items : \A k \in DOMAIN hist[i] : hist[i][k].endsOn \notin RefusalSigs

(* Liveness, for the configurations where Det is TRUE.                     *)

\* *A failure before the worker that repeats sets the item down*: an item
\* whose every run fails the same way before the worker is set down.
RepeatedFailureSetDown ==
    \A i \in Items : <>(\E k \in DOMAIN downs : downs[k].item = i)

=============================================================================
