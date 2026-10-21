## 0. Order

- [ ] 0.1 Build this change after `redact-state-branch` (#217), since this change calls #217's
      redaction function. Then `review-evidence` (#190), since #190 reads the calls this change
      collects. Then `scope-check` (#187) and `loop-verifies-commands` (#189), in either order:
      both write only into the evidence table #190 adds to the pull request body, and neither
      depends on the other. Archive in the same order.

## 1. Measure

- [x] 1.1 Measure, on a real `claude -p --output-format stream-json` run, how a shell call's
      result carries its output, error flag and exit code. Recorded in `design.md`: the code is
      only the `Exit code <n>` prefix of an error result, and the two output streams arrive
      merged.
- [ ] 1.2 On the same kind of run, record in `design.md` which fields carry a tool result's output
      and its error flag for Read, Edit and a subagent call (`Task` in `src/execute.ts:699`,
      `Agent` in newer Claude Code). The spec assumes every result carries its output and an
      error flag; where a tool's result does not, amend the spec's list of what an entry holds.

## 2. Collect

- [ ] 2.1 In `execute`'s `onEvent`, pair each `tool_use` block with its `tool_result` by id, and
      keep the entries the spec lists, each subagent's calls marked with the id of the call that
      started that subagent. Read
      a shell call's exit code from its result's text, in the spec's three cases.
      Redact each kept string as it is collected, with the function task 3.1 names, so
      nothing downstream holds it unredacted.
- [ ] 2.2 Collect the same way, in each step's own event handler, from the bug-hunter step and
      the prose pass that `signed-publishing` (#153) runs after the worker. Label every entry
      `worker`, `bug-hunter` or `prose`.
- [ ] 2.3 Carry all the steps' collected calls on the `ExecutionResult` of every path that
      started the worker, including the path where the worker's run throws, appending the later steps' calls after the
      worker's.

## 3. Write

- [ ] 3.1 The redaction of 2.1, which runs once, as each call is collected: `redact` from
      `src/redact.ts`, the function `redact-state-branch` (#217) builds. This change adds no patterns or values of its own;
      `loop-verifies-commands` (#189) and `review-evidence` (#190) call the same function.
- [ ] 3.2 Read the store's and the worked repository's visibility with `isPublic`, treating an
      error on the store as public and on the worked repository as private, and cut the entries to the tier that applies.
- [ ] 3.3 Cap inputs at 1,000 characters and output at its last 2,000, then trim the document to
      512 KiB from the start, recording how many entries were dropped.
- [ ] 3.4 In `recordExecution`, write the log after the transcript, catching and reporting its
      failure, at the path the spec gives, named from the `at` of the run's row in
      `executions.ndjson`. Reuse the character rule of `refusalPath` (`src/execute.ts`), which
      already names refusal envelopes from a time, and add the numeric suffix where a file
      already exists at that path. Name the log's path in that row as `actions` only where the
      worker made a tool call, and record the tier as `tier` in the log.

## 4. Tests

- [ ] 4.1 A failed `npm test` call is logged with its error and output tail; the ledger row names
      the log.
- [ ] 4.2 A Read and an Edit log their path and no contents.
- [ ] 4.3 A seat token in `env` output and a seat token read from `token_file` are
      `[redacted]` in the calls the run collects in memory, and in the written log.
- [ ] 4.4 Each tier: private store; public store with public repository; public store with
      private repository; the store's visibility read throws; the worked repository's visibility
      read throws.
- [ ] 4.5 A log past 512 KiB keeps its latest calls and counts the dropped ones.
- [ ] 4.6 A failed log write still lets `recordExecution` write the capacity observation,
      the record of a budget stop that it writes last.
- [ ] 4.7 Exit codes: an error beginning `Exit code 128` records 128; a result that is not an
      error records 0; an error in any other format records no code.
- [ ] 4.8 Two runs of one item write two logs, and each ledger row names its own.
