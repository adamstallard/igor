## Decisions

**Decided by Adam:**

1. **Checks are declared per repository, in a `repos` map in the org base, `roles/org.yaml`**
   (Adam, 2026-10-18, on #154). `repos` maps a repository, as `owner/name`, to the list of
   exact command lines Igor runs on every change to it, under `checks`, and to their time
   limit, `check_minutes`. Every role with that repository in its `sources` gets the same
   checks; a repository with no entry gets none. Only the org base may name `repos`; no role
   key declares a check. *Rejected:* a `checks` key on each role, accumulating down inheritance.
   Checks belong to the repository, not to whichever role touches it, and the one lore
   repository, which holds every role file, serves many code repositories with different
   checks.
2. **A failed check goes back to the worker once** (Adam, 2026-10-18). A round is one pass
   through every check of the repository. Where any check of the first round fails or times out, the loop starts the worker a second time in the same tree, giving it each such
   check's command, result, exit code and the end of its output, and runs every check again on
   what that run leaves. Where a check still does not pass, Igor publishes a draft pull request
   that names each check that failed. *Rejected:* publishing a draft at once, which hands a
   reviewer a failure the worker could often have fixed; and retrying until the checks pass,
   which has no bound on cost.
3. **A draft is within `pr`** (Adam, 2026-10-13). A role whose `allow` lists `pr` and not
   `draft-pr` still gets a draft when a check still fails. `allow` says what the work may
   become, and a draft is a pull request not yet ready. *Rejected:* opening the pull request
   ready because `allow` lists only `pr`, which presents failing work as ready for review.
4. **Checks run after #153's staging and signing** (Adam, 2026-10-13), so they test the tree
   that is published. #153 (`signed-publishing`) signs every commit Igor pushes other than a
   merge; its prose pass, a model step, may edit docs and comments before it signs. The second
   run's changes are staged and signed again before the checks run again. A conflict resolution
   is a merge and carries no signature: Igor stages the merged tree in the clone the worker worked in, and the checks
   run on that. Where this change is built before #153, nothing is staged or signed, and the
   checks run once the loop has read the changes. *Rejected:* checks before signing, which test
   a tree the prose pass may still change.
5. **Which account a check runs as follows the command that started the Igor** (Adam,
   2026-10-17). Under #175 (`worker-user`), `igor serve` always runs its worker as a separate
   worker user and `igor run` never does, so a check runs as the worker user under `serve` and as
   the Igor's own account under `run`. Under `run` a check can read the Igor's credentials, such
   as its GitHub App key; so can the worker that wrote the code the check runs, and #175 accepts
   that for `igor run`, the one-shot command for development. *Rejected:* checks as the Igor's
   own account under `serve`, which hands repository code the Igor's App key and the tokens of
   every seat it holds; and building this change before #175, which would leave #175 two starts
   of repository code to move to the worker user, the worker's and the checks', instead of one.
6. **A pull request opened after a lost claim requests no reviewers**, even with a failed check
   (Adam, 2026-10-13). *Rejected:* requesting them anyway, which asks people to review work the
   Igor no longer holds the issue for.
7. **Checks run before every later push of the worker's changes onto an existing pull
   request**: a conflict resolution, gate two's push under #150, and each revision answering a
   reviewer (Adam, 2026-10-13). Once the push is published, a comment with a fixed heading
   reports the result, and a still-failing check returns the pull request to draft. The comment
   is posted only on a repository that declares checks. A clean merge the code host makes with
   no worker runs no checks. *Rejected:* checking only the opening run, which leaves gate two's
   implementation untested; reporting only through the table #190 rebuilds in the body after
   every push, which adds nothing to the pull request's timeline for a watcher to see; and a
   comment on every push of a repository with no checks, which says nothing.
8. **The checks' result is written only into #190's evidence table**, in #190's wording, with
   each failed check's output in the block #190 lays out under the table (Adam, 2026-10-13). The
   comment in decision 7 is the one exception. *Rejected:* a line of this change's own in the
   body, which would give the same result two wordings and two places.
9. **This change builds and archives after #188 (`keep-action-log`) and #190
   (`review-evidence`)** (Adam, 2026-10-13). It also follows #175, under decision 5, and #179,
   whose sweep it relies on (*Impact*). #153 may land before or after it. #204, the one list of
   the archive order, does not list this change, #188 or #190 (*Still open*).

**Proposed, for Adam to approve:**

10. **A check is an exact command line, run as its words with no shell, and a role that may open
    a pull request is refused when its `commands` does not permit a check of a repository in its
    `sources`.** The reason: without it, the loop would run on the role's behalf a command the
    role may not run. The cost, for Adam to accept: granting a check's command also lets the
    worker run it itself, with the seat's token in its environment, which a check never gets
    (decision 19). A role whose `allow` lists neither `pr` nor `draft-pr` runs no check and needs no such
    permission. A line
    holding any of ``; & | < > ( ) ' " \ $ ` * ? [ ] { } ~ # !``, a tab, a newline or two spaces
    in a row, or beginning or ending with a space, is refused at load. So `npm test && curl …`
    cannot pass as a line `npm test:*` permits, and `npm test src/*.ts` cannot pass a `*` its
    author meant a shell to expand.
    *Rejected:* running every `commands` entry, since those are permission patterns, not command
    lines: `git log:*` is no check, and `npm test:*` names no single line to run. Also rejected:
    running each line through `sh -c`, under which the permitted-by-`commands` rule means
    nothing.
11. **One time limit, `check_minutes`, covers each round of a run's checks:** a whole number from
    1 to 60, default 15, set on the repository's entry beside its checks, since how long a
    repository's tests take is the repository's property. 15 and 60 are starting points to tune
    against observation, not derived values. At the limit the running check is killed and
    recorded as timed out, and the rest as not run. *Rejected:* a fixed constant, which a
    repository with slow tests cannot change; no limit, under which a hung test holds the run and
    its tree with no end; and a role setting, which would let two roles give one repository's
    checks different limits.
12. **Checks run only on work the loop would publish:** after it reads the changed paths and
    their contents, reads the claim, and applies every refusal that reads only the changes
    (`allow`, path names, conflict markers, undeclared reverts, and gate one's drop of everything
    outside the specification, whose paths are restored before the checks). The second run's
    changes pass the same refusals before the second round. The claim is read again when the
    checks end. A worker stopped, or killed for a limit before reporting a result, runs none. *Rejected:* checks before
    those refusals, which spend a round of checks and a second model run on work that is then
    refused; and checks before the read, which would publish what the checks write, such as test
    snapshots and build output.
13. **A check's output is redacted, then cut to its last 1,000 characters,** both where it is
    published and where it goes back to the worker. Redacting first means a token the cut would
    split is still found. The loop keeps only the last 64 KiB of a check's output while it runs,
    so a check that prints without end cannot fill the Igor's memory.
14. **Before the second run, the tree is restored to the changes read before the checks, and the
    outbox is emptied,** so nothing the first round wrote, such as a coverage report or a
    declarations file, is read as the second run's work. In the failed output given to the second
    run, every occurrence of the closing delimiter is escaped, so a check cannot end the
    untrusted span.
15. **A lost claim, found before or during the first round, starts no second run.** The round
    runs to its end, and the work is offered under *Work finished before a claim is lost is
    offered, not discarded*, with that round's result. A claim found lost during the second run
    or the second round stops neither, and the work is offered with the second round's result.
    *Rejected:* a second run after the claim is lost, which spends the seat on an item the Igor
    no longer holds.
16. **A second run that cannot finish keeps the first run's work.** It passes the budget gate as
    any run does. In four cases the loop publishes the first run's changes, as a draft with the
    first round's result and the first run's summary: the gate refuses the second run; the second
    run exits with an error; it is killed for a limit; or a refusal refuses its changes. Where the item is stopped during the second run, nothing is
    published. *Rejected:* publishing nothing on a failed retry, which discards work the worker
    finished.
17. **After a conflict resolution, the second run's changes join the same merge commit,** which
    carries no signature (decision 4). *Rejected:* a separate signed commit on top of the merge,
    which publishes two commits for one resolution.
18. **The pull request's summary is that of the run whose changes are published:** the second
    run's, except under decision 16. The execution row keeps both rounds' checks.
19. **A check gets the worker's environment without its model login,** both
    `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY`. A repository whose tests call Anthropic's
    API gets no key from Igor. *Rejected:* passing `ANTHROPIC_API_KEY`, which hands repository
    code the key the seat spends.
20. **A `repos` key matches a source's repository ignoring case,** as GitHub's names do, and two
    keys that differ only in case are refused. *Rejected:* an exact match, under which `Org/Web`
    silently gives `org/web` no checks.
21. **Every check of a round runs, even after one fails,** so the worker and the reviewer see every
    failure at once. *Rejected:* stopping at the first failure, which hides the other failures from
    the one second run the worker gets.
22. **A second run that leaves no change publishes nothing,** as any run that changes nothing,
    even where the first run's work failed a check. On a later push, publishing nothing means the
    reviewer's requested revision is not pushed; the reviewer learns of it only from the run's
    outcome, as for any run that changes nothing. *Rejected:* publishing the first run's failing work, which the worker has just undone.
23. **The execution row keeps, per round, each check's command, result (`passed`, `failed`,
    `timed-out`, `not-run`), exit code and seconds,** never its output. A check that could not
    start, or that a signal ended other than at the time limit, is `failed` with no exit code.

**Still open:**

- **Whether a later change should let a role add checks of its own on top of its repository's.**
  #154 proposed it on 2026-10-01; this change lets no role add or drop a check. *Recommendation:*
  not until a role needs one; a check every role on a repository runs is the common case, and a
  role key added later changes nothing here.
- **Whether a later push whose checks pass marks the pull request ready again.** This change
  returns a pull request to draft on a failure and never undoes it. *Recommendation:* mark it
  ready where Igor's own failed check made it a draft, the role's `allow` lists `pr`, and the
  claim is held.
- **#204 lists none of this change, #188 or #190** (for Adam, who keeps that list).
  *Recommendation:* add them after #175 and #179, in the order #188, #190, then this change.
- **Whether the GitHub App may call `convertPullRequestToDraft`** is not measured (task 0.4).
  Where it may not, the comment after the push says Igor could not return the pull request to
  draft, in place of the Tests row's claim that it is one.

## Why

The loop runs no test or lint command (#186). The worker's system prompt lists the role's
commands and leaves testing to the worker (`src/execute.ts:169-182`). The pull request body is
the worker's own summary (`prBody`, `src/execute.ts:1169-1185`). So the only evidence that a
change passes is the worker saying so. Igor also never runs `git commit`, so a repository's
pre-commit hooks never run on its changes (#154). This change runs no hooks: a repository gets
what its hooks run only by declaring the same commands as checks.

## What Changes

- A new org-base key, `repos`, mapping each repository to its `checks` and `check_minutes`.
- After the worker exits and its changes are read, the loop runs the repository's checks in the
  worker's tree, as the worker's user, with the worker's environment less its model login,
  within a time limit for
  each round, re-reading the claim while they run.
- Where a check does not pass, the worker runs once more with the failures, and the checks run
  again. A check that still does not pass opens the pull request as a draft.
- The last round's result fills the Tests row of `review-evidence`'s evidence table: each check
  passed, failed with its exit code and the end of its output, timed out, or was not run; or the
  repository declares none.
- Each execution row records every round's checks: command, result, exit code and duration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `role-config`: the org base's `repos` map, the one key only the org base may hold, and the refusal of a role whose `commands` does not permit its repositories' checks.
- `task-execution`: the loop runs the checks, sends a failure back to the worker once, and
  publishes and records the result.

## Impact

- **Depends on `worker-user` (#175).** Under `serve` the checks use #175's code for starting a
  process as the worker user, killing it, and removing what the worker user wrote. Under `run`
  they run as the Igor's own user, as the worker does.
- **Built after `concurrent-instances` (#179).** Its sweep removes leftover trees by rank, not by
  age, so a tree held through the checks and the second run needs no change to the sweep.
- **Overlaps `review-evidence` (#190)**, which owns the table, its Tests row wording, and the
  output block under it. #190 needs amending in three places. It words the checks as the role's
  (`not checked: the role declares no checks`, the role's `check_minutes`, the order the role
  declares them), where under decision 1 they are the repository's. It says this change writes
  only into its table, while decision 7 adds a comment after a later push. And its failed Tests
  row says the pull request is a draft, which is false where GitHub refuses the conversion
  (task 0.4).
- **Overlaps `keep-action-log` (#188)**, which defines *credential redaction* and builds its
  function.
- **Overlaps `worker-user` (#175)**, whose task-execution delta also states that what a check
  writes is not published, under a scenario of the same name as this change's. That rule belongs
  to this change, and #175 needs only to point to it.
- **#153** plans its archive merge around a `checks` addition to *Merge semantics differ by field
  kind*. This change does not modify that requirement, so #153 needs that addition dropped from
  its plan, in #153's own pull request.
- Code: `src/role.ts`, `src/execute.ts`, and the GitHub adapter (returning a pull request to
  draft). Docs: `README.md` roles section, `templates/org.yaml`.
