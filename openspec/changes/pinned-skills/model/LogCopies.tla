---------------------------- MODULE LogCopies ----------------------------
(* The session log copies of one work item's executions, under decision   *)
(* 38 in the proposal.md of the OpenSpec change pinned-skills. When an    *)
(* execution of the item ends, Igor deletes on its own host the copies of *)
(* every execution that meets three conditions: it started before the    *)
(* one that ended; it has ended, or its process has stopped; and it left  *)
(* no flagged hold. #216, the change that adds flagged holds and work     *)
(* triage, lets two executions of one item run at once, so executions     *)
(* here overlap freely, on one host or several.                           *)
(*                                                                        *)
(* Executions are numbered in the order they start. Each runs on one      *)
(* host, makes its copies while it runs, and then ends, possibly leaving  *)
(* a flagged hold, or stops because its Igor process stopped. #216 may    *)
(* release a hold at any time, which deletes that execution's files.      *)
(*                                                                        *)
(* Each rule the change relies on is a constant, TRUE as specified. Each  *)
(* file in negative/ turns one off and checks the property that breaks.   *)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Execs,          \* the number of executions of the item
    Hosts,          \* the hosts its executions may run on
    StartedBefore,  \* an end deletes only executions that started before it
    FinishedOnly,   \* an end deletes only executions that ended or stopped
    StoppedCounts,  \* an execution whose process stopped counts as finished
    FlagCheck,      \* an end deletes no execution that left a flagged hold
    HoldAtEnd       \* a flagged hold is in place when its execution ends

E == 1..Execs

VARIABLES
    st,       \* "idle", "running", "ended" or "stopped"
    host,     \* the host an execution runs on, once started
    copied,   \* its copies exist in its host's state directory
    held,     \* it left a flagged hold that #216 has not released
    pending,  \* it ended flagged and its hold is not yet in place
    del,      \* who deleted its copies: "none", "igor" or "triage"
    fin,      \* the order in which it ended or stopped; 0 before then
    clock     \* the number of executions that have ended or stopped

vars == <<st, host, copied, held, pending, del, fin, clock>>

Init ==
    /\ st = [e \in E |-> "idle"]
    /\ host = [e \in E |-> CHOOSE h \in Hosts : TRUE]
    /\ copied = [e \in E |-> FALSE]
    /\ held = [e \in E |-> FALSE]
    /\ pending = [e \in E |-> FALSE]
    /\ del = [e \in E |-> "none"]
    /\ fin = [e \in E |-> 0]
    /\ clock = 0

TypeOK ==
    /\ st \in [E -> {"idle", "running", "ended", "stopped"}]
    /\ host \in [E -> Hosts]
    /\ copied \in [E -> BOOLEAN]
    /\ held \in [E -> BOOLEAN]
    /\ pending \in [E -> BOOLEAN]
    /\ del \in [E -> {"none", "igor", "triage"}]
    /\ fin \in [E -> 0..Execs]
    /\ clock \in 0..Execs

\* The states in which an end counts an earlier execution as finished.
FinishedStates ==
    IF ~FinishedOnly THEN {"running", "ended", "stopped"}
    ELSE IF StoppedCounts THEN {"ended", "stopped"}
    ELSE {"ended"}

\* Whether the end of execution e deletes the copies of execution d.
Deletes(e, d) ==
    /\ d # e
    /\ copied[d]
    /\ host[d] = host[e]
    /\ st[d] \in FinishedStates
    /\ StartedBefore => d < e
    /\ FlagCheck => ~held[d]

\* Executions start in the order of their numbers, each on any host.
Start(e, h) ==
    /\ st[e] = "idle"
    /\ IF e = 1 THEN TRUE ELSE st[e - 1] # "idle"
    /\ st' = [st EXCEPT ![e] = "running"]
    /\ host' = [host EXCEPT ![e] = h]
    /\ UNCHANGED <<copied, held, pending, del, fin, clock>>

\* A Claude model call inside the execution exits, and Igor copies its
\* session log. One action stands for all of an execution's calls: the
\* invariants ask only whether it has copies, not how many.
Copy(e) ==
    /\ st[e] = "running"
    /\ ~copied[e]
    /\ del[e] = "none"
    /\ copied' = [copied EXCEPT ![e] = TRUE]
    /\ UNCHANGED <<st, host, held, pending, del, fin, clock>>

\* Execution e ends, flagged or not, and Igor deletes on its host the
\* copies of every execution the rule names.
End(e, flagged) ==
    LET gone == {d \in E : Deletes(e, d)}
    IN
    /\ st[e] = "running"
    /\ st' = [st EXCEPT ![e] = "ended"]
    /\ fin' = [fin EXCEPT ![e] = clock + 1]
    /\ clock' = clock + 1
    /\ held' = [held EXCEPT ![e] = flagged /\ HoldAtEnd]
    /\ pending' = [pending EXCEPT ![e] = flagged /\ ~HoldAtEnd]
    /\ copied' = [d \in E |-> IF d \in gone THEN FALSE ELSE copied[d]]
    /\ del' = [d \in E |-> IF d \in gone THEN "igor" ELSE del[d]]
    /\ UNCHANGED host

\* Without HoldAtEnd, #216 puts the hold of an execution that ended
\* flagged in a step of its own.
PlaceHold(e) ==
    /\ pending[e]
    /\ pending' = [pending EXCEPT ![e] = FALSE]
    /\ held' = [held EXCEPT ![e] = TRUE]
    /\ UNCHANGED <<st, host, copied, del, fin, clock>>

\* The Igor process running e stops; e never ends.
Stop(e) ==
    /\ st[e] = "running"
    /\ st' = [st EXCEPT ![e] = "stopped"]
    /\ fin' = [fin EXCEPT ![e] = clock + 1]
    /\ clock' = clock + 1
    /\ UNCHANGED <<host, copied, held, pending, del>>

\* #216 releases a hold, by igor release or an edit from someone with
\* write access, and deletes that execution's files.
Release(e) ==
    /\ held[e]
    /\ held' = [held EXCEPT ![e] = FALSE]
    /\ copied' = [copied EXCEPT ![e] = FALSE]
    /\ del' = [del EXCEPT ![e] = IF copied[e] THEN "triage" ELSE del[e]]
    /\ UNCHANGED <<st, host, pending, fin, clock>>

Next ==
    \/ \E e \in E, h \in Hosts : Start(e, h)
    \/ \E e \in E : Copy(e) \/ PlaceHold(e) \/ Stop(e) \/ Release(e)
    \/ \E e \in E, f \in BOOLEAN : End(e, f)

Spec == Init /\ [][Next]_vars

\* Requirement: "The worker's session log outlives the reset"
\* (pinned-skills), its scenario "A running execution's log copies stay".
\* No execution's copies are deleted while it runs.
NoCopyDeletedWhileRunning ==
    \A e \in E : st[e] = "running" => del[e] = "none"

\* Requirement: "The worker's session log outlives the reset"
\* (pinned-skills), its scenario "Igor deletes no flagged execution's log
\* copies". Only #216's release deletes a flagged execution's copies.
FlaggedCopiesWaitForRelease ==
    \A e \in E : (held[e] \/ pending[e]) => del[e] # "igor"

\* Requirement: "The worker's session log outlives the reset"
\* (pinned-skills), its scenario "An unflagged execution's log copies last
\* until the item's next execution ends". Igor never deletes the copies of
\* the latest execution to start on a host.
LatestCopiesKept ==
    \A e \in E :
        (st[e] # "idle"
           /\ ~\E d \in E : d > e /\ st[d] # "idle" /\ host[d] = host[e])
            => del[e] # "igor"

\* Requirement: "The worker's session log outlives the reset"
\* (pinned-skills), its scenarios "An unflagged execution's log copies last
\* until the item's next execution ends" and "A crashed execution's log
\* copies go when the next execution ends". An unflagged execution that has
\* ended or stopped keeps no copies once a later-started execution on its
\* host has ended after it.
NoStaleCopies ==
    \A e \in E :
        (copied[e] /\ st[e] \in {"ended", "stopped"} /\ ~held[e] /\ ~pending[e])
            => ~\E d \in E :
                   /\ d > e
                   /\ host[d] = host[e]
                   /\ st[d] = "ended"
                   /\ fin[d] > fin[e]
=============================================================================
