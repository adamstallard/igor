## 0. Before building

- [ ] 0.1 Capture real failure messages, each twice on separate runs: a clone on a full disk, a
      clone whose token the code host refuses, a catch-up merge that fails, and a tracker call answered 5xx.
      Check that each pair gives one signature after `design.md`'s masks and that different
      causes give different ones, and record the captures in `design.md`. If a pair does not
      match, change the masks; a breaker whose signatures never match never trips, and every
      failure is retried as in the in-force code.
      Check too that a tracker call answered 404 and one answered 500 give different
      signatures. Also capture a 403 for a permission the App lacks, such as on adding the claim
      label, and record which field of the response, other than its message, tells it from any
      other 403 (`proposal.md`, decision 32), so that 3.4a can record its cure key. Also capture a clone whose token mint the code host refuses because the App's
      credential is refused. Record whether, during the run of the item whose clone failed, the
      failure reaches #101's App condition and so records a cure key. Also capture a clone the
      code host does not answer, and record how the tree provider can tell it from a clone the
      code host refused, since git exits 128 for both. Capture each failure on two different
      items too, to check that the masks make them identical, and capture a 429 and a 403 for a
      rate limit, which the outage rule counts. Each capture feeds a mask or a tag above
- [ ] 0.2 Sections 2 to 4 build on `condition-backoff` (#101), which is in force, and wait until
      #213's redaction function merges (pull request #217). Tasks 3.1
      and 4.1 call that function
- [ ] 0.3 Check that #242's retry of a state write the branch refused (*A state write refused
      because the branch moved is retried*) covers appends to `executions.ndjson`, with several
      roles appending together. Record the result in `design.md`. If it does not, report it to
      #242: a lost `pre-worker` row of a matching failure undercounts, a lost run row of a worker
      start or a lost row of a different failure joins the failures on either side of it into one
      count (`model/findings/LateRows.cfg`), and a lost `outage` row lets an outage's failures
      count
- [x] 0.4 Make the model match the decisions taken on its earlier TLC findings: `SetDownOnce`
      TRUE in every configuration but its negative, `negative/NoSetDownOnce.cfg`, with
      `NoDoubleSetDown` checked in every configuration CI runs; `findings/LateRows.cfg` kept as
      an accepted limit. Also `IgorPostsLiftNothing`, the lifting rule, with
      `NoSetDownWithoutAnswer` and `negative/NoIgorPostsLiftNothing.cfg`

## 1. The agreement

- [x] 1.1 `work-claiming`: only a tracker or code host failing counts as the surface failing; a
      failure before the worker that repeats three times sets the item down; two identical ones
      on different items in a row end the cycle
- [x] 1.2 `design.md`: the count rebuilt from `executions.ndjson`, what "identical" means, how an
      outage is excluded, and where the set-down is said
- [x] 1.3 `model/PreWorkerBreaker.tla`, a TLA+ model of the breaker in one serving process, with its
      configurations, negatives and findings, and `.github/workflows/tla-pre-worker-breaker.yml`,
      which runs TLC on them (`design.md`, *What the model proves*)

## 2. Which surface failed

- [ ] 2.1 In `runItem`, pass `execute` the tracker, code host and tree provider through wrappers
      that tag an error thrown out of any call with `tracker`, `code-host` or `tree`, and with
      its HTTP status or exit code and whether the surface answered, as `unanswered` in
      `src/claiming.ts` reads a status (`design.md`). An untagged error is `igor`. A clone the code host did not answer is
      tagged `code-host`, by what task 0.1 finds; a token mint inside a clone that gets no answer
      is tagged `code-host`, and a refused one stays `tree`
- [ ] 2.2 `execute` reports, with a failure it returns rather than throws, the source of the step
      that failed: `tracker`, `code-host`, `tree` or `igor`. A returned failure with no source is
      `igor`
- [ ] 2.3 Set `surfaceFailed` on a run only where the tag is `tracker` or `code-host` and the
      surface did not answer, in the
      claimed-run handler and in `takeClaim`'s claim window (whose calls are all the tracker's).
      Update the `surfaceFailed` doc comment in `ItemRun` and the comment above `abandon` in
      `src/serve.ts`, which say every throw counts
- [ ] 2.4 Tests, one per scenario in *Only a tracker or code host failing counts as the surface
      failing*: two items in a row failing to clone in different ways do not end the cycle; two
      failing on a tracker call do; two working-tree failures after the worker ran do not; two
      failures in the Igor's own code do not; a working-tree failure whose message names a
      GitHub API error is not a surface failure; a code-host failure after the worker ran
      counts; `igor run` stops on two tracker failures with different messages; two refusals
      with different messages do not end the cycle; two clones the code host did not answer do;
      two failed token mints inside clones do not

## 3. The breaker

- [ ] 3.1 `provision` reports the path it made with a failure it throws, so the caller can mask
      it. A pure `signature(message, treePath)` that passes the message through the credential
      redaction of [#213](https://github.com/adamstallard/igor/issues/213), applies the masks in
      `design.md` in order, and returns the masked text's unkeyed SHA-256 as the fingerprint;
      and a pure `trailing(rows, item, role, source, fingerprint)` counting as `design.md`
      *Counting* says. Tests for each mask, for three-digit statuses and exit codes kept, for a
      seat's token redacted before the masks run, for each way the count stops,
      for a `cured` row skipped, and for the outage exclusion
- [ ] 3.2 A `failure` handoff's `next` gains `'set-down'`, whose tail is, exactly, with `<N>` the
      number of identical failures in a row, 3 or more:

      ```
      It has failed the same way <N> times in a row before starting work, so it will not try again until somebody replies or edits this, or another role's work on it succeeds
      ```

      If `defer-a-closed-pull-request` (#141) has landed, `somebody` becomes `someone with write
      access`, so the sentence names what lifts a deferral as `work-triage` then states it. It
      may otherwise be reworded only to keep it true of *A set-down lifts on a person's change or
      another role's successful run*. An undirected handoff's "It
      will try again next cycle" becomes this sentence. A directed handoff, whose tail is its
      relabel sentence alone, gets this sentence first and keeps the relabel sentence after it.
      In place of the raw error message the in-force handoff quotes, a set-down's post names the
      failure from the row's `source` and status, such as "Setting up the working tree failed
      (exit code 128)", and quotes no part of the message. The refused runs
      before a set-down name the failure the same way, before their "It will try again next
      cycle". For the other sources, the plain words are "A call to the
      tracker failed (HTTP 403)", "A call to the code host failed (HTTP 502)" and "Igor met an
      internal error". These examples may be reworded
- [ ] 3.3 On the third identical failure in the claim window, whichever message `takeClaim`
      posts carries the same sentence: `claimWithdrawn`, right after "Nothing was done, so there
      is nothing to clean up.", or `claimStuck`, where the release did not clear the label, right
      after "Nothing was done.". Either way it comes before a directed claim's relabel sentence.
      Post it even where the claim message never landed, and remove the role's label, save a
      person's label that releasing a catch-up's claim leaves. Before a
      set-down, a claim-window refusal's `claimWithdrawn` or `claimStuck` names the failure in the
      plain words of 3.2 and says it will try again next cycle. Where the set-down's post fails,
      refuse the run instead of deferring it (`design.md`, agents' decision A1). Tests for each
      case, and for a set-down posted where the claim message never landed
- [ ] 3.4 In `runItem`, on a failure before the worker (a refused claim window, a throw raised
      before `execute` spawned the worker, or a failure `execute` returns before spawning it;
      #101's `workerless` mark on a run row tells that last kind apart from a worker that
      started and produced nothing): build the signature, ask the count reader for the
      trailing count, and on a count of 3 or more including this one,
      unless 4.5's function says this run is the second of two that end the cycle, and unless the failure
      records a cure key, return `handed-off` with `handoff: 'failure'` and the set-down tail.
      Otherwise refuse: give the claim back with the refusal. This turns a failure `execute`
      returns, which the in-force code hands off and defers at once, into a refusal (the
      proposal's decision 25). A count reader that throws or is absent counts as 0, and the
      `pre-worker` row is still written. Before
      posting a set-down, read the item's record in `deferred.json`; where it holds a set-down by
      this role that has not lifted, post no set-down, and give the claim back with the refusal,
      leaving out its "It will try again next cycle". Key a set-down's record in `deferred.json`
      by item and role, so a second role's set-down does not replace the first's (`design.md`,
      agents' decision A2)
- [ ] 3.4a A call the tracker or code host refuses because the GitHub App lacks a permission
      records a cure key under #101's mechanism, naming the permission, once task 0.1 has found
      how to tell such a 403, so the breaker does not count it (proposal,
      decision 32). Test: *A missing App permission sets no item down*
- [ ] 3.4b Give a thrown failure its cure key: where a throw out of a claimed run comes from a
      fault #101 keys a condition on, the handler records that cure key on the run row, as it
      does for a result `execute` returns, so 3.4 and *Counting* can skip it. Test: a throw that
      carries a cure key writes a run row with it, marked `workerless`, and counts toward no
      item's breaker
- [ ] 3.5 The threshold is a named constant, 3, with a comment saying why three
- [ ] 3.6 Tests, one per scenario in *A failure before the worker that repeats sets the item
      down*, including a restart (a fresh loop reading the same rows) and a deferral lifted by
      a reply followed by an identical failure
- [ ] 3.7 A set-down's record in `deferred.json` says it is a set-down. The check that decides
      whether a deferral has lifted lifts a set-down only on a person's reply or edit, or on
      another role's successful run on the item, such as a pull request that role opened for it;
      an Igor's other posts lift nothing. Decide how a role tells another role's successful run
      from its other posts, and measure how to tell an edit's author, since the in-force
      fingerprint records none; until then any edit lifts a set-down. Record both in `design.md`

## 4. The record

- [ ] 4.1 Append a `kind: 'pre-worker'` row for each failure before the worker, with `item`,
      `role`, the cycle the run counts toward as `cycle`, named by the process's start id and a
      count of its cycles, the next count where the run ends between cycles, `source`, `httpStatus` or
      `exitCode`, `cured`, and the fingerprint of 3.1, and no message text, wherever a run is
      recorded (an `igor run --claim` row, which runs outside any cycle, has no `cycle`):
      `serve`'s event handler, and the two loops of `igor
      run`'s cycle in `src/cli.ts`, over the items it claims and over its catch-ups, and
      `igor run --claim`'s catch-up path, which must also defer a set-down item. Write the full
      message, after #213's redaction, to the process's own log. Tests check that no part of the
      message reaches the row, and that a seat's token does not reach the log. A
      failure that records one of #101's cure keys writes its `pre-worker` row with `cured:
      true`, and keeps its ordinary run row, with its `cures`, so #101's conditions still see
      it. A failure
      `execute` returns keeps its run row too, which #101's code marks `workerless`, so #101's
      probe, the one item it lets through to test whether a fault has cleared, still ends on
      it. The run row of a thrown failure that records a cure key is marked `workerless` too
      (agents' decision A4). The run row's `reason` and the set-down's deferral record carry the
      plain words of 3.2, not the error message (agents' decision A3). *Counting* reads #101's
      `workerless` mark; no second marker is added
- [ ] 4.2 Each cycle, `serve`'s and `igor run`'s, appends a `kind: 'outage'` row when it ends on
      two surface failures, with `role`, the cycle's name of 4.1 as `cycle`, every item whose
      run failed before the worker in that cycle as `items`, and as `failures` each named
      failure's fields from 4.1, with no message text, as `design.md` says
- [ ] 4.3 Supply the count reader through `wiring.ts`: it reads `executions.ndjson` with `readLog`,
      bypassing its cache for every day file dated from the day before the reading host's date
      onward, including one dated later that a host whose clock runs ahead wrote, as `design.md`
      says.
      `readLog` reports a failed listing of the day files and each day file it failed to read
      (in the in-force code `listPartitions` and `readStateRaw` return an empty result for either), and the count
      reader treats such a read as one that failed, so the run sets nothing down
- [ ] 4.4 Check that every reader of `executions.ndjson` that counts runs skips `pre-worker` and
      `outage` rows. #101's `stuck-conditions` requires readers to skip rows carrying a `kind`,
      and its task 2.3 builds that
- [ ] 4.5 One function, which `serve`'s cycle and the single cycle `igor run` runs in
      `src/cli.ts` both call, applies both two-in-a-row rules: it ends the cycle on two surface
      failures in a row, and on two runs in a row, of different items, that fail before the worker
      with the same source and masked message. It keeps the previous run's item, source, message and
      whether it was a surface failure, for the cycle only. Move `serve`'s surface-failure count
      into it, so `igor run` gains the surface rule. A cycle that ends on two surface failures
      appends the `outage` row of 4.2; one that ends on two identical failures appends an
      `outage` row naming only those two items. Where the two identical failures are also
      surface failures, the cycle ends on the surface rule and writes 4.2's row. Runs are
      compared in the order they end, as #242 counts them. A run that records a cure key leaves
      the previous run in place. A refused call, a tracker or code-host call outside the working
      tree that was answered and refused, is never one of a pair, but becomes the previous run.
      The previous run is cleared when a cycle ends; a run that ends between cycles counts toward
      the next. `igor run --claim` does not call the function
- [ ] 4.6 Tests through both `serve` and `igor run`: one per scenario in *Two identical failures
      before the worker on different items end the cycle* (the cycle ends and neither count
      moves; different failures continue and both count; an item alone in its cycle counts once;
      two identical refused calls continue and both count), two tracker failures in a row with
      different messages ending the cycle, and an `igor run --claim` failure counting toward the
      breaker and ending nothing

## 5. The watermark

- [x] 5.0 `specs/work-discovery/spec.md` copies *Watermarks reduce reconsideration without
      governing it* from #242's text and adds two reasons the watermark holds back, a cycle
      ended by either two-in-a-row rule, with a scenario for each, and keeps it below a claim
      refused when the run records a cure key, with a third scenario (decision 12)

## 6. Close

- [ ] 6.1 `npm test` passes; `openspec validate pre-worker-breaker --strict` passes
- [ ] 6.2 Gate two closes #155
- [ ] 6.3 In the commit that archives this change, point
      `.github/workflows/tla-pre-worker-breaker.yml`'s paths and working directory at the
      archived change's `model/`, or the archive's push runs the workflow against a directory
      that no longer exists

## 7. Archive

- [ ] 7.1 At archive, after #216 (`lore-search`) has archived: rewrite this change's block of
      `work-triage`'s *An item handed back is not re-worked until something answers* by hand
      onto the in-force text, keeping every scenario #216 added and its flagged-held rule, which
      a cure key and a reply do not release, and adding this change's set-down reference, its
      test for a fact about the Igor and its two scenarios. Where #141 has archived first, keep
      its text too
