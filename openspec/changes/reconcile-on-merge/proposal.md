## Why

A lore destination promotes entries two ways. `templates/promote-on-merge.yml` reacts to a push
to the default branch, diffs it `--diff-filter=AM` over `entries/*.md`, and runs `igor promote`
on whatever that names. `igor reconcile` instead sweeps proposal pull requests through the API:
it promotes what merged, writes a rejection record for what the reviewer deleted, and reports
what has gone quiet past the window. Reconciliation's job is a superset — except that it cannot
see an entry that never went through one of its own proposals.

Two mechanisms, and each is blind where the other is not.

**The workflow cannot see a rejection at all.** Reviewing is deleting a file, and the deletion
happens on the proposal branch. Simulated with git: a candidate added by the proposing commit
and deleted by the reviewer appears in neither `AM` nor `AMD` against the push's previous head,
because relative to that head it never existed. Worse, a proposal where the reviewer deletes
*every* candidate lands no entry file whatsoever, `files` comes out empty, and each of the
workflow's steps is skipped by its own `if: steps.changed.outputs.files != ''` guard. The job
does not merely miss the rejection — on the merge that is purely a rejection, the job does not
run. Every such candidate stays eligible and is proposed again next time.

**Reconciliation cannot see a proposal it did not make.** `listOpenedBy` (`src/github.ts:165`)
filters on `p.head.ref.startsWith('lore/propose/')`, so a pull request somebody opened by hand
adding an entry is invisible to it, merged or not — not promoted, not reported when quiet.

Keeping both means maintaining both blind spots, and the entry an operator loses to one of them
is silent: only active entries fire.

## What Changes

**One job, triggered on merge, running `reconcile`.** The destination keeps a single workflow
and it invokes the same reconciliation a person invokes, so there is one promotion path with
one set of behaviours to reason about. Recording rejections and reporting quiet proposals come
along with it, which the merge-triggered path never had.

The change-detection step is deleted rather than rewired. Reconciliation is a sweep with no
`--only`, and the all-rejected merge above is exactly the case a file-diff gate skips.

The template is renamed to what it does. A file called `promote-on-merge.yml` running
reconciliation is a small untruth, and it outlives everyone who knows why it is there.

**Widening `--diff-filter` to include `D` is the obvious fix and it is rejected.** Verified in a
scratch repository, with `entries/keep.md` on the default branch:

| event | `AM` | `AMD` |
| --- | --- | --- |
| merge of a proposal adding `cand1`, reviewer deleted `cand2` on the branch | `cand1` | `cand1` |
| merge of a proposal whose every candidate the reviewer deleted | *(empty)* | *(empty)* |
| an entry retired by a commit on the default branch | *(empty)* | `old.md` |

A deletion on the proposal branch is not in the push's diff under any filter, so `D` catches no
rejection. The deletion that `D` does surface is a different event — an entry retired on the
default branch — which the widened filter would hand to a rejection path as though a reviewer
had refused it. The widening buys nothing and misreads retirement as rejection, which is worse
than the gap it was reaching for. Anyone reaching for `D` again should reach for this table.

**A proposal is recognized by what it touches.** A pull request that touches an entry file is a
lore proposal, whoever opened it and whatever the branch is called; the `lore/propose/` prefix
stays as a convention for people reading a branch list and stops being load-bearing.

Where the content test runs is the actual choice. Putting it in `listOpenedBy` is rejected: the
list endpoint returns no file list — `RawPr` consumes exactly the fields a page carries — so
filtering there costs a fetch per pull request the repository has ever had. `proposedFiles`
already runs for every merged pull request in the reconcile loop, so on the merged path the
test is free; only an open pull request past the quiet window needs a fetch it does not already
make, and there are few of those by construction. The unbounded paging underneath all of this
is [#46](https://github.com/adamstallard/igor/issues/46) and is not touched here.

**The last blind spot closes by policy, not by mechanism.** An entry committed straight to the
default branch has no pull request to sweep, and no amount of watching commits fixes that
without reintroducing the second promoter. Lore changes arrive by pull request: branch
protection is recommended to every destination including a single-writer one, and an entry
committed directly stays `provisional` and never fires. `README.md` currently tells a
single-writer destination that protection and the workflow are "both answering the same
question" and neither is worth enabling — they no longer answer the same question. Protection
is what makes the promotion path total; the workflow is what promotes.

**Promoting in place survives as a manual repair.** It is the one promotion an event never
triggers, which is why "no event promotes except through reconciliation" is the rule rather
than "reconciliation is the only way an entry becomes active". `igor promote` loses its caller
but not its use: it is how a person fixes an entry already on the default branch without a pull request,
and it records them as the approver, which is true. Nothing wires it to an event again.

Explicitly out of scope:

- **Where a quiet-proposal report is read.** Reconciliation running in a workflow writes its
  escalation list to a job log nobody opens. The report is correct and unread; which surface an
  escalation belongs on is the same question `condition-backoff` leaves open for a stopped
  scope, and it is answered for both at once or not usefully at all.
- **Unbounded pull request paging** — [#46](https://github.com/adamstallard/igor/issues/46).
  Every reconcile pages the destination's entire pull request history and filters in memory.
  This change adds no pages; it changes what the filter tests.
- **Enforcing the pull request requirement from inside Igor.** Branch protection is the
  enforcement, and it lives on the destination where the writes happen. A check in the tool
  would sit downstream of the commit it was meant to prevent.

## Capabilities

### Modified Capabilities

- `lore-review`: reconciliation is the only promotion path and a merge-triggered job is one of
  its invocations; a pull request is a proposal because it proposes an entry, not because of
  its branch name; lore reaches the default branch by pull request, and an entry committed
  directly stays provisional.

## Impact

- A rejection made on a merge-triggered destination is recorded for the first time. Candidates
  reviewers have already deleted are still eligible today and are re-proposed on every mining
  run.
- A hand-made pull request adding an entry becomes reviewable lore rather than an entry that
  merges and then sits provisional forever.
- The destination workflow now needs a token and `pull-requests: read`, where promotion needed
  neither, and it commits `rejected/` as well as `entries/`.
- `init-workflow` writes a new path, so a destination already holding `promote-on-merge.yml`
  gains a second job on the same trigger until the old one is deleted. Nothing in the tool
  deletes it. There is one such destination and its owner edits it by hand; code that migrates
  absent users would outlast them, and it would keep the retired filename alive inside the tool
  to do it.
- Direct commits to a lore destination stop being an expected path, which is a change to what
  `README.md` currently recommends for a single writer rather than an addition to it.
