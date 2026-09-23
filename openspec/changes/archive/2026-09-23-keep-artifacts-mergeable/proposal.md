## Why

An Igor publishes a pull request and never looks at it again.

`main` moves, the branch stops merging, and nothing notices. Observed: PR #21 sat while `main`
advanced eight commits and went from clean to conflicting, and a person had to say so.

The item cannot come back on its own. Once the pull request exists the item reports work in
flight, and that is a universal skip — so the Igor drops it before triage, every cycle,
correctly by the rule as written and wrongly for this case.

Nothing about this is a limit of the worker. It is a competent engineer with a shell. But the
worker never touches git: it edits files in a disposable clone, the loop creates the branch
through the API from what changed, and the tree is released in a `finally` the moment the run
ends. There is no local branch to rebase and no remote to push to. Keeping an artifact current
is a loop action, and the loop has no such action.

## What Changes

**An Igor's own artifact that cannot merge is work again.** The in-flight skip narrows rather
than gains an exception: it exists because "duplicating work in review is never an
organizational preference", and a conflicting artifact of one's own is not duplication — it is
the same work, unfinished. Everything else in flight is still skipped, and the rule stays
non-configurable.

**Only a conflict costs anything.** The loop asks the code host to merge the base into the
branch of an artifact that no longer merges. The host does the merge and reports a conflict
rather than producing one, so nothing at all is spent on an artifact that is merely behind.

**A conflict escalates to a worker, on the branch rather than instead of it.** What the worker
is handed is a conflict in files, which is its job. It is not handed git.

**Review conversation survives.** Regenerating the artifact from scratch would be cheaper and
would silently discard an exchange someone invested in, so a conflict is resolved on the branch
that exists.

Explicitly out of scope:

- **Rebasing rather than merging.** A rebase rewrites published history that a reviewer may
  have commented against.
- **Acting on any artifact but its own.** A conflicting pull request somebody else opened is
  theirs, and the holder rule already says so.
- **Keeping an artifact current for any other reason.** Failing checks, review comments and
  requested changes are all `directed-interaction`'s question, not this one.

## Capabilities

### Modified Capabilities

- `work-triage`: the in-flight skip narrows. An item whose in-flight artifact is the Igor's own
  and cannot merge is a candidate; every other item in flight is still skipped.
- `task-execution`: an artifact of the Igor's own that can no longer merge is brought up to
  date after it is published — by the code host where the merge comes out clean, and by a
  worker where it does not.

## Impact

- Removes the only state in which an Igor's own unfinished work is invisible to it.
- Costs roughly two requests per *conflicting* own artifact per cycle — a comment read and the
  merge — and nothing at all for one that is healthy or whose mergeability is unknown; a worker
  run only where a person would also have had to think.
- Sits awkwardly beside the claim protocol today: the claim is released at publication, but the
  work is not finished until the artifact merges or somebody closes it. This does not resolve
  that tension, it just stops the Igor being silent about it.
