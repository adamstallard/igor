## ADDED Requirements

### Requirement: A change is not published under a name that is not text

A filename is bytes. Where a changed file's name is not valid UTF-8, execution SHALL publish
nothing for that run, and SHALL hand off naming the file by the bytes git wrote rather than by
the spelling decoding left behind.

An artifact names a path as text, so a name that is not text has no faithful form in one.
Published at the decoded spelling, a modified file lands at a path no file on disk has — the
original is left untouched and the branch carries the file twice; a deletion removes nothing;
and two names differing only in the bytes that did not decode arrive as one path, so one
replaces the other or the host rejects the whole change. Each of those is a change that is
wrong rather than one that is missing, and nothing in the artifact tells a reader which file
was meant.

A name SHALL be judged by re-encoding the decoded name and comparing it to the bytes, and MUST
NOT be judged by searching the decoded name for the replacement character. A file may
legitimately be named with that character, and refusing it would take a working run away over
a name nothing is wrong with.

What the run changed SHALL still be recorded, and SHALL name such a file by its bytes there
too. A refusal that cannot say which file it refused is one nobody can act on.

#### Scenario: A file whose name is not text is not published under another one

- **WHEN** a run changes a file whose name is not valid UTF-8
- **THEN** nothing is published
- **AND** the handoff names the file by the bytes git wrote

#### Scenario: A deletion of such a name is not published either

- **WHEN** a run deletes a file whose name is not valid UTF-8
- **THEN** nothing is published, rather than a removal of a path that is not the file's

#### Scenario: A name that really contains the replacement character is published

- **WHEN** a run changes a file whose name is valid UTF-8 and contains U+FFFD
- **THEN** it is published as any other file is

#### Scenario: The run still says what it changed

- **WHEN** a run is refused publication over a name that is not text
- **THEN** the recorded outcome names every file the run changed
- **AND** it names the one that was not text by the bytes git wrote

#### Scenario: An ordinary run is unaffected

- **WHEN** every changed file's name is valid UTF-8
- **THEN** the run publishes as it did before
