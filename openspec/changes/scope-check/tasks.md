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
      only. The resolution path is not checked

## 2. Where the result goes

- [ ] 2.1 `prBody` appends one line after the worker's summary, outside `PR_BODY_LIMIT`. The three
      lines, verbatim; the list after the colon may be cut to ten paths followed by
      `and N more`, and nothing else may be reworded. A path holding a backtick is quoted with a
      longer run of backticks, so no path can end its code span:

      ```
      Scope: every changed path is one the issue names.
      Scope: N of M changed paths are outside what the issue names: `a`, `b`.
      Scope: not checked, because the issue names no paths.
      ```

- [ ] 2.2 Where `review-evidence` has landed its evidence table, fill the scope part of its Files
      changed row, in that change's wording, instead of writing the line in 2.1
- [ ] 2.3 The execution row gains `scope: { checked: boolean, outside: string[] }`

## 3. Tests

- [ ] 3.1 One test per scenario in the spec delta
- [ ] 3.2 A path outside the named set leaves `draft` and `reviewers` exactly as they were
- [ ] 3.3 A resolution carries no scope line and no `scope` field
- [ ] 3.4 Mutation-check 3.1 and 3.2: remove the comparison, confirm each goes red
