**In short:** the pull request body gains an evidence section, a table of what the loop (Igor's
own code around the worker) checked about the run. An Igor is one running instance of Igor, the
service; *the Igor* is the one that opened the pull request. From that table the loop sets one label,
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
   - every one of the role's `checks` (`loop-verifies-commands`) passed when the loop ran it. A
     CI-only check, which the repository's own CI runs and Igor never does, is left out, since
     Igor checked nothing about it (Adam, 2026-10-21);
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
   pull request (`task-execution`, *A person approves every Igor pull request*). Under #150, the
   two-gate workflow that reviews a spec before its code, the go signal for gate two, the implementation, is still a person's approving review. The label never approves, merges, skips a
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

**Decided (Adam, 2026-10-21):**

- **Igor never reads a CI-only check's result** (#189's decision 33). A repository's `ci_only`
  lines, in its entry in #189's `repos` map, are the checks it leaves to its own CI, such as one
  that needs a secret; Igor never runs them. The Tests row names each as a check Igor did not
  run, in #189's wording, which task 2.1 carries, and the `review: skim` test leaves those lines
  out (decision 3), since Igor checked nothing about them. *Rejected:*
  counting a CI-only line as a check that did not pass, which would make every pull request on
  a repository with one `review: read`.
- **The table is not trimmed by visibility; the visibility guard covers public stores.** A
  command the table lists could quote text from a place more private than where the table is
  read. For the lore store, the change `visibility-guard` (issue #219, pull request #220)
  settles that: it refuses to work a private repository while its lore store is public, and
  #188's action log is written or withheld by the same rule. This table is in a pull request
  in the worked repository, so a command it lists is no more visible there than the repository
  it ran in, and the table does no trimming of its own. *Rejected:* cutting the table where the
  repository is public, to keep out text from a private tracker, which would hide what was run
  from the readers of the repository it ran in.

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
  where spec-trace finds no test files, though spec-trace as merged reports no such case, as
  *Still open* records. `signed-publishing` (#153) is built before this change, as issue #204's
  order sets. Under #153, a role whose `skills` lists `spec-trace` has its worker directed to use `igor:spec-trace`, as #153 does for `prose` and
  `bug-hunter`. #174 already loads every installed skill for every role, so listing it adds only
  that direction. The worker so directed tags the scenario on each test it writes. The loop's run of the script is
  the check: deterministic, with no model call. The row never changes the label. *Rejected:*
  fetching or porting the script, which leaves two copies to keep in step; and a test-pattern
  setting in Igor, which spec-trace's own detection makes unnecessary; and letting the row change
  the label, which would make every repository without specs `review: read`.
- **The commands list shows at most 30 commands, and its last line counts the rest.** That line
  says only what #188's action log kept of the commands left out, including that the log could
  not be written at all, where that is so. *Rejected:* always pointing at the action log, which is
  false where the log keeps no commands or was never written.
- **The Files changed row shows whatever `scope-check` (#187) states for a push**, including
  its result when the earlier scope results it keeps in `executions.ndjson` are lost, and a
  carried-forward `not checked`, in this change's wording; #187 decides both of
  those cases. *Rejected:* a scope rule of this change's own, which could drift from #187's.

- **The opening block is defined once, in this change's requirement *A pull request body holds a
  capped summary, then the loop's evidence*; #153 points at it.** On a revision, a push
  answering a reviewer's change request under #150, it is recomputed from the latest
  bug-hunter run, and the "item changed" note compares the item with
  the version approved at gate one (*Decided (Adam, 2026-10-13)*, above). *Rejected:* keeping gate two's block
  unchanged, which would show bug-hunter decisions a revision has already settled.
- **The Commands row, renamed "Commands run", shows the shell calls of every model step #188
  logs**: the worker (its subagents included) and #153's bug-hunter step and prose pass. #188
  labels each call with its step, `worker`, `bug-hunter` or `prose` (*Decided (Adam, 2026-10-13)*, above). *Rejected:* the
  worker's calls alone, which hides the tests bug-hunter ran.

**Where this meets #153.** For a role that lists `prose`, the body is the opening block, then
the signed description, then the marker and the evidence section. #153 defines the description
as exactly the span between the opening block and the marker, and `prose verify-post` runs on exactly that span
(#153, amended 2026-10-13).

**Still open:**

- **Task 0.1:** whether an Igor's App, adding a label that does not exist yet, creates it. If it
  does not, the loop creates each label first. Neither answer changes a rule above.
- **Text from a more private tracker: accepted for now, or to be guarded by a later change?**
  Credential redaction matches only secrets the Igor holds, by value, and GitHub and Anthropic
  tokens by their shape, so a command quoting a private Linear issue's text is published in a
  public repository's pull request as written. `visibility-guard` compares only the visibility
  of the worked repository with the lore store's, not trackers, and its own open questions
  include this one.
- **From the consistency read of 2026-10-21's last round.** None is decided, and the rules
  above hold until each is settled.
  - For Adam: the loop sets the label though the role's `allow` need not list `label`, while
    the in-force *Only reversible artifacts are produced* confines execution to what `allow`
    permits, and no requirement here exempts the label. And the two label names are fixed in
    code, though `docs/architecture.md` §6.0 records a fixed, canonical label as a past
    mistake, since teams name labels their own way.
  - For whoever next edits this text: #217 redacts the whole pull request body after #153 has
    signed the description, so a description quoting a secret no longer verifies. Igor cuts a
    command the sandbox denied to 200 characters as it reads the run, before this change
    redacts it, so a token the cut splits is published. The spec does not say which user runs
    `spec_trace.py`, or with which git directory. The citation of `prBody` should end at
    `src/execute.ts:1185`, not 1180. And the caps of 10 paths, 10 denied commands and 200
    characters per command are in tasks but in no decision.
- **For whoever next edits this change,** from a consistency read on 2026-10-21. None is
  decided, and none is fixed in this text; the rules above hold until each is. Each needs this change amended, unless the change
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
  - **The action log's write.** `visibility-guard` decides, just before a run's records are
    written, whether #188's log and the run's transcript are written at all. This change writes
    its "more in the action log" line and its transcript pointer earlier, when it opens the pull
    request, and a rebuilt section keeps the pointer. So the line or the pointer can name a file
    that is then not written. `visibility-guard` requires that a pull request whose run's
    records it writes without their content names no transcript, and this change's lines for a
    log that could not be written do not cover a log the guard withheld.
  - **New from a further consistency read of 2026-10-21:**
    - A pull request offered after a lost claim, which the in-force spec keeps out of every
      review queue, would still get a review label.
    - A lore proposal an Igor opens falls under "a pull request an Igor opens" too, so it would
      need both the in-force `lore-review` spec's body for a lore proposal and this change's.
    - The CI-only wording is carried verbatim here and in #189: this change's task 2.1 says it
      may not be reworded, and #189's task says whoever builds it may reword it.
    - #153 is built first and defines the opening block and "revision" itself, so until this
      change ships there are two definitions, whose contents differ.
    - This change's text names #189's `repos` and `ci_only` keys, which #189 adds after this
      change archives, with no record that Adam accepted that citing ahead.
    - On a gate-one revision, the recomputed opening block leaves out #150's list of dropped
      paths.
    - At gate one, where the checks run on the base's own code, nearly every small
      specification pull request would be `review: skim`, though gate one is the one gate whose
      point is that a person reads the specification closely.
    - Running `spec_trace.py` passes the loop's environment, App credentials included, to `git
      grep` in the worker's tree, whose git configuration can run commands.
    - A failed evidence replacement has no rule, and task 2.5 records it in `reviewLabel`, a
      field defined for the label.
    - These SHALLs, besides the ones listed below, have no scenario: the role key's refusal,
      keeping the transcript pointer on a rebuild, recomputing the opening block, returning a
      description to the prose pass, the changed-line count, no model call for the Spec
      scenarios row, and that row never changing the label.
    - The `prBody` range is `src/execute.ts:1169-1184`, which corrects both the citation and the
      earlier correction above.
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
