## 0. Measure first

- [ ] 0.1 Measure whether adding a label that does not exist yet to a pull request (`POST
      /repos/{repo}/issues/{n}/labels`), as an Igor's App, creates the label. If it does not,
      2.4 creates each label first. Record the answer in this change.

## 1. The record

- [ ] 1.1 Keep `assistantTurns` in the execution record on every run, not only where `costUsd`
      is undefined (`src/execute.ts:1496-1498`).
- [ ] 1.2 Add `reviewLabel` to the execution record: the label set, or the error that stopped it
      being set.
- [ ] 1.3 Add `linesChanged` to the execution record: the lines the run's published paths add
      plus the lines they remove.
- [ ] 1.4 Add `skim_max_paths` (default 5) and `skim_max_lines` (default 200) to `ROLE_KEYS` and
      `Role` in `src/role.ts`, merged by override (the most specific level wins), and shown with
      their provenance in `igor role explain`. Document both in `README.md`'s roles section and
      `templates/org.yaml`.

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
      | Files changed | <n>, all inside <scope> |
      | Spec scenarios | <n> changed, each tagged by a test |
      | Sandbox denials | none |
      | Cost | $<0.00>, <n> turns |

      <details><summary>Commands the worker ran</summary>

      | Result | Command |
      |---|---|
      | <exit code, or `failed`> | `<command>` |

      </details>
      ```

      The other values each row can take, verbatim:

      | Row | Value |
      |---|---|
      | Tests | ``**fail**: <result>; <result>; the pull request is a draft because of it`` |
      | Tests | `not checked: the role declares no checks` |
      | Tests | `not checked: this Igor's version does not run checks` |
      | Commands the worker ran | `not recorded: this Igor's version keeps no action log` |
      | Files changed | ``**<n>, <k> outside <scope>:** `<path>`, `<path>` `` |
      | Files changed | `<n>, not checked against scope: this Igor's version has no scope check` |
      | Files changed | `<n>, not checked against scope: the issue names no paths` |
      | Files changed | `<n>, not checked against scope: this pull request's specification adds no change directory` |
      | Files changed | `<n>, not checked against scope: this pull request's specification adds more than one change directory` |
      | Files changed | `<n>, not checked against scope: no push to this pull request has been checked` |
      | Spec scenarios | ``**<k> of <n> changed have no test:** `<capability>: <Scenario>`, `<capability>: <Scenario>` `` |
      | Spec scenarios | `none changed` |
      | Spec scenarios | `not checked: the repository has no openspec/specs/` |
      | Spec scenarios | `not checked: the spec-trace skill is not installed` |
      | Sandbox denials | ``**<n>**: `<command>`, `<command>` `` |
      | Cost | `not reported, <n> turns` |

      `<scope>` is what `scope-check` (#187) compared against: `the issue's scope` for a role
      with one gate, `this pull request's specification change` at gate one, and
      `the issue's and the approved change's scope` at gate two. Where the push was not checked
      and an earlier one was, the scope part is that earlier result's, followed by
      ` (found by an earlier push; this push was not checked)`.

      At gate one, the scope is the one change directory the pull request adds, so with none or
      more than one there is nothing to check against.

      Where the run declared that it undid a base change, the Files changed value, whichever it
      is, ends with ``; undoes the base's change to `<path>` ``, listing each such path as
      `` `<path>`, `<path>` ``.

      In a failing Tests row, `<result>` is one per check, in the order the role declares them:
      `` `<check>` passed ``, `` `<check>` exited <code> ``, `` `<check>` timed out after <n>
      minutes `` or `` `<check>` was not run ``. Under the table, each check that failed or timed
      out gets a ``<details><summary>Output of `<check>`</summary>`` block holding the end of its
      output, as `loop-verifies-commands` keeps it. Before `review-evidence` ships,
      `loop-verifies-commands` writes the Tests value on a line of its own, in this wording, and
      the two must not be reworded apart. Once it ships, the Tests row replaces that line.

      A command's Result is the exit code `keep-action-log` recorded, or `failed` where it
      recorded an error with no code.

      Show at most 30 commands in the list. Where more were run, end the list with the line for
      the action log's tier, the level of detail `keep-action-log` keeps for the store
      (`whole`, `no-output` or `tools-only`):

      | Tier | Line |
      |---|---|
      | `whole` or `no-output` | `and <n> more in the action log` |
      | `tools-only` | `and <n> more, not kept: the action log of a private repository in a public store keeps no commands` |

      Name at most 10 paths outside
      scope, and at most 10 denied commands, then `and <n> more`. Cut each command shown to 200
      characters. Leave out the commands' `<details>` block when the Commands row says
      `not recorded`.

      Quote every command and path the table shows: a newline becomes a space, `|` becomes
      `\|`, and a value holding a backtick is quoted with a longer run of backticks. Put check
      output in a fence longer than any run of backticks it holds. Redact each first, with the
      credential redaction function `keep-action-log` (#188) task 3.1 describes.
- [ ] 2.2 Write `reviewLabel(record, role)`, returning `review: skim` only when all four
      conditions of *One review label sorts a pull request for triage, never for merging* hold,
      with the role's `skim_max_paths` and `skim_max_lines`, and
      `review: read` otherwise. The label names are the deliverable and may not be reworded:

      ```text
      review: skim
      review: read
      ```
- [ ] 2.3 In `prBody`, remove every occurrence of `<!-- igor:evidence -->` from the summary and
      drop every summary line that, trimmed, equals
      `**Checked by Igor, not reported by the worker**`, then append the table after the summary
      and any transcript pointer. For a role whose `skills` lists `prose` (`signed-publishing`,
      #153), append it after the signed description, footer included, and run
      `prose verify-post` on the description alone.
- [ ] 2.4 Add `CodeHost.setReviewLabel(artifact, label)`, which adds one label and removes the
      other, and `CodeHost.replaceEvidence(artifact, table)`, which replaces the body from
      `<!-- igor:evidence -->` to its end. Implement both in `src/github.ts`.
- [ ] 2.5 Call them after `produce()`, which opens every new pull request, gate one's included;
      after a catch-up's `resolve()`; and, for a `two-gate`
      role, after gate two's and each revision's publish (#150 task 7.1), not after a clean
      server-side `catchUp` that ran no worker. A failure of either call is recorded in
      `reviewLabel` (1.2) and leaves the pull request open as it is.

## 3. Rows from the changes this one depends on

- [ ] 3.1 Fill the Tests row from `loop-verifies-commands`'s `checks` results: `passed`,
      `failed` with its exit code, `timed-out` or `not-run`.
- [ ] 3.2 Fill the Commands row from `keep-action-log`'s record of each command: its error flag,
      and its exit code where it recorded one.
- [ ] 3.3 Fill the scope part of the Files row from the result `scope-check` states for this
      push, checked or not.
- [ ] 3.4 Fill the Spec scenarios row by running
      `python3 <skills_dir>/skills/spec-trace/scripts/spec_trace.py report --include-changes`
      and `check` in the pull request's tree, from the pinned skills directory of `pinned-skills`
      (#174). Keep the scenarios of the spec files the run published. Where the tree has no
      `openspec/specs/`, or the script is missing, use the matching `not checked` value from 2.1.

Each of 3.1 to 3.4 is done when its source change ships. Until then, its row shows the
`not checked` or `not recorded` text from 2.1. If this change is archived before its source
changes ship, file an issue for each task still open.

## 4. Tests

- [ ] 4.1 A test for each scenario in the spec delta.
- [ ] 4.2 A test for each verbatim value in 2.1, including that no row reads `pass` when its
      source is absent.
- [ ] 4.3 The Spec scenarios row never changes the label.
