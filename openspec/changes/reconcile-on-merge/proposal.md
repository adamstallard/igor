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

The template is renamed to what it does: `templates/promote-on-merge.yml` becomes
`templates/reconcile-on-merge.yml`, and `init-workflow` writes
`.github/workflows/reconcile-on-merge.yml` into the destination. A file called
`promote-on-merge.yml` running reconciliation is a small untruth, and it outlives everyone who
knows why it is there.

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

The same trap waits for file-based recognition, one level down: GitHub's file lists carry a
removed entry alongside an added one, so a pull request that only retires an entry would look
like a proposal of it. Both file reads therefore drop `status: removed`. A retirement proposes
nothing, and reconciliation passes over it.

**A proposal is recognized by what it touches.** A pull request that touches an entry file is a
lore proposal, whoever opened it and whatever the branch is called; the `lore/propose/` prefix
stays as a convention for people reading a branch list and stops being load-bearing.

Where the content test runs is the actual choice. Putting it in `listOpenedBy` is rejected: the
list endpoint returns no file list — `RawPr` consumes exactly the fields a page carries — so
filtering there costs a fetch for every pull request, including the open ones nothing will
report on. It runs instead inside the reconcile loop, per branch of it:

| the pull request | what the test costs |
| --- | --- |
| merged | nothing. `proposedFiles` runs on this path already |
| open, inside the quiet window | nothing. The window is tested first and the loop moves on |
| open, past the quiet window | one `proposedFiles`. Few, by construction |
| closed unmerged | one `proposedFiles` |

One rule decides it everywhere: a pull request proposes an entry when the union of its
proposing commit and its base-to-head diff touches one. Both halves are needed. The proposing
commit is the only place a candidate the reviewer deleted still exists, so an all-rejected
proposal is still a proposal; the diff is the only place an entry added by a *later* commit
appears, which is the ordinary shape of a pull request opened by hand — and recognizing those
is the point. Reading only the proposing commit made promotion depend on the order someone
happened to commit in, which was invisible because the branch prefix used to guarantee one
commit. `proposedFiles` therefore folds in the landed diff it was already fetching on the
rejection path, so the merged path pays the same three requests it did whenever anything was
missing locally, and one more when nothing was.

**The aggregate does go up, and the earlier claim that it does not was wrong.** Dropping the
prefix is not only a change to what the filter tests — it changes how many pull requests reach
the filter. `proposedFiles` used to run once per merged *lore proposal*; it now runs once per
merged pull request of any kind, plus once per closed-unmerged one. On a lore-only destination
those are nearly the same set, but the merge-triggered job pays it on every merge and it grows
with history. It is the same shape as the paging in
[#46](https://github.com/adamstallard/igor/issues/46), unbounded for the same reason, and it is
fixed there or not at all: a window that hid old pull requests from the content test would hide
them from reconciliation, which is the blind spot being closed.

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

- **Where a quiet-proposal report is read** — [#50](https://github.com/adamstallard/igor/issues/50).
  Reconciliation running in a workflow writes its escalation list to a job log nobody opens.
  The report is correct and unread; which surface an escalation belongs on is the same question
  `condition-backoff` leaves open for a stopped scope, and it is answered for both at once or
  not usefully at all.
- **Unbounded pull request paging** — [#46](https://github.com/adamstallard/igor/issues/46).
  Every reconcile pages the destination's entire pull request history and filters in memory.
  This change adds no pages. It does add per-pull-request fetches, because more pull requests
  now reach the filter — see the table above; both are bounded by the same fix.
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
- `init-workflow` writes `reconcile-on-merge.yml`, so a destination already holding
  `promote-on-merge.yml` gains a second job on the same trigger until the old one is deleted.
  Nothing in the tool deletes it. There is one such destination and its owner edits it by
  hand; code that migrates absent users would outlast them, and it would keep the retired
  filename alive inside the tool to do it.
- Direct commits to a lore destination stop being an expected path, which is a change to what
  `README.md` currently recommends for a single writer rather than an addition to it.
- **A pull request that touches an entry for an unrelated reason is now a proposal of it.** A
  formatting sweep, a licence header, a renamed term across `entries/` — each promotes every
  provisional entry it touches and writes `reviewed.by` naming whoever merged, who did not read
  the claim. This follows from recognizing a proposal by what it touches, and the workflow being
  replaced had it too: `promote --only <changed entry files>` promoted on any push that touched
  one. So it is not a regression, but it is now the rule rather than an artefact, and it is in
  tension with "an entry committed directly stays provisional". Narrowing it — requiring that a
  pull request *add* an entry file before it counts as proposing it — is a policy call that has
  not been made. A candidate an author added and removed inside their own pull request is
  recorded as rejected for the same reason: nothing distinguishes it from a reviewer's deletion,
  which is the gesture the design assigns that meaning to.
