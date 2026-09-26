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

**The three guards already in force cannot see it.** The conflict-marker check
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

**An undeclared revert of a base change is refused before it is published.** Before the
two-parent commit goes onto the branch, what the base changed since the merge base is compared
against what the resolution publishes. Where the resolution would restore a path to the state it
held before the base touched it and does not say so, nothing is published: the item is handed
off naming those paths. Both sides are already in hand — the merge is performed locally, so the
comparison costs git and no model call.

**The claim is deliberately narrow.** Not that a resolution is *correct* — only that **undoing a
base change is never an accidental outcome**. A resolution that combines both sides, or that
takes the base's side, or that agrees with a deletion the base made, diverges from nothing and
trips nothing.

**A revert the resolution declares is published, and said out loud.** A worker that means to
undo a base change writes it down: one entry per path, naming the base state it discards. There
is no blanket form — no wildcard, no per-resolution flag, nothing a role or an org config can
set — so the permission is retaken for each resolution rather than switched on once. A declared
revert is reported in the same place a refusal would have been, on the resolution and with the
run, because the point of the guard is that an undone base change stops being invisible and that
survives being intended.

**The declaration is a channel untrusted text can reach, and that cost is accepted.** A worker
reads the item, the diff and the conflicting content; an injection that can produce the revert
can produce the declaration beside it, and with no channel that revert would have been caught.
What the recording requirement buys is not prevention: it is that the revert names itself and the
change it discarded, so the attack is attributable rather than silent. `design.md` states the
loss plainly and carries the case for refusing every revert as a rejected alternative.

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

- `task-execution`: a resolution that would undo what the base did to a path is published only
  where it declares that path, and is reported when it does; an undeclared revert publishes
  nothing and hands the item off naming the paths.

A requirement of its own rather than a clause inside *"A published artifact is kept mergeable"*,
which is now in force. That one says an artifact is brought up to date and what happens when a
conflict cannot be resolved; this one says what may be committed when it *can* be. Distinct
trigger, distinct outcome, and folding them together would give one requirement two subjects and
a scenario list that reads as a single procedure.

## Impact

- Closes a class with two proven instances in a path that had already been through three
  bug-hunter iterations, rather than waiting for the third.
- Costs a `merge-base` and one diff per resolution, in a tree that already exists. No request,
  no model call.
- Lets a legitimate revert through, at the price of writing it down, and leaves a record of it
  where a reverted deletion previously left none.
- Opens one channel an injection can reach, deliberately. The revert it buys is recorded and
  names what it discarded, rather than being the invisible outcome the guard was built for.
- Does not collide with the in-force *"A published artifact is kept mergeable"* and its handoff
  for a conflict that *cannot* be resolved. That one fires where the worker failed; this one
  fires where the worker succeeded and the result would undo the base.
