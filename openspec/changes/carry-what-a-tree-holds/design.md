# Design

The requirement says an artifact carries a changed path as the tree holds it. Four things about
*how* have more than one defensible answer.

## Carrying, not merely refusing

The cheaper requirement is *never misrepresent*: refuse where a path cannot be carried, and leave
the set of carryable paths as it is. It is tempting because refusing is a smaller change and is
strictly safer.

**Rejected, because it does not fix the issue it would be filed under.**
[#134](https://github.com/adamstallard/igor/issues/134)'s symptom *is* a refusal — a correct, loud,
honest one. A requirement that only forbade misrepresentation would tell that code to keep doing
exactly what it does, and a repository holding a symbolic link would stay unusable for conflict
resolution. The same is true of a submodule the base bumps.

What the cheaper version would improve is [#67](https://github.com/adamstallard/igor/issues/67) and
the unreadable-path half of [#115](https://github.com/adamstallard/igor/issues/115), turning silent
corruption into loud refusal. Worth having, and not what these repositories need. Refusal is the
floor beneath this requirement rather than the answer to it.

## What `content: string` becomes

`ChangedFile` today is `{ path, content: string, kind, executable?, rawName? }`, and the kinds it
must now carry do not share a content type:

- a **regular file** is bytes, which may or may not be text
- a **symbolic link** is a target path, which is bytes that happen to be a name
- a **submodule** has no content at all — it is a commit id
- a **deletion** already carries `content: ''`, a sentinel the shape tolerates

Three shapes, and the choice is not obvious:

- **Widen `content` to `string | Buffer`.** Smallest diff. Every consumer must then ask which it
  holds, and the ones that forget get the wrong answer silently — `.length` and `+` both work on
  either. Rejected: this is the mistake the name side already made and fixed, where a `Buffer`
  decoded to a string lost bytes no filesystem could give back.
- **Discriminate on kind** — a union where a link carries a target, a submodule carries a sha, and
  a file carries bytes. Most honest, and it makes every consumer handle the cases or fail to
  compile. Largest diff, and it reaches `carried()`, `undone()`, the publish path and the handoff
  rendering.
- **Carry a mode beside the content**, leaving `content` a byte buffer for everything and making
  the mode say how to read it. Middle. Closest to what a git tree actually is, and the publish path
  already speaks in modes.

Not settled here. `tasks.md` asks for the shape to be chosen against the consumers rather than in
the abstract, because the cost is entirely in how many of them must change.

## Where the mode comes from

`git status --porcelain` reports flags, not modes: it will say a path was modified and not that it
is a gitlink. So the read needs a second source — `git ls-files -s`, or the `--raw` diff the
`guard-silent-reverts` work already runs, both of which give the mode on each side.

Whichever it is, it must not reintroduce what has already been paid for twice in this file: the
read is byte-exact on names, and it must not fold a rename, which is why `changes()` passes
`--no-renames`. A second read that disagrees with the first about either would be worse than the
defect it fixes.

## What the comparison does with a submodule

`undone()` compares content to decide whether a base change was reverted. A submodule has no
content, so the comparison for one is between commit ids, and "the same blob on both sides is a
mode change" — the skip that is already load-bearing there — has no analogue.

This is the part most likely to be got wrong quietly, because a gitlink comparison that always
returns *equal* would suppress a real revert rather than invent one, and no test that does not
specifically bump a submodule would notice.

## How the content git stores is obtained

A clean filter makes the checkout differ from the blob, so the read has to ask git rather than
open the file, and the options differ in cost and in what they leave behind.

`git hash-object -w --path <p> -- <p>` runs the filter and writes the result into the clone's
object database, and `git cat-file blob <sha>` then reads the bytes back. Two commands per changed
path and objects written into a tree that is about to be discarded, which is cheap, but it is two
spawns for every path whether or not any filter applies.

`git check-attr` and `git config` can say up front whether any filter is configured at all, which
would let the ordinary repository — no attributes, no `autocrlf` — keep the plain read it has
today and pay nothing. That is one question per clone rather than per path, at the price of a
second code path that only runs where filters exist, and so only gets exercised by a test that
configures one.

Asking git for the bytes unconditionally is the shape to prefer unless the per-path cost measures
badly, because a path that only runs under filters is a path that rots. Measure it against a
resolution touching a realistic number of files before choosing the conditional form.

This is also the one part of the requirement with no filed defect behind it, so it has no reported
symptom to reproduce. The test has to construct the condition: `* text=auto eol=crlf` in a
repository's own `.gitattributes` travels with the clone and needs nothing of the host, which
makes it the trigger to build on. `test/worktree.test.ts` already has one such test, written for
`guard-silent-reverts`.

## Retiring an accepted gap, not working around it

`docs/architecture.md` §6.7.3 and accepted-gap 12 say a binary is corrupted rather than dropped,
*"known, and deliberately unguarded"*, with the reason recorded: it *"needs a role that can touch
one."* That condition has not changed — nothing in the shipped `commands` list makes a worker more
likely to edit a binary than it was.

What has changed is that three other defects turn out to share the cause, so the work is no longer
being weighed against one hypothetical. The gap is retired because the reason for accepting it was
that it was not worth its own change, and it is no longer its own change.

The section should be rewritten rather than deleted when this lands: what it records about *why*
reading as `utf8` produces a plausible wrong file is the clearest statement of the hazard anywhere
in the repository, and the next person to touch the read should still find it.
