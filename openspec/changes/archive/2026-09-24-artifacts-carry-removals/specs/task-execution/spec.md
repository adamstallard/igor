## ADDED Requirements

### Requirement: The artifact carries every change the worker made, including removals

An artifact SHALL carry every change execution read out of the working tree — files added,
files modified, and files removed. A removal SHALL NOT be dropped, and a change consisting only
of removals SHALL be published rather than refused.

An artifact that carries the edits and drops the removals is worse than one that is not
published at all: it looks complete to a reviewer and is not. A refactor still has the module
it removed; a rename has the file in two places.

The limit this replaces was discovered after the worker had run, which is what made it
expensive — a deletion-shaped task spent a whole run to learn it could not be published.

Whether the artifact is being opened or brought up to date makes no difference: both build
their commit from the base tree, and a removal is an entry in that tree with nothing behind it.

#### Scenario: A removal alongside edits

- **WHEN** a worker edits some files and removes others
- **THEN** the artifact carries both, and the removed files are gone from it
- **AND** nothing is refused

#### Scenario: A change that is only removals

- **WHEN** every change a worker made is a removal
- **THEN** the artifact is published
- **AND** the run is not refused for having produced no edits

#### Scenario: A rename leaves no duplicate

- **WHEN** a worker renames a file
- **THEN** the artifact carries the new path and no longer carries the old one
