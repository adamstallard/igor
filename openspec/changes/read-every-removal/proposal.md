## Why

`changes()` reads the working tree with `git status --porcelain -z -uall`. During a conflicted
merge, git's rename detection can pair a worker's unstaged deletion with an unmerged path and
print **one** record where two paths changed. The deletion is then not in the output at all —
not as a record with an unexpected status, not as a half of a rename pair, not as anything. The
resolution publishes without the removal, and merging it **restores the file the worker
deleted**.

**Reproduced before this was written**, on git 2.54.0, in a repository built for it: base holds
`b.md` and `c.md` with `b.md` 91% similar to `c.md`; one side deletes `c.md`, the other modifies
it, the merge leaves `DU c.md`; the worker then deletes `b.md`.

```
$ git status --porcelain -z -uall          # the read execution makes today
DU c.md                                     # and nothing about b.md

$ git status --porcelain -z -uall --no-renames
 D b.md                                     # the deletion, printed
DU c.md

$ git ls-files -d -z
b.md
```

The `--no-renames` line is what identifies the cause: the deletion is lost to rename detection,
not to anything about the merge itself. Outside a conflicted merge the same deletion is always
printed — a rename's destination has to be a tracked path in the index for the pairing to
happen, and outside a merge an unstaged new file is untracked. Roughly 1–2% of fuzzed merge
trials on PR #114 hit it.

**No parsing change can recover it.** `statusRecords` and `changes()` can only pair, order and
classify records that are in the output. This one is not, and it is not reported as a rename
either — the porcelain line carries the unmerged flags `DU`, so there is nothing to pair it with
and no flag combination a parser could learn to expect.

**Review cannot see it.** A file that should have gone is simply still there, and the published
diff reads as unremarkable.

## Why this is a requirement and not a correction

The in-force requirement is *"The artifact carries every change the worker made, including
removals"*:

> An artifact SHALL carry every change **execution read out of the working tree** — files added,
> files modified, and files removed.

Read literally, the defect **satisfies** it: `status` did not report the deletion, so execution
never read it, so nothing was dropped between reading and publishing. The intent is plainly
violated. Closing the gap adds an obligation that requirement does not contain and cannot be
made to contain by tightening a verb — *the read itself must not be able to lose a removal* —
which is a new thing that must be true, so it is requirement text rather than an implementation
fix under an existing rule.

## ADDED, not MODIFIED

A sibling requirement, for three reasons:

- **Different subject.** The in-force one is about the artifact: what execution read must reach
  it. This one is about the read: what execution must be able to see. Trigger and outcome are
  both distinct — one fires when a change is read and dropped, the other when a change is never
  read at all — and folding them gives one requirement two subjects, which is the reason #103
  gave for adding rather than folding into *"A published artifact is kept mergeable"*.
- **#115 is coming to the same area.** Two open changes both `MODIFIED`-ing one requirement is a
  merge hazard: each delta must carry the full scenario set with a byte-identical name, and
  whichever lands second reads as a drop or conflicts.
- **The loophole is closed by conjunction, not by rewording.** The new requirement says the read
  may not lose a removal, so *"every change execution read"* no longer has an incomplete read
  behind it. Its prose says so explicitly, rather than leaving a reader to infer it.

Because nothing is modified, the in-force requirement's scenarios are untouched — the
`#### Scenario:` diff against `origin/main` for `openspec/specs/task-execution/spec.md` is empty,
which is the reportable result.

## What Changes

**A removal survives a read that reports two changed paths as one.** Execution's read of the
working tree SHALL NOT be able to lose a change because git folded two paths into one record;
where it would, the removal is still read and still carried.

**The requirement is worded as an outcome, and the mechanism is `design.md`'s.** Three candidate
mechanisms were measured and they do not agree — `git diff --name-status HEAD` folds the same
deletion into `R091 b.md c.md` and is disqualified, while `--no-renames` on the read already
being made recovers it for no extra process. A requirement that said "cross-check a second
source" would mandate a cost the measurement shows is unnecessary.

Explicitly out of scope:

- **#115's half-rename.** A destination that cannot be read publishes the source's deletion
  alone. That survives a fold-free read unchanged: the two records arrive separately, the
  deletion is emitted, the destination's read throws and is skipped. Different defect, different
  requirement.
- **Binaries, and names that are not text.** Other limits in the same function, each with its
  own requirement or its own absence of one.
- **Deciding whether the implementation keeps `statusRecords`' rename pairing.** `design.md`
  records that the chosen mechanism makes it unreachable and why that is a gate-two decision.

## #103 does not cover this, and it is downstream of it

PR #103's requirement, *"A base change is undone only where the resolution says so"*, compares
**what the base changed since the merge base** against what the resolution publishes, and
refuses where a path would be restored to the state it held before the base changed it. In the
reproduction the base (`them`) touched only `c.md`. It never touched `b.md`, so `b.md` is not in
the set that guard iterates and the resolution passes as clean. Confirmed against the delta text
and against the repository the defect was reproduced in.

The sharper statement of the boundary: **#103's input is this same read.** What the resolution
publishes is what `changes()` returned, so a removal the read lost is a removal #103 cannot
compare. It is not a backstop standing behind this defect; it is downstream of it. The same
shape as #70 and #99 naming each other's boundary — there, a call never made against a call that
failed; here, a guard with nothing to fire on against a guard reading a blind input.

## Three requirements, not one

The class is *the published artifact does not match what the worker did, and review cannot see
it*: #68 through the publish path, #116 through the parser's input, #115 through the parser's
ordering. One requirement for all three is tempting and wrong. Written out it says "the artifact
matches what the worker did", which has no trigger anything can test: the moment its scenarios
get a **WHEN**, they decompose back into the three — a comparison against the base before
committing, a read that cannot lose a record, a pair emitted whole or not at all. Three
mechanisms, three moments in the run, three different things going wrong.

What the class earns is not one requirement but the cross-reference: each names its boundary
against the others, so that the next instance is recognised as the fourth of a class rather than
as a novelty. This proposal names #103's from this side; #115's proposal should name it from
that side.

## Capabilities

### Modified Capabilities

- `task-execution`: gains a requirement that execution's read of the working tree cannot lose a
  removal to git reporting two changed paths as one, so a worker's deletion during a conflicted
  merge is still carried.

**Capability checked rather than assumed.** `openspec/specs/` holds `task-execution`,
`graceful-handoff`, `work-claiming`, `work-discovery`, `work-triage`, `role-config`,
`seat-budget`, `surface-adapter`, `lore-store`, `lore-review` and `lore-firing`. There is no
capability for the tree seam: the three requirements that already govern reading a working tree
— *"Execution obtains a disposable working tree through one seam"*, *"The artifact carries every
change the worker made, including removals"* and *"A change is not published under a name that
is not text"* — are all `task-execution`, and the defect is in `src/worktree.ts` called from the
execution path. `graceful-handoff` owns what a handoff says and is not touched, because nothing
here hands off.

**Collision checked by hand**, `openspec validate` not doing it: every `### Requirement:` name in
every change under `openspec/changes/` on `main` and on the branches of all eleven open pull
requests — #103 (`guard-silent-reverts`, `task-execution`), #111 and #112 (`lore-store`), #113
(`setup-check`), #101, #106, #114, #99, #82, #81, #75, #74, #65. The only other open
`task-execution` deltas are #103's *"A base change is undone only where the resolution says so"*
and `lore-from-corrections`' three proposing requirements. No name here collides with any of
them, and none of them is `MODIFIED` against the requirement this change leaves alone.

## Impact

- Removes the third route by which an artifact silently disagrees with the worker, at the read
  rather than at the publish.
- Costs nothing per cycle under the mechanism `design.md` takes: the same `git status` call with
  one more flag.
- Overlaps PR #114 in mechanism, not in name. That change pairs a rename from either porcelain
  column; the mechanism here makes porcelain stop reporting renames at all, so the pairing it
  fixes becomes unreachable. Named in `design.md` and left as a gate-two decision rather than
  taken here, because #114 is in flight.
- Nothing under `src/`. This is gate one; #116 stays open until the implementation lands.
