## 0. Before building

- [ ] 0.1 Capture real failure messages, each twice on separate runs: a clone on a full disk, a
      clone with an expired token, a catch-up merge that fails, and a tracker call answered 5xx.
      Check that each pair gives one signature after `design.md`'s masks and that different
      causes give different ones, and record the captures in `design.md`. If a pair does not
      match, change the masks; a breaker whose signatures never match never trips, and every
      failure is retried as in the in-force code.
      Also capture a clone whose token mint the code host refuses because the App's credential
      is refused. Record whether, during the run of the item whose clone failed, the failure
      reaches #101's App condition and so records a cure key.
- [ ] 0.2 Sections 2 to 4 wait until `condition-backoff` (#101) merges (Adam, 2026-10-18).
- [ ] 0.3 Measure how often two appends to `executions.ndjson` at once lose a row, with the
      ranks a role runs appending together. Record the result in `design.md`. If rows are lost
      often enough to matter, give the append a retry on a refused write: a lost `pre-worker`
      row undercounts, and a lost `outage` row lets an outage's failures count

## 1. The agreement

- [x] 1.1 `work-claiming`: only a tracker or code host failing counts as the surface failing; a
      failure before the worker that repeats three times sets the item down; two identical ones
      on different items in a row end the cycle
- [x] 1.2 `design.md`: the count rebuilt from `executions.ndjson`, what "identical" means, how an
      outage is excluded, and where the set-down is said

## 2. Which surface failed

- [ ] 2.1 In `runItem`, pass `execute` the tracker, code host and tree provider through wrappers
      that tag an error thrown out of any call with `tracker`, `code-host` or `tree`. An untagged
      error is `igor`
- [ ] 2.2 `execute` reports, with a failure it returns rather than throws, the source of the step
      that failed: `tracker`, `code-host`, `tree` or `igor`. A returned failure with no source is
      `igor`
- [ ] 2.3 Set `surfaceFailed` on a run only where the tag is `tracker` or `code-host`, in the
      claimed-run handler and in `takeClaim`'s claim window (whose calls are all the tracker's).
      Update the `surfaceFailed` doc comment in `ItemRun` and the comment above `abandon` in
      `src/serve.ts`, which say every throw counts
- [ ] 2.4 Tests, one per scenario in *Only a tracker or code host failing counts as the surface
      failing*: two items in a row failing to clone in different ways do not end the cycle; two
      failing on a tracker call do; two working-tree failures after the worker ran do not; two
      failures in the Igor's own code do not; a working-tree failure whose message names a
      GitHub API error is not a surface failure; a code-host failure after the worker ran
      counts; `igor run` stops on two tracker failures with different messages

## 3. The breaker

- [ ] 3.1 `provision` reports the path it made with a failure it throws, so the caller can mask
      it. A pure `signature(message, treePath)` applying the masks in `design.md` in order, a
      pure `signatureHash(signature)` giving the first twelve hexadecimal digits of its SHA-256
      (or its HMAC-SHA-256, if Adam takes open question 5's recommendation; the hash waits on it),
      and a pure `trailing(rows, item, role, source, hash)` counting as `design.md` *Counting*
      says. Tests for each mask, for each way the count stops, and for the outage exclusion
- [ ] 3.2 A `failure` handoff's `next` gains `'set-down'`, whose tail is, exactly, with `<N>` the
      number of identical failures in a row, 3 or more:

      ```
      It has failed the same way <N> times in a row before starting work, so it will not try again until somebody replies or edits this
      ```

      If `defer-a-closed-pull-request` (#141) has landed, `somebody` becomes `someone with write
      access`, so the sentence names what lifts a deferral as `work-triage` then states it. It
      may otherwise be reworded only to keep it true of that rule. An undirected handoff's "It
      will try again next cycle" becomes this sentence. A directed handoff, whose tail is its
      relabel sentence alone, gets this sentence first and keeps the relabel sentence after it
- [ ] 3.3 On the third identical failure in the claim window, whichever message `takeClaim`
      posts carries the same sentence: `claimWithdrawn`, right after "Nothing was done, so there
      is nothing to clean up.", or `claimStuck`, where the release did not clear the label, right
      after "Nothing was done.". Either way it comes before a directed claim's relabel sentence.
      Post it even where the claim message never landed, unless Adam's answer to the proposal's
      open question 2 says otherwise. This waits on open question 1: an `igor run` can join any
      role as rank 0 (Adam, 2026-10-18, #179), so no role is known to run one process
- [ ] 3.4 In `runItem`, on a failure before the worker (a refused claim window, a throw raised
      before `execute` spawned the worker, or a failure `execute` returns before spawning it;
      #101's `workerless` mark on a run row tells that last kind apart from a worker that
      started and produced nothing): build the signature, ask the count reader for the
      trailing count, and on a count of 3 or more including this one, unless the failure
      records a cure key, return `handed-off` with `handoff: 'failure'` and the set-down tail.
      Otherwise refuse: give the claim back with the refusal. This turns a failure `execute`
      returns, which the in-force code hands off and defers at once, into a refusal (the
      proposal's open question 6). A count reader that throws or is absent counts as 0, and the
      `pre-worker` row is still written. Where a role runs several ranks under #179, only the
      rank holding the claim does any of this; a rank that another rank's claim outranks drops
      out silently, writing no `pre-worker` row. Rank 0, `igor run`'s, is one of those ranks.
      In the claim window this waits on open question 1
- [ ] 3.5 The threshold is a named constant, 3, with a comment saying why three
- [ ] 3.6 Tests, one per scenario in *A failure before the worker that repeats sets the item
      down*, including a restart (a fresh loop reading the same rows) and a deferral lifted by
      a reply followed by an identical failure

## 4. The record

- [ ] 4.1 Append a `kind: 'pre-worker'` row for each failure before the worker, with `item`,
      `role`, `rank`, the cycle's start as `cycle`, `source` and `hash`, and no text from the
      failure, wherever a run is recorded: `serve`'s event handler, and the two loops of `igor
      run`'s cycle in `src/cli.ts`, over the items it claims and over its catch-ups. Write the
      failure to the process's own log as one line, in the form `design.md` gives, with its
      masked and raw messages. Tests check that no part of the raw or masked message reaches
      the row, and that a message holding a newline and a quote stays on one escaped line. A
      failure that records one of #101's cure keys keeps its ordinary run row, with its
      `cures`, so #101's conditions still see it, and writes no `pre-worker` row. A failure
      `execute` returns keeps its run row too, which #101's code marks `workerless`, so #101's
      probe, the one item it lets through to test whether a fault has cleared, still ends on
      it. *Counting* reads #101's `workerless` mark; no second marker is added
- [ ] 4.2 Each cycle, `serve`'s and `igor run`'s, appends a `kind: 'outage'` row when it ends on
      two surface failures, with `role`, `rank`, the cycle's start as `since`, and every item
      whose run failed before the worker in that cycle, as `design.md` says
- [ ] 4.3 Supply the count reader through `wiring.ts`: it reads `executions.ndjson` with `readLog`
- [ ] 4.4 Check that every reader of `executions.ndjson` that counts runs skips `pre-worker` and
      `outage` rows. #101's `stuck-conditions` requires readers to skip rows carrying a `kind`,
      and its task 2.3 builds that
- [ ] 4.5 One function, which `serve`'s cycle and the single cycle `igor run` runs in
      `src/cli.ts` both call, applies both two-in-a-row rules: it ends the cycle on two surface
      failures in a row, and on two runs in a row, of different items, that fail before the worker
      with the same source and hash. It keeps the previous run's item, source, hash and
      whether it was a surface failure, for the cycle only. Move `serve`'s surface-failure count
      into it, so `igor run` gains the surface rule. A cycle that ends on two surface failures
      appends the `outage` row of 4.2; one that ends on two identical failures appends an
      `outage` row naming only those two items. Where the two identical failures are also
      surface failures, the cycle ends on the surface rule and writes 4.2's row. A rank that
      drops out because another rank holds the item leaves the previous run in place
- [ ] 4.6 Tests through both `serve` and `igor run`: one per scenario in *Two identical failures
      before the worker on different items end the cycle* (the cycle ends and neither count
      moves; different failures continue and both count; an item alone in its cycle counts once),
      and two tracker failures in a row with different messages ending the cycle

## 5. After #101 merges

- [ ] 5.0 Add `specs/work-discovery/spec.md` to this change, restating #101's watermark
      requirement, *Watermarks reduce reconsideration without governing it*, once it is in
      force. That requirement lists why a
      cycle does not take an item (budget, a condition, no answer to the claim), and the
      watermark does not advance past an item left untaken for one of those reasons. A cycle
      ended by either two-in-a-row rule leaves its remaining items untaken too, and the watermark
      must not pass them either (Adam, 2026-10-17): two identical failures before the worker on
      different items, or two surface failures in a row. The file holds a `MODIFIED` block,
      copied whole from the requirement as it is in force when this task is done, including any
      edit #106 (`role-keyed-watermark`, which keys the watermark by role) or #179
      (`concurrent-instances`) has made to it. Every reason for holding the mark back lives in
      that one requirement, which #179 cites (Adam, 2026-10-18). The block names these two
      reasons and adds these two scenarios, which may be reworded to match #101's text:

      ```markdown
      #### Scenario: An item a cycle never reached after two identical failures is seen again

      - **WHEN** a cycle decides to work three items, and the first two fail before the worker
        with the same failure, so the identical-failure rule ends the cycle
      - **THEN** the next cycle reconsiders the third

      #### Scenario: An item a cycle never reached after an outage is seen again

      - **WHEN** a cycle decides to work three items, and the first two each end in a tracker or
        code-host failure, so the surface-failure rule ends the cycle
      - **THEN** the next cycle reconsiders the third
      ```

## 6. Close

- [ ] 6.1 `npm test` passes; `openspec validate pre-worker-breaker --strict` passes
- [ ] 6.2 Gate two closes #155
