# Design

The requirement says a rename arrives whole or not at all. Two things about *how* had more than
one defensible answer.

## Refusing, rather than publishing without the rename

When the destination cannot be read, the change list can hold neither half instead of one. That
publishes the rest of the worker's output, leaves the file where it was, and loses nothing.

Rejected, on the project's own stated ground. *"An artifact that carries the edits and drops the
removals is worse than one that is not published at all: it looks complete to a reviewer and is
not"* — the harm named in the in-force requirement is **silent incompleteness**, and dropping both
halves is silently incomplete in exactly that way. It trades a destructive diff for a missing
change, and a reviewer cannot see either.

It is also the wrong response to what actually happened. The destination is a file the worker just
wrote, and execution could not read it. That is not a tidy edge case to route around; it is a
working tree execution does not understand. Publishing the parts it does understand, from a read
that already failed once, is how a subtler instance of this class arrives later.

Two weaker alternatives, for the record:

- **Emit the removal and record a warning.** Rejected: it still publishes a deletion of a file the
  worker meant to keep. A warning in a record nobody opens is what
  [#79](https://github.com/adamstallard/igor/issues/79) is filed about.
- **Refuse only where the unreadable path is a rename destination, and otherwise keep today's
  silent `continue`.** This was the first draft's scope and it is rejected: it depends on knowing
  which paths are halves of one change, which is exactly what #118 removes. See below.

## Stated over paths, not over renames

The first draft of this requirement said *a rename reaches the artifact whole or not at all*, and
described an ordering within a pair: the source's removal must not be emitted before the
destination has been read.

That was written against a model [#118](https://github.com/adamstallard/igor/pull/118) removes.
It switches `changes()` to `--no-renames`, so porcelain emits no `R` or `C` record, and its task
5.2 deletes `PAIRED`, `RENAME`, `indexOnly` and the `from`/`++i` pairing as unreachable. After that
a rename is an unrelated `D` and `A`, and the failure survives by a route the pairing language
cannot describe — the removal is emitted, the addition's read throws, the artifact carries a lone
deletion. The scope clause was worse than the rest: excluding "an unreadable file that is not half
of a rename" is undecidable once nothing knows the two records are halves of anything.

So it is phrased over paths. **A requirement states what must be true of the artifact, not what the
parser currently looks like**, and the parser is under active change in two open pull requests.
Phrased over paths it is correct before #118 and after it, and it needs no amendment when the
pairing goes.

The widening is real and is accepted rather than incidental: an addition that cannot be read now
refuses too, where today it is skipped by the same bare `continue`. That is the same failure with
one path instead of two, and carving it out would have reintroduced the dependency on knowing which
paths belong to each other.

## The mechanism, which the requirement does not fix

Read every path a change touches before committing any of it to the change list, so a throw leaves
nothing behind. Whether that is a read-first ordering or a buffer flushed on success is an
implementation choice; the invariant is that a failure cannot leave a partial change already
emitted. The bug being fixed *is* an early emit surviving a path that forgot about it, and this
function has three `continue`s in one catch.

## Not settled here: why the destination is unreadable

A dangling symlink is the cause reachable today, because `readFile` follows the link. Reading the
link itself rather than following it would publish it correctly — a tree can hold a symlink as mode
`120000` with the target as content — and that is very likely a better answer for that specific
cause. It is a different change: this one is about what happens when a path cannot be read, not
about reducing the set of paths that cannot be.

## Not a design decision: which failures count as unreadable

The requirement says "cannot be read" and names no errno. A dangling symlink is the case reachable
today, reached through `git mv` on a link whose target is gone. Enumerating causes would date the
requirement against a filesystem rather than state what must be true of the artifact.

## Why this is not folded into one guard with #68 and #116

The three are one class — *the published artifact does not match what the worker did, and review
cannot see it* — and three instances has twice been this project's argument for treating the shape
rather than the instance.

It was considered and does not work here. The natural guard is *compare what is published against
what the worker did, before publishing*, and the only thing available to compare against is
`changes()` output. That is the very thing
[#116](https://github.com/adamstallard/igor/issues/116) corrupts: a deletion that never reaches
`git status` never enters the list, so the guard would compare a list missing a removal against a
tree built from that same list, and find them in agreement. Catching #116 means comparing against
the working tree itself, which is a different and much larger mechanism than any of the three
fixes.

[#103](https://github.com/adamstallard/igor/pull/103) is the nearest thing to the general guard and
is narrower than it looks: it is scoped to conflict resolutions and compares what the **base**
changed against what the resolution publishes. Neither this instance nor #116 falls inside it.

So: three routes, three fixes, and the class recorded here rather than pursued.
