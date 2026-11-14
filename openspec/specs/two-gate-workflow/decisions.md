# two-gate-workflow: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: An approval counts on a draft and with the item untouched.**
  GitHub accepts an approving review on a draft pull request, so gate one can keep the role's
  draft choice, and a role that allows only `draft-pr` can use the workflow.
  Evidence: on 2026-10-04, in `adamstallard/igor-throwaway-tests`, the App `igor-generalist` opened draft pull request #10; a person's `POST /pulls/10/reviews` with `event=APPROVE` returned `state: APPROVED`, and read back as the App, REST gave one review by a `User` with state `APPROVED` while GraphQL gave `isDraft: true` and `reviewDecision: APPROVED`, [adamstallard/igor-throwaway-tests#10](https://github.com/adamstallard/igor-throwaway-tests/pull/10)
- **Rationale: Authority is read from the code host and fails closed.**
  Write access is read from the permission endpoint's `user.permissions.push` boolean, never from
  its `permission` string, which reports `admin` for an admin and `write` for a maintainer, so
  comparing it to `"write"` would exclude the people with the most authority.
  Evidence: measured for `directed-interaction` against the live `GET /repos/{repo}/collaborators/{login}/permission` endpoint, whose response carried `permission`, a `user.permissions` map of `{admin, maintain, push, triage, pull}` and `user.role_name`, with the string reading `admin` for an admin and `write` for a maintainer, [openspec/changes/directed-interaction/proposal.md](../../changes/directed-interaction/proposal.md)
- **Rationale: A gate-one artifact says it is a specification and closes nothing.**
  A non-closing mention of an issue in an open pull request's body creates the
  `CROSS_REFERENCED_EVENT` that `inFlightFrom` reads, so a gate-one pull request that refers to
  its issue without closing it still keeps the issue in flight. That such a reference closes
  nothing on merge is unmeasured (task 1.3), and this entry does not cover it.
  Evidence: on 2026-09-28, issue #139 carried a `CROSS_REFERENCED_EVENT` from pull request #140, which only mentions it, [adamstallard/igor#139](https://github.com/adamstallard/igor/issues/139)
