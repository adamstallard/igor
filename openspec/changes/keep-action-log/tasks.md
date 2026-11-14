## 0. Order

- [ ] 0.1 Build and archive in the order issue #204 gives. This change calls the redaction
      function `redact-state-branch` (#217) builds, so it follows #217.

## 1. Measure

- [x] 1.1 Measure, on a real `claude -p --output-format stream-json` run, how a shell call's
      result carries its output, error flag and exit code. Recorded in
      `openspec/specs/task-execution/decisions.md`: the code is only the `Exit code <n>` prefix
      of an error result, and the two output streams arrive merged.
- [ ] 1.2 On the same kind of run, record in `task-execution`'s decision record which fields
      carry a tool result's output and its error flag for Read, Edit and a subagent call (`Task`
      in `src/execute.ts:711`, `Agent` in newer Claude Code), and which tools write files.
      Where a result has no error flag, the spec records no error status; where a tool writes
      files and the spec does not list it as a file tool, add it to that list.
- [ ] 1.3 On the same kind of run, record what a shell call run in the background returns, and
      whether it can be told from a finished call. Where it can, record no exit code for it,
      and amend *A shell call's exit code is read from its result's text*.

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

- [ ] 3.1 The redaction of 2.1, as each call is collected: `redact` from `src/redact.ts`, the
      function `redact-state-branch` (#217) builds. #217 already makes `writeState` redact
      everything it writes, so the log is redacted a second time on its way to the state branch.
      That second pass needs no work here. This change adds no patterns or values of its own;
      `loop-verifies-commands` (#189) and `review-evidence` (#190) call the same function.
- [ ] 3.2 Write the log only where `visibility-guard`'s visibility check just before the write
      (that change's task 4.1) lets the run's content be written; otherwise write none, and name
      none in the run's row.
- [ ] 3.3 Read each shell call's exit code, then cap inputs at 1,000 characters and output at
      its last 2,000. Trim the document to 512 KiB by dropping the earliest entries' output
      first, then the earliest entries whole, recording how many entries were dropped whole.
- [ ] 3.4 In `recordExecution`, take the run's time first, write the log at the path the spec
      gives from that time, catching and reporting its failure, and then append the run's row
      to the execution ledger with that time, through an `appendRecord` that accepts the time
      from its caller. Reuse the character rule of `refusalPath` (`src/execute.ts`), which
      already names refusal envelopes from a time, and add the numeric suffix where a file
      already exists at that path. Name the log's path in the row as `actions` only where the
      log was written.

## 4. Tests

- [ ] 4.1 A failed `npm test` call is logged with its error and output tail; the ledger row names
      the log.
- [ ] 4.2 A Read and an Edit log their path and no contents.
- [ ] 4.3 A seat token in `env` output is
      `[redacted]` in the calls the run collects in memory, and in the written log.
- [ ] 4.4 A public repository's log in a public store keeps commands and output; a run whose
      records `visibility-guard` writes with structured fields only writes no log, and its row
      names none.
- [ ] 4.5 A log past 512 KiB keeps its latest calls and counts the dropped ones.
- [ ] 4.6 A failed log write still lets `recordExecution` write the capacity observation,
      the record of a budget stop that it writes last.
- [ ] 4.7 Exit codes: an error beginning `Exit code 128` records 128; a result that is not an
      error records 0; an error in any other format records no code.
- [ ] 4.8 Two runs of one item write two logs, and each ledger row names its own; a taken path
      gets `-2`.
- [ ] 4.9 A killed worker's run keeps its log, the unfinished call with no status; a run with
      no tool call writes none, and its row names none.
- [ ] 4.10 Labels: the prose pass's calls are `prose`, a bug-hunter triage's are `bug-hunter`,
      and a second worker pass's are `worker`.
- [ ] 4.11 A long failing output keeps its last 2,000 characters and its exit code; `cat` output
      is kept; a `Read` error keeps its text; a result with no error flag records no status.
- [ ] 4.12 Trimming drops the earliest output before any entry; a 5,000-character command is
      cut to 1,000.
