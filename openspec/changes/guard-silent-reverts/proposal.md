## Why

A conflict resolution is published as a two-parent commit naming the base as a parent. The
commit's tree *is* the merge result, so **every path the resolution keeps is a potential revert
of what the base did to that path** — and nothing looks for one.

Two instances of that shape were found on PR #64 within hours of each other, each driven red by
a test before it was fixed:

1. A deletion or rename the base made was reverted, because the resolution kept a path the base
   had removed.
2. A path the merge staged and the worker then removed was dropped from the resolution
   altogether — porcelain reported it `MD`, the shape matched neither the deleted nor the
   unmerged pattern, the read threw `ENOENT` and the record was skipped. The artifact's older
   copy stayed and reverted the base's rewrite of that file on merge.

**Review is not the backstop here, and that is the argument for structural work.** A reverted
deletion does not read as *"Igor deleted your file"* — it reads as **the file still being
there**. A reverted rewrite reads as the file being unchanged. Both are absences, the diff
against the base looks unremarkable, and the failure is invisible to precisely the mechanism
meant to catch it.

**The guards `keep-artifacts-mergeable` already has cannot see it.** The conflict-marker check
catches a worker that declined the conflict, and says nothing about a resolution that is
well-formed and wrong. The post-publish re-ask catches a resolution that resolved *nothing* — a
revert merges perfectly cleanly, so it answers 204. Deferral keeps a handed-off item quiet and
is not a correctness check at all. All three are shape-agnostic: none compares the resolution
against what the base changed.

**Not a trigger question.** This is not addressed by asking before resolving. Consent to attempt
a resolution does not make the resulting commit correct — the same silent revert lands, with a
human having said "go ahead". Whether an Igor resolves unasked is a question about work and
consent; this one is about what may be published.

## What Changes

**A resolution that would undo a base change is refused before it is published.** Before the
two-parent commit goes onto the branch, what the base changed since the merge base is compared
against what the resolution publishes. Where the resolution would restore a path to the state it
held before the base touched it, nothing is published: the item is handed off naming those
paths. Both sides are already in hand — the merge is performed locally, so the comparison costs
git and no model call.

**The claim is deliberately narrow.** Not that a resolution is *correct* — only that **undoing a
base change is never an accidental outcome**. A resolution that combines both sides, or that
takes the base's side, or that agrees with a deletion the base made, diverges from nothing and
trips nothing.

**There is no escape a worker can operate.** A revert hands off and a person decides. The
alternative is a declaration channel through which the worker authorizes its own publish, and
the worker's word is never authority about what changed in the tree. `design.md` argues the
alternatives down; the recommendation is the open question of this change.

Explicitly out of scope:

- **Judging whether a resolution is right.** The guard reads one thing: whether a base change
  survives.
- **The first artifact.** A produced artifact's commit has no base parent, so no path in it can
  revert anything.
- **Partial erosion.** Content that differs from both the base and the merge base is a
  resolution, not a revert, and is published.
- **What a handoff says.** `graceful-handoff` owns that; this change only adds the paths it
  names.

## Capabilities

### Modified Capabilities

- `task-execution`: a resolution that would undo what the base did to a path is not published;
  the item is handed off naming the paths.

## Impact

- Closes a class with two proven instances in a path that had already been through three
  bug-hunter iterations, rather than waiting for the third.
- Costs a `merge-base` and one diff per resolution, in a tree that already exists. No request,
  no model call.
- Turns a rare legitimate revert into a human round-trip. That is the price, and it is paid
  where the alternative is a silent revert that review structurally cannot see.
- Does not collide with `keep-artifacts-mergeable`'s handoff for a conflict that *cannot* be
  resolved. That one fires where the worker failed; this one fires where the worker succeeded
  and the result would undo the base.
