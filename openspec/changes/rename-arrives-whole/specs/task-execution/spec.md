## ADDED Requirements

### Requirement: A path execution cannot read is never silently omitted

Where execution reads the working tree to build an artifact and a changed path cannot be read, it
SHALL NOT publish an artifact that omits that path while carrying the rest. It SHALL refuse, and
SHALL name the path it could not read.

The requirement *The artifact carries every change the worker made, including removals* governs
every path that execution read, and this one does not weaken it. This one governs the paths that
execution could not read, which that requirement does not reach.

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
