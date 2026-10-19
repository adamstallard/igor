## 0. Order and measurement

- [ ] 0.1 Start after `worker-user` (#175) has merged. The checks reuse its start as the worker
      user, its kill, and its removal of what the worker user wrote.
- [ ] 0.2 Start after `concurrent-instances` (#179) has merged. Its sweep goes by rank, so the
      checks need no change to `src/sweep.ts`.
- [ ] 0.3 Start after `keep-action-log` (#188) and then `review-evidence` (#190) have merged.
      Archive after both, and after #175 and #179.
- [ ] 0.4 Measure whether an Igor's GitHub App, with the permissions `docs/deployment.md` lists,
      may call `convertPullRequestToDraft` on its own pull request. Record the result in this
      change's proposal, replacing its *Still open* item on it. Where it may not, task 3.3's
      comment leaves out the Tests row's clause `the pull request is a draft because of it`
      (#190's task 2.1), and ends
      with this line, verbatim:

      ```
      Igor could not return this pull request to draft.
      ```

## 1. The `repos` map

- [ ] 1.1 In `src/role.ts`, read `repos` from the org base only, as a mapping from `owner/name`
      to `{ checks, check_minutes }`, where an entry with no `checks` declares none. Match a key
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
- [ ] 1.4 Show each of the role's repositories' checks and limit in `igor role explain`.
- [ ] 1.5 Tests for each scenario in the role-config delta.

## 2. Running the checks

- [ ] 2.1 In `src/execute.ts`, run the checks where the worker's run settled with a result
      (it exited on its own, or reported its result before a kill) and `changed` (each changed
      path with its contents) is non-empty: after the claim status is read and after every
      refusal that reads only `changed` (`allow`, path names, conflict markers, undeclared
      reverts, and at gate one the drop of everything outside the specification, restoring each
      dropped path to the base in the tree); where `signed-publishing` (#153) is built, also
      after its staging and signing. Read the claim status again when the checks end. Run each
      line split on spaces, as an argument list with no shell, with the tree as its working
      directory, through the code that starts the worker (under `serve`, `sudo` as the worker
      user; under `run`, directly as the Igor's own user), detached in its own process group.
- [ ] 2.2 Give each check the worker's environment with `CLAUDE_CODE_OAUTH_TOKEN` and
      `ANTHROPIC_API_KEY` always removed. The worker's login, including a lent seat's decrypted
      token under `seat-files` (#171), is passed in one of those two variables, so removing both
      removes it.
- [ ] 2.3 Give each round its own deadline of `check_minutes`. At the deadline, kill the running
      check's group, mark it `timed-out` and the rest of the round `not-run`. Register each
      check's group with the code that kills workers on a stop, a stand-down or a termination.
- [ ] 2.4 While checks run, call `claimStatus` on a timer every `checkpointMs`, never two calls at
      once, and on `stopped` kill the running check and return the stop outcome. On a lost
      claim, finish the round, start no second run, and offer the work with that round's result.
- [ ] 2.5 Keep each check's exit code, duration, and the last 64 KiB of its combined stdout and
      stderr as it runs. Redact that with credential redaction, the function `keep-action-log`
      (#188) task 3.1 builds; then keep its last 1,000 characters and discard the rest. Write
      none of the output to disk or to the execution row.
- [ ] 2.6 Where any check did not pass, restore every path git does not ignore to the changes read
      before the checks, remove any other untracked file, and empty the outbox; where #171
      keeps the worker's git index copy there, make that copy afresh. Then start the worker
      once more through the budget gate, with the run's prompt followed by each such check's
      command, result, exit code and kept output, inside the delimiters an item's untrusted
      text uses, escaping every occurrence of the closing delimiter in the output. Then read
      `changed` and the declarations again, apply task 2.1's refusals to them, stage and sign
      again where #153 is built, and run every check again. On a conflict resolution, add the
      second run's changes to the same merge commit. Never start a third run for the checks.
      Where the second run leaves no change (against the base for a new pull request, against
      the pull request's head for a later push), publish nothing. In four cases, publish the
      first run's changes, as read before the second run, as a draft with the first round's
      result and the first run's summary: the gate refuses the second run; the second run
      exits with an error; it is killed for a limit; or a refusal refuses its changes.
      Otherwise take the summary from the second run.

## 3. Publishing and recording

- [ ] 3.1 Open the pull request as a draft where any check of the last round did not pass,
      whether or not `allow` lists `draft-pr`, still requesting `role.reviewers` unless the
      claim was lost.
- [ ] 3.2 Fill #190's Tests row from the last round's results, in the wording #190's task 2.1
      gives, and put each failed or timed-out check's output block under the table as that task
      lays it out. Write nothing else into the body.
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
      `CodeHost` method backed by GitHub's `convertPullRequestToDraft` mutation.
- [ ] 3.4 Add `checks: [[{ command, result, exitCode, seconds }]]` to the execution row, one list
      per round, with `result` one of `passed`, `failed`, `timed-out`, `not-run`. `exitCode` is
      null for `timed-out` and `not-run`, and for a `failed` check that could not start or that a
      signal ended; `seconds` is null for `not-run` and for a check that could not start.
- [ ] 3.5 Tests for each scenario in the task-execution delta. The worker-user scenario runs
      where `IGOR_TEST_WORKER_USER` is set, as `worker-user`'s task 7.1 does.

## 4. Docs

- [ ] 4.1 `README.md` roles section and `templates/org.yaml`: a commented `repos` entry for one
      repository, with `npm test` and `npx tsc --noEmit` under `checks`, beside the commented
      `commands` entries that permit them.
