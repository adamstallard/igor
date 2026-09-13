## 1. Foundations

- [ ] 1.1 Extend config loading to resolve role files from the destination, alongside the existing store config
- [ ] 1.2 Implement state-branch read and write through the git tree API, reusing the machinery `propose` already uses — no checkout
- [ ] 1.3 Create the orphan state branch on first write, so a fresh destination needs no setup
- [ ] 1.4 Verify losing the state branch entirely degrades to re-examining old items, never to duplicate claims

## 2. Role config

- [ ] 2.1 Define the role type: `extends`, `seat`, `sources`, `lane`, `instructions`, `completion`, `claim`, `allow`, `budget_share`, `reviewers` — filename as name
- [ ] 2.2 Implement `extends` resolution across levels, with the org base as the default parent
- [ ] 2.3 Implement monotonic merging for permission-shaped fields, rejecting a role that widens `allow` or raises `budget_share`
- [ ] 2.4 Implement override merging for settings and append merging for `instructions`
- [ ] 2.5 Implement append merging for `lane`, conjoining constraints so an org exclusion cannot be escaped by any role
- [ ] 2.6 Validate `allow` against the closed vocabulary so a typo fails loudly rather than granting nothing
- [ ] 2.7 Apply defaults for settle interval, cooldown, and calibration staleness, marked as tunable guesses
- [ ] 2.8 Implement `igor role explain`, showing the effective merged config and which level each value came from
- [ ] 2.9 Tests for each merge semantic, especially that widening is rejected and that lane exclusions survive

## 3. Surface adapter and GitHub

- [ ] 3.1 Define the tracker interface: search, claim, verify claim, report, identity, and whether assignment is native
- [ ] 3.2 Define the code-host interface: produce a reversible artifact, and link it back to an item
- [ ] 3.3 Define the normalized candidate: id, url, title, body, author, state, labels, linked paths, age, work-in-flight
- [ ] 3.4 Implement the GitHub tracker: issue search from a native query passed through verbatim
- [ ] 3.5 Implement GitHub work-in-flight detection via linked pull requests
- [ ] 3.6 Implement the GitHub code host: draft pull request, linked with `Closes #n`
- [ ] 3.7 Verify the normalized shape is produced identically whether an issue has labels, assignees, or neither

## 4. Discovery

- [ ] 4.1 Run each source's query on an interval, normalizing results through the adapter
- [ ] 4.2 Watermark per source, and treat the watermark as a cache that may be absent
- [ ] 4.3 Persist discovery state to the state branch, writing only when something changed
- [ ] 4.4 Verify a re-run over unchanged sources produces no new candidates and no state write

## 5. Triage

- [ ] 5.1 Implement the predicate evaluator over normalized candidates — `includes`, `excludes`, `under`, `max_days`
- [ ] 5.2 Reuse that evaluator for lane matching, so lore firing and lane checks share one implementation
- [ ] 5.3 Skip any candidate with work already in flight, before any model call
- [ ] 5.4 Implement the LLM triage call over predicate survivors, returning a structured verdict with a reason
- [ ] 5.5 Record every decision with its reason, including skips, to the state branch
- [ ] 5.6 Record the cost each invocation reports, timestamped, per seat
- [ ] 5.7 Verify predicates gate the model call, so triage cost scales with survivors rather than with what the tracker returned

## 6. Milestone: dry-run

Nothing before this point claims or posts anything. Reach it, look at the output, and tune
lane predicates before the loop is allowed to act.

- [ ] 6.1 Implement `igor role dry-run`, reporting what a role would claim and why, claiming nothing
- [ ] 6.2 Run it against a real repository and read every verdict by hand
- [ ] 6.3 Tune lane predicates against what it actually surfaced, and record what was wrong in the first attempt
- [ ] 6.4 Check the survivor ratio: how many candidates reach the model, and whether predicates are carrying their weight

## 7. Claiming and stop

- [ ] 7.1 Claim by setting the assignee where the tracker has one, for visibility
- [ ] 7.2 Verify the claim after a settle interval by re-reading, and stand down if someone was first
- [ ] 7.3 Post a claim message from the role's template where the tracker has no assignment
- [ ] 7.4 Implement stop: unconditional, open to anyone, immediate release of the claim
- [ ] 7.5 Return a stopped item to the pool after the cooldown, unless a human has assigned themselves
- [ ] 7.6 Treat a go-ahead on the surface as short-circuiting the cooldown
- [ ] 7.7 Verify stop cannot be disabled by any config value

## 8. Execution

- [ ] 8.1 Invoke headless Claude with the role's standing instructions and the normalized item
- [ ] 8.2 Delimit all ingested content as untrusted data, distinct from standing instructions
- [ ] 8.3 Enforce the action space at the loop: refuse to act on any output outside `allow`
- [ ] 8.4 Produce the artifact through the code-host adapter and link it back to the item
- [ ] 8.5 Write the transcript to the state branch
- [ ] 8.6 Apply the completion action from policy, defaulting to unassign-and-leave-the-artifact
- [ ] 8.7 Verify an output naming an action outside `allow` is refused rather than attempted

## 9. Graceful handoff

- [ ] 9.1 Compose the handoff from recorded state — claimed, steps completed, artifact, reset time — with no model call
- [ ] 9.2 Post it on budget exhaustion, reporting what remains and who could pick it up
- [ ] 9.3 Post it on unrecoverable failure, without depending on the path that failed
- [ ] 9.4 Hand off rather than retry on partial failure, so a claimed item never goes silent
- [ ] 9.5 Verify the handoff still posts when the worker cannot be invoked at all

## 10. Seat budget

- [ ] 10.1 Define seats in org config: id, owner, reserve
- [ ] 10.2 Implement `igor budget calibrate`, storing a human's `/usage` reading per seat on the state branch
- [ ] 10.3 Compute spend as a trailing sum over the last five hours and the last week — no window reset
- [ ] 10.4 Implement `igor budget`, reporting cap, calibration age, trailing spend, reserve, and headroom
- [ ] 10.5 Stop work at the reserve floor, leaving a shared seat's remainder for the human
- [ ] 10.6 Record an exhaustion as a cross-check, flagging a calibration the evidence contradicts
- [ ] 10.7 Verify an uncalibrated seat reports honestly rather than guessing a cap

## 11. First supervised run

- [ ] 11.1 Run one Igor against one repository, in the foreground, watched
- [ ] 11.2 Confirm the first claim is correct before letting it execute anything
- [ ] 11.3 Record what the real run contradicted, since every previous one has contradicted something
- [ ] 11.4 Record the tuned intervals and the observed survivor ratio in the README
