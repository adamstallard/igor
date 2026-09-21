## Why

`reconcile` finds an open lore proposal that has gone quiet past the window and prints it, with
its assignees and the store `reviewers`, to stdout. At a terminal that is the right surface:
somebody typed the command and is reading the output. In the destination's merge-triggered job
(`templates/reconcile-on-merge.yml`) the same sentence goes to the log of a run that
**succeeded**, and nobody opens those. The report is correct and the proposal sits quiet
indefinitely.

The people who need to hear it are the pull request's assignees — the contributing authors the
proposal was derived from — and they are already subscribed to it.

## What Changes

**A quiet proposal is told so on its own pull request.** A comment notifies its assignees on
whatever channel they already use, arrives in the context of the thing it is about, and needs no
new concept: Igor opened that pull request, so writing to it is something it already does. The
stdout report stays — whoever typed the command is present, and the comment is not for them.

**Igor opens nothing.** No issue, no discussion, no item of its own. The template keeps its
present shape but for the one permission commenting needs, which is not `issues: write`, and
nothing has to be taught that an item Igor authored is not work. This is the half of
[#77](https://github.com/adamstallard/igor/pull/77) that survived it: that proposal answered
this together with where a **stopped scope** is reported, on the argument that one surface beats
two, and the unification was rejected — the two share no mechanism, and forcing both onto an
issue in the destination cost this half its better answer. The stopped-scope half is
[#80](https://github.com/adamstallard/igor/issues/80) and is not this change.

**One nudge per quiet spell, and the comment is the record.** The merge-triggered job runs on
every merge and a person's local invocation sweeps the same pull requests; both conclude the
same thing every time, and a comment per run is exactly how a surface gets muted. Reconciliation
reads the pull request's own comments back rather than keeping a note of what it said — the
shape it already uses for everything else — and says nothing where its own nudge is the newest
thing there.

**The subject is the quiet spell, not the pull request.** A nudge is itself activity: posting it
moves `updatedAt`, so a rule that asked only "has there been activity since?" would nudge again
every window forever, which is the muting defect on a slower clock. `deferred.ts` documents the
same self-poisoning from the loop's side — the Igor's own handoff comment is what lifts a
handed-back item above the watermark — and answers it the same way, by refusing to count its own
voice. So a second nudge follows only where somebody *else* acted after the last one and the
proposal then went quiet again. A proposal nobody ever answers is nudged once and never again;
it remains in the stdout report and remains an open pull request, which are the standing records
of it.

**The nudge names all three endings and marks the irreversible one.** Merging approves
everything still present; deleting a candidate's file and then merging **rejects those
candidates permanently and they are never proposed again**; closing without merging defers, and
those candidates stay eligible. A nudge that asks only for "a decision" arrives exactly when
somebody has stopped paying attention, which is when the nearest gesture is the one that gets
made — and one of the three cannot be undone. `lore-review` already requires the pull request
body to state that contract; the nudge repeats it because it is read months later by somebody
who did not read the body.

**A nudge that cannot be posted fails the run.** `templates/reconcile-on-merge.yml` grants
`pull-requests: read`, so the first deployment of this cannot comment. Reporting that to the log
of a green run would be this change's own bug, committed by this change — so reconciliation
finishes the promotions and rejections it owes, names what it needs, and exits non-zero.

Explicitly out of scope:

- **Where a stopped scope is reported** — [#80](https://github.com/adamstallard/igor/issues/80).
  It has no pull request to comment on, shares no mechanism with this, and is why #77 was
  closed.
- **Igor opening items of its own**, for this or anything else. That question is #80's to
  answer if it must.
- **A new configuration key.** The window stays `--stale-after`, defaulting to 7 days.
  `CONFIG_KEYS` is a closed list and nothing here has been measured.
- **Reaching a store reviewer who is not subscribed to the pull request.** The nudge names them;
  it cannot notify them without an @mention, which `lore-review` forbids for good reason.
- **Re-nudging a proposal nobody ever answers.** Deliberate, and the honest cost of not muting.

## Capabilities

### Modified Capabilities

- `lore-review`: a quiet proposal is told so on its own pull request, at most once per quiet
  spell, in a comment that distinguishes approving, rejecting permanently and deferring — and a
  nudge that cannot be posted fails the run rather than the log.

## Impact

- A proposal quiet past the window reaches its assignees without anybody opening a job log.
- `templates/reconcile-on-merge.yml` needs `pull-requests: write` in place of
  `pull-requests: read`; until it has it, every merge's reconcile run goes red, which is loud
  and correct.
- Each quiet proposal costs one more request per run — reading its comments back — on top of the
  one or two `isProposal` already costs it. Only proposals already past the window pay it;
  `src/github.ts` has no comment primitive today and gains two.
- Implementation lands in `src/reconcile.ts`, which [#71](https://github.com/adamstallard/igor/pull/71)
  and [#76](https://github.com/adamstallard/igor/pull/76) both edit.
