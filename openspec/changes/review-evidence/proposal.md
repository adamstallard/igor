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

**Decided (Adam, 2026-10-19):**

- **`redact-state-branch` (#217) owns credential redaction**, the rule this change applies to
  every command, path and output in the table, and is built before this change (see
  *Dependencies*).
  *Rejected:* keeping #188 as the rule's owner, which would have #217 and #188 each define it.

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
  and archive order is #217, #188, then this change, then #187 and #189. *Rejected:* signing the whole
  body, which puts code-assembled text under the model's signature; placing gate two's notes
  after the marker, where a rebuilt section drops them; and letting #187 and #189 write lines of
  their own before the table exists, which gives one result two wordings.

- **The Spec scenarios row comes from spec-trace.** The loop runs the `spec-trace` skill's
  script from the pinned skills directory that `pinned-skills` (#174) installs. It uses that
  script as it is: no separate download, and no rewrite in TypeScript. The Igor image carries the `python3` it needs (#192). The script finds the repository's test
  files from its test runner configuration (shared-skills PR #21), so the loop passes no
  patterns. The row reads `not checked`, with the reason, where it cannot apply, including
  where spec-trace finds no test files; *Still open* records that spec-trace as merged has no
  such outcome. `signed-publishing` (#153) is built before this change, as issue #204's order
  sets, and under it
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

- **The opening block is defined once, in this change's requirement *A pull request body holds a
  capped summary, then the loop's evidence*; #153 points at it.** On a revision, a push
  answering a reviewer's change request under #150, it is recomputed from the latest
  bug-hunter run, and the "item changed" note compares the item with
  the version approved at gate one (decided 2026-10-13). *Rejected:* keeping gate two's block
  unchanged, which would show bug-hunter decisions a revision has already settled.
- **The Commands row, renamed "Commands run", shows the shell calls of every model step #188
  logs**: the worker (its subagents included) and #153's bug-hunter step and prose pass. #188
  labels each call with its step, `worker`, `bug-hunter` or `prose` (decided 2026-10-13). *Rejected:* the
  worker's calls alone, which hides the tests bug-hunter ran.

**Where this meets #153.** For a role that lists `prose`, the body is the opening block, then
the signed description, then the marker and the evidence section. #153 defines the description
as exactly the span between the opening block and the marker, and `prose verify-post` runs on exactly that span
(#153, amended 2026-10-13).

**Still open:**

- **Task 0.1:** whether an Igor's App, adding a label that does not exist yet, creates it. If it
  does not, the loop creates each label first. Neither answer changes a rule above.
- **For Adam:** whether the table should show less when the repository is public, as
  `keep-action-log` (#188) cuts its log by the store's visibility. As written, the table lists
  every step's shell commands, cut to 200 characters, in every pull request. Credential
  redaction matches only secrets the Igor holds, by value, and GitHub and Anthropic tokens by
  their shape. So a command holding a key the worker read from a host file is published as
  written, and so is a command that quotes a private issue's text, such as an `echo` or a
  commit message.
- **For whoever next edits this change,** from a consistency read on 2026-10-21. None is
  decided, and none is fixed in this text. Each needs this change amended, unless the change
  named settles it the other way:
  - **Gate two's push.** The spec keeps the opening block and the description on every later
    push except a revision. Gate two's push is not a revision, so gate one's opening block and
    description would stay, where #150 and #153 have gate two replace both.
  - **What #189 asks.** #189 (`loop-verifies-commands`) makes checks and their time limit,
    `check_minutes`, belong to the repository, not the role, where this change's wording says
    the role's. It posts a comment of its own after a later push, against the 2026-10-13
    decision above. And it needs two more Tests-row wordings: one for a pull request the code
    host refused to make a draft, and one naming the commit the checks ran on.
  - **Withheld runs.** #216 (`lore-search`) withholds the transcript of a run whose worker met
    a question in a sensitive category, and forbids its pull request body any excerpt of the
    worker's result. This change's summary, transcript pointer and full command lines would
    publish them.
  - **The action log's cut.** #188 (`keep-action-log`) decides how much of its log to keep
    when it writes the log, from a visibility read of the stores made then. This change works
    out the same cut earlier, when it opens the pull request, so its "more in the action log"
    line can point at entries the log did not keep.
  - **Markup and names.** A 700-character cut through the worker's summary can leave an open
    `<!--` or code fence that hides the evidence section after it. A scenario name holding a
    backtick or `|` breaks its table cell. And a repository that declined spec-trace shows
    "no test" on every pull request, where `not checked` would be true.
  - **The spec itself.** Several SHALLs have no scenario; "the sandbox" is defined nowhere; and
    the Sandbox denials row reads `none` for model steps whose denials nothing records.
  - **From a second consistency read, the same day:**
    - **The label.** A resolution's scope part reads "this push was not checked", which the
      label rule makes `review: read`, while the scenario *A resolution keeps the scope
      condition it last met* expects `skim`. The label also judges only the latest push: a
      small push after a large gate two relabels the whole pull request `skim`. Judging only
      the latest push, and tasks.md's caps of 10 paths outside scope and 10 denied commands,
      are choices the decisions above do not list.
    - **spec-trace.** As merged in shared-skills PR #21, it finds tags by searching the
      repository and has no "no test files" outcome. The Spec scenarios row's `not checked`
      for that case (*The Spec scenarios row comes from spec-trace*, above) cannot occur as written. Its
      report is a markdown table for people; nobody has checked that the loop can read it
      back per spec file, and tell this pull request's scenarios from other open changes'.
    - **#153.** It no longer refuses an unknown skill at load (its decision 29), so the
      scenario *A missing skill is not checked*, which assumes that refusal, has a false
      premise. #153 also adds model steps that fit none of #188's three labels, so the
      Commands run table cannot label their calls.
    - **The opening block.** It lists the paths gate one refused to publish, which the worker
      chose, and bug-hunter's open decisions, both unquoted. Either can hold
      `<!-- igor:evidence -->`, and the next rebuild of the evidence section would then cut
      the body at that copy, dropping the description after it.
    - **Smaller gaps.** An adapter that links an item by branch name has no linkage line for
      the opening block to hold. The two role keys restate role-config's merge rule, "the
      most specific level wins", where they belong in its list of settings that follow it.
      #189 starts the worker a second time after a failed check, and the Cost row does not
      say whether it sums both passes and #153's steps. "Sentence end" and "catch-up
      resolution" are undefined in the spec, and several requirements carry rationale that
      belongs in this proposal.
    - **The order.** Issue #204's archive order does not list `scope-check` (#187), which this
      change places after itself.

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

Three rows come from changes drafted alongside this one. A fourth change supplies the redaction
applied to every command, path and output in the table:

- **`loop-verifies-commands`** (#189): the result of each of the role's `checks` (the Tests row).
- **`keep-action-log`** (#188): each command the worker ran, with its exit code where it recorded
  one (the Commands row).
- **`redact-state-branch`** (#217): *credential redaction*, which every command, path and output
  in the table goes through.
- **`scope-check`** (#187): the scope result (the Files row), including, under the two-gate
  workflow (#150), the result for each gate.

**This change is built and archived after `redact-state-branch` (#217) and `keep-action-log`
(#188),** because it cites #217's *credential redaction* and reads the shell calls #188
collects for the Commands run row. Issue #204 holds the whole archive order. #187 and #189 supply values for rows of this change's table and add no table of
their own.

The Spec scenarios row needs the `spec-trace` skill, which shared-skills merged on 2026-10-19
in its PR #21, and `pinned-skills` (#174), the open change that installs it for Igor. Until
#174 ships, the row says `not checked`.

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
