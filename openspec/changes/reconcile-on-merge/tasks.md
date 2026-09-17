## 1. The destination workflow

- [ ] 1.1 The template runs `reconcile` instead of `promote`, with no change-detection step:
      a merge whose only content is a deletion must still reconcile
- [ ] 1.2 `permissions` gains `pull-requests: read`, and the run step sets
      `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — reconciliation shells `gh api`, which promotion
      never did, and `permissions` scopes that token without exporting it
- [ ] 1.3 The commit step stages and tests `rejected/` alongside `entries/`; `writeRejection`
      writes there and the current template would leave a rejection record uncommitted
- [ ] 1.4 `templates/promote-on-merge.yml` becomes `templates/reconcile-on-merge.yml`, and
      `init-workflow` writes `.github/workflows/reconcile-on-merge.yml`. Its `name:`, its
      `concurrency` group and the message of the commit it makes follow: a file named for
      promotion that runs reconciliation is a small untruth that outlives whoever knows why
- [ ] 1.5 `init-workflow` states in its output that one job promotes lore on push and any other
      must go, as a property of the design. It MUST NOT test for `promote-on-merge.yml` by
      name: there is one destination, its owner edits it by hand, and a named check is
      migration code for users who do not exist that would keep the dead filename in the tool
      forever
- [ ] 1.6 The `concurrency` group still serializes: two merges close together must not both
      promote and race on the push

## 2. Recognizing a proposal by content

- [ ] 2.1 A pull request is a proposal when it touches an entry file under the store's entry
      path; `p.head.ref.startsWith(BRANCH_PREFIX)` stops deciding it
- [ ] 2.2 The merged path tests the files `proposedFiles` already fetches — no call added
- [ ] 2.3 The open path fetches files only for a pull request already past the quiet window,
      so an untouched backlog of open pull requests costs nothing
- [ ] 2.4 `BRANCH_PREFIX` stays and stays exported: `propose` still names branches with it, and
      it is what an assignee reads in a branch list
- [ ] 2.5 Tests: a hand-made pull request on an arbitrary branch is promoted on merge; a pull
      request touching no entry file is ignored whatever its branch is called; a proposal whose
      every candidate was deleted is reconciled and each candidate recorded as rejected

## 3. Promoting in place

- [ ] 3.1 `igor promote` keeps working and loses its automated caller; its help says it is a
      manual repair for an entry already on the default branch without a pull request
- [ ] 3.2 Nothing in `templates/` invokes it

## 4. What an operator is told

- [x] 4.1 `README.md` sets up a destination with branch protection required rather than
      optional, replacing "neither is worth doing on a single-writer repository" — the two no
      longer answer the same question
- [x] 4.2 It states what becomes of an entry committed directly: it stays provisional, it never
      fires, and `igor promote --by <you>` is how a person repairs it
- [x] 4.3 It says a merge-triggered destination reconciles itself, so the local command is for a
      destination without the workflow and for reading the report
- [x] 4.4 Actions bypass on a protected branch stays in `README.md`; the template header keeps
      its own copy when the template is rewritten
- [ ] 4.5 `docs/` and `igor.config.example.yaml` say nothing about promotion today — confirm at
      implementation that this is still true rather than assuming it

## 5. Left open

- [ ] 5.1 Issue for where a quiet-proposal escalation is read when reconciliation runs in a job
      log — the same question a stopped scope raises in `condition-backoff`, and answered for
      both at once
- [ ] 5.2 On archive, `Already promoted by repository automation` is gone by intent: it is
      rewritten as `Reconciling what is already settled changes nothing`, not dropped
