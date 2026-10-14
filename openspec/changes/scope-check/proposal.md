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
3. **A file with the same stem as a named file counts as named, wherever it is.** The stem is the
   part of the file name before the first `.`: `test/execute.test.ts` is in scope for
   `src/execute.ts`. The named file must be named as a file; one in scope only because a named directory holds it
   does not count.
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
6. **A new pull request is checked. Of the pushes onto an existing pull request, only gate two's
   is checked, under the two-gate workflow (below); a resolution, or a revision answering a
   change request, is not.** A resolution brings the base branch into an existing pull request, so it carries the base's
   changes, which no item names. Rejected: checking resolutions too, which would flag every path
   the base brought in. A push that is not checked leaves the last checked result in force, and a
   body written after it says that result came from an earlier push. Rejected: stating "not
   checked" after every resolution, which would discard a result that still describes the pull
   request's own changes.
7. **A capability or change points only at what its own files say.** Naming `task-execution`
   puts `openspec/specs/task-execution/` in scope, plus any file, directory or glob its files name.
   A capability those files mention adds nothing more, and `openspec/changes/archive/` is no
   change. The files are read before the worker runs, so a worker cannot widen its own scope by
   editing them. No spec here names
   a source file today, so a source edit on an issue that names only a capability is flagged.
   Rejected: a table mapping each capability to source paths. Nothing would keep it current, and a
   stale table hides exactly the paths it forgot.

**Decided (Adam, 2026-10-13): the check understands both gates of the two-gate workflow**
(`follow-the-two-gate-workflow`, #150; this part applies only once that change ships):

- **Gate one** expects only the pull request's own change directory under `openspec/changes/`.
  Anything else is flagged, even a path the issue names: gate one publishes a specification, and
  a path outside that specification's directory is not what gate one is for.
- **Gate two's** push onto that pull request is checked against what the issue names plus what
  the approved change names. The approved change is the specification a reviewer approved at
  gate one. It names its directory, the paths its `proposal.md`, `tasks.md`, `design.md` and spec
  deltas name, and files sharing those named files' stems. It is the one push onto an existing pull request that is checked. A resolution
  and a revision answering a change request are not.

**Also decided (Adam, 2026-10-13):**

- The pull request's own change is the one directory the gate-one artifact adds. An artifact
  that adds none, or more than one, is reported as not checked rather than guessed at.
- A push that is not checked keeps the last checked result, marked as from an earlier push
  (decision 6).
- Where the record of earlier results is missing, as when the state branch holding
  `executions.ndjson` has been lost or reset, the result reads "not checked", never "no push has
  been checked".

## Why

Nothing tells a reviewer when an Igor's pull request changes files its issue never pointed at
([#182](https://github.com/adamstallard/igor/issues/182)). A worker steered by planted text, or
one that misread the item, produces a draft that "quietly does the wrong thing", and
`docs/architecture.md:1097-1101` leaves catching that to review. The loop already holds both sides
of the comparison: `Candidate.paths`, read from the item's text by `extractPaths`
(`src/adapter.ts:337`), and the artifact's paths, split by `carried` (`src/execute.ts:1818`).

## What Changes

- The loop compares every path the artifact carries with the paths the item names, and with what
  any OpenSpec capability or change the item names points at, before opening a new pull request.
- Under the two-gate workflow, gate one's new pull request is compared with its own change
  directory instead. Gate two's push onto that pull request is compared with the issue and the
  approved change, before it is published.
- The pull request body states the result after the worker's summary, outside the summary's
  length limit, where `review-evidence` (#190) places it.
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
- **Where the result appears** is `review-evidence` (PR #190): this result fills the scope part of
  its table's Files changed row, in its wording. #190's label needs a checked result with no
  path outside for `review: skim`, so a path outside makes it `review: read`; #190 builds that,
  and this change only supplies the result. This change writes nothing else into the body.
- **Build order: `keep-action-log` (#188), then `review-evidence` (#190), then this change and
  `loop-verifies-commands` (#189) in either order.** Archive order follows the same sequence, so
  the row this change fills exists in code before this change merges, and in the in-force specs
  before it is archived.
- **`signed-publishing`** (PR #153) has a model step write and sign the description. The result
  is assembled by the code, so it sits in #190's evidence section, after the marker
  `<!-- igor:evidence -->` that ends the signed description.
- **`follow-the-two-gate-workflow`** (PR #150) defines the gates this check follows. Without it,
  every role is checked as a one-gate role.

## Impact

- `src/execute.ts`: the comparison, the scope part of the Files changed row, and a field on the
  execution row; and, for a `two-gate` role, reading which gate is running, as #150 determines
  it.
- No change to what is published, to draft status, or to the rule that a person approves every
  Igor pull request.
