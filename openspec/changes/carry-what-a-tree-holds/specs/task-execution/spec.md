## ADDED Requirements

### Requirement: An artifact carries a changed path as the tree holds it

The artifact SHALL represent each changed path as `git add` into the Igor's own index stores it,
whatever kind of entry it is: a regular file, text or not, by the blob staging stores, a symbolic
link by its target, and a submodule by the commit its gitlink names in that index. A nested
repository with no gitlink, the one kind no tree entry represents, SHALL be refused as *A path
execution cannot read is never silently omitted* refuses, and named as a nested repository.

#### Scenario: A symbolic link the tree holds

- **WHEN** a changed path is a symbolic link
- **THEN** the artifact carries it as a link to the same target
- **AND** the target is not followed, so a link to a missing path is carried rather than skipped

#### Scenario: A submodule carried through a resolution

- **WHEN** the base changes the commit a submodule names and a resolution is published
- **THEN** the artifact carries the submodule at the commit its gitlink names in the index
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

- **WHEN** a changed path is a nested repository with no gitlink
- **THEN** it is refused as a path execution cannot read, and the refusal names the path and the
  kind `nested repository`

#### Scenario: An ordinary text change is unaffected

- **WHEN** every changed path is a regular file holding text, stored through no filter
- **THEN** the artifact is what it was before this change
