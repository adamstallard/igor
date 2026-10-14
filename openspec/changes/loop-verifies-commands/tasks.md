## 0. Order

- [ ] 0.1 Start after `worker-user` (#175) has merged. The checks reuse its start as the worker
      user, its kill, and its removal of what the worker user wrote.
- [ ] 0.2 Start after `concurrent-instances` (#179) has merged. Its sweep goes by rank, so the
      checks need no change to `src/sweep.ts`.
- [ ] 0.3 Archive this change only after `keep-action-log` (#188) and `review-evidence` (#190)
      are archived, so the requirements and wording it points at are in force first.

## 1. Role keys

- [ ] 1.1 Add `checks` and `check_minutes` to `ROLE_KEYS` and `Role` in `src/role.ts`. Merge
      `checks` by appending, `check_minutes` by override, with a default of 15, refusing any
      value that is not a whole number from 1 to 60.
- [ ] 1.2 Refuse a role whose effective check no effective `commands` entry permits. A `cmd:*`
      entry permits `cmd` alone or followed by a space and arguments; any other entry permits only
      the identical line. Also refuse a check holding a newline or any of these characters:
      ``; & | < > ( ) ' " \ $ ` ``. Name the check and the role in each refusal.
- [ ] 1.3 Show both keys, with their provenance, in `igor role explain`.
- [ ] 1.4 Tests: accumulation, both refusals, the default and the maximum, explain output.

## 2. Running the checks

- [ ] 2.1 In `src/execute.ts`, run the checks after `changed` is read and non-empty, and before
      the claim status is read; where `signed-publishing` (#153) has shipped, after its staging
      and signing, so that anything a check writes stays unstaged and is not published. Run each
      line split on spaces, as an argument list with no shell,
      with the tree as its working directory, through the same start the worker uses (`sudo` as
      the worker user, or directly in same-user mode), detached in its own process group.
- [ ] 2.2 Give each check the worker's environment without `CLAUDE_CODE_OAUTH_TOKEN` and without
      any variable `AMBIENT_TOKENS` names.
- [ ] 2.3 Share one deadline of `check_minutes` across the run's checks. At the deadline, kill
      the running check's group, mark it `timed-out` and the rest `not-run`. Register each check's
      group with the code that kills workers on a stop or termination.
- [ ] 2.4 While checks run, call `claimStatus` on a timer every `checkpointMs`, never two calls at
      once, and on `stopped` kill the running check and return the stop outcome.
- [ ] 2.5 Keep each check's exit code, duration, and its combined stdout and stderr. Redact the
      whole output with credential redaction, the function described in `keep-action-log`
      (#188) task 3.1. Build that function here only if neither #188 nor #190 has shipped, as
      that task says; then keep its last 1,000
      characters, only in memory, for the body. Redacting first means a token the cut would
      split is still found.

## 3. Publishing and recording

- [ ] 3.1 Open the pull request as a draft where any check did not pass, whether or not `allow`
      lists `draft-pr`, still requesting `role.reviewers` unless the claim was lost.
- [ ] 3.2 Where `review-evidence` (#190) has shipped, fill its Tests row from the checks' results,
      in its wording and its body order. Until it ships, append one line to `prBody` after the
      summary, outside `PR_BODY_LIMIT`, placed as #190's drafted requirement *A pull request body
      holds a capped summary, then the loop's evidence* describes, and remove from the summary
      any line that starts with this line's prefix. This change defines the prefix, which echoes
      #190's table heading: `**Tests** (checked by Igor, not reported by the worker): `. The line continues with the Tests
      row's value exactly as #190's task 2.1 words it. #190's task 2.1 is the source: it also
      words results these examples do not show, such as a check with no exit code. The examples
      below are in that wording, and neither change may reword it apart from the other:

      ```
      **Tests** (checked by Igor, not reported by the worker): pass: `npm test`, `npx tsc --noEmit`
      ```
      ```
      **Tests** (checked by Igor, not reported by the worker): **fail**: `npm test` exited 1; `npx tsc --noEmit` passed; the pull request is a draft because of it
      ```
      ```
      **Tests** (checked by Igor, not reported by the worker): **fail**: `npm test` timed out at the 15-minute limit; `npx tsc --noEmit` was not run; the pull request is a draft because of it
      ```
      ```
      **Tests** (checked by Igor, not reported by the worker): not checked: the role declares no checks
      ```

      After a failing line, each check that failed or timed out gets the block #190 puts under
      its table. The block holds the end of the check's output in a fence one backtick longer
      than the longest run of backticks in it, at least three:

      ````
      <details><summary>Output of `npm test`</summary>

      ```
      <the end of the output>
      ```

      </details>
      ````
- [ ] 3.3 On the conflict-resolution path, and on any other push of the worker's changes onto
      an existing pull request (not a clean server-side `catchUp`, the path where the code host
      merges the base with no worker), run the checks before the push
      and, once it is published, comment on the pull request with the line 3.2 gives, prefix and
      all, and any output, whatever the result and whether or not #190 has shipped. Where the
      body holds that line, replace it; once #190 has shipped, its table is replaced instead. Where a check did not pass, return the pull request to draft with a
      new `CodeHost` method backed by GitHub's `convertPullRequestToDraft` mutation.
- [ ] 3.4 Add `checks: [{ command, result, exitCode, seconds }]` to the execution row, with
      `result` one of `passed`, `failed`, `timed-out`, `not-run`.
- [ ] 3.5 Tests for each scenario in the task-execution delta. The worker-user scenario runs
      where `IGOR_TEST_WORKER_USER` is set, as `worker-user`'s task 7.1 does.

## 4. Docs

- [ ] 4.1 `README.md` roles section and `templates/org.yaml`: `checks` beside `commands`, with
      the commented `npm test` and `npx tsc --noEmit` examples repeated under `checks`.
