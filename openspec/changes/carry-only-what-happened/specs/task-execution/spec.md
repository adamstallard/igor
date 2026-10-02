## ADDED Requirements

### Requirement: The artifact carries no change the worker did not make

An artifact SHALL carry an entry only for a change the worker actually made. A path the worker
did not touch SHALL NOT appear in it, and one path on disk SHALL NOT produce two entries.

**Path, not file.** A tree holds entries that are not regular files — a submodule is a gitlink, a
directory on disk and a commit entry in the tree. Phrased over files, this requirement would be
read at archive time as not reaching one
([#127](https://github.com/adamstallard/igor/issues/127): an unmerged submodule is reported as a
deletion because reading it throws, so the artifact drops it on a run where the worker touched
nothing). That is the failure this requirement is about, reached by something that is not a file.

**This is the other half of a symmetry that is currently one-sided.** *The artifact carries every
change the worker made, including removals* says nothing may be lost, and *No removal is published
for a path the base does not hold* says a removal may not be invented. Nothing says an **addition**
may not be invented, and the reason is that nothing ever forced the question: the tree API refuses
an invented removal with `422 GitRPC::BadObjectState` and refuses the whole request, while an
invented addition publishes cleanly. The failure that shouts got a requirement; the failure that is
silent did not.

**Stated over what the worker did, rather than over what the base holds.** The removal requirement
asks whether the tree being laid over holds the path, which is the right question there and the
wrong one here — an invented addition names a path the base *does* hold, or holds under a spelling
that compares unequal. The two halves need different tests, so they are two requirements rather
than one looser one.

**What makes it worth stating rather than leaving to the read.** An artifact carrying a file nobody
edited looks exactly like an artifact carrying a file somebody edited. There is no refusal, no
error and no second opinion: a reviewer sees a plausible diff and the work of deciding whether each
entry was real falls to them, one file at a time. That is the same property *"an artifact that
carries the edits and drops the removals is worse than one that is not published at all: it looks
complete to a reviewer and is not"* was written about, reached from the other direction.

#### Scenario: A file the worker did not touch

- **WHEN** reading the working tree offers a change to a path the worker did not edit, create or
  remove
- **THEN** the artifact carries no entry for it

#### Scenario: A path that is not a regular file

- **WHEN** a path the worker did not touch cannot be read because it is not a regular file — a
  submodule's gitlink being the case that reaches this
- **THEN** the artifact carries no entry for it, and no removal of it
- **AND** failing to read a path is not by itself evidence that the worker removed it

#### Scenario: One path on disk, one entry

- **WHEN** one path on disk is reported by two records that differ only in how its name is spelled
- **THEN** the artifact carries a single entry for it
- **AND** the content published is what that file holds

#### Scenario: A run in which the worker changed nothing

- **WHEN** a worker edits, creates and removes nothing
- **THEN** no artifact is published, rather than one carrying entries nobody made

#### Scenario: Changes the worker did make are unaffected

- **WHEN** a worker edits, creates or removes files
- **THEN** every one of those changes is carried, as it is today
