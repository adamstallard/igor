## 0. Order and measurement

- [ ] 0.1 Start after `worker-user` (#175) has merged. The checks reuse its start as the worker
      user, its kill, and its removal of what the worker user wrote.
- [ ] 0.2 Start after `concurrent-instances` (#179) has merged. Its sweep goes by rank, so the
      checks need no change to `src/sweep.ts`.
- [ ] 0.3 Start after `redact-state-branch` (#217), `keep-action-log` (#188) and then
      `review-evidence` (#190) have merged. Archive after #217, #188 and #190, and after #175
      and #179.
- [ ] 0.4 Measure whether an Igor's GitHub App, with the permissions `docs/deployment.md` lists,
      may call `convertPullRequestToDraft` and `markPullRequestReadyForReview` on its own pull
      request. Record the result in this
      change's proposal, replacing its *Still open* item on it. Where it may not, task 3.3's
      comment leaves out the Tests row's clause `the pull request is a draft because of it`
      (#190's task 2.1), and ends
      with this line, verbatim:

      ```
      Igor could not return this pull request to draft.
      ```

      Where it may not mark one ready, task 3.3's comment ends with this line, verbatim:

      ```
      Igor could not mark this pull request ready for review.
      ```

- [ ] 0.5 Measure whether the code host opens a draft pull request on each kind of repository
      Igor works, including a private repository on a plan that offers no drafts, and how a
      refusal shows. Where the code host refuses and the role's `allow` lists `pr`, open the
      pull request ready, with this clause in the Tests row in place of #190's draft clause,
      `the pull request is a draft because of it`, verbatim:

      ```
      Igor could not open this pull request as a draft.
      ```

      Where the role's `allow` lists `draft-pr` and not `pr`, open nothing and hand the item
      off with this comment, which may be reworded so long as it says all three things
      (proposal, decision 31):

      ```
      A check failed, so Igor would have opened this work as a draft pull request, but the code host refused a draft here, and this role may not open a pull request that is ready for review. Nothing was published.
      ```

- [ ] 0.6 Measure what a check naming a missing program reports under `serve`, started through
      #175's `sudo` and `env` wrapper, and whether it can be told from a program that runs and
      exits with the same code. Record the result in this change's proposal, replacing its
      *Still open* item on it. Where it can be told apart, count that report as a check that
      could not start; where it cannot, record the check as failed with that exit code.

- [ ] 0.7 Measure whether GitHub's timeline for a pull request names the actor of each
      conversion to draft and each mark-ready, so Igor can tell its App's own conversion from a
      person's. Record the result in this change's proposal, replacing its *Still open* item on
      it. Where it cannot, task 3.3 never marks a pull request ready.

## 1. The `repos` map

- [ ] 1.1 In `src/role.ts`, read `repos` from the org base only, as a mapping from `owner/name`
      to `{ checks, check_minutes, ci_only }`, where an entry with no `checks` declares none. Match a key
      to a source's repository ignoring case. Refuse `repos` in an intermediate base or a role
      file as a key nobody reads; refuse a key not of the form `owner/name`, two keys that differ
      only in case, and any other key inside an entry, naming it. A refused entry refuses every
      role.
- [ ] 1.2 Refuse a check that is empty, begins or ends with a space, or holds two spaces in a
      row, a tab, a newline, or any of these characters:
      ``; & | < > ( ) ' " \ $ ` * ? [ ] { } ~ # !``, and a `check_minutes` that is
      not a whole number from 1 to 60. Default `check_minutes` to 15. Name the check or key and
      the repository in each refusal.
- [ ] 1.3 Refuse a role whose `allow` lists `pr` or `draft-pr` when a check of a repository in
      its `sources` is a line no effective `commands` entry permits. A `cmd:*` entry permits
      `cmd` alone or followed by a space and arguments; any other entry permits only the
      identical line. Name the check and the repository.
- [ ] 1.3a Read each entry's `ci_only`, a list of lines Igor never runs (proposal, decision
      32). Refuse a `ci_only` line as task 1.2 refuses a check, and a line listed under both
      `checks` and `ci_only`, naming it and the repository. Do not test a `ci_only` line against
      `commands`.
- [ ] 1.4 Show each of the role's repositories' checks and limit in `igor role explain`, and its
      `ci_only` lines, marked as not run by Igor.
- [ ] 1.5 Tests for each scenario in the role-config delta.

## 2. Running the checks

- [ ] 2.1 In `src/execute.ts`, run the checks where the worker's run settled with a result (it
      exited on its own, or reported its result before a kill) and `changed` (each changed
      path with its contents) is non-empty: after the claim status is read and is not
      `stopped`, and after every refusal that reads only `changed` (`allow`, path names,
      conflict markers, undeclared reverts, and at gate one the drop of everything outside the
      specification, after which each dropped path gets back its content in the base's tree,
      restored as the worker user under `serve` and as the Igor's own user under `run`); where
      `signed-publishing` (#153) is built, also after its staging and signing. Read the claim status
      again when the checks end. Run each line split on spaces, as an argument list with no
      shell, with the tree as its working directory, through the code that starts the worker
      (under `serve`, `sudo` as the worker user; under `run`, directly as the Igor's own
      user), detached in its own process group.
- [ ] 2.2 Give each check the worker's environment with `CLAUDE_CODE_OAUTH_TOKEN` and
      `ANTHROPIC_API_KEY` always removed. The worker's login, including a lent seat's decrypted
      token under `seat-files` (#171), is passed in one of those two variables, so removing both
      removes it.
- [ ] 2.2a Add no variable to a check's environment beyond what task 2.2 gives it, and run no
      `ci_only` line. Test: a role whose repository lists a `ci_only` line runs only its
      `checks`.
- [ ] 2.3 Give each round its own deadline of `check_minutes`. At the deadline, kill the running
      check, mark it `timed-out` and the rest of the round `not-run`. Kill a check through
      #175's kill of a worker: under `serve`, every process the worker user owns; under `run`,
      the check's process group. Register each check with the code that kills workers on a stop,
      a stand-down or a termination.
- [ ] 2.4 While checks run, call `claimStatus` on a timer every `checkpointMs`, never two calls at
      once, and on `stopped` kill the running check and return the stop outcome. On a lost
      claim, finish the round, start no second run, and offer the work with that round's result.
- [ ] 2.5 Keep each check's exit code, duration, and the last 64 KiB of its combined stdout and
      stderr as it runs. Redact that with credential redaction, `redact` in `src/redact.ts`,
      which `redact-state-branch` (#217) implements; then keep its last 1,000 characters and discard
      the rest. Write
      none of the output to disk or to the execution row.
- [ ] 2.6 Where any check did not pass, restore the tree: under `serve` as the worker user,
      from the tree object #175 records before the checks; under `run` as the Igor's own
      account. Restore every path git does not ignore to the changes read before the checks
      (where #153 is built, the first commit's tree), and remove any other untracked file.
      Empty the outbox and write back the first run's declarations; under `serve`, emptying the
      outbox removes #175's git index copy, so make it afresh as #175 makes it for a run. Then start the worker once
      more through the budget gate, with the run's prompt followed by each such check's
      command, result, exit code and kept output, inside the delimiters an item's untrusted
      text uses, escaping every occurrence of the closing delimiter in the output. Then read
      `changed` and the declarations again, and apply task 2.1's refusals to them. Where #153
      is built, make the second run's changes a second commit on top of the first run's signed
      commit, through #153's steps on that commit's diff alone, with its own trailers, also on
      a conflict resolution, where it goes on top of the merge; make no second commit where
      the second run changed nothing. Where #153 is not built, publish both runs' changes as
      one commit, and on a conflict resolution add them to the merge commit. Then run every
      check again on the tree the second run leaves. Never start a third run for the checks.
      Where that tree equals the base for a new pull request, or the pull request's head for a
      later push, publish neither run's changes. In five cases, publish the first run's
      changes, as read before the second run (where #153 is built, its signed commit alone), as
      a draft with the first round's result and the first run's summary: the gate refuses the
      second run; the second run exits with an error; it is killed for a limit before reporting its result; a refusal
      refuses its changes; or #153 refuses to commit them. Otherwise take the summary from the
      second run.

## 3. Publishing and recording

- [ ] 3.1 Open the pull request as a draft where any check of the last round did not pass,
      whether or not `allow` lists `draft-pr`, still requesting `role.reviewers` unless the
      claim was lost.
- [ ] 3.2 Fill #190's Tests row from the last round's results, in the wording #190's task 2.1
      gives, and put each failed or timed-out check's output block under the table as that task
      lays it out. Add to the row each `ci_only` line, with this wording, which #190's task 2.1
      adopts (`proposal.md`, decision 33). Whoever builds this may reword it, changing #190's
      task 2.1 to match, so long as it says Igor did not run the check:

      ```
      `<line>`: CI-only, not run by Igor.
      ```

      Do not wait for or read the CI's result. Write nothing into the body beyond the Tests row
      and the output blocks.
- [ ] 3.3 On every push of the worker's changes onto an existing pull request (a conflict
      resolution, gate two's push, a revision answering a reviewer; not a clean server-side
      `catchUp`, the path where the code host merges the base with no worker), run the checks
      before the push, with task 2.6's second run, and, once it is published, comment on the
      pull request whatever the result, unless the repository declares no checks. The comment
      is this line, verbatim, then the Tests row's value and any output blocks as #190's task
      2.1 words them:

      ```
      **Checks Igor ran on this push before publishing it, not reported by the worker:**
      ```

      Where a check of the last round did not pass, return the pull request to draft with a new
      `CodeHost` method backed by GitHub's `convertPullRequestToDraft` mutation. Where every
      check passed, the role's `allow` lists `pr`, the claim is held, and the pull request is a
      draft because Igor made it a draft for a failed check, with no change to its draft state since (the
      latest draft event on its timeline is the App's own, or it was opened as a draft for a
      failed check and never marked ready), mark it ready with a `CodeHost` method backed by
      `markPullRequestReadyForReview`.
- [ ] 3.4 Add `checks: [[{ command, result, exitCode, seconds }]]` to the execution row, one list
      per round, with `result` one of `passed`, `failed`, `timed-out`, `not-run`. `exitCode` is
      null for `timed-out` and `not-run`, and for a `failed` check that could not start or that a
      signal ended; `seconds` is null for `not-run` and for a check that could not start. The
      row also holds each worker run's cost and transcript, and `draftedForChecks`: true where
      Igor opened the pull request as a draft, or returned it to draft, for a failed check.
- [ ] 3.5 Tests for each scenario in the task-execution delta. The worker-user scenario runs
      where `IGOR_TEST_WORKER_USER` is set, as `worker-user`'s task 7.1 does.

## 4. Docs

- [ ] 4.1 `README.md` roles section and `templates/org.yaml`: a commented `repos` entry for one
      repository, with `npm test` and `npx tsc --noEmit` under `checks`, beside the commented
      `commands` entries that permit them, and a commented `ci_only` line with this comment
      above it, which may be reworded so long as it says that these checks need a secret, that
      Igor does not run them, and that the repository's own CI runs them:

      ```
      # Checks that need a secret. Igor never gives a check a secret and does not run these; the repository's own CI runs them on the pull request, with its own secrets.
      ```
