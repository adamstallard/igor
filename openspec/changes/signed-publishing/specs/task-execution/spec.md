## ADDED Requirements

### Requirement: A commit is signed by bug-hunter and the prose pass before it is committed

Before `produce()` commits a worker's change, the model steps for the skills the role lists
SHALL run in the working tree, with its changes staged. Each runs only where the role's
`skills` lists it (signed-publishing, *Igor verifies what each skill in a role's list
requires*); a role that lists neither commits as it does without this capability.

1. **Bug-hunter**, where the role lists `bug-hunter`, in its caller-commits mode, SHALL return `Bug-hunter:` and, unless it
   skipped at triage, `Bug-hunter-Tree:` over the tree it reviewed.
2. **The prose pass**, where the role lists `prose`, SHALL rewrite the docs and comments the change touches, write the commit
   message, run `prose check` over the staged tree and that message, and return the
   `Prose: ✓ <tree>:<message>` trailer. The message's subject SHALL be the issue title, and its
   body SHALL explain the change and end with `Closes #N`.

If both run and the prose pass changes a file after bug-hunter signed its tree, bug-hunter
SHALL run once more to sign the new tree.

`produce()` SHALL commit only when all of these hold for the steps that ran:

- the tree it uploads equals every signed tree;
- where the prose pass ran, `prose verify-staged` accepts the `Prose:` trailer against that
  tree and the message, and the subject equals the issue title.

A failure SHALL go back to the step that signed, as the signed-publishing capability requires.
The commit SHALL carry the message, then the `Bug-hunter:`, `Bug-hunter-Tree:` and `Prose:`
trailers of the steps that ran. Merge commits carry none of these trailers.

#### Scenario: A signed commit is committed with its trailers

- **WHEN** a role lists `prose` and `bug-hunter`, both signed trees equal the uploaded tree,
  the trailer verifies, and the subject is the issue title
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

For a role whose `skills` lists `prose`, the prose pass SHALL write the pull request description for a reviewer and sign it with
`prose sign`. The code that creates or edits the pull request SHALL run `prose verify-post` on
the description first, as the signed-publishing capability requires.

The separate change `review-evidence` (#190) has Igor's code append an evidence section to
the pull request body, starting at the marker `<!-- igor:evidence -->`. The code assembles that
section from its own record of the run, so it is not signed and is not part of the description.
#190 builds the section when the pull request is opened and replaces it on each later push.

The description is everything in the body before the marker, apart from the whitespace that
separates it from the marker. Where there is no marker, because #190 has not shipped, the
description is the whole body. The description SHALL be exactly the signed text, footer
included, and the code SHALL NOT cut it: the 700-character cap (`PR_BODY_LIMIT`) on the
worker's own summary does not apply to it.

The description SHALL describe the pull request as it stands. When Igor pushes another commit
to the pull request, the description SHALL be rewritten, signed again, and verified before it
replaces the old one. Replacing the description leaves the evidence section to #190.

#### Scenario: A signed description is published

- **WHEN** the prose pass returns a description whose footer verifies
- **THEN** the pull request is created with a body whose part before `<!-- igor:evidence -->`,
  or whole body where there is no marker, is exactly that description
- **AND** anything from the marker on is the evidence section Igor's code assembled, not signed

#### Scenario: The description follows the pull request

- **WHEN** Igor pushes a follow-up commit to its pull request
- **THEN** the description is rewritten, signed and verified before it is replaced
