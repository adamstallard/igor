## Decisions for the reviewer

1. **What counts as named is read from text, by fixed rules, with no model call.** The rules are
   in the requirements *What an item names*, *Naming a capability or change names what its files
   name* and *A file sharing a named file's stem is named*. Rejected: asking a model whether each
   path is relevant. It costs a call per run, gives different answers on the same input, and reads
   the item text where an injected instruction would sit, so text written to steer the worker, which
   this check exists to expose, could steer the check too.
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
   request's own changes, and which #190 would turn into `review: read` on every resolved pull
   request. The result carried forward may itself say "not checked", as when the issue named
   nothing.
7. **A capability or change points only at what its own files say.** Naming `task-execution`
   puts `openspec/specs/task-execution/` in scope, plus any file, directory or glob its files name.
   A capability those files mention adds nothing more, and `openspec/changes/archive/` is no
   change. The files read are a capability's `spec.md` and `decisions.md`, and a change's
   `proposal.md`, `tasks.md`, `design.md` and spec deltas, the same set at gate two. They are read
   before the worker runs, so a worker cannot widen its own scope by editing them. Specs rarely
   name a source file, but a decision record's `Paths:` lines do, so naming a capability brings
   in the source its record governs. spec-check fails on a `Paths:` entry the tree lacks, which
   keeps those lines current. Rejected: a separate table mapping each capability to source paths. Nothing would keep it
   current, and a stale table hides exactly the paths it forgot.

**Decided: the check understands both gates of the two-gate workflow**
(`follow-the-two-gate-workflow`, #150; this part applies only once that change ships):

- **Gate one** expects only the pull request's own change directory under `openspec/changes/`.
  Anything else is flagged, even a path the issue names: gate one publishes a specification, and
  a path outside that specification's directory is not what gate one is for. *Rejected:*
  checking gate one against what the issue names, which flags every spec pull request, since
  no issue can name a change directory before it exists.
- **Gate two's** push onto that pull request is checked against what the issue names plus what
  the approved change names. The approved change is the specification a reviewer approved at
  gate one. It names its directory, the paths its files name (decision 7), and files sharing
  those named files' stems. Decision 6 says which other pushes are checked. *Rejected:* leaving
  gate two unchecked, which leaves the implementation, the push most likely to stray, with no
  scope check at all.

**Also decided:**

- The pull request's own change is the one directory the gate-one artifact adds. An artifact
  that adds none, or more than one, is reported as not checked rather than guessed at.
  *Rejected:* taking every change directory the artifact touches as its own, which would never
  flag a spec pull request that edits someone else's change.
- Where the record of earlier results is missing, as when the state branch holding
  `executions.ndjson` has been lost or reset, the result reads "not checked", never "no push has
  been checked". *Rejected:* "no push has been checked", which the loop cannot know once the
  record is gone.

## Why

Nothing tells a reviewer when an Igor's pull request changes files its issue never pointed at
([#182](https://github.com/adamstallard/igor/issues/182)). A worker steered by planted text, or
one that misread the item, produces a draft that "quietly does the wrong thing", and
`docs/architecture.md:1097-1101` leaves catching that to review. The loop already holds both sides
of the comparison: `Candidate.paths`, read from the item's text by `extractPaths`
(`src/adapter.ts:337`), and the artifact's paths, which `carried` splits into written and removed
(`src/worktree.ts:58`, called at `src/execute.ts:1863`).

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

- `task-execution`: twelve added requirements:
  - the comparison itself, *A pull request states which changed paths its item does not name*;
  - three for what counts as named: by the item's text, through a named capability or change, and
    by stem;
  - where the result is stated, and that it never blocks publishing;
  - two for pushes onto a pull request: which are checked, and what #190's evidence table states
    when no result is recorded;
  - three for the two-gate workflow: gate one, gate two, and when gate two is not checked;
  - that the files read for scope follow no link, as #175 requires of files the worker wrote.

## Overlaps

- **Which paths an artifact carries** is governed by open changes `carry-only-what-happened`
  (PR #125) and `carry-what-a-tree-holds` (PR #137). This check compares whatever paths the artifact
  carries. A new pull request and gate two's push carry only what the worker changed, since only
  a resolution merges the base in. A resolution can also carry what the base changed, such as a submodule the base
  moved (#137's *A submodule carried through a resolution*), and this change never checks a
  resolution.
- **Where the result appears** is `review-evidence` (PR #190): this result fills the scope part of
  its table's Files changed row, in its wording. #190's label needs a checked result with no
  path outside for `review: skim`, so a path outside makes it `review: read`; #190 builds that,
  and this change only supplies the result. This change writes nothing else into the body.
- **Build after `review-evidence` (#190), which follows `keep-action-log` (#188); archive after
  #190.** The row this change fills then exists in code before this change merges, and in the
  in-force specs before it is archived. Issue #204 holds the whole archive order, and has not yet
  placed this change.
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
