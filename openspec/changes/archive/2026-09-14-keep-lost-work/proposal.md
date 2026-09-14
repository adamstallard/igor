## Why

An Igor re-checks its claim between the worker finishing and anything being published, and
discards the work if the claim is gone. For a **stop** that is exactly right: someone said halt,
and a pull request appearing afterwards ignores them.

For a **loss** it throws away finished work for no one's benefit. Alice assigning herself
mid-run is saying "I am taking this", not "destroy what you have". What she gets today is an
empty issue and a working tree deleted in a `finally`; the minutes the Igor spent, and the diff
it produced, are gone and unrecoverable — the transcript on the state branch records that the
change was made but not the change.

The two cases are read from the same boolean, so the one rule that fits a stop is applied to a
situation with the opposite answer.

## What Changes

**A claim lost mid-execution publishes what exists; a stop still publishes nothing.** The
check distinguishes the two rather than collapsing them.

**What is published is unmistakably not a request for attention.** A draft, with no reviewers
requested, and a message on the item naming who holds it now and saying the work is theirs to
keep, continue, or discard. An Igor that lost an item should not then appear in someone's review
queue over it.

**The role's action space still governs.** A role that may not open a pull request publishes
nothing here either — losing a claim does not widen what an Igor may do.

Explicitly out of scope:

- **Publishing after a stop.** The stop is the case the re-check was built for.
- **Keeping the working tree.** The tree is disposable by design; a draft is the durable form.

## Capabilities

### Modified Capabilities

- `task-execution`: work finished before a claim was lost is published as a draft rather than
  discarded, while a stop still discards.

## Impact

- Removes the only path where an Igor destroys completed work without anyone choosing that.
- Makes losing a claim mid-run useful to whoever won it instead of merely silent.
