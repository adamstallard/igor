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
  silent `continue`.** This is what the requirement says, and the scope is deliberate: an
  unreadable file that is not half of a pair is a separate question with its own answer, and
  widening this change to settle it would put a decision about every unreadable file inside a
  change about renames.

## Reading the destination before emitting the source

The mechanism has a choice: read the destination first and emit both, or buffer the source's
removal and flush it only once the destination is in hand.

They are equivalent in outcome; the first is preferred because it makes the invariant structural
rather than remembered. A buffered removal is correct only for as long as every path out of the
loop remembers to discard the buffer, and this function already has three `continue`s in one catch.
The bug being fixed *is* an early emit surviving a path that forgot about it.

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
