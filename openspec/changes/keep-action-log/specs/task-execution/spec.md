## ADDED Requirements

### Requirement: The worker's tool calls are recorded beside its transcript

Every run that started the worker SHALL write an action log to the state branch at
`transcripts/<tracker>/<repo>/<native>.actions.json`, whatever the run's outcome, a killed
worker included. The run's `executions.ndjson` row SHALL name that path. A run whose worker made
no tool call SHALL write none.

The log SHALL list the tool calls in the order they were made, the subagents' calls included and
marked with the call that started them. Each entry SHALL hold:

- the tool's name;
- its input: the command for a shell call, the path for a file tool, the pattern for a search,
  and for any other tool its input as given;
- whether the result was an error, and the exit code where the stream states one;
- for a shell call or an error result, the last 2,000 characters of the output.

The log SHALL NOT hold any file's contents, whether read, written or edited.

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

### Requirement: The action log carries no credential the Igor knows

Before the log is written, every kept string SHALL have each of these replaced by
`[redacted]`:

- the value of every variable in the worker's environment, and in the Igor's own, whose name
  contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`, matched exactly;
- a private key block, and a string in the shape of a GitHub, Anthropic, AWS or Slack token.

#### Scenario: The seat token is redacted

- **WHEN** the worker runs `env` in a store that keeps output
- **THEN** the logged output holds `[redacted]` where the seat token was

### Requirement: What the action log keeps follows who can read the store

At write time, the Igor SHALL ask GitHub whether the store and the worked repository are
private. It SHALL NOT rely on the `publicStore` config key for this. A repository whose
visibility cannot be read SHALL be treated as public.

- A private store SHALL keep every entry whole, as "The worker's tool calls are recorded beside
  its transcript" describes.
- A public store SHALL keep no output text. Where the worked repository is public, it SHALL keep
  every entry without its output. Where the worked repository is private, it SHALL keep only each entry's
  tool name, error status and exit code.

The log SHALL record which of these three applied.

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
