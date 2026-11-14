Code is cited by file and name; line numbers drift.

## 1. Measure before building

- [x] 1.1 Find out whether GitHub accepts an `APPROVE` review on a **draft** pull request, on a
      scratch repository. Record the answer in `design.md` and settle question 3 with it.
      Measured 2026-10-04: accepted, so gate one keeps the role's draft choice
- [ ] 1.2 Confirm `latestOpinionatedReviews` returns one review per author, excluding comment-only
      and dismissed reviews, and that `commit { oid }` names the commit each review was submitted
      against
- [ ] 1.3 Confirm that `Answers #n` in a pull request body closes nothing on merge, and still
      produces the `CROSS_REFERENCED_EVENT` that `inFlightFrom` reads. The event was measured on
      2026-09-28 (issue #139 ← PR #140); the merge half has not been measured

## 2. The role setting

- [ ] 2.1 Add `workflow` to `ROLE_KEYS` and to the `Role` interface in `src/role.ts`, with
      `WORKFLOWS = ['one-gate', 'two-gate'] as const`
- [ ] 2.2 Parse it with override semantics, the way `seat` is parsed in `src/role.ts`,
      defaulting to `one-gate`, and refuse other values naming the accepted ones
- [ ] 2.3 Show it in `role explain` with its provenance (`src/role.ts`)
- [ ] 2.4 Tests: opt in, unset, override from base, unknown value refused, explained

## 3. Reading the artifact

- [ ] 3.1 Extend the `pr` fragment (`src/github-adapter.ts`) and `RawPr`
      (`src/github-adapter.ts`) with `headRefOid` and `latestOpinionatedReviews(first: 20)
      { nodes { author { login __typename } state submittedAt commit { oid } } }`
- [ ] 3.2 Carry the head, the decisive reviews, and each review's commit on `InFlight`
      (`src/adapter.ts`), set by `inFlightFrom` (`src/github-adapter.ts`)
- [ ] 3.3 Carry on `Candidate` the time of the item's latest title, body or label change, read from
      its timeline, for gate two's note about an edited item
- [ ] 3.4 Measure the search query's GraphQL cost before and after 3.1 on a real query, and
      record both figures in `design.md` under Risks
- [ ] 3.5 A code-host read, only for an own open artifact on a two-gate role with a decisive
      review, of three things: the paths the pull request changes, which gives the phase; the
      commits since each review, which tell whether each review is still current (only a
      two-parent merge of the base with no resolved conflict leaves it current); and the Igor's own hand-back replies, each
      naming the review ids it answers in a fixed, machine-readable line that the loop writes,
      which gives "answered". No other post counts, and the loop strips any such line from the
      worker's text
- [ ] 3.6 Tests against fixtures: current, superseded by a revision, not superseded by a
      merge, answered, not answered by an unrelated Igor post or someone else's comment,
      dismissed, comment-only, several authors
- [ ] 3.7 Where #151 has stopped counting a bare mention as work in flight, `inFlightFrom` still
      counts an open pull request authored by the Igor's App on the branch `branchFor` names for
      the item, without a Development link (design, *Decided: how a gate-one pull request stays
      in flight*)

## 4. Authority

- [ ] 4.0 A review whose author's `__typename` is `Bot` has no authority, and is excluded
      before any permission read. It covers every Igor, since every Igor is a GitHub App
- [ ] 4.1 One permission read per distinct review author per cycle,
      `GET /repos/{repo}/collaborators/{login}/permission`, reading `user.permissions.push` and
      never the `permission` string. This read is shared with `directed-interaction`, which needs
      it and has not built it. Put it where both can call it (`src/github.ts`)
- [ ] 4.2 Authority is the store's `reviewers` (`src/config.ts`) or that boolean. Role-level
      `reviewers` (`src/role.ts`) do not count (settled question 4)
- [ ] 4.3 A read that fails is no authority, for that author, for that cycle
- [ ] 4.4 Tests: writer, store reviewer without write, neither, unreadable, admin (whose
      `permission` string is `admin` and not `write`), and a `Bot` author with write access

## 5. Deciding what to resume

- [ ] 5.1 A pure `actionableReview(candidate, as, authority)`, where `as` is the Igor's own App
      login, beside `staleOwnArtifact`
      (`src/predicate.ts`). It returns `revise`, `go` or nothing, following *An approving
      review from someone with authority is the go signal* and *A review stays current through
      merges of the base and is answered only by name*: an actionable change request outweighs an
      actionable approval
- [ ] 5.2 `universalSkip` (`src/predicate.ts`) admits an own gate-one artifact with an
      actionable review, alongside a stale one
- [ ] 5.3 `planCycle` finds these by scanning every result, next to the catch-up scan
      (`src/loop.ts`). They go into a `toResume` list beside `toCatchUp`
      (`src/loop.ts`), carrying whether they are to be revised or implemented. A conflicting
      artifact goes to `toCatchUp` first and is resumed on a later cycle
- [ ] 5.4 Put `toResume` through the stop gate and the deferral gate as `toCatchUp` goes
      (`src/loop.ts`), then through the lane (settled question 9). It holds no watermark, and no
      triage call is made for it
- [ ] 5.5 Record a resume decision at the universal stage, as a catch-up is recorded
      (`src/loop.ts`)
- [ ] 5.6 Tests: approved → resumed; approved while a draft → resumed; changes requested →
      resumed; awaiting review → skipped; past gate two → skipped; somebody else's → skipped;
      stopped, held by another party or excluded by the lane → not resumed; approval found with
      the item's `updatedAt` untouched

## 6. Gate one

- [ ] 6.1 For a two-gate role, `workerSystemPrompt` (`src/execute.ts`) asks for an OpenSpec
      change under `openspec/changes/` in the trusted channel: proposal, design, spec deltas,
      tasks, and nothing outside that path
- [ ] 6.2 Filter the result of `carried(changed)`, which `src/execute.ts` calls and
      `src/worktree.ts` defines, to
      paths under `openspec/changes/**`. Each dropped path becomes a `Refusal`. Split a rename,
      and name both sides
- [ ] 6.3 Nothing left after the filter is a handoff naming what was dropped, and not
      `nothing-to-do`
- [ ] 6.4 A non-closing reference on `Tracker` beside `linkage` (`src/adapter.ts`). GitHub's
      is `Answers #n` (`src/github-adapter.ts`). `workerPrompt` (`src/execute.ts`) shows
      the worker the non-closing form at gate one
- [ ] 6.5 `prBody` (`src/execute.ts`) at gate one opens with "Specification only: nothing
      outside `openspec/changes/`", then the dropped paths, each as a code span with backticks
      escaped, then the reference, then the
      excerpt. Strip every closing keyword for the item from the excerpt, not only the linkage
      line (`stripLinkage`, `src/execute.ts`)
- [ ] 6.6 The commit message and the title at `produce` (`src/execute.ts`) carry no closing
      keyword for the item. The title carries the specification marker (settled question 1)
- [ ] 6.7 Gate one releases the claim as any finished run does (`complete` in
      `src/execute.ts`), leaving the item open
- [ ] 6.8 Tests for each scenario in *Gate one publishes a specification and nothing else*, *A
      gate one with nothing to publish hands off* and *A gate-one artifact says it is a
      specification and closes nothing*, including a `Fixes #n`
      in the transcript and a closing keyword in the item's title

## 7. Committing onto an existing branch

- [ ] 7.1 A `CodeHost` operation for a one-parent commit on an artifact's branch, laid over its
      head (`src/adapter.ts`), built on `commitOnBranch` (`src/github.ts`)
- [ ] 7.2 A `CodeHost` operation that edits a pull request's title and body
      (`PATCH /repos/{repo}/pulls/{n}`), beside `openPullRequest` (`src/github.ts`)
- [ ] 7.3 Re-request review from named people through `requestReviewers` (`src/github.ts`)
- [ ] 7.4 Tests, including that neither operation creates a branch

## 8. Revising on a change request

- [ ] 8.1 A `resumeItem` beside `catchUpItem` (`src/loop.ts`). It claims through `runItem`
      (`src/loop.ts`) with a `resume` option on `ExecuteOptions`, next to `catchUp`
      (`src/execute.ts`). It provisions at the artifact's branch and publishes through 7.1,
      never through `produce`
- [ ] 8.2 The worker is given the review body and inline comments inside the untrusted-data
      delimiters, and gate one's filter applies
- [ ] 8.3 After a commit: reply on the pull request naming the change requests answered and
      saying what changed, re-request review from each author of an answered change request,
      and release
- [ ] 8.4 With nothing to commit: a reply on the pull request naming the change requests it
      answers, and only those, saying why (the reply is what marks them answered), and a release
      that does not defer the item
- [ ] 8.5 Call `resumeItem` wherever `catchUpItem` is called: once in `serve` (`src/serve.ts`),
      and at both of `run`'s call sites in `src/cli.ts`
- [ ] 8.6 Tests, including that a revision which changes nothing is not retried on the next
      cycle

## 9. Gate two

- [ ] 9.1 The claim message names the artifact being resumed (`claimMessage`,
      `src/claiming.ts`), and keeps the stop instruction unchanged
- [ ] 9.2 The worker is asked to implement the tasks of the change on the branch. The approving
      review's comments are data. No path filter applies, and the role's action space does
- [ ] 9.3 Run `signed-publishing`'s (#153) bug-hunter step where the role's `skills` list names
      `bug-hunter`. Until #153 is built, this task is a function that does nothing and says so in its name,
      so gate two's order of steps is in place
- [ ] 9.4 Nothing outside `openspec/changes/` means no commit, an unchanged title and body, a
      reply on the pull request naming the approval it answers, and a release that does not
      defer the item
- [ ] 9.5 After the commit, update the title (drop the marker) and the body (the code and the
      spec, and `linkage`). Note a change to the item's title, body or labels after the approval
      (3.3). Request review from the role's `reviewers`, and release
- [ ] 9.6 The budget gate is consulted exactly as `runItem` does. No seat means no claim, and
      the item is not deferred
- [ ] 9.7 Tests for each scenario in *Gate two implements on the same branch*, *Gate two runs
      bug-hunter before publishing and hands back after*, *Gate two rewrites the artifact's title
      and body* and *A gate two that implements nothing hands off*

## 10. Closed and merged specifications

- [ ] 10.1 A test that a closed gate-one artifact is never resumed, whatever reviews it carries
- [ ] 10.2 A merged gate-one artifact of the Igor's own, found on the timeline `inFlightFrom`
      already walks, defers the item and asks once, sharing #141's mechanism if #141 has landed.
      After an answer from someone with write access, the next run is gate two on a fresh branch,
      with the merged change's tasks

## 11. Gate-two change requests

- [ ] 11.1 `actionableReview` applies past gate one too, returning `revise-implementation` for
      a change request only, and `universalSkip` admits it
- [ ] 11.2 Revise without the filter, then update the title and body
- [ ] 11.3 Tests

## 12. Documentation

- [ ] 12.1 `README.md`: a paragraph after "An Igor does not forget a pull request once it has
      opened one" (`README.md`) on the two gates, and `workflow` in the Roles list
      (`README.md`)
- [ ] 12.2 `docs/architecture.md` §5.0.4: the second exception to the in-flight skip, and why the
      phase is read from the artifact. §5.4: authority is the store-level `reviewers` plus write
      access, and role-level `reviewers` say whom to ask
- [ ] 12.3 Move what in `design.md` is record material into
      `openspec/specs/two-gate-workflow/decisions.md` when the change is archived

## 13. Hand-over, lost claims and hand-backs

- [ ] 13.1 A resumed revision or gate two claims as a catch-up does when a person's holder entry
      names the Igor, and its release leaves that entry in place
- [ ] 13.2 A claim lost before a revision or gate two publishes commits what exists onto the
      branch, requests no review, leaves a message naming it, and leaves the title, body and draft
      state alone
- [ ] 13.3 Before each hand-back (gate one, each revision, gate two), run spec-check's consistency
      read on the branch and commit its `Spec-check:` trailer onto the branch; refuse to hand back while a change there awaits its read
- [ ] 13.4 A non-closing reference on the `surface-adapter` side (6.4) for each tracker adapter
- [ ] 13.5 Tests for each scenario of *An artifact's phase is read from its diff*, *Resuming is not
      a claim of a hand-over*, *A resumed run commits onto the artifact's head* and *Each
      hand-back follows a consistency read*
