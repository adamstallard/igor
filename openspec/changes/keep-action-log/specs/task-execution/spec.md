## ADDED Requirements

### Requirement: The worker's tool calls are recorded beside its transcript

Every run that started the worker SHALL write an action log to the state branch at
`transcripts/<tracker>/<repo>/<native>.actions.json`, whatever the run's outcome, a killed
worker included. The run's `executions.ndjson` row SHALL name that path. A run whose worker made
no tool call SHALL write no log, and its row SHALL name none.

The log SHALL list the tool calls in the order they were made, the subagents' calls included and
marked with the call that started them. Each entry SHALL hold:

- the tool's name;
- its input: the command for a shell call (`Bash`), the path for a file tool (`Read`, `Write`,
  `Edit`, `NotebookEdit`), the pattern for a search (`Grep`, `Glob`), and for any other tool its
  input as given;
- whether the result was an error, and for a shell call its exit code, read as *A shell call's exit
  code is read from its result's text* says;
- for a shell call or an error result, the last 2,000 characters of the output as the stream
  gives it: standard output and standard error together, and the `Exit code <n>` prefix kept.

The log SHALL NOT hold what a file tool read or wrote, nor the text of an edit. A shell call's
output is kept as output, whatever the command printed.

A failure to write the log SHALL be reported and SHALL NOT stop the run's later writes to the
state branch.

#### Scenario: A failed run keeps its log

- **WHEN** a worker runs `npm test`, it fails, and the run ends with no artifact
- **THEN** the action log holds the call, its error, and the end of its output
- **AND** the run's ledger row names the log

#### Scenario: Edited contents are not logged

- **WHEN** the worker reads a file and then edits it
- **THEN** the log holds both calls with the file's path
- **AND** neither the file's contents nor the edit's text

#### Scenario: A failed log write does not stop the later writes

- **WHEN** writing the action log fails
- **THEN** the failure is reported
- **AND** the run's capacity observation is still written

### Requirement: A shell call's exit code is read from its result's text

A shell call's exit code SHALL be recorded as one of three:

- `0`, where the result is not an error;
- the number `<n>`, where the result is an error and its text begins `Exit code <n>`;
- no code, where the result is an error and its text does not begin that way. The entry then
  holds its error status and output, and no code.

A call that never returned a result, as when the worker is killed during it, SHALL be recorded
with no result: no error status, no code and no output.

The code is parsed from a text prefix, not read from a field. A change to that text's format
SHALL leave an error result with its error status and no code, never with a wrong code.

#### Scenario: A failing command's code is parsed from its text

- **WHEN** a shell call's result is an error whose text begins `Exit code 128`
- **THEN** the entry records exit code 128

#### Scenario: A successful command records 0

- **WHEN** a shell call's result is not an error
- **THEN** the entry records exit code 0

#### Scenario: An error in an unknown format records no code

- **WHEN** a shell call's result is an error whose text does not begin `Exit code`
- **THEN** the entry records the error and no exit code

### Requirement: Credential redaction replaces every credential the Igor knows

*Credential redaction* is one rule, applied wherever this or another change says text is
redacted. It replaces each of these with `[redacted]`:

- the token of every seat the Igor has read, whatever its source and whatever its variable's
  name;
- the value of every variable in the worker's environment, and in the Igor's own, whose name
  contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`, matched exactly, where the value
  is at least 8 characters long;
- a private key block (`-----BEGIN … PRIVATE KEY-----` to its `END` line), an `age` encryption
  secret key (`AGE-SECRET-KEY-1…`), and a token by its prefix: GitHub (`ghp_`, `gho_`, `ghu_`,
  `ghs_`, `ghr_`, `github_pat_`), Anthropic (`sk-ant-`), an AWS access key ID (`AKIA` and 16
  capital letters or digits), and Slack (`xoxa-`, `xoxb-`, `xoxp-`, `xoxr-`, `xoxs-`).

The action log SHALL apply credential redaction to each string as the call is collected, before
anything reads or writes it.

#### Scenario: The seat token is redacted

- **WHEN** the worker runs `env` in a store that keeps output
- **THEN** the logged output holds `[redacted]` where the seat token was

#### Scenario: A seat token read from a file is redacted

- **WHEN** a seat's token comes from its `token_file`, and a command the worker runs prints it
- **THEN** the logged output holds `[redacted]` where the token was

#### Scenario: A short value is not a credential

- **WHEN** a variable named `DEPLOY_KEY` holds a 3-character value
- **THEN** credential redaction leaves that value in place

### Requirement: What the action log keeps follows who can read the store

At write time, the Igor SHALL ask GitHub whether the store and the worked repository are
private. It SHALL NOT rely on the `publicStore` config key for this. A repository whose
visibility cannot be read SHALL be treated as public.

The log SHALL be cut to one of three tiers, and SHALL record which one applied:

- `whole`, for a private store: every entry as "The worker's tool calls are recorded beside its
  transcript" describes;
- `no-output`, for a public store and a public worked repository: every entry without its
  output;
- `tools-only`, for a public store and a private worked repository: each entry's tool name,
  error status and exit code.

#### Scenario: A private repository's commands stay out of a public store

- **WHEN** a worker on a private repository runs commands, and the store is public
- **THEN** the log lists each call's tool and error status, with no command, path or output

#### Scenario: Unknown visibility keeps the least

- **WHEN** GitHub cannot be asked whether the store is private
- **THEN** the log is cut as it would be for a public store

### Requirement: The action log is bounded

An entry's input SHALL be cut to 1,000 characters. The written log SHALL be at most 512 KiB.
Where it would be larger, output SHALL be dropped from the earliest entries first, then the
earliest entries themselves, and the log SHALL state how many entries were dropped.

#### Scenario: A long run keeps its end

- **WHEN** a run's log would exceed 512 KiB
- **THEN** the latest calls are kept whole
- **AND** the log states how many of the earliest were dropped
