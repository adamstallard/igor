## ADDED Requirements

### Requirement: An artifact carries a changed path as the tree holds it

Where execution reads a changed path out of the working tree, the artifact SHALL represent it as
the tree holds it, whatever kind of entry that is — a regular file by its content, a symbolic link
by its target, a submodule by the commit it names, and a file whose bytes are not text by those
bytes. Where a kind cannot be represented, execution SHALL refuse and name the path rather than
publish something that differs from what the tree holds.

**This is the third of three and the one that was missing.** *The artifact carries every change the
worker made, including removals* says nothing may be absent; *no removal is published for a path
the base does not hold* says nothing may be invented. Neither says what is carried must be
**accurate**, and four filed defects are that gap: a submodule read as a deletion, a symbolic link
whose unreadable destination publishes its source's removal alone, a binary published as
replacement characters, and a base change to any of them refusing every resolution because the
published tree cannot hold it.

**The reason none of those is caught by the requirements already in force** is that each turns on
what execution *read*. A path `readFile` throws on was never read, so a requirement about every
change read is satisfied by not reading it. That is why this one is stated over what the **tree
holds** rather than over what execution obtained.

**Faithfully, not merely loudly.** Refusing where a path cannot be carried is the safe half and it
is not sufficient: a base change to a symbolic link already refuses today, correctly, and a
repository holding one is simply unusable for conflict resolution. A requirement that only forbade
misrepresentation would leave that exactly as it is. What makes such a repository workable is
carrying the path, and the refusal is the floor beneath it rather than the answer.

**A tree can already hold all of these.** Mode `100644` is a file, `100755` an executable, `120000`
a symbolic link whose content is its target, and `160000` a submodule naming a commit. The
publishing path is not what flattens them; the read is.

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

#### Scenario: A kind that cannot be represented

- **WHEN** a changed path is of a kind the artifact cannot carry
- **THEN** nothing is published, and the refusal names the path and its kind

#### Scenario: An ordinary text change is unaffected

- **WHEN** every changed path is a regular file holding text
- **THEN** the artifact is what it is today
