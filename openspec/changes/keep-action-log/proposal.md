## Decisions for the reviewer

Each is the reviewer's to decide, except where marked **Decided**.

1. **Keep a log of the worker's tool calls, not its raw stream.** Each call keeps its tool, its
   command or path cut to 1,000 characters, whether it failed, and for a shell command the last
   2,000 characters of its output. Nothing a file tool read or wrote is kept, nor an edit's
   text; the artifact carries what was written. A shell command's output is kept, even where
   the command printed a file. *Rejected:* saving the stream whole. It holds every file the
   worker read, in full.
2. **Redact the credentials the Igor knows, by exact value as well as by pattern, as each call
   is collected.** The rule, *credential redaction*, is stated in this change's spec. Matching
   seat tokens by exact value matters because the Igor gives the worker its seat token (`src/execute.ts:868`), so `env`
   prints it, and until #163 is fixed by `worker-user` (#175) the worker can read the Igor's own credentials too.
   Redacting at collection means `review-evidence` (#190), which lists the worker's commands in
   the pull request body, reads them already redacted.
   *Rejected:* patterns alone, which miss a token whose shape no pattern names. *Rejected:*
   matching variables by name alone, which misses a seat whose `token_env` names a variable such
   as `SEAT_A`.

   **Decided (Adam, 2026-10-13): this is the only redaction rule.** `loop-verifies-commands`
   (#189) redacts published check output by it, and `review-evidence` (#190) redacts every
   command, path and output in the evidence table it adds to the pull request body. Neither
   restates the rule. *Rejected:* each change stating its own set of values and patterns to
   redact, which lets the sets drift apart, so a value one change redacts another could
   publish.
3. **What is kept depends on who can read the store, asked of GitHub at write time.** A private
   store keeps the whole log. A public store keeps no output text. It keeps commands and paths
   only where the worked repository is public too; otherwise it keeps only which tools ran and
   whether they failed. Each unknown resolves toward keeping the least: a store whose visibility cannot be read is
   treated as public, and a worked repository whose visibility cannot be read as private, since a
   public store with a private worked repository is the tier that keeps the least.
   *Rejected:* one rule for both, which is either useless in a private store or leaks in a public
   one. *Rejected:* trusting `publicStore`, the cached flag #91 shows can be stale.

   **Open question for the reviewer:** a private store is readable by its own collaborators,
   who need not be able to read the worked repository. Under this decision they can read the
   output of what the worker ran there, `cat` of a private file included, as they can already
   read its closing summary. The alternative is to treat a private store whose collaborators are
   not all readers of the worked repository like a public one, which needs a collaborator
   comparison on every write.
4. **Capped at 512 KiB, trimmed from the start.** A run's end, where it failed or finished, is
   what an auditor opens the log for. *Rejected:* dropping the latest calls, which loses exactly
   that.
5. **Kept for every run that started the worker**, whatever its outcome, the worker killed
   included. *Rejected:* keeping it only beside an artifact. A run that failed is where somebody
   most needs to see what was done.
6. **A shell call's exit code is parsed from the start of its result's text.** The stream holds
   no field for it: a failing call's result is an error whose text begins `Exit code <n>`
   (`design.md`). The log records `0` for a result that is not an error, `<n>`
   for an error beginning that way, and no code for any other error. A change to that text's
   format degrades the entry to its error status, never to a wrong code.
   *Rejected:* dropping the exit code, which loses what tells a test failure from a crash.

## Why

`docs/architecture.md:1155` promises an audit of "every instruction acted on, who gave it, and
what changed as a result". A run keeps only the worker's closing summary as its transcript
(`src/execute.ts:1662`, written at `:2167-2180`), and the tool calls pass through `onEvent`
(`:1531-1533`) to the watchdog and the progress line, and nowhere else. When the tree is removed
(`src/worktree.ts:695-698`), nothing records what the worker ran. Issue #183.

## What Changes

- Each run whose worker made a tool call writes
  `transcripts/<tracker>/<repo>/<native>.<at>.actions.json` to the state branch, beside the
  item's transcript (`<native>` is the item's id in its tracker, `<at>` the run's time), and its
  `executions.ndjson` row names it.
- Every kept string is redacted as it is collected, and every entry and the whole file are
  capped.
- How much is kept follows the store's visibility, read from GitHub.

Not in this change: the pull request body. `review-evidence` decides what of this reaches it.
The commands the loop itself re-runs (`loop-verifies-commands`) are not the worker's, and are
not in this log.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: a run's tool calls are recorded to the state branch, redacted, capped, and
  cut according to who can read the store.

## Impact

- `src/execute.ts`: collect tool calls in `onEvent`, pair each with its result, and write the
  log in `recordExecution` after the transcript.
- `src/github.ts`: `isPublic` is reused for the store and the worked repository.
- Overlaps: #175 (`worker-user`) removes the worker's route to the Igor's credentials; until it
  lands, decision 2 is all that keeps the Igor's credentials, which the worker can then read,
  out of this log. `review-evidence` (#190) reads the command
  list this change collects, redacted and before it is cut to what the store's visibility
  allows (decision 3), since the pull request is read by the worked repository's readers, not
  the store's.
- Build order: this change, then `review-evidence` (#190), then `scope-check` (#187) and
  `loop-verifies-commands` (#189), in either order; archive order follows the same sequence.
  This change builds credential redaction's function, which #189 and #190 call. #187 and #189
  write only into #190's evidence table, so they follow #190.
