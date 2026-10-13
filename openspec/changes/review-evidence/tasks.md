## 0. Measure first

- [ ] 0.1 Measure whether adding a label that does not exist yet to a pull request (`POST
      /repos/{repo}/issues/{n}/labels`), as an Igor's App, creates the label. If it does not,
      2.4 creates each label first. Record the answer in this change.

## 1. The record

- [ ] 1.1 Keep `assistantTurns` in the execution record on every run, not only where `costUsd`
      is undefined (`src/execute.ts:1496-1498`).
- [ ] 1.2 Add `reviewLabel` to the execution record: the label set, or the error that stopped it
      being set.

## 2. The table and the label

- [ ] 2.1 Write `evidenceTable(record)`, a pure function from the run's record to the table
      below. The wording is the deliverable: the heading, row names and fixed phrases may not be
      reworded. `<…>` marks a value.

      ```markdown
      <!-- igor:evidence -->
      ---
      **Checked by Igor, not reported by the worker**

      | Check | Result |
      |---|---|
      | Tests | pass: `<check>`, `<check>` |
      | Commands the worker ran | <n>, <k> failed |
      | Files changed | <n>, all inside the issue's scope |
      | Sandbox denials | none |
      | Cost | $<0.00>, <n> turns |

      <details><summary>Commands the worker ran</summary>

      | Result | Command |
      |---|---|
      | <exit code, or `failed` or `ok` where none is recorded> | `<command>` |

      </details>
      ```

      The other values each row can take, verbatim:

      | Row | Value |
      |---|---|
      | Tests | ``**fail**: <result>; <result>`` |
      | Tests | `not checked: the role declares no checks` |
      | Tests | `not checked: this Igor's version does not run checks` |
      | Commands the worker ran | `not recorded: this Igor's version keeps no action log` |
      | Files changed | ``**<n>, <k> outside the issue's scope:** `<path>`, `<path>` `` |
      | Files changed | `<n>, not checked against the issue's scope: this Igor's version has no scope check` |
      | Files changed | `<n>, not checked against the issue's scope: the issue names no paths` |
      | Files changed | `<n>, not checked against the issue's scope: a push to an existing pull request is not checked` |
      | Sandbox denials | ``**<n>**: `<command>`, `<command>` `` |
      | Cost | `not reported, <n> turns` |

      Where the run declared that it undid a base change, the Files changed value, whichever it
      is, ends with ``; undoes the base's change to `<path>` ``.

      In a failing Tests row, `<result>` is one per check, in the order the role declares them:
      `` `<check>` passed ``, `` `<check>` exited <code> ``, `` `<check>` timed out after <n>
      minutes `` or `` `<check>` was not run ``. Under the table, each check that did not pass
      gets a `<details><summary>Output of <check></summary>` block holding the end of its output,
      as `loop-verifies-commands` keeps it.

      Show at most 30 commands in the list, then `and <n> more in the action log`. Name at most
      10 paths outside scope, and at most 10 denied commands, then `and <n> more`. Cut each
      command shown to 200 characters. Leave out the commands' `<details>` block when the
      Commands row says `not recorded`.

      Quote every command and path the table shows: a newline becomes a space, `|` becomes
      `\|`, and a value holding a backtick is quoted with a longer run of backticks. Put check
      output in a fence longer than any run of backticks it holds.
      Redact each first, with `keep-action-log`'s redaction; where this change ships before
      `keep-action-log`, build that redaction here, to that change's requirement, for it to
      reuse.
- [ ] 2.2 Write `reviewLabel(record)`, returning `review: skim` only when all four conditions of
      *One review label sorts a pull request for triage, never for merging* hold, and
      `review: read` otherwise. The label names are the deliverable and may not be reworded:

      ```text
      review: skim
      review: read
      ```
- [ ] 2.3 In `prBody`, remove every occurrence of `<!-- igor:evidence -->` from the summary and
      drop every summary line that, trimmed, equals
      `**Checked by Igor, not reported by the worker**`, then append the table after the summary
      and any transcript pointer. Where `signed-publishing` (#153) has shipped, append it after
      the signed description's footer, and run `prose verify-post` on the description alone.
- [ ] 2.4 Add `CodeHost.setReviewLabel(artifact, label)`, which adds one label and removes the
      other, and `CodeHost.replaceEvidence(artifact, table)`, which replaces the body from
      `<!-- igor:evidence -->` to its end. Implement both in `src/github.ts`.
- [ ] 2.5 Call them after `produce()` and after a catch-up's `resolve()`, not after a clean
      server-side `catchUp` that ran no worker. A failure of either call is recorded in
      `reviewLabel` (1.2) and leaves the pull request open as it is.

## 3. Rows from the changes this one depends on

- [ ] 3.1 Fill the Tests row from `loop-verifies-commands`'s record of each check.
- [ ] 3.2 Fill the Commands row from `keep-action-log`'s record of each command, its error flag
      and its exit code where the stream states one.
- [ ] 3.3 Fill the scope part of the Files row from `scope-check`'s list of paths outside scope.

Each of 3.1 to 3.3 is done when its source change ships. Until then, its row shows the
`not checked` or `not recorded` text from 2.1. If this change is archived first, file an issue
for each task still open.

## 4. Tests

- [ ] 4.1 A test for each scenario in the spec delta.
- [ ] 4.2 A test for each verbatim value in 2.1, including that no row reads `pass` when its
      source is absent.
