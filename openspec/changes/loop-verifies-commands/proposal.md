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
4. **Checks run after the tree's changes are read and before the claim is re-read.** Nothing a
   check writes reaches the artifact. Rejected: running checks before the read, which would
   publish snapshots and build output.
5. **One time limit covers all of a run's checks:** `check_minutes`, default 15, at most 60. On
   timeout the check's process group is killed, and the timeout counts as a failure that is
   named as a timeout. Rejected: a fixed constant, which a repository with slow tests can't
   change; and no limit, under which a hung test holds the run and its tree with no end.
6. **A failed check still publishes, as a draft.** It is a draft even where the role's `allow`
   lists `pr` and not `draft-pr`, as work published after a lost claim already is. Reviewers are
   still requested, and the body names the failure. Rejected: publishing nothing, which throws away
   the work and the evidence of what failed.
7. **A conflict resolution's checks are reported in a comment on the pull request**, whatever
   their result, and a failure returns the pull request to draft. Rejected: leaving a ready pull
   request ready over failing tests. Also rejected: saying nothing after a passing resolution,
   which leaves the body's line about the opening run as the only report.

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
- The pull request body gains one line for the checks: passed, failed with the output's last
  lines, or none declared. A failure opens the pull request as a draft.
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
- **Overlaps `review-evidence` (#190).** Its evidence table shows the result this change
  produces. Whichever change lands second moves the checks line into that table, whose Tests row
  must then read `checks`, not `commands`, and show `timed out` and `not run`.
- **Overlaps `scope-check` (#187)**, which also writes one line after the worker's summary.
- Code: `src/role.ts`, `src/execute.ts`, and the GitHub adapter (returning a pull request to
  draft). Docs: `README.md` roles section, `templates/org.yaml`.
