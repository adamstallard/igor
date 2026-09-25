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
not to anything about the merge itself. In a control run outside a merge the deletion was
printed (` D b.md`, `?? c.md`): the pairing needs the destination to be a tracked index entry,
which a conflicted merge supplies and an untracked new file does not. Roughly 1–2% of fuzzed
merge trials on PR #114 hit it.

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

The second requirement is new in the same way and in the opposite direction. *"Every change the
worker made"* is a lower bound on what an artifact carries and says nothing about an entry for a
path the worker never touched. The host's refusal makes that upper bound load-bearing rather than
tidy: a removal of a path the base tree does not hold returns `422 GitRPC::BadObjectState` and
fails the whole tree request. Nothing in force forbids sending one.

## ADDED, not MODIFIED

Two sibling requirements, for three reasons:

- **Different subject.** The in-force one is about the artifact: what execution read must reach
  it. These two are about the read: what execution must be able to see, and what it must not
  report seeing. Triggers and outcomes are all distinct — one fires when a change is read and
  dropped, the second when a change is never read at all, the third when something that is not a
  change is read as one — and folding them gives one requirement several subjects, which is the
  reason #103 gave for adding rather than folding into *"A published artifact is kept
  mergeable"*.
- **#115 is coming to the same area.** Two open changes both `MODIFIED`-ing one requirement is a
  merge hazard: each delta must carry the full scenario set with a byte-identical name, and
  whichever lands second reads as a drop or conflicts.
- **The loophole is closed by conjunction, not by rewording.** The first new requirement says the
  read may not lose a removal, so *"every change execution read"* no longer has an incomplete read
  behind it. Its prose says so explicitly, rather than leaving a reader to infer it.

They are two requirements rather than one for the same reason: *no removal is lost* and *no
removal is invented* are opposite failures with opposite mechanisms, and a single requirement
covering both would be satisfiable by a read that does neither well. The second names the first
so a mechanism cannot buy one with the other.

Because nothing is modified, the in-force requirement's scenarios are untouched — the
`#### Scenario:` diff against `origin/main` for `openspec/specs/task-execution/spec.md` is empty,
which is the reportable result.

## What Changes

**A removal survives a read that reports two changed paths as one.** Execution's read of the
working tree SHALL NOT be able to lose a change because git folded two paths into one record;
where it would, the removal is still read and still carried.

**A removal is published only for a path the base holds.** The first requirement is about
*losing* a removal, and nothing in it forbids *inventing* one. The read that recovers the lost
deletion prints records for paths no tree has, and the host refuses a removal of a path the base
tree does not hold with `422 GitRPC::BadObjectState` — a refusal of the whole tree request, so
nothing publishes at all. Stated as a requirement, that refusal is something the design forbids
rather than something the mechanism happens to avoid.

**Both are worded as outcomes, and the mechanism is `design.md`'s.** Candidate mechanisms were
measured and they do not agree — `git diff --name-status HEAD` folds the same deletion into
`R091 b.md c.md` and is disqualified, while `--no-renames` on the read already being made
recovers it for no extra process, at the price of a guard the second requirement is the reason
for. A requirement that said "cross-check a second source" would mandate a cost the measurement
shows is unnecessary.

Explicitly out of scope:

- **#115's half-rename.** A destination that cannot be read publishes the source's deletion
  alone. That survives a fold-free read unchanged: the two records arrive separately, the
  deletion is emitted, the destination's read throws and is skipped. Different defect, different
  requirement.
- **Binaries, and names that are not text.** Other limits in the same function, each with its
  own requirement or its own absence of one.
- **Deleting `statusRecords`' rename pairing.** `design.md` records that the chosen mechanism
  makes it unreachable, and `tasks.md` carries the deletion as gate-two work conditioned on
  PR #114's tests staying green.

## What the mechanism collapses

With `--no-renames` and the guard, porcelain emits no `R` and no `C` record at all. Three open
things move as a consequence, and they are stated here because a reader of the issues will
otherwise reach them separately and in the wrong order.

- **#96 dissolves.** The ` R` pairing bug cannot occur, because there is nothing to pair. Worth
  saying plainly: #96's symptom today is a **loud** 422 and not silent corruption — the invented
  `-001.md` is absent from `base_tree`, so the tree request is refused and nothing publishes. That
  lowers the urgency of the interim fix without lowering the cost of the bug, which is the run's
  whole output.
- **#117 is vindicated in mechanism, and stays closed.** It proposed `status.renames=false`, which
  is byte-identical to `--no-renames` — compared as raw `-z` output over five repositories, every
  pair matched byte for byte. It was closed because that reports a chain rename as `AD b`, whose
  removal is the refused one. The guard is what it was missing, and both costs it named are
  measured away in `design.md`: the copy distinction costs nothing because nothing pairs, and the
  invented removal is skipped by the primitive PR #114 already wrote. The work lands here rather
  than by reopening it.
- **The pairing mechanism becomes deletable.** `PAIRED`, `RENAME` and `indexOnly` in
  `src/worktree.ts` have nothing left to fire on; `INDEX_NEW` survives as the gone-check's guard.
  `tasks.md` carries the deletion as gate-two work, explicitly conditioned on #114's tests staying
  green, because those tests pin the behaviour any replacement must satisfy.

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
  merge is still carried; and a second that a removal is published only for a path the base holds,
  so the read cannot invent one either.

**Capability checked rather than assumed.** `openspec/specs/` holds `task-execution`,
`graceful-handoff`, `work-claiming`, `work-discovery`, `work-triage`, `role-config`,
`seat-budget`, `surface-adapter`, `lore-store`, `lore-review` and `lore-firing`. There is no
capability for the tree seam: the three requirements that already govern reading a working tree
— *"Execution obtains a disposable working tree through one seam"*, *"The artifact carries every
change the worker made, including removals"* and *"A change is not published under a name that
is not text"* — are all `task-execution`, and the defect is in `src/worktree.ts` called from the
execution path. `graceful-handoff` owns what a handoff says and is not touched, because nothing
here hands off.

**Collision checked by hand**, `openspec validate` not doing it across open changes: both names
against every `### Requirement:` name in every change under `openspec/changes/`, in
`openspec/specs/`, and on the branches of every open pull request — #65, #74, #75, #81, #82, #99,
#100, #101, #103, #106, #111, #112, #113 and #114. 160 distinct names, no collision.

Compared specifically against #103's, which is the only other open `task-execution` delta that
adds one: *"A base change is undone only where the resolution says so"*. It and *"No removal is
published for a path the base does not hold"* both say "base" and mean different things — #103's
is the set of changes the base branch made since the merge base, this one's is the tree the commit
is laid over. Both requirements say so in their first sentence, so neither can be read as the
other. `lore-from-corrections`' three proposing requirements are the other `task-execution` delta
and are nowhere near. None of them is `MODIFIED` against the requirement this change leaves
alone.

## Impact

- Removes the third route by which an artifact silently disagrees with the worker, at the read
  rather than at the publish.
- Costs nothing per cycle under the mechanism `design.md` takes: the same `git status` call with
  one more flag.
- Closes the route by which an artifact invents a removal of a path no tree holds, which the
  host refuses with a 422 that costs the run everything it produced. One case of that remains
  measured and unreached — `git add -N n && rm n` prints ` D n` with rename detection on or off —
  and `tasks.md` carries it.
- Overlaps PR #114 in mechanism, not in name. That change pairs a rename from either porcelain
  column and guards the source the index invented; the mechanism here makes porcelain stop
  reporting renames at all, which makes the pairing unreachable and moves the guard one step
  earlier, onto the gone-check. The deletion is gate-two work conditioned on #114's tests, not
  taken here.
- Nothing under `src/`. This is gate one; #116 stays open until the implementation lands.
