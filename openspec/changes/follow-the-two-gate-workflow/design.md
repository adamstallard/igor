## Context

An Igor's run is claim, work, publish, release. The worker edits files in a disposable clone,
and the loop decides what becomes of them: it filters by the role's action space, builds a
branch through the code host's API from what changed, and opens a pull request titled with the
issue title. Its body is `Closes #n` followed by a transcript excerpt. The claim is then released
and the configured completion action taken.

After that the item is out of reach. It reports work in flight, and that skip is universal. The
one pass that returns to a published artifact is the catch-up (`A published artifact is kept
mergeable`). It finds an Igor's own artifact that stopped merging by scanning everything
discovery returned, not only what the watermark let through, because a base moving does not
touch the item.

Two-gate needs the loop to stop after a specification, wait for a person, and come back to the
same branch. This change reuses the catch-up's shape for coming back, and the loop's existing
control over the worker's files for stopping.

## Decided (Adam, 2026-09-28)

These are settled and are not reopened here.

1. **A per-role setting turns it on**: `workflow: two-gate`. Roles without it behave as today.
2. **At gate one the loop refuses every path outside `openspec/changes/**`.** The loop enforces
   it, not the worker's instructions. It publishes only changes under that path and reports what
   it dropped. This is the same mechanism by which the loop already decides what becomes of a
   worker's files: `Only reversible artifacts are produced`, whose scenario *Enforcement is at
   the loop, not the prompt* this repeats, and the carry requirements in `task-execution`.
3. **The go signal is an approving GitHub review** on the spec pull request, from someone with
   authority over the repository: store-level `reviewers`, plus anyone with write access
   (`docs/architecture.md` §5.4). It is structured data, so no text is interpreted, and it does
   not depend on `directed-interaction`.
4. **Changes requested: revise on the same branch.** Read the review as data, never as
   instruction (§5.4), amend the spec on the branch, reply to the review, hand it back.
5. **Gate two, after approval**: on the same branch, implement to the tasks, run bug-hunter
   where configured (#139), update the pull request's title and body to describe the code as
   well as the spec, and hand back for the gate-two review.

Also stated as requirements in the brief for this change:

- **Only gate two may carry a closing keyword.** Merging after gate one alone must not close the
  issue with nothing built.
- **A closed spec pull request behaves as #141 says a closed pull request does.**
- **Gate two's spend goes through the normal budget gate.**

The brief also gave three recommendations: a fresh claim at gate two, noting an edited item and
continuing, and treating an approval with comments as a go. The spec is written to them, and
they were listed as questions 11–13, and Adam confirmed them.

## Decided (Adam, 2026-10-04)

- **An approval from an Igor never counts as the go signal.** Only an approving review from a
  person with authority does. This reverses settled question 5, and matches
  `one-claiming-surface`'s *A person approves every Igor pull request* (#156).
- **Every Igor is a GitHub App at launch** (#156). An Igor's review is therefore recognisable by
  its author's account type, `Bot`, with no list of Igor accounts. Machine-user Igors are not
  supported, so an Igor never posts as a person.
- **An App claims with its `igor:<role>` label, not the assignee** (#156). The fresh claim at
  gate two is the ordinary claim, so settled question 11 now names the holder field where it
  named the assignee, and the rediscovery scenario in `work-triage` says the Igor released its
  claim where it said it unassigned itself. Amended 2026-10-04.

## Decisions made here

Each of these follows from the settled decisions above, or from requirements already in force.
Where one was a real choice, it was also put to Adam as a question (see Settled questions).

### Confinement is a filter on what is carried, not a separate path

The loop already turns `tree.changes()` into files and deletions at one place (`carried`, in
`execute.ts`). Gate one filters that list by path before anything is published. Everything
dropped becomes a refusal, which is how the loop already records an action it declined. The
refusals are named in the pull request body and in the report on the item.

That runs into an in-force requirement: *The artifact carries every change the worker made,
including removals*. Its reason is that an artifact missing part of the change "looks complete
to a reviewer and is not". So the requirement is modified to name gate one as its one exception,
and gate one answers the reason by saying what was dropped in the one place a reviewer is sure
to read: the top of the body. A spec that silently lacked a file the worker wrote would be
exactly what that requirement forbids. A spec that says "these were written and not published"
is not.

**Path, not file.** Following `The artifact carries no change the worker did not make` (#125,
open), the rule is stated over paths, so a submodule or any other kind of tree entry is
confined the same way a file is.

**A rename across the boundary is split.** A rename is a removal plus an addition. Gate one
carries whichever side is under `openspec/changes/**` and drops the other, and it names both, so
that a rename out of the specification tree does not arrive looking like a plain deletion.

**Nothing left means a handoff, not "nothing to do".** A worker that wrote only code has done
something, just the wrong thing for this gate. `nothing-to-do` would read as "looked and found
nothing", and is not deferred the same way.

**The confinement binds the worker, not the base.** Catching up a gate-one artifact merges the
base in, and the resolution commit names the base as a parent. The base's own changes under
`src/` come with it, as they must. Confinement applies to what the Igor authors on top.

### The phase is read from the artifact, not from the state branch

To resume, the loop has to know whether an open artifact of its own is at gate one or gate two.
The state branch is a cache, and correctness must never depend on it (`State is a cache and
correctness never depends on it`). So the phase is read from the artifact itself:

- **Gate one** is an artifact whose diff against its base holds no path outside
  `openspec/changes/**`.
- **Gate two** is anything else.

This works because gate two never publishes an implementation that stays inside the path. It
hands off instead (see below), so a gate-two push always moves the artifact out of gate one. A
person who pushes code onto a gate-one branch moves it into gate two, and the Igor then leaves
it alone as work in flight, which is the safe direction. A pull request's diff is taken against
the merge base, so a catch-up merge does not move it.

The alternative, reading the title marker, was rejected (settled question 2).

### Which review counts, and when

A review is **decisive** if it approves or requests changes. A comment-only review is not
decisive, and neither is a dismissed one. For each person with authority, only their latest
decisive review counts (`latestOpinionatedReviews` in GitHub's GraphQL API).

A review is **current** while nothing has changed the artifact's content since it was
submitted. It stays current when the head has moved only by merges of the base. The Igor's own
revision, or its gate-two push, supersedes it. So does a commit anyone else pushes that is not
a merge.

A merge must not supersede a review. `A published artifact is kept mergeable` catches up
artifacts that conflict, and a gate-one spec waiting for review is exactly the kind of artifact
that gets caught up. If each catch-up voided the approval, a slow review on a busy repository
would never end.

A current decisive review is **answered** once the Igor has posted a hand-back reply on the
artifact that names that review. Nothing else answers a review. That includes the Igor answering
a mention under `directed-interaction`, and a comment from someone else. A review is
**actionable** while it is current and unanswered. Then:

- a current, unanswered change request from anyone with authority means **revise**, even if
  someone else approved;
- otherwise, a current, unanswered approval from anyone with authority means **go**;
- otherwise, **wait**.

"Answered" is what makes each round end at a fixed point without a record on the state branch.
A revision that commits supersedes the review it answers. A revision that changes nothing
cannot commit, and without this rule the same review would stay current and be retried at full
worker cost every cycle. The reply it posts names the change requests it answers, and so marks
those answered instead. The same rule ends a gate two that implements nothing, where the reply
names the approval. A later review is actionable again.

**Answering names the review, so a reply answers only what it names.** A looser rule, "the Igor
posted anything after the review", would let an answer to a mention silently void an approval,
and gate two would never start. It would also let a no-op revision's reply to a change request
void an approval standing beside it.

Changes requested win over an approval because a person who asked for changes has not been
answered. A revision is a new commit, so it supersedes the approval as well. The approver
re-approves the revised spec, which costs them seconds. If the revision changes nothing, the
approval was not superseded, and it becomes actionable once the change request is answered.

### Authority is checked per reviewer, and fails closed

A review's author comes from platform metadata, never from text (§5.4). **An author whose
account type is `Bot` has no authority**, whatever its access, and no permission read is made
for it. Every Igor is a GitHub App, so this excludes every Igor's review, an approval or a
change request. It also excludes any other App, such as a dependency bot, which was never
asked to decide.

Any other author has authority if the store's `reviewers` names them, or if `user.permissions.push` is true on the
repository (`GET /repos/{repo}/collaborators/{login}/permission`). Read the boolean, never the
`permission` string. `directed-interaction` measured this: the string reports `admin` for an
admin and `write` for a maintainer, so comparing it to `"write"` excludes the people with the
most authority. A read that fails means no authority for that cycle.

`latestOpinionatedReviews(writersOnly: true)` would answer the write-access half in one request,
and cannot answer the store half. So the request asks for all authors, and the check runs per
author, one read per distinct author, cached for the cycle.

### Found by scanning, like a catch-up

The go signal lands on the pull request, and the item's `updatedAt` does not move. An approved
spec is found the way a stale artifact is: by reading every candidate discovery returned, below
the watermark as well as above it, at no model cost. The review data comes in the same request,
by extending the `pr` fragment the search already carries. A resumed item holds no watermark,
for the reason the catch-up gives in `planCycle`.

A resumed item is decided at the universal stage, as a catch-up is. The model stage does not
run, because the approval is the decision about the item, and re-triaging an item a person just
approved could veto them. The stop gate and the deferral gate still run.

Lane predicates run (settled question 9).

### Gate one ends with a release, not a completion

The configured completion action is for "on believing work complete". At gate one the work is
not complete. Taking `completion: close` at gate one closes the issue with nothing built, which
is the failure Adam's closing-keyword decision exists to prevent, reached another way. So gate
one releases the claim, as standing down does, and the completion action waits for gate two.
This was put to Adam because it narrows how an existing setting behaves (settled question 10).

### No closing keyword from any source until gate two

GitHub closes an issue from a closing keyword in a pull request's body, or in the message of a
commit that reaches the default branch. At gate one the Igor controls three places:

- **The body.** It is built from `linkage` and a transcript excerpt. `stripLinkage` removes only
  the exact linkage line, so a worker's own "Fixes #12" survives into the body today.
- **The commit message.** It is the issue title, written by a person, and could carry one too.
- **The worker prompt.** It tells the worker the item will be referenced as `Closes #n`.

So the rule is stated over any closing keyword the host honours, from any source, and not over
the adapter's linkage line. The reference that links without closing is adapter-supplied,
because linkage is. For GitHub it is `Answers #n`. This was measured on 2026-09-28: a
non-closing mention of an issue in an open pull request's body creates the
`CROSS_REFERENCED_EVENT` that `inFlightFrom` reads (issue #139 carries one from PR #140). So gate
one still counts as work in flight.

### Revising and implementing commit onto the existing branch

`produce` creates a branch, and fails with `422 Reference already exists` on one that exists.
`resolve` commits onto an existing branch, but only a two-parent merge. Gate two and revisions
need a third operation: a one-parent commit onto the artifact's branch, laid over its head.
`commitOnBranch` (`github.ts`) already takes a parent list and is the primitive. They also need
an edit to the pull request's title and body, and a re-request of review. Neither has a helper
beside `openPullRequest` today.

The tree is provisioned at the artifact's branch (`provision(repo, ref)`), which the catch-up
already does.

### Replying to a review is owed, not permitted

The reply on the pull request is the hand-back. It belongs with the handoff and the claim
message, which the protocol owes whatever `allow` says, and not with the `comment` action a
worker's output might imply. A revision that went silent on the person who asked for it would
be the silence `An Igor never goes silent on a claimed item` forbids, moved to the pull request.

### What gate two says about an edited item

The approval was of the spec, so an edit to the item between the gates does not stop gate two.
It is noted: gate two's body says the item was edited after the approval, and links the item.
The reviewer then knows to check the spec against the new text. "Edited" means the item's own
edit time (`lastEditedAt`) is later than the approval. A comment is not an edit.

## Settled questions (Adam, 2026-09-28)

Adam accepted every recommendation below on 2026-09-28. The requirements were already written to
them, so none changed. Question 3 still waits on the measurement in task 1.1, which decides
between its two branches. Adam reversed question 5 on 2026-10-04.

1. **The gate-one title marker.** An Igor can't know a repository's `TYPE(Scope):` convention,
   and its title is the issue title today. *Recommend:* gate one titles the pull request
   `SPEC: <issue title>`, and gate two titles it `<issue title>`, the title a one-gate run would
   have used. The requirement says "a marker", so only the wording changes if you choose
   another.
2. **How the phase is read.** *Recommend:* from the artifact's diff (gate one is confined to
   `openspec/changes/**`), as above. The alternative is the title marker. It is cheaper, since
   it is already in the search results, but a reviewer who tidies the title stalls the item
   forever, and that is the unsafe direction. The diff costs one file listing per own gate-one
   artifact that has an actionable review.
3. **Draft or ready at gate one.** A role that allows `draft-pr` opens drafts. Whether GitHub
   accepts an approving review on a draft has not been measured (task 1.1). *Recommend:* keep
   the role's choice if it does. If it doesn't, open gate one ready for review where the role
   allows `pr`, and refuse `workflow: two-gate` at validation for a role that allows only
   `draft-pr`, since that role could never be approved.
4. **Role-level `reviewers`.** §5.4 says "per-role lists once roles exist", and roles now
   declare `reviewers`. Your decision named the store-level list. *Recommend:* role `reviewers`
   do **not** confer authority. They say whom to ask, and the store list says who may decide. A
   role reviewer with write access has authority anyway.
5. **An approval from another Igor.** **Reversed by Adam on 2026-10-04:** an Igor's review
   never counts, and only a person with authority starts gate two. The 2026-09-28 answer
   followed §5.4 because no list of Igor accounts existed. None is needed: every Igor is a
   GitHub App, and its review's author is a `Bot` account (see *Authority is checked per
   reviewer*).
6. **Changes requested at gate two.** *Recommend:* the same revise loop, without the confinement,
   on the same branch. It is specified as its own requirement, *A change request at gate two is
   answered on the same branch*, and by the in-flight skip's "past gate one, a change request"
   clause, with its scenario *A change request past gate two is a candidate*. Dropping it means
   dropping all three.
7. **A spec pull request merged before gate two.** With no closing keyword the issue stays open,
   and a merged pull request is not in flight, so today the next pickup would open a **second**
   spec pull request, which Adam's workflow forbids. The merge is ambiguous: "spec accepted,
   now build it", or "this was all we wanted". *Recommend:* treat it as #141 treats a close.
   Defer the item and ask once. It is specified as its own requirement, *A spec pull request
   merged before gate two defers its item*, so it can be dropped. What an answer then starts is
   also open. The spec is already on the default branch, so there is no spec branch left to
   build on. *Recommend:* the next run is gate two on a fresh branch, with the merged change as
   its tasks. That is a second pull request, but only because the first one was merged by a
   person, not because the Igor opened a new one.
8. **`workflow` merge semantics.** *Recommend:* **override**, like `completion`, over a closed
   set `one-gate | two-gate`, defaulting to `one-gate`. Two-gate adds a review gate. It is not
   more or less permissive in the way `allow` is, so there is no direction in which a monotonic
   rule would be strict. An org base can set it, and a role can set it back. A typo is refused,
   as an unknown action in `allow` is.
9. **Lane predicates on a resumed item.** A catch-up gets only the universal skips. *Recommend:*
   the lane **does** apply to gate two and to revisions. A person who relabels the item `Human`
   between the gates has said the opposite of go, and the lane is the cheapest place to honour
   that. The model stage still does not run.
10. **Completion at gate one.** *Recommend:* release only, as above. The configured completion
    action waits for gate two. This narrows how `completion` behaves for a two-gate role. It
    does not modify `Completion behaviour follows configured policy`, because gate one is not
    "believing work complete", but you may want that spelled out there.
11. **A fresh claim at gate two, and at each revision.** *Recommend:* yes, on the item, through
    the ordinary claim path, so the holder field (on GitHub, the Igor's `igor:<role>` label) and
    the claim message show gate two starting.
    The claim message also names the pull request being resumed. A claim on the pull request
    was considered and rejected, because the item is where people look and where a stop is
    read.
12. **An item edited between the gates.** *Recommend:* note it in gate two's body and continue.
    The approval was of the spec, and a reviewer who disagrees can stop the Igor or request
    changes.
13. **An approval that also carries comments.** *Recommend:* still a go. The review body and its
    inline comments go to the worker as untrusted data, which the implementation considers.
    Nothing in them can turn the approval into a change request, or widen what gate two may do.

## Interactions with open work

- **#140 `directed-interaction`.** It is not needed for the go signal, which is a review and
  not a mention. They coexist without either depending on the other. A mention on a spec pull
  request can still ask a question, and is answered under `directed-interaction`'s rules. A
  mention can never be a go signal, and neither can any comment text: "LGTM, go ahead" in a
  comment starts nothing. An approving review whose body mentions an Igor is still a review,
  and it is the review that counts. Where #139's bug-hunter decisions are answered by mention
  at gate two, that is #140's "answer to a question the Igor asked", on the same pull request,
  and nothing here changes it.
- **#141 `closed-pr-defers`.** A closed spec pull request is an Igor's own pull request closed
  without merging, so #141's rule covers it with nothing added: defer, ask once, and restart
  only on an answer from someone with write access. This change adds only what #141 can't say
  about a gate it doesn't know exists: a closed spec pull request is never resumed. That already
  holds, because only open pull requests are in flight, and it is stated so no implementation
  loosens it. The merged-at-gate-one case (question 7) mirrors #141's rule.
- **#156 `one-claiming-surface`.** It makes every Igor a GitHub App and requires a person to
  approve every Igor pull request. The go signal relies on both: the `Bot` account type is how
  an Igor's review is excluded.
- **#146 `claim-window`.** Gate two and each revision take an ordinary claim through
  `takeClaim`, so *A claim that cannot be kept is given back, out loud* applies to them
  unchanged. Nothing here depends on #146 landing first.
- **#139 bug-hunter as a pipeline step.** Gate two runs it where it is configured. This change
  specifies only where the step sits, after the implementation and before the commit and the
  title and body update. #139 owns how it runs and what trailer it mints. Gate-one commits carry
  `Bug-hunter: skipped at triage (spec only)` once #139 lands, the same trailer this pull
  request's own commit carries. Gate two's body includes bug-hunter's open decisions under
  #139 §3b.
- **#125 `carry-only-what-happened`.** It states its rule over paths, and gate one's confinement
  follows it. They are independent filters on the same list. Confinement runs after #125's rule.
- **`budget-pacing`, #143.** Gate two and revisions are ordinary spends through the gate, and
  whatever that gate becomes, they go through it.

## Risks

- **An Igor that is not an App breaks the `Bot` test.** Today's build runs an Igor as a machine
  user, whose reviews are authored by a `User` and would count. `igor doctor` (#113) reports any
  role whose GitHub identity is not an App as a finding (task 2.5). An approving review stays the
  only go signal (Adam, 2026-09-28), with no fallback from the pull request's author.
- **Review data widens the discovery request.** `latestOpinionatedReviews` and `headRefOid` on
  every cross-referenced pull request add to the GraphQL cost of each page. Measure before and
  after on a real query (task 3.4).
- **A slow approval on a fast base.** Merges don't supersede a review, so this doesn't stall. A
  base that conflicts again every cycle is still bounded by the catch-up's own rule.
- **Repositories that dismiss stale approvals.** With that protection on, a catch-up merge
  dismisses the approval, and gate two waits for a new one. This is the safe direction.

- **A mention alone already makes an issue "in flight".** A non-closing mention of an issue in
  any open pull request's body creates the `CROSS_REFERENCED_EVENT` that `inFlightFrom` reads,
  and `inFlightFrom` returns the first open pull request it finds. So an issue that an unrelated
  open pull request merely discusses is skipped as work in flight. Observed on 2026-09-28: issue
  #139 reads as in flight because open PR #140 mentions it. Filed as #151. Fixing it by counting only real links
  (`willCloseTarget`, or a Development link) would make gate one's `Answers #n` PR invisible, so
  gate one then needs a link that marks the work without closing the issue. That has to be
  settled here or on #151 before this change's implementation lands. Gate one relies on that same event,
  so this change neither fixes nor worsens it. It does mean a spec pull request that discusses
  another issue makes that issue skip. This may deserve its own issue.

## Roads not taken

- **A second pull request for gate two.** Adam's workflow says never. It would also split the
  review conversation across two pull requests.
- **Recording the phase on the state branch.** It is a cache, and a lost cache would put a
  gate-two artifact back through gate one.
- **A mention as the go signal.** It is text, and it needs `directed-interaction`. The review is
  structured data a person already produces.
- **Confining gate one through the worker's instructions alone.** Instructions are the steerable
  channel. The loop enforces the action space so that it holds when the worker is steered.
- **`reviewDecision` as the signal.** It counts only reviewers that branch protection counts, so
  it can't include a store-level reviewer without write access. It also reports nothing on a
  repository without required reviews.
