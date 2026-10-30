------------------------------ MODULE ProbeClaim ------------------------------
(***************************************************************************)
(* Several Igors in one stopped scope racing for its probe, as the        *)
(* OpenSpec change `probe-claim` specifies it.                            *)
(*                                                                         *)
(* The scope is a seat several roles draw on, so the Igors are processes *)
(* of more than one role, and two processes of one role may pick the     *)
(* same item. The Igors in First are processes of one role, those in   *)
(* Second of another, and each role has NItems items of its own.        *)
(*                                                                         *)
(* The execution log is a sequence of rows in storage order. Four kinds  *)
(* matter here:                                                          *)
(*   - a run row with out = "met": an occurrence of the condition. The   *)
(*     log starts with one, the occurrence that reached the threshold;   *)
(*   - a run row with out = "clear": a run that did not meet it, which   *)
(*     closes the condition;                                             *)
(*   - a run row with out = "nothing": a run that observed nothing, such *)
(*     as a workerless one, which ends its probe and changes nothing     *)
(*     else;                                                             *)
(*   - a probe row, naming its item and an id unique to the row, and a   *)
(*     void row naming a probe row's id.                                 *)
(* A probe row ends with a later run row for its item, or a later void   *)
(* row for it, or when it lapses.                                        *)
(*                                                                         *)
(* An append is in flight between being issued and landing, and anything *)
(* may happen meanwhile. It can be lost (MaxLosses), or land while its   *)
(* Igor is told it failed, which the model counts as a loss too. A late  *)
(* append (MaxLate) lands ahead of rows that landed while it was in      *)
(* flight, as a row stamped before midnight lands in the earlier day's   *)
(* partition after a row in the later day's. A re-read may be stale      *)
(* (MaxStale), returning only a prefix of the log.                       *)
(*                                                                         *)
(* Time is abstracted. The cooldown is a step (Tick) that marks the last *)
(* occurrence as cooled. The settle interval is the condition that no    *)
(* append which could still land ahead of an Igor's row is in flight.    *)
(* A lapse is a step that may happen only to a row whose Igor crashed,   *)
(* or whose run or void row was lost: the lapse is longer than any run,  *)
(* so a row whose Igor is alive and working never lapses.                *)
(*                                                                         *)
(* Each rule the change adopts is a constant, TRUE in the change as      *)
(* specified. Each configuration under negative/ sets one FALSE, and TLC *)
(* must then find a violation, which shows that rule is needed.          *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS
    First,            \* processes of one role, as model values
    Second,           \* processes of a second role on the same seat
    NItems,           \* items per role
    MaxLosses, MaxLate, MaxStale, MaxCrashes, MaxClaimLosses,
    MaxRounds,        \* probes that may meet the condition again
    MaxNothing,       \* probes that may observe nothing
    Reread,           \* an Igor decides from a re-read after its row lands
    Settle,           \* ... made once no append that could land ahead is in flight
    OldestDecides,    \* the oldest unended probe row decides, not the newest
    VoidById,         \* a void row ends only the probe row it names
    VoidLoser,        \* an Igor whose row does not decide voids it
    FailedTakesNone,  \* an Igor whose append failed takes no item
    VoidFailed        \* ... and voids the row it tried to append

Igors == First \cup Second
RoleOf == [i \in Igors |-> IF i \in First THEN 1 ELSE 2]
\* Processes of one role are interchangeable. Safety configurations use this
\* symmetry. Liveness configurations must not: TLC can miss a liveness violation
\* under symmetry.
Symmetry == Permutations(First)
Items == {<<r, k>> : r \in {RoleOf[i] : i \in Igors}, k \in 1..NItems}
ItemsOf(i) == {x \in Items : x[1] = RoleOf[i]}
NoId == <<0, 0>>
NoItem == <<0, 0>>

Row(t, id, item, out) == [t |-> t, id |-> id, item |-> item, out |-> out]

VARIABLES
    log,        \* the execution log, in storage order
    inflight,   \* appends issued and not yet landed or lost
    pc,         \* each Igor's step
    attempt,    \* each Igor's current probe row id
    chosen,     \* the item each Igor's current probe row names
    next,       \* each Igor's next attempt number
    orphaned,   \* ids of probe rows nobody will end: their Igor crashed, or their end was lost
    lapsed,     \* ids of probe rows that lapsed
    cooled,     \* the index of the occurrence whose cooldown has passed, or 0
    losses, lates, stales, crashes, claimLosses, rounds, nothings

vars == <<log, inflight, pc, attempt, chosen, next, orphaned, lapsed, cooled,
          losses, lates, stales, crashes, claimLosses, rounds, nothings>>

(* ---- Reading the log, as `conditionOf` and its probe rule would ------- *)

Max(S) == CHOOSE m \in S : \A n \in S : n <= m
Min(S) == CHOOSE m \in S : \A n \in S : m <= n

\* The last occurrence: the newest run row that met the condition.
Last(lg) == Max({k \in 1..Len(lg) : lg[k].t = "run" /\ lg[k].out = "met"})

Cleared(lg) == \E k \in Last(lg)+1..Len(lg) : lg[k].t = "run" /\ lg[k].out = "clear"

\* Whether a later row `e` ends probe row `p`.
Ends(e, p) ==
    \/ e.t = "run" /\ e.item = p.item
    \/ e.t = "void" /\ (IF VoidById THEN e.id = p.id ELSE e.item = p.item)

Ended(lg, k) ==
    \/ lg[k].id \in lapsed
    \/ \E j \in k+1..Len(lg) : Ends(lg[j], lg[k])

ProbeRows(lg) == {k \in Last(lg)+1..Len(lg) : lg[k].t = "probe"}

\* The index of the probe row that holds the scope, or 0 where none does.
Deciding(lg) ==
    LET P == ProbeRows(lg)
        U == {k \in P : ~Ended(lg, k)}
    IN IF OldestDecides
         THEN (IF U = {} THEN 0 ELSE Min(U))
         ELSE (IF P = {} THEN 0
               ELSE IF Ended(lg, Max(P)) THEN 0 ELSE Max(P))

Due == cooled = Last(log) /\ ~Cleared(log) /\ Deciding(log) = 0

PosOf(id) == CHOOSE k \in 1..Len(log) : log[k].t = "probe" /\ log[k].id = id
Landed(id) == \E k \in 1..Len(log) : log[k].t = "probe" /\ log[k].id = id

\* No append that could still land ahead of row `pos` is in flight. An append
\* lands at a position after `issue`, the log's length when it was issued, so
\* one whose issue is at least `pos` can only land after row `pos`.
SettledAt(pos) == \A f \in inflight : f.issue >= pos

Issue(row, i) == inflight' = inflight \cup {[row |-> row, issue |-> Len(log), owner |-> i]}

(* ---- Steps ------------------------------------------------------------ *)

Init ==
    /\ log = << Row("run", NoId, NoItem, "met") >>
    /\ inflight = {}
    /\ pc = [i \in Igors |-> "idle"]
    /\ attempt = [i \in Igors |-> NoId]
    /\ chosen = [i \in Igors |-> NoItem]
    /\ next = [i \in Igors |-> 1]
    /\ orphaned = {}
    /\ lapsed = {}
    /\ cooled = 0
    /\ losses = 0 /\ lates = 0 /\ stales = 0 /\ crashes = 0
    /\ claimLosses = 0 /\ rounds = 0 /\ nothings = 0

Tick ==
    /\ ~Cleared(log) /\ cooled # Last(log)
    /\ cooled' = Last(log)
    /\ UNCHANGED <<log, inflight, pc, attempt, chosen, next, orphaned, lapsed,
                   losses, lates, stales, crashes, claimLosses, rounds, nothings>>

\* An Igor reads the log, finds the probe due, and appends its probe row.
Start(i) ==
    /\ pc[i] = "idle" /\ Due
    /\ \E x \in ItemsOf(i) :
         LET id == <<i, next[i]>> IN
         /\ Issue(Row("probe", id, x, "none"), i)
         /\ attempt' = [attempt EXCEPT ![i] = id]
         /\ chosen' = [chosen EXCEPT ![i] = x]
         /\ next' = [next EXCEPT ![i] = @ + 1]
         /\ pc' = [pc EXCEPT ![i] = "appending"]
    /\ UNCHANGED <<log, orphaned, lapsed, cooled,
                   losses, lates, stales, crashes, claimLosses, rounds, nothings>>

\* An append lands, at the end or, late, ahead of rows that landed while it was in
\* flight. Two cuts keep the model finite and small, and neither changes what
\* any step reads:
\*   - rows older than the last occurrence are never read again, so the log is
\*     cut to start at the last occurrence. An append in flight from before the
\*     cut has issue = 0 and may land at position 1, ahead of the last
\*     occurrence, where no reader looks, so the model drops it;
\*   - with nothing in flight and every probe row ended (`quiet`), the log is
\*     cut to the last occurrence and any run that cleared it.
Land(f) ==
    /\ f \in inflight
    /\ \E p \in (IF lates < MaxLate THEN f.issue+1..Len(log)+1 ELSE {Len(log)+1}) :
         LET grown == IF p = 1 THEN log
                      ELSE SubSeq(log, 1, p-1) \o <<f.row>> \o SubSeq(log, p, Len(log))
             shifted == {IF g.issue >= p THEN [g EXCEPT !.issue = @ + 1] ELSE g
                         : g \in inflight \ {f}}
             cut == Last(grown) - 1
             kept == {[g EXCEPT !.issue = IF @ > cut THEN @ - cut ELSE 0] : g \in shifted}
             live == {grown[k].id : k \in cut+1..Len(grown)} \cup {g.row.id : g \in kept}
             trimmed == SubSeq(grown, cut+1, Len(grown))
             \* With nothing in flight and every probe row ended, only the last
             \* occurrence and whether a run cleared it are ever read again.
             quiet == kept = {} /\ \A k \in ProbeRows(trimmed) : Ended(trimmed, k)
             closed == {k \in 2..Len(trimmed) : trimmed[k].t = "run" /\ trimmed[k].out = "clear"}
         IN /\ log' = IF ~quiet THEN trimmed
                      ELSE <<trimmed[1]>> \o (IF closed = {} THEN <<>> ELSE <<trimmed[Min(closed)]>>)
            /\ inflight' = kept
            /\ cooled' = IF cooled > cut THEN (IF quiet THEN 1 ELSE cooled - cut) ELSE 0
            /\ orphaned' = IF quiet THEN {} ELSE orphaned \cap live
            /\ lapsed' = IF quiet THEN {} ELSE lapsed \cap live
            /\ lates' = IF p <= Len(log) THEN lates + 1 ELSE lates
    /\ LET i == f.owner
           waiting == f.row.t = "probe" /\ pc[i] = "appending" /\ attempt[i] = f.row.id
       IN \/ /\ waiting
             /\ pc' = [pc EXCEPT ![i] = IF Reread THEN "settling" ELSE "claiming"]
             /\ UNCHANGED losses
          \/ /\ waiting /\ losses < MaxLosses   \* landed, but its Igor is told it failed
             /\ pc' = [pc EXCEPT ![i] = "failed"]
             /\ losses' = losses + 1
          \/ /\ ~waiting
             /\ UNCHANGED <<pc, losses>>
    /\ UNCHANGED <<attempt, chosen, next, stales, crashes, claimLosses, rounds, nothings>>

Lose(f) ==
    /\ f \in inflight /\ losses < MaxLosses
    /\ losses' = losses + 1
    /\ inflight' = inflight \ {f}
    /\ IF f.row.t = "probe"
         THEN /\ pc' = IF pc[f.owner] = "appending" /\ attempt[f.owner] = f.row.id
                         THEN [pc EXCEPT ![f.owner] = "failed"] ELSE pc
              /\ UNCHANGED orphaned
         ELSE /\ orphaned' = orphaned \cup {f.row.id}   \* a lost end leaves the row to lapse
              /\ UNCHANGED pc
    /\ UNCHANGED <<log, attempt, chosen, next, lapsed, cooled,
                   lates, stales, crashes, claimLosses, rounds, nothings>>

\* After the settle interval, an Igor re-reads and takes the item only where its row decides.
Settled(i) ==
    /\ pc[i] = "settling"
    /\ (Settle /\ Landed(attempt[i])) => SettledAt(PosOf(attempt[i]))
    /\ \E n \in (IF stales < MaxStale THEN 1..Len(log) ELSE {Len(log)}) :
         LET read == SubSeq(log, 1, n)
             d == Deciding(read)
         IN /\ stales' = IF n < Len(log) THEN stales + 1 ELSE stales
            /\ IF d # 0 /\ read[d].id = attempt[i]
                 THEN /\ pc' = [pc EXCEPT ![i] = "claiming"]
                      /\ UNCHANGED inflight
                 ELSE /\ pc' = [pc EXCEPT ![i] = "idle"]
                      /\ IF VoidLoser
                           THEN Issue(Row("void", attempt[i], chosen[i], "none"), i)
                           ELSE UNCHANGED inflight
    /\ UNCHANGED <<log, attempt, chosen, next, orphaned, lapsed, cooled,
                   losses, lates, crashes, claimLosses, rounds, nothings>>

\* An Igor told its append failed. The append may have landed all the same.
Failed(i) ==
    /\ pc[i] = "failed"
    /\ IF FailedTakesNone
         THEN /\ pc' = [pc EXCEPT ![i] = "idle"]
              /\ IF VoidFailed
                   THEN Issue(Row("void", attempt[i], chosen[i], "none"), i)
                   ELSE UNCHANGED inflight
         ELSE /\ pc' = [pc EXCEPT ![i] = "claiming"]
              /\ UNCHANGED inflight
    /\ UNCHANGED <<log, attempt, chosen, next, orphaned, lapsed, cooled,
                   losses, lates, stales, crashes, claimLosses, rounds, nothings>>

\* The claim on the probe item: won, or lost to somebody else, which voids the row.
Claim(i) ==
    /\ pc[i] = "claiming"
    /\ pc' = [pc EXCEPT ![i] = "running"]
    /\ UNCHANGED <<log, inflight, attempt, chosen, next, orphaned, lapsed, cooled,
                   losses, lates, stales, crashes, claimLosses, rounds, nothings>>

ClaimLost(i) ==
    /\ pc[i] = "claiming" /\ claimLosses < MaxClaimLosses
    /\ claimLosses' = claimLosses + 1
    /\ pc' = [pc EXCEPT ![i] = "idle"]
    /\ Issue(Row("void", attempt[i], chosen[i], "none"), i)
    /\ UNCHANGED <<log, attempt, chosen, next, orphaned, lapsed, cooled,
                   losses, lates, stales, crashes, rounds, nothings>>

\* The probe's run ends, and its run row is appended.
Finish(i) ==
    /\ pc[i] = "running"
    /\ \E out \in {"clear"} \cup (IF rounds < MaxRounds THEN {"met"} ELSE {})
                            \cup (IF nothings < MaxNothing THEN {"nothing"} ELSE {}) :
         /\ Issue(Row("run", attempt[i], chosen[i], out), i)
         /\ rounds' = IF out = "met" THEN rounds + 1 ELSE rounds
         /\ nothings' = IF out = "nothing" THEN nothings + 1 ELSE nothings
    /\ pc' = [pc EXCEPT ![i] = "idle"]
    /\ UNCHANGED <<log, attempt, chosen, next, orphaned, lapsed, cooled,
                   losses, lates, stales, crashes, claimLosses>>

\* A process dies. Its probe row, landed or still in flight, is left to lapse.
Crash(i) ==
    /\ pc[i] # "idle" /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    /\ pc' = [pc EXCEPT ![i] = "idle"]
    /\ orphaned' = orphaned \cup {attempt[i]}
    /\ UNCHANGED <<log, inflight, attempt, chosen, next, lapsed, cooled,
                   losses, lates, stales, claimLosses, rounds, nothings>>

Lapse ==
    /\ \E id \in orphaned \ lapsed : lapsed' = lapsed \cup {id}
    /\ UNCHANGED <<log, inflight, pc, attempt, chosen, next, orphaned, cooled,
                   losses, lates, stales, crashes, claimLosses, rounds, nothings>>

\* The condition is closed and nothing is left to do. Any other state with no
\* step is a deadlock, which TLC reports.
Done ==
    /\ Cleared(log) /\ inflight = {} /\ \A i \in Igors : pc[i] = "idle"
    /\ UNCHANGED vars

Step(i) == Start(i) \/ Settled(i) \/ Failed(i) \/ Claim(i) \/ Finish(i)

Next ==
    \/ Tick \/ Lapse \/ Done
    \/ \E f \in inflight : Land(f) \/ Lose(f)
    \/ \E i \in Igors : Step(i) \/ ClaimLost(i) \/ Crash(i)

Spec ==
    /\ Init /\ [][Next]_vars
    /\ WF_vars(Tick) /\ WF_vars(Lapse)
    /\ WF_vars(\E f \in inflight : Land(f))
    /\ \A i \in Igors : WF_vars(Step(i))

\* States that differ only in an idle Igor's last attempt, or in the number
\* its next attempt gets, behave alike.
StateView ==
    <<log, inflight, pc, orphaned, lapsed, cooled,
      [i \in Igors |-> IF pc[i] = "idle" THEN NoId ELSE attempt[i]],
      [i \in Igors |-> IF pc[i] = "idle" THEN NoItem ELSE chosen[i]],
      losses, lates, stales, crashes, claimLosses, rounds, nothings>>

(* ---- Properties ------------------------------------------------------- *)

Active == {"appending", "settling", "failed", "claiming", "running"}

TypeOK ==
    /\ pc \in [Igors -> {"idle"} \cup Active]
    /\ cooled \in 0..Len(log)

\* Requirement: Exactly one Igor takes a due probe, decided by the log after
\* it writes. At most one Igor is ever taking a probe item. That at least one
\* takes it is DueProbed, below.
ExactlyOneProbe ==
    Cardinality({i \in Igors : pc[i] \in {"claiming", "running"}}) <= 1

\* Requirement: Exactly one Igor takes a due probe, decided by the log after
\* it writes; its scenario "A probe row nobody is taking does not hold the
\* scope". A probe row holds the scope only while its own Igor is still
\* working it, or its end is on the way, or it is left to lapse because its
\* Igor died or its end was lost.
HeldOnlyByItsProbe ==
    LET d == Deciding(log) IN
    d # 0 =>
        LET p == log[d] IN
        \/ p.id \in orphaned
        \/ \E i \in Igors : attempt[i] = p.id /\ pc[i] \in Active
        \/ \E f \in inflight : f.row.t \in {"void", "run"} /\ Ends(f.row, p)

\* Requirement: Exactly one Igor takes a due probe, decided by the log after
\* it writes; its scenario "A due probe is taken". Once the cooldown has passed
\* and the condition is not closed, some Igor eventually runs the probe item,
\* or a probe's run row already on its way closes the condition, or meets it
\* again (out = "met") and so starts a new cooldown.
\* Stated from the cooldown rather than from Due, because a probe row nobody
\* works makes Due false and would leave the property true for a scope held
\* for good. Lost, late and stale appends and reads, a crash and a lost claim
\* delay the probe, and never stop it.
Cooled == cooled = Last(log) /\ ~Cleared(log)
DueProbed == Cooled ~> ((\E i \in Igors : pc[i] = "running") \/ ~Cooled)
==============================================================================
