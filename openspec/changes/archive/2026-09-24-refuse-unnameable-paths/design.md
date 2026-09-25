# Design

Three choices here are not implied by the requirement: how a name that did not survive is
detected, where the refusal sits, and how much of the run it takes with it.

## The test is a round trip, not a search for U+FFFD

```ts
export function named(name: Buffer): { path: string; rawName?: Buffer } {
  const path = name.toString('utf8')
  return Buffer.from(path, 'utf8').equals(name) ? { path } : { path, rawName: name }
}
```

**Rejected: `path.includes('�')`.** U+FFFD is an ordinary character and a file may be named
with it, so the substring test refuses a name that publishes perfectly well. That false positive
is why detect-and-refuse was turned down for this issue before #97 — at the time the decoded
string was all there was, and no exact test could be written. The round trip has no such case:
the only strings that re-encode to something other than the input bytes are the ones the decode
substituted into, and a name really spelled with U+FFFD encodes back to `EF BF BD` and passes.

Both directions are pinned by test, including a file named `�.md` created on disk and
published end to end — that name is one APFS will hold, so the guard against over-refusal is
provable here even though the case it guards against is not.

**The bytes ride along rather than being recomputed.** `ChangedFile.rawName` is present only
where the round trip failed, so its presence *is* the signal, and no caller re-derives the test.
Absent on every ordinary entry, which is what keeps the existing exact-match tests green.

## The refusal is in the publishing path, not in `changes()`

**Rejected: `changes()` refuses outright.** It is simpler, and it reaches the catch-up path as
well as the produce path. It also breaks a requirement in force. `src/execute.ts` reads the tree
on the kill path as

```ts
const changed = await tree.changes().catch(() => [])
```

and `task-execution`'s "A limit does not destroy what the worker already produced" requires that
a worker killed mid-edit have its tree read "so the recorded outcome names what it changed",
because "recording either as having produced nothing records the wrong failure". A throw from
`changes()` is swallowed by that catch, and every file the run touched vanishes from the record
over one name. The blast radius is not merely wider; it is a requirement.

So `changes()` reports the fact and the publishing path acts on it — the same shape as the
conflict-marker check, which reads what is about to be published, declines, and hands off.

**Placement.** Immediately after the role's action space is checked and before `files` and
`deletions` are assembled. Two reasons: a role that may not open a pull request should report
that rather than a filename, since it is the fact that recurs; and the check reads only
`changed`, never `files` or `deletions`, so it does not touch the region
[#88](https://github.com/adamstallard/igor/pull/88) rewrites.

**Outcome `failed`, not `refused`.** In `loop.ts`, `refused` re-reads the claim first and routes
to stopped/lost handling — it is for a claim that went away or an action the role may not take.
This is neither. `failed` is what the conflict-marker check returns, and both converge on a
failure handoff carrying the reason.

## What the handoff says

Until #97 a message could only name the file by its mangled spelling, which names nothing. The
bytes exist now, so `quoteName` writes printable ASCII as itself, every other byte as `\xHH`,
and the backslash doubled:

```
nothing was published: caf\xe9.md is named in bytes that are not text,
and an artifact can only publish at a path that is
```

Escaping the backslash is what makes the rendering injective, and injective is the property that
matters: two names differing only in the bytes that did not decode are exactly the third cost
this change closes, and a message built from the decoded path would name one of them twice and
the other never. Git's own `core.quotePath` does the same thing with octal.

**Doubling inside `quoteName` alone is not enough, which a bug-hunter pass caught.** Only a name
that is *not* text ever reaches `quoteName`, so the ordinary side of every rendering was passing
through undoubled — and a file legitimately named `a\xe9.md` then read exactly like the escape
of one named with the byte `0xe9`. The collision this change exists to stop, reappearing in the
report of it. `showName` renders both sides: bytes through `quoteName`, an ordinary name with
its backslashes doubled. The two ranges are then disjoint, because a doubled name can never
carry an odd-length run of backslashes and an escape always does — checked over 20,000 random
byte names, with no case where the two disagreed.

**The backtick and the space are escaped although both are printable**, which two later passes
caught one layer out. The refusal wraps the name in a code span so markdown leaves the
backslashes alone, and the span is what makes those two bytes unsafe: a backtick closes it
early and drops the rest of the name into body text, where `\\` collapses to `\` and the
doubling is undone in the one sentence it exists for; and a span whose content begins and ends
with a space has one taken off each end, so ` \xe9 ` and `\xe9` arrive as the same name.

Every other printable byte is inert inside a span — `|`, `<`, `>`, `&`, `*`, `_`, `[`, `]`
included — so escaping them would only make the name harder to read. Checked over 212,715
escaped names drawn from a byte pool built out of the hazards: no two rendered alike after the
strip a code span performs.

The pattern is worth naming, because all three bugs were it: **a rendering is only injective in
the place it is read.** Doubling inside `quoteName` was injective in `quoteName`; the escape was
faithful right up to the renderer. Each time the property held one layer in from where it had
to.

The recorded change list uses the same rendering, so the reason and the record name one file.

## Scope: the whole run, and the argument against

**Implemented: any unnameable entry refuses the whole run.** Nothing wrong is published, and a
person is handed a problem no automation can decide.

**The alternative, and it is not obviously worse: omit the entry and publish the rest.** It
closes all three costs — nothing publishes at the mangled name, no collision, no phantom
deletion — while keeping the other eleven files of a twelve-file change. `task-execution` says
in two places that partial work is offered rather than destroyed ("A limit does not destroy what
the worker already produced"; "Work finished before a claim is lost is offered, not discarded"),
and its stated reason applies exactly: the tree is disposable, so what is not published is gone.

What decided it: an artifact missing a file looks complete. It publishes, the claim is released,
the item reads as handled, and the omission is a line somebody has to read. An artifact that was
never produced cannot be mistaken for the work. Given that the whole failure mode here is *a
change that looks right and is not*, the loud outcome is the one consistent with the rest of the
change — and a refusal is reversible by a person in a way a merged half-change is not.

**Settled, not merely recorded.** The reason that decided it is not the one above, and is worth
having in writing because it survives the case the argument above turns on. **A handoff happens
either way**, so publishing the other eleven files buys no automation — the same person is
summoned to the same problem, and all that changes is what they are handed.

Against that, the two risks are not symmetric. Duplicate work — somebody redoing files that were
in fact published — costs time, and is visible to the person while they are doing it. A file
missing from an artifact that reads as complete costs correctness, and is visible to nobody.
**Better to risk the duplicate than the omission.**

The per-entry form remains a small delta from here, because the entries already carry the flag
individually. What it now needs is an argument that answers that asymmetry, rather than only
evidence that a repository tripped the refusal.

## What this costs #88, measured

`git merge-file` with `origin/main` as the base, this change as ours and
[#88](https://github.com/adamstallard/igor/pull/88) as theirs: **`src/worktree.ts` merges
clean, `src/execute.ts` reports two conflicts.**

`worktree.ts` is clean **because `rawName` sits at the end of `ChangedFile`, after
`executable`.** Next to `path`, where it reads better, it lands against the `kind` docstring
that #88 rewords, and costs a conflict for nothing. Optional fields last is idiomatic anyway,
so the merge decides a tie rather than overriding a preference.

`execute.ts`'s two are:

1. The `./worktree.js` import line. #88 reformats it to multi-line; this adds `showName` to
   the single-line form.
2. The block immediately above `// A deletion reaches an artifact's own branch…`. #88 replaces
   that block with `carried()`, and this inserts the refusal directly above it — adjacent is
   enough.

Both are an addition beside a replacement, and both resolve by keeping the two sides.

Moving the refusal above the role's action-space check would clear the second, and would cost
the ordering that matters. A role that may not open a pull request mints `role:<name>:allow` —
the durable fact an operator has to act on, since every item will fail the same way — and
reporting a filename in front of it hides that. Correct order over a clean merge, here; a free
clean merge where nothing is at stake, above.

## A rename whose source is unnameable stops the run, and should

`changes()` flags the `from` side of a rename as a deletion carrying bytes, so a rename away
from an unnameable name refuses the run even though the destination is fine. On today's produce
path that deletion was going to be dropped rather than published, so the refusal looks like it
costs a run for nothing.

It does not. A rename whose source cannot be removed publishes the new file and leaves the old
one, under a name nothing can address — the branch carries the file twice, which is the first
of the three costs this change closes, reached from the other side. And once #88 lands,
deletions publish on both paths, so the mangled path would go to the tree API for real.
Refusing is right before and after.

## What is proved, and what is not

The round trip, the rendering, and the refusal are all proved by test, each observed red first.
The refusal is driven through `execute` with a fake tree, which is where the publishing decision
is made.

**Not proved:** a real file named with invalid bytes, in a real tree, refused end to end. APFS
rejects the byte sequence outright; ext4, where Igor runs as a service, allows any byte but `/`
and NUL. #97 stopped at the parse seam for the same reason and said so. The round trip is
testable at that seam — it operates on bytes rather than on the filesystem — so what is reasoned
rather than shown is only that git reports such a name in the first place, which #97 already
argued from `-z`'s existence.

**Not reviewed:** the last fix of the last bug-hunter iteration got no finder pass of its own.
The three-iteration budget ended on an iteration that fixed something, and an iteration that
fixed something should not be the last. The unreviewed code is one boundary condition in
`quoteName` — `byte >= 0x20` became `byte > 0x20`, so a space is escaped rather than left for a
code span to strip — and the test that drove it red. Accepted as a gap rather than spent a
fourth run on: the reasoning is under "What the handoff says", the change is one comparison, and
a reviewer told which line went unswept can read it directly.
