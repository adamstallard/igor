# Design

The requirement *A path execution cannot read is never silently omitted* makes execution publish
nothing, and hand the item off naming the path, when a path the worker added or modified cannot
be read. This file settles the choices that had more than one defensible answer.

## Decisions

### Refusing, rather than publishing without the path

When a destination cannot be read, the change list could drop the rename's removal too, and
publish the rest of the worker's output with the file left where it was. That is rejected: the
in-force removals requirement names **silent incompleteness** as the harm (*"An artifact that
carries the edits and drops the removals is worse than one that is not published at all: it looks
complete to a reviewer and is not"*), and dropping both halves is silently incomplete in exactly
that way. Dropping both halves would trade a deletion that looks deliberate for a change that is missing,
and a reviewer could notice neither.

Two weaker alternatives are rejected too:

- **Emit the removal and record a warning.** It still publishes a deletion of a file the worker
  meant to keep, and a warning written only to the run's record goes unseen:
  [#79](https://github.com/adamstallard/igor/issues/79) reports exactly that.
- **Refuse only where the unreadable path is a rename destination.** Since
  [#118](https://github.com/adamstallard/igor/pull/118) the parser does not know which paths are
  halves of one rename, so this cannot be decided.

### Stated over paths, not over renames

A rule over renames, *a rename reaches the artifact whole or not at all*, assumes the parser pairs
a rename's two records. #118 removed the pairing: `changes()` passes `--no-renames`, so porcelain
emits no `R` or `C` record, and a rename is an unrelated `D` and `A`. A rule over paths holds
without the pairing.

The widening is accepted: an addition or modification that cannot be read refuses too, where
today the bare `continue` skips it. That is the same failure with one path instead of two, and
carving it out would need to know which paths belong together.

### The requirement overrides what the rename and removal rules would publish

*A rename leaves no duplicate*, *A rename is carried however git reports it* and *A publish is not
lost to a removal nobody asked for* each say what a run publishes, with no condition on the
destination being readable. The requirement says it holds whatever those rules would publish, so
an unreadable destination refuses the run rather than publishing the rename's other half. Each of
those rules still governs every run whose changed paths can all be read.

### A removal is outside the rule

Every removed path is a changed path the working tree cannot read, and the in-force removals
requirements already decide what happens to it. One of them covers an unmerged `DU` path: the
artifact's own branch deleted the file, the base modified it, and the worker deletes it to keep
the deletion. *A removal the worker did ask for is not published where the base lacks the path*
publishes no removal for it and still publishes the rest. So this rule covers only paths the
working tree still holds.

The unmerged branch of the catch in `changes()` (`src/worktree.ts:560-563`) emits a deletion for
any unmerged path whose read throws, whether or not the path is gone. That branch is changed to tell
the two apart (task 2.3): a path gone from disk is the worker's removal, and a path still present but unreadable,
such as a `UU` path the worker resolved and left unreadable, falls under this requirement.

### Where the refusal sits

`changes()` keeps an entry for an unreadable path, marked as unreadable, and the publishing step
in `src/execute.ts` refuses on it, as it refuses a name that is not text (*A change is not
published under a name that is not text*). A throw inside `changes()` would be wrong: a run killed
for a limit reads the tree with `tree.changes().catch(() => [])` (`src/execute.ts:1662`), so one
unreadable path would make that run record that it changed nothing.

### A lost claim

Where the claim was lost during the run, the loss rules decide what is published: a draft of what
exists, no reviewers, and a message naming what exists, with nothing else done to an item another
party now holds. A handoff would act on that item. So the loss rules govern, and the loss message
names the unreadable path, which keeps the omission visible.

### Naming the path

The path is chosen by the worker, and an item's text can steer the worker, so the handoff names it
in a form markup in it cannot alter, such as a code span whose fence is longer than any run of
backticks in the path.

## Not settled here: why the destination is unreadable

A dangling symlink is the cause reachable on `main`, because `readFile` follows the link.
[#137](https://github.com/adamstallard/igor/pull/137) and
[#175](https://github.com/adamstallard/igor/pull/175) each read the link itself and publish it as
mode `120000`, so after either lands a dangling symlink no longer reaches this requirement. A file
without read permission does, so the tests use one.

The requirement says "cannot be read" and names no errno: enumerating causes would tie it to a
filesystem rather than state what must be true of the artifact.

## Open Questions

- **The unmerged branch, shared with #125.** [#125](https://github.com/adamstallard/igor/pull/125)
  rewrites the same catch branch: its task 5.2 tells *gone from disk* from *present but
  unreadable*, as task 2.3 here does, and it publishes no entry for a path the worker did not
  touch that is not a regular file, such as an unmerged submodule's gitlink. Whichever builds
  second builds on the other's branch. #125 treats an unmerged gitlink as a path the worker did
  not touch; this requirement refuses a path the worker modified. Which an unmerged gitlink is
  must be settled by #125's authors and this change's together (task 4.3); until then this
  requirement refuses an unmerged gitlink it cannot read.
- **Gate one, shared with #150.** [#150](https://github.com/adamstallard/igor/pull/150) modifies
  the removals requirement so that gate one carries only changes under `openspec/changes/**` and
  names the rest, and drops the sentence quoted under *Refusing* above. *Refusing* stands without
  that sentence, since the failure it rejects is still silent incompleteness. Whether an unreadable path
  outside `openspec/changes/` should refuse a gate-one run, when gate one would not carry it, is
  for #150's authors and this change's to settle; until then this requirement refuses it.
