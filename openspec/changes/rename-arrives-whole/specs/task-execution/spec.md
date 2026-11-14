## ADDED Requirements

### Requirement: A path execution cannot read is never silently omitted

Where a path the worker added or modified, which the working tree still holds, cannot be read,
execution SHALL publish nothing for that run, whatever this capability's rename and removal
requirements publish, and SHALL hand the item off naming the path. Where the claim was lost, the
loss rules SHALL govern, their message naming the path. The path SHALL be named in a form markup in
it cannot alter, and recorded among what the run changed. A path the worker removed SHALL NOT count
as unreadable.

#### Scenario: A rename whose destination cannot be read

- **WHEN** a worker renames a file and the destination cannot be read from the working tree
- **THEN** nothing is published
- **AND** the refusal names the path that could not be read
- **AND** the item is handed off

#### Scenario: The removal of a rename's source does not reach the artifact alone

- **WHEN** a worker renames a file, so that the source's removal is among the run's changes, and
  the destination cannot be read
- **THEN** no artifact carries the source's removal

#### Scenario: An addition that cannot be read

- **WHEN** a worker adds a file that cannot be read from the working tree
- **THEN** nothing is published, and the refusal names the path

#### Scenario: A removal is not a path that cannot be read

- **WHEN** a worker deletes a path, or deletes an unmerged path to accept a conflicted deletion
- **THEN** this requirement refuses nothing for that path
- **AND** the removal is handled by the requirements on removals

#### Scenario: An unmerged path still present is not read as a removal

- **WHEN** a worker resolves a conflicted path and leaves it in the working tree unreadable
- **THEN** nothing is published, and the refusal names the path
- **AND** no removal of it is published

#### Scenario: A refused run still says what it changed

- **WHEN** a run is refused because a path cannot be read
- **THEN** the recorded outcome names that path among what changed

#### Scenario: A killed run still names the unreadable path

- **WHEN** a worker is killed for a limit after changing a path that cannot be read
- **THEN** the recorded outcome names that path among what changed

#### Scenario: A lost claim names the unreadable path

- **WHEN** the claim is lost during a run that changed a path that cannot be read
- **THEN** the run does what a loss requires
- **AND** its message names the path it could not read

#### Scenario: A path holding a backtick is named exactly

- **WHEN** the path that cannot be read holds a backtick or other markdown
- **THEN** the handoff names the path exactly, and nothing in it renders as markup

#### Scenario: Every changed path readable

- **WHEN** every path a change touches can be read
- **THEN** the artifact carries them all, as it does today
