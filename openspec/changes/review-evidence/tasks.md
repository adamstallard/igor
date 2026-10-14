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
      plus the lines they remove. For a catch-up resolution, count paths and lines only from
      what the Igor's own resolution changed, never from what the base brought in.
- [ ] 1.4 Add `skim_max_paths` (default 5) and `skim_max_lines` (default 200) to `ROLE_KEYS` and
      `Role` in `src/role.ts`, merged by override (the most specific level wins), and shown with
      their provenance in `igor role explain`. Document both in `README.md`'s roles section and
      `templates/org.yaml`.

## 2. The table and the label

- [ ] 2.1 Write `evidenceTable(record)`, a pure function from the run's record to the evidence
      section below, marker included. Where the summary was cut, the transcript pointer comes
      right after the marker, before `---`. The wording is the deliverable: the heading, row names and fixed phrases may not be
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
      | <exit code, `failed`, or `no result`> | `<command>` |

      </details>
      ```

      The other values each row can take, verbatim:

      | Row | Value |
      |---|---|
      | Tests | ``**fail**: <result>; <result>; the pull request is a draft because of it`` |
      | Tests | `not checked: the role declares no checks` |
      | Tests | `not checked: this Igor's version does not run checks` |
      | Files changed | ``**<n>, <k> outside <scope>:** `<path>`, `<path>` `` |
      | Files changed | `<n>, not checked against scope: this Igor's version has no scope check` |
      | Files changed | `<n>, not checked against scope: the issue names no paths` |
      | Files changed | `<n>, not checked against scope: this pull request's specification adds no change directory` |
      | Files changed | `<n>, not checked against scope: this pull request's specification adds more than one change directory` |
      | Files changed | `<n>, not checked against scope: this push was not checked, and no earlier result is recorded` |
      | Spec scenarios | ``**<k> of <n> changed have no test:** `<capability>: <Scenario>`, `<capability>: <Scenario>` `` |
      | Spec scenarios | `none changed` |
      | Spec scenarios | `not checked: a specification pull request carries no tests` |
      | Spec scenarios | `not checked: the repository has no openspec/specs/` |
      | Spec scenarios | `not checked: the spec-trace skill is not installed` |
      | Spec scenarios | `not checked: spec-trace failed` |
      | Spec scenarios | `not checked: spec-trace found no test files` |
      | Sandbox denials | ``**<n>**: `<command>`, `<command>` `` |
      | Cost | `not reported, <n> turns` |

      `<scope>` is what `scope-check` (#187) compared against: `the issue's scope` for a role
      with one gate, `this pull request's specification change` at gate one, and
      `the issue's and the approved change's scope` at gate two. Where the push was not checked
      and an earlier result is recorded, even one that was itself a `not checked against scope`
      value, the scope part is that earlier result's, followed by
      ` (from an earlier push; this push was not checked)`.

      Where the run declared that it undid a base change, the Files changed value, whichever it
      is, ends with ``; undoes the base's change to `<path>` ``, listing each such path as
      `` `<path>`, `<path>` ``.

      In a failing Tests row, `<result>` is one per check, in the order the role declares them:
      `` `<check>` passed ``, `` `<check>` exited <code> ``, `` `<check>` failed with no exit
      code `` (killed by a signal, or not found), `` `<check>` timed out at the <n>-minute limit ``
      (`<n>` is the role's `check_minutes`) or `` `<check>` was not run ``. Under the table, in
      the order the role declares the checks, each check that failed or timed out gets this
      block, holding the end of its output as `loop-verifies-commands` keeps it, in a fence one
      backtick longer than the longest run of backticks in the output, and at least three:

      ````
      <details><summary>Output of `<check>`</summary>

      ```
      <the end of the output>
      ```

      </details>
      ````

      The commands' `<details>` block comes after every output block.

      The commands are the worker's and its subagents' shell (`Bash`) calls. A command's Result
      is the exit code `keep-action-log` recorded, `failed` where it recorded an error with no
      code, or `no result` for a call that never returned.

      Show at most 30 commands in the list. Where more were run, end the list with the line that
      says what the action log actually kept of the rest. The log's tier (the level of detail
      `keep-action-log` keeps for the store: `whole`, `no-output` or `tools-only`, where
      `tools-only` is the tier for a private worked repository in a public store) and the entries
      it drops for size follow from `keep-action-log`'s deterministic cut. Because the cut is
      deterministic, the table computes both before the pull request is opened, before the log
      exists. The log is written afterwards; where that write fails,
      the loop rebuilds the section (2.4) with the line for a failed write:

      | What the log kept | Line |
      |---|---|
      | every one of them (`whole` or `no-output`) | `and <m> more in the action log` |
      | some, the rest dropped for size | `and <m> more, <j> of them in the action log; the rest were dropped from it for size` |
      | none, dropped for size | `and <m> more, dropped from the action log for size` |
      | none (`tools-only`) | `and <m> more, not kept: the action log of a private repository in a public store keeps no commands` |
      | none, the write failed | `and <m> more, not kept: the action log could not be written` |

      `<m>` is how many are left out, and `<j>` how many of those the log kept. Name at most 10
      paths outside scope, and at most 10 denied commands, then `and <m> more`. Cut each
      command shown to 200 characters.

      Quote every command and path the table shows: a newline becomes a space, `|` becomes
      `\|`, and a value holding a backtick is quoted with a longer run of backticks. Redact each
      first, with the
      credential redaction function `keep-action-log` (#188) task 3.1 describes.
- [ ] 2.2 Write `reviewLabel(record, role)`, returning `review: skim` only when all four
      conditions of *One review label sorts a pull request for triage, never for merging* hold,
      with the role's `skim_max_paths` and `skim_max_lines`, and
      `review: read` otherwise. The label names are the deliverable and may not be reworded:

      ```text
      review: skim
      review: read
      ```
- [ ] 2.3 In `prBody`, build the body in the order of *A pull request body holds a capped
      summary, then the loop's evidence*: the opening block (with #150's opening text, gate
      two's note and bug-hunter's open decisions, where #150 applies), the summary or signed
      description, then the section from 2.1. Before that, remove every occurrence of
      `<!-- igor:evidence -->` from the summary and drop every summary line that, trimmed, equals
      `**Checked by Igor, not reported by the worker**`. For a role whose `skills` lists `prose`,
      run `prose verify-post` on the span #153 defines. A signed description that holds
      the marker or the heading is not edited, since that would break its footer: it goes back to
      the prose pass, as #153 returns any text that fails.
- [ ] 2.4 Add `CodeHost.setReviewLabel(artifact, label)`, which adds one label and removes the
      other, and `CodeHost.replaceEvidence(artifact, table)`, which replaces the body from
      `<!-- igor:evidence -->` to its end. Where the body has no marker, as on a pull request
      opened before this change shipped, it appends the section. Implement both in `src/github.ts`.
- [ ] 2.5 Call `setReviewLabel` after `produce()`, which opens every new pull request with its
      section already in the body (2.3), gate one's included. Call both after a catch-up's
      `resolve()`, after a failed action log write (2.1), and, for a `two-gate` role, after gate two's and each revision's publish (#150
      task 7.1), not after a clean
      server-side `catchUp` that ran no worker. A failure of either call is recorded in
      `reviewLabel` (1.2) and leaves the pull request open as it is.

## 3. Rows filled here

- [ ] 3.1 Fill the Commands row from `keep-action-log`'s record of each shell call: its error
      flag, and its exit code where it recorded one.
- [ ] 3.2 Fill the Spec scenarios row by running
      `python3 <skills_dir>/skills/spec-trace/scripts/spec_trace.py report --include-changes`
      in a tree holding exactly the pull request's head, from the pinned skills directory of
      `pinned-skills` (#174), passing no test patterns. Keep the scenarios of the spec files the
      pull request changes against its base. At gate one, where the tree has no
      `openspec/specs/`, where the script is missing, where it exits non-zero, or where it finds
      no test files, use the matching `not checked` value from 2.1.

The Tests row is filled by `loop-verifies-commands` (#189, task 3.2) and the scope part of the
Files changed row by `scope-check` (#187, task 2.1), each when it ships after this change. Until
then those rows show `not checked: this Igor's version does not run checks` and
`<n>, not checked against scope: this Igor's version has no scope check`.

## 4. Tests

- [ ] 4.1 A test for each scenario in the spec delta. A scenario that needs a check result or a
      scope result (the label's skim case, a resolution's scope, a failed check) is tested on
      `evidenceTable` and `reviewLabel` with a record holding that result, so it can pass
      before #187 and #189 ship.
- [ ] 4.2 A test for each verbatim value in 2.1, including that no row reads `pass` when its
      source is absent.
- [ ] 4.3 The Spec scenarios row never changes the label.

## 5. Order

- [ ] 5.1 Build this change after `keep-action-log` (#188) and before `scope-check` (#187) and
      `loop-verifies-commands` (#189). Archive in the same order: after #188, before #187 and
      #189.
