## Decisions asked of the reviewer

1. **The loop runs a new role key, `checks`, not the `commands` list.** `checks` lists exact
   command lines, such as `npm test` and `npx tsc --noEmit`. Rejected: running every `commands`
   entry. Those entries are permission patterns, not command lines: `git log:*` is no check,
   and `npm test:*` names no single line to run.
2. **`checks` accumulates down the inheritance chain, and each check must be a command the
   role's `commands` permits.** A role can add a check and cannot drop one it inherits. A check
   runs as its words, with no shell, and a line holding a shell operator or quote is refused,
   so `npm test && curl …` cannot pass as a line `npm test:*` permits. Rejected: narrowing like
   `commands`, which would let a role drop the org's tests. Also rejected: running each line
   through `sh -c`, under which the permitted-by-`commands` rule means nothing.
3. **Checks run the way the worker runs:** as the separate Unix user that the change
   `worker-user` (#175) gives the worker, in their own process group, with the worker's
   environment minus its seat token. This change is built after `worker-user` merges. Rejected:
   running checks as the Igor, which hands repository code the App's key and every seat token.
   Also rejected: building this first, with checks running as the Igor's user. `worker-user`
   would then have two places that start repository code to move to the worker user, and its
   spec names only the worker.
4. **Checks run after the loop reads which paths the worker changed, and before it re-reads the
   issue's claim to confirm it still holds it.** The artifact carries only the changes read
   before the checks ran, so nothing a check writes reaches it. Where `signed-publishing` (#153)
   stages and signs the tree before committing, the checks run after that staging too, so they
   test the tree that is published. Rejected: running checks before the read, which would
   publish snapshots and build output.
5. **One time limit covers all of a run's checks:** `check_minutes`, default 15, at most 60. On
   timeout the check's process group is killed, and the timeout counts as a failure that is
   named as a timeout. Rejected: a fixed constant, which a repository with slow tests can't
   change; and no limit, under which a hung test holds the run and its tree with no end.
6. **A failed check still publishes, as a draft.** Reviewers are still requested, and the body
   names the failure. *Rejected:* publishing nothing, which throws away the work and the
   evidence of what failed.

   **Decided (Adam, 2026-10-13): a draft is within `pr`.** A role whose `allow` lists `pr` and
   not `draft-pr` still gets a draft when a check fails, as work published after a lost claim
   already goes out as a draft whatever `allow` lists.
7. **Checks also run before a later push onto an existing pull request, such as a conflict
   resolution. Once the push is published, their result is reported in a comment**, whatever it
   is, and a failure returns the pull request to draft. Rejected: leaving a ready pull request ready over failing tests. Also rejected:
   reporting only by editing the body, which notifies nobody watching the pull request.

## Why

Today the loop runs no test or lint command (#186). The worker's system prompt lists the role's
commands and leaves testing to the worker (`src/execute.ts:169-182`). The pull request body is
the worker's own summary (`prBody`, `src/execute.ts:1169-1185`). So the only evidence that a
change passes is the worker saying so.

## What Changes

- New role keys `checks` (accumulates) and `check_minutes` (the most specific level wins).
- After the worker exits and its changes are read, the loop runs each check in the worker's tree,
  under the worker's user and environment, within one time limit, re-reading the claim while
  they run.
- The pull request body states the checks' result in the wording of `review-evidence`'s Tests
  row: each check passed, failed with its exit code and the output's last lines, timed out, or
  was not run; or the role declares none. A failure opens the pull
  request as a draft.
- Each execution row records each check's command, result, exit code and duration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `role-config`: the `checks` and `check_minutes` keys.
- `task-execution`: the loop runs the checks, and how their result is published and recorded.

## Impact

- **Depends on `worker-user` (#175).** The checks use its start, kill and removal as the worker
  user, and inherit its same-user mode where no worker user is configured.
- **Built after `concurrent-instances` (#179).** That change removes the absolute ceiling and the
  age-based tree sweep, and sweeps by rank instead, so a tree held through the checks needs no
  change to the sweep.
- **Overlaps `review-evidence` (#190).** Its Tests row shows this change's results, read from
  the `checks` results on the execution row (passed, failed with its exit code, timed out, or not
  run). **Decided (Adam,
  2026-10-13):** that row's wording is the only text for the result. Until #190 ships, this
  change writes a line that uses it verbatim, so the pull request says the same either way.
  #190 also sets where the result goes in the body, and the order of the lines this change and
  `scope-check` (#187) write before #190's table exists.
- **Overlaps `keep-action-log` (#188)**, which defines *credential redaction*. Published check
  output is redacted by that rule, through one function the two changes and #190 share. #188's
  task 3.1 says which change builds it.
- Code: `src/role.ts`, `src/execute.ts`, and the GitHub adapter (returning a pull request to
  draft). Docs: `README.md` roles section, `templates/org.yaml`.
