# Design

The requirement says an artifact carries only what the worker did. How to make that true has more
than one answer, and two of them have already been measured on
[#118](https://github.com/adamstallard/igor/pull/118).

## Where the normalisation is reconciled

The mismatch originates in `git status`: it precomposes the `readdir` name and compares it against
a decomposed index entry. Three places to answer it, with different blast radii.

- **Turn the platform's normalisation off for the status read** — `-c core.precomposeunicode=false`
  on `changes()`'s own `git status`. One flag, and it makes status report the bytes the index
  holds. The risk is that status is the primary read, so this changes what *every* consumer of
  `changes()` sees, not only the case in question. #118 took exactly this flag but on a *different*
  call — its `ls-tree` pathspec, where the comparison is status's bytes against HEAD's and the
  blast radius is one question.
- **Reconcile at the point of comparison** rather than at the read: treat two records as one file
  where their names normalise alike. Narrow, and it puts Unicode knowledge into a function whose
  whole design is to avoid decoding names at all — `statusRecords` reads bytes precisely so a name
  that is not valid UTF-8 survives.
- **Ask git which paths it already tracks**, by the same shape #118's removal check uses, and treat
  an `??` record naming a tracked path as not-new. This reuses a mechanism that exists rather than
  adding one, and it asks the requirement's own question — did the worker create this file? — but
  it costs a second read on runs that have untracked files, which is most of them.

**Not settled here.** Which of the three depends on a measurement nobody has taken: whether
`--porcelain=v2` distinguishes the case. #118 asked the equivalent question of the removal side and
the answer was **no** — v2 reports `100644` and the empty blob's sha for an intent-to-add path
rather than zeros — and the natural assumption was wrong there. It is worth measuring rather than
assuming here too, and `tasks.md` asks for it before the mechanism is chosen.

## Rejected: `git cat-file --batch-check -Z`

Byte-exact over stdin, so no pathspec and no normalisation, and it would remove the batching the
removal check needs. Measured on #118 and rejected there: `-Z` requires git 2.42, and a failure
escapes `execute` as a throw with no handoff note, so an older git fails every run that removes
anything. A deployment cliff for no behavioural difference.

Recorded here because it is the obvious answer to *both* halves of the normalisation problem, and
the reason it loses is the same on this side.

## Whether the two symptoms are one bug

They are, and the requirement treats them as one. A phantom addition on a run where nothing was
touched, and a duplicate entry on a run where something was, are the same record read the same
wrong way — the `??` for a path the index already holds. The second only looks different because a
real edit is present beside it. A fix that addresses one and not the other has misread the cause.
