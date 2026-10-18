## ADDED Requirements

### Requirement: A commit is signed by bug-hunter and the prose pass before it is committed

Before Igor commits a worker's change, whether `produce()` opens a pull request with it or, under
the two-gate workflow (#150), `commitOnBranch` pushes gate two's implementation or a revision
onto an existing pull request, the model steps for the skills the role lists
SHALL run in the working tree. Each runs only where the role's
`skills` lists it (signed-publishing, *Igor verifies what each skill in a role's list
requires*); a role that lists neither commits as it does without this capability.

1. **Bug-hunter**, where the role lists `bug-hunter`, in its caller-commits mode, SHALL review
   and fix the change. Its trailers, made after the last step as below, are `Bug-hunter:` and,
   unless bug-hunter's triage finds nothing to hunt and skips, `Bug-hunter-Tree:`.
2. **The prose pass**, where the role lists `prose`, SHALL rewrite the docs and comments the
   change touches and write the commit message. Its trailer is `Prose: ✓ <tree>:<message>`,
   over the staged tree and that message. The message's subject SHALL be the issue title, with any
   closing keyword in it dropped (GitHub's `close`, `fix` or `resolve` in any form, followed by an issue reference, as in a title like `Login fails (fixes #12)`), and its body SHALL explain the change. The body SHALL
   end with `Closes #N` on any commit of a role not using the two-gate workflow (#150), and
   under #150 on every gate-two commit,
   the implementation and each revision after it. Gate one's commits, its revisions included,
   SHALL end with `Refs #N`, since #150 keeps closing keywords off them. A gate-one commit body
   that holds a closing keyword, as defined above, SHALL go back to the prose pass, and each such
   return counts toward the two attempts the signed-publishing capability allows.

Bug-hunter SHALL run before the prose pass. Neither step SHALL sign a tree while it runs. Each
SHALL end by reporting its pass result: bug-hunter's result block, holding its `Bug-hunter:`
value and any open decisions, and the pass token the prose pass's first `prose check` call
printed. Where both run, bug-hunter SHALL then run its usual triage on the prose pass's diff: a
diff touching only comments or docs SHALL be skipped, and any other diff SHALL get one more
bug-hunter iteration. No prose pass SHALL run after that iteration, so comments it writes reach
the commit unread by the prose pass. After the last model step exits, Igor SHALL stage the
change once, in its own index. Igor's code SHALL then run the signing calls itself, with the
scripts from the pinned skills directory: prose's second call, with the prose pass's token, and
bug-hunter's minting script, which writes `Bug-hunter-Tree:`, both against that staged tree. So
each trailer that binds a tree names the tree Igor records and publishes: `Prose:`, and
`Bug-hunter-Tree:` unless bug-hunter's first triage skipped the whole change.

Igor SHALL commit, through either path, only when all of these hold for the steps that ran:

- the tree it uploads equals every signed tree;
- where the prose pass ran, `prose verify-staged` accepts the `Prose:` trailer against that
  tree and the message, and the subject is the issue title as above.

A prose second call that refuses the prose pass's token, or a subject that is not the issue
title as above, SHALL go back to the prose pass, as the signed-publishing capability requires.
Two mismatches SHALL refuse the commit and be recorded as the item's failure: a tree Igor
uploads that differs from the tree the trailers name, as where the Git Data API records modes
differently from Igor's clone, and a message Igor commits that differs from the one the
`Prose:` trailer hashes. Igor's code, not a step, made both bindings, so neither goes back to a
step. The token is model-written text, so Igor SHALL pass it to prose as one argument, with no
shell. Igor SHALL open the message file the prose pass wrote without following a link, and read
it only if it is a regular file with one hard link, as #175 (`worker-user`) reads every file the
worker wrote.
The commit SHALL carry the message, then the `Bug-hunter:`, `Bug-hunter-Tree:` and `Prose:`
trailers of the steps that ran. Merge commits carry none of these trailers.

#### Scenario: A closing keyword in a gate-one commit body goes back

- **WHEN** the prose pass writes a gate-one commit body that says `Fixes #77`
- **THEN** the message goes back to the prose pass, and nothing is committed until it holds no
  closing keyword

#### Scenario: A signed commit is committed with its trailers

- **WHEN** a role lists `prose` and `bug-hunter`, both signed trees equal the uploaded tree,
  the trailer verifies, and the subject is the issue title
- **THEN** the message is committed with the trailers appended

#### Scenario: An extra bug-hunter iteration gets no second prose pass

- **WHEN** the prose pass's diff changes code and bug-hunter's extra iteration adds a comment
- **THEN** Igor stages and signs after that iteration without running the prose pass again

#### Scenario: A tree mismatch refuses the commit

- **WHEN** the tree Igor uploads differs from a signed tree
- **THEN** nothing is committed
- **AND** the mismatch is recorded as the item's failure, and no model step is sent it

#### Scenario: A message mismatch refuses the commit

- **WHEN** the message Igor commits differs from the one the `Prose:` trailer names
- **THEN** nothing is committed
- **AND** the mismatch is recorded as the item's failure, and no model step is sent it

#### Scenario: A refused token goes back to the prose pass

- **WHEN** prose's second call refuses the token the prose pass reported
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

#### Scenario: Both trailers bind to the tree staged after the last step

- **WHEN** the prose pass changes a comment after bug-hunter has run
- **THEN** bug-hunter's triage skips the prose pass's diff
- **AND** Igor stages once, after the last step exits, and runs prose's second call with the
  prose pass's token and bug-hunter's minting script against that tree
- **AND** the `Prose:` trailer names that staged tree, which holds the prose pass's change, and
  so does `Bug-hunter-Tree:` unless bug-hunter's first triage skipped the whole change

#### Scenario: A prose pass that changes code gets one more hunt

- **WHEN** the prose pass's diff changes code
- **THEN** bug-hunter runs one more iteration before Igor stages

#### Scenario: Merge commits carry no trailers

- **WHEN** Igor merges the base into an artifact's branch
- **THEN** the merge commit carries no `Bug-hunter:` or `Prose:` trailer

### Requirement: The pull request description is written for a reviewer and signed

For a role whose `skills` lists `prose`, the prose pass SHALL write the pull request description for a reviewer and sign it with
`prose sign`. The code that creates or edits the pull request SHALL run `prose verify-post` on
the description first, as the signed-publishing capability requires.

The pull request body holds, in order: the opening block, then the description, then, from the
marker `<!-- igor:evidence -->` on, the evidence section. Once `review-evidence` (#190) ships,
it defines the opening block. Until then, the opening block is the line linking the pull
request to its item, preceded for a role under the two-gate workflow (#150) by the text #150 places first (gate one's "specification only" opening and the paths gate one
refused to publish; at gate two, the note that the issue changed after the spec was approved,
and bug-hunter's open decisions).

`review-evidence` (#190) has the code assemble the evidence section. Every line the code adds
after the description goes after the marker. The code assembles the evidence section from its own record of the run,
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

#### Scenario: A closing keyword in a gate-one description goes back

- **WHEN** the prose pass returns a gate-one description that holds a closing keyword
- **THEN** it goes back to the prose pass, and no description is published until it holds none

#### Scenario: A resolution leaves the description

- **WHEN** Igor pushes a catch-up resolution to its pull request
- **THEN** the description is left as it is
