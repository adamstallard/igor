## ADDED Requirements

### Requirement: A rename reaches the artifact whole or not at all

Where execution reads a rename out of the working tree, the artifact SHALL carry both halves or
neither. Where either half cannot be read, execution SHALL NOT publish the other, SHALL refuse the
publish, and SHALL name the path it could not read.

**The source's removal is the half that escapes.** A rename is read as a pair, and the source's
removal is available before the destination's content is. Emitting it as soon as it is known means
a destination that cannot be read leaves a removal already committed to the change list, with the
failure reaching nothing. The removal SHALL NOT be emitted before the destination has been read.

**Nothing makes the result visible downstream, which is why it is refused here.** The source path
is in the base tree — it is a rename of a tracked file — so removing it is the case the tree API
accepts rather than rejects. No error arrives from publishing. The artifact carries a clean removal
with no addition, and the diff reads as a deliberate deletion: the worker meant to keep the file
under a new name, and review sees it deleted.

**Refused rather than published without the rename.** Dropping both halves would leave the file
where it was and publish the rest, which loses nothing — but it publishes an artifact that does not
carry a change the worker made, silently, and *"an artifact that carries the edits and drops the
removals is worse than one that is not published at all: it looks complete to a reviewer and is
not"* is the reason the in-force requirement exists. A read that failed on a file the worker just
wrote is also a state execution does not understand, and publishing the parts it does understand
is how a subtler version of this arrives later.

This composes with *The artifact carries every change the worker made, including removals* and does
not weaken it. That requirement governs every change execution **read**, and a removal it read is
still never dropped. This one governs the case where one half of a pair was read and the other
could not be.

#### Scenario: A rename whose destination cannot be read

- **WHEN** a worker renames a file and the destination cannot be read from the working tree
- **THEN** nothing is published
- **AND** the refusal names the path that could not be read
- **AND** the item is handed off rather than marked complete

#### Scenario: The source's removal does not escape early

- **WHEN** a rename's source removal is known before its destination has been read
- **THEN** the removal does not enter the change list until the destination has been read
  successfully

#### Scenario: A rename whose halves both read

- **WHEN** a worker renames a file and both halves are readable
- **THEN** the artifact carries the removal of the old path and the addition of the new one, as it
  does today

#### Scenario: An unreadable file that is not half of a rename

- **WHEN** a file that is not part of a rename cannot be read
- **THEN** this requirement does not apply, and the existing handling stands
