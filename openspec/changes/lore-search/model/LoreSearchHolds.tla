--------------------------- MODULE LoreSearchHolds ---------------------------
(***************************************************************************)
(* The hold on one flagged item and its release, as the OpenSpec change  *)
(* `lore-search` specifies them in `work-triage`'s "An item handed back   *)
(* is not re-worked until something answers" and `graceful-handoff`'s     *)
(* "A handoff states what was done, what remains, and who could           *)
(* continue".                                                              *)
(*                                                                         *)
(* Processes are the ranks of one role and `igor run`s. Each has a state  *)
(* directory, named by its state-directory id (decision 116); several     *)
(* processes may share one. A flagged run keeps the item's question on    *)
(* its process's directory: it adds that directory's entry to the hold    *)
(* record, moves a session-log copy there, writes the question file, and  *)
(* appends the `needs a person` ledger row, each a separate write.        *)
(*                                                                         *)
(* A release by an edit appends `release requested`. Any live process    *)
(* whose state directory has an open entry, a rank or an `igor run`, then *)
(* deletes the log copy and then the question file there, decision 102's *)
(* order, clears the entry, and re-reads the record, appending `released` *)
(* once every entry is cleared (decision 120). `igor release` does the    *)
(* same against the directory it runs on, and may drop an entry with a    *)
(* flag (decision 121). The model's ids are its directories, so a lost or *)
(* copied id is not shown: dropping is clearing an entry whose directory  *)
(* holds no files. Any process that finds every entry cleared and no      *)
(* `released` row appends it, which covers a crash between the last clear *)
(* and the row.                                                            *)
(*                                                                         *)
(* Every write is its own step, so any interleaving, and a crash between  *)
(* any two writes, is a state the model reaches: a crash loses only what  *)
(* a process was about to do next, `pending`, and it restarts at once. A  *)
(* crashed keep resumes; a keep abandoned part-way for good is not        *)
(* modelled. A rank retires and is then gone by #179's heartbeat rule,    *)
(* which waits three poll intervals; the model folds that wait into one   *)
(* step. An `igor run` exits and is gone. The hold record may be lost,    *)
(* after which a process knows the item is held only from the question    *)
(* file on its own directory or from the ledger's latest row.             *)
(*                                                                         *)
(* Each rule the model found the change needs is a constant, TRUE in the *)
(* change as specified; the configurations under negative/ turn one off. *)
(* One constant is an assumption, not a rule: KeepsDoneFirst, that no     *)
(* keep is part-way when a release starts. The passing configurations    *)
(* rely on it; findings/KeepDuringRelease.cfg drops it and finds a        *)
(* violation, left for Adam.                                               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Procs,          \* the processes: ranks and `igor run`s
    Runs,           \* the subset of Procs that are `igor run`s
    Dirs,           \* state-directory ids
    Layout,         \* which processes share a state directory: see Placement
    Keepers,        \* the processes whose flagged run keeps the question
    MaxCrashes,     \* how many times processes may crash, in all
    MaxLosses,      \* how many times the hold record may be lost
    MaxRetires,     \* how many ranks may retire
    EntryFirst,     \* a keep adds its entry before writing any file
    ReReadBeforeReleased, \* `released` is appended only after re-reading
    RecoverReleased, \* any process appends a missed `released`
    OwnDirOnly,     \* no process deletes in another's directory
    AnyOnDir,       \* any live process on a directory clears its entry, not only the process the entry names
    WorkOnlyIfReleased, \* a process works the item only when it is not held
    NoticeUntilUnaffected, \* a notice clears only when nothing is affected (decision 122)
    KeepsDoneFirst  \* assumption, not a rule: no keep is part-way when a release starts

\* Processes are "r1", "r2" and "run"; directories are "d1" and "d2".
\* "own": each rank has its own directory and the `igor run` shares r1's.
\* "shared": both ranks share "d1", and the `igor run` has "d2".
Placement ==
    IF Layout = "own"
        THEN {<<"r1", "d1">>, <<"r2", "d2">>, <<"run", "d1">>}
        ELSE {<<"r1", "d1">>, <<"r2", "d1">>, <<"run", "d2">>}

DirOf[p \in Procs] == CHOOSE d \in Dirs : <<p, d>> \in Placement

ASSUME /\ Layout \in {"own", "shared"}
       /\ \A p \in Procs : \E d \in Dirs : <<p, d>> \in Placement
       /\ Runs \subseteq Procs /\ Keepers \subseteq Procs

Op == "operator"                \* `igor release`, run against a directory
NoProc == "none"

VARIABLES
    files,      \* files[d]: the item's files on directory d, a subset of {"log", "q"}
    record,     \* the hold record: [lost, released, entry, keeper]
    last,       \* the latest ledger row for the item
    hasReleased,\* a `released` row has been appended
    requested,  \* a release by an edit has been requested
    keep,       \* keep[p]: how far p's flagged run has got keeping the question, 4 when done; 5 if p keeps nothing
    pending,    \* pending[p]: p has cleared an entry and has yet to re-read
    up,         \* up[p]: p is running
    gone,       \* gone[p]: p is gone, as #179 judges a rank, or an `igor run` has exited
    worked,     \* some process has worked the item again
    delBy,      \* ghost: delBy[d] is the set of who has deleted files on d
    notice,     \* the stuck-release notice is open
    crashes, losses, retires

vars == <<files, record, last, hasReleased, requested, keep, pending, up, gone,
          worked, delBy, notice, crashes, losses, retires>>

Ranks == Procs \ Runs
EntryStates == {"none", "open", "cleared"}

Init ==
    /\ files = [d \in Dirs |-> {}]
    /\ record = [lost |-> FALSE, released |-> FALSE,
                 entry |-> [d \in Dirs |-> "none"],
                 keeper |-> [d \in Dirs |-> NoProc]]
    /\ last = "none"
    /\ hasReleased = FALSE
    /\ requested = FALSE
    /\ keep = [p \in Procs |-> IF p \in Keepers THEN 0 ELSE 5]
    /\ pending = [p \in Procs |-> FALSE]
    /\ up = [p \in Procs |-> TRUE]
    /\ gone = [p \in Procs |-> FALSE]
    /\ worked = FALSE
    /\ delBy = [d \in Dirs |-> {}]
    /\ notice = FALSE
    /\ crashes = 0 /\ losses = 0 /\ retires = 0

KeptAny == \E p \in Procs : keep[p] \in 1..4
\* A keep is done once its last step, the `needs a person` row, is written,
\* which is when the run's handoff posts and the item is held.
Held == \E p \in Procs : keep[p] = 4
\* Under KeepsDoneFirst a release starts only once no keep is part-way.
ReleaseMayStart == Held /\ (KeepsDoneFirst => \A p \in Procs : keep[p] \in {0, 4, 5})

(* ---------------------------- keeping ---------------------------------- *)

\* Step 1 (with EntryFirst): add or update this directory's entry, naming p.
AddEntry(p) ==
    LET d == DirOf[p] IN
    /\ up[p] /\ keep[p] = 0 /\ ~requested /\ ~hasReleased
    /\ record' = IF record.lost
                    THEN [lost |-> FALSE, released |-> FALSE,
                          entry |-> [e \in Dirs |-> IF e = d THEN "open" ELSE "none"],
                          keeper |-> [e \in Dirs |-> IF e = d THEN p ELSE NoProc]]
                    ELSE [record EXCEPT !.entry[d] = "open", !.keeper[d] = p]
    /\ keep' = [keep EXCEPT ![p] = 1]
    /\ UNCHANGED <<files, last, hasReleased, requested, pending, up, gone, worked,
                   delBy, notice, crashes, losses, retires>>

\* Step 2: move the session-log copy there. Without EntryFirst it may come first.
MoveLog(p) ==
    /\ up[p]
    /\ IF EntryFirst THEN keep[p] = 1 ELSE keep[p] \in {0, 1}
    /\ files' = [files EXCEPT ![DirOf[p]] = @ \cup {"log"}]
    /\ keep' = [keep EXCEPT ![p] = 2]
    /\ UNCHANGED <<record, last, hasReleased, requested, pending, up, gone, worked,
                   delBy, notice, crashes, losses, retires>>

\* Without EntryFirst, the entry may come after the files.
LateEntry(p) ==
    LET d == DirOf[p] IN
    /\ ~EntryFirst /\ up[p] /\ keep[p] \in {2, 3} /\ ~record.lost
    /\ record.entry[d] = "none"
    /\ record' = [record EXCEPT !.entry[d] = "open", !.keeper[d] = p]
    /\ UNCHANGED <<files, last, hasReleased, requested, keep, pending, up, gone,
                   worked, delBy, notice, crashes, losses, retires>>

\* Step 3: write the question file.
WriteQ(p) ==
    /\ up[p] /\ keep[p] = 2
    /\ files' = [files EXCEPT ![DirOf[p]] = @ \cup {"q"}]
    /\ keep' = [keep EXCEPT ![p] = 3]
    /\ UNCHANGED <<record, last, hasReleased, requested, pending, up, gone, worked,
                   delBy, notice, crashes, losses, retires>>

\* Step 4: append `needs a person`.
AppendNeeds(p) ==
    /\ up[p] /\ keep[p] = 3
    /\ last' = IF last = "none" THEN "needs" ELSE last
    /\ keep' = [keep EXCEPT ![p] = 4]
    /\ UNCHANGED <<files, record, hasReleased, requested, pending, up, gone, worked,
                   delBy, notice, crashes, losses, retires>>

(* ---------------------------- releasing -------------------------------- *)

\* A rank or an `igor run` sees an attributable edit by someone with write access.
SeeEdit(p) ==
    /\ up[p] /\ ReleaseMayStart /\ ~requested /\ ~hasReleased
    /\ requested' = TRUE
    /\ last' = "release requested"
    /\ UNCHANGED <<files, record, hasReleased, keep, pending, up, gone, worked,
                   delBy, notice, crashes, losses, retires>>

\* Who may delete on d for a requested release: any live process on d
\* (decision 120), or, without AnyOnDir, only the process the entry names.
\* Without OwnDirOnly, a live process elsewhere takes over for a gone one.
\* An `igor run` clears only at its start. The run that kept the question is
\* past its start, so it never clears; a modelled run that kept nothing
\* stands for the next `igor run` on the directory.
MayDelete(p, d) ==
    \/ (DirOf[p] = d /\ (AnyOnDir \/ record.keeper[d] = p)
        /\ (p \in Runs => keep[p] = 5))
    \/ (~OwnDirOnly /\ record.keeper[d] # NoProc /\ gone[record.keeper[d]])

KeeperDelete(p, d) ==
    /\ up[p] /\ requested /\ ~record.lost /\ record.entry[d] = "open"
    /\ MayDelete(p, d) /\ keep[p] \in {0, 4, 5}
    /\ files[d] # {}
    /\ files' = [files EXCEPT ![d] = IF "log" \in @ THEN @ \ {"log"} ELSE @ \ {"q"}]
    /\ delBy' = [delBy EXCEPT ![d] = @ \cup {p}]
    /\ UNCHANGED <<record, last, hasReleased, requested, keep, pending, up, gone,
                   worked, crashes, losses, retires, notice>>

KeeperClear(p, d) ==
    /\ up[p] /\ requested /\ ~record.lost /\ record.entry[d] = "open"
    /\ MayDelete(p, d) /\ keep[p] \in {0, 4, 5}
    /\ files[d] = {}
    /\ record' = [record EXCEPT !.entry[d] = "cleared"]
    /\ pending' = [pending EXCEPT ![p] = TRUE]
    /\ UNCHANGED <<files, last, hasReleased, requested, keep, up, gone, worked,
                   delBy, notice, crashes, losses, retires>>

AllCleared == \A d \in Dirs : record.entry[d] # "open"
SomeEntry == \E d \in Dirs : record.entry[d] # "none"

AppendReleased ==
    /\ record' = [record EXCEPT !.released = TRUE]
    /\ hasReleased' = TRUE
    /\ last' = "released"

\* The re-read after a clear.
ReRead(p) ==
    /\ up[p] /\ pending[p]
    /\ pending' = [pending EXCEPT ![p] = FALSE]
    /\ IF (~ReReadBeforeReleased \/ (~record.lost /\ AllCleared)) /\ ~hasReleased
          THEN AppendReleased
          ELSE UNCHANGED <<record, hasReleased, last>>
    /\ UNCHANGED <<files, requested, keep, up, gone, worked, delBy, notice, crashes,
                   losses, retires>>

\* Any process finds every entry cleared and no `released` row.
Recover(p) ==
    /\ RecoverReleased /\ up[p] /\ ~record.lost /\ SomeEntry /\ AllCleared
    /\ ~hasReleased /\ ~record.released
    /\ AppendReleased
    /\ UNCHANGED <<files, requested, keep, pending, up, gone, worked, delBy, notice,
                   crashes, losses, retires>>

\* `igor release` against directory d, one write at a time.
OpDelete(d) ==
    /\ ReleaseMayStart /\ ~hasReleased /\ files[d] # {}
    /\ files' = [files EXCEPT ![d] = IF "log" \in @ THEN @ \ {"log"} ELSE @ \ {"q"}]
    /\ delBy' = [delBy EXCEPT ![d] = @ \cup {Op}]
    /\ UNCHANGED <<record, last, hasReleased, requested, keep, pending, up, gone,
                   worked, crashes, losses, retires, notice>>

\* `igor release` clears its directory's entry once the files are gone; with
\* decision 121's flag it drops an entry the operator has checked, which in a
\* model whose ids are its directories is the same step.
OpClear(d) ==
    /\ ReleaseMayStart /\ ~record.lost /\ record.entry[d] = "open" /\ files[d] = {}
    /\ record' = [record EXCEPT !.entry[d] = "cleared"]
    /\ UNCHANGED <<files, last, hasReleased, requested, keep, pending, up, gone,
                   worked, delBy, notice, crashes, losses, retires>>

\* `igor release` then re-reads the record, as a process does after a clear.
OpReRead ==
    /\ ~record.lost /\ SomeEntry /\ AllCleared /\ ~hasReleased
    /\ AppendReleased
    /\ UNCHANGED <<files, requested, keep, pending, up, gone, worked, delBy, notice,
                   crashes, losses, retires>>

\* With no entry, `igor release` refuses unless the operator, having checked
\* every state directory and found nothing, passes the flag (decision 117).
OpForce ==
    /\ ReleaseMayStart /\ ~hasReleased
    /\ (record.lost \/ ~SomeEntry)
    /\ \A d \in Dirs : files[d] = {}
    /\ hasReleased' = TRUE /\ last' = "released"
    /\ record' = [record EXCEPT !.released = TRUE]
    /\ UNCHANGED <<files, requested, keep, pending, up, gone, worked, delBy, notice,
                   crashes, losses, retires>>

(* ---------------------------- working ---------------------------------- *)

\* What p reads as "not held": a record marked released, or one with no entry
\* after a `released` row, as `igor release` with decision 117's flag leaves
\* it; or, with the record lost, no question file on p's own directory and a
\* latest row that is neither `needs a person` nor `release requested`.
NotHeldFor(p) ==
    IF ~record.lost
        THEN record.released \/ (~SomeEntry /\ hasReleased)
        ELSE /\ "q" \notin files[DirOf[p]]
             /\ last \notin {"needs", "release requested"}

\* Until a keep is done, the run that keeps it still holds the item's claim,
\* so no process works it; the model checks working only from then on.
Work(p) ==
    /\ up[p] /\ Held /\ ~worked
    /\ IF WorkOnlyIfReleased THEN NotHeldFor(p) ELSE TRUE
    /\ worked' = TRUE
    /\ UNCHANGED <<files, record, last, hasReleased, requested, keep, pending, up,
                   gone, delBy, notice, crashes, losses, retires>>

(* ---------------------------- faults ----------------------------------- *)

Crash(p) ==
    /\ up[p] /\ crashes < MaxCrashes
    /\ pending' = [pending EXCEPT ![p] = FALSE]
    /\ crashes' = crashes + 1
    /\ UNCHANGED <<files, record, last, hasReleased, requested, keep, up, gone,
                   worked, delBy, notice, losses, retires>>

Retire(p) ==
    /\ up[p] /\ p \in Ranks /\ retires < MaxRetires
    /\ up' = [up EXCEPT ![p] = FALSE]
    /\ gone' = [gone EXCEPT ![p] = TRUE]
    /\ pending' = [pending EXCEPT ![p] = FALSE]
    /\ retires' = retires + 1
    /\ UNCHANGED <<files, record, last, hasReleased, requested, keep, worked,
                   delBy, notice, crashes, losses>>

\* An `igor run` exits once its one cycle is done.
Exit(p) ==
    /\ up[p] /\ p \in Runs /\ keep[p] = 4
    /\ up' = [up EXCEPT ![p] = FALSE]
    /\ gone' = [gone EXCEPT ![p] = TRUE]
    /\ pending' = [pending EXCEPT ![p] = FALSE]
    /\ UNCHANGED <<files, record, last, hasReleased, requested, keep, worked,
                   delBy, notice, crashes, losses, retires>>

LoseRecord ==
    /\ losses < MaxLosses /\ ~record.lost
    /\ record' = [lost |-> TRUE, released |-> FALSE,
                  entry |-> [d \in Dirs |-> "none"],
                  keeper |-> [d \in Dirs |-> NoProc]]
    /\ losses' = losses + 1
    /\ UNCHANGED <<files, last, hasReleased, requested, keep, pending, up, gone,
                   worked, delBy, notice, crashes, retires>>

(* ---------------------------- the notice ------------------------------- *)

\* A requested release is stuck where an open entry's directory has no live
\* process to clear it, or where it has no entry at all (decisions 111, 114,
\* 115, 117 and 120). A refused delete is the third case; the model has no
\* refusals, so it is not here.
Stuck ==
    /\ requested /\ ~hasReleased
    /\ \/ record.lost \/ ~SomeEntry
       \/ \E d \in Dirs : record.entry[d] = "open" /\ ~\E q \in Procs : up[q] /\ DirOf[q] = d

\* A notice opens at once and stops nothing (decision 122).
OpenNotice(p) ==
    /\ up[p] /\ Stuck /\ ~notice
    /\ notice' = TRUE
    /\ UNCHANGED <<files, record, last, hasReleased, requested, keep, pending, up,
                   gone, worked, delBy, crashes, losses, retires>>

\* The notice clears only when nothing is affected. Without
\* NoticeUntilUnaffected, it clears whenever a process looks, as another
\* condition clears when a *probe item*, the one item a stopped scope takes
\* after a cooldown, does not meet it.
CloseNotice(p) ==
    /\ up[p] /\ notice /\ (NoticeUntilUnaffected => ~Stuck)
    /\ notice' = FALSE
    /\ UNCHANGED <<files, record, last, hasReleased, requested, keep, pending, up,
                   gone, worked, delBy, crashes, losses, retires>>

Next ==
    \/ \E p \in Procs :
        \/ AddEntry(p) \/ MoveLog(p) \/ LateEntry(p) \/ WriteQ(p) \/ AppendNeeds(p)
        \/ SeeEdit(p) \/ ReRead(p) \/ Recover(p) \/ Work(p)
        \/ Crash(p) \/ Retire(p) \/ Exit(p) \/ OpenNotice(p) \/ CloseNotice(p)
        \/ \E d \in Dirs : KeeperDelete(p, d) \/ KeeperClear(p, d)
    \/ \E d \in Dirs : OpDelete(d) \/ OpClear(d)
    \/ OpReRead \/ OpForce
    \/ LoseRecord

\* Liveness assumes each live process keeps polling; the operator acts by
\* choice, so no fairness is assumed for `igor release`.
Fairness ==
    /\ \A p \in Procs :
        /\ WF_vars(AddEntry(p)) /\ WF_vars(MoveLog(p)) /\ WF_vars(WriteQ(p))
        /\ WF_vars(AppendNeeds(p)) /\ WF_vars(ReRead(p)) /\ WF_vars(Recover(p))
        /\ \A d \in Dirs : WF_vars(KeeperDelete(p, d)) /\ WF_vars(KeeperClear(p, d))
        /\ WF_vars(OpenNotice(p))

Spec == Init /\ [][Next]_vars /\ Fairness

(* ---------------------------- properties ------------------------------- *)

TypeOK ==
    /\ files \in [Dirs -> SUBSET {"log", "q"}]
    /\ record.entry \in [Dirs -> EntryStates]
    /\ last \in {"none", "needs", "release requested", "released"}
    /\ keep \in [Procs -> 0..5]

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage): `released` only once every entry is cleared, and an entry
\* is cleared only once its directory's files are deleted (decisions 104, 108,
\* 110, 113 and 116).
\* An item is never released while any of its files remain on any state
\* directory.
NeverReleasedWithFiles ==
    hasReleased => \A d \in Dirs : files[d] = {}

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage), "No process SHALL delete in a state directory other than
\* its own" (decisions 108, 110 and 120).
\* Nothing deletes files on a state directory other than its own.
DeletesOnOwnDirOnly ==
    \A d \in Dirs : delBy[d] \subseteq ({p \in Procs : DirOf[p] = d} \cup {Op})

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage): a held item SHALL stay held (decisions 76, 82 and 83). The
\* model has no expiry, so it shows only that nothing but `released` unholds it.
\* A held item can never become unheld except through `released`.
HeldUntilReleased ==
    worked => hasReleased

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage): where the hold record is lost, every Igor process knows a held item
\* from its file under `flagged-questions` or its latest ledger row
\* (decisions 83 and 108).
\* With the record lost and no `released` row, no live process reads the
\* item as not held, once its keep has written the question.
HoldSurvivesLostRecord ==
    (record.lost /\ ~hasReleased /\ \E k \in Procs : keep[k] = 4)
        => \A p \in Procs : up[p] => ~NotHeldFor(p)

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage), decisions 108, 115 and 120.
\* Liveness: once a release is requested and every keep is done, if each
\* open entry's directory has a live process on it at that moment, the
\* release reaches `released`. The configurations that check it lose no
\* record and place two ranks on one directory with at most one retiring,
\* so a live process stays on every directory that has an entry.
ReleaseCompletes ==
    (requested /\ (\A p \in Procs : keep[p] \in {4, 5}) /\ ~record.lost
       /\ \A d \in Dirs : record.entry[d] = "open" => \E p \in Procs : up[p] /\ DirOf[p] = d)
        ~> hasReleased

\* Requirement: `stuck-conditions`' "A notice opens at once, stops nothing,
\* and stays open while an item is affected"
\* (decisions 118 and 122).
\* The stuck-release notice never clears while the release is stuck.
NoticeHeldWhileStuck ==
    [][notice /\ ~notice' => ~Stuck]_vars

\* Requirement: the same, decisions 111 and 122.
\* A stuck release, with some process live to see it, opens the notice.
StuckIsNoticed ==
    (Stuck /\ \E p \in Procs : up[p]) ~> (notice \/ ~Stuck)

=============================================================================
