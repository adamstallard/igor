## 1. Measure

- [ ] 1.1 On a real `claude -p --output-format stream-json` run, record which fields carry a tool
      result's output, its error flag and a shell call's exit code, for Bash, Read, Edit and an
      `Agent` subagent call. Write what the stream actually holds into this change's
      `design.md`, and narrow the exit-code clause of the spec if no field states one.

## 2. Collect

- [ ] 2.1 In `execute`'s `onEvent`, pair each `tool_use` block with its `tool_result` by id, and
      keep the entries the spec lists, the subagents' calls marked with their parent call.
- [ ] 2.2 Carry the collected calls on the `ExecutionResult` of every path that started the worker, the
      throw path included.

## 3. Write

- [ ] 3.1 Redact every kept string as the spec says. The marker is exactly `[redacted]`.
- [ ] 3.2 Read the store's and the worked repository's visibility with `isPublic`, treating an
      error as public, and cut the entries to the tier that applies.
- [ ] 3.3 Cap inputs at 1,000 characters and output at its last 2,000, then trim the document to
      512 KiB from the start, recording how many entries were dropped.
- [ ] 3.4 In `recordExecution`, write the log after the transcript, catching and reporting its
      failure, and name its path in the ledger row as `actions`.

## 4. Tests

- [ ] 4.1 A failed `npm test` call is logged with its error and output tail; the ledger row names
      the log.
- [ ] 4.2 A Read and an Edit log their path and no contents.
- [ ] 4.3 A seat token in `env` output, and a variable named `*_TOKEN` in the Igor's
      environment, are logged as `[redacted]`.
- [ ] 4.4 Each tier: private store; public store with public repository; public store with
      private repository; a visibility read that throws.
- [ ] 4.5 A log past 512 KiB keeps its latest calls and counts the dropped ones.
- [ ] 4.6 A failed log write still lets the capacity observation be written.
