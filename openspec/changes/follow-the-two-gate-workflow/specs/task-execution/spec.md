## MODIFIED Requirements

### Requirement: The artifact carries every change the worker made, including removals

An artifact SHALL carry every change execution read out of the working tree — files added,
modified and removed. A removal SHALL NOT be dropped, and a change consisting only of removals
SHALL be published rather than refused.

The one exception is gate one of the two-gate workflow, its revisions included, where the
artifact SHALL carry only changes under `openspec/changes/**` and SHALL name each change it did
not carry, in its body or, for a revision, in the reply.

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

#### Scenario: A gate-one revision is confined too

- **WHEN** a revision of a gate-one artifact changes a path outside `openspec/changes/`
- **THEN** the revision does not carry that change, and its reply names it

#### Scenario: Gate one's exception is named, not silent

- **WHEN** a gate-one worker changes a path outside `openspec/changes/`
- **THEN** the artifact does not carry that change
- **AND** the artifact's body names it as not carried
