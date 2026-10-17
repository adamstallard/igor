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
   not `draft-pr` still gets a draft when a check fails. `allow` says what the work may become,
   and a draft is a pull request not yet ready. Work published after a lost claim, where the
   Igor stopped holding its claim on the issue mid-run, already goes out as a draft wherever
   `allow` permits a pull request at all. *Rejected:* opening the pull request ready because
   `allow` lists only `pr`, which presents failing work as ready for review.
7. **Checks also run before a later push onto an existing pull request, such as a conflict
   resolution. Once the push is published, their result is reported in a comment**, whatever it
   is, and a failure returns the pull request to draft. Rejected: leaving a ready pull request ready over failing tests. Also rejected:
   reporting only by editing the body, which notifies nobody watching the pull request.

**Also decided (Adam, 2026-10-13):**

- **Checks run after #153's staging and signing** (decision 4). #153 signs every commit Igor
  pushes other than a merge, including, under the two-gate workflow (#150), gate two's
  implementation and each revision answering a reviewer. Its prose pass, a model step, may edit
  docs and comments before it signs. A conflict resolution is a merge and carries no signature:
  Igor stages the merged tree in its clone, and the checks run on that. *Rejected:* checks before
  signing, which test a tree the prose pass may still change.
- **A pull request opened after a lost claim requests no reviewers**, even with a failed check,
  an exception to decision 6. *Rejected:* requesting them anyway, which asks people to review
  work the Igor no longer holds the issue for.
- **Checks run before every later push of the worker's changes** (decision 7, widened from a
  conflict resolution to gate two's push and each revision too). *Rejected:* checking only the
  opening run, which leaves gate two's implementation untested.
- **The comment after such a push is posted only where the role declares checks.** It is the
  one place this change writes outside #190's table, an accepted exception to the decision
  below that the table carries its result. *Rejected:* no comment, which leaves a
  changed result unannounced; and a comment for a role with no checks, which says nothing on
  every push.

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
- The checks' result fills the Tests row of `review-evidence`'s evidence table: each check
  passed, failed with its exit code and the output's last lines, timed out, or was not run; or
  the role declares none. A failure opens the pull
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
  run). **Decided (Adam, 2026-10-13):** that row is the only place in the body the result is
  written, in the wording #190 gives it; this change writes no line of its own into the body.
  *Rejected:* a line of this change's own in the body, outside the table, which would give the
  same result two wordings and two places.
- **Build order: `keep-action-log` (#188), then `review-evidence` (#190), then this change and
  `scope-check` (#187) in either order**, since the two do not depend on each other. Archive order follows the same sequence, so the redaction rule and the
  table this change points at exist, in code and in the in-force specs, before it lands.
- **Overlaps `keep-action-log` (#188)**, which defines *credential redaction* and builds its
  function. Published check output is redacted by that function.
- Code: `src/role.ts`, `src/execute.ts`, and the GitHub adapter (returning a pull request to
  draft). Docs: `README.md` roles section, `templates/org.yaml`.
