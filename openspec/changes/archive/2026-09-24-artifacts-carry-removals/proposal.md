## Why

An Igor cannot remove a file from a code change. Not a rename, not a refactor that drops a
module, not a test that is no longer needed. The limit is real, and no requirement in force
says it exists.

Three shapes, all from one filter in the publishing path:

- **Any deletion in a mixed change.** The edits publish, the deletions are dropped, a refusal
  per path goes into the execution record — and the files survive in the pull request. A
  reviewer sees a change that looks complete and is not.
- **A change that is only deletions.** Refused outright: *"the only changes were deletions,
  which cannot be published yet"*. The worker ran and was paid for; nothing is published.
- **A rename.** The new file is added and the old one stays, so the file exists twice.

The cost is not that an Igor cannot do the work. It is that it discovers this **after the
worker has run**, so every deletion-shaped task burns a full run. The `generalist` role
maintains a TypeScript codebase where removing a module, dropping an obsolete test and renaming
a file are ordinary maintenance.

Nothing in `task-execution` says what an artifact carries, so this adds text rather than
correcting it. The limit surfaces only as a `not supported yet` string in one branch and a
refusal in a ledger — an operator watching pull requests would conclude the Igor is bad at
refactoring rather than that it is structurally unable to delete.

`keep-artifacts-mergeable` makes the asymmetry concrete and supplies the precedent. It gives a
resolution a list of removed paths and writes them as tree entries with no blob behind them, so
once it lands an Igor can delete a file while resolving a conflict but not while doing the work
in the first place.

## What Changes

**An artifact carries every change the worker made, including removals.** The two publishing
paths — a new branch and a commit onto an existing one — build their trees from the same call,
so a removal rides either one as an entry with a null sha.

**The refusal goes away rather than being made honest.** There is no path left on which a
deletion is dropped, so there is nothing left to refuse and nothing to document as a limit.

Explicitly out of scope:

- **The file mode on a removed path.** A removal is written `100644` whatever the file was.
  This is GitHub's documented shape but is unverified against a `100755` file, a symlink, or a
  path absent from the base tree, and settling it needs a write to a real repository.
- **Binaries.** A binary file is still not reported as changed at all, which is a separate
  limit in the same area and not this change's question.

## Capabilities

### Modified Capabilities

- `task-execution`: gains a requirement that the artifact carries every change the worker made,
  removals included, whether the artifact is opened or brought up to date.

## Impact

- Closes the only class of work an Igor is structurally unable to finish, and does so before a
  worker is spent rather than after.
- A pure-deletion run now reaches `produced` where it used to reach `refused`, so it completes
  the item rather than going through the claim protocol's refused path.
- A handoff counts removals as work; previously a run whose every change was a removal read as
  a draft opened over nothing.
