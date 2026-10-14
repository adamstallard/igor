## 0. Order

- [ ] 0.1 Archive this change only after `review-evidence` (#190) is archived, so the
      requirement and row wording it points at are in force first.

## 1. The comparison

- [ ] 1.1 Read the named set from the item's title and body: files as `extractPaths` reads them,
      plus directories written with a trailing `/` and globs. Leave `extractPaths` itself
      unchanged, because lane routing uses it and a wider reading would change which items a role
      takes
- [ ] 1.2 Drop a directory or glob whose first segment is not literal
- [ ] 1.3 For each capability or open change the item names by directory name, add that
      directory and the paths its files name by the reading in 1.1, read from the working tree
      before the worker runs. `archive` under `openspec/changes/` is not a change
- [ ] 1.4 Count a carried path as named when its file name has the same non-empty stem as a file
      named as a file in 1.1 or 1.3
- [ ] 1.5 Compare every path `carried` returns, written and removed, on the new-pull-request path
      and on gate two's push. A resolution and a revision are not checked
- [ ] 1.6 For a `two-gate` role (after `follow-the-two-gate-workflow`, #150, ships): at gate one,
      the named set is the one change directory the artifact adds; with none or more than one,
      the result is not checked. At gate two, add to the item's named set each change directory
      the pull request's diff held before the worker ran, the paths its `proposal.md`,
      `tasks.md`, `design.md` and `specs/**` name by the reading in 1.1, and their stems as in 1.4
- [ ] 1.7 On a push that is not checked, read the pull request's latest scope result from
      `executions.ndjson`, for the body only; record no new result

## 2. Where the result goes

- [ ] 2.1 Before `review-evidence` (#190) ships, `prBody` appends one line after the worker's
      summary, outside `PR_BODY_LIMIT`, placed as #190's drafted requirement *A pull request
      body holds a capped summary, then the loop's evidence* describes. It removes from the
      summary any line that starts with the line's prefix. The prefix, which this change owns,
      is `**Files changed** (checked by Igor, not reported by the worker): `: `Files changed` echoes #190's row label, and the rest echoes
      its table heading. After the prefix comes the Files changed value exactly as #190's task
      2.1 words it. The lines below are that wording, and neither change may reword it apart
      from the other. `<n>` is how many paths the run published, and `<k>` how many of them are
      outside. Paths are listed, capped and quoted as #190's task 2.1 lists, caps and quotes
      them:

      ```
      **Files changed** (checked by Igor, not reported by the worker): <n>, all inside the issue's scope
      **Files changed** (checked by Igor, not reported by the worker): **<n>, <k> outside the issue's scope:** `<path>`, `<path>`
      **Files changed** (checked by Igor, not reported by the worker): <n>, not checked against scope: the issue names no paths
      **Files changed** (checked by Igor, not reported by the worker): <n>, all inside this pull request's specification change
      **Files changed** (checked by Igor, not reported by the worker): **<n>, <k> outside this pull request's specification change:** `<path>`, `<path>`
      **Files changed** (checked by Igor, not reported by the worker): <n>, not checked against scope: this pull request's specification adds no change directory
      **Files changed** (checked by Igor, not reported by the worker): <n>, not checked against scope: this pull request's specification adds more than one change directory
      **Files changed** (checked by Igor, not reported by the worker): <n>, all inside the issue's and the approved change's scope
      **Files changed** (checked by Igor, not reported by the worker): **<n>, <k> outside the issue's and the approved change's scope:** `<path>`, `<path>`
      **Files changed** (checked by Igor, not reported by the worker): <n>, not checked against scope: no push to this pull request has been checked
      ```

      On a push that is not checked, `<n>` is still this run's count. Everything after `<n>, `
      is the last recorded result's, followed by
      ` (found by an earlier push; this push was not checked)`. Where the run is a catch-up
      resolution that declared it undid a change the base branch made (as the in-force
      requirement *A base change is undone only where the resolution says so* requires it to),
      the line ends as #190's row does, with
      ``; undoes the base's change to `<path>` ``, listing each such path as #190 does.

- [ ] 2.2 Where `review-evidence` has shipped, fill the scope part of its Files changed row, in
      that change's wording, instead of writing the line in 2.1
- [ ] 2.3 The execution row gains `scope: { checked: boolean, basis, reason, change, compared:
      number, outside: string[] }`: `basis` is `issue`, `gate-one` or `gate-two`; `reason` names
      why it was not checked; `change` is gate one's change directory; `compared` is how many
      paths were compared. With these, a later push that is not checked can write the same line
      again

## 3. Tests

- [ ] 3.1 One test per scenario in the spec delta
- [ ] 3.2 A path outside the named set leaves `draft` and `reviewers` exactly as they were
- [ ] 3.3 A resolution and a revision record no `scope` field, and a body written after either
      states the last recorded result as an earlier push's
- [ ] 3.4 Mutation-check 3.1 and 3.2: remove the comparison, confirm each goes red
