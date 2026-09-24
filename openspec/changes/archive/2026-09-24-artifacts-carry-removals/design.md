## Context

The issue that prompted this left one question open: `produce` creates a branch while the
resolution path commits onto one that exists. Those are different API calls, and if the
creation path could not express a removal the answer would have had to be a workaround rather
than a symmetry.

## Measured, not assumed

**It can, and the call is identical.** `createBranchWithFiles` and `commitOnBranch` both build
their tree with `POST /repos/{repo}/git/trees` and a `base_tree`, and neither cares what the
entries are. The two functions diverge only at the last step: one `POST`s to `git/refs` to
create the ref, the other `PATCH`es `git/refs/heads/{branch}` to move it. That step takes a
commit sha and knows nothing about the tree.

So a removal is the same entry on both paths — `{ path, mode: '100644', type: 'blob', sha:
null }` laid over the base tree — and the fix is the parameter, not a mechanism.

Both functions already pass a *commit* sha as `base_tree` rather than a tree sha. GitHub
resolves it, and the resolution path has been shipping that way, so this change inherits the
reliance rather than introducing it.

## Decisions

**`deletions` is required on `ArtifactRequest`, not optional.** Execution is the only caller
that builds one, so requiring it costs nothing and is the whole point: an optional field is one
a future caller forgets, which is exactly the failure being fixed.

**The "only changes were deletions" branch is deleted, not left as a guard.** It is provably
unreachable: `kind` is a three-way union, the edits filter and the removals filter partition
the changes between them, a binary never enters the list at all, and an empty list already
returns `nothing-to-do` further up. A defensive stub there would claim a state that cannot
happen.

**A handoff counts removals separately from edits** — `removed 2 files` beside `changed 1
file`, rather than folding both into one count. A pure-removal run now publishes, and under a
single "changed" clause the handoff would say a draft was opened over no changes at all.
Folding them into one count would read `changed 2 files` for work that changed none of them.

**A path reported both ways at once belongs to the file on disk.** A removal staged with git
and then written back — a rename that leaves a re-export shim at the old path is the ordinary
case — reaches the publishing path as a deletion record and an addition record for the same
path. Sent as both, the tree array carries that path twice: GitHub either applies the last
entry and drops the file from the artifact, or rejects the tree outright after the worker has
been paid for. Whether it is the first or the second was not settled, because settling it needs
a write to a real repository and either outcome is wrong.

Rejected: leaving the collision to the tree builders in `src/github.ts`. They are handed two
lists and have no way to tell which of a duplicated path was meant; the caller that built both
lists is the only place that knows.

**The rule lives in one function, `carried`, beside the type it splits.** The second place it
has to hold is the handoff, which counts what the run did for a person to read. Applied only at
the publishing path, the counts disagree with the artifact and send that person looking for a
deletion that is not in the diff — which is what happened before it was shared. This scope stops
at code deciding what an artifact carries; it is not a general statement about duplicate paths
anywhere else.

## What is not settled

**The file mode on a removed entry.** Every removal is written `100644`, which is the shape
GitHub documents, but it is unverified against a `100755` file or a symlink. Where it would
bite: deleting an executable script. Sending the wrong mode is very likely inert — a removal
carries `sha: null`, so no blob is placed and there is no mode to apply — and `type: 'blob'` is
already correct for a symlink, which git stores as a blob. Neither is measured.

**Measured afterwards: a path absent from `base_tree` is refused, and this one is settled.**
Asked directly against `origin/main`'s tree, creating unreferenced tree objects and nothing
else:

| request | result |
|---|---|
| remove a path the base tree holds | succeeds |
| remove a path it does not hold | **422 `GitRPC::BadObjectState`** |
| remove such a path nested under a directory it does hold | **422 `GitRPC::BadObjectState`** |

So the whole tree `POST` fails, loudly, and nothing is published. A removal of a path the base
does not have is not tolerated and never silently ignored.

That makes the `indexOnly` guard added for #96 load-bearing rather than defensive: a chain
rename — `git mv a b && mv b c && git add -N c` — names `b` as a source, `b` is in no tree, and
without the guard the publish returns 422. It also settles #117 against `status.renames=false`,
which reports that chain as `AD b`, reaching the same refused removal by a different route.

**The approach that does not work, recorded so it is not retried.** Testing the mode cases the
same way fails for an unrelated reason: a freshly created tree that no ref points at cannot
serve as `base_tree`, and the request comes back **404**, not a verdict on the mode. Settling
`100755` and `120000` needs a commit on a real branch, which is a larger footprint than the
question has so far justified.

The same reliance is already live on the resolution path, so this change widens the exposure
rather than creating it.

**A path that becomes a directory, or the reverse.** `carried` compares whole path strings, so
a run that empties `sub/` and writes a file at `sub` sends `sub` as a blob and `sub/x.txt` as a
removal in one tree request. Judged below the bar rather than proved safe: no plausible worker
does this, and the resolution path already had the shape before removals reached the artifact
path. Recorded because the judgement is about reachability, not about the tree being correct.

**Binaries.** `changes()` skips a file it cannot read as UTF-8, so a binary is reported as
neither changed nor removed. Deleting one therefore still goes silently unpublished. That is a
limit of how changes are read rather than of how they are published, and it is untouched here.
