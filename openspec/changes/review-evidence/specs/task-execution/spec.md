## ADDED Requirements

### Requirement: A pull request body holds a capped summary, then the loop's evidence

The body of a pull request an Igor opens SHALL hold, in this order:

1. the line linking it to its item, by the adapter's convention;
2. the worker's summary, at most 700 characters. A longer summary SHALL be cut at a sentence
   end where one falls in its second half, and SHALL end with a pointer to the full transcript;
3. the evidence table, which the loop builds from its own record of the run.

Every value in the table SHALL come from the loop's record, never from the worker's summary.
Every occurrence of `<!-- igor:evidence -->`, the HTML comment that marks where the table
starts, and every line that repeats the table's heading, SHALL be removed from the summary.

Commands, paths and check output in the table are text the worker or the tree chose. Each SHALL
be redacted by the rule the change `keep-action-log` sets for the action log (*The action log
carries no credential the Igor knows*). A command or path SHALL be shown on one line as inline
code, and check output in a fenced block, each quoted so that it cannot end its code span or
block, its cell, or the table.

Each time a run publishes the worker's changes onto an existing pull request, the loop SHALL
replace the table with one built from that run. A merge of the base that the code host makes
without a worker leaves the table as it is.

#### Scenario: A long summary is cut and points at the transcript

- **WHEN** the worker's summary is 1,500 characters
- **THEN** the body holds at most its first 700 characters, then the transcript pointer, then
  the evidence table

#### Scenario: A summary cannot pose as evidence

- **WHEN** the worker's summary contains the table's heading, or the marker in the middle of a
  line
- **THEN** the heading's line and the marker are removed from the summary
- **AND** the body holds exactly one evidence table, built by the loop

#### Scenario: A command cannot break the table

- **WHEN** the worker ran a command holding a backtick, a `|` and a newline
- **THEN** the command is shown in one cell, and the table's rows are unchanged

#### Scenario: A later push replaces the table

- **WHEN** a catch-up run pushes a resolution to the pull request
- **THEN** the evidence table describes the catch-up run, and the earlier table is gone

### Requirement: Each evidence row reports what the loop recorded, or says it was not checked

The evidence table SHALL have these rows, each filled only from the loop's record of the run:

- **Tests:** the result of each of the role's `checks` (`loop-verifies-commands`) when the
  loop ran it after the worker finished: passed, failed with its exit code, timed out, or not
  run; and, for each check that did not pass, the end of its output.
- **Commands the worker ran:** how many commands the worker ran and how many of them failed.
  Every command is listed with its exit code where the record holds one, and otherwise with
  whether it failed.
- **Files changed:** how many paths the run published, which of them fall outside the issue's
  scope, and any base change the run declared it undid (*A base change is undone only where the
  resolution says so*).
- **Sandbox denials:** each command the sandbox stopped.
- **Cost:** the reported cost and the number of turns.

A row the loop holds no record for SHALL say `not checked` and why; the Commands row says
`not recorded` instead. No row SHALL report a pass it did not record.

The execution record SHALL keep the count of assistant turns on every run, including runs whose
cost was reported.

#### Scenario: A check that never ran is not shown as passing

- **WHEN** the role declares no checks
- **THEN** the Tests row says `not checked: the role declares no checks`

#### Scenario: A failed check is shown as failed

- **WHEN** the loop ran the check `npm test` and it exited 1
- **THEN** the Tests row says `fail`, names `npm test` with its exit code, and shows the end of
  its output

#### Scenario: A resolution's scope is not checked

- **WHEN** a run publishes a resolution onto an existing pull request
- **THEN** the Files changed row says the push was not checked against the issue's scope

#### Scenario: A run's turns are shown with or without its cost

- **WHEN** one run of 23 turns reported a cost of $0.42, and another of 23 turns reported none
- **THEN** the first run's Cost row says `$0.42, 23 turns`, and the second's says
  `not reported, 23 turns`

### Requirement: One review label sorts a pull request for triage, never for merging

Each time a run opens a pull request or publishes the worker's changes onto one, the Igor SHALL
set exactly one of the labels `review: skim` and `review: read` on it, and SHALL remove the
other. The loop sets this label itself, as it sets the `igor:<role>` claim label, so the role's
`allow` need not list `label`.

The label SHALL be `review: skim` only when all four hold:

- every check in the Tests row passed;
- the scope check ran and no changed path falls outside the issue's scope;
- the run published at most 5 paths, and declared no base change undone;
- the Sandbox denials row says `none`.

Otherwise the label SHALL be `review: read`, including where any of these rows says
`not checked`.

The label SHALL NOT approve, merge, mark a draft ready, or change which reviewers are
requested. A pull request labelled `review: skim` still needs a person's approval, as
*A person approves every Igor pull request* requires.

A failure to set the label SHALL leave the pull request open as it is, and the execution record
SHALL note the failure.

#### Scenario: A clean small change is labelled skim

- **WHEN** every check passed, no path falls outside scope, 3 paths changed, no base change was
  undone, and the sandbox denied nothing
- **THEN** the pull request is labelled `review: skim`

#### Scenario: An unchecked row makes the label read

- **WHEN** every other condition for `review: skim` holds, but the scope check did not run
- **THEN** the pull request is labelled `review: read`

#### Scenario: A later push swaps the label

- **WHEN** a pull request labelled `review: skim` gets a resolution whose scope is not checked
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
