## 1. Foundations

- [x] 1.1 Extend config loading to resolve role files from the destination, alongside the existing store config
- [x] 1.2 Implement state-branch read and write through the git tree API, reusing the machinery `propose` already uses — no checkout
- [x] 1.3 Create the orphan state branch on first write, so a fresh destination needs no setup
- [x] 1.4 Verify losing the state branch entirely degrades to re-examining old items, never to duplicate claims — a missing file reads as `undefined` rather than throwing

## 2. Role config

- [x] 2.1 Define the role type: `extends`, `seat`, `sources`, `lane`, `instructions`, `completion`, `claim`, `allow`, `budget_share`, `reviewers` — filename as name
- [x] 2.2 Implement `extends` resolution across levels, with the org base as the default parent
- [x] 2.3 Implement monotonic merging for permission-shaped fields, rejecting a role that widens `allow` or raises `budget_share`
- [x] 2.4 Implement override merging for settings and append merging for `instructions`
- [x] 2.5 Implement append merging for `lane`, conjoining constraints so an org exclusion cannot be escaped by any role
- [x] 2.6 Validate `allow` against the closed vocabulary so a typo fails loudly rather than granting nothing
- [x] 2.7 Reject a `completion` action absent from the effective `allow`, so completion cannot bypass a permission
- [x] 2.8 Apply defaults for settle interval and cooldown, marked as tunable guesses
- [x] 2.9 Implement `igor role explain`, showing the effective merged config and which level each value came from
- [x] 2.10 Tests for each merge semantic, especially that widening is rejected and that lane exclusions survive

## 3. Surface adapter and GitHub

- [x] 3.1 Define the tracker interface: search, claim, verify claim (returning held/lost/stopped), report, identity, and whether assignment is native
- [x] 3.2 Define the code-host interface: produce a reversible artifact, and link it back to an item
- [x] 3.3 Define the normalized candidate: id, url, title, body, author, state, labels, linked paths, age, work-in-flight
- [x] 3.4 Implement the GitHub tracker: issue search from a native query passed through verbatim
- [x] 3.5 Implement GitHub work-in-flight detection via linked pull requests
- [x] 3.6 Implement the GitHub code host: draft pull request, linked with `Closes #n`
- [x] 3.7 Verify the normalized shape is produced identically whether an issue has labels, assignees, or neither

## 4. Discovery

- [x] 4.1 Run each source's query on an interval, normalizing results through the adapter
- [x] 4.2 Watermark per source, and treat the watermark as a cache that may be absent
- [x] 4.2a Bound a cold start to a look-back window, so a first run does not face the whole backlog
- [x] 4.2b Compare timestamps as instants, since surfaces differ on sub-second precision
- [x] 4.2c Poll sources independently, leaving a failing source's watermark unchanged
- [x] 4.3 Persist discovery state to the state branch, writing only when something changed
- [x] 4.4 Verify a re-run over unchanged sources produces no new candidates and no state write

## 5. Triage

- [x] 5.1 Implement the predicate evaluator over normalized candidates — `includes`, `excludes`, `under`, `max_days`
- [x] 5.2 Reuse that evaluator for lane matching, so lore firing and lane checks share one implementation
- [x] 5.3 Skip any candidate with work already in flight, before any model call
- [x] 5.3a Hard-skip a closed candidate, since stage one is deliberately loose and a source query may omit `is:open` — not a lane the org can forget to write
- [x] 5.4 Implement the LLM triage call over predicate survivors, returning a structured verdict with a reason
- [x] 5.5 Record every decision with its reason, including skips, to the state branch
- [x] 5.6 Record the cost each invocation reports, timestamped, per seat — execution per item, triage per cycle
- [x] 5.7 Verify predicates gate the model call, so triage cost scales with survivors rather than with what the tracker returned

## 6. Milestone: dry-run

Nothing before this point claims or posts anything. Reach it, look at the output, and tune
lane predicates before the loop is allowed to act.

- [x] 6.1 Implement `igor role dry-run`, reporting what a role would claim and why, claiming nothing
- [x] 6.2 Run it against a real repository and read every verdict by hand
- [x] 6.3 Tune lane predicates against what it actually surfaced — needs a repository with real traffic, tracked as adamstallard/igor#3
- [x] 6.4 Check the survivor ratio: how many candidates reach the model, and whether predicates are carrying their weight

## 7. Claiming and stop

- [x] 7.1 Claim by setting the assignee where the tracker has one, for visibility — as a machine user for the role, since a GitHub App cannot be an assignee
- [x] 7.2 Verify the claim after a settle interval by re-reading, and stand down if someone was first — scan for a stop from `claimedAt - settleSeconds`, since GitHub filters comments by `updated_at` at second granularity and a stop posted during the settle window must not fall in the gap
- [x] 7.3 Post a claim message from the role's template on every claim, not only where the tracker lacks assignment — it names the specific Igor, carries the stop instruction, and is the only claim signal on a message-only surface
- [x] 7.4 Implement stop: unconditional, open to anyone, released on detection with no permission check
- [x] 7.5 Detect stop through claim verification rather than a separate operation, and re-check at checkpoints during long execution rather than only per cycle — each checkpoint scans from the original claim time, never from the previous checkpoint, or a stop is missed in the gap between them
- [x] 7.6 Post a one-line receipt naming any partial artifact on stop — a stop is exempt from the handoff, since it releases the claim and whoever stopped it is taking over
- [x] 7.7 Return a stopped item to the pool after the cooldown, unless a human has assigned themselves
- [x] 7.8 Treat a go-ahead on the surface as short-circuiting the cooldown
- [x] 7.9 Verify stop cannot be disabled by any config value

## 8. Execution

- [x] 8.0 Implement the working-tree seam: provision a disposable tree per task, release it on any outcome
- [x] 8.1 Invoke headless Claude with the role's standing instructions and the normalized item
- [x] 8.2 Delimit all ingested content as untrusted data, distinct from standing instructions
- [x] 8.3 Enforce the action space at the loop: refuse to act on any output outside `allow`
- [x] 8.4 Produce the artifact through the code-host adapter and link it back to the item
- [x] 8.5 Write the transcript to the state branch
- [x] 8.6 Apply the completion action from policy, defaulting to unassign-and-leave-the-artifact
- [x] 8.7 Verify an output naming an action outside `allow` is refused rather than attempted
- [x] 8.8 Verify a task cannot see a file left by a previous task, and that a failed task still releases its tree

## 9. Graceful handoff

- [x] 9.1 Compose the handoff from recorded state — claimed, steps completed, artifact, reset time — with no model call
- [x] 9.2 Post it on budget exhaustion, reporting what remains and who could pick it up
- [x] 9.3 Post it on unrecoverable failure, without depending on the path that failed
- [x] 9.4 Hand off rather than retry on partial failure, so a claimed item never goes silent
- [x] 9.5 Verify the handoff still posts when the worker cannot be invoked at all

## 10. Seat budget

- [x] 10.1 Define seats in org config: id, owner, reserve; and pools as ordered lists of seats
- [x] 10.1a Select the first seat in a role's pool with headroom, passing over exhausted ones; a role may name a single seat instead
- [x] 10.1b Enforce `budget_share` as a ceiling on the pool, not a reservation — shares need not sum to one
- [x] 10.1c Record role, seat, cost and time per invocation, since the seat is chosen at run time and config cannot say which paid
- [x] 10.2 Read each seat's usage live through that seat's own token, refusing rather than substituting a credential
- [x] 10.3 Use recorded cost to apportion a seat between roles, never to decide it is exhausted
- [x] 10.4 Implement `igor budget`, reporting consumption, reserve, headroom and reset per window
- [x] 10.5 Stop work at the reserve floor, leaving a shared seat's remainder for the human — enforced per seat, independently of any role ceiling
- [x] 10.5a Hand off when no seat in the pool has headroom, rather than stopping silently
- [x] 10.6 Report per-model limits the loop does not enforce, so an unexplained exhaustion is explainable
- [x] 10.7 Verify an unreadable seat is passed over rather than treated as free

## 11. First supervised run

- [x] 11.1 Run one Igor against one repository, in the foreground, watched
- [x] 11.2 Confirm the first claim is correct before letting it execute anything
- [x] 11.3 Record what the real run contradicted, since every previous one has contradicted something
- [x] 11.4 Record the observed survivor ratio and per-item costs in the README, and that the intervals remain untuned

## 12. The loop itself

- [x] 12.1 Consolidate discovery, triage and reporting into one funnel, so no second implementation drifts from it
- [x] 12.2 `igor run <role>` works what triage approved; `--plan` stops after triage; `--claim` is the supervision override
- [x] 12.3 Implement `igor serve`: cycle, sleep the role's poll interval, repeat
- [x] 12.4 Survive a failing cycle rather than exiting, reporting it and continuing
- [x] 12.5 On shutdown, finish the item in hand and begin no further one
- [x] 12.6 Re-check the budget between items, not once per cycle
- [x] 12.7 Deployment artifacts — a unit file or compose file, and what running this actually requires
