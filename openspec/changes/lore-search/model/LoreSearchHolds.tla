--------------------------- MODULE LoreSearchHolds ---------------------------
(***************************************************************************)
(* The holds on one flagged item and their release, as the OpenSpec      *)
(* change `lore-search` specifies them in `work-triage`'s "An item handed *)
(* back is not re-worked until something answers" and `graceful-handoff`'s*)
(* "A handoff states what was done, what remains, and who could continue".*)
(*                                                                         *)
(* Processes are the ranks of one role and `igor run`s. Each has a state  *)
(* directory, named by its opaque state-directory id (decision 116);      *)
(* several processes may share one, and a copied directory, as from a     *)
(* volume snapshot, has the same id as its original. Each flagged run     *)
(* that stops on a question and keeps it, a *keep*, starts a hold of its *)
(* own (decision 128), unlike a run that settles the question itself:    *)
(* it adds its hold's entry to the hold record, naming its directory's id *)
(* and its question file's random name; moves a session-log copy and      *)
(* writes the question file in its state directory; and appends the      *)
(* `needs a person` row,                                                  *)
(* which names the same id. Each is a separate write.                     *)
(*                                                                         *)
(* A release by an attributable edit by someone with write access        *)
(* appends `release requested`, which covers the                          *)
(* holds whose `needs a person` rows came before it. A live process whose *)
(* directory has a covered hold's id may then delete that hold's          *)
(* log copy and then its question file, decision 102's order, but only    *)
(* once the hold's `needs a person` row exists or the run that keeps it   *)
(* is gone (decision 125), which matters for `igor release` and for a     *)
(* gone run, since a request covers only holds that have their row. It clears the entry only by deleting the named *)
(* question file itself (decision 132), then re-reads the record and      *)
(* appends `released` for that hold. Any process that finds an entry     *)
(* cleared and no `released` row for its hold appends it, which covers a  *)
(* crash between the clear and the row. `igor release` acts the same way  *)
(* against its own directory, with or without a request, and with        *)
(* decision 121's flag clears an entry whose named file the operator has  *)
(* found on no directory.                                                  *)
(*                                                                         *)
(* Every write is its own step, so any interleaving, and a crash between  *)
(* any two writes, is a state the model reaches. A crash loses only what  *)
(* a process holds in memory, and it restarts at once. A crashed keep     *)
(* resumes. A rank that retires part-way leaves its keep unfinished, and  *)
(* that keep then holds the item no longer, a question left open for     *)
(* Adam, the repository's owner. A rank retires and is then gone by       *)
(* #179's heartbeat rule, which waits three poll intervals and, with      *)
(* decision 131, names the process's state directory, so its              *)
(* directory-mates know the directory is still answered for; the model    *)
(* folds that wait into one step. An `igor run` exits and is              *)
(* gone. The hold record may be lost, and any process rebuilds it from    *)
(* the ledger's `needs a person` rows (decision 126). The ledger itself   *)
(* is not lost: it is what every process reads holds from.                *)
(*                                                                         *)
(* Each rule the model found the change needs is a TRUE/FALSE constant,  *)
(* TRUE in the change as specified; the configurations under negative/    *)
(* turn one off and find a violation, and those under findings/ record   *)
(* violations the rules do not prevent, for the repository's owner to    *)
(* decide on. Here a rule is one of those constants. Two                  *)
(* constants are assumptions, not rules: CopyBeforeFiles, that a copied   *)
(* directory holds no question file, and DeletedSurvivesCrash, that a     *)
(* process still knows after a crash which named files it deleted. The    *)
(* findings show what each costs. A rank that retires, or an `igor run`  *)
(* that exits, between deleting a named file and clearing its entry       *)
(* forgets what it deleted just as a crash does.                          *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Procs,          \* the processes: ranks and `igor run`s
    Runs,           \* the subset of Procs that are `igor run`s
    Layout,         \* which processes share a state directory: see DirOf
    Keepers,        \* the processes whose flagged run keeps a hold
    MaxCrashes,     \* how many times processes may crash, in all
    MaxLosses,      \* how many times the hold record may be lost
    MaxRetires,     \* how many ranks may retire
    MaxCopies,      \* how many times "d1" may be copied to "d1copy"
    CopyBeforeFiles, \* a copy is taken only while d1 holds no question file
    EntryFirst,     \* a keep adds its entry before writing any file (decision 127); since decisions 125 and 126, no configuration shows it is needed
    ClearAfterNeeds,\* an entry is cleared only once its `needs a person` row exists or its run is gone (decision 125)
    ClearByDeleting,\* an entry is cleared only by deleting its named file (decision 132)
    RebuildFromLedger, \* a lost record is rebuilt from the `needs a person` rows (decision 126)
    ReReadBeforeReleased, \* `released` is appended only after re-reading the entry
    RecoverReleased, \* any process appends a missed `released`
    OwnDirOnly,     \* no process deletes in another's directory
    AnyOnDir,       \* any live process on a directory acts for its holds, not only the one that kept them
    WorkOnlyIfReleased, \* a process works the item only when no hold is open
    DeletedSurvivesCrash, \* assumption, not a rule: that a named file was deleted is kept on the directory, past a crash or a retirement
    OperatorActs    \* the operator may run `igor release`; the liveness configurations leave it out

\* Processes are "r1", "r2", "rc" and "run"; directories are "d1", "d2" and
\* "d1copy", a copy of "d1" that keeps d1's id. "rc" is the rank whose
\* directory is the copy. "own": the ranks r1 and r2 have directories of their
\* own and the `igor run` shares r1's. "shared": r1 and r2 share "d1" and the
\* `igor run` has "d2".
Dirs == {"d1", "d2", "d1copy"}
IdOf(d) == IF d = "d1copy" THEN "d1" ELSE d
DirOf(p) ==
    CASE p = "rc" -> "d1copy"
      [] p = "r1" -> "d1"
      [] p = "r2" -> IF Layout = "own" THEN "d2" ELSE "d1"
      [] p = "run" -> IF Layout = "own" THEN "d1" ELSE "d2"

ASSUME /\ Layout \in {"own", "shared"}
       /\ Procs \subseteq {"r1", "r2", "rc", "run"} /\ Runs \subseteq Procs
       /\ Keepers \subseteq Procs \ {"rc"}

Holds == Keepers                  \* a hold is named by the run that keeps it
Home(h) == DirOf(h)               \* where that run keeps its files
Kinds == {"log", "q"}
Op == "operator"

VARIABLES
    present,    \* the item's files, as <<hold, kind, directory>> triples
    lost,       \* the hold record is lost and not yet rebuilt
    entry,      \* entry[h]: "none", "open" or "cleared"
    needs,      \* needs[h]: hold h's `needs a person` row, naming its id, exists
    released,   \* released[h]: a `released` row for hold h exists
    requested,  \* the holds a release by an edit covers: those whose `needs a person` row came before its `release requested` row
    keep,       \* keep[p]: how far p's keep has got, 4 when done; 5 if p keeps nothing
    mayClear,   \* mayClear[p]: holds whose named file p has itself just deleted
    pending,    \* pending[p]: holds whose entry p has cleared and not yet re-read
    up, gone,   \* up[p]: p is running; gone[p]: p is gone, as #179 judges it
    worked,     \* some process has worked the item again
    delBy,      \* ghost: delBy[d] is who has deleted files on directory d
    clearedBy,  \* ghost: clearedBy[h] is how hold h's entry was cleared
    opMay,      \* <<hold, directory>>: named files `igor release` has just deleted
    crashes, losses, retires, copies

vars == <<present, lost, entry, needs, released, requested, keep, mayClear,
          pending, up, gone, worked, delBy, clearedBy, opMay, crashes, losses,
          retires, copies>>

Ranks == Procs \ Runs

Init ==
    /\ present = {}
    /\ lost = FALSE
    /\ entry = [h \in Holds |-> "none"]
    /\ needs = [h \in Holds |-> FALSE]
    /\ released = [h \in Holds |-> FALSE]
    /\ requested = {}
    /\ keep = [p \in Procs |-> IF p \in Keepers THEN 0 ELSE 5]
    /\ mayClear = [p \in Procs |-> {}]
    /\ pending = [p \in Procs |-> {}]
    /\ up = [p \in Procs |-> TRUE]
    /\ gone = [p \in Procs |-> FALSE]
    /\ worked = FALSE
    /\ delBy = [d \in Dirs |-> {}]
    /\ clearedBy = [h \in Holds |-> "none"]
    /\ opMay = {}
    /\ crashes = 0 /\ losses = 0 /\ retires = 0 /\ copies = 0

\* A hold is open while it has its `needs a person` row and no `released`
\* row, which every process reads from the ledger. NotHeld, below, adds the
\* claim a live run holds on the item while it is part-way through keeping.
OpenHold == \E h \in Holds : needs[h] /\ ~released[h]
AnyHold == \E h \in Holds : needs[h]

(* ---------------------------- keeping ---------------------------------- *)

\* A run that keeps a hold was working the item, so `worked` starts over: it
\* records whether the item was worked since the latest keep began.
AddEntry(p) ==
    /\ up[p] /\ keep[p] = 0
    /\ entry' = [entry EXCEPT ![p] = "open"]
    /\ keep' = [keep EXCEPT ![p] = 1]
    /\ worked' = FALSE
    /\ UNCHANGED <<present, lost, needs, released, requested, mayClear, pending,
                   up, gone, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

MoveLog(p) ==
    /\ up[p] /\ IF EntryFirst THEN keep[p] = 1 ELSE keep[p] \in {0, 1}
    /\ present' = present \cup {<<p, "log", Home(p)>>}
    /\ keep' = [keep EXCEPT ![p] = 2]
    /\ worked' = IF keep[p] = 0 THEN FALSE ELSE worked
    /\ UNCHANGED <<lost, entry, needs, released, requested, mayClear, pending, up,
                   gone, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

\* Without EntryFirst, the entry may come after the files.
LateEntry(p) ==
    /\ ~EntryFirst /\ up[p] /\ keep[p] \in {2, 3} /\ entry[p] = "none"
    /\ entry' = [entry EXCEPT ![p] = "open"]
    /\ UNCHANGED <<present, lost, needs, released, requested, keep, mayClear,
                   pending, up, gone, worked, delBy, clearedBy, opMay, crashes, losses,
                   retires, copies>>

WriteQ(p) ==
    /\ up[p] /\ keep[p] = 2
    /\ present' = present \cup {<<p, "q", Home(p)>>}
    /\ keep' = [keep EXCEPT ![p] = 3]
    /\ UNCHANGED <<lost, entry, needs, released, requested, mayClear, pending, up,
                   gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

\* The `needs a person` row, naming the directory's id and the question
\* file's name: the hold begins. With EntryFirst, a run whose entry a lost
\* and rebuilt record dropped adds it again first; the model takes the two
\* writes as one step (decision 126; a detail the agent that wrote the
\* change fitted, for Adam to check).
AppendNeeds(p) ==
    /\ up[p] /\ keep[p] = 3 /\ (EntryFirst \/ entry[p] = "open") /\ ~lost
    /\ needs' = [needs EXCEPT ![p] = TRUE]
    /\ entry' = IF EntryFirst /\ entry[p] = "none" THEN [entry EXCEPT ![p] = "open"] ELSE entry
    /\ keep' = [keep EXCEPT ![p] = 4]
    /\ UNCHANGED <<present, lost, released, requested, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

(* ---------------------------- releasing -------------------------------- *)

\* A rank or an `igor run` sees an attributable edit by someone with write
\* access; its `release requested` row covers the holds whose `needs a person`
\* rows came before it (a fitted detail, for Adam to check). A later hold
\* needs a later edit.
SeeEdit(p) ==
    /\ up[p] /\ \E h \in Holds : needs[h] /\ h \notin requested
    /\ requested' = requested \cup {h \in Holds : needs[h]}
    /\ UNCHANGED <<present, lost, entry, needs, released, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

\* May x act for hold h on its own directory? Its directory must have h's id;
\* with AnyOnDir any live process there may, without it only the run that
\* kept h. An `igor run` acts only at its start, before it keeps anything,
\* so only a run that keeps nothing here, standing for the next `igor run` on
\* the directory, acts.
\* With ClearAfterNeeds, only once h's `needs a person` row exists or its run
\* is gone. Without OwnDirOnly, x also acts on h's home directory when the
\* run that kept h is gone.
ActsFor(x, h) ==
    /\ up[x] /\ h \in requested /\ ~lost /\ entry[h] = "open" /\ ~released[h]
    /\ keep[x] \in {0, 4, 5}
    /\ (x \in Runs => keep[x] = 5)
    /\ (ClearAfterNeeds => (needs[h] \/ gone[h]))
    /\ IF IdOf(DirOf(x)) = IdOf(Home(h))
          THEN AnyOnDir \/ x = h
          ELSE ~OwnDirOnly /\ gone[h]
Where(x, h) == IF IdOf(DirOf(x)) = IdOf(Home(h)) THEN DirOf(x) ELSE Home(h)

DeleteLog(x, h) ==
    LET d == Where(x, h) IN
    /\ ActsFor(x, h) /\ <<h, "log", d>> \in present
    /\ present' = present \ {<<h, "log", d>>}
    /\ delBy' = [delBy EXCEPT ![d] = @ \cup {x}]
    /\ UNCHANGED <<lost, entry, needs, released, requested, keep, mayClear,
                   pending, up, gone, worked, clearedBy, opMay, crashes, losses, retires, copies>>

DeleteQ(x, h) ==
    LET d == Where(x, h) IN
    /\ ActsFor(x, h) /\ <<h, "log", d>> \notin present /\ <<h, "q", d>> \in present
    /\ present' = present \ {<<h, "q", d>>}
    /\ mayClear' = [mayClear EXCEPT ![x] = @ \cup {h}]
    /\ delBy' = [delBy EXCEPT ![d] = @ \cup {x}]
    /\ UNCHANGED <<lost, entry, needs, released, requested, keep, pending, up,
                   gone, worked, clearedBy, opMay, crashes, losses, retires, copies>>

\* What x knows was deleted: its own memory, or, under DeletedSurvivesCrash,
\* what any process on its directory recorded there.
Deleted(x) ==
    IF DeletedSurvivesCrash
        THEN UNION {mayClear[y] : y \in {z \in Procs : DirOf(z) = DirOf(x)}}
        ELSE mayClear[x]

\* With ClearByDeleting, x clears h's entry only after the named file was
\* deleted as Deleted says; without it, finding no file is enough.
Clear(x, h) ==
    LET d == Where(x, h) IN
    /\ ActsFor(x, h) /\ <<h, "log", d>> \notin present
    /\ IF ClearByDeleting THEN h \in Deleted(x) ELSE <<h, "q", d>> \notin present
    /\ entry' = [entry EXCEPT ![h] = "cleared"]
    /\ mayClear' = [y \in Procs |-> mayClear[y] \ {h}]
    /\ pending' = [pending EXCEPT ![x] = @ \cup {h}]
    /\ clearedBy' = [clearedBy EXCEPT ![h] = d]
    /\ UNCHANGED <<present, lost, needs, released, requested, keep, up, gone,
                   worked, delBy, crashes, losses, retires, copies, opMay>>

ReRead(x, h) ==
    /\ up[x] /\ h \in pending[x]
    /\ pending' = [pending EXCEPT ![x] = @ \ {h}]
    /\ IF (~ReReadBeforeReleased \/ entry[h] = "cleared") /\ ~released[h]
          THEN released' = [released EXCEPT ![h] = TRUE]
          ELSE UNCHANGED released
    /\ UNCHANGED <<present, lost, entry, needs, requested, keep, mayClear, up,
                   gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

\* Without ReReadBeforeReleased, `released` may come without a clear.
EarlyReleased(x, h) ==
    /\ ~ReReadBeforeReleased /\ up[x] /\ ActsFor(x, h)
    /\ released' = [released EXCEPT ![h] = TRUE]
    /\ UNCHANGED <<present, lost, entry, needs, requested, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

Recover(x, h) ==
    /\ RecoverReleased /\ up[x] /\ ~lost /\ entry[h] = "cleared" /\ ~released[h]
    /\ released' = [released EXCEPT ![h] = TRUE]
    /\ UNCHANGED <<present, lost, entry, needs, requested, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

\* `igor release`, run against directory d, deletes a hold's files there.
OpDelete(h, d) ==
    /\ OperatorActs /\ ~lost /\ entry[h] = "open" /\ ~released[h]
    /\ IdOf(d) = IdOf(Home(h))
    /\ (ClearAfterNeeds => (needs[h] \/ gone[h]))
    /\ \E k \in Kinds : /\ <<h, k, d>> \in present
                       /\ (k = "q" => <<h, "log", d>> \notin present)
                       /\ present' = present \ {<<h, k, d>>}
                       /\ opMay' = IF k = "q" THEN opMay \cup {<<h, d>>} ELSE opMay
    /\ delBy' = [delBy EXCEPT ![d] = @ \cup {Op}]
    /\ UNCHANGED <<lost, entry, needs, released, requested, keep, mayClear,
                   pending, up, gone, worked, clearedBy, crashes, losses, retires, copies>>

\* `igor release` clears the entry once it has itself deleted the named file
\* on a directory with the hold's id.
OpClear(h) ==
    /\ OperatorActs /\ ~lost /\ entry[h] = "open"
    /\ \E d \in Dirs :
        /\ <<h, d>> \in opMay
        /\ opMay' = {m \in opMay : m[1] # h}
        /\ clearedBy' = [clearedBy EXCEPT ![h] = d]
    /\ entry' = [entry EXCEPT ![h] = "cleared"]
    /\ UNCHANGED <<present, lost, needs, released, requested, keep, mayClear,
                   pending, up, gone, worked, delBy, crashes, losses, retires, copies>>

\* With decision 121's flag, the operator clears an entry whose named file
\* they have found on no directory with its id; then `igor release` re-reads.
OpDrop(h) ==
    /\ OperatorActs /\ ~lost /\ entry[h] = "open" /\ ~released[h]
    /\ (ClearAfterNeeds => (needs[h] \/ gone[h]))
    /\ \A d \in Dirs : \A k \in Kinds : <<h, k, d>> \notin present
    /\ entry' = [entry EXCEPT ![h] = "cleared"]
    /\ clearedBy' = [clearedBy EXCEPT ![h] = "flag"]
    /\ UNCHANGED <<present, lost, needs, released, requested, keep, mayClear,
                   pending, up, gone, worked, delBy, crashes, losses, retires, copies, opMay>>

OpReRead(h) ==
    /\ OperatorActs /\ ~lost /\ entry[h] = "cleared" /\ ~released[h]
    /\ released' = [released EXCEPT ![h] = TRUE]
    /\ UNCHANGED <<present, lost, entry, needs, requested, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

(* ---------------------------- rebuilding -------------------------------- *)

LoseRecord ==
    /\ losses < MaxLosses /\ ~lost
    /\ lost' = TRUE
    /\ entry' = [h \in Holds |-> "none"]
    /\ losses' = losses + 1
    /\ UNCHANGED <<present, needs, released, requested, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, retires, copies>>

\* Rebuild the record from the ledger: an open entry for each hold whose
\* `needs a person` row exists without a `released` row (decision 126),
\* keeping any entry a keep wrote after the loss. Without RebuildFromLedger,
\* the rebuilt record holds only those later entries.
Rebuild(x) ==
    /\ up[x] /\ lost
    /\ lost' = FALSE
    /\ entry' = [h \in Holds |->
                   IF entry[h] # "none" THEN entry[h]
                   ELSE IF RebuildFromLedger /\ needs[h] /\ ~released[h] THEN "open"
                   ELSE "none"]
    /\ UNCHANGED <<present, needs, released, requested, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

(* ---------------------------- working ---------------------------------- *)

\* Read from the ledger, so a lost record changes nothing: no open hold, and
\* no live run part-way, since that run holds the item's claim. A gone run's
\* part-way keep holds nothing (the proposal's Still open).
NotHeld == ~OpenHold /\ ~(\E p \in Procs : up[p] /\ keep[p] \in 1..3)

Work(p) ==
    /\ up[p] /\ AnyHold /\ ~worked
    /\ IF WorkOnlyIfReleased THEN NotHeld ELSE TRUE
    /\ worked' = TRUE
    /\ UNCHANGED <<present, lost, entry, needs, released, requested, keep, mayClear,
                   pending, up, gone, delBy, clearedBy, opMay, crashes, losses, retires, copies>>

(* ---------------------------- faults ----------------------------------- *)

\* A crash loses which named files p has just deleted, unless
\* DeletedSurvivesCrash keeps that on the directory; findings/CrashBeforeClear.cfg
\* shows what losing it costs.
Crash(p) ==
    /\ up[p] /\ crashes < MaxCrashes
    /\ mayClear' = IF DeletedSurvivesCrash THEN mayClear ELSE [mayClear EXCEPT ![p] = {}]
    /\ pending' = [pending EXCEPT ![p] = {}]
    /\ crashes' = crashes + 1
    /\ UNCHANGED <<present, lost, entry, needs, released, requested, keep, up, gone,
                   worked, delBy, clearedBy, opMay, losses, retires, copies>>

Retire(p) ==
    /\ up[p] /\ p \in Ranks /\ retires < MaxRetires
    /\ up' = [up EXCEPT ![p] = FALSE]
    /\ gone' = [gone EXCEPT ![p] = TRUE]
    /\ mayClear' = IF DeletedSurvivesCrash THEN mayClear ELSE [mayClear EXCEPT ![p] = {}]
    /\ pending' = [pending EXCEPT ![p] = {}]
    /\ retires' = retires + 1
    /\ UNCHANGED <<present, lost, entry, needs, released, requested, keep, worked,
                   delBy, clearedBy, opMay, crashes, losses, copies>>

Exit(p) ==
    /\ up[p] /\ p \in Runs /\ keep[p] \in {4, 5}
    /\ up' = [up EXCEPT ![p] = FALSE]
    /\ gone' = [gone EXCEPT ![p] = TRUE]
    /\ mayClear' = IF DeletedSurvivesCrash THEN mayClear ELSE [mayClear EXCEPT ![p] = {}]
    /\ pending' = [pending EXCEPT ![p] = {}]
    /\ UNCHANGED <<present, lost, entry, needs, released, requested, keep, worked,
                   delBy, clearedBy, opMay, crashes, losses, retires, copies>>

\* A copy of "d1" as it stands, files included, to "d1copy". With
\* CopyBeforeFiles it is taken only while d1 holds no question file.
CopyDir ==
    /\ copies < MaxCopies
    /\ CopyBeforeFiles => \A h \in Holds : <<h, "q", "d1">> \notin present
    /\ present' = {f \in present : f[3] # "d1copy"}
                    \cup {<<f[1], f[2], "d1copy">> : f \in {g \in present : g[3] = "d1"}}
    /\ copies' = copies + 1
    /\ UNCHANGED <<lost, entry, needs, released, requested, keep, mayClear, pending,
                   up, gone, worked, delBy, clearedBy, opMay, crashes, losses, retires>>

Next ==
    \/ \E p \in Procs :
        \/ AddEntry(p) \/ MoveLog(p) \/ LateEntry(p) \/ WriteQ(p) \/ AppendNeeds(p)
        \/ SeeEdit(p) \/ Rebuild(p) \/ Work(p) \/ Crash(p) \/ Retire(p) \/ Exit(p)
        \/ \E h \in Holds :
            \/ DeleteLog(p, h) \/ DeleteQ(p, h) \/ Clear(p, h) \/ ReRead(p, h)
            \/ EarlyReleased(p, h) \/ Recover(p, h)
    \/ \E h \in Holds : OpDrop(h) \/ OpClear(h) \/ OpReRead(h) \/ \E d \in Dirs : OpDelete(h, d)
    \/ LoseRecord \/ CopyDir

\* Liveness assumes each live process keeps polling; the operator acts by
\* choice, so no fairness is assumed for `igor release`.
Fairness ==
    \A p \in Procs :
        /\ WF_vars(AddEntry(p)) /\ WF_vars(MoveLog(p)) /\ WF_vars(WriteQ(p))
        /\ WF_vars(AppendNeeds(p)) /\ WF_vars(Rebuild(p))
        /\ \A h \in Holds :
            /\ WF_vars(DeleteLog(p, h)) /\ WF_vars(DeleteQ(p, h)) /\ WF_vars(Clear(p, h))
            /\ WF_vars(ReRead(p, h)) /\ WF_vars(Recover(p, h))

Spec == Init /\ [][Next]_vars /\ Fairness

(* ---------------------------- properties ------------------------------- *)

TypeOK ==
    /\ present \subseteq (Holds \X Kinds \X Dirs)
    /\ entry \in [Holds -> {"none", "open", "cleared"}]
    /\ keep \in [Procs -> 0..5]

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage), decisions 104, 108, 125, 127, 128 and 132.
\* A hold is never released while its files remain on its own state
\* directory. A copy's own files are outside this invariant; a release made
\* on a copy while the original's files remain breaks it, as
\* findings/CopiedQuestion.cfg shows.
NeverReleasedWithFiles ==
    \A h \in Holds : released[h] => \A k \in Kinds : <<h, k, Home(h)>> \notin present

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage): "No process and no `igor release` SHALL delete in a state
\* directory other than its own" (decisions 108, 110 and 120). `igor release`
\* deletes only on the directory it is run against, which in the model is the
\* directory each of its deletes names, so it may stand on any of them.
DeletesOnOwnDirOnly ==
    \A d \in Dirs : delBy[d] \subseteq ({p \in Procs : DirOf(p) = d} \cup {Op})

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage): a held item SHALL stay held (decisions 76, 82, 83 and 128).
\* The model has no expiry, so it shows that nothing but every open hold's
\* `released` row unholds the item, a lost record included.
HeldUntilReleased ==
    worked => ~OpenHold

\* Requirement: the same, decision 132: no process clears an entry by finding
\* its named file absent; an entry is cleared by a process that deleted the
\* file on the hold's own directory, or by the operator's flag.
ClearedOnlyByDeleting ==
    \A h \in Holds : clearedBy[h] \in {"none", "flag", Home(h)}

\* Requirement: "An item handed back is not re-worked until something answers"
\* (work-triage), decisions 108, 115, 120 and 125.
\* Liveness: once a release is requested and every keep is done, if the
\* record is not lost and each requested hold's home directory has a live
\* process at that moment, every hold the request covers is released. The
\* formula asks for that process only at that moment; the configurations
\* keep one there, with at most one rank retiring from a shared directory. The configurations that check it lose
\* no record and copy no directory; a crash between deleting a named file
\* and clearing its entry is in findings/CrashBeforeClear.cfg.
ReleaseCompletes ==
    (requested # {} /\ (\A p \in Procs : keep[p] \in {4, 5}) /\ ~lost
       /\ \A h \in requested : ~released[h] =>
              \E p \in Procs : up[p] /\ DirOf(p) = Home(h))
        ~> \A h \in requested : released[h]

=============================================================================
