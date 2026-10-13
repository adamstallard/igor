## 0. Order

- [ ] 0.1 Start after `worker-user` (#175) has merged. The checks reuse its start as the worker
      user, its kill, and its removal of what the worker user wrote.
- [ ] 0.2 Start after `concurrent-instances` (#179) has merged. Its sweep goes by rank, so the
      checks need no change to `src/sweep.ts`.

## 1. Role keys

- [ ] 1.1 Add `checks` and `check_minutes` to `ROLE_KEYS` and `Role` in `src/role.ts`. Merge
      `checks` by appending, `check_minutes` by override, with a default of 15 and a maximum of 60.
- [ ] 1.2 Refuse a role whose effective check no effective `commands` entry permits. A `cmd:*`
      entry permits `cmd` alone or followed by a space and arguments; any other entry permits only
      the identical line. Also refuse a check holding a newline or any of these characters:
      ``; & | < > ( ) ' " \ $ ` ``. Name the check and the role in each refusal.
- [ ] 1.3 Show both keys, with their provenance, in `igor role explain`.
- [ ] 1.4 Tests: accumulation, both refusals, the default and the maximum, explain output.

## 2. Running the checks

- [ ] 2.1 In `src/execute.ts`, run the checks after `changed` is read and non-empty, and before
      the claim status is read. Run each line split on spaces, as an argument list with no shell,
      with the tree as its working directory, through the same start the worker uses (`sudo` as
      the worker user, or directly in same-user mode), detached in its own process group.
- [ ] 2.2 Give each check the worker's environment without `CLAUDE_CODE_OAUTH_TOKEN` and without
      any variable `AMBIENT_TOKENS` names.
- [ ] 2.3 Share one deadline of `check_minutes` across the run's checks. At the deadline, kill
      the running check's group, mark it `timed-out` and the rest `not-run`. Register each check's
      group with the code that kills workers on a stop or termination.
- [ ] 2.4 While checks run, call `claimStatus` on a timer every `checkpointMs`, never two calls at
      once, and on `stopped` kill the running check and return the stop outcome.
- [ ] 2.5 Keep each check's exit code, duration, and the last 1,000 characters of its combined
      stdout and stderr. Keep the output only in memory, for the body line, and redact it as the
      task-execution delta says before it is used.

## 3. Publishing and recording

- [ ] 3.1 Open the pull request as a draft where any check did not pass, whatever `allow`
      prefers, still requesting `role.reviewers`.
- [ ] 3.2 Append the checks line to `prBody`, after the summary and outside `PR_BODY_LIMIT`. The
      wording is the deliverable; it may be reworded only in review of this change:

      ```
      Checks run by Igor, not the worker: `npm test`, `npx tsc --noEmit` passed.
      ```
      ```
      Checks run by Igor, not the worker: `npm test` failed (exit 1); `npx tsc --noEmit` passed. Igor opened this pull request as a draft because of it.
      ```
      followed, for each check that did not pass, by a fenced block of the end of its output.
      ```
      Checks run by Igor, not the worker: `npm test` timed out after 15 minutes; `npx tsc --noEmit` was not run. Igor opened this pull request as a draft because of it.
      ```
      ```
      Igor ran no checks: role `frontend` declares none.
      ```
- [ ] 3.3 On the resolution path, comment on the pull request with the same line and any output,
      whatever the result. Where a check did not pass, return the pull request to draft with a
      new `CodeHost` method backed by GitHub's `convertPullRequestToDraft` mutation, and say
      `Igor returned this pull request to draft because of it.` in place of the opened-as-draft
      sentence.
- [ ] 3.4 Add `checks: [{ command, result, exitCode, seconds }]` to the execution row, with
      `result` one of `passed`, `failed`, `timed-out`, `not-run`.
- [ ] 3.5 Tests for each scenario in the task-execution delta. The worker-user scenario runs
      where `IGOR_TEST_WORKER_USER` is set, as `worker-user`'s task 7.1 does.

## 4. Docs

- [ ] 4.1 `README.md` roles section and `templates/org.yaml`: `checks` beside `commands`, with
      the commented `npm test` and `npx tsc --noEmit` examples repeated under `checks`.
