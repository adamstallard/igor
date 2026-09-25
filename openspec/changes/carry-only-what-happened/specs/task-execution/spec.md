## ADDED Requirements

### Requirement: The artifact carries no change the worker did not make

An artifact SHALL carry an entry only for a change the worker actually made. A file the worker
did not touch SHALL NOT appear in it, and one file on disk SHALL NOT produce two entries.

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

- **WHEN** reading the working tree offers a change to a file the worker did not edit, create or
  remove
- **THEN** the artifact carries no entry for it

#### Scenario: One file on disk, one entry

- **WHEN** one file on disk is reported by two records that differ only in how its name is spelled
- **THEN** the artifact carries a single entry for it
- **AND** the content published is what that file holds

#### Scenario: A run in which the worker changed nothing

- **WHEN** a worker edits, creates and removes nothing
- **THEN** no artifact is published, rather than one carrying entries nobody made

#### Scenario: Changes the worker did make are unaffected

- **WHEN** a worker edits, creates or removes files
- **THEN** every one of those changes is carried, as it is today
