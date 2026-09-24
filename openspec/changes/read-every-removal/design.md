## Context

`ClonedTree.changes()` makes exactly one read of the working tree:

```
git status --porcelain -z -uall
```

Everything downstream — `statusRecords`' pairing, the `GONE` and `UNMERGED` tests, the content
read and the `ChangedFile` list the artifact is built from — is a function of that one output.
The flags on it were each bought with a defect: `-z` because a filename is bytes, `-uall`
because porcelain otherwise collapses an untracked directory to one entry and every file in a
new directory was lost.

This change is the next one in that sequence, and it is the first where what is missing is not a
record that was misread but a record that is not there.

## What the measurements said

Reproduced on git 2.54.0. Base holds `b.md` (55 shared lines plus one of its own) and `c.md`
(60 lines); one side deletes `c.md`, the other appends to it; the merge leaves `DU c.md`; the
worker then deletes `b.md`.

| Read | Output | Removal of `b.md` |
| --- | --- | --- |
| `git status --porcelain -z -uall` | `DU c.md` | **lost** |
| `git status --porcelain -z -uall --no-renames` | ` D b.md`, `DU c.md` | present |
| `git diff --name-status HEAD` | `R091 b.md c.md` | **lost**, and reported as a rename |
| `git diff-files --name-status -z` | `D b.md`, `U c.md` | present |
| `git ls-files -d -z` | `b.md` | present |

Three things the table settles, each against an assumption this change started from:

- **`git diff --name-status HEAD` is disqualified, not merely second-best.** It folds the same
  two paths, and folds them harder: it names the pair as a rename across `HEAD`, so a cross-check
  built on it would confirm the incomplete read rather than correct it.
- **The cause is rename detection, not the merge.** `--no-renames` alone recovers the deletion
  from the very same command. The conflicted merge is necessary only because a rename's
  destination must be a tracked path in the index — outside a merge the worker's new file is
  untracked and no pairing happens, which a control run confirmed (` D b.md` and `?? c.md`).
- **A second source is not needed, so the requirement must not mandate one.** The obligation is
  worded as an outcome for this reason: a requirement saying "cross-check a second source" would
  fix in specification a per-cycle process cost that the measurement shows is avoidable.

`git ls-files -d -z` also returns a path once per index stage: with both `b.md` and the
conflicted `c.md` removed it printed `b.md`, `c.md`, `c.md`. Usable, but a cross-check built on
it needs deduplication that a reader of the code would have to be told the reason for.

## Decisions

### Read with `--no-renames`

The mechanism is one more flag on the read already being made. It removes the cause instead of
repairing the symptom: with detection off, every path that differs gets its own record, so there
is no fold for anything downstream to recover from.

Nothing in the pipeline wants a rename as a rename. `changes()` turns every rename into a removal
of the old path and an addition of the new one — that is what `statusRecords`' pairing exists to
produce. Asking git to pair the two halves and then unpairing them is work done twice, and the
defect is in the half git does.

Measured on both rename shapes:

| | renames on | `--no-renames` |
| --- | --- | --- |
| `git mv a.md b.md` | `R  b.md` + `a.md` | `D  a.md`, `A  b.md` |
| `mv a.md b.md; git add -N b.md` | ` R b.md` + `a.md` | ` D a.md`, ` A b.md` |

Both fall straight through the existing branches: `D ` matches `GONE`, `A ` and ` A` reach the
content read as an addition. The second row is issue #96 — a rename git has not staged, which
`statusRecords` leaves unpaired today — and it is not a special case under `--no-renames` either.

### The requirement says what must be true, not what to run

`changes()` is a seam with one implementation, and a requirement naming a git flag would have to
be amended by any tree provider that is not a clone. More to the point, the mechanism is a live
question — see the interaction with #114 below — and pinning a flag in the specification would
force a spec change to settle an implementation one.

### Rejected: cross-check `git diff-files` or `git ls-files -d`

Both recover the deletion, and both were the shape this change was expected to take. They are
rejected for the same reason: they leave the primary read incomplete and add a second one to
notice. That is more code, one more process per `changes()` call, and a rule in the code that has
to explain why two reads of the same tree disagree — against a flag that costs nothing and makes
them agree.

`ls-files -d` carries the extra defect of stage duplicates on an unmerged path.

Neither is unreasonable as defence in depth, and the requirement's wording permits adding one if
a second kind of fold is ever found. Adding it now would be guarding a failure nobody has
measured, at a cost that recurs on every run.

### Rejected: cross-check only during a conflicted merge

The saving is one process on the runs that are not resolving a conflict, and the price is a
condition that has to be evaluated correctly every time. A guard that only runs when execution
believes a conflict is in progress is a guard with a second way to be wrong, for a mechanism
whose whole point is that the code's belief about the tree was incomplete.

Moot under `--no-renames`, which is unconditional and free, and recorded because the conditional
version was the brief's own suggestion.

### Deferred: what becomes of the rename pairing in `statusRecords`

Under `--no-renames`, porcelain emits no `R` or `C` record, so the pairing in `statusRecords` —
the `from` field and the `++i` that consumes the second entry — becomes unreachable. PR #114 is
open and exists to fix that pairing for the ` R` column.

This is noted and not decided. Deleting live code on another change's subject, from a change that
writes no code at all, would be deciding it in the wrong place and at the wrong time. Whoever
implements this has three honest options — keep the pairing as dead-but-harmless defence against
a read that forgets the flag, remove it once #114 has landed and settled, or keep detection on
and take the cross-check after all — and the measurements above are what they should decide it
on. `tasks.md` carries it as an explicit first task rather than as a surprise found mid-change.

## Risks

- **A future read that forgets the flag re-opens the defect silently**, exactly as it stands
  today. The protection is a regression test that reproduces the fold, not the flag: the fold is
  cheap to construct deterministically (one similar file, one modify/delete conflict) even though
  it was found by fuzzing.
- **Rename detection may not be the only way git reports two changed paths as one.** Nothing
  found another; the requirement is worded against the class rather than against rename detection
  so that finding one is an implementation change and not a specification change.
- **`--no-renames` changes the output shape for every run, not only conflicted ones.** A staged
  rename stops arriving as one record and arrives as two. Measured to fall through the existing
  branches to the same `ChangedFile` list, but it is a change to the common path taken for the
  sake of an uncommon one, and the test suite is the thing that has to say so.
