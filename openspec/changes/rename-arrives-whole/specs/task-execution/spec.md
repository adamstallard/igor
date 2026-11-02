## ADDED Requirements

### Requirement: A path execution cannot read is never silently omitted

Where execution reads the working tree to build an artifact and a changed path cannot be read, it
SHALL NOT publish an artifact that omits that path while carrying the rest. It SHALL refuse, and
SHALL name the path it could not read.

**The failure this prevents is a change arriving in pieces.** A rename is the case that reaches it
today: the source's removal and the destination's content are two paths for one change, and where
the destination cannot be read the artifact publishes the removal alone. The diff then reads as a
deliberate deletion of a file the worker meant to keep under a new name. Nothing downstream
objects — the source path is in the base tree, so removing it is the case the tree API accepts
rather than the one it rejects with 422.

**It is stated over paths rather than over renames on purpose.** Whether a rename reaches execution
as one record or as an unrelated removal and addition is a detail of how the working tree is read,
and it is a detail that changes: a read that folds renames into one record and a read that does not
are both legitimate, and the artifact must be whole under either. A requirement phrased as *both
halves of a pair* holds only for as long as pairs exist in the code. A requirement phrased over
paths holds regardless, and covers the same failure reached by an addition alone.

**Refused rather than published without the path.** Omitting the unreadable path and publishing the
rest loses nothing on disk and is therefore tempting. It is rejected on the project's own ground:
*"an artifact that carries the edits and drops the removals is worse than one that is not published
at all: it looks complete to a reviewer and is not."* The harm named there is silent
incompleteness, and quietly dropping a path is silently incomplete in exactly that way. A read that
failed on a file the worker just wrote is also a working tree execution does not understand, and
publishing the parts it believes it understands is how a subtler instance arrives later.

This composes with *The artifact carries every change the worker made, including removals* and does
not weaken it. That requirement governs every change execution **read**, and a removal it read is
still never dropped. This one governs the paths it could not read, which that requirement does not
reach.

#### Scenario: A rename whose destination cannot be read

- **WHEN** a worker renames a file and the destination cannot be read from the working tree
- **THEN** nothing is published
- **AND** the refusal names the path that could not be read
- **AND** the item is handed off rather than marked complete

#### Scenario: The removal of a rename's source does not reach the artifact alone

- **WHEN** a rename's source removal is known and its destination cannot be read
- **THEN** the artifact carries neither, whether the two arrive as one record or as two

#### Scenario: An addition that cannot be read

- **WHEN** a worker adds a file that cannot be read from the working tree
- **THEN** nothing is published, and the refusal names the path

#### Scenario: Every changed path readable

- **WHEN** every path a change touches can be read
- **THEN** the artifact carries them all, as it does today
