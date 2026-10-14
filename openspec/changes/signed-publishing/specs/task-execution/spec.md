## ADDED Requirements

### Requirement: A commit is signed by bug-hunter and the prose pass before it is committed

Before Igor commits a worker's change, whether `produce()` opens a pull request with it or, under
the two-gate workflow (#150), `commitOnBranch` pushes gate two's implementation or a revision onto
an existing pull request, the model steps for the skills the role lists
SHALL run in the working tree, with its changes staged. Each runs only where the role's
`skills` lists it (signed-publishing, *Igor verifies what each skill in a role's list
requires*); a role that lists neither commits as it does without this capability.

1. **Bug-hunter**, where the role lists `bug-hunter`, in its caller-commits mode, SHALL return `Bug-hunter:` and, unless it
   skipped at triage, `Bug-hunter-Tree:` over the tree it reviewed.
2. **The prose pass**, where the role lists `prose`, SHALL rewrite the docs and comments the change touches, write the commit
   message, run `prose check` over the staged tree and that message, and return the
   `Prose: ✓ <tree>:<message>` trailer. The message's subject SHALL be the issue title, with any
   closing keyword in it dropped (GitHub's `close`, `fix` or `resolve` in any form, followed by an issue reference, as in a title like `Login fails (fixes #12)`), and its body SHALL explain the change. The body SHALL
   end with `Closes #N` on any commit of a role not using the two-gate workflow (#150), and
   under #150 on every gate-two commit,
   the implementation and each revision after it. Gate one's commits, its revisions included,
   SHALL end with `Refs #N`, since #150 keeps closing keywords off them.

If both run and the prose pass changes a file after bug-hunter signed its tree, bug-hunter
SHALL run once more to sign the new tree.

Igor SHALL commit, through either path, only when all of these hold for the steps that ran:

- the tree it uploads equals every signed tree;
- where the prose pass ran, `prose verify-staged` accepts the `Prose:` trailer against that
  tree and the message, and the subject is the issue title as above.

A failure SHALL go back to the step that signed, as the signed-publishing capability requires.
The commit SHALL carry the message, then the `Bug-hunter:`, `Bug-hunter-Tree:` and `Prose:`
trailers of the steps that ran. Merge commits carry none of these trailers.

#### Scenario: A signed commit is committed with its trailers

- **WHEN** a role lists `prose` and `bug-hunter`, both signed trees equal the uploaded tree,
  the trailer verifies, and the subject is the issue title
- **THEN** the message is committed with the trailers appended

#### Scenario: A tree mismatch refuses the commit

- **WHEN** the tree Igor uploads differs from a signed tree
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

#### Scenario: A gate-one commit refers to its item without closing it

- **WHEN** a role under #150 commits gate one's specification, and the issue title holds
  `Fixes #12`, and the item is issue #40
- **THEN** the subject is the title without `Fixes #12`, and the body ends with `Refs #40`

#### Scenario: Gate two's commit is signed and closes the item

- **WHEN** gate two pushes its implementation onto the pull request through `commitOnBranch`
- **THEN** the commit is signed and verified as one `produce()` makes, and its body ends with
  `Closes #N`

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

The pull request body holds, in order: the opening block, which ends with the line linking the
pull request to its item and which `review-evidence` (#190) defines; then the description; then, from the marker `<!-- igor:evidence -->` on, the evidence section that
`review-evidence` (#190) has the code assemble. Every line the code adds after the description
goes after the marker. The code assembles the evidence section from its own record of the run,
so it is not signed and is not part of the description.

The description is exactly the span between the opening block and the marker, apart from the
whitespace that separates it from each, or to the end of the body where there is no marker.
`prose verify-post` SHALL run on exactly that span. The description SHALL be exactly the signed
text, footer
included, and the code SHALL NOT cut it: the 700-character cap (`PR_BODY_LIMIT`) on the
worker's own summary does not apply to it. At gate one, #150 keeps every closing keyword out of
the body, and the code cannot strip one from a signed description without breaking its
signature. So a gate-one description that holds a closing keyword SHALL be returned to the prose
pass, as text that fails verification is.

The description SHALL describe the pull request as it stands. When Igor pushes a commit that
changes what the worker did, gate two's implementation or a revision under #150, the description
SHALL be rewritten, signed again, and verified before it replaces the old one, and the opening
block SHALL be recomputed for that push, since its notes come from that push's bug-hunter run,
as #190 sets out. A catch-up resolution, which only brings the base
branch in, leaves the description as it is. Replacing the description leaves the evidence
section to #190, which rebuilds it on the same push.

#### Scenario: A signed description is published

- **WHEN** the prose pass returns a description whose footer verifies
- **THEN** the pull request is created with a body whose span between the opening block and `<!-- igor:evidence -->`, or to the end where there is no marker,
  is exactly that description
- **AND** anything from the marker on is the evidence section Igor's code assembled, not signed

#### Scenario: The description follows the pull request

- **WHEN** Igor pushes gate two's implementation or a revision to its pull request
- **THEN** the description is rewritten, signed and verified before it is replaced

#### Scenario: A resolution leaves the description

- **WHEN** Igor pushes a catch-up resolution to its pull request
- **THEN** the description is left as it is
