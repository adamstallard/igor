## ADDED Requirements

### Requirement: The loop runs the repository's checks in the worker's tree

Where the worker's run ends with a result, having exited on its own or reported its result before a
kill, and changed the tree, execution SHALL run a round (`role-config`). It SHALL run after
execution has read the changed paths, their contents and the claim, and applied every refusal
reading only those changes, among them `allow`, path names, conflict markers, undeclared reverts and
gate one's drop. A run so refused runs no check, but gate one's drop removes changes without refusing the run.

#### Scenario: A run that changed nothing runs no checks

- **WHEN** the worker leaves the tree unchanged
- **THEN** no check runs

#### Scenario: A killed or refused run runs no checks

- **WHEN** the worker is killed for a limit after editing files without reporting a result, or the
  role's `allow` permits no pull request
- **THEN** no check runs

#### Scenario: A run that reported its result before a kill is checked

- **WHEN** the worker reports its result, is killed by a silence window before its process exits,
  and changed the tree
- **THEN** its checks run as for a run that exited on its own

### Requirement: Gate one's dropped paths are restored before the checks

Gate one's drop, under `two-gate-workflow` (#150), drops every change outside the specification gate
one proposes. Each path it drops SHALL be restored to its content in the base's tree before the
round that *The loop runs the repository's checks in the worker's tree* requires. Under `igor serve`
the worker user SHALL make that restore; under `igor run` Igor's own account makes it.

#### Scenario: Gate one checks only the specification

- **WHEN** at gate one the worker also changed a file under `src/`
- **THEN** the file is restored to the base before the checks run, and the checks see only the
  specification

#### Scenario: The worker user restores gate one's dropped paths

- **WHEN** under `igor serve` at gate one the worker made a directory outside the specification
  and wrote a file in it
- **THEN** the worker user removes that directory and the file in it, which the base does not
  hold, before the first round runs

### Requirement: A round runs every check on the tree Igor publishes

A round SHALL run every check, in the order declared, even after one fails; execution SHALL NOT run
a `ci_only` line. Where `signed-publishing` (#153) stages and signs the tree before the commit, the
round SHALL run after that staging and signing, on the signed commit's tree. What a check writes
SHALL NOT reach the artifact, the commit Igor publishes: the artifact carries only the changes
execution read before the last round ran, staged where #153 stages them.

#### Scenario: A failed check does not stop the rest

- **WHEN** the first of two checks exits non-zero
- **THEN** the second still runs, and both results are recorded

#### Scenario: What a check writes is not published

- **WHEN** a check writes a file into the tree, or rewrites a file the worker changed
- **THEN** the artifact carries the worker's changes as they were read before the checks, and not
  what the check wrote

### Requirement: A check runs as the worker ran

Each check SHALL run in its own process group, as the worker's user: under `igor serve`, the worker
user (#175); under `igor run`, Igor's own account. Its environment SHALL be the worker's, less its
model login (`CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY`), with no variable added. It keeps
the worker's proxy variables, such as `HTTPS_PROXY`, a proxy URL's user info included, the only
secret a check gets under #175's *A worker gets a secret only through the Igor, which registers it*.

#### Scenario: A check runs as the worker user

- **WHEN** under `igor serve` a check runs a test the worker wrote
- **THEN** the test runs as the worker user
- **AND** its environment holds neither `CLAUDE_CODE_OAUTH_TOKEN` nor `ANTHROPIC_API_KEY`

#### Scenario: A check keeps the worker's proxy settings

- **WHEN** the worker's environment holds `HTTPS_PROXY` with a user and password in its URL,
  and a check runs
- **THEN** the check's environment holds the same `HTTPS_PROXY`, user and password included

#### Scenario: A check under igor run runs as the Igor

- **WHEN** under `igor run` a check runs
- **THEN** it runs as the Igor's own account, without the model login

### Requirement: A failed check goes back to the worker once

Where any check failed or timed out, execution SHALL restore the tree and the outbox, then start the
worker once more, in that tree, with the same instructions and item and with each check that did not
pass: its command, result, exit code, and output as *A check's output is redacted and cut* requires,
delimited as untrusted content as an item's text is, with every occurrence of the closing delimiter
in it escaped. The second run SHALL pass the budget gate as any run does.

#### Scenario: A failure the worker fixes does not make a draft

- **WHEN** a check fails, and after the second run every check passes
- **THEN** the pull request is opened as the role's `allow` permits, not as a draft for the checks
- **AND** the execution row records both rounds

#### Scenario: A worker given the output is not steered by it

- **WHEN** a failing check's output contains the closing delimiter, followed by text phrased as an
  instruction to the agent
- **THEN** the second run receives it delimited as untrusted content, with that delimiter escaped

### Requirement: The tree is restored before the second run

Where any check failed or timed out, execution SHALL first restore every path git does not ignore to
the changes it read before the checks (where #153 is built, the first run's signed commit's tree),
removing any other untracked file; ignored files stay. Under `igor serve` the worker user SHALL make
that restore, from the tree object of those changes that `worker-user` (#175) records (*The Igor
publishes the tree it recorded before the checks*); under `igor run`, Igor's own account makes it.

#### Scenario: What the first round wrote is gone before the second run

- **WHEN** a failing check rewrites a file the worker changed and writes a new untracked file
- **THEN** before the second run starts, the rewritten file holds the worker's content again and
  the new file is gone

#### Scenario: The worker user restores the tree before the second run

- **WHEN** under `igor serve` a failing check writes a file inside a directory the worker user
  made
- **THEN** the worker user restores the tree from the tree object #175 recorded before the
  checks, and that file is gone before the second run starts

### Requirement: The outbox is rewritten before the second run

After restoring the tree and before the second run, execution SHALL empty the outbox, the directory
beside the tree where the worker writes its declarations, and write back into it the declarations it
read from the first run. Under `igor serve`, emptying it removes the worker's git index copy that
`worker-user` (#175) keeps there, so execution SHALL make that copy afresh, as #175 makes it for a
run.

#### Scenario: A resolution's declared revert survives the second run

- **WHEN** a conflict resolution declared a revert, and a check fails
- **THEN** the second run starts with that declaration in the outbox, and its changes are not
  refused for an undeclared revert

#### Scenario: A declaration a check writes is not read

- **WHEN** a failing check writes a declarations file into the outbox
- **THEN** the outbox is emptied before the second run, and that file is never read

### Requirement: The second run is checked and committed on top of the first

After the second run, execution SHALL read the changed paths and declarations again and apply the
refusals of *The loop runs the repository's checks in the worker's tree*. Where #153 is built, the
second run's changes SHALL be a second commit on the first run's signed commit, with #153's steps
run on its diff alone and trailers of its own, as #153 sets out; where not, both runs' changes SHALL
be published as one commit. A second run changing nothing the first left SHALL make no second
commit.

#### Scenario: The second run's changes are a second commit

- **WHEN** #153 is built, a check fails, and the second run fixes it
- **THEN** the pull request gets the first run's signed commit and, on top of it, a second commit
  that #153's steps signed over its own diff, with trailers of its own
- **AND** the second round ran on the second commit's tree

#### Scenario: A second run that changes nothing makes no second commit

- **WHEN** #153 is built, a check fails, and the second run changes nothing the first run left
- **THEN** no second commit is made, and the second round runs on the first commit's tree

### Requirement: A second run after a conflict resolution commits on top of the merge

Where the run being checked resolves a conflict on an existing pull request, the merge commit
carries no trailers, as #153 has every merge. Where #153 is built, the second run's changes SHALL be
a second commit on top of that merge, signed, with trailers of its own, as for any second commit.
Where it is not built, they SHALL join the merge commit.

#### Scenario: A second run after a conflict resolution is a commit on top of the merge

- **WHEN** #153 is built, a conflict resolution fails a check, and the second run fixes it
- **THEN** the merge commit carries the resolution and no trailers
- **AND** a second commit on top of it carries the fix, signed with trailers of its own

### Requirement: A second run that cannot finish publishes the first run's work

Where the budget gate refuses the second run, the second run exits with an error or is killed for a
limit before reporting its result, a refusal refuses its changes, or #153 refuses to commit them,
execution SHALL publish the first run's changes as read before the second run (where #153 is built,
its signed commit alone) as a draft with the first round's result and the first run's summary, and
nothing of the second run.

#### Scenario: A second run that cannot finish keeps the first run's work

- **WHEN** a check fails, and the second run is refused by the budget gate, exits with an error,
  is killed for a limit before reporting its result, leaves a change the refusals refuse, or leaves a change #153 refuses to
  commit
- **THEN** the first run's changes are published as a draft with the first round's result and the
  first run's summary
- **AND** nothing of the second run is published

### Requirement: On a later push, a second run that cannot finish pushes the first run's work

On a later push, where the second run cannot finish as *A second run that cannot finish publishes
the first run's work* describes, execution SHALL push the first run's changes and return the pull
request to draft, with the comment *Igor comments on a later push's checks* sets, giving the first
round's result.

#### Scenario: A later push whose second run cannot finish pushes the first run's work

- **WHEN** a revision's check fails, and the second run exits with an error
- **THEN** the first run's changes are pushed, and the pull request is returned to draft
- **AND** the comment after the push gives the first round's result

### Requirement: What a stopped, unfinished or undoing second run publishes

A second run that cannot finish has its own changes recorded in the execution row, not published,
as *A limit does not destroy what the worker already produced* has it. Where the item is
stopped during the second run, execution SHALL publish nothing. Where the second run's tree equals
the base for a new pull request, or the pull request's head for a later push, execution SHALL
publish nothing, neither run's changes, as for any run that changes nothing.

#### Scenario: A stop during the second run publishes nothing

- **WHEN** a check fails, and the item is stopped while the second run works
- **THEN** nothing is published

#### Scenario: A second run that undoes everything publishes nothing

- **WHEN** a check fails, and the second run leaves the tree unchanged against the base
- **THEN** nothing is published, neither the first run's commit nor a second one

#### Scenario: A later push whose second run undoes everything pushes nothing

- **WHEN** a revision's check fails, and the second run leaves the tree as the pull request's head
  has it
- **THEN** nothing is pushed

### Requirement: The claim is read around the checks

Execution SHALL read the claim again once a round ends. Where the read before the checks finds a
stop, no check runs. Where a read before the checks, while the first round runs, or as it ends
finds the claim lost, that round SHALL run to its end and no second run SHALL start; a loss found in the
second run or round stops neither, and the second round finishes. Either way the work is
offered with the last round's result, under *Work finished before a claim is lost is offered, not
discarded*.

#### Scenario: A stop found before the checks runs none

- **WHEN** the claim read before the checks reports that the item was stopped
- **THEN** no check runs and nothing is published

#### Scenario: A claim lost by the end of the checks is offered

- **WHEN** every check passes, and the claim read when the round ends is lost
- **THEN** the work is offered with that round's result, requesting no reviewers

#### Scenario: A claim lost during the second run is offered after the second round

- **WHEN** a check fails, and the claim is found lost while the second run works
- **THEN** the second run and the second round run to their end
- **AND** the work is offered with the second round's result

#### Scenario: A claim lost during the checks starts no second run

- **WHEN** a check fails, and the claim is found lost while the checks run or when the round ends
- **THEN** the worker is not started again
- **AND** the work is offered with the failed round's result

### Requirement: No model step of #153's runs after a claim is lost

Where #153 is built and the claim is found lost during the second run or second round, no model step
of #153's SHALL run once the loss is found, and the second run's changes are offered as #153 offers
work whose claim was lost during its signing steps.

#### Scenario: No model step of #153's runs after the second run's claim is lost

- **WHEN** #153 is built, a check fails, and the claim is found lost while the second run works
- **THEN** no model step of #153's runs once the loss is found
- **AND** the second run's changes are offered as #153 offers work whose claim was lost during
  its signing steps

### Requirement: The last round and the last published run are what is published

After the refusals and the commit, if any, of the second run's changes, execution SHALL run a second
round under its own `check_minutes` on the tree the second run leaves, and SHALL NOT start the
worker a third time for the checks. The last round's result is published, with the summary of the
last run whose changes are published.

#### Scenario: A failure that remains is published once, as a draft

- **WHEN** a check fails, and fails again after the second run
- **THEN** the worker is not started a third time
- **AND** the pull request is opened as a draft naming the check that failed

#### Scenario: The summary is the published run's

- **WHEN** a check fails, and after the second run every check passes
- **THEN** the pull request's summary is the second run's

#### Scenario: The second round has its own limit

- **WHEN** the first round takes 14 of its 15 minutes and fails
- **THEN** the second round's checks still have 15 minutes

### Requirement: A run's checks are bounded and killed with the run

At a round's `check_minutes` limit, execution SHALL kill the running check, recording it as timed
out and the round's checks not yet started as not run. Every kill of a check SHALL be made as a
kill of a worker is: under `igor serve`, of every process the worker user owns, as `worker-user`'s
(#175) *A kill, a release and a sweep reach what the worker owns* has it; under `igor run`, of the
check's process group, as *A kill reaches the worker's whole process tree* has it.

#### Scenario: A hung test is killed at the limit

- **WHEN** a check is still running when `check_minutes` runs out
- **THEN** under `igor serve`, it and every process it started are killed, including one in a
  new session
- **AND** under `igor run`, its process group is killed
- **AND** it is recorded as timed out at the `check_minutes` limit
- **AND** every later check of that round is recorded as not run

### Requirement: A stop or termination during the checks kills the running check

While checks run, execution SHALL re-read the claim on a timer, once per checkpoint interval
(`surface-adapter`). A stop found then, the serving process stopping its workers under
`one-process-per-role` (#242)'s *A serving process that cannot rewrite its record stops its
workers*, or a termination during the checks SHALL kill the running check.

#### Scenario: A stop during the checks publishes nothing

- **WHEN** the item is stopped while a check runs
- **THEN** the check is killed at the next checkpoint, not at the end of the checks
- **AND** nothing is published

#### Scenario: A termination kills the running check

- **WHEN** the Igor is terminated, or its serving process stops its workers, while a check runs
- **THEN** the check is killed: under `igor serve`, every process the worker user owns; under
  `igor run`, the check's process group

### Requirement: The checks' result is published and recorded

An execution row is the line execution appends to `executions.ndjson` for each execution of an item;
it holds both worker runs and both rounds where there are two. It SHALL record, for every round,
each check's command line and result: passed, failed, timed out or not run, with its exit code where
it exited and how long it ran where it started. A check that could not start, or that a signal ended
other than at the time limit, is failed with no exit code. The row SHALL NOT hold a check's output.

#### Scenario: A missing program is failed with no exit code under igor run

- **WHEN** under `igor run` a check names a program the Igor's account cannot find
- **THEN** the row records it as failed with no exit code

#### Scenario: The row holds no output

- **WHEN** a check fails and prints output
- **THEN** the execution row records its command, result, exit code and duration, and not its
  output

### Requirement: Under igor serve a check starts through the worker-user wrapper

Under `igor serve`, a check SHALL start through #175's wrapper, which runs it as the worker user.
Where the wrapper reports that it could not find the check's program, in a way execution can tell
apart from the program's own exit code, the check SHALL count as one that could not start.
Where the wrapper reports a missing program in a way execution cannot tell apart, the check SHALL
be recorded as failed with the exit code the wrapper gave.

#### Scenario: A program not found is failed with no exit code under serve

- **WHEN** under `igor serve` a check names a program the worker user cannot find, and #175's
  wrapper reports that in a way execution can tell apart from the program's own exit code
- **THEN** the row records it as failed with no exit code, not with the wrapper's exit code

#### Scenario: A missing program the wrapper does not report apart keeps the wrapper's exit code

- **WHEN** under `igor serve` a check names a program the worker user cannot find, and #175's
  wrapper exits 2 in a way execution cannot tell apart from the program's own exit code
- **THEN** the row records it as failed with exit code 2

### Requirement: A failed check makes the pull request a draft

A pull request opened after checks SHALL be a draft where any check of the last round did not pass,
whether or not `allow` lists `draft-pr`. A `ci_only` line by itself SHALL make no pull request a
draft; a failed check Igor ran still does. Whether opened as a draft or ready, it SHALL request the
role's reviewers, unless the claim was lost.

#### Scenario: A failing test makes the pull request a draft

- **WHEN** a role allows `pr` and `draft-pr`, and a check exits non-zero in both rounds
- **THEN** the pull request is opened as a draft
- **AND** the role's reviewers are requested, as for a draft opened with no failed check
- **AND** the evidence section's Tests row gives the check's result

#### Scenario: A draft is within `pr`

- **WHEN** a role allows `pr` and not `draft-pr`, and a check fails in both rounds
- **THEN** the pull request is opened as a draft

#### Scenario: A CI-only check makes no draft

- **WHEN** every check Igor ran on `org/web` passed, and `org/web` lists a `ci_only` line
- **THEN** the pull request is not a draft because of the `ci_only` line, and opens without
  waiting for any CI result

### Requirement: Where the code host refuses a draft, the role's allow decides

Where the code host refuses to create a draft because it offers none on that repository: if the
role's `allow` lists `pr`, execution SHALL create the pull request again, ready, its Tests row
saying Igor could not open it as a draft; if it lists `draft-pr` and not `pr`, execution SHALL
publish nothing and hand the item off, giving the claim back with a comment on the item
(`graceful-handoff`) saying a check failed, the code host refused a draft, and the role may not open
a ready pull request.

#### Scenario: A draft-only role publishes nothing where the host refuses a draft

- **WHEN** a role allows `draft-pr` and not `pr`, a check fails in both rounds, and the code
  host refuses to create a draft
- **THEN** no pull request is opened
- **AND** the item is handed off with a comment on the item saying the host refused a draft and
  the role may not open a ready pull request

#### Scenario: A refused draft opens the pull request ready

- **WHEN** a role allows `pr`, a check fails in both rounds, and the code host refuses to open
  a draft
- **THEN** the pull request is opened ready, and its Tests row says Igor could not open it as a
  draft

### Requirement: The pull request body gives the last round's result

In the pull request body, the last round's result SHALL appear only in the evidence section
`review-evidence` (#190) adds, in #190's Tests row wording, with each failed or timed-out check's
output in the block #190 lays out under its table. The Tests row SHALL also name each `ci_only` line
as a check Igor did not run, in the wording of this change's task 3.2, which #190 adopts. Igor SHALL
NOT wait for or read the result of any check the repository's CI runs, a `ci_only` line's included.

#### Scenario: A CI-only check is left to the repository's CI

- **WHEN** `org/web` lists `npm test` under `checks` and `npm run test:e2e` under `ci_only`, and
  a worker changes `org/web`
- **THEN** execution runs `npm test` and not `npm run test:e2e`
- **AND** the pull request's Tests row names `npm run test:e2e` as a check Igor did not run

### Requirement: A check's output is redacted and cut

Before a check's output is published or given to the worker, it SHALL be redacted as
`redact-state-branch` (#217)'s *Credential redaction replaces every credential the Igor knows*
requires, then cut to its last 1,000 characters, both where it is published and where it is given to
the worker. While a check runs, execution SHALL hold at most the last 64 KiB of its output.

#### Scenario: Output is held to its last 64 KiB

- **WHEN** a check prints 10 MiB
- **THEN** the buffer execution keeps for the check's output never exceeds 64 KiB

#### Scenario: A credential in a check's output is redacted

- **WHEN** a failing check prints a seat token
- **THEN** the second run, and the output block in the body, hold `[redacted]` where the token
  was

#### Scenario: Only the end of long output is given

- **WHEN** a failing check prints 5,000 characters
- **THEN** the second run, and the output block in the body, receive its last 1,000 characters

### Requirement: Later pushes run the checks too

Execution SHALL run the checks, with the same second run where one does not pass, before every later
push of the worker's changes onto an existing pull request: a conflict resolution, gate two's push
under #150, and each revision answering a reviewer. A merge the code host makes with no worker runs
none. A push whose checks still fail is published.

#### Scenario: A host merge runs no checks

- **WHEN** the code host merges the base branch into the pull request with no worker
- **THEN** no check runs and no comment is posted

### Requirement: Igor comments on a later push's checks

Once a later push is published, execution SHALL comment on the pull request, unless the repository
declares no checks: a fixed heading, the one task 3.3 gives, saying the results are Igor's own,
not the worker's report, then the Tests row's value, as #190 words it, then the output of each
check that failed or timed out. Where a check failed, #190's wording of that value says the pull
request is a draft because of it.

#### Scenario: A later push whose checks pass is reported

- **WHEN** a revision answering a reviewer is published, and every check passes
- **THEN** a comment under the fixed heading says each check passed

#### Scenario: No comment where the repository has no checks

- **WHEN** a revision is published onto a pull request whose repository declares no checks
- **THEN** no comment about checks is posted

### Requirement: A later push that fails a check returns the pull request to draft

Where a check of a later push's last round did not pass, execution SHALL return the pull request to
draft. Where the code host refuses to return it to draft, the comment and the body's Tests row SHALL
drop #190's clause saying the pull request is a draft, and say Igor could not return it to draft.

#### Scenario: A later push that breaks the tests

- **WHEN** a conflict resolution, gate two's push, or a revision answering a reviewer is
  published to a ready pull request, and a check fails in both rounds
- **THEN** the pull request is returned to draft
- **AND** a comment on it, under the fixed heading, names the failed check

#### Scenario: A refused conversion to draft is reported

- **WHEN** a later push fails a check in both rounds, and the code host refuses to return the
  pull request to draft
- **THEN** the comment and the body's Tests row say Igor could not return the pull request to
  draft, and neither says it is one

### Requirement: A later push that passes makes Igor's draft ready

Where every check of a later push's last round passes, execution SHALL mark the pull request ready
for review when all three hold: Igor's own failed check made it a draft, by opening it as one or
returning it to draft, and nobody has changed its draft state since; the role's `allow` lists `pr`;
and the claim is held. Otherwise a draft stays a draft. Where the code host refuses to mark it
ready, the comment SHALL say Igor could not mark the pull request ready.

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
