## ADDED Requirements

### Requirement: Every model step's tool calls are recorded beside the transcript

Every run that started the worker SHALL write an action log of its tool calls to the state
branch, whatever its outcome, a killed worker included, with two exceptions. A run whose steps
made no tool call SHALL write none. Nor does a run whose log is withheld under *A public store
holds no action log of a private repository*. A run that writes no log SHALL name none in its
ledger row in `executions.ndjson`.

#### Scenario: A failed run keeps its log

- **WHEN** a worker runs `npm test`, it fails, and the run ends with no artifact
- **THEN** the action log holds the call, its error, and the end of its output
- **AND** the run's ledger row names the log

### Requirement: The action log covers every model step of the run

The action log SHALL cover every model step the Igor runs in the run: the worker, its subagents
included, and the two steps `signed-publishing` (#153) adds after it, the bug-hunter step where
the role's `skills` list names `bug-hunter` and the prose pass where it names `prose`. The rules
on the order of calls, what an entry holds, output and file contents, and a failed write apply to
each step's calls alike.

#### Scenario: The bug-hunter step's calls are logged and labelled

- **WHEN** a role's `skills` list names `bug-hunter`, and #153's bug-hunter step runs `npm test`
  after the worker finishes
- **THEN** the action log holds that call, labelled `bug-hunter`, after the worker's calls

### Requirement: A failed action log write does not stop the run's later writes

A failure to write the action log SHALL be reported and SHALL NOT stop the run's later writes to
the state branch, such as its capacity observation.

#### Scenario: A failed log write does not stop the later writes

- **WHEN** writing the action log fails
- **THEN** the failure is reported
- **AND** the run's capacity observation is still written

### Requirement: Each run's action log has a path of its own

A run's action log SHALL be written at `transcripts/<tracker>/<repo>/<native>.<at>.actions.json`.
`<tracker>`, `<repo>` and `<native>` are those of the item's transcript path. `<at>` is the
millisecond time on the run's ledger row in `executions.ndjson`, with each maximal run of characters
outside `[A-Za-z0-9_-]` replaced by one `-`. Where a log already exists at that path, `-2`, `-3` and
so on SHALL be added to `<at>` until the path is free. The run's row SHALL name that path.

#### Scenario: A later run of the same item keeps the earlier log

- **WHEN** two runs of the same item each start the worker, such as the specification run and
  the later implementation run of the two-gate workflow (#150)
- **THEN** the state branch holds two action logs, one per run
- **AND** each run's ledger row names its own log

### Requirement: The action log lists the calls in the order they were made

The log SHALL list the tool calls in the order they were made, subagents' calls included, each
marked with a reference to its subagent's starting call.

#### Scenario: A subagent's calls are marked with the call that started it

- **WHEN** the worker starts a subagent, and the subagent runs a command
- **THEN** the log holds the subagent's call in the order it was made
- **AND** marks it with the worker's call that started the subagent

### Requirement: An action log entry records one tool call and its result

Each entry SHALL hold the step that made it (`worker`, `bug-hunter` or `prose`), the tool's name,
whether the result was an error, a shell call's exit code as *A shell call's exit code is read
from its result's text* reads it, and the input: the command for a shell call (`Bash`), the path
for a file tool (`Read`, `Write`, `Edit`, `NotebookEdit`), the pattern for a search (`Grep`,
`Glob`), else the input as given.

#### Scenario: A shell call's entry names its step, tool, command and result

- **WHEN** the worker runs `npm test` as a shell call, and its error result's text begins
  `Exit code 1`
- **THEN** the call's entry holds the step `worker`, the tool `Bash`, the command `npm test`, that
  the result was an error, and exit code 1

### Requirement: The action log keeps a call's output, not a file's contents

For a shell call, or any tool's error result, an entry SHALL hold the last 2,000 characters of the
output as Claude Code's output stream gives it: standard output and standard error together, and
the `Exit code <n>` prefix kept. For a long output the cut and the kept prefix conflict, as the proposal's open questions
say. The log SHALL NOT hold what a file tool read or wrote, nor the
text of an edit. A shell call's output is kept as output, whatever the command printed, a file
included.

#### Scenario: Edited contents are not logged

- **WHEN** the worker reads a file and then edits it
- **THEN** the log holds both calls with the file's path
- **AND** neither the file's contents nor the edit's text

### Requirement: A shell call's exit code is read from its result's text

A shell call's exit code SHALL be recorded as:

- `0`, where the result is not an error;
- the number `<n>`, where the result is an error whose text begins `Exit code <n>`;
- no code, where the result is an error and its text does not begin that way.

A call that never returned a result, as when the worker is killed during it, SHALL be recorded
with no error status, code or output. If the `Exit code <n>` format changes, an
error result SHALL keep its error status and no code, never a wrong code.

#### Scenario: A failing command's code is parsed from its text

- **WHEN** a shell call's result is an error whose text begins `Exit code 128`
- **THEN** the entry records exit code 128

#### Scenario: A successful command records 0

- **WHEN** a shell call's result is not an error
- **THEN** the entry records exit code 0

#### Scenario: An error in an unknown format records no code

- **WHEN** a shell call's result is an error whose text does not begin `Exit code`
- **THEN** the entry records the error and no exit code

### Requirement: The action log is redacted as each call is collected

The action log SHALL apply credential redaction to each string as the call is collected,
before any later step, such as `review-evidence` (#190), reads it, so that no copy of a call,
in memory or in the log, holds a credential. The rule is the requirement *Credential redaction
replaces every credential the Igor knows* in the change `redact-state-branch` (#217), which
says what the rule matches; the proposal's open questions name credentials it misses. This
requirement adds nothing to it.

#### Scenario: The seat token is redacted

- **WHEN** the worker runs `env`, whose output the log keeps
- **THEN** the calls the run collects in memory, which `review-evidence` (#190) reads, hold
  `[redacted]` where the seat token was
- **AND** so does the log written to the state branch

### Requirement: A public store holds no action log of a private repository

Whatever the store's visibility, entries SHALL be kept as *An action log entry records one tool
call and its result* and *The action log keeps a call's output, not a file's contents* describe.
Whether the log is written SHALL follow `visibility-guard`'s *Nothing from a private repository
is written to a public state branch*, which counts the log as content. Where the guard finds the
worked repository private and the store public just before writing, the run writes no log to
the state branch.

#### Scenario: A public repository's log in a public store is kept whole

- **WHEN** a worker on a public repository runs commands, and the store is public
- **THEN** the log keeps each call's command and output, redacted and capped

#### Scenario: A store made public during a run gets no log

- **WHEN** a run on a private repository is under way, and the store is made public before the
  run's records are written
- **THEN** no action log of the run is written to the state branch

### Requirement: The action log is bounded

An entry's input SHALL be cut to 1,000 characters. The written log SHALL be at most 512 KiB.
Where it would be larger, output SHALL be dropped from the earliest entries first, then the
earliest entries themselves, and the log SHALL state how many entries were dropped.

#### Scenario: A long run keeps its end

- **WHEN** a run's log would exceed 512 KiB
- **THEN** the latest calls are kept whole
- **AND** the log states how many of the earliest were dropped
