## ADDED Requirements

### Requirement: A commit is signed by bug-hunter and the prose pass before it is committed

Before Igor commits a worker's change, whether `produce()` opens a pull request with it or,
under the two-gate workflow (#150), `commitOnBranch` pushes gate two's implementation or a
revision onto an existing pull request, the model steps for the skills the role lists SHALL run
in the working tree. Each runs only where the role's `skills` lists it (signed-publishing, *Igor
verifies what each skill in a role's list requires*); a role that lists neither commits as it
does without this capability.

Terms used below: bug-hunter's *caller-commits mode* reviews and fixes a change and reports its
result without committing; its *first triage* is the one it runs on the whole change before any
hunt; its *minting script* is `mint-trailer.sh`, which writes `Bug-hunter-Tree:` for whatever is
staged when it runs. A *revision* is a push under #150, at either gate, answering a reviewer's
change request, as #150 defines it. A *closing keyword* is one the item's tracker adapter
recognises followed by an issue reference: on GitHub `close`, `closes`, `closed`, `fix`,
`fixes`, `fixed`, `resolve`, `resolves` or `resolved`.

1. **Bug-hunter**, where the role lists `bug-hunter`, in its caller-commits mode, SHALL review
   and fix the change, and report its `Bug-hunter:` value and any open decisions. It SHALL NOT
   stage, mint or run any bug-hunter script. Its trailers, made after the last step as below,
   are `Bug-hunter:` and, where any bug-hunter run hunted, `Bug-hunter-Tree:`.
2. **The prose pass**, where the role lists `prose`, SHALL rewrite the docs and comments the
   change touches and write the commit message. Its trailer is `Prose: ✓ <tree>:<message>`,
   over the staged tree and that message. The message's subject SHALL be the issue title, with
   any closing keyword in it dropped (as in a title like `Login fails (fixes #12)`), and its body
   SHALL explain the change. The body SHALL end with the closing linkage the item's tracker adapter
   supplies (on GitHub, `Closes #N`) on any commit of a role not using the two-gate workflow
   (#150), and under #150 on every gate-two commit, the implementation and each revision after
   it. Gate one's commits, its revisions included, SHALL end with the reference that links
   without closing, which the same adapter supplies (on GitHub, `Refs #N`). A message that holds
   any closing keyword other than the closing linkage this rule requires for the item SHALL go
   back to the prose pass, at every gate, and each such return counts toward the two attempts
   the signed-publishing capability allows.

Bug-hunter SHALL run before the prose pass, and neither step SHALL sign. Where the role lists
`prose`, Igor SHALL then stage the change in its own index and run prose's first `prose check`
call on a draft message holding the issue title, with the reader goals Igor's code fixes for the
message, for a changed doc and for a changed spec, and SHALL give the prose pass the rules and
the pass token it prints, in its prompt on stdin. Where both steps run, Igor SHALL then run
bug-hunter's triage on the prose pass's diff, on one model pinned in Igor's code: a diff the
triage skips SHALL get no hunt, and any other diff SHALL get one more bug-hunter iteration,
whose `Bug-hunter:` value replaces the first's. No prose pass SHALL run after that iteration,
apart from the prose pass's answers to the cold read.

Where the role lists `bug-hunter`, Igor SHALL run the same triage on the diff the prose pass's
answers to the cold read make, and a diff it does not skip SHALL fail the attempt.

Every time Igor stages, it SHALL first make the checks #175's *The Igor reads no file on the
worker's behalf through a link* requires on the changed paths, so that no link or hard link the
worker made is staged. Before each model step after the worker, Igor SHALL check for a stop and
that it still holds the claim, as at any checkpoint (`surface-adapter`, *Claim verification also
reports a stop*); a stop publishes nothing.

After the last model step exits, Igor SHALL stage the change once more, in its own index, and
run the signing calls itself, as its service user, with the scripts from the pinned skills
directory: prose's second call, with the token and with the cold read that signed-publishing's
*Igor runs prose's calls around the model step that writes* requires; and bug-hunter's minting
script. Both run against that staged tree. Igor SHALL run every prose and bug-hunter script with
`GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` set to its own git directory, the working tree
and its own index, so that no script reads a `.git` the worker can write. So each trailer that
binds a tree names the tree Igor records and publishes: `Prose:`, and `Bug-hunter-Tree:`
wherever any bug-hunter run hunted, the first or the extra iteration. Igor SHALL write the
`Bug-hunter:` trailer itself, from the step's reported value, on every commit bug-hunter ran on,
a change its first triage skipped included. A value holding a line break or a closing keyword
SHALL go back to the bug-hunter step with the reason, counting toward the two attempts.

Igor SHALL stage after every filter that drops paths from what it publishes, such as #150's
gate-one confinement to `openspec/changes/`, so that the staged tree is the tree it uploads.

Igor SHALL commit, through either path, only when all of these hold for the steps that ran:

- the tree it uploads equals every signed tree;
- where the prose pass ran, `prose verify-staged` accepts the `Prose:` trailer against that
  tree and the message, the subject is the issue title as above, and the body ends with the
  linkage set above for the commit's gate.

A prose second call that refuses the token, a subject that is not the issue title as above, or a
body that does not end with that linkage SHALL go back to the prose pass, as the
signed-publishing capability requires. Three kinds of failure SHALL refuse the commit and be
recorded as the item's failure, going back to no step: a tree Igor uploads that differs from the
tree the trailers name, as where the Git Data API records a symbolic link or a submodule
differently from Igor's index; a message Igor commits that differs from the one the `Prose:`
trailer hashes; and a minting call that fails or refuses. Igor SHALL pass the token to prose as
one argument, with no shell. Igor SHALL read every file a model step hands it, the message, a
description, a reply, a cold-read report and its answers, as #175's *The Igor reads no file on
the worker's behalf through a link* requires of every file the worker wrote, and SHALL pass
prose only copies it read that way. The commit SHALL carry the message, then the `Bug-hunter:`,
`Bug-hunter-Tree:` and `Prose:` trailers of the steps that ran. Merge commits carry none of
these trailers.

#### Scenario: A closing keyword in a gate-one commit body goes back

- **WHEN** the prose pass writes a gate-one commit body that says `Fixes #77`
- **THEN** the message goes back to the prose pass, and nothing is committed until it holds no
  closing keyword

#### Scenario: A closing keyword for another issue goes back at any gate

- **WHEN** the prose pass writes a gate-two commit for item #40 whose body ends with `Closes #40`
  and also says `Fixes #999`
- **THEN** the message goes back to the prose pass, and nothing is committed until `Fixes #999`
  is gone

#### Scenario: A gate-two body without its closing linkage goes back

- **WHEN** the prose pass writes a gate-two commit body that ends with `Refs #40`
- **THEN** nothing is committed
- **AND** the prose pass receives the message back with the reason

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

#### Scenario: A refused minting call goes back to no step

- **WHEN** bug-hunter's minting script fails against the staged tree
- **THEN** nothing is committed
- **AND** the failure is recorded as the item's, and no model step is sent it

#### Scenario: A trailer value cannot forge trailers

- **WHEN** bug-hunter reports a `Bug-hunter:` value holding a line break
- **THEN** nothing is committed with it
- **AND** the bug-hunter step receives it back with the reason

#### Scenario: A bug-hunter value cannot close an issue

- **WHEN** bug-hunter reports a `Bug-hunter:` value that says `fixes #12`
- **THEN** nothing is committed with it
- **AND** the bug-hunter step receives it back with the reason

#### Scenario: The token is passed as one argument

- **WHEN** Igor runs prose's second call with a pass token
- **THEN** the token is one argument of a command run with no shell

#### Scenario: A linked message file is not read

- **WHEN** the message file the prose pass wrote is a symbolic link
- **THEN** Igor does not follow it, and nothing is committed

#### Scenario: Gate one stages only what it publishes

- **WHEN** a gate-one worker changed `src/` as well as a file under `openspec/changes/`
- **THEN** Igor stages after dropping the `src/` change, and the tree it signs is the tree it
  uploads

#### Scenario: A refused token goes back to the prose pass

- **WHEN** prose's second call refuses the token Igor's first call issued
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
- **AND** Igor stages once more, after the last step exits, and runs prose's second call with
  the token its first call issued and bug-hunter's minting script against that tree
- **AND** the `Prose:` trailer names that staged tree, which holds the prose pass's change, and
  so does `Bug-hunter-Tree:` unless bug-hunter's first triage skipped the whole change

#### Scenario: Igor runs the first call before the prose pass

- **WHEN** bug-hunter has reported its value for a role that lists `prose` and `bug-hunter`
- **THEN** Igor stages the change and runs prose's first `prose check` call as its service user
- **AND** the prose pass's prompt holds the rules and the pass token that call printed, and the
  prose pass runs no prose script

#### Scenario: The signing scripts never read the worker's git directory

- **WHEN** the worker has replaced the tree's `.git` with a directory whose config names a
  `core.fsmonitor` script
- **THEN** Igor runs prose's calls and the minting script with its own `GIT_DIR`,
  `GIT_WORK_TREE` and `GIT_INDEX_FILE`, and the worker's script never runs

#### Scenario: A prose pass that changes code gets one more hunt

- **WHEN** the prose pass's diff changes code
- **THEN** bug-hunter runs one more iteration before Igor stages

#### Scenario: An extra iteration that hunts mints the tree trailer

- **WHEN** bug-hunter's first triage found nothing to hunt, and the prose pass's diff changes
  code, so one more iteration runs
- **THEN** the commit carries `Bug-hunter-Tree:` bound to the staged tree

#### Scenario: Answers to the cold read that change code fail the attempt

- **WHEN** the prose pass, answering the cold read, changes code, and the triage of that diff
  does not skip it
- **THEN** nothing is committed, and the attempt counts as failed

#### Scenario: Igor stages nothing the worker hard-linked

- **WHEN** the worker's tree holds a changed file with more than one hard link when Igor is
  about to stage for prose's first call
- **THEN** Igor stages nothing, and the run stops as #175 requires

#### Scenario: A stop during the signing steps publishes nothing

- **WHEN** the item is stopped while the prose pass runs
- **THEN** Igor finds the stop before the next model step and publishes nothing

#### Scenario: Merge commits carry no trailers

- **WHEN** Igor merges the base into an artifact's branch
- **THEN** the merge commit carries no `Bug-hunter:` or `Prose:` trailer

### Requirement: The pull request description is written for a reviewer and signed

For a role whose `skills` lists `prose`, the prose pass SHALL write the pull request
description for a reviewer, between the two `prose sign` calls Igor's code runs, as the
signed-publishing capability requires. The code that creates or edits the pull request SHALL
run `prose verify-post` on the description first.

The pull request body holds, in order: the opening block, then the description, then, from the
marker `<!-- igor:evidence -->` on, the evidence section. Once `review-evidence` (#190) is
built, it defines the opening block. Until then, the opening block is the line linking the pull
request to its item, preceded for a role under the two-gate workflow (#150) by the bug-hunter
open decisions #150 places first.

`review-evidence` (#190) has the code assemble the evidence section. Every line the code adds
after the description goes after the marker. The code assembles the evidence section from its
own record of the run, so it is not signed and is not part of the description.

The description is exactly the span between the opening block and the marker, apart from the
whitespace that separates it from each, or to the end of the body where there is no marker.
`prose verify-post` SHALL run on exactly that span. The description SHALL be exactly the signed
text, footer included, and the code SHALL NOT cut it: the 700-character cap (`PR_BODY_LIMIT`) on
the worker's own summary does not apply to it, and no transcript pointer, which marks a cut,
follows it. A description that holds a closing keyword at gate one, or one for any issue other
than the item at any gate, SHALL be returned to the prose pass, as text that fails verification
is.

The description SHALL describe the pull request as it stands. When Igor pushes a commit that
changes what the worker did, gate two's implementation or a revision under #150, the description
SHALL be rewritten, signed again, and verified before it replaces the old one, and the opening
block SHALL be recomputed for that push, as #190 sets out. A catch-up resolution, which only
brings the base branch in, leaves the description as it is. Replacing the description leaves the
evidence section to #190, which rebuilds it on the same push.

#### Scenario: A signed description is published

- **WHEN** prose's second call returns a description whose footer verifies
- **THEN** the pull request is created with a body whose span between the opening block and
  `<!-- igor:evidence -->`, or to the end where there is no marker, is exactly that description
- **AND** anything from the marker on is the evidence section Igor's code assembled, not signed

#### Scenario: A long description is published uncut

- **WHEN** prose's second call returns a signed description of 1,500 characters
- **THEN** the body holds all of it, footer included

#### Scenario: The description follows the pull request

- **WHEN** Igor pushes gate two's implementation or a revision to its pull request
- **THEN** the description is rewritten, signed and verified before it is replaced
- **AND** the opening block is recomputed for that push

#### Scenario: A closing keyword in a gate-one description goes back

- **WHEN** the prose pass returns a gate-one description that holds a closing keyword
- **THEN** it goes back to the prose pass, and no description is published until it holds none

#### Scenario: A resolution leaves the description

- **WHEN** Igor pushes a catch-up resolution to its pull request
- **THEN** the description is left as it is
