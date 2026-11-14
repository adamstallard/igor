--------------------------- MODULE PreWorkerBreaker ---------------------------
(***************************************************************************)
(* The breaker of the OpenSpec change `pre-worker-breaker`: one role,     *)
(* served by its one process (`role-process`, #242), counting each item's *)
(* failures before the worker from rows in the shared execution log,      *)
(* `executions.ndjson`.                                                    *)
(*                                                                         *)
(* The tracker holds whether each item is deferred, that is set down. A   *)
(* set-down lifts on a person's change to the item or on another role's   *)
(* successful run on it (`Lift`). Another role's other posts on the item  *)
(* lift nothing; with IgorPostsLiftNothing FALSE they do (`OtherPost`).   *)
(*                                                                         *)
(* A run: claims a free item (`Claim`), posts its claim message (`Post`), *)
(* and re-reads to verify (`Verify`). In the claim window, before or after *)
(* the post, the run may fail (`WindowFail`). A verified run either starts *)
(* the worker (`StartWorker`) or fails before it (`HeldFail`), the failure *)
(* thrown or returned by `execute`. A failure may record a cure key, #101's *)
(* mark of a fault in the Igor's own setup. Its `pre-worker` row says so,  *)
(* and the count skips it. A directed run (`ClaimDirected`) is `igor run   *)
(* --claim`: it runs outside any cycle, so it never pairs, and it may      *)
(* claim an item already deferred.                                         *)
(*                                                                         *)
(* Rows are not written when decided. Each goes into `pending` and lands   *)
(* at the end of the log later (`Land`), in any order when Reorder is      *)
(* TRUE, which is what a write refused and retried does. A pending row may *)
(* also be lost (`Lose`), at most MaxLosses times.                         *)
(*                                                                         *)
(* The breaker reads only the landed log, newest row first, as design.md  *)
(* *Counting* says. The ghost variable `hist` records every failure and   *)
(* every worker start in the order they were decided, with whether the    *)
(* spec counts it. The invariants compare each set-down with `hist`, so   *)
(* they check what the spec requires, not what the log happened to hold.  *)
(*                                                                         *)
(* The process applies the two two-in-a-row rules within its cycle: two   *)
(* failures on different items in a row, both surface failures (sigs in   *)
(* SurfaceSigs) or both identical. The second run of such a pair ends the *)
(* cycle and appends an `outage` row, which excludes the pair's rows (or, *)
(* for surface failures, every failure before the worker in the cycle) by *)
(* cycle and item. A refused call (sigs in RefusalSigs) counts toward its *)
(* item's breaker but is never one of a pair, so it never ends a cycle;   *)
(* like any failure that differs from the one before it, it separates the *)
(* runs on either side of it.                                              *)
(*                                                                         *)
(* Each rule of the change is a constant, TRUE in the change as specified. *)
(* The configurations in negative/ each set one FALSE and must find a     *)
(* violation, which shows that rule is needed. PromptRows is an           *)
(* assumption, not a rule. findings/LateRows.cfg drops it; what late rows *)
(* then cause is a known limit the change accepts.                         *)
(*                                                                         *)
(* Not modelled: several roles (the count is per role, so roles share     *)
(* nothing here, and `OtherPost` and `Lift` stand for another role's     *)
(* posts and successful runs); several worker slots running at once (each *)
(* slot works a different item, the count is per item, and the order in  *)
(* which runs end is the order `role-process` counts them in, so one run  *)
(* at a time stands for them); failures after the worker; the masks (a    *)
(* signature is a model value); a read of the count that fails, which     *)
(* counts nothing and so only removes set-downs; and the discovery         *)
(* watermark.                                                              *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    NItems,            \* items 1..NItems
    Sigs,              \* signatures of failures that are not surface failures
                       \* or refused calls: the working tree's or the Igor's
    SurfaceSigs,       \* signatures of tracker or code-host calls that got no
                       \* answer
    RefusalSigs,       \* signatures of tracker or code-host calls that were
                       \* answered and refused
    MaxRuns,           \* runs started, directed runs included
    MaxDirected,       \* directed runs, `igor run --claim`
    MaxLosses,         \* pending rows that may be lost
    MaxLifts,          \* deferrals lifted by a person's change to the item
                       \* or by another role's successful run on it
    MaxOtherPosts,     \* other roles' posts on a deferred item, which lift
                       \* it only with IgorPostsLiftNothing FALSE
    MaxWindowFails,    \* claim-window failures
    Returned,          \* `execute` may return a failure rather than throw it
    Cures,             \* a failure may record a cure key
    Reorder,           \* a pending row may land after rows decided later
    Det,               \* every run of item i fails before the worker with
                       \* DetSig(i): the liveness configurations
    PromptRows,        \* not a rule but a timing assumption: a row about an
                       \* item lands before any run claims the item, and
                       \* before any run already on it decides
    \* The rules. Each is TRUE in the change as specified.
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
ASSUME MaxDirected <= MaxRuns

Items == 1..NItems
AllSigs == Sigs \cup SurfaceSigs \cup RefusalSigs
CureSig == "cure"
None == [item |-> 0, sig |-> "none"]
Threshold == 3
\* The cycle a directed run's rows carry: no `outage` row names it.
NoCycle == -1

\* Every item's own failure in the liveness configurations, so that no pair
\* rule can join two items' failures.
DetSig(i) == IF i = 1 THEN "a" ELSE "b"
ASSUME Det => NItems <= 2

VARIABLES
    pc,          \* the run in progress: "idle", "post", "window" or "held"
    it,          \* the item the run is on
    directed,    \* whether the run is a directed run, outside any cycle
    cyc,         \* the process's cycle number
    tried,       \* items attempted in the cycle
    prev,        \* the cycle's previous run, for the pair rules
    cfails,      \* items that failed before the worker in the cycle
    deferred,    \* whether each item is set down
    log,         \* the landed rows of executions.ndjson, oldest first
    pending,     \* rows decided and not yet landed
    runs, dirs, losses, lifts, wfails, others,
    answers,     \* ghost: each item's lifts by a person or a successful run
    hist,        \* ghost: each item's failures and worker starts, in order
    downs,       \* ghost: one record per set-down posted
    downsSince   \* ghost: set-downs of each item since its deferral last lifted

vars == <<pc, it, directed, cyc, tried, prev, cfails, deferred, log, pending,
          runs, dirs, losses, lifts, wfails, others, answers, hist, downs,
          downsSince>>

-----------------------------------------------------------------------------
(* The breaker's count, from the landed log (design.md, Counting).          *)

Excluded(row) ==
    /\ OutageExcludes
    /\ \E k \in DOMAIN log :
         /\ log[k].t = "out"
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

(* How many failures with signature s the spec has the breaker count:     *)
(* every one whose run records no cure key.                                *)
Recorded(H, s) ==
    Cardinality({k \in DOMAIN H : H[k].k = "pw" /\ H[k].recorded /\ H[k].sig = s})

-----------------------------------------------------------------------------

Init ==
    /\ pc = "idle"
    /\ it = 0
    /\ directed = FALSE
    /\ cyc = 0
    /\ tried = {}
    /\ prev = None
    /\ cfails = {}
    /\ deferred = [i \in Items |-> FALSE]
    /\ log = <<>>
    /\ pending = <<>>
    /\ runs = 0 /\ dirs = 0 /\ losses = 0 /\ lifts = 0 /\ wfails = 0 /\ others = 0
    /\ answers = [i \in Items |-> 0]
    /\ hist = [i \in Items |-> <<>>]
    /\ downs = <<>>
    /\ downsSince = [i \in Items |-> 0]

Avail == {i \in Items : i \notin tried /\ ~deferred[i]}
\* A row about item i, decided and not yet landed.
Unlanded(i) ==
    \E k \in DOMAIN pending :
        \/ pending[k].item = i
        \/ pending[k].t = "out" /\ i \in pending[k].items

EndCycleVars ==
    /\ cyc' = cyc + 1
    /\ tried' = {}
    /\ prev' = None
    /\ cfails' = {}

Claim ==
    /\ pc = "idle"
    /\ runs < MaxRuns
    /\ \E i \in Avail :
         /\ PromptRows => ~Unlanded(i)
         /\ pc' = "post"
         /\ it' = i
         /\ tried' = tried \cup {i}
    /\ directed' = FALSE
    /\ runs' = runs + 1
    /\ UNCHANGED <<cyc, prev, cfails, deferred, log, pending, dirs, losses,
                   lifts, wfails, others, answers, hist, downs, downsSince>>

\* `igor run --claim`: a person names the item, which may be deferred.
ClaimDirected ==
    /\ pc = "idle"
    /\ runs < MaxRuns
    /\ dirs < MaxDirected
    /\ \E i \in Items :
         /\ PromptRows => ~Unlanded(i)
         /\ pc' = "post"
         /\ it' = i
    /\ directed' = TRUE
    /\ runs' = runs + 1
    /\ dirs' = dirs + 1
    /\ UNCHANGED <<cyc, tried, prev, cfails, deferred, log, pending, losses,
                   lifts, wfails, others, answers, hist, downs, downsSince>>

Post ==
    /\ pc = "post"
    /\ pc' = "window"
    /\ UNCHANGED <<it, directed, cyc, tried, prev, cfails, deferred, log,
                   pending, runs, dirs, losses, lifts, wfails, others, answers,
                   hist, downs, downsSince>>

Verify ==
    /\ pc = "window"
    /\ pc' = "held"
    /\ UNCHANGED <<it, directed, cyc, tried, prev, cfails, deferred, log,
                   pending, runs, dirs, losses, lifts, wfails, others, answers,
                   hist, downs, downsSince>>

(* A run ends, and gives the claim back.                                   *)
GiveBack ==
    /\ pc' = "idle"
    /\ directed' = FALSE

RowCyc == IF directed THEN NoCycle ELSE cyc

StartWorker ==
    LET i == it IN
    /\ pc = "held"
    /\ ~Det
    /\ PromptRows => ~Unlanded(i)
    /\ hist' = [hist EXCEPT ![i] = Append(@, [k |-> "w", sig |-> "none",
                                              counts |-> FALSE,
                                              recorded |-> FALSE,
                                              cyc |-> RowCyc,
                                              endsOn |-> "none"])]
    /\ pending' = Append(pending, [t |-> "run", item |-> i,
                                   cyc |-> RowCyc, worker |-> TRUE])
    /\ GiveBack
    /\ prev' = IF directed THEN prev ELSE None
    /\ UNCHANGED <<it, cyc, tried, cfails, deferred, log, runs, dirs, losses,
                   lifts, wfails, others, answers, downs, downsSince>>

(***************************************************************************)
(* A failure before the worker. `window` says it is in the claim window.  *)
(***************************************************************************)
Fail(s, returned, cure, window) ==
    LET i        == it
        p        == prev
        pair     == /\ ~directed
                    /\ ~cure
                    /\ ~(RefusalsUnpaired /\ s \in RefusalSigs)
                    /\ p # None
                    /\ p.item # i
                    /\ \/ p.sig = s
                       \/ s \in SurfaceSigs /\ p.sig \in SurfaceSigs
        surface  == pair /\ s \in SurfaceSigs /\ p.sig \in SurfaceSigs
        outItems == IF surface THEN cfails \cup {i} ELSE {p.item, i}
        \* What the spec counts.
        specCounts == ~pair /\ ~cure
        \* What the process's code counts.
        codeCounts == /\ ~(pair /\ SkipSecondOfPair)
                      /\ ~(cure /\ CureSkipped)
        sig      == IF cure THEN CureSig ELSE s
        n        == Walk(log, i, sig, 0) + 1
        down     == /\ codeCounts
                    /\ \/ n >= Threshold
                       \/ returned /\ ~ReturnedRetried
                    /\ ~(SetDownOnce /\ deferred[i])
        entry    == [k |-> "pw", sig |-> sig, counts |-> specCounts,
                     recorded |-> ~cure, cyc |-> RowCyc,
                     endsOn |-> IF pair THEN s ELSE "none"]
        \* The ghost history, with the pair's failures marked as not counting.
        h1       == Append(hist[i], entry)
        newHist  == [j \in Items |->
                       LET h == IF j = i THEN h1 ELSE hist[j] IN
                       IF pair /\ j \in outItems
                         THEN [k \in DOMAIN h |->
                                IF h[k].k = "pw" /\ h[k].cyc = cyc
                                THEN [h[k] EXCEPT !.counts = FALSE]
                                ELSE h[k]]
                         ELSE h]
        pwRow    == [t |-> "pw", item |-> i, cyc |-> RowCyc,
                     sig |-> sig, cure |-> cure]
        wlRow    == [t |-> "run", item |-> i, cyc |-> RowCyc,
                     worker |-> FALSE]
        outRow   == [t |-> "out", item |-> 0, cyc |-> cyc,
                     items |-> outItems]
        \* A thrown failure writes its `pre-worker` row only. A returned one
        \* also keeps the run row `execute`'s result produces. One that
        \* records a cure key, thrown or returned, also writes a run row, so
        \* #101 still sees the cure key, and its `pre-worker` row says it
        \* recorded one. Both run rows are marked workerless, and Walk skips
        \* them.
        rows1    == IF returned \/ cure THEN <<pwRow, wlRow>> ELSE <<pwRow>>
        rows     == IF pair THEN rows1 \o <<outRow>> ELSE rows1
    IN
    /\ PromptRows => ~Unlanded(i)
    /\ hist' = newHist
    /\ pending' = pending \o rows
    /\ IF down
         THEN /\ deferred' = [deferred EXCEPT ![i] = TRUE]
              /\ downs' = Append(downs,
                     [item |-> i, window |-> window, cure |-> cure,
                      inARow |-> GWalk(newHist[i], sig, 0),
                      recorded |-> Recorded(newHist[i], sig)])
              /\ downsSince' = [downsSince EXCEPT ![i] = @ + 1]
         ELSE UNCHANGED <<deferred, downs, downsSince>>
    /\ GiveBack
    /\ IF pair
         THEN EndCycleVars
       ELSE IF directed
         THEN UNCHANGED <<cyc, tried, prev, cfails>>
         ELSE /\ prev' = IF cure THEN prev ELSE [item |-> i, sig |-> s]
              /\ cfails' = cfails \cup {i}
              /\ UNCHANGED <<cyc, tried>>

FailSigs == IF Det THEN {DetSig(it)} ELSE AllSigs

HeldFail ==
    /\ pc = "held"
    /\ \E s \in FailSigs, returned \in (IF Returned THEN BOOLEAN ELSE {FALSE}),
          cure \in (IF Cures /\ ~Det THEN BOOLEAN ELSE {FALSE}) :
         Fail(s, returned, cure, FALSE)
    /\ UNCHANGED <<it, log, runs, dirs, losses, lifts, wfails, others, answers>>

\* A failure in the claim window: the claim message failed to post ("post")
\* or was posted and the item not yet verified ("window").
WindowFail ==
    /\ pc \in {"post", "window"}
    /\ wfails < MaxWindowFails
    /\ wfails' = wfails + 1
    /\ \E s \in FailSigs : Fail(s, FALSE, FALSE, TRUE)
    /\ UNCHANGED <<it, log, runs, dirs, losses, lifts, others, answers>>

EndCycle ==
    /\ pc = "idle"
    /\ tried # {}
    /\ Avail = {} \/ runs = MaxRuns
    /\ EndCycleVars
    /\ UNCHANGED <<pc, it, directed, deferred, log, pending, runs, dirs, losses,
                   lifts, wfails, others, answers, hist, downs, downsSince>>

Land ==
    \E k \in DOMAIN pending :
      /\ Reorder \/ k = 1
      /\ log' = Append(log, pending[k])
      /\ pending' = [j \in 1..Len(pending) - 1 |->
                       IF j < k THEN pending[j] ELSE pending[j + 1]]
      /\ UNCHANGED <<pc, it, directed, cyc, tried, prev, cfails, deferred, runs,
                     dirs, losses, lifts, wfails, others, answers, hist, downs,
                     downsSince>>

Lose ==
    /\ losses < MaxLosses
    /\ \E k \in DOMAIN pending :
         /\ pending' = [j \in 1..Len(pending) - 1 |->
                          IF j < k THEN pending[j] ELSE pending[j + 1]]
         /\ losses' = losses + 1
    /\ UNCHANGED <<pc, it, directed, cyc, tried, prev, cfails, deferred, log,
                   runs, dirs, lifts, wfails, others, answers, hist, downs,
                   downsSince>>

\* A person's change to a deferred item, or another role's successful run on
\* it, lifts the set-down.
Lift(i) ==
    /\ deferred[i]
    /\ lifts < MaxLifts
    /\ deferred' = [deferred EXCEPT ![i] = FALSE]
    /\ downsSince' = [downsSince EXCEPT ![i] = 0]
    /\ lifts' = lifts + 1
    /\ answers' = [answers EXCEPT ![i] = @ + 1]
    /\ UNCHANGED <<pc, it, directed, cyc, tried, prev, cfails, log, pending,
                   runs, dirs, losses, wfails, others, hist, downs>>

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
    /\ UNCHANGED <<pc, it, directed, cyc, tried, prev, cfails, log, pending,
                   runs, dirs, losses, lifts, wfails, answers, hist, downs>>

Next == \/ Claim \/ ClaimDirected \/ Post \/ Verify \/ StartWorker
        \/ HeldFail \/ WindowFail \/ EndCycle
        \/ Land \/ Lose
        \/ \E i \in Items : Lift(i) \/ OtherPost(i)

Fairness ==
    /\ WF_vars(Claim \/ Post \/ Verify \/ StartWorker \/ HeldFail \/ EndCycle)
    /\ WF_vars(Land)

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Invariants. Each names the requirement of specs/work-claiming/spec.md   *)
(* it proves, or says that it proves none.                                 *)

TypeOK ==
    /\ pc \in {"idle", "post", "window", "held"}
    /\ deferred \in [Items -> BOOLEAN]
    /\ runs \in 0..MaxRuns
    /\ dirs \in 0..MaxDirected
    /\ losses \in 0..MaxLosses
    /\ others \in 0..MaxOtherPosts

\* *A failure before the worker that repeats sets the item down*: "At the
\* third identical one in a row". At least three failures with the set-down's
\* signature, none recording a cure key.
NoSetDownWithoutThree ==
    \A k \in DOMAIN downs : downs[k].recorded >= Threshold

\* The same requirement in full: three identical failures that the spec
\* counts "in a row", as *Only a worker start or a different counted failure
\* starts the count again* reads it, skipping those *An outage is not the
\* item's failure* and *A fault in the Igor's own setup is not the item's
\* failure* exclude, with no worker start and no different counted failure
\* between them, as the ghost history stood when the set-down was decided,
\* before a later pair could mark earlier failures as not counting.
NoSetDownWithoutThreeInARow ==
    \A k \in DOMAIN downs : downs[k].inARow >= Threshold

\* *One set-down per deferral*: no run posts a set-down on an item already
\* deferred. Without SetDownOnce a directed run on a deferred item posts a
\* second one (negative/NoSetDownOnce.cfg).
NoDoubleSetDown ==
    \A i \in Items : downsSince[i] <= 1

\* *A set-down lifts on a person's change or another role's successful run*:
\* every set-down of an item after its first follows a person's change to it
\* or another role's successful run on it, so two roles' posts cannot keep
\* setting each other's deferrals down and lifting them.
NoSetDownWithoutAnswer ==
    \A i \in Items :
        Cardinality({k \in DOMAIN downs : downs[k].item = i}) <= 1 + answers[i]

\* *A fault in the Igor's own setup is not the item's failure*.
NoSetDownForCure ==
    \A k \in DOMAIN downs : ~downs[k].cure

\* *Two identical failures before the worker on different items end the
\* cycle*: "a failure whose call was answered and refused SHALL NOT be one of
\* the two runs": no cycle ends on a pair whose second run is a refused call.
\* A pair's two signatures are equal unless both are surface failures, so
\* checking the second run's signature also checks the first's.
NoCycleEndOnRefusal ==
    \A i \in Items : \A k \in DOMAIN hist[i] : hist[i][k].endsOn \notin RefusalSigs

(* Liveness, for the configurations where Det is TRUE.                     *)

\* *A failure before the worker that repeats sets the item down*: an item
\* whose every run fails the same way before the worker is set down.
RepeatedFailureSetDown ==
    \A i \in Items : <>(\E k \in DOMAIN downs : downs[k].item = i)

=============================================================================
