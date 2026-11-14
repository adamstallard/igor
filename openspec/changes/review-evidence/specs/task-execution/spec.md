## ADDED Requirements

### Requirement: A pull request body holds a capped summary, then the loop's evidence

The body of a pull request an Igor opens SHALL hold, in this order:

1. the opening block;
2. the worker's summary, capped at 700 characters;
3. the evidence section: the marker `<!-- igor:evidence -->`, then, where the summary was cut, a
   pointer to the run's full transcript on the state branch (the branch of the store that holds
   Igor's run records), then the evidence table and the blocks under it.

Every line the loop adds outside the opening block SHALL come after the marker.

#### Scenario: A long summary is cut and points at the transcript

- **WHEN** the worker's summary is 1,500 characters
- **THEN** the body holds at most its first 700 characters, then the marker, the transcript
  pointer and the evidence table

### Requirement: What the opening block holds

The opening block SHALL hold, in order:

- for a role under the two-gate workflow (#150), the text #150 places first, as *The text #150
  places first in a pull request body* lists it;
- for every role, the line linking the pull request to its item by the adapter's convention, or
  at gate one the reference #150 requires, which does not close the item.

#153 points to this one definition.

#### Scenario: A role outside the two-gate workflow opens with the item link

- **WHEN** a role not under #150 opens a pull request
- **THEN** the body opens with the line linking the pull request to its item, then the summary

### Requirement: The text #150 places first in a pull request body

For a role under #150, the opening block SHALL start, at gate one, with the "specification only"
opening and the paths outside `openspec/changes/` that gate one refused to publish; and at gate
two, with the note that the item changed after the spec was approved, and the open decisions
bug-hunter left for a person.

#### Scenario: Gate two's notes open the body

- **WHEN** a role under `follow-the-two-gate-workflow` (#150) publishes gate two, the item
  changed after its spec was approved, and bug-hunter left an open decision for a person
- **THEN** the body opens with the note that the item changed and that decision, then the line
  linking the pull request to its item, and only then the summary

### Requirement: The worker's summary is capped at 700 characters

The worker's summary in a pull request body SHALL be at most 700 characters, cut at the last
sentence end in its first 700 characters where that end falls after character 350, and
otherwise at 700 characters. A sentence end is a `.` followed by a space or a line break, and the
cut keeps the `.`. For a role whose `skills` lists `prose`, the description `signed-publishing`
(#153) has signed takes the summary's place, uncut, and `prose verify-post` runs on it under
#153's rule.

#### Scenario: A summary is cut at its last sentence end after character 350

- **WHEN** the worker's summary is 1,500 characters, and its last sentence end in the first 700
  characters falls at character 600
- **THEN** the body holds the summary's first 600 characters

### Requirement: A revision recomputes the opening block

A revision, under #150, is a push answering a reviewer's change request. On a revision the loop
SHALL recompute the opening block: bug-hunter's open decisions come from the latest bug-hunter
run (none where the role does not list bug-hunter), and the note that the item changed, which
only gate two's opening block holds, compares the item with the version approved at gate one.

#### Scenario: A revision drops a settled bug-hunter decision

- **WHEN** gate two's body lists an open bug-hunter decision, and a revision's bug-hunter run
  leaves none open
- **THEN** after the revision, the opening block lists no bug-hunter decision

### Requirement: Every evidence value comes from the loop's own record

Every value in the table SHALL come from what the loop
itself recorded or kept, never from the worker's summary. That record is this run's, except for
the Files changed row's scope part on a push `scope-check` (#187) does not check, which comes from
the pull request's last recorded scope result. The loop's record includes the check output that
`loop-verifies-commands` (#189) keeps.

#### Scenario: A summary's claim of passing tests is not evidence

- **WHEN** the worker's summary says every test passed, and the loop recorded the check
  `npm test` exiting 1
- **THEN** the Tests row shows `npm test` as failed

### Requirement: A summary cannot carry the evidence marker or heading

Every occurrence of the marker, and every whole line that contains the table's heading,
`**Checked by Igor, not reported by the worker**`, SHALL be removed from the summary. A signed
description holding either SHALL NOT be edited, since that would break its signature; it SHALL
be returned to the prose pass, the `signed-publishing` (#153) model step that writes and signs
the description, as #153 returns any text that fails.

#### Scenario: A summary cannot pose as evidence

- **WHEN** the worker's summary contains the table's heading, or the marker in the middle of a
  line
- **THEN** the heading's line and the marker are removed from the summary
- **AND** the body holds exactly one evidence table, built by the loop

### Requirement: Commands, paths and output in the table are redacted and quoted

Each command, path and piece of check output in the table SHALL be redacted by *credential
redaction*, the requirement *Credential redaction replaces every credential the Igor knows* in
the change `redact-state-branch` (#217). That requirement, not this one, lists what the rule
matches. A command or path SHALL be shown on one line as inline code, and check output in a
fenced block, each quoted so that it cannot end its code span or block, its cell, or the table.

#### Scenario: A credential in a command is redacted in the table

- **WHEN** a command the worker ran holds a GitHub installation token the Igor minted
- **THEN** the table shows `[redacted]` where the token was

#### Scenario: A command cannot break the table

- **WHEN** the worker ran a command holding a backtick, a `|` and a newline
- **THEN** the command is shown in one cell, and the table's rows are unchanged

### Requirement: Each publish onto a pull request rebuilds its evidence section

Each time a run publishes the worker's changes onto an existing pull request, the loop SHALL
replace the evidence section with one built from that run. It SHALL leave the opening block, the
summary or description, and the transcript pointer or its absence as they are, except on a
revision. On a revision the loop recomputes the opening block, #153 rewrites a description, and a
summary is replaced by the revision run's, capped, with a pointer only where that one is cut.

#### Scenario: A later push replaces the table

- **WHEN** a catch-up run pushes a resolution to the pull request
- **THEN** the evidence table describes the catch-up run, and the earlier table is gone

#### Scenario: A revision replaces the worker's summary

- **WHEN** a role whose `skills` does not list `prose` publishes a revision, and the revision
  run's summary is 300 characters
- **THEN** the body holds the revision run's summary in place of the earlier one, with no
  transcript pointer, and the evidence section is rebuilt from the revision run

#### Scenario: A merge the code host makes leaves the table

- **WHEN** the code host merges the base into the pull request without a worker
- **THEN** the evidence table is left as it is

### Requirement: Each evidence row reports what the loop recorded, or says it was not checked

The evidence table SHALL have these rows, in this order, each filled as *Every evidence value comes
from the loop's own record* says: Tests, Commands run, Files changed, Spec scenarios and Sandbox denials, each defined
by a requirement below; and Cost, the reported cost and the number of turns.

A row the loop holds no record for SHALL say `not checked` and why; the Cost row says
`not reported` where the provider reported no cost. No row SHALL report a pass it did not
record.

#### Scenario: A check that never ran is not shown as passing

- **WHEN** the role declares no checks
- **THEN** the Tests row says `not checked: the role declares no checks`

#### Scenario: A run's turns are shown with or without its cost

- **WHEN** one run of 23 turns reported a cost of $0.42, and another of 23 turns reported none
- **THEN** the first run's Cost row says `$0.42, 23 turns`, and the second's says
  `not reported, 23 turns`

### Requirement: The Tests row gives each check's result as the loop recorded it

The Tests row SHALL give the result of each of the role's `checks`, as `loop-verifies-commands`
(#189) records it after the worker finished: passed, failed with its exit code, timed out, or
not run. Where any did not pass, #189 makes the pull request a draft, the row says so, and the
end of the output of each check that failed or timed out follows the table.

#### Scenario: A failed check is shown as failed

- **WHEN** the loop ran the check `npm test` and it exited 1
- **THEN** the Tests row says `**fail**`, names `npm test` with its exit code, and says the pull
  request is a draft because of it
- **AND** the end of the check's output follows the table

### Requirement: The Tests row names each CI-only check as one Igor did not run

The Tests row SHALL name each of the repository's `ci_only` lines, the checks its `repos` entry
leaves to its own CI (#189), as a check Igor did not run, in #189's wording, and SHALL show no CI
result for any of them.

#### Scenario: A CI-only check shows no CI result

- **WHEN** the repository lists `npm run test:e2e` under `ci_only`, and its CI reports that
  check failed
- **THEN** the Tests row names `npm run test:e2e` as a check Igor did not run, and shows no CI
  result for it

### Requirement: The Commands run row counts every model step's shell calls

The Commands run row SHALL count the shell (`Bash`) calls the run's model steps made, and those
that failed: the worker's (its subagents' included) and those of #153's bug-hunter step and prose
pass, which `keep-action-log` (#188) labels `worker`, `bug-hunter` or `prose`, its only labels.
A call failed where it exited non-zero, failed with no exit code, or never returned. It lists at
most 30 commands, each with the exit code, error or missing result #188 recorded, and counts the
rest.

#### Scenario: A failed command of bug-hunter's is counted

- **WHEN** the worker made 4 shell calls that exited 0, and #153's bug-hunter step made 1 that
  exited 1
- **THEN** the Commands run row counts 5 calls and 1 failed

### Requirement: The Files changed row gives the published paths and their scope

The Files changed row SHALL give how many paths the run published, the scope result that
`scope-check` (#187) states for the run's push, and any base change the run declared it undid
(under the in-force *A base change is undone only where the resolution says so*). A catch-up
resolution is a worker's resolution of the conflicts left when the base is merged into the pull
request (*A published artifact is kept mergeable*); for one, the paths counted are only those its
own resolution changed.

#### Scenario: A resolution shows the scope result scope-check states for it

- **WHEN** a run publishes a resolution onto a pull request whose last checked push found every
  path inside scope
- **THEN** the Files changed row gives that earlier result, marked as found by an earlier push
- **AND** it says the run's push was not checked

### Requirement: The Sandbox denials row lists each command the sandbox refused the worker

The Sandbox denials row SHALL list each command the sandbox refused the worker.
The sandbox is the worker's permission check: it lets the worker run only what the role's
`commands` permits, and reports each call it refuses.

#### Scenario: A refused command is listed

- **WHEN** the role's `commands` does not permit `curl`, and the sandbox refuses the worker's call
  `curl example.com`
- **THEN** the Sandbox denials row lists `curl example.com`

### Requirement: The execution record keeps every run's turns and changed lines

The execution record SHALL keep the count of assistant turns on every run, whether or not its
cost was reported, and the number of lines the run's published paths add and remove.

#### Scenario: A run with a reported cost keeps its turns

- **WHEN** a run of 23 turns reports a cost of $0.42, and its published paths add 90 lines and
  remove 30
- **THEN** its execution record keeps the count of 23 turns, and the number of lines its
  published paths add and remove

### Requirement: The Spec scenarios row is read from spec-trace

The loop SHALL fill the Spec scenarios row by running the `spec-trace` skill's script,
`<skills_dir>/skills/spec-trace/scripts/spec_trace.py report --include-changes`, in a checkout
of exactly the pull request's head that the loop makes, whether or not the role lists the skill.
`<skills_dir>` is the pinned skills directory that `pinned-skills` (#174) installs. It SHALL make
no model call for the row. The Spec scenarios row SHALL NOT change the review label.

#### Scenario: A scenario without a test is shown

- **WHEN** a pull request's spec delta adds two scenarios, and after gate two's push a test in
  the pull request tags only one
- **THEN** the Spec scenarios row names the scenario no test tags

### Requirement: The Spec scenarios row counts the scenarios the pull request's spec files hold

The script's report gives each scenario, with the deltas of every open OpenSpec change in the
repository applied, and the tests that tag it. From that report the row SHALL count the
scenarios in the spec files, delta or main, that the pull request changes against its base, and name each of them
that no test tags. The script finds the
test files itself, from the repository's test runner configuration (shared-skills PR #21); the
loop passes it no patterns.

#### Scenario: The row counts a changed spec file's scenarios

- **WHEN** a pull request changes one spec file holding 6 scenarios, and tests tag 5 of them
- **THEN** the Spec scenarios row counts 6 scenarios and names the one no test tags
- **AND** the loop passed the script no test file patterns

### Requirement: The Spec scenarios row says not checked where spec-trace cannot apply

The Spec scenarios row SHALL say `not checked`, with the reason, on a gate-one pull request under
`follow-the-two-gate-workflow` (#150), which carries no tests; where the repository has no
`openspec/specs/`; where the skill is not installed in the pinned skills directory; where the
script fails; and where it finds no test files.

#### Scenario: A repository without specs is not checked

- **WHEN** the repository has no `openspec/specs/`
- **THEN** the Spec scenarios row says `not checked` and why

#### Scenario: A missing skill is not checked

- **WHEN** the pinned skills directory holds no `spec-trace` skill
- **THEN** the Spec scenarios row says `not checked` and why, and the run goes on

### Requirement: A role listing spec-trace directs its worker to tag tests

A role whose `skills` lists `spec-trace` SHALL have its worker's standing instructions direct it
to use the skill, which `pinned-skills` (#174) loads as `igor:spec-trace`. That worker is to tag each test it writes with the
scenario that test checks; the loop does not enforce it, and its run of the script shows whether
it did.

#### Scenario: A role listing spec-trace has its worker directed to it

- **WHEN** a role's `skills` lists `spec-trace`
- **THEN** its worker is directed to use `igor:spec-trace`
- **AND** the loop's run of the script shows whether each test the worker wrote is tagged

### Requirement: One review label sorts a pull request for triage, never for merging

Each time a run opens a pull request or publishes the worker's changes onto one, the Igor SHALL
set exactly one of the labels `review: skim` and `review: read` on it, chosen as *A pull request
is labelled skim only when its evidence is clean* says, and SHALL remove the other. The loop sets
this label itself, so the role's `allow` list need not include `label`.

#### Scenario: A later push swaps the label

- **WHEN** a pull request labelled `review: skim` gets a resolution whose check fails
- **THEN** it is labelled `review: read`, and `review: skim` is removed

### Requirement: A pull request is labelled skim only when its evidence is clean

The label SHALL be `review: skim` only when all four hold:

- every check Igor ran passed, as the Tests row shows;
- the Files changed scope result found no path outside scope (for a push `scope-check` skips,
  the last checked push's);
- the run is small (*A run is small only within the role's skim thresholds*);
- the Sandbox denials row says `none`.

Otherwise it SHALL be `review: read`, as where the Tests row or scope part says `not checked`.
Its effect on a resolution is open (design.md).

#### Scenario: A CI-only check does not keep a pull request from skim

- **WHEN** every check Igor ran passed, the repository lists `npm run test:e2e` under `ci_only`,
  and every other condition for `review: skim` holds
- **THEN** the Tests row names `npm run test:e2e` as a check Igor did not run
- **AND** the pull request is labelled `review: skim`, whatever the repository's CI reports for
  that check, since Igor never reads that result

#### Scenario: A clean small change is labelled skim

- **WHEN** every check passed, no path falls outside scope, 3 paths changed by 120 lines, no
  base change was undone, the sandbox denied nothing, and the role keeps the default thresholds
- **THEN** the pull request is labelled `review: skim`

#### Scenario: An unchecked row makes the label read

- **WHEN** every other condition for `review: skim` holds, but the scope check did not run
- **THEN** the pull request is labelled `review: read`

#### Scenario: A resolution keeps the scope condition it last met

- **WHEN** a pull request whose gate-two push was checked and found nothing outside scope gets a
  resolution, after which every other condition for `review: skim` holds
- **THEN** it is labelled `review: skim`

#### Scenario: A worker's failed command does not change the label

- **WHEN** the worker ran `npm test`, saw it fail, then fixed the code, and the loop's run of
  the check passed
- **THEN** the label is set from the conditions above, and the failed command does not count

### Requirement: A run is small only within the role's skim thresholds

A run SHALL count as small where, and only where, it published at most the role's
`skim_max_paths` paths, added and removed at most its `skim_max_lines` lines between them, and
declared no base change undone. For a catch-up resolution, as *The Files changed row gives the
published paths and their scope* defines it, these count only what the Igor's own resolution
changed, never what the base brought in.

#### Scenario: A change over the line threshold is labelled read

- **WHEN** every other condition for `review: skim` holds, but the run added and removed 260
  lines and the role keeps the default `skim_max_lines` of 200
- **THEN** the pull request is labelled `review: read`

#### Scenario: A resolution's size counts only its own changes

- **WHEN** a catch-up resolution brings in 40 paths from the base, and its own resolution
  changes 2 paths by 30 lines
- **THEN** the size test for `review: skim` counts 2 paths and 30 lines

### Requirement: The review label changes nothing else about a pull request

The review label SHALL NOT approve, merge, mark a draft ready, or change which reviewers are
requested. A pull request labelled `review: skim` still needs a person's approval, as
*A person approves every Igor pull request* requires.

A failure to set the label SHALL leave the pull request open as it is, and the execution record
SHALL note the failure.

#### Scenario: A label the host refuses leaves the pull request as it is

- **WHEN** the code host refuses to set the label
- **THEN** the pull request stays open with its body, draft status and reviewers unchanged
- **AND** the run's execution record names the failure

#### Scenario: Skim does not stand in for approval

- **WHEN** a pull request is labelled `review: skim`
- **THEN** its reviewers are requested as for any other pull request
- **AND** no Igor merges it without a person's approval
