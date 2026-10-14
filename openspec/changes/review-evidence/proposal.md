**In short:** the pull request body gains an evidence section, a table of what the loop (Igor's
own code around the worker) checked about the run. From that table the loop sets one label,
`review: skim` or `review: read`, which sorts pull requests for a reviewer.

## Decisions for the reviewer

1. **The evidence goes in the pull request body, as a section after the summary.** The worker's
   summary is what it says it did. The evidence table is what was checked, built by the loop
   (Igor's own code around the worker) from its own record of the run.
   *Rejected:* a separate comment, which sinks below the discussion and is edited apart from the
   body. Also rejected: a GitHub check run, which needs `checks: write` on every Igor's App and
   shows only pass or fail.
2. **A row whose check did not run says `not checked`.** This holds whether the check was never
   built, was not configured, or could not be applied, as when an issue names no paths. A
   `not checked` Tests or Files changed row makes the label `review: read`; the Commands and Spec
   scenarios rows never change the label.
   *Rejected:* leaving the row out. Without the row, a reviewer cannot tell a check that passed
   from one that never ran.
3. **The rule for the label:** `review: skim` only when all four hold:
   - every one of the role's `checks` (`loop-verifies-commands`) passed when the loop ran it;
   - the scope result for this push (decision 6) found no changed path outside scope;
   - the run's change is small, and it did not declare that it undoes a change the base branch
     made. A catch-up resolution, a run that merges the base branch into the pull request and
     resolves its conflicts, must declare such an undo, under the in-force `task-execution`
     requirement *A base change is undone only where the resolution says so*;
   - the sandbox denied nothing.

   Anything else is `review: read`. The commands the worker ran, and their exit codes, never
   change the label.
   *Rejected:* making any non-zero exit mean `read`, since a worker that writes the test first
   runs it and watches it fail.
4. **The label sorts pull requests and does nothing else.** A person still approves every Igor
   pull request (`task-execution`, *A person approves every Igor pull request*). Under #150 the
   go signal for gate two, the implementation, is still a person's approving review. The label never approves, merges, skips a
   reviewer request or marks a draft ready.
   *Rejected:* requesting no reviewer on a `skim` pull request.
5. **The evidence section is assembled by Igor's code, so it is not signed.** Under #153
   (`signed-publishing`), a model step writes the description and signs it with a `prose ✓`
   footer. #153 exempts from signing the text the code assembles from recorded state, such as
   the message an Igor posts when it hands an issue back.
   *Rejected:* having the model step write the table. The model would then restate the facts it
   is being checked against.
6. **The Files row and the label take the scope result `scope-check` states for each push.**
   For a push `scope-check` does not check, such as a resolution, the scope result shown is the
   last checked one, marked as from an earlier push. `scope-check` supplies both the result and
   that marking; this change only shows them. *Rejected:* making every resolution `review: read`, which would
   relabel a reviewed pull request each time the base moved.

**Decided (Adam, 2026-10-13):**

- **The loop sets the label without `label` in the role's `allow`**, as it sets its
  `igor:<role>` claim label. `allow` governs what the worker's output may become; the label is
  the loop's own. *Rejected:* requiring `label` in `allow`, under which the org base's default
  `allow` list, `[draft-pr, comment]`, would label nothing.
- **"Small" is a setting:** at most `skim_max_paths` changed paths (default 5) and at most
  `skim_max_lines` changed lines (default 200), both holding. The org base and a role may set
  each, and the most specific level wins. The defaults are a starting point, to be tuned from
  data such as how often a `review: skim` pull request still needed changes. A catch-up
  resolution counts only what the Igor's own resolution changed. *Rejected:* a fixed limit in
  code, which no repository could tune; and counting a resolution's incoming base changes, which
  would turn a pull request to `review: read` each time the base moved far.
- **The body is the opening block, then the summary or signed description, then the marker
  `<!-- igor:evidence -->` and everything else the loop adds**, in the requirement *A pull
  request body holds a capped summary, then the loop's evidence*. The opening block is the text
  #150 places first, then the linkage line; it is the only code-added text before the
  description, and every other code-added line comes after the marker. At gate two, #150's
  note that the item changed after approval and bug-hunter's open decisions go in the opening
  block, so rebuilding the evidence section never drops them. `loop-verifies-commands` (#189)
  and `scope-check` (#187) write only into this change's table, never a line of their own; build
  and archive order is #188, then this change, then #187 and #189. *Rejected:* signing the whole
  body, which puts code-assembled text under the model's signature; placing gate two's notes
  after the marker, where a rebuilt section drops them; and letting #187 and #189 write lines of
  their own before the table exists, which gives one result two wordings.

- **The Spec scenarios row comes from spec-trace.** The loop runs the `spec-trace` skill's
  script from the pinned skills directory that `pinned-skills` (#174) installs. It uses that
  script as it is: no separate download, and no rewrite in TypeScript. The Igor image carries the `python3` it needs (#192). The script finds the repository's test
  files from its test runner configuration (shared-skills PR #21), so the loop passes no
  patterns. The row reads `not checked`, with the reason, where it cannot apply, including
  where spec-trace finds no test files. Once #153 has shipped (this change does not wait for it),
  a role whose `skills` lists
  `spec-trace` has its worker directed to use `igor:spec-trace`, as #153 does for `prose` and
  `bug-hunter`. #174 already loads every installed skill for every role, so listing it adds only
  that direction. The worker so directed tags the scenario on each test it writes. The loop's run of the script is
  the check: deterministic, with no model call. The row never changes the label. *Rejected:*
  fetching or porting the script, which leaves two copies to keep in step; and a test-pattern
  setting in Igor, which spec-trace's own detection makes unnecessary; and letting the row change
  the label, which would make every repository without specs `review: read`.
- **Past its cap of 30, the commands list ends with a line that says only what #188's action
  log actually kept of the commands left out**, including when the log could not be written at
  all. *Rejected:* always pointing at the action log, which is
  false where the log keeps no commands or was never written.
- **The Files changed row shows whatever `scope-check` (#187) states for a push**, including
  its result when the earlier scope results it keeps in `executions.ndjson` are lost, and a
  carried-forward `not checked`, in this change's wording; #187 decides
  those cases. *Rejected:* a scope rule of this change's own, which could drift from #187's.

**Where this meets #153.** For a role that lists `prose`, the body is the opening block, then
the signed description, then the marker and the evidence section. #153 defines the description
as exactly the span between the opening block and the marker, and `prose verify-post` runs on exactly that span
(#153, amended 2026-10-13).

## Why

An Igor's pull request shows only the worker's own account of its work (#181). The body is the
line linking it to its issue, then the worker's final text cut at 700 characters (`prBody`,
`src/execute.ts:1169-1180`). So a reviewer reads the whole diff to learn whether tests pass,
whether the change stayed in scope, or whether the sandbox stopped the worker. Most of these
facts are already in `executions.ndjson` (`src/execute.ts:2125-2160`), and none reaches the pull
request. No requirement governs the body: the 700-character limit exists only in code
(`PR_BODY_LIMIT`, `src/execute.ts:1109`).

## What Changes

- The body is the opening block (the linkage line, after any opening text #150 places first),
  then the worker's summary capped at 700 characters, or for a role under #153 the signed
  description uncut, then the marker and the evidence section. The cap becomes a requirement.
- The table has six rows, each from the loop's own record: tests, commands the worker ran,
  files changed, spec scenarios, sandbox denials, and cost and turns.
- The execution record keeps the turn count on every run, and the count of lines the run
  changed. Today
  the turn count is kept only when the provider reported no cost (`src/execute.ts:1496-1498`).
- Two role keys, `skim_max_paths` and `skim_max_lines`, set how small a change must be for
  `review: skim`.
- Igor sets one label on the pull request, `review: skim` or `review: read`.
- A later run that publishes onto the pull request replaces both the table and the label. A
  merge the code host makes without a worker changes neither.

## Dependencies

Three rows come from changes drafted alongside this one:

- **`loop-verifies-commands`** (#189): the result of each of the role's `checks` (the Tests row).
- **`keep-action-log`** (#188): each command the worker ran, with its exit code where it recorded
  one (the Commands row). It also defines *credential redaction*, which every command, path and
  output in the table goes through.
- **`scope-check`** (#187): the scope result (the Files row), including, under the two-gate
  workflow (#150), the result for each gate.

**Build order: `keep-action-log` (#188), then this change, then `scope-check` (#187) and
`loop-verifies-commands` (#189).** Archive order follows the same sequence. This change points
at #188's *credential redaction*, and #187 and #189 write only into this change's table.

The Spec scenarios row needs `pinned-skills` (#174), an open change here, and the `spec-trace`
skill, which is not yet merged into shared-skills.

Until #187 and #189 ship, their rows say `not checked`. A `not checked` Tests or Files row makes the label
`review: read`; the Commands row never changes the label.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: adds four requirements: what the body holds, what each evidence row
  reports, how the Spec scenarios row is read, and the review label.
- `role-config`: adds `skim_max_paths` and `skim_max_lines`.

## Impact

- `src/execute.ts`: `prBody`, the publish and catch-up paths, and the execution record.
- `src/adapter.ts` `CodeHost` and `src/github.ts`: replacing a pull request's evidence table
  and setting its label.
- `src/role.ts`: the two thresholds.
