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
      the pull request's diff held before the worker ran, the paths its `tasks.md`, `design.md` and
      `specs/**` name by the reading in 1.1, and their stems as in 1.4
- [ ] 1.7 On a push that is not checked, read the pull request's latest scope result from
      `executions.ndjson`, for the body only; record no new result

## 2. Where the result goes

- [ ] 2.1 Before `review-evidence` (#190) ships, `prBody` appends one line after the worker's
      summary, outside `PR_BODY_LIMIT`, in the order #190 sets for lines written before its table
      exists. The lines, verbatim; the list after the colon may be cut to ten paths followed by
      `and K more`, where K is how many are left out, and nothing else may be reworded. A path holding a backtick is quoted with a
      longer run of backticks, so no path can end its code span:

      ```
      Scope: every changed path is one the issue names.
      Scope: N of M changed paths are outside what the issue names: `a`, `b`.
      Scope: not checked, because the issue names no paths.
      Scope: every changed path is in this specification's change, `openspec/changes/<name>/`.
      Scope: N of M changed paths are outside this specification's change, `openspec/changes/<name>/`: `a`, `b`.
      Scope: not checked, because this specification adds no change directory.
      Scope: not checked, because this specification adds more than one change directory.
      Scope: every path the implementation changed is one the issue or the approved change names.
      Scope: N of M paths the implementation changed are outside what the issue and the approved change name: `a`, `b`.
      Scope: not checked, because no push to this pull request has been checked.
      ```

      On a push that is not checked, the last recorded result's line is repeated with `Scope:`
      replaced by:

      ```
      Scope, as an earlier push found (this push was not checked):
      ```

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
