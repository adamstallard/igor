## Decisions for the reviewer

1. **The evidence goes in the pull request body, as a table under the summary.** The worker's
   summary is what it says it did. The table is what was checked, built by the loop (Igor's own
   code around the worker) from its own record of the run.
   *Rejected:* a separate comment, which sinks below the discussion and is edited apart from the
   body. Also rejected: a GitHub check run, which needs `checks: write` on every Igor's App and
   shows only pass or fail.
2. **A row whose check did not run says `not checked`, and that makes the label `review: read`.**
   This holds whether the check was never built or was not configured.
   *Rejected:* leaving the row out. Without the row, a reviewer cannot tell a check that passed
   from one that never ran.
3. **The rule for the label:** `review: skim` only when all four hold:
   - the loop re-ran the role's commands and every one passed;
   - the scope check ran and found no changed path outside the issue's scope;
   - the run changed at most 5 paths, and did not declare that it undoes a change the base
     branch made (a catch-up resolution must declare such an undo, under *A base change is
     undone only where the resolution says so*);
   - the sandbox denied nothing.

   Anything else is `review: read`. The commands the worker ran, and their exit codes, never
   change the label.
   *Rejected:* making any non-zero exit mean `read`, since a worker that writes the test first
   runs it and watches it fail. Also rejected: a threshold on changed lines, which the record
   does not keep.
4. **The label sorts pull requests and does nothing else.** A person still approves every Igor
   pull request (`task-execution`, *A person approves every Igor pull request*). Under #150 the
   go signal is still a person's approving review. The label never approves, merges, skips a
   reviewer request or marks a draft ready.
   *Rejected:* requesting no reviewer on a `skim` pull request.
5. **The table is assembled by Igor's code, so it is not signed.** Under #153
   (`signed-publishing`), a model step writes the description above the table and signs it with
   a `prose ✓` footer. #153 exempts text the code assembles from recorded state, such as a
   handoff. The table follows the footer, and `prose verify-post` covers the description
   only.
   *Rejected:* having the model step write the table. The model would then restate the facts it
   is being checked against.

**Still open:** #153's scenario *A signed description is published* says the pull request is
created with "exactly that description". Whichever of the two changes lands second rewords that
scenario to add "followed by the evidence table".

## Why

An Igor's pull request shows only the worker's own account of its work (#181). The body is the
line linking it to its issue, then the worker's final text cut at 700 characters (`prBody`,
`src/execute.ts:1169-1180`). So a reviewer reads the whole diff to learn whether tests pass,
whether the change stayed in scope, or whether the sandbox stopped the worker. Most of these
facts are already in `executions.ndjson` (`src/execute.ts:2125-2160`), and none reaches the pull
request. No requirement governs the body: the 700-character limit exists only in code
(`PR_BODY_LIMIT`, `src/execute.ts:1109`).

## What Changes

- The body is the line linking it to its issue, the worker's summary capped at 700 characters,
  then an evidence table. The cap becomes a requirement.
- The table has five rows, each from the loop's own record: tests, commands the worker ran,
  files changed, sandbox denials, and cost and turns.
- The execution record keeps the turn count on every run. It is kept today only when the
  provider reported no cost (`src/execute.ts:1496-1498`).
- Igor sets one label on the pull request, `review: skim` or `review: read`.
- A later push by a run replaces both the table and the label.

## Dependencies

Three rows come from records that other changes, drafted alongside this one, add:

- **`loop-verifies-commands`**: the loop's re-run of `role.commands` (the Tests row).
- **`keep-action-log`**: each command the worker ran, with its exit code (the Commands row).
- **`scope-check`**: the changed paths outside the issue's scope (the Files row).

This change can ship before any of them. Until a row's source change ships, that row says
`not checked` or `not recorded`, and the label is `review: read`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: adds three requirements: what the body holds, what each evidence row
  reports, and the review label.

## Impact

- `src/execute.ts`: `prBody`, the publish and catch-up paths, and the execution record.
- `src/adapter.ts` `CodeHost` and `src/github.ts`: replacing a pull request's evidence table
  and setting its label.
- No configuration changes.
