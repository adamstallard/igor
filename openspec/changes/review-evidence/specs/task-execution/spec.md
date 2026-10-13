## ADDED Requirements

### Requirement: A pull request body holds a capped summary, then the loop's evidence

The body of a pull request an Igor opens SHALL hold, in this order:

1. the line linking it to its item, by the adapter's convention;
2. the worker's summary, at most 700 characters. A longer summary SHALL be cut at a sentence
   end where one falls in its second half, and SHALL end with a pointer to the full transcript;
3. the evidence table, which the loop builds from its own record of the run.

No text from the worker SHALL appear in the table. A line of the summary that repeats the
table's heading, or the HTML comment that marks where the table starts, SHALL be removed from
the summary, so the summary cannot pose as the table.

When a later run pushes to the pull request, the loop SHALL replace the table with one built
from that run.

#### Scenario: A long summary is cut and points at the transcript

- **WHEN** the worker's summary is 1,500 characters
- **THEN** the body holds at most its first 700 characters, then the transcript pointer, then
  the evidence table

#### Scenario: A summary cannot pose as evidence

- **WHEN** the worker's summary contains the table's heading
- **THEN** that line is removed from the summary
- **AND** the body holds exactly one evidence table, built by the loop

#### Scenario: A later push replaces the table

- **WHEN** a catch-up run pushes a resolution to the pull request
- **THEN** the evidence table describes the catch-up run, and the earlier table is gone

### Requirement: Each evidence row reports what the loop recorded, or says it was not checked

The evidence table SHALL have these rows, each filled only from the loop's record of the run:

- **Tests:** whether each of the role's commands passed when the loop re-ran it after the
  worker finished.
- **Commands the worker ran:** how many commands the worker ran and how many of them exited
  non-zero. Every command is listed with its exit code.
- **Files changed:** how many paths the artifact changes, which of them fall outside the issue's
  scope, and any base change the run declared it undid (*A base change is undone only where the
  resolution says so*).
- **Sandbox denials:** each command the sandbox stopped.
- **Cost:** the reported cost and the number of turns.

A row the loop holds no record for SHALL say `not checked` and why: either this Igor does not
make that check, or nothing is configured for it. The Commands row SHALL say `not recorded` in the same
cases. No row SHALL report a pass it did not record.

The execution record SHALL keep the count of assistant turns on every run, including runs whose
cost was reported.

#### Scenario: A check that never ran is not shown as passing

- **WHEN** the role names no commands
- **THEN** the Tests row says `not checked: the role names no commands`

#### Scenario: A failed re-run is shown as failed

- **WHEN** the loop re-ran `npm test` and it exited 1
- **THEN** the Tests row says `fail` and names `npm test` with its exit code

#### Scenario: A run with no reported cost still shows its turns

- **WHEN** the provider reported no cost for a run of 23 turns
- **THEN** the Cost row says `not reported` and `23 turns`

### Requirement: One review label sorts a pull request for triage, never for merging

On every pull request it opens or pushes to, an Igor SHALL set exactly one of the labels
`review: skim` and `review: read`, and SHALL remove the other.

The label SHALL be `review: skim` only when all four hold:

- every command in the Tests row passed;
- the scope check ran and no changed path falls outside the issue's scope;
- the artifact changes at most 5 paths, and the run declared no base change undone;
- the Sandbox denials row is empty.

Otherwise the label SHALL be `review: read`, including where any of these rows says
`not checked`.

The label SHALL NOT approve, merge, mark a draft ready, or change which reviewers are
requested. A pull request labelled `review: skim` still needs a person's approval, as
*A person approves every Igor pull request* requires.

A failure to set the label SHALL leave the pull request open as it is. The execution record
SHALL note the failure.

#### Scenario: A clean small change is labelled skim

- **WHEN** the tests passed, no path falls outside scope, 3 paths changed, no base change was
  undone, and the sandbox denied nothing
- **THEN** the pull request is labelled `review: skim`

#### Scenario: An unchecked row makes the label read

- **WHEN** every other condition for `review: skim` holds, but the scope check did not run
- **THEN** the pull request is labelled `review: read`

#### Scenario: A worker's failed command does not change the label

- **WHEN** the worker ran `npm test`, saw it fail, then fixed the code, and the loop's re-run
  passed
- **THEN** the label is set from the conditions above, and the failed command does not count

#### Scenario: Skim does not stand in for approval

- **WHEN** a pull request is labelled `review: skim`
- **THEN** its reviewers are requested as for any other pull request
- **AND** no Igor merges it without a person's approval
