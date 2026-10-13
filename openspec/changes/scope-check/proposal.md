## Decisions for the reviewer

1. **What counts as named is read from text, by fixed rules, with no model call.** The rules are
   in the requirement *A pull request states which changed paths its item does not name*. Rejected:
   asking a model whether each path is relevant. It costs a call per run, gives different answers
   on the same input, and reads the same item text a planted instruction would sit in, so the
   steering this check exists to expose could steer the check too.
2. **The role's lane paths do not count as named.** `lane.paths.under` says which items a role
   takes, not where any one item's change belongs. Rejected: counting them. A role whose lane is
   `src/api/**` would then never be flagged for editing `src/api/auth.ts` on an issue about
   `src/api/users.ts`, which is a common way for a change to land in the wrong file.
3. **A test beside a named file counts as named.** A changed path whose file name has the same
   stem as a named file's, the part before the first `.`, is in scope: `test/execute.test.ts` for
   `src/execute.ts`.
   Rejected: flagging tests. Nearly every pull request adds one, and a flag that is almost always
   raised teaches a reviewer to ignore it.
4. **An item that names nothing is not checked**, and the pull request says so. Rejected: flagging
   every path, which says nothing a reviewer did not already know.
5. **It flags and never blocks.** A path outside the named set does not stop publishing, does not
   make the pull request a draft, and does not change who is asked to review. Rejected: holding
   the pull request as a draft, as the parallel change `loop-verifies-commands` does for a failing
   test. A failing
   test is evidence the change is wrong; an unnamed path is often only evidence that the issue was
   written briefly.
6. **A new pull request is checked; a resolution is not.** A resolution brings the base branch into
   an existing pull request, so it carries the base's changes, which no item names. Rejected: checking resolutions too, which would flag every
   path the base brought in.
7. **A capability or change points only at what its own files say.** Naming `task-execution`
   puts `openspec/specs/task-execution/` in scope, plus any path its files name. No spec here names
   a source file today, so a source edit on an issue that names only a capability is flagged.
   Rejected: a table mapping each capability to source paths. Nothing would keep it current, and a
   stale table hides exactly the paths it forgot.

## Why

Nothing tells a reviewer when an Igor's pull request changes files its issue never pointed at
([#182](https://github.com/adamstallard/igor/issues/182)). A worker steered by planted text, or
one that misread the item, produces a draft that "quietly does the wrong thing", and
`docs/architecture.md:1097-1101` leaves catching that to review. The loop already holds both sides
of the comparison: `Candidate.paths`, read from the item's text by `extractPaths`
(`src/adapter.ts:337`), and the artifact's paths, split by `carried` (`src/execute.ts:1818`).

## What Changes

- Before opening a new pull request, the loop compares every path the artifact carries with the
  paths the item names, and with what any OpenSpec capability or change the item names points at.
- The pull request body states the result in one line the loop writes, after the worker's summary
  and outside its 700-character limit.
- The run's row in `executions.ndjson` records whether scope was checked and which paths were
  outside it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: one added requirement, a pull request states which changed paths its item does
  not name.

## Overlaps

- **Which paths an artifact carries** is governed by open changes `carry-only-what-happened`
  (PR #125) and `carry-what-a-tree-holds` (PR #137). This check compares whatever paths the artifact
  carries; with those two changes, those are exactly the paths the worker changed.
- **Where the line appears** overlaps `review-evidence`, drafted in parallel, which adds an
  evidence block below the worker's summary. Where that block exists, this line is its scope entry;
  the line's wording is this change's.
- **Review labels.** A triage label (`review: skim` or `review: read`) built from this result and
  others is not part of this change.

## Impact

- `src/execute.ts`: the comparison, the line in `prBody`, and a field on the execution row.
- No change to what is published, to draft status, or to the rule that a person approves every
  Igor pull request.
