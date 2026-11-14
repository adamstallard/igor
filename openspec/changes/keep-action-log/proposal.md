## Decisions for the reviewer

Each numbered decision is the reviewer's to decide. A heading or paragraph marked **Decided** is
settled; the rest of its decision stays open.

1. **Keep a log of the tool calls of every model step, not its raw stream.** The model steps are
   the worker and the bug-hunter step and prose pass #153 adds (see *Impact*). Each call keeps
   its tool, its input (a command, path or search pattern, else the input as given) cut to 1,000
   characters, whether it failed, and for a shell command the last
   2,000 characters of its output. Nothing a file tool read or wrote is kept, nor an edit's
   text; the artifact carries what was written. A shell command's output is kept, even where
   the command printed a file. *Rejected:* saving the stream whole. It holds every file the
   worker read, in full.
2. **Redact each call as it is collected.** The rule is *credential redaction*, the one
   redaction rule, which `redact-state-branch` (#217) defines along with what it matches and
   the alternatives it rejected (**Decided**); this change cites the rule rather than stating
   it. #217 also builds its function, `redact` in `src/redact.ts`, which this change calls.
   Redacting at collection means no later step holds a call unredacted: `review-evidence`
   (#190), which lists the worker's commands in the pull request body, reads them already
   redacted.

   This log depends on the rule matching a known secret by its exact value, not only by its
   shape. A seat token is the model-subscription credential an Igor puts in its worker's
   environment (`src/execute.ts:877`), where `env` prints it, and no pattern need fit its
   shape. #217's requirement lists every value and shape the rule matches. A credential file
   on the host that the worker can read, such as `~/.aws/credentials`, holds values the Igor
   never knew, and the rule's shapes are GitHub and Anthropic tokens only. So where the log
   keeps output, it keeps such a file's other secrets, an AWS key among them, as printed.

   *Rejected:* each change stating its own set of values and patterns to redact, which lets the
   sets drift apart, so a value one change redacts another could publish.

3. **The log's entries do not depend on who can read the store; the visibility guard decides
   whether the log is written** (**Decided**). The store is the lore store: the repository
   `igor.config.yaml` names as `destination`, which holds the state branch. The change
   `visibility-guard` (issue #219, pull request #220) refuses to work a private repository while
   the store is public. It also reads both visibilities again just before a run's records are
   written, and where it then finds the worked repository private and the store public, because
   one of them changed during the run, it writes no transcript or other text of that run. So a
   public store never holds a private repository's log, and this change keeps every entry as
   decision 1 describes, whatever the store's visibility. *Rejected:* also varying the log by
   the store's and the worked repository's visibility, which would state a second rule beside
   the guard for the same case. Whether a private store should get commands' output at all is a
   separate question, open in `design.md`; until it is decided, every store keeps it.
4. **Capped at 512 KiB, trimmed from the start:** the earliest entries' output first, then the
   earliest entries whole. A run's end, where it failed or finished, is what an auditor opens
   the log for. *Rejected:* dropping the latest calls, which loses the run's end.
5. **Kept for every run that started the worker**, whatever its outcome, the worker killed
   included. *Rejected:* keeping it only beside an artifact. A run that failed is where somebody
   most needs to see what was done.
6. **A shell call's exit code is parsed from the start of its result's text.** The stream holds
   no field for it: a failing call's result is an error whose text begins `Exit code <n>`
   (measured; the evidence is in `task-execution`'s decision record). The log records `0` for a result that is not an error, `<n>`
   for an error beginning that way, and no code for any other error. A change to that text's
   format degrades the entry to its error status, never to a wrong code.
   *Rejected:* dropping the exit code, which loses what tells a test failure from a crash.

The questions still open are in `design.md`.

## Why

`docs/architecture.md:1155` promises an audit of "every instruction acted on, who gave it, and
what changed as a result". A run keeps only the worker's closing summary as its transcript
(`src/execute.ts:1707`, written at `:2215-2227`), and the tool calls pass through `onEvent`
(`:1574`) to the watchdog and the progress line, and nowhere else. When the worker's tree is removed
(`src/worktree.ts:695-698`), nothing records what the worker ran. Issue #183.

## What Changes

- Each run in which any model step made a tool call writes
  `transcripts/<tracker>/<repo>/<native>.<at>.actions.json` to the state branch, beside the
  item's transcript (`<native>` is the item's id in its tracker, `<at>` the run's time), and its
  row in the execution ledger, `executions/<yyyy-mm-dd>.ndjson`, names it.
- Every kept string is redacted as it is collected, and every entry and the whole file are
  capped.
- No log reaches a public store from a private repository, by `visibility-guard`'s rules.

Not in this change: the pull request body. `review-evidence` decides what of this reaches it.
The commands the loop itself re-runs (`loop-verifies-commands`) are not the worker's, and are
not in this log.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: the tool calls of every model step in a run (the worker, and the
  bug-hunter step and prose pass that the open change `signed-publishing` (#153) adds) are
  recorded to the state branch, redacted and capped.

## Impact

- `src/execute.ts`: collect tool calls in `onEvent`, pair each with its result, and write the
  log in `recordExecution` after the transcript.
- Overlaps: #175 (`worker-user`) removes the route by which a worker under `igor serve` reads
  the Igor's credentials. Under `igor run` the worker runs as the person, and can still read
  their credential files. `review-evidence` (#190) reads the command
  list this change collects, redacted.
- Build order: issue #204 holds the order in which this and related changes are built. This change calls the redaction function that
  `redact-state-branch` (#217) builds, and `review-evidence` (#190) reads the calls this change
  collects.
- **Decided: the log covers every model step the Igor runs**, not the worker
  alone. `signed-publishing` (#153) adds two model steps after the worker, a bug-hunter step and
  a prose pass, for a role whose `skills` list names them. Each entry is labelled with its
  step. `review-evidence` (#190), which decides what of the log reaches the pull request body,
  lists the shell calls of all three steps in its evidence table. Decisions 1 and 5 apply to
  every step's calls alike. *Rejected:* logging the worker alone, which leaves the tests
  bug-hunter runs and the files the prose pass edits outside the audit.
