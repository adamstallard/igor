## ADDED Requirements

### Requirement: An artifact carries a changed path as the tree holds it

Where execution reads a changed path out of the checkout, the artifact SHALL represent it as the
tree holds it, whatever kind of entry that is — a regular file, text or not, by the bytes git
stores for it, a symbolic link by its target, and a submodule by the commit it names. Where a changed path is of a kind the artifact cannot
represent, execution SHALL refuse to publish the artifact and name the path, rather than publish
something that differs from what the tree holds.

#### Scenario: A symbolic link the tree holds

- **WHEN** a changed path is a symbolic link
- **THEN** the artifact carries it as a link to the same target
- **AND** the target is not followed, so a link to a missing path is carried rather than skipped

#### Scenario: A submodule carried through a resolution

- **WHEN** the base changes the commit a submodule names and a resolution is published
- **THEN** the artifact carries the submodule at the commit the tree holds
- **AND** no removal of it is published

#### Scenario: A file whose bytes are not text

- **WHEN** a changed path holds bytes that are not valid UTF-8
- **THEN** the artifact carries those bytes
- **AND** no replacement character reaches the published content

#### Scenario: A checkout a clean filter rewrote

- **WHEN** a changed path is a regular file the repository stores through a clean filter
- **THEN** the artifact carries the content git stores for it, not the bytes in the checkout
- **AND** a path the worker did not edit contributes no change to the artifact

#### Scenario: A kind that cannot be represented

- **WHEN** a changed path is of a kind the artifact cannot carry
- **THEN** nothing is published, and the refusal names the path and its kind

#### Scenario: An ordinary text change is unaffected

- **WHEN** every changed path is a regular file holding text
- **THEN** the artifact is what it is today
