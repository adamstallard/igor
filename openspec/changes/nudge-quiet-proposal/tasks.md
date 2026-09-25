## 1. Reading and writing comments

- [ ] 1.1 `comments(repo, number)` in `src/github.ts`, returning each comment's author, body and
      creation instant — the instant, not a date, since the idempotence rule compares against
      `updatedAtInstant`
- [ ] 1.2 `comment(repo, number, body)` in `src/github.ts`, posting to the issues-comments
      endpoint by pull request number
- [ ] 1.3 Tests: a pull request with no comments, one with a nudge among several, a post that
      the token is not permitted to make

## 2. The nudge itself

- [ ] 2.1 The body: how long quiet and since when, the assignees by plain name, the store
      reviewers or that none are configured, and all three endings with the permanence of
      rejection stated
- [ ] 2.2 A marker the next run recognizes, carried in the body and not depending on who posted
      it
- [ ] 2.3 Tests over the text itself: all three endings present and distinguished, permanence
      stated, deferral stated as reversible, no `@` mention anywhere in it

## 3. Nudging once per quiet spell

- [ ] 3.1 In `src/reconcile.ts`, after `isProposal` confirms a quiet pull request: read its
      comments, find the newest carrying the marker
- [ ] 3.2 Post where there is none, or where `updatedAtInstant` is strictly later than that
      comment's creation instant and the window has elapsed since
- [ ] 3.3 The reported quiet date comes from the nudge rather than from `pr.updatedAt` once a
      nudge exists, so a nudged proposal is never reported as active
- [ ] 3.4 Tests: five runs and one comment; a local run after the job's nudge; a nudge authored
      by a person still recognized as ours; a reply then a second quiet spell earning a second
      nudge; an ignored nudge earning none, ever

## 4. Failing loudly

- [ ] 4.1 A post that fails is reported naming the permission needed, after the promotions and
      rejections are written
- [ ] 4.2 Reconciliation exits non-zero where a nudge could not be posted
- [ ] 4.3 Tests: promotions still written on a failed post; the missing permission named; the
      next run posts once the failure clears

## 5. The template

- [ ] 5.1 `templates/reconcile-on-merge.yml` takes `pull-requests: write` in place of
      `pull-requests: read`, with the comment saying why it is not `issues: write`
- [ ] 5.2 Confirm on a real destination that `pull-requests: write` is sufficient to comment on
      a pull request through the issues-comments endpoint — the one claim in `design.md` that is
      documentation rather than measurement
- [ ] 5.3 `docs/` says what a destination sees on a proposal that goes quiet
