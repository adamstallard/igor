## ADDED Requirements

### Requirement: A commit is signed by bug-hunter and the prose pass before it is committed

Before `produce()` commits a worker's change, two model steps SHALL run in the working tree,
with its changes staged:

1. **Bug-hunter**, in its caller-commits mode, SHALL return `Bug-hunter:` and, unless it
   skipped at triage, `Bug-hunter-Tree:` over the tree it reviewed.
2. **The prose pass** SHALL rewrite the docs and comments the change touches, write the commit
   message, run `prose check` over the staged tree and that message, and return the
   `Prose: ✓ <tree>:<message>` trailer. The message's subject SHALL be the issue title, and its
   body SHALL explain the change and end with `Closes #N`.

If the prose pass changes a file after bug-hunter signed its tree, bug-hunter SHALL run once
more to sign the new tree.

`produce()` SHALL commit only when all of these hold:

- the tree it uploads equals every signed tree;
- `prose verify-staged` accepts the `Prose:` trailer against that tree and the message;
- the subject equals the issue title.

A failure SHALL go back to the step that signed, as the signed-publishing capability requires.
The commit SHALL carry the message, then the `Bug-hunter:`, `Bug-hunter-Tree:` and `Prose:`
trailers, then `Co-Authored-By:` naming the model. Merge commits carry none of these trailers.

#### Scenario: A signed commit is committed with its trailers

- **WHEN** both signed trees equal the uploaded tree, the trailer verifies, and the subject is
  the issue title
- **THEN** `produce()` commits the message with the trailers appended

#### Scenario: A tree mismatch refuses the commit

- **WHEN** the tree `produce()` uploads differs from a signed tree
- **THEN** nothing is committed
- **AND** the step that signed that tree runs again

#### Scenario: A message mismatch refuses the commit

- **WHEN** the message differs from the one `prose check` signed
- **THEN** nothing is committed
- **AND** the prose pass receives the message back with the reason

#### Scenario: The subject must be the issue title

- **WHEN** the message's subject differs from the issue title
- **THEN** nothing is committed
- **AND** the prose pass receives the message back with the reason

#### Scenario: Bug-hunter signs again after the prose pass edits a file

- **WHEN** the prose pass changes a file after bug-hunter signed its tree
- **THEN** bug-hunter runs once more and signs the new tree before anything is committed

#### Scenario: Merge commits carry no trailers

- **WHEN** Igor merges the base into an artifact's branch
- **THEN** the merge commit carries no `Bug-hunter:` or `Prose:` trailer

### Requirement: The pull request description is written for a reviewer and signed

The prose pass SHALL write the pull request description for a reviewer and sign it with
`prose sign`. The code that creates or edits the pull request SHALL run `prose verify-post` on
the description first, as the signed-publishing capability requires.

The description SHALL describe the pull request as it stands. When Igor pushes another commit
to the pull request, the description SHALL be rewritten, signed again, and verified before it
replaces the old one.

#### Scenario: A signed description is published

- **WHEN** the prose pass returns a description whose footer verifies
- **THEN** the pull request is created with exactly that description

#### Scenario: The description follows the pull request

- **WHEN** Igor pushes a follow-up commit to its pull request
- **THEN** the description is rewritten, signed and verified before it is replaced
