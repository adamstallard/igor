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
record that was misread but a record that is not there. It is also the first where the read has
to decide what **not** to remove: the mechanism that recovers the lost removal prints records for
paths no tree holds, and publishing one of those costs the whole run.

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

### `--no-renames` is `status.renames=false`, which issue #117 was closed against

The flag and the config are **byte-identical**. Compared as raw `-z` output over five
repositories — a chain rename, the `DU` fold above, a staged rename whose destination was then
deleted, a detected copy under `status.renames=copies`, and a rename brought in by a merge and
then moved again — every pair matched byte for byte.

So the measurement that closed #117 applies here in full and has to be answered rather than
stepped around. It is this: with detection off, a chain rename prints a record for a path that
exists in no tree.

```
git mv a.txt b.txt && mv b.txt c.txt && git add -N c.txt

default                   R  b.txt|a.txt      R c.txt|b.txt
--no-renames              D  a.txt   AD b.txt   A c.txt
-c status.renames=false   D  a.txt   AD b.txt   A c.txt
```

`AD b.txt` is a path the run's own index invented mid-chain: HEAD never had it, and neither did
the tree the artifact is published against. `GONE` matches `AD`, so a naive read publishes a
removal of it.

### What the host does with a removal the base tree does not hold

Measured against a real repository and recorded in
`openspec/changes/archive/2026-09-24-artifacts-carry-removals/design.md`:

| request | result |
| --- | --- |
| remove a path `base_tree` holds | succeeds |
| remove a path it does not hold | **422 `GitRPC::BadObjectState`** |
| the same, nested under a directory it does hold | **422 `GitRPC::BadObjectState`** |

The refusal is of the whole `POST /git/trees` call, so nothing is published — not the artifact
minus the bad entry, nothing. One invented removal costs the run everything the worker produced.
This is why the second requirement exists rather than being left implicit.

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

A detected copy goes the same way: under `status.renames=copies`, `C  copy.md` + `t.md` becomes
`A  copy.md`, with `M  t.md` beside it. Nothing pairs, so nothing is at risk of removing a copy's
source, which was one of #117's two stated costs. Measured, not reasoned.

### The removal is owed only where the index did not invent the path

`--no-renames` alone is not the mechanism. The mechanism is the flag **and** a guard on the
gone-check: a record whose index column says the index has this path and HEAD does not owes no
removal, whatever the work tree column says.

PR #114 already carries the primitive — `INDEX_NEW = /^[ARC]/` — where it suppresses a pairing
source the index invented. Here it applies one step earlier, to the gone-check itself, and as a
test on the record's own flags rather than as a set built from the whole record list. There is no
set to build: nothing pairs under `--no-renames`, so there is no second path to cross-reference.

**Every shape this changes, enumerated rather than spot-checked.** The gone-check fires on
`/^(?:.D|D )$/` after `UNMERGED` has been tested. Under `--no-renames` porcelain emits no `R` and
no `C` in either column at all, so of `INDEX_NEW`'s three letters only `A` is reachable, and of
the shapes beginning with `A` only `AD` matches `GONE` — `A ` and `AM` are additions and never
reached the gone-check. So the guard changes the reading of exactly one status shape:

| produced by | record under `--no-renames` | today | with the guard |
| --- | --- | --- | --- |
| `git mv a b && mv b c && git add -N c` | `D  a`, `AD b`, ` A c` | removes `a` **and `b`** | removes `a`, skips `b`, adds `c` |
| a merge's staged rename, moved again | `D  a`, `AD b`, ` A c` | removes `a` **and `b`** | removes `a`, skips `b`, adds `c` |
| `git mv a b && rm b` | `D  a`, `AD b` | removes `a` **and `b`** | removes `a`, skips `b` |
| `git add n && rm n` | `AD n` | removes `n` | skips `n` |
| the #116 fold | ` D b.md`, `UD c.md` | removes `b` | removes `b` — index column is a space |
| `git add -N n && rm n` | ` D n` | removes `n` | removes `n` — **see the residual below** |
| an unstaged or staged plain deletion | ` D p`, `D  q` | removes it | removes it |
| a worker deleting the conflicted path | `DU f` | `UNMERGED` first, deletion by the catch | unchanged |

Nothing legitimate is skipped, and the argument is short enough to state rather than sample:

- An index column of `A` means the index holds the path and **HEAD does not**. Porcelain's
  unmerged codes are `DD`, `AU`, `UD`, `UA`, `DU`, `AA` and `UU`; `AD` is not among them, and the
  four containing `A` are caught by `UNMERGED` before the gone-check, so `AD` never arrives from a
  merge state. An index-added path is therefore absent from HEAD by construction.
- Absent from HEAD is absent from `base_tree` **on the resolution path**, which is where the
  invented paths come from: `commitOnBranch` lays its tree over `parents[0]`, and `merge()` stops
  before committing, so the clone's HEAD is still that same commit. On the produce path the two
  can diverge — `produce` re-reads the base branch's sha at publish time, after the worker has
  run — and only one direction of that divergence is harmless. Both are below.

### The requirement says what must be true, not what to run

`changes()` is a seam with one implementation, and a requirement naming a git flag would have to
be amended by any tree provider that is not a clone. Both requirements are therefore outcomes —
no removal lost, no removal invented — and this file holds the flag and the guard.

### Rejected: abandoning `--no-renames` because #117 was closed against it

#117's closure is a measurement, and the measurement is right: detection off produces `AD` on a
chain rename, and publishing that record's removal returns 422. What it does not show is that the
mechanism is wrong, because the failing step is the gone-check reading `AD` as a removal, not the
absence of rename detection. The guard above is the piece #117 was missing; with it, both costs
#117 named are gone — the copy distinction costs nothing because nothing pairs, and the invented
removal is skipped by the same test #114 already wrote for the paired case.

Keeping detection on and taking a cross-check instead would fix the fold at the price of a second
read per `changes()` call, and would leave the ` R` pairing — two iterations and a refuter to get
right — in the code permanently.

### Rejected: cross-check `git diff-files` or `git ls-files -d`

Both recover the deletion, and both were the shape this change was expected to take. They are
rejected for the same reason: they leave the primary read incomplete and add a second one to
notice. That is more code, one more process per `changes()` call, and a rule in the code that has
to explain why two reads of the same tree disagree — against a flag that costs nothing and makes
them agree.

`ls-files -d` carries the extra defect of stage duplicates on an unmerged path.

Neither is unreasonable as defence in depth, and the requirements' wording permits adding one if a
second kind of fold is ever found. Adding it now would be guarding a failure nobody has measured,
at a cost that recurs on every run.

### Rejected: cross-check only during a conflicted merge

The saving is one process on the runs that are not resolving a conflict, and the price is a
condition that has to be evaluated correctly every time. A guard that only runs when execution
believes a conflict is in progress is a guard with a second way to be wrong, for a mechanism
whose whole point is that the code's belief about the tree was incomplete.

Moot under `--no-renames`, which is unconditional and free, and recorded because the conditional
version was the brief's own suggestion.

### Gate two: the pairing mechanism becomes deletable

Under `--no-renames` porcelain emits no `R` and no `C` record, so `PAIRED`, `RENAME`, `INDEX_NEW`
as a set-builder and `indexOnly` in `src/worktree.ts` have nothing to fire on. The `from` field
and the `++i` that consumes the second entry become unreachable.

Deleting them is gate-two work and is **conditioned on PR #114's tests staying green**, because
those tests are what pin the behaviour any replacement has to keep: a rename yields a removal of
the old path plus an addition of the new one, and a chain yields no removal of a path the index
invented. Both survive the mechanism here by a different route, so the tests should pass unchanged
against the flag and the guard. Deleting a mechanism whose behaviour is pinned by tests is the safe
version of this; deleting it blind is not, which is why the order matters and not merely the
outcome.

`INDEX_NEW` itself stays: the guard is its second and now its only caller.

## The residuals, measured and not covered

Two ways to publish a removal of a path the base tree does not hold survive the guard. Both are
what the second requirement is worded broadly enough to cover, and neither is created by this
change.

### The index column does not always say what the index knows

The guard reads the index column, and `git add -N n.txt` followed by deleting the file prints:

```
 D n.txt
```

— an index column of space, byte for byte the shape a tracked file's unstaged deletion has, for a
path HEAD does not hold (`git ls-tree HEAD -- n.txt` is empty; `git diff-index --cached
--name-status HEAD` says `A`). A removal of it is published and the tree API refuses it, exactly
as for `AD`.

Three things about it:

- **It is not this change's doing.** The output is identical with rename detection on and off, so
  the defect is there today and `--no-renames` neither creates nor worsens it.
- **`--porcelain=v2` does not settle it.** v2 carries HEAD's mode and object id per record, which
  looks like the answer, and for an intent-to-add path it reports `100644` and the empty blob's
  sha rather than zeros — it does not distinguish that path from a tracked one. Measured, because
  the opposite is the natural assumption.
- **Only a tree lookup distinguishes it**, which is the second read the mechanism above declines
  for the fold. Whether it is worth paying for here is a different question with a different
  measurement behind it, and it is `tasks.md`'s to answer rather than this change's to assume.

### The base can move under the produce path while the worker runs

`produce` takes no base sha from the caller: `GitHubCodeHost.produce` reads
`branchSha(repo, base)` when it publishes, and the clone the worker changed was made before the
worker ran. So `base_tree` is the base branch as it is at publish time, and the two can differ by
whatever landed on the base during the run.

- **Ahead by an addition is harmless**, and the guard makes it so: a path the base gained after
  the clone is not in the working tree at all, so no record can name it, so nothing is removed
  from under it.
- **Ahead by a deletion is the same 422.** If the base drops `X` during the run and the worker
  also deleted `X` — it was in the clone — status prints ` D X`, index column a space, the
  gone-check fires, and the removal goes to a `base_tree` that no longer holds `X`.

The window is the worker's run, so this is a race rather than a shape, which is why it is recorded
here rather than guarded against on a measurement nobody has taken. Nothing about the guard
changes: skipping an index-added path can only decline a removal, never invent one.

Both residuals are why the second requirement says what must be true rather than what the guard
achieves. A requirement describing only the current guard would make the next instance of the 422
a surprise rather than a known gap.

## Risks

- **A future read that forgets the flag re-opens the defect silently**, exactly as it stands
  today. The protection is a regression test that reproduces the fold, not the flag: the fold is
  cheap to construct deterministically (one similar file, one modify/delete conflict) even though
  it was found by fuzzing.
- **A future read that forgets the guard fails loudly**, which is the better failure of the two:
  the tree request returns 422 and nothing publishes. Loud, but it costs the run its work, so the
  regression test for the chain rename is owed as much as the one for the fold.
- **Rename detection may not be the only way git reports two changed paths as one.** Nothing
  found another; the requirement is worded against the class rather than against rename detection
  so that finding one is an implementation change and not a specification change.
- **`--no-renames` changes the output shape for every run, not only conflicted ones.** A staged
  rename stops arriving as one record and arrives as two. Measured to fall through the existing
  branches to the same `ChangedFile` list, but it is a change to the common path taken for the
  sake of an uncommon one, and the test suite is the thing that has to say so.
