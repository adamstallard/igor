## Why

On darwin, `core.precomposeunicode` is on by default and git precomposes the name it gets from
`readdir` before comparing it with the index. Where HEAD holds a path in Unicode **decomposed**
form, `git status -uall` fails to match the index entry and reports a tracked, untouched file as
**untracked**.

`changes()` then produces one of two wrong artifacts, both silently:

- **An addition on a run where the worker touched nothing.** The `??` record is read as a new file
  and published.
- **The same file twice.** If the worker does edit it, `changes()` returns two entries for one file
  on disk — the decomposed path as `modified`, the composed path as `added` — and `carried()` puts
  both in `written`.

Reproduced on a plain `git clone`. Filed as
[#124](https://github.com/adamstallard/igor/issues/124), found by the bug-hunter run on
[#118](https://github.com/adamstallard/igor/pull/118).

**Nothing refuses it, and that is the point.** Both spellings are legitimate tree entries, so the
tree API is content and the artifact publishes. A reviewer sees a file added that nobody added, or
one file's content at two names, in a diff that otherwise looks ordinary. Compare the removal side,
where the same normalisation bug is caught immediately by `422 GitRPC::BadObjectState` refusing the
whole request.

**And no requirement forbids it.** `task-execution` says the artifact carries every change the
worker made, and — since #118 — that no removal is published for a path the base does not hold.
There is no statement that an **addition** may not be invented. That gap is not an oversight
anyone made deliberately: the removal half exists because a host error forced it, and the addition
half never had anything forcing it.

## What Changes

One **added** `task-execution` requirement: an artifact carries an entry only for a change the
worker actually made — no file it did not touch, and no two entries for one file on disk.

Nothing else changes. Every change a worker does make is carried exactly as it is today.

## Why a sibling requirement rather than one general rule

The obvious move is a single statement — *the artifact carries what the worker did and nothing
else* — subsuming both halves. Rejected: the two halves do not share a test.

The removal requirement asks **whether the tree being laid over holds the path**. That is exactly
right there, and wrong here: an invented addition names a path the base *does* hold, or holds under
a spelling that compares unequal. Asking that question of an addition answers nothing.

A single requirement covering both would therefore have to be phrased loosely enough to cover two
different tests, and a requirement that is looser than the thing it replaces is the failure this
repository has now made twice — stating a rule over rename *pairs* when the pairing was about to be
deleted, and scoping a flag by a target when the scope could not be decided. Two requirements, two
criteria, cross-referenced.

## Impact

- An artifact stops being able to carry a file nobody edited. Today nothing prevents it and nothing
  reports it.
- No currently-correct run changes: the requirement constrains only entries that should not exist.
- The fix has a real choice in it — see `design.md` — and the measurements that bear on it were
  taken on #118 rather than guessed.
