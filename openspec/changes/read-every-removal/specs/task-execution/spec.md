## ADDED Requirements

### Requirement: No removal is lost to a read that reports two changed paths as one

Execution SHALL read the working tree in a way that reports every changed path separately, and
SHALL NOT lose a removal because git paired it with another path. Where a worker removed a file,
that removal SHALL be read whatever else changed in the tree, and SHALL be carried into the
artifact.

Rename detection is what folds two paths into one. During a conflicted merge, a deletion the
worker made can be detected as the source of a rename whose destination is an unmerged path, and
the porcelain output then names only the unmerged path — with its own unmerged flags, not as a
rename — so the deletion is absent from the input rather than misread in it. Measured at roughly
one in a hundred conflicted merges.

**An incomplete read is not an excuse.** *"The artifact carries every change the worker made,
including removals"* is satisfied by carrying whatever execution read; this requirement says what
execution must be able to read, so a removal that never reached the record is a failure of this
requirement rather than a case the other one permits.

A removal lost this way is the most expensive thing that can go missing. The resolution's commit
names the base as a parent, so a file left in it is restored the moment the artifact merges, and
review sees a file that is still there rather than a change that is wrong.

Nothing downstream recovers it. A guard comparing what the base changed against what the
resolution publishes has no entry for a path the base never touched, and what the resolution
publishes is itself built from this read.

How the tree is read is not fixed here. What is fixed is that no changed path may be reported
only as part of another.

#### Scenario: A removal folded into a conflicted path is still read

- **WHEN** a worker resolving a conflict removes a file similar enough to a conflicted path that
  git reports only the conflicted path as changed
- **THEN** the removal is read
- **AND** the recorded outcome names it among the files the run changed

#### Scenario: The recovered removal reaches the artifact

- **WHEN** such a resolution is published
- **THEN** the artifact no longer carries the removed file
- **AND** merging the artifact does not restore it

#### Scenario: Nothing else in the loop would have caught it

- **WHEN** the folded removal is of a path the base never changed
- **THEN** the removal is still carried

#### Scenario: A rename is carried however git reports it

- **WHEN** a worker renames a file, whether git reports it as one record naming both paths or as
  a removal and an addition separately
- **THEN** the artifact carries the new path and no longer carries the old one

#### Scenario: An ordinary run is unaffected

- **WHEN** a run's changes involve no path git reports only as part of another
- **THEN** the artifact carries the same additions, modifications and removals it carried before

### Requirement: No removal is published for a path the base does not hold

An artifact SHALL carry a removal only for a path the tree it is laid over already holds.

**The base here is that tree**, and not the set of changes the base branch made — the branch head
a resolution commits onto, or the base branch a new artifact is cut from. *"A base change is
undone only where the resolution says so"* is about the second; this requirement is about the
first.

Where reading the working tree offers a removal of a path the base does not hold, execution SHALL
NOT publish it. Such a path is not a change the worker made: the run's own index brought it into
being — as the destination of a rename that was then moved again, or as a staged addition the
worker then deleted — and no tree the artifact is published against ever had it.

**This is the opposite half of the requirement above it.** That one says the read may not lose a
removal; this one says it may not invent one. A mechanism satisfying either by breaking the other
satisfies neither, and the two are stated separately so that a future read is measured against
both.

**The host refuses an invented removal outright.** Dropping a path the base tree does not hold
returns `422 GitRPC::BadObjectState`, and the refusal is of the whole tree request: nothing is
published, not even the changes that were correct. So this is not a tidiness rule about extra
entries. A single invented removal costs the run everything it produced, which is why the
obligation is stated rather than left to whichever mechanism reads the tree.

#### Scenario: A path only the run's own index ever held is not removed

- **WHEN** reading the working tree offers a removal of a path that is absent from the tree the
  artifact is published against, because the run's index brought that path into being
- **THEN** no removal of it is published
- **AND** the artifact is published, rather than the whole tree request being refused
- **AND** the removals of paths the base does hold are carried as before

#### Scenario: A rename moved on a second time removes the original and nothing else

- **WHEN** a worker moves a path the base holds, and then moves the result again, so that the
  intermediate name exists in no tree
- **THEN** the artifact no longer carries the original path
- **AND** the artifact carries the final path
- **AND** no removal is published for the intermediate name
- **AND** the artifact is published, rather than the whole tree request being refused

#### Scenario: A publish is not lost to a removal nobody asked for

- **WHEN** a run's changes include a removal of a path the base does not hold
- **THEN** the artifact is published, rather than the whole tree request being refused
- **AND** every change the worker made that the base can carry is in it
