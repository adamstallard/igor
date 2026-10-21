## ADDED Requirements

### Requirement: The loop runs the repository's checks in the worker's tree

A round is as `role-config`'s *The org base declares each repository's checks* defines it, run in
the order the checks are declared. An execution row is the line that execution appends to `executions.ndjson` for
each execution of an item; it holds both worker runs and both rounds where there are two. Where the worker's run settles with a result, having exited on its own or
reported its result before a kill, and changed the tree, execution SHALL run a round. It SHALL run
after execution has read which paths the worker changed and their contents, has read the item's
claim, and has applied every refusal that reads only those changes, among them `allow`, path names,
conflict markers, undeclared reverts, and at gate one under `two-gate-workflow` (#150) the drop
of every change outside the specification. A run any of those refusals refuses runs no check, and
so does a run whose claim, read before the checks, reports a stop. Before the round runs, each
path gate one drops SHALL be restored to its content in the base's tree. Under `igor serve` the
worker user SHALL make that restore, since Igor's own account cannot remove a file the worker
user made inside a directory the worker user made; under `igor run` Igor's own account makes it. Where
`signed-publishing` (#153) stages and signs the tree before the commit, the round SHALL also run
after that staging and signing, on the signed commit's tree. Every check SHALL run, even after
one fails. Execution SHALL read the claim again once the round ends.

What a check writes SHALL NOT reach the artifact, the commit Igor publishes: the artifact carries
only the changes execution read before the last round ran, staged where #153 stages them.

Each check SHALL run as the worker ran: as the same user, in its own process group, and with the
environment the worker was given, without its model login (`CLAUDE_CODE_OAUTH_TOKEN` or
`ANTHROPIC_API_KEY`). Under `igor serve` that user is the worker user `worker-user` (#175)
defines. Under `igor run` it is the Igor's own account, as it is for the worker.

A check's environment SHALL also hold each credential its repository's entry declares
(`role-config`'s *The org base declares each repository's checks*), under its declared name.
Execution registers each such value for credential redaction, with #217's `rememberSecret`,
before the first check that gets it starts, as #175's *A worker gets a secret only
through the Igor, which registers it* requires. A worker run SHALL NOT get it in its environment
(*The worker is given an explicit environment holding no credential but its seat's*).

#### Scenario: A check runs as the worker user

- **WHEN** under `igor serve` a check runs a test the worker wrote
- **THEN** the test runs as the worker user
- **AND** its environment holds neither `CLAUDE_CODE_OAUTH_TOKEN` nor `ANTHROPIC_API_KEY`

#### Scenario: A check gets its declared credential, and the worker does not

- **WHEN** `org/web` declares `credentials: [NPM_TOKEN]`, and a check's output quotes the value
- **THEN** the check's environment holds `NPM_TOKEN`
- **AND** the worker's environment, in both runs, does not
- **AND** the value is `[redacted]` wherever execution stores or publishes that output

#### Scenario: A check under igor run runs as the Igor

- **WHEN** under `igor run` a check runs
- **THEN** it runs as the Igor's own account, without the model login

#### Scenario: What a check writes is not published

- **WHEN** a check writes a file into the tree, or rewrites a file the worker changed
- **THEN** the artifact carries the worker's changes as they were read before the checks, and not
  what the check wrote

#### Scenario: A failed check does not stop the rest

- **WHEN** the first of two checks exits non-zero
- **THEN** the second still runs, and both results are recorded

#### Scenario: A run that changed nothing runs no checks

- **WHEN** the worker leaves the tree unchanged
- **THEN** no check runs

#### Scenario: A stop found before the checks runs none

- **WHEN** the claim read before the checks reports that the item was stopped
- **THEN** no check runs and nothing is published

#### Scenario: A killed or refused run runs no checks

- **WHEN** the worker is killed for a limit after editing files without reporting a result, or the
  role's `allow` permits no pull request
- **THEN** no check runs

#### Scenario: A run that reported its result before a kill is checked

- **WHEN** the worker reports its result, is killed by a silence window before its process exits,
  and changed the tree
- **THEN** its checks run as for a run that exited on its own

#### Scenario: Gate one checks only the specification

- **WHEN** at gate one the worker also changed a file under `src/`
- **THEN** the file is restored to the base before the checks run, and the checks see only the
  specification

#### Scenario: The worker user restores gate one's dropped paths

- **WHEN** under `igor serve` at gate one the worker made a directory outside the specification
  and wrote a file in it
- **THEN** the worker user removes that directory and the file in it, which the base does not
  hold, before the first round runs

#### Scenario: A claim lost by the end of the checks is offered

- **WHEN** every check passes, and the claim read when the round ends is lost
- **THEN** the work is offered with that round's result, requesting no reviewers

### Requirement: A failed check goes back to the worker once

Where any check failed or timed out, execution SHALL first restore every path git does not
ignore to the changes it read before the checks, which where #153 is built are the first run's
signed commit's tree, removing any other untracked file; ignored files stay. Under `igor serve`
the worker user SHALL make that restore, from the tree object #175 records before the checks
(`worker-user`, *The Igor publishes the tree it recorded before the checks*); under `igor run`,
Igor's own account makes it. Execution SHALL then empty the outbox, the directory beside the tree where the
worker writes its declarations, and write back into it the declarations it read from the first run. Under `igor serve`,
`worker-user` (#175) keeps the worker's git index copy in the outbox; emptying the outbox removes
it, so execution SHALL make it afresh, as #175 makes it for a run. It SHALL then start the worker once more, in that tree, with
the same instructions and item, and with each check that did not pass: its command, its result,
its exit code, and its output as *The checks' result is published and recorded* redacts and cuts
it. That output SHALL be delimited as untrusted content, as an item's text is, with every
occurrence of the closing delimiter in it escaped.
The second run SHALL pass the budget gate as any run does. Execution SHALL then read the changed
paths and declarations again and apply the refusals of the first requirement to them.

Where #153 is built, the second run's changes SHALL become a second commit, on top of the first
run's signed commit. #153's steps run on that commit's diff alone, and
the commit carries trailers of its own, as #153 sets out. Where #153 is not built, the two runs'
changes SHALL be published as one commit. Where the second run changes nothing the first run
left, no second commit SHALL be made. Execution SHALL then run a second round, under its own
`check_minutes` limit, on the tree the second run leaves.

Where the budget gate refuses the second run, the second run exits with an error or is killed
for a limit before reporting its result, a refusal refuses its changes, or #153 refuses to commit them, execution SHALL
publish the first run's changes, as read before the second run, as a draft with the first round's
result and the first run's summary. Where #153 is built, that is the first run's signed commit
alone. On a later push there is no pull request to open: execution pushes the first run's changes
and returns the pull request to draft, with the comment *The checks' result is published and
recorded* sets for a later push giving the first round's result. Nothing of the second run is published. *A limit does not destroy what the worker already
produced* still governs the second run's own record: its changes are recorded in the execution row, not
published.
Where the item is stopped during the second run, execution SHALL publish nothing.

Where the claim is lost when execution reads it before the checks, while the first round runs, or
when the first round ends, the round SHALL run to its end and no second run SHALL start: the work is offered with that
round's result, under *Work finished before a claim is lost is offered, not discarded*. A claim
found lost during the second run or the second round stops neither: the second round runs to its
end, and the work is offered the same way with its result. Where #153 is built, no model step of
#153's runs once the loss is found, and the second run's changes are offered as #153 offers work
whose claim was lost during its signing steps.

Where the run being checked resolves a conflict on an existing pull request, the merge commit
carries no trailers, as #153 has every merge. Where #153 is built, the second run's changes SHALL
be a second commit on top of that merge, signed as above. Where it is not built, they SHALL join
the merge commit.

Execution SHALL NOT start the worker a third time for the checks. What the last round's checks
report is what is published, and the pull request's summary is that of the last run whose changes
are published. Where the tree the second run leaves equals the base for a new pull request, or the
pull request's head for a later push, execution SHALL publish nothing, neither run's changes, as
for any run that changes nothing.

#### Scenario: A failure the worker fixes does not make a draft

- **WHEN** a check fails, and after the second run every check passes
- **THEN** the pull request is opened as the role's `allow` permits, not as a draft for the checks
- **AND** the execution row records both rounds

#### Scenario: A failure that remains is published once, as a draft

- **WHEN** a check fails, and fails again after the second run
- **THEN** the worker is not started a third time
- **AND** the pull request is opened as a draft naming the check that failed

#### Scenario: A worker given the output is not steered by it

- **WHEN** a failing check's output contains the closing delimiter, followed by text phrased as an
  instruction to the agent
- **THEN** the second run receives it delimited as untrusted content, with that delimiter escaped

#### Scenario: What the first round wrote is gone before the second run

- **WHEN** a failing check rewrites a file the worker changed and writes a new untracked file
- **THEN** before the second run starts, the rewritten file holds the worker's content again and
  the new file is gone

#### Scenario: The worker user restores the tree before the second run

- **WHEN** under `igor serve` a failing check writes a file inside a directory the worker user
  made
- **THEN** the worker user restores the tree from the tree object #175 recorded before the
  checks, and that file is gone before the second run starts

#### Scenario: A resolution's declared revert survives the second run

- **WHEN** a conflict resolution declared a revert, and a check fails
- **THEN** the second run starts with that declaration in the outbox, and its changes are not
  refused for an undeclared revert

#### Scenario: A declaration a check writes is not read

- **WHEN** a failing check writes a declarations file into the outbox
- **THEN** the outbox is emptied before the second run, and that file is never read

#### Scenario: The second round has its own limit

- **WHEN** the first round takes 14 of its 15 minutes and fails
- **THEN** the second round's checks still have 15 minutes

#### Scenario: A second run that undoes everything publishes nothing

- **WHEN** a check fails, and the second run leaves the tree unchanged against the base
- **THEN** nothing is published, neither the first run's commit nor a second one

#### Scenario: A later push whose second run undoes everything pushes nothing

- **WHEN** a revision's check fails, and the second run leaves the tree as the pull request's head
  has it
- **THEN** nothing is pushed

#### Scenario: The second run's changes are a second commit

- **WHEN** #153 is built, a check fails, and the second run fixes it
- **THEN** the pull request gets the first run's signed commit and, on top of it, a second commit
  that #153's steps signed over its own diff, with trailers of its own
- **AND** the second round ran on the second commit's tree

#### Scenario: A second run that changes nothing makes no second commit

- **WHEN** #153 is built, a check fails, and the second run changes nothing the first run left
- **THEN** no second commit is made, and the second round runs on the first commit's tree

#### Scenario: A second run that cannot finish keeps the first run's work

- **WHEN** a check fails, and the second run is refused by the budget gate, exits with an error,
  is killed for a limit before reporting its result, leaves a change the refusals refuse, or leaves a change #153 refuses to
  commit
- **THEN** the first run's changes are published as a draft with the first round's result and the
  first run's summary
- **AND** nothing of the second run is published

#### Scenario: A stop during the second run publishes nothing

- **WHEN** a check fails, and the item is stopped while the second run works
- **THEN** nothing is published

#### Scenario: A claim lost during the second run is offered after the second round

- **WHEN** a check fails, and the claim is found lost while the second run works
- **THEN** the second run and the second round run to their end
- **AND** the work is offered with the second round's result

#### Scenario: A second run after a conflict resolution is a commit on top of the merge

- **WHEN** #153 is built, a conflict resolution fails a check, and the second run fixes it
- **THEN** the merge commit carries the resolution and no trailers
- **AND** a second commit on top of it carries the fix, signed with trailers of its own

#### Scenario: The summary is the published run's

- **WHEN** a check fails, and after the second run every check passes
- **THEN** the pull request's summary is the second run's

#### Scenario: A claim lost during the checks starts no second run

- **WHEN** a check fails, and the claim is found lost while the checks run or when the round ends
- **THEN** the worker is not started again
- **AND** the work is offered with the failed round's result

### Requirement: A run's checks are bounded and killed with the run

Each round of a run's checks SHALL be bounded by its repository's `check_minutes`. At the limit,
execution SHALL kill the running check, record that check as timed out, and record every check of
that round not yet started as not run.

While checks run, execution SHALL re-read the claim on a timer, once per checkpoint interval. A
stop found then, the process standing down under `concurrent-instances` (#179), or a termination
during the checks SHALL kill the running check.

Every kill of a check SHALL be made as *A kill, a release and a sweep reach what the worker owns*
(`worker-user`, #175) makes a kill of a worker: under `igor serve`, of every process the worker
user owns; under `igor run`, of the check's process group.

#### Scenario: A hung test is killed at the limit

- **WHEN** a check is still running when `check_minutes` runs out
- **THEN** under `igor serve`, it and every process it started are killed, including one in a
  new session
- **AND** under `igor run`, its process group is killed
- **AND** it is recorded as timed out at the `check_minutes` limit
- **AND** every later check of that round is recorded as not run

#### Scenario: A stop during the checks publishes nothing

- **WHEN** the item is stopped while a check runs
- **THEN** the check is killed at the next checkpoint, not at the end of the checks
- **AND** nothing is published

#### Scenario: A termination kills the running check

- **WHEN** the Igor is terminated, or stands down, while a check runs
- **THEN** the check is killed: under `igor serve`, every process the worker user owns; under
  `igor run`, the check's process group

### Requirement: The checks' result is published and recorded

An execution row SHALL record, for every round, each check's command line and result: passed, failed, timed out or not run, with
its exit code where it exited and how long it ran where it started. A check that could not start,
or that a signal ended other than at the time limit, is failed with no exit code. Under `igor
serve`, a check starts through #175's wrapper, which runs it as the worker user. Where the wrapper
reports that it could not find the check's program, in a way execution can tell apart from
the program's own exit code, the check counts as one that could not start. The row SHALL
NOT hold a check's output.

A pull request opened after checks SHALL be a draft where any check of the last round did not
pass, whether or not `allow` lists `draft-pr`. Where the code host's call to create a draft
fails because it does not offer drafts there, what execution does depends on the role's `allow`.
Where `allow` lists `pr`, execution SHALL create the pull request again, ready, with its Tests
row saying Igor could not open it as a draft. Where it lists `draft-pr` and not `pr`, execution
SHALL publish nothing and hand the item off, with a comment on the item saying that a check
failed, that the code host refused a draft, and that the role may not open a ready pull
request. Whether opened as a draft or ready,
it SHALL request the role's reviewers, unless the claim was lost.

In the pull request body, the last round's result SHALL appear only in the evidence section that
`review-evidence` (#190) adds, in the wording #190 gives its Tests row, with the output of each
check that failed or timed out in the block #190 lays out under its table.

Before a check's output is published or given to the worker, it SHALL be redacted by
*credential redaction*, the requirement *Credential redaction replaces every credential the Igor
knows* in the change `redact-state-branch` (#217), which matches seat tokens and credential-named
variables' values of at least 8 characters by value, and tokens, private keys and URL
credentials by pattern. It SHALL
then be cut to its last 1,000 characters, both where it is published and where it is given to
the worker. While a check runs, execution SHALL hold at most the last 64 KiB of its output.

Execution SHALL also run the checks, with the same second run where one does not pass, before
every later push of the worker's changes onto an existing pull request: a conflict resolution,
gate two's push under #150, and each revision answering a reviewer. A merge the code host makes
with no worker runs none. Once that push is published, execution SHALL comment on the pull
request, unless the repository declares no checks: a fixed heading saying Igor ran the checks
and the worker did not report them, then the Tests row's value, as #190 words it, then the output
of each check that failed or timed out. Where a check failed, #190's wording of that value says
the pull request is a draft because of it. A push whose checks still fail is published. Where a
check of the last round did not pass, execution SHALL return the pull request to draft; where the
code host refuses that, the comment and the body's Tests row SHALL drop #190's clause saying the
pull request is a draft, and say Igor could not return the pull request to draft.

Where every check of a later push's last round passes, execution SHALL mark the pull request
ready for review when all three hold: Igor's own failed check made it a draft, by opening it as
one or returning it to draft, and nobody has changed its draft state since; the role's `allow`
lists `pr`; and the claim is held. Otherwise a draft stays a draft. Where the code host refuses
to mark it ready, the comment SHALL say Igor could not mark the pull request ready.

#### Scenario: A failing test makes the pull request a draft

- **WHEN** a role allows `pr` and `draft-pr`, and a check exits non-zero in both rounds
- **THEN** the pull request is opened as a draft
- **AND** the role's reviewers are requested, as for a draft opened with no failed check
- **AND** the evidence section's Tests row gives the check's result

#### Scenario: A draft is within `pr`

- **WHEN** a role allows `pr` and not `draft-pr`, and a check fails in both rounds
- **THEN** the pull request is opened as a draft

#### Scenario: A draft-only role publishes nothing where the host refuses a draft

- **WHEN** a role allows `draft-pr` and not `pr`, a check fails in both rounds, and the code
  host refuses to create a draft
- **THEN** no pull request is opened
- **AND** the item is handed off with a comment on the item saying the host refused a draft and
  the role may not open a ready pull request

#### Scenario: A missing program is failed with no exit code under igor run

- **WHEN** under `igor run` a check names a program the Igor's account cannot find
- **THEN** the row records it as failed with no exit code

#### Scenario: Output is held to its last 64 KiB

- **WHEN** a check prints 10 MiB
- **THEN** the buffer execution keeps for the check's output never exceeds 64 KiB

#### Scenario: The row holds no output

- **WHEN** a check fails and prints output
- **THEN** the execution row records its command, result, exit code and duration, and not its
  output

#### Scenario: A credential in a check's output is redacted

- **WHEN** a failing check prints a seat token
- **THEN** the second run, and the output block in the body, hold `[redacted]` where the token
  was

#### Scenario: Only the end of long output is given

- **WHEN** a failing check prints 5,000 characters
- **THEN** the second run, and the output block in the body, receive its last 1,000 characters

#### Scenario: A later push that breaks the tests

- **WHEN** a conflict resolution, gate two's push, or a revision answering a reviewer is
  published to a ready pull request, and a check fails in both rounds
- **THEN** the pull request is returned to draft
- **AND** a comment on it, under the fixed heading, names the failed check

#### Scenario: A refused draft opens the pull request ready

- **WHEN** a role allows `pr`, a check fails in both rounds, and the code host refuses to open
  a draft
- **THEN** the pull request is opened ready, and its Tests row says Igor could not open it as a
  draft

#### Scenario: A program not found is failed with no exit code under serve

- **WHEN** under `igor serve` a check names a program the worker user cannot find, and #175's
  wrapper reports that in a way execution can tell apart from the program's own exit code
- **THEN** the row records it as failed with no exit code, not with the wrapper's exit code

#### Scenario: A refused conversion to draft is reported

- **WHEN** a later push fails a check in both rounds, and the code host refuses to return the
  pull request to draft
- **THEN** the comment and the body's Tests row say Igor could not return the pull request to
  draft, and neither says it is one

#### Scenario: A later push whose checks pass is reported

- **WHEN** a revision answering a reviewer is published, and every check passes
- **THEN** a comment under the fixed heading says each check passed

#### Scenario: A later push whose checks pass marks Igor's draft ready

- **WHEN** a role allows `pr`, Igor returned its pull request to draft for a failed check, and a
  revision answering a reviewer passes every check while the claim is held
- **THEN** the pull request is marked ready for review

#### Scenario: A refused mark-ready is reported

- **WHEN** a later push passes every check on Igor's draft, and the code host refuses to mark it
  ready
- **THEN** the comment says Igor could not mark the pull request ready, and it stays a draft

#### Scenario: A draft a person made stays a draft

- **WHEN** a person converted a pull request to draft, and a later push passes every check
- **THEN** the pull request stays a draft

#### Scenario: No comment where the repository has no checks

- **WHEN** a revision is published onto a pull request whose repository declares no checks
- **THEN** no comment about checks is posted

#### Scenario: A host merge runs no checks

- **WHEN** the code host merges the base branch into the pull request with no worker
- **THEN** no check runs and no comment is posted
