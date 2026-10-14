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
      keep the entries the spec lists, the subagents' calls marked with their parent call. Read
      a shell call's exit code from its result's text, in the spec's three cases.
      Redact each kept string as it is collected (3.1), so nothing downstream holds it
      unredacted.
- [ ] 2.2 Carry the collected calls on the `ExecutionResult` of every path that started the worker, the
      throw path included.

## 3. Write

- [ ] 3.1 Build credential redaction as one shared function. Its values are every seat token
      `src/budget.ts` has read and the value of every variable in the worker's and the Igor's
      environment whose name holds a credential word and whose value is 8 characters or more;
      its patterns are the token prefixes the spec lists. Build the set of values before the
      worker starts, and add a seat token read later in the run before the next string is
      redacted.
      The marker is exactly `[redacted]`. `loop-verifies-commands` (#189) and `review-evidence`
      (#190) redact with the same function: whichever of the three changes ships first builds
      it, and the others call it.
- [ ] 3.2 Read the store's and the worked repository's visibility with `isPublic`, treating an
      error as public, and cut the entries to the tier that applies.
- [ ] 3.3 Cap inputs at 1,000 characters and output at its last 2,000, then trim the document to
      512 KiB from the start, recording how many entries were dropped.
- [ ] 3.4 In `recordExecution`, write the log after the transcript, catching and reporting its
      failure. Name its path in the ledger row as `actions` only where the worker made a tool
      call, and record the tier as `tier` in the log.

## 4. Tests

- [ ] 4.1 A failed `npm test` call is logged with its error and output tail; the ledger row names
      the log.
- [ ] 4.2 A Read and an Edit log their path and no contents.
- [ ] 4.3 A seat token in `env` output, a seat token read from `token_file`, and a variable named
      `*_TOKEN` in the Igor's environment are logged as `[redacted]`. A 3-character value of a
      variable named `*_KEY` is not.
- [ ] 4.4 Each tier: private store; public store with public repository; public store with
      private repository; a visibility read that throws.
- [ ] 4.5 A log past 512 KiB keeps its latest calls and counts the dropped ones.
- [ ] 4.6 A failed log write still lets the capacity observation be written.
- [ ] 4.7 Exit codes: an error beginning `Exit code 128` records 128; a result that is not an
      error records 0; an error in any other format records no code.
