## ADDED Requirements

### Requirement: A commit is signed by bug-hunter and the prose pass before it is committed

Before Igor commits a worker's change, the model steps for the skills the role lists SHALL run
in the working tree, bug-hunter before the prose pass, and neither step SHALL sign. That holds
for a commit `produce()` makes and for one that #150's head push (built on `commitOnBranch`)
pushes: gate two's implementation, or a revision at either gate. A role that lists neither commits as it does without this
capability.

#### Scenario: Gate two's commit goes through the steps

- **WHEN** gate two pushes its implementation onto the pull request through #150's head push
- **THEN** bug-hunter and the prose pass run on it as on a commit `produce()` makes

### Requirement: A commit carries the trailers of the steps that ran

The commit SHALL carry the message, then the `Bug-hunter:`, `Bug-hunter-Tree:` and `Prose:`
trailers of the steps that ran.

#### Scenario: A signed commit is committed with its trailers

- **WHEN** a role lists `prose` and `bug-hunter`, both signed trees equal the uploaded tree,
  the `Prose:` trailer verifies, and the subject is the issue title
- **THEN** the message is committed with the trailers appended

### Requirement: The bug-hunter step reports, and Igor writes its trailers

Where the role lists `bug-hunter`, bug-hunter SHALL run in its caller-commits mode, which
reports its result without committing: it SHALL review and fix the change, report its
`Bug-hunter:` value and any open decisions, and SHALL NOT stage, mint or run any bug-hunter
script. Igor SHALL write the `Bug-hunter:` trailer itself, from the reported value, on every
commit bug-hunter ran on, a change its *first triage* (the one run on the whole change before
any hunt) skipped included.

#### Scenario: The bug-hunter step reports and stages nothing

- **WHEN** bug-hunter runs on a worker's change for a role that lists `bug-hunter`
- **THEN** it reviews and fixes the change and reports its `Bug-hunter:` value and any open
  decisions, without staging, minting or running any bug-hunter script
- **AND** Igor writes the commit's `Bug-hunter:` trailer from that value

### Requirement: A commit message is titled and linked for its gate

Where the role lists `prose`, the commit message's subject SHALL be the issue title, with any closing keyword in it dropped,
and its body SHALL explain the change and end with the closing linkage the item's tracker
adapter supplies (on GitHub, `Closes #N`) on any commit of a role not under #150, and under #150
on every gate-two commit. Gate one's commits, its revisions included, SHALL end with the
reference that links without closing, in the form #150's tracker adapter supplies.

#### Scenario: A gate-one commit refers to its item without closing it

- **WHEN** a role under #150 commits gate one's specification, and the issue title holds
  `Fixes #12`, and the item is issue #40
- **THEN** the subject is the title without `Fixes #12`, and the body ends with the adapter's
  reference to #40 that does not close it

#### Scenario: Gate two's commit is signed and closes the item

- **WHEN** gate two pushes its implementation onto the pull request through #150's head push
- **THEN** the commit is signed and verified as one `produce()` makes, and its body ends with
  `Closes #N`

### Requirement: A commit message breaking its gate's rules goes back to the prose pass

A *closing keyword* is one the item's tracker adapter recognises followed by an issue
reference: on GitHub `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`
or `resolved`. Where the role lists `prose`, a message holding one at gate one, which #150
forbids, or one for any issue but the item at any gate, or whose subject or ending breaks *A
commit message is titled and linked for its gate*, SHALL go back to the prose pass as a failed
check.

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

- **WHEN** the prose pass writes a gate-two commit body for item #40 that ends with the
  adapter's reference that does not close it
- **THEN** nothing is committed
- **AND** the prose pass receives the message back with the reason
#### Scenario: The subject must be the issue title

- **WHEN** the message's subject differs from the issue title with any closing keyword dropped
- **THEN** nothing is committed
- **AND** the prose pass receives the message back with the reason

### Requirement: Igor stages and runs prose's first call before the prose pass

Where the role lists `prose`, Igor SHALL stage the change in its own index after bug-hunter, where it runs, and
run prose's first `prose check` call on a draft message holding the issue title, then give the
prose pass the rules and the pass token it prints, in its prompt on stdin. The prose pass SHALL
rewrite the docs and comments the change touches and write the commit message. Igor SHALL pass the
message to prose as a file (`-F`), never as an argument.

#### Scenario: Igor runs the first call before the prose pass

- **WHEN** bug-hunter has reported its value for a role that lists `prose` and `bug-hunter`
- **THEN** Igor stages the change and runs prose's first `prose check` call as its service user
- **AND** the prose pass's prompt holds the rules and the pass token that call printed, and the
  prose pass runs no prose script
#### Scenario: The message reaches prose in a file

- **WHEN** Igor runs prose's first or second `prose check` call
- **THEN** the message is in a file passed with `-F`, and no command line holds its text

### Requirement: The worker's goals reach prose in files

The goals of the change's docs and specs SHALL be those the worker wrote, by path pattern, to a
goals file in its outbox, passed as `--goals-file`; the message's own goals SHALL be those in a
second goals file there, passed as `--message-goals-file`; neither SHALL be on a command line.
The worker writes the patterns to cover a doc a
later step changes; whether they do is unmeasured. A second call that refuses such a doc SHALL
count as a failed attempt.

#### Scenario: The goals reach prose in a file

- **WHEN** Igor runs prose's first `prose check` call
- **THEN** the goals the worker wrote for the change's docs and specs reach prose as a file
  passed with `--goals-file`
- **AND** the goals it wrote for the commit message reach prose as a file passed with
  `--message-goals-file`, and no command line holds either

### Requirement: Bug-hunter triages what the prose pass changes

Where both steps run, Igor SHALL run bug-hunter's triage on the prose pass's diff, on sonnet,
pinned in Igor's code: a diff the triage skips SHALL get no hunt, and any other diff SHALL get one
more bug-hunter iteration, whose `Bug-hunter:` value replaces the first's, even where the first
fixed a bug (proposal, *Still open*). No second prose pass
SHALL run after it; the prose pass runs again only to answer the cold read.

#### Scenario: A prose pass diff the triage does not skip gets one more hunt

- **WHEN** bug-hunter's triage does not skip the prose pass's diff
- **THEN** bug-hunter runs one more iteration before Igor stages
#### Scenario: An extra bug-hunter iteration gets no second prose pass

- **WHEN** bug-hunter's triage does not skip the prose pass's diff, and the extra iteration adds
  a comment
- **THEN** Igor stages and signs after that iteration without running the prose pass again
#### Scenario: The extra iteration's value replaces the first

- **WHEN** bug-hunter's first run reports `1 iteration, 1 bug fixed`, and the extra iteration
  reports `1 iteration, no bugs found`
- **THEN** the commit's `Bug-hunter:` trailer is `1 iteration, no bugs found`

### Requirement: Bug-hunter triages the answers to the cold read

Where the role lists `bug-hunter`, Igor SHALL run the same triage on the diff the prose pass's
answers to the cold read make, and a diff it does not skip SHALL fail the attempt.

#### Scenario: Answers to the cold read that change code fail the attempt

- **WHEN** the prose pass, answering the cold read, changes code, and the triage of that diff
  does not skip it
- **THEN** nothing is committed, and the attempt counts as failed

### Requirement: Igor stages only after killing the worker's processes and checking for links

Every time Igor stages, it SHALL first kill every process the worker user owns and check the
changed paths for symbolic links, submodules and hard links, as #175's (`worker-user`) *The Igor
stages only after its checks, and #153's trailers bind the last staging* requires, where "#153"
is this change. Igor SHALL stage after every filter that drops paths from what it publishes,
such as #150's gate-one confinement to `openspec/changes/`, so that the staged tree is the tree
it uploads.

#### Scenario: Igor stages nothing the worker hard-linked

- **WHEN** the worker's tree holds a changed file with more than one hard link when Igor is
  about to stage for prose's first call
- **THEN** Igor stages nothing, and the run stops as #175 requires
#### Scenario: A command the worker left running is killed before any staging

- **WHEN** a command the worker started is still running when Igor is about to stage, at any
  of its stagings: before prose's first call, after the prose pass, or after the answers to the
  cold read
- **THEN** Igor kills every process the worker user owns, as #175 requires, before it stages
#### Scenario: Gate one stages only what it publishes

- **WHEN** a gate-one worker changed `src/` as well as a file under `openspec/changes/`
- **THEN** Igor stages after dropping the `src/` change, and the tree it signs is the tree it
  uploads

### Requirement: Igor checks for a stop and its claim before each signing step

Before each model step after the worker, Igor SHALL check for a stop and that it still holds
the claim, as at any checkpoint (`surface-adapter`, *Claim verification also reports a stop*); a
stop publishes nothing.

#### Scenario: A stop during the signing steps publishes nothing

- **WHEN** the item is stopped while the prose pass runs
- **THEN** Igor finds the stop before the next model step and publishes nothing

### Requirement: A claim lost during the signing steps leaves an unsigned offer

Where the claim is lost, Igor SHALL run no further model step, and SHALL offer the worker's
change as *Work finished before a claim is lost is offered, not discarded* requires, with a body
its code writes, no signed text, and no `Bug-hunter:`, `Bug-hunter-Tree:` or `Prose:` trailer on
the commit holding the unsigned work. Which tree the offered change carries is open (proposal, *Still open*).

#### Scenario: A lost claim publishes an unsigned draft

- **WHEN** Igor finds, before the cold read, that it no longer holds the item's claim
- **THEN** no further model step runs
- **AND** Igor publishes the worker's change as a draft pull request whose body its code wrote,
  with no `prose ✓` footer and no skill trailer on its commit

### Requirement: Every trailer binds the tree Igor stages after the answers to the cold read

After the prose pass, and the extra iteration where it runs, Igor SHALL stage once more, in its
own index, and run
prose's second call, which prints the cold-read brief; the cold read and the answers run as
`signed-publishing` requires, and Igor SHALL
stage once more after them. That last staging is the tree Igor records and publishes, and the
tree that `Prose: ✓ <tree>:<message>` (over it and the message) and `Bug-hunter-Tree:` name.

#### Scenario: Both trailers bind to the tree staged after the answers

- **WHEN** the prose pass changes a comment after bug-hunter has run, and bug-hunter's triage
  skips the prose pass's diff
- **THEN** no extra iteration runs
- **AND** Igor stages after the answers to the cold read, and runs prose's second call with the
  token its first call issued and bug-hunter's minting script against that tree
- **AND** the `Prose:` trailer names that staged tree, which holds the prose pass's change, and
  so does `Bug-hunter-Tree:`

### Requirement: Igor runs the signing calls itself, against the last staging

Against the last staging, Igor SHALL run the signing calls itself, as its service user, with the
scripts from the pinned skills directory: prose's second call, with the token, the cold-read
report and the answers; and `mint-trailer.sh`, bug-hunter's *minting script*, which writes
`Bug-hunter-Tree:` for whatever is staged. Igor SHALL mint it on every commit of a role that
lists `bug-hunter`, a change bug-hunter's triage skipped whole included.

#### Scenario: A change the triage skipped still carries the tree trailer

- **WHEN** bug-hunter reports that its first triage found nothing to hunt, and its triage skips
  the prose pass's diff too
- **THEN** Igor still runs the minting script, and the commit carries `Bug-hunter-Tree:` bound
  to the staged tree

### Requirement: Igor runs the signing scripts with its own git directory and configuration

Igor SHALL run every prose and bug-hunter script with `GIT_DIR`, `GIT_WORK_TREE` and
`GIT_INDEX_FILE` set to its own git directory, the working tree and its own index, so that no
script reads a `.git` the worker can write, and with `GIT_CONFIG_NOSYSTEM=1` and
`GIT_CONFIG_GLOBAL=/dev/null`, as #175's *Nothing the worker writes is executed by the Igor*
sets for every git call Igor makes in a tree. Igor SHALL pass prose
the token as one argument, with no shell.

#### Scenario: The signing scripts never read the worker's git directory

- **WHEN** the worker has replaced the tree's `.git` with a directory whose config names a
  `core.fsmonitor` script
- **THEN** Igor runs prose's calls and the minting script with its own `GIT_DIR`,
  `GIT_WORK_TREE` and `GIT_INDEX_FILE`, and the worker's script never runs
#### Scenario: The token is passed as one argument

- **WHEN** Igor runs prose's second call with a pass token
- **THEN** the token is one argument of a command run with no shell

### Requirement: Igor checks what each step hands back before using it

Igor SHALL read every file a model step hands it, the message, a description, a reply, a
cold-read report and its answers, as #175's *Every file read from the worker is a regular file
with one link* requires, and SHALL pass prose only copies it read that way. A `Bug-hunter:`
value holding a line break or any closing keyword, even one for the item, or an open decision
Igor places in the body holding a closing keyword, SHALL go back to the bug-hunter step with the
reason, as a failed check.

#### Scenario: A linked message file is not read

- **WHEN** the message file the prose pass wrote is a symbolic link
- **THEN** Igor does not follow it, and nothing is committed
#### Scenario: A trailer value cannot forge trailers

- **WHEN** bug-hunter reports a `Bug-hunter:` value holding a line break
- **THEN** nothing is committed with it
- **AND** the bug-hunter step receives it back with the reason
#### Scenario: An open decision cannot close an issue

- **WHEN** bug-hunter reports an open decision that says `Fixes #999`
- **THEN** nothing is committed or published with it
- **AND** the bug-hunter step receives it back with the reason
#### Scenario: A bug-hunter value cannot close an issue

- **WHEN** bug-hunter reports a `Bug-hunter:` value that says `fixes #12`
- **THEN** nothing is committed with it
- **AND** the bug-hunter step receives it back with the reason

### Requirement: A commit is made only when every signature matches what is uploaded

Igor SHALL commit, through either path, only when the tree it uploads equals every signed tree
and, where the prose pass ran, `prose verify-staged` accepts the `Prose:` trailer against that
tree and the message. A refused token SHALL go back to the prose pass. A tree mismatch #175's
checks did not stop, a committed message other than the one `Prose:` hashes,
and a minting call that fails or refuses SHALL each refuse the commit and be recorded as the
item's failure, going back to no step.

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
#### Scenario: A refused token goes back to the prose pass

- **WHEN** prose's second call refuses the token Igor's first call issued
- **THEN** nothing is committed
- **AND** the prose pass receives the message back with the reason

### Requirement: A second worker run is a second commit

Where `loop-verifies-commands` (#189) runs the worker a second time after one of the
repository's checks fails, that run's edits SHALL become a second commit on top of the first
run's signed commit. The steps above SHALL run on the second commit's diff only, and the second
commit SHALL carry its own trailers, bound to its own last staging. Where the second run follows
a conflict resolution, its commit SHALL go on top of the merge commit, which carries no trailers.

#### Scenario: A second worker run makes a second commit

- **WHEN** a check fails on the first run's signed commit and the worker runs a second time
- **THEN** its edits are committed on top of the first commit, after bug-hunter, the prose pass
  and the cold read have run on that commit's diff alone
- **AND** each commit carries its own trailers, bound to its own tree
#### Scenario: A second worker run after a conflict resolution commits on top of the merge

- **WHEN** Igor merges the base in and resolves a conflict, a check then fails, and the worker
  runs a second time
- **THEN** its edits are committed on top of the merge commit, after bug-hunter, the prose pass
  and the cold read have run on that commit's diff alone
- **AND** that commit carries its own trailers, and the merge commit carries none

### Requirement: A second commit that fails or loses its claim leaves the first one signed

Where the second commit's signing fails both attempts, Igor SHALL publish the first run's signed
commit alone, as #189 requires, and record the failure. Where the claim is lost during the second
commit's steps, the offered change SHALL keep the first commit with its trailers, and put the
second run's edits in an unsigned commit on top.

#### Scenario: A second commit that fails twice leaves the first published alone

- **WHEN** the worker's second run's commit fails its signing on both attempts
- **THEN** Igor publishes the first run's signed commit alone, and records the failure

#### Scenario: A claim lost during the second commit's steps keeps the first commit signed

- **WHEN** Igor finds, during the second commit's signing steps, that it no longer holds the claim
- **THEN** the offered change holds the first commit with its trailers, and the second run's
  edits in a commit on top with no skill trailer

### Requirement: Igor's own bookkeeping commits carry no skill trailers

Merge commits SHALL carry none of the `Bug-hunter:`, `Bug-hunter-Tree:` and `Prose:` trailers,
nor SHALL the commits that #216 (`lore-search`) has the Igor push to the lore
repository's `questions` branch: a citation commit, which records that a lore entry answered a
question; and a commit pushing a question log file, the inquisitor's record of a question a
worker asked or settled itself, or a miss file, its record of a question a person said should
have been settled without asking.

#### Scenario: Merge commits carry no trailers

- **WHEN** Igor merges the base into an artifact's branch
- **THEN** the merge commit carries no `Bug-hunter:` or `Prose:` trailer
#### Scenario: Citation commits carry no trailers

- **WHEN** Igor commits a citation to the lore repository's `questions` branch
- **THEN** the commit carries no `Bug-hunter:` or `Prose:` trailer
#### Scenario: Question log and miss file commits carry no trailers

- **WHEN** Igor commits a question log file or a miss file its worker reported to the lore
  repository's `questions` branch
- **THEN** the commit carries no `Bug-hunter:` or `Prose:` trailer

### Requirement: The pull request description is written for a reviewer and signed

For a role whose `skills` lists `prose`, the prose pass SHALL write the pull request
description for a reviewer, between the two `prose sign` calls Igor's code runs, as
signed-publishing requires. The code creating or editing the pull request SHALL run `prose
verify-post` on it first. Where this pass falls among a commit's steps is open (proposal,
*Still open*).

#### Scenario: The description is verified before the pull request is created

- **WHEN** prose's second call returns a signed description for a role that lists `prose`
- **THEN** the code runs `prose verify-post` on it before it creates the pull request

### Requirement: A description holding a forbidden closing keyword goes back

A description that breaks #150's rule against closing keywords at gate one, or holds one for any
issue other than the item at any gate, SHALL go back to the prose pass, as text that fails
verification does.

#### Scenario: A closing keyword in a gate-one description goes back

- **WHEN** the prose pass returns a gate-one description that holds a closing keyword
- **THEN** it goes back to the prose pass, and no description is published until it holds none

#### Scenario: A gate-two description cannot close another issue

- **WHEN** the prose pass returns a gate-two description for item #40 that says `Fixes #999`
- **THEN** it goes back to the prose pass, and no description is published until `Fixes #999`
  is gone

### Requirement: The description is the signed span between the opening block and the evidence

The pull request body holds the opening block, the description, then, from the
marker `<!-- igor:evidence -->` on, the evidence section, which the code assembles from its
record of the run (#190), unsigned. Every line the code adds after the description goes
after the marker. The description is exactly the span between the opening block and the marker,
apart from the whitespace separating it from each, or to the end where there is no marker; `prose
verify-post` SHALL run on exactly that span.

#### Scenario: A signed description is published

- **WHEN** prose's second call returns a description whose footer verifies
- **THEN** the pull request is created with a body whose span between the opening block and
  `<!-- igor:evidence -->`, or to the end where there is no marker, is exactly that description
- **AND** anything from the marker on is the evidence section Igor's code assembled, not signed

### Requirement: The description is published whole

The description SHALL be exactly the signed text, footer included, and the code SHALL NOT cut
it: the 700-character cap (`PR_BODY_LIMIT`) on the worker's own summary does not apply to it,
and no transcript pointer, which marks a cut, follows it.

#### Scenario: A long description is published uncut

- **WHEN** prose's second call returns a signed description of 1,500 characters
- **THEN** the body holds all of it, footer included

### Requirement: Until review-evidence is built, the opening block links the item

Once `review-evidence` (#190) is built, it defines the opening block. Until then, the opening
block SHALL be the line linking the pull request to its item, preceded for a role under the two-gate
workflow (#150) by every line #150's code writes into the body: its specification-only notice,
the paths it dropped, the note that the item was edited, and bug-hunter's open decisions.

#### Scenario: Before review-evidence, a body under #150 opens with #150's lines and the item link

- **WHEN** a role under #150 publishes a pull request before `review-evidence` (#190) is built
- **THEN** the opening block is every line #150's code writes into the body, then the line
  linking the pull request to its item

### Requirement: A push that changes the work rewrites the description

The description SHALL describe the pull request as it stands. When Igor pushes a commit that
changes what the worker did, that is, gate two's implementation or a revision under #150, the description
SHALL be rewritten, signed again, and verified before it replaces the old one, and the opening
block SHALL be recomputed for that push. A catch-up resolution, which only brings the base
branch in, leaves the description as it is. #190 rebuilds the evidence section on the same push.

#### Scenario: The description follows the pull request

- **WHEN** Igor pushes gate two's implementation or a revision to its pull request
- **THEN** the description is rewritten, signed and verified before it is replaced
- **AND** the opening block is recomputed for that push
#### Scenario: A resolution leaves the description

- **WHEN** Igor pushes a catch-up resolution to its pull request
- **THEN** the description is left as it is
