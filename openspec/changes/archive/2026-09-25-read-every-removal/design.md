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
| a worker deleting the conflicted path | `DU f` | `UNMERGED` first, deletion by the catch | unchanged — and **wrong for `DU`**, see the third residual |

Nothing legitimate is skipped, and the argument is short enough to state rather than sample:

- An index column of `A` means the index holds the path and **HEAD does not**. Porcelain's
  unmerged codes are `DD`, `AU`, `UD`, `UA`, `DU`, `AA` and `UU`; `AD` is not among them, and the
  four containing `A` are caught by `UNMERGED` before the gone-check, so `AD` never arrives from a
  merge state. An index-added path is therefore absent from HEAD by construction.
- Absent from HEAD is absent from `base_tree` on both publishing paths, because both lay their
  tree over the commit the clone holds: `commitOnBranch` over `parents[0]`, which is the HEAD
  `merge()` read before merging, and `produce` over `baseSha`, which is `WorkingTree.head()`. That
  second one was a publish-time read of the base branch until this change closed it; the
  measurement and the reasoning are below.

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

Three ways to publish a removal of a path the base tree does not hold survived the guard as first
written. None was created by this change, and all three are what the second requirement is worded
broadly enough to cover. All three are now closed: the first below by publishing against the sha
the tree was cut from, the other two by *The proxies collapse into one test* at the end of this
file, which also deletes the guard this section is written around.

### The index column does not always say what the index knows — **closed, [#121](https://github.com/adamstallard/igor/issues/121)**

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

### The base moving under the produce path — closed here, [#122](https://github.com/adamstallard/igor/issues/122)

`produce` read `branchSha(repo, base)` when it published, and the clone the worker changed was
made before the worker ran. So `base_tree` was the base branch as it stood at publish time, and
the two could differ by whatever landed on the base during the run.

- **Ahead by an addition is harmless**, and the guard makes it so: a path the base gained after
  the clone is not in the working tree at all, so no record can name it, so nothing is removed
  from under it.
- **Ahead by a deletion is the same 422.** If the base drops `X` during the run and the worker
  also deleted `X` — it was in the clone — status prints ` D X`, index column a space, the
  gone-check fires, and the removal goes to a `base_tree` that no longer holds `X`.

**The fix is to stop making the read**, which is why it lands here rather than staying filed: a
sha nobody re-reads cannot move between the read and the tree request. `WorkingTree` gains
`head()`, execution passes it as `ArtifactRequest.baseSha`, and `produce` prefers it to
`branchSha`. The window closes and a round-trip goes with it — the cost is negative, against the
assumption this residual was filed under.

The fallback stays: `baseSha` is optional on the request and `head()` optional on the tree, on the
same terms as `merge()`, because `TreeProvider` says nothing about how a tree is made.

#### The clone's HEAD is the sha it was cut from, measured

Publishing against it is only right if it has not moved, so it was measured rather than assumed —
on a shallow clone, through the whole sequence a resolution run puts it through:

| after | HEAD |
| --- | --- |
| `git clone --depth 1 --branch <ref>` | the remote branch tip |
| `git fetch --unshallow` and `git fetch origin <base>` | unchanged |
| `git merge --no-commit --no-ff <base>`, clean or conflicted | unchanged, `MERGE_HEAD` written |
| the worker editing and deleting files | unchanged |

`merge()` reads `rev-parse HEAD` *before* merging and returns it as `MergeState.head`, and
`--no-commit` is what keeps the two the same afterwards — the property `'does not commit, so the
tree holds the merge and nothing else does'` already pins, now pinned from the publishing side as
well.

**A worker that ran `git commit` is the one case where it moves**, onto a sha the remote cannot
resolve, and the publish then fails on an unknown `base_tree`. Nothing in the repository grants
`git commit`; reaching it needs an operator to put it in a role's `commands`. What that costs is
worth stating exactly rather than waving away, because the obvious sentence — *such a run loses
its committed files from `changes()` anyway* — is true of the files and false of the run: a
**partial** commit leaves the rest dirty, and the rest used to publish against the branch head.
So the change converts a silent partial publish into a loud refusal. Loud is the better failure
of the two by this design's own preference, and the silent one is the class three requirements
here already exist about — but the refusal escapes `execute` as a throw, which leaves the claim
on the item with no handoff note, so it is not free. Recorded as a known edge rather than guarded,
because guarding it means recording the sha when the tree is provisioned, and that is a change to
the tree seam rather than to the publish.

#### The unmerged branch of the read owes a removal it cannot check — **closed here**

The guard sits on the gone-check, and the gone-check is not the only place `changes()` emits a
deletion. The `catch` around the content read emits one for **any** unmerged record whose file is
no longer on disk, and asks nothing about HEAD. `DU` — deleted by us, modified by them — is a path
the artifact branch itself deleted, so `parents[0]` never held it, and the worker removing the
base's copy is exactly what `conflictPrompt` and the catch's own comment ask for.

Reproduced on git 2.54.0: base holds `X.ts`, the artifact branch deletes it, the base then
modifies it; the merge prints `DU X.ts` and leaves the base's copy in the tree; the worker removes
it and the record is still `DU`. `changes()` returns one `deleted` entry, `carried()` puts it in
`deletions`, and `git cat-file -e <artifact head>:X.ts` says the path is absent — the 422 shape,
by the route the guard does not cover. `DD`, `AA` and `AU` are the other unmerged codes whose
"ours" side is absent from HEAD.

It is not this change's doing — the catch and the `UNMERGED` test both predate it. It read at first
as a different kind of edit from the gone-check guard: there the worker asked for nothing, here it
asked, and what to do instead looked like a question about the `DU` orientation the requirement does
not answer. It is not. The worker asking changes who is owed an explanation, not what is true of
`base_tree`, and a removal of a path `base_tree` does not hold is refused whoever asked for it.
Closed below, by the same test that closes #121.

#### `commitOnBranch` does not have this window

The issue names both publishing paths. It is right about `createBranchWithFiles` and wrong about
`commitOnBranch`, which is why only the first is touched:

- `commitOnBranch` lays its tree over `parents[0]`, and the caller's `parents[0]` is
  `MergeState.head` — `rev-parse HEAD` in the clone, before the merge. There is no publish-time
  read of any branch on that path, so the base it publishes against is the clone's by
  construction.
- What the artifact branch does during the run reaches that path at the last step instead: the
  `PATCH refs/heads/<branch>` carries no expected sha, so a push to the artifact branch mid-run is
  a lost update rather than a 422. A different race, unmeasured, and not this change's.

### Why the requirement wants no new scenario

The route is new and the obligation is not. *"A publish is not lost to a removal nobody asked
for"* fires on a removal of a path the base does not hold, and after this the base **does** hold
it — the scenario describes the outcome, and the outcome is unchanged. What moved is which tree
"the base" names, so the requirement's prose gains a sentence fixing it as the tree the work was
cut from rather than the branch head at publish time. A scenario restating that would pin the
mechanism this change chose, which is this file's job.

The remaining residual is why the second requirement says what must be true rather than what the
guard achieves. A requirement describing only the current guard would make the next instance of
the 422 a surprise rather than a known gap.

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

## What the pairing settled to, after #114 landed

[#114](https://github.com/adamstallard/igor/pull/114) merged as `49e0866` before this was
implemented, so `tasks.md` 5.2 applied rather than 5.3's fallback. Its six behavioural tests were
run against the flag and the guard first, as 5.1 requires, and they are what made the deletion
safe to take.

**Two of them failed on the first run, and neither was a lost behaviour.** Both pinned the shape
the pairing produced rather than the property they exist to protect:

- A rename's destination is now `added` rather than `modified`. Its index column really is `A`;
  under the pairing it carried `R`, which is neither, and fell to the `modified` default. Nothing
  distinguishes the two downstream — `carried()` asks only whether a change is `deleted` — and the
  new label is the accurate one.
- A staged rename's two entries now arrive in git's own order, destination before source, rather
  than deletion-first as the pairing emitted them. Array order reaches no consumer.

The property each test protects — the old path reported deleted, and no `-001.md` invented from a
second record — holds in both cases and is asserted unchanged.

**Deleted:** `PAIRED`, `RENAME`, `indexOnly`, the `from`/`++i` pairing in `statusRecords`, and
`StatusRecord.from`, along with the three unit tests that drove the pairing with synthetic `R`
buffers. Those tests were the mechanism's own and could not outlive it; the six behavioural tests
are what now pins the outcome.

**`INDEX_NEW` narrowed from `/^[ARC]/` to `/^A/`.** It stays as the gone-check's guard, as 5.2
says, but porcelain emits no `R` and no `C` under the flag, so two thirds of its alternation could
never match. Dead alternation in the one guard standing between a fold-free read and a refused
publish is a trap for the next reader, who has to work out for themselves that the letters are
unreachable. If the preference is to keep the wider pattern with a comment instead, it is a
one-character change.

## The proxies collapse into one test

Three guards were written against *"no removal is published for a path the base does not hold"*,
and each asked the requirement's question by a proxy:

| guard | proxy | what it missed |
| --- | --- | --- |
| `INDEX_NEW` on the gone-check | an index column of `A` | ` D n` — an intent-to-add path deleted before commit, whose index column is a **space** ([#121](https://github.com/adamstallard/igor/issues/121)) |
| the `UNMERGED` test before the gone-check | "unmerged means the file is still wanted" | nothing; it is the *catch* that emits the removal, and it asks nothing at all |
| publishing against `head()` rather than the branch tip | the base cannot move under the publish | a path HEAD never held, which no amount of pinning the base fixes |

The pattern is the same each time. A status flag describes *how the index got into this state*,
and the tree API's question is *what is in this tree* — so every guard built on flags is an
enumeration of the ways a path can come to be absent from HEAD, and an enumeration is only ever
complete until the next shape turns up. Two turned up in one review.

**The replacement asks the question itself.** Before the loop, every record matching `GONE` or
`UNMERGED` — the superset of paths that could become a removal — goes into one
`git ls-tree HEAD -z -r --name-only --full-tree -- :(literal)<path>…`, and both places a removal is
emitted test the answer. Nothing infers; the tree is read.

### Why this is cheap, against the assumption #121 was deferred under

#121 was filed rather than closed on the belief that "a tree lookup per publish is a large cost".
It is not, and the three things that make it small were each checked:

- **Local, not network.** `ls-tree` reads the clone's own object store. The publish-time reads this
  change removed were round-trips to GitHub; this one is not a read of that kind.
- **Proportional to the removals in hand.** The pathspec limits it. A run with no removals makes no
  call at all, which is most runs; a run removing one path lists one entry, not the repository.
- **One process, not one per path**, batched at 100 kB of pathspec so a change larger than `ARG_MAX`
  splits rather than failing with `E2BIG`. Measured: 600 removals with 200-byte names split 452 and
  148.

### Why HEAD is the right tree, verified rather than assumed

Read out of `src/github.ts` rather than from the issue: `commitOnBranch` sends `base_tree: first`,
where `first` is `parents[0]`; `createBranchWithFiles` sends `base_tree: baseSha`, where `baseSha`
is `request.baseSha ?? branchSha(...)`. Tracing the two callers in `src/execute.ts`, `parents[0]`
is `merge.head` and `request.baseSha` is `await tree.head?.()`. `merge()` takes `head` from
`rev-parse HEAD` **before** merging, and `git merge --no-commit` leaves HEAD alone — measured again
here on a conflicted merge, which writes `MERGE_HEAD` and moves nothing, and now pinned by
`'publishes against the commit the tree was cut from, conflicted merge and all'`.

So HEAD is `base_tree` on both paths, and the check is the same check the host will make.

Two places it would not be, both already known and neither reachable:

- **A worker that ran `git commit`** moves HEAD. Nothing grants that command, and such a run already
  fails loudly on a `base_tree` the remote cannot resolve — see the `git commit` edge above.
- **A tree with no commit at all** has no `HEAD` to list, so `ls-tree` fails and `changes()` throws
  where it used to return. It is reached only by a removal candidate in a repository with no
  commits, which is a clone of an empty repository — one with nothing to work on, and whose
  `head()` already throws on the publishing side. Loud, and left loud.
- **A tree that offers no `head()`** leaves `produce` falling back to `branchSha`. `ClonedTree` is
  the only implementation and it has one; a provider that does not would want its own answer to
  this, which is why the fallback stays optional on the same terms as `merge()`.

### Every unmerged code, by the one test

The test gets the whole family right without naming any of it, which is the point:

| code | HEAD's side | removal |
| --- | --- | --- |
| `DU`, `DD` | deleted by us — absent | correctly dropped |
| `AA`, `AU`, `UA` | added by one side — absent from HEAD | correctly dropped |
| `UD`, `UU` | present in HEAD | correctly published |

`UD` is the ordinary delete/modify the worker resolves by deleting the file, and the requirement it
serves — the base's deletion must not come back — is unaffected. Its test is unchanged.

### The pathspec is a channel, and a channel normalises

Asking HEAD the question directly still has to *carry* the name to git, and the carrier is not
byte-exact. Two ways it is not, one measured only after the mechanism was written:

- **darwin precomposes `argv`.** `git clone` and `git init` set `core.precomposeunicode=true`
  there, and git then precomposes command-line arguments before parsing them. A name HEAD holds in
  decomposed form is matched by **no pathspec at all** — `:(literal)cafe<U+0301>.md` arrives as
  `café.md` and misses, so the check says HEAD lacks a path it has and the removal is dropped in
  silence. On a `UD` path that restores what the base deleted the moment the artifact merges,
  which is the failure the *first* requirement exists against, reintroduced by the fix for the
  second. Measured on git 2.54.0: `git status -z` reports the decomposed bytes, `ls-tree` with the
  literal pathspec returns nothing, and `-c core.precomposeunicode=false` on the same command
  returns the entry. That flag is the fix, and it is on the `ls-tree` call alone — the status read
  must keep the platform's own normalisation, because what is compared is status's bytes against
  HEAD's.
- **Node writes `argv` as UTF-8.** Bytes that do not decode cannot make the trip at all, whatever
  git does with them. That one is not fixable through this channel, and is handled below.

**Rejected: `git cat-file --batch-check -Z` over stdin.** It is the byte-exact channel — stdin is
not precomposed and carries any byte — and it would close both hazards, drop the batching and the
`rawName` exemption, and use one process however many paths there are. Verified working here: a
decomposed name and a name containing `0xe9` both resolve, and an absent path answers `missing`.
Rejected anyway, because `-Z` needs git 2.42 and a `TreeError` from `runBytes` escapes `execute` as
a throw with no handoff note — so an older git would fail every run that removes anything, totally
and with no record on the item, in exchange for **no behavioural difference**: a name that is not
text already fails the run at `unnameable` before a tree is built. A deployment cliff bought with
tidiness. **Where that stops applying:** if a second normalisation of `argv` is ever found, or if
something downstream learns to publish a name that is not text, the channel is the thing to change
and this is the change to make.

### A name that is not text is kept, unchecked

`spawn` takes arguments as strings and writes `argv` as UTF-8, so a name carrying bytes that do not
decode cannot be put in a pathspec: it arrives as U+FFFD, matches nothing, and the removal would be
dropped. Measured in Node rather than assumed — `Buffer.from('\xe9', 'latin1')` reaches the child as
`c3 a9`. **APFS will not hold such a name, so no test on this machine can catch it**, which is why
it is decided here rather than left to the suite.

Such entries skip the check and keep their removal. Nothing is lost by it: `changes()` already
promises that nothing is dropped at this layer, and `src/execute.ts` stops the run on any `rawName`
before it builds a tree, naming the file by its bytes. Dropping the removal instead would convert a
refusal that names the file into a silent omission — the exact failure this whole change exists
against.

The set of paths HEAD holds is keyed `latin1` for the same reason the deleted `indexOnly` set was:
two names differing only in bytes that do not decode share one string, so a set keyed on the
decoded name answers for one of them with the other's entry.

**One behaviour changes direction here, and it is the better failure.** `INDEX_NEW` skipped an `AD`
record silently, whatever its name; the exemption pushes that record's removal instead, so
`unnameable` fires and the whole run refuses with the file named in bytes. Reachable on Linux — a
worker that creates such a file, stages it and deletes it — and not on APFS, which will not hold
the name. A silent skip became a loud refusal, which is this design's stated preference, but it is
a change rather than a tidy-up and is written down as one.

### `INDEX_NEW` is deleted

It was the proxy, and the HEAD check subsumes it. Confirmed by mutation rather than by reading:
with the HEAD check removed, the three tests `INDEX_NEW` existed for — the chain rename, the rename
source only the index ever had, and the file staged and then moved — go red alongside the two new
ones, and nothing else in the suite does. `grep` finds no other caller.

### What the suite said

37 files, 1180 tests before; 37 files, 1185 after, with **no existing test changed**. That is the
evidence that no legitimate removal is dropped: every removal the suite asserts on is a removal of a
path HEAD holds, and they all still arrive.
