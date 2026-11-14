# Design

The requirement says an artifact carries a changed path as the tree holds it. Four things about
*how* have more than one defensible answer.

## Accuracy, stated over what the tree holds

Two requirements in force bound what the artifact carries.
*The artifact carries every change the worker made, including removals* says nothing may be absent,
and *no removal is published for a path the base does not hold* says nothing may be invented.
Neither says that what is carried must be **accurate**. Four filed defects fall in that gap:

- a submodule is read as a deletion;
- a rename whose new path is a symbolic link to a missing file cannot read that path, so the
  artifact publishes the old path's removal and nothing in its place;
- a binary file is published with replacement characters in place of its bytes;
- when the base branch changes one of these paths, every conflict resolution is refused, because
  the tree that publishing builds cannot hold that kind of entry.

Execution checks the requirements in force against the changes it read. `readFile` throws on such
a path, so execution never reads it, and neither requirement sees it. This requirement is
therefore stated over what the git tree holds, not over what execution managed to read.

A git tree can already hold every one of these kinds. Mode `100644` is a regular file, `100755` an
executable, `120000` a symbolic link whose content is its target, and `160000` a submodule naming a
commit. The publishing code does not turn them into plain text files; the read does.

A file under a filter belongs with these kinds, although it looks ordinary: its mode is `100644`,
it is valid text, and `git status` shows nothing. Git runs a clean filter when it stores a file,
and the matching smudge filter when it checks one out. `core.autocrlf` on the host, an `eol=` or
`text=auto` attribute in the repository, an `ident` attribute on the path, or any configured
filter does this, so the checked-out bytes differ from the blob the commit names. Publishing the
checked-out bytes puts the smudged copy in the artifact, and a file nobody edited arrives with
every line changed. Every case above is the same mistake: taking the checkout for what the tree
holds. The completed change `guard-silent-reverts` closes the same mistake in its own check, which
had compared a digest of the checkout with a blob name.

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
- a **submodule** has no content at all: it is the commit id its gitlink names in the index. The
  Igor works in a clone of its own, apart from the worker's process, and that clone never checks
  a submodule out, so there is no submodule checkout to read
- a **deletion** already carries `content: ''`, a sentinel the shape tolerates

Three shapes, and the choice is not obvious:

- **Widen `content` to `string | Buffer`.** Smallest diff. Every consumer must then ask which it
  holds, and the ones that forget get the wrong answer silently — `.length` and `+` both work on
  either. Rejected, because nothing in the type forces a consumer to ask.
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
is a gitlink. The mode comes from the Igor's own index after staging (*How the content git stores
is obtained*, below), where each staged path has one entry with its mode.

That index read must not reintroduce what has already been paid for twice in this file: the
read is byte-exact on names, and it must not fold a rename, which is why `changes()` passes
`--no-renames`. An index read that disagrees with the porcelain read about either would be worse than
the defect it fixes.

## What the comparison does with a submodule

`undone()` compares content to decide whether a base change was reverted. A submodule has no
content, so the comparison for one is between commit ids, and "the same blob on both sides is a
mode change" — the skip that is already load-bearing there — has no analogue.

This is the part most likely to be got wrong quietly, because a gitlink comparison that always
returns *equal* would suppress a real revert rather than invent one, and no test that does not
specifically bump a submodule would notice.

## How the content git stores is obtained

A filter makes the checked-out bytes differ from the stored blob, so the read asks git rather than
opening the file. It asks the way staging does: the Igor adds each changed path to the index of its
own clone with `git add`, and reads each entry's blob and mode back from that index. A regular file
is staged only after whatever checks are in force on files the Igor reads from the worker's tree:
[#175](https://github.com/adamstallard/igor/pull/175) requires each to be opened without following
a symbolic link, and read only if it is a regular file with a hard-link count of one. A symbolic
link is staged as a link, its target read with `readlink`, and a submodule's gitlink is staged from
the index, never by entering its directory.

`git hash-object --path` was the alternative, and it publishes the wrong bytes in a case
`guard-silent-reverts` measured. On a repository that added `* text=auto` without `git add
--renormalize`, some stored blobs still hold CRLF. `git add` sees that the index entry already holds
CRLF and leaves it unnormalized; `hash-object` has no index entry to consult and normalizes, so it
gives a different blob from the stored one (`guard-silent-reverts`'s design.md: blob and raw bytes
`cd74300c`, filtered `c66294bf`). `git add` keeps the stored form for such a path, so a one-line edit does not publish a
whole-file renormalisation, and a path the merge brought in that the worker never touched stages
to the blob already there. Staging also gives an unmerged path one entry, so the read never picks
among conflict stages. And it builds the tree that
[#153](https://github.com/adamstallard/igor/pull/153) signs, since #153 signs `git write-tree` of
the Igor's own index, so what is published is what was signed.

No filed defect is behind the filter case, so the test constructs it: `* text=auto eol=crlf` in a
repository's own `.gitattributes` travels with the clone and needs nothing of the host. No test on
`main` builds one; task 6.7a adds it, and task 3.7 the CRLF-stored case for an edited path and an
untouched one.

## Doing §8 item 12, and retiring §6.7.3

`docs/architecture.md` §6.7.3 says a binary is corrupted rather than dropped, *"known, and
deliberately unguarded"*, and §8 item 12 lists the fix as agreed in principle and not scoped, with
the reason it waited: it *"needs a role that can touch one."* That condition has not changed:
nothing in the shipped `commands` list, the commands a worker may run, makes a worker more likely
to edit a binary than it was.

What has changed is that three other defects, #134, #127 and #115, share the cause, so the work is no longer weighed
against one hypothetical. It is done now because it is no longer its own change.

§6.7.3 should be rewritten rather than deleted when this lands: what it records about *why*
reading as `utf8` produces a plausible wrong file is the clearest statement of the hazard anywhere
in the repository, and the next person to touch the read should still find it.

## The refusal for a nested repository is #120's

A nested repository is a path `readFile` cannot read, so
[#120](https://github.com/adamstallard/igor/pull/120)'s *A path execution cannot read is never
silently omitted* refuses it, hands the item off, follows the in-force rules for a run whose claim
on its item was lost, and records the path. This change only names the kind, and lands after #120
(task 8.3). #175's *A changed nested repository with working content SHALL stop the run* states
the same refusal again; dropping that restatement is #175's to do.

## Open Questions

- **Which configuration defines a filter.** "The blob git would store" depends on which
  configuration git reads. #175 runs git with `GIT_CONFIG_GLOBAL=/dev/null` and runs no filter the
  configuration of the service user, the account the Igor runs as, defines, so `core.autocrlf` on the host stops applying and a file
  stored through Git LFS becomes its pointer; #175's design asks this change whether it expects
  that. Whether only the repository's own `.gitattributes` counts is for this change's authors and
  #175's to settle. The case where a filter such as LFS would publish a pointer in place of
  content needs Adam's decision as well, since nobody reviewing the artifact would notice.
- **Running a filter the worker can name, before #175.** A filter driver's command comes from git
  configuration, and on `main` the worker can write its tree's `.git/config` and `.gitattributes`.
  Staging through `git add` runs that command as the Igor, whose environment holds the App's
  private key, until #175 runs the worker as a separate user and stops reading that configuration.
  Which filters the read runs before #175 is built is for this change's authors and Adam to
  decide, since a wrong answer would be invisible until a key leaked. One candidate answer: git's
  built-in `text`, `eol` and `ident` conversions only, and no driver program.
- **A submodule a resolution carries, against #125.** The submodule scenario carries a base bump
  the worker never touched, and #125's requirement says a path the worker did not touch does not
  appear in an artifact. Every base change a resolution carries meets the same wording, but this
  change is the first to make one a scenario.
  [#187](https://github.com/adamstallard/igor/pull/187) reads #125 the same way, against this
  scenario: it assumes that with #125 and this change, an artifact's paths are exactly the ones the
  worker changed. Which reading holds is for
  #125's, #187's and this change's authors to settle.
- **Declaring a revert of a submodule bump.** A genuine revert of a base submodule bump still has
  to be declarable, and a gitlink's base state is a commit. The in-force requirement says *"A
  declaration names one path and the base state it discards — the base's content for that path"*,
  and [#138](https://github.com/adamstallard/igor/pull/138)'s authorisation names a blob; neither
  can name a commit. Whether this change modifies the in-force requirement, or #138 covers it, is
  for this change's authors and #138's (task 5.5).
- **The link and gitlink rules, with #175.** #175 states *A changed gitlink SHALL be published as
  the commit it names* and *A changed link SHALL be published as a link*, the rule this requirement
  states; #175 builds after this change and should cite it rather than restate it. That is #175's
  to change.
