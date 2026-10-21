## ADDED Requirements

### Requirement: A pull request body holds a capped summary, then the loop's evidence

The body of a pull request an Igor opens SHALL hold, in this order:

1. the opening block: for a role under `follow-the-two-gate-workflow` (#150), the text that change
   places first (gate one's "specification only" opening and the paths outside
   `openspec/changes/` that gate one refused to publish; at gate two, the note that the item
   changed after the spec was approved, and the open decisions bug-hunter left for a person,
   which go first so that rebuilding the evidence section never drops them); then the line linking
   the pull request to its
   item by the adapter's convention, or at gate one the non-closing reference #150 requires;
2. the worker's summary, at most 700 characters, cut at the last sentence end in its first 700
   characters where that end falls after character 350, and otherwise at 700 characters. For a
   role whose `skills` lists `prose`, the description `signed-publishing` (#153) has signed takes
   the summary's place, uncut, as #153 requires;
3. the evidence section: the marker `<!-- igor:evidence -->`, then, where the summary was cut, a
   pointer to the full transcript the run keeps on the state branch (the branch of the store
   that holds Igor's run records), then the evidence table and the blocks under it. A rebuilt
   section keeps that pointer unchanged: it points at the transcript of the run whose summary
   the body holds.

This requirement is the one definition of the opening block; `signed-publishing` (#153) points
here. A revision, under #150, is a push answering a reviewer's change request. On a revision the
loop SHALL recompute the opening block: bug-hunter's open decisions come from the latest
bug-hunter run (none where the role does not list bug-hunter), and the note that the item
changed compares the item with the version approved at gate one.

Every line the loop adds outside the opening block SHALL come after the marker. For a role under
#153, `prose verify-post` runs on the span between items 1 and 3, as #153 defines it.

The table's rows SHALL come in the order *Each evidence row reports what the loop recorded, or
says it was not checked* lists them.

Every value in the table SHALL come from what the loop itself recorded or kept, never from the
worker's summary. That record is this run's, except for the scope part on a push
`scope-check` (#187) does not check, which comes from the pull request's last recorded scope
result. Check output is kept by
`loop-verifies-commands` (#189).
Every occurrence of the marker, and every line that repeats the table's heading,
`**Checked by Igor, not reported by the worker**`, SHALL be removed from the summary. A signed description
holding either SHALL NOT be edited, since that would break its signature; it SHALL be returned to
the prose pass, as `signed-publishing` (#153) returns any text that fails.

Commands, paths and check output in the table are text the worker wrote or the repository's code
printed. Each of these SHALL be redacted by *credential redaction*, the requirement *Credential
redaction replaces every credential the Igor knows* in the change `redact-state-branch` (#217),
which that requirement defines in full. In short, it matches by exact value each seat token
and each credential-named variable's value that is at least 8 characters long, and by shape
any token with a known prefix, a private key, and the credentials in a URL. A
command or path SHALL be shown on one line as inline code, and check output in a fenced block,
each quoted so that it cannot end its code span or block, its cell, or the table.

Each time a run publishes the worker's changes onto an existing pull request, the loop SHALL
replace the evidence section with one built from that run, leaving the opening block and the
description as they are. A revision is the exception: there the loop recomputes the opening
block by the rule for the opening block earlier in this requirement, and `signed-publishing`
(#153) rewrites the description. A merge of the base that the code host makes
without a worker leaves the table as it is.

#### Scenario: A long summary is cut and points at the transcript

- **WHEN** the worker's summary is 1,500 characters
- **THEN** the body holds at most its first 700 characters, then the marker, the transcript
  pointer and the evidence table

#### Scenario: A summary cannot pose as evidence

- **WHEN** the worker's summary contains the table's heading, or the marker in the middle of a
  line
- **THEN** the heading's line and the marker are removed from the summary
- **AND** the body holds exactly one evidence table, built by the loop

#### Scenario: A credential in a command is redacted in the table

- **WHEN** a command the worker ran holds a GitHub token
- **THEN** the table shows `[redacted]` where the token was

#### Scenario: A command cannot break the table

- **WHEN** the worker ran a command holding a backtick, a `|` and a newline
- **THEN** the command is shown in one cell, and the table's rows are unchanged

#### Scenario: A later push replaces the table

- **WHEN** a catch-up run pushes a resolution to the pull request
- **THEN** the evidence table describes the catch-up run, and the earlier table is gone

### Requirement: Each evidence row reports what the loop recorded, or says it was not checked

The evidence table SHALL have these rows, each filled only from the loop's record of the run:

- **Tests:** the result of each of the role's `checks`, as `loop-verifies-commands` (#189)
  records it after the worker finished: passed, failed with its exit code, timed out, or not
  run. Where any did not pass, `loop-verifies-commands` makes the pull request a draft, the row
  says so, and the
  end of the output of each check that failed or timed out follows the table.
- **Commands run:** how many shell (`Bash`) calls the run's model steps made, and how many of
  them failed, whichever step made them. The steps are the worker, its subagents counted as the
  worker, and #153's bug-hunter step and prose pass; `keep-action-log` (#188) labels each call
  `worker`, `bug-hunter` or `prose`, the only three labels. A call failed where it exited non-zero, failed with no code, or never returned.
  The commands are listed, up to a cap, each with what `keep-action-log` (#188) recorded for it:
  its exit code, an error with no code, or no result for a call that never returned. Any beyond
  the cap are counted.
- **Files changed:** how many paths the run published (for a catch-up resolution, only the
  paths its own resolution changed), the scope result that `scope-check`
  (#187) states for this push, and any base change the run declared it undid (*A base change is
  undone only where the resolution says so*).
- **Spec scenarios:** the OpenSpec scenarios in the spec files the pull request changes, and
  whether a test tags each, as *The Spec scenarios row is read from spec-trace* says.
- **Sandbox denials:** each command the sandbox stopped.
- **Cost:** the reported cost and the number of turns.

A row the loop holds no record for SHALL say `not checked` and why; the Cost row says
`not reported` for a cost the provider did not report. No row SHALL report a pass it did not record.

The execution record SHALL keep the count of assistant turns on every run, including runs whose
cost was reported, and the number of lines the run's published paths add and remove.

#### Scenario: A check that never ran is not shown as passing

- **WHEN** the role declares no checks
- **THEN** the Tests row says `not checked: the role declares no checks`

#### Scenario: A failed check is shown as failed

- **WHEN** the loop ran the check `npm test` and it exited 1
- **THEN** the Tests row says `**fail**`, names `npm test` with its exit code, and says the pull
  request is a draft because of it
- **AND** the end of the check's output follows the table

#### Scenario: A resolution shows the scope result scope-check states for it

- **WHEN** a run publishes a resolution onto a pull request whose last checked push found every
  path inside scope
- **THEN** the Files changed row gives that earlier result, marked as found by an earlier push
- **AND** it says this push was not checked

#### Scenario: A run's turns are shown with or without its cost

- **WHEN** one run of 23 turns reported a cost of $0.42, and another of 23 turns reported none
- **THEN** the first run's Cost row says `$0.42, 23 turns`, and the second's says
  `not reported, 23 turns`

### Requirement: The Spec scenarios row is read from spec-trace

The loop SHALL fill the Spec scenarios row by running the `spec-trace` skill's script,
`<skills_dir>/skills/spec-trace/scripts/spec_trace.py report --include-changes`, in a tree
holding exactly the pull request's head. `<skills_dir>` is the pinned skills directory that
`pinned-skills` (#174) installs. It SHALL make no model call for the row.

The report gives each scenario, with the deltas of every open change in the repository applied,
and the tests that tag it.
From it the row counts the scenarios in the spec files the pull request changes against its base,
and names each of them that no test tags. The row SHALL say `not checked`, with the reason, on a
gate-one pull request under `follow-the-two-gate-workflow` (#150), which carries no tests; where
the repository has no `openspec/specs/`; where the skill is not installed in that directory;
where the script fails; and where it finds no test files. The script finds the test files itself,
from the repository's test runner configuration (shared-skills PR #21); the loop passes it no
patterns.

`pinned-skills` (#174) loads every installed skill for every role, so a role's `skills` list
decides only which skills its worker is directed to use. Where `signed-publishing` (#153) has
shipped, a role whose `skills` lists `spec-trace` has its worker directed to use the skill, named `igor:spec-trace`
in the `igor` plugin, as #153 directs it to use `prose` and `bug-hunter`. That
worker tags each test it writes with the scenario that test checks, and the loop's run of the
script shows whether it did. The loop runs the script whether or not the role lists the skill:
it is the loop's own check, not one of the checks #153 makes on what a listed skill signed, so
a role need not list the skill for the row to be filled.

The Spec scenarios row SHALL NOT change the review label.

#### Scenario: A scenario without a test is shown

- **WHEN** a pull request's spec delta adds two scenarios, and after gate two's push a test in
  the pull request tags only one
- **THEN** the Spec scenarios row names the scenario no test tags

#### Scenario: A repository without specs is not checked

- **WHEN** the repository has no `openspec/specs/`
- **THEN** the Spec scenarios row says `not checked` and why

#### Scenario: A missing skill is not checked

- **WHEN** the pinned skills directory holds no `spec-trace` skill (a role listing it would be
  refused at load under #153, so no role lists it)
- **THEN** the Spec scenarios row says `not checked` and why, and the run goes on

### Requirement: One review label sorts a pull request for triage, never for merging

Each time a run opens a pull request or publishes the worker's changes onto one, the Igor SHALL
set exactly one of the labels `review: skim` and `review: read` on it, and SHALL remove the
other. The loop sets this label itself, as it sets the `igor:<role>` claim label, so the role's
`allow` need not list `label`.

The label SHALL be `review: skim` only when all four hold:

- every check in the Tests row passed;
- the Files changed row's scope result found no path outside scope, whether it is this push's or,
  for a push `scope-check` does not check, the last checked push's;
- the run published at most the role's `skim_max_paths` paths, added and removed at most its
  `skim_max_lines` lines between them, and declared no base change undone. For a catch-up
  resolution these count only what the Igor's own resolution changed, never what the base
  brought in;
- the Sandbox denials row says `none`.

Otherwise the label SHALL be `review: read`, including where the Tests row, or the Files changed
row's scope part, says `not checked`.

The label SHALL NOT approve, merge, mark a draft ready, or change which reviewers are
requested. A pull request labelled `review: skim` still needs a person's approval, as
*A person approves every Igor pull request* requires.

A failure to set the label SHALL leave the pull request open as it is, and the execution record
SHALL note the failure.

#### Scenario: A clean small change is labelled skim

- **WHEN** every check passed, no path falls outside scope, 3 paths changed by 120 lines, no
  base change was undone, the sandbox denied nothing, and the role keeps the default thresholds
- **THEN** the pull request is labelled `review: skim`

#### Scenario: A change over the line threshold is labelled read

- **WHEN** every other condition for `review: skim` holds, but the run added and removed 260
  lines and the role keeps the default `skim_max_lines` of 200
- **THEN** the pull request is labelled `review: read`

#### Scenario: An unchecked row makes the label read

- **WHEN** every other condition for `review: skim` holds, but the scope check did not run
- **THEN** the pull request is labelled `review: read`

#### Scenario: A resolution keeps the scope condition it last met

- **WHEN** a pull request whose gate-two push was checked and found nothing outside scope gets a
  resolution, after which every other condition for `review: skim` holds
- **THEN** it is labelled `review: skim`

#### Scenario: A later push swaps the label

- **WHEN** a pull request labelled `review: skim` gets a resolution whose check fails
- **THEN** it is labelled `review: read`, and `review: skim` is removed

#### Scenario: A worker's failed command does not change the label

- **WHEN** the worker ran `npm test`, saw it fail, then fixed the code, and the loop's run of
  the check passed
- **THEN** the label is set from the conditions above, and the failed command does not count

#### Scenario: A label the host refuses leaves the pull request as it is

- **WHEN** the code host refuses to set the label
- **THEN** the pull request stays open with its body, draft status and reviewers unchanged
- **AND** the run's execution record names the failure

#### Scenario: Skim does not stand in for approval

- **WHEN** a pull request is labelled `review: skim`
- **THEN** its reviewers are requested as for any other pull request
- **AND** no Igor merges it without a person's approval
