## Decisions for the reviewer

Each is the reviewer's to decide, except where marked **Decided**.

1. **Keep a log of the worker's tool calls, not its raw stream.** Each call keeps its tool, its
   command or path cut to 1,000 characters, whether it failed, and for a shell command the last
   2,000 characters of its output. Nothing a file tool read or wrote is kept, nor an edit's
   text; the artifact carries what was written. A shell command's output is kept, even where
   the command printed a file. *Rejected:* saving the stream whole. It holds every file the
   worker read, in full.
2. **Redact each call as it is collected.** The rule is *credential redaction*, the one
   redaction rule, which `redact-state-branch` (#217) defines along with what it matches and
   the alternatives it rejected. #217 also builds its function, `redact` in `src/redact.ts`,
   which this change calls. Redacting at collection means no later step holds a call
   unredacted: `review-evidence` (#190), which lists the worker's commands in the pull request
   body, reads them already redacted.

   This log depends on the rule matching a known secret by its exact value, not only by its
   shape. A seat token is the model-subscription credential an Igor puts in its worker's
   environment (`src/execute.ts:868`), where `env` prints it, and no pattern need fit its
   shape. #217's requirement lists every value and shape the rule matches. A credential file
   on the host that the worker can read, such as `~/.aws/credentials`, holds values the Igor
   never knew, and the rule's shapes are GitHub and Anthropic tokens only. So where the log
   keeps output, it keeps such a file's other secrets, an AWS key among them, as printed.

   **Decided (Adam, 2026-10-13): there is one redaction rule.** `loop-verifies-commands`
   (#189) redacts published check output by it, and `review-evidence` (#190) redacts every
   command, path and output in the evidence table it adds to the pull request body. Neither
   #189 nor #190 restates the rule. *Rejected:* each change stating its own set of values and
   patterns to redact, which lets the sets drift apart, so a value one change redacts another
   could publish.

   **Decided (Adam, 2026-10-19): the rule's definition moves from this change to #217.** #217
   defines it and builds its function before this change. This change cites the rule rather
   than stating it.
3. **The log is not cut by who can read the store; the visibility guard decides whether it is
   written** (Adam, 2026-10-21). The change `visibility-guard` (issue #219, pull request
   #220) refuses to work a private repository while the store is public. It also reads both
   visibilities again just before a run's records are written, and where it then finds the
   worked repository private and the store public, because one of them changed during the run,
   it writes no transcript or other text of that run. So a public store never holds a private
   repository's log, and this change keeps every entry as decision 1 describes, whatever the
   store's visibility. This supersedes the earlier decision 3, which cut the log to one of
   three tiers by the store's and the worked repository's visibility. *Rejected:* keeping the
   tiers beside the guard, which would state a second rule for the same case.

   **Open question for the reviewer:** a private store is readable by its own collaborators,
   who need not be able to read the worked repository. They can read the output of what the
   worker ran in the worked repository, `cat` of a private file included, as they can already
   read the worker's closing summary. The alternative is to treat a private store whose collaborators are not all
   readers of the worked repository like a public one, which needs a collaborator comparison on
   every write.
4. **Capped at 512 KiB, trimmed from the start.** A run's end, where it failed or finished, is
   what an auditor opens the log for. *Rejected:* dropping the latest calls, which loses the run's
   end.
5. **Kept for every run that started the worker**, whatever its outcome, the worker killed
   included. *Rejected:* keeping it only beside an artifact. A run that failed is where somebody
   most needs to see what was done.
6. **A shell call's exit code is parsed from the start of its result's text.** The stream holds
   no field for it: a failing call's result is an error whose text begins `Exit code <n>`
   (`design.md`). The log records `0` for a result that is not an error, `<n>`
   for an error beginning that way, and no code for any other error. A change to that text's
   format degrades the entry to its error status, never to a wrong code.
   *Rejected:* dropping the exit code, which loses what tells a test failure from a crash.

**Still open:**

- **For Adam:**
  - whether a private store keeps the commands' output, the open question under decision 3;
  - whether a public store keeps a public repository's commands' output whole. A command can
    print a secret Igor never held, such as a key read from a host file, which redaction does
    not match;
  - whether a log should also be withheld where the item's tracker is private. The guard
    compares repositories only, and a command or subagent prompt kept whole can quote a private
    Linear issue's text into a public store; `visibility-guard` lists the same question.
- **For whoever next edits this change,** from a consistency read on 2026-10-21. None is
  decided, and none is fixed in this text:
  - **The row and the log's path.** `appendRecord` writes the run's row in `executions.ndjson`,
    and sets its `at` time, before execution writes the transcript. The row therefore names a
    log that is written later, and stays naming it when that write fails, which the spec
    allows. Nor can the row know whether the log's path will need a `-2` suffix.
  - **Exit codes.** A result that is not an error but carries no exit code, such as a shell
    command run in the background, would be recorded as exit 0. And keeping a long output's
    last 2,000 characters drops the `Exit code <n>` prefix at its start.
  - **Kept input.** An edit or write tool that the spec does not list among the file tools keeps its whole input,
    and so does a subagent call's prompt.
  - **Other changes.** #153 adds model steps of its own, a cold read, its answers and triages,
    that none of the three labels fits. #216 keeps only names for a run it withholds, even in a
    private store. #189 posts a comment of its own outside #190's table (its decision 7), though
    this change says #189 writes only into that table. After a failed check, #189 also starts
    the worker a second time, so one run can hold two worker passes, each followed by #153's
    steps. This change does not say how the second pass's calls are labelled or ordered.
  - **A token the Igor never sees.** Claude Code sets `CLAUDE_CODE_MESSAGING_TOKEN` itself. The
    Igor never learns its value, so redaction cannot match it by value, and a private store
    keeps it wherever `env` output is kept.
  - **From a consistency read of 2026-10-21's last round:**
    - #216 asks this change to keep, in the log of a run #216 withholds because it met a
      sensitive question, only each call's tool name, command name and exit code.
    - #153 runs more model steps than the labels `worker`, `bug-hunter` and `prose` name: its
      triages, an extra bug-hunter iteration and a cold read.
    - Tasks and *Impact* restate the build order, which issue #204 alone should hold, and so
      fix a place for #187 that #204 has not given it.
    - Three choices are made in the spec with no numbered decision: the log's path and its
      `-2` suffix, writing no log for a run with no tool call, and a failed write not stopping
      the run's later writes.
  - **New from a consistency read on 2026-10-21, after decision 3 was replaced,** not fixed
    here; the read also found again most of the items above. The redaction requirement promises
    that no copy of a call holds a credential, which a rule matching only known values and two
    token shapes cannot keep. And the last-2,000-character cut of a long output drops the
    `Exit code <n>` prefix that the spec says the entry keeps.
  - **The spec itself.** Several SHALLs have no scenario, and "the store" is not defined.
    Whether Read, Edit and subagent results carry an error flag and output is unmeasured
    (task 1.2), and the spec gives no fallback for a result that has neither.

## Why

`docs/architecture.md:1155` promises an audit of "every instruction acted on, who gave it, and
what changed as a result". A run keeps only the worker's closing summary as its transcript
(`src/execute.ts:1662`, written at `:2167-2180`), and the tool calls pass through `onEvent`
(`:1531-1533`) to the watchdog and the progress line, and nowhere else. When the tree is removed
(`src/worktree.ts:695-698`), nothing records what the worker ran. Issue #183.

## What Changes

- Each run in which any model step made a tool call writes
  `transcripts/<tracker>/<repo>/<native>.<at>.actions.json` to the state branch, beside the
  item's transcript (`<native>` is the item's id in its tracker, `<at>` the run's time), and its
  `executions.ndjson` row names it.
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
- Build order: this change, then `review-evidence` (#190), then `scope-check` (#187) and
  `loop-verifies-commands` (#189), in either order; archive order follows the same sequence.
  `redact-state-branch` (#217) builds credential redaction's function before this change, and
  this change, #189 and #190 all call it. `scope-check` (#187) and `loop-verifies-commands`
  (#189) write only into the evidence table #190 adds, so they follow #190.
- **Decided (Adam, 2026-10-13): the log covers every model step Igor runs**, not the worker
  alone. `signed-publishing` (#153) adds two model steps after the worker, a bug-hunter step and
  a prose pass, for a role whose `skills` list names them. Each entry is labelled with its
  step, and #190's evidence table lists the shell calls of all three. Decisions 1 and 5 apply to
  every step's calls alike. *Rejected:* logging the worker alone, which leaves the tests
  bug-hunter runs and the files the prose pass edits outside the audit.
