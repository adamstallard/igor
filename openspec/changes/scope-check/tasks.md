## 0. Order

- [ ] 0.1 Build this change after `review-evidence` (#190) has merged, which itself follows
      `keep-action-log` (#188). Archive in the same order, after #190.

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

- [ ] 2.1 Fill the scope part of #190's Files changed row with this result, in the wording
      #190's task 2.1 gives, including the earlier-push form for a push that is not checked.
      Write nothing else into the body
- [ ] 2.2 The execution row gains `scope: { checked: boolean, basis, reason, change, compared:
      number, outside: string[] }`: `basis` is `issue`, `gate-one` or `gate-two`; `reason` names
      why it was not checked; `change` is gate one's change directory; `compared` is how many
      paths were compared. With these, the table after a later push that is not checked can
      state the same result again

## 3. Tests

- [ ] 3.1 One test per scenario in the spec delta
- [ ] 3.2 A path outside the named set leaves `draft` and `reviewers` exactly as they were
- [ ] 3.3 A resolution and a revision record no `scope` field, and the table built after either
      states the last recorded result as an earlier push's
- [ ] 3.4 Mutation-check 3.1 and 3.2: remove the comparison, confirm each goes red
