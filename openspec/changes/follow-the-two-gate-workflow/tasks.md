Line numbers are as of `main` at `511e519`.

## 1. Measure before building

- [ ] 1.1 Find out whether GitHub accepts an `APPROVE` review on a **draft** pull request, on a
      scratch repository. Record the answer in `design.md` and settle open question 3 with it
- [ ] 1.2 Confirm `latestOpinionatedReviews` returns one review per author, excluding comment-only
      and dismissed reviews, and that `commit { oid }` names the commit each review was submitted
      against
- [ ] 1.3 Confirm that `Answers #n` in a pull request body closes nothing on merge, and still
      produces the `CROSS_REFERENCED_EVENT` that `inFlightFrom` reads. The event was measured on
      2026-09-28 (issue #139 ← PR #140); the merge half has not been measured

## 2. The role setting

- [ ] 2.1 Add `workflow` to `ROLE_KEYS` (`src/role.ts:96`) and to the `Role` interface
      (`src/role.ts:61`), with `WORKFLOWS = ['one-gate', 'two-gate'] as const` beside
      `COMPLETIONS` (`src/role.ts:26`)
- [ ] 2.2 Parse it with override semantics, the way `completion` is parsed (`src/role.ts:513`),
      defaulting to `one-gate` (`src/role.ts:553`), and refuse other values naming the accepted
      ones
- [ ] 2.3 Show it in `role explain` with its provenance (`src/role.ts:654`)
- [ ] 2.4 Tests: opt in, unset, override from base, unknown value refused, explained

## 3. Reading the artifact

- [ ] 3.1 Extend the `pr` fragment (`src/github-adapter.ts:64`) and `RawPr`
      (`src/github-adapter.ts:75`) with `headRefOid` and `latestOpinionatedReviews(first: 20)
      { nodes { author { login } state submittedAt commit { oid } } }`
- [ ] 3.2 Carry the head, the decisive reviews, and each review's commit on `InFlight`
      (`src/adapter.ts:20`), set by `inFlightFrom` (`src/github-adapter.ts:106`)
- [ ] 3.3 Carry the item's `lastEditedAt` on `Candidate`, for gate two's note about an edited item
- [ ] 3.4 Measure the search query's GraphQL cost before and after 3.1 on a real query, and
      record both figures in `design.md` under Risks
- [ ] 3.5 A code-host read, only for an own open artifact on a two-gate role with a decisive
      review, of three things: the paths the pull request changes, which gives the phase; the
      commits since each review, which gives currency (only a two-parent merge of the base
      leaves a review current); and the Igor's own comments since each review, which gives
      "answered"
- [ ] 3.6 Tests against fixtures: current, superseded by a revision, not superseded by a
      merge, answered, dismissed, comment-only, several authors

## 4. Authority

- [ ] 4.1 One permission read per distinct review author per cycle,
      `GET /repos/{repo}/collaborators/{login}/permission`, reading `user.permissions.push` and
      never the `permission` string. This read is shared with `directed-interaction`, which needs
      it and has not built it. Put it where both can call it (`src/github.ts`)
- [ ] 4.2 Authority is the store's `reviewers` (`src/config.ts:189`) or that boolean. Role-level
      `reviewers` (`src/role.ts:532`) do not count unless open question 4 is answered otherwise
- [ ] 4.3 A read that fails is no authority, for that author, for that cycle
- [ ] 4.4 Tests: writer, store reviewer without write, neither, unreadable, admin (whose
      `permission` string is `admin` and not `write`)

## 5. Deciding what to resume

- [ ] 5.1 A pure `actionableReview(candidate, as, authority)` beside `staleOwnArtifact`
      (`src/predicate.ts:39`). It returns `revise`, `go` or nothing, following *An approving
      review from someone with authority is the go signal*: an actionable change request
      outweighs an actionable approval
- [ ] 5.2 `universalSkip` (`src/predicate.ts:64`) admits an own gate-one artifact with an
      actionable review, alongside a stale one
- [ ] 5.3 `planCycle` finds these by scanning every result, next to the catch-up scan
      (`src/loop.ts:549`). They go into a `toResume` list beside `toCatchUp`
      (`src/loop.ts:453`), carrying whether they are to be revised or implemented. A conflicting
      artifact goes to `toCatchUp` first and is resumed on a later cycle
- [ ] 5.4 Put `toResume` through the stop gate and the deferral gate as `toCatchUp` goes
      (`src/loop.ts:621`), then through the lane (open question 9). It holds no watermark, and no
      triage call is made for it
- [ ] 5.5 Record a resume decision at the universal stage, as a catch-up is recorded
      (`src/loop.ts:1040`)
- [ ] 5.6 Tests: approved → resumed; changes requested → resumed; awaiting review → skipped; past
      gate two → skipped; somebody else's → skipped; stopped, held by another party or excluded
      by the lane → not resumed; approval found with the item's `updatedAt` untouched

## 6. Gate one

- [ ] 6.1 For a two-gate role, `workerSystemPrompt` (`src/execute.ts:148`) asks for an OpenSpec
      change under `openspec/changes/` in the trusted channel: proposal, design, spec deltas,
      tasks, and nothing outside that path
- [ ] 6.2 Filter `carried(changed)` (`src/execute.ts:1575`; `carried` at `src/worktree.ts:55`) to
      paths under `openspec/changes/**`. Each dropped path becomes a `Refusal`. Split a rename,
      and name both sides
- [ ] 6.3 Nothing left after the filter is a handoff naming what was dropped, and not
      `nothing-to-do`
- [ ] 6.4 A non-closing reference on `Tracker` beside `linkage` (`src/adapter.ts:131`). GitHub's
      is `Answers #n` (`src/github-adapter.ts:336`). `workerPrompt` (`src/execute.ts:197`) shows
      the worker the non-closing form at gate one
- [ ] 6.5 `prBody` (`src/execute.ts:1092`) at gate one opens with "Specification only: nothing
      outside `openspec/changes/`", then the dropped paths, then the reference, then the
      excerpt. Strip every closing keyword for the item from the excerpt, not only the linkage
      line (`stripLinkage`, `src/execute.ts:189`)
- [ ] 6.6 The commit message and the title at `produce` (`src/execute.ts:1697`) carry no closing
      keyword for the item. The title carries the specification marker (open question 1)
- [ ] 6.7 Gate one releases the claim and skips `complete` (`src/loop.ts:193`,
      `src/execute.ts:1743`)
- [ ] 6.8 Tests for each scenario in *Gate one publishes a specification and nothing else* and
      *A gate-one artifact says it is a specification and closes nothing*, including a `Fixes #n`
      in the transcript and a closing keyword in the item's title

## 7. Committing onto an existing branch

- [ ] 7.1 A `CodeHost` operation for a one-parent commit on an artifact's branch, laid over its
      head (`src/adapter.ts:197`), built on `commitOnBranch` (`src/github.ts:145`)
- [ ] 7.2 A `CodeHost` operation that edits a pull request's title and body
      (`PATCH /repos/{repo}/pulls/{n}`), beside `openPullRequest` (`src/github.ts:193`)
- [ ] 7.3 Re-request review from named people through `requestReviewers` (`src/github.ts:226`)
- [ ] 7.4 Tests, including that neither operation creates a branch

## 8. Revising on a change request

- [ ] 8.1 A `resumeItem` beside `catchUpItem` (`src/loop.ts:311`). It claims through `runItem`
      (`src/loop.ts:119`) with a `resume` option on `ExecuteOptions`, next to `catchUp`
      (`src/execute.ts:1154`). It provisions at the artifact's branch and publishes through 7.1,
      never through `produce`
- [ ] 8.2 The worker is given the review body and inline comments inside the untrusted-data
      delimiters, and gate one's filter applies
- [ ] 8.3 After a commit: reply on the pull request saying what changed, re-request review from
      each author of an answered change request, and release
- [ ] 8.4 With nothing to commit: a reply on the pull request saying why (this also marks the
      review answered), and a handoff on the item
- [ ] 8.5 Call `resumeItem` from `serve` (`src/serve.ts:109`) and from `run`
      (`src/cli.ts:456`, `src/cli.ts:496`) where `catchUpItem` is called
- [ ] 8.6 Tests, including that a revision which changes nothing is not retried on the next
      cycle

## 9. Gate two

- [ ] 9.1 The claim message names the artifact being resumed (`claimMessage`,
      `src/claiming.ts:33`), and keeps the stop instruction unchanged
- [ ] 9.2 The worker is asked to implement the tasks of the change on the branch. The approving
      review's comments are data. No path filter applies, and the role's action space does
- [ ] 9.3 Run the bug-hunter step where #139 has made it configurable. Until #139 lands, this
      task is a named no-op, not a stub
- [ ] 9.4 Nothing outside `openspec/changes/` means no commit, an unchanged title and body, a
      reply on the pull request, and a handoff on the item
- [ ] 9.5 After the commit, update the title (drop the marker) and the body (the code and the
      spec, and `linkage`). Note an edit to the item after the approval (3.3). Request review,
      release, and take `complete`
- [ ] 9.6 The budget gate is consulted exactly as `runItem` does. No seat means no claim, and
      nothing is recorded against the item
- [ ] 9.7 Tests for each scenario in *Gate two implements on the same branch*

## 10. Closed and merged specifications

- [ ] 10.1 A test that a closed gate-one artifact is never resumed, whatever reviews it carries
- [ ] 10.2 If question 7 is accepted: a merged gate-one artifact of the Igor's own, found on the
      timeline `inFlightFrom` already walks, defers the item and asks once, sharing #141's
      mechanism if #141 has landed

## 11. Gate-two change requests (if question 6 is accepted)

- [ ] 11.1 `actionableReview` applies past gate one too, returning `revise-implementation`
- [ ] 11.2 Revise without the filter, then update the title and body
- [ ] 11.3 Tests

## 12. Documentation

- [ ] 12.1 `README.md`: a paragraph after "An Igor does not forget a pull request once it has
      opened one" (`README.md:46`) on the two gates, and `workflow` in the Roles list
      (`README.md:315`)
- [ ] 12.2 `docs/architecture.md` §5.0.4 (`docs/architecture.md:901`): the second exception to
      the in-flight skip, and why the phase is read from the artifact
- [ ] 12.3 `DECISIONS.md`, or wherever the repository records decisions: Adam's five
      decisions of 2026-09-28, and the answers to the open questions once given
