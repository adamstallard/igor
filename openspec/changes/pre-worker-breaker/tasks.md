## 0. Before building

- [ ] 0.1 Capture real failure messages, each twice on separate runs: a clone on a full disk, a
      clone with an expired token, a branch set up that fails, and a tracker call answered 5xx.
      Check that each pair gives one signature after `design.md`'s masks and that different
      causes give different ones, and record the captures in `design.md`. If a pair does not
      match, change the masks; a breaker whose signatures never match never trips, which is
      today's behaviour

## 1. The agreement (gate one, this pull request)

- [x] 1.1 `work-claiming`: only a tracker or code host failing counts as the surface failing; a
      failure before the worker that repeats three times sets the item down; two identical ones
      on different items in a row end the cycle
- [x] 1.2 `design.md`: the count rebuilt from `executions.ndjson`, what "identical" means, how an
      outage is excluded, and where the set-down is said

## 2. Which surface failed

- [ ] 2.1 In `runItem`, pass `execute` the tracker, code host and tree provider through wrappers
      that tag an error thrown out of any call with `tracker`, `code-host` or `tree`. An untagged
      error is `igor`
- [ ] 2.2 Set `surfaceFailed` on a run only where the tag is `tracker` or `code-host`, in the
      claimed-run handler and in `takeClaim`'s claim window (whose calls are all the tracker's).
      Update the `surfaceFailed` doc comment in `ItemRun` and the comment above `abandon` in
      `src/serve.ts`, which say every throw counts
- [ ] 2.3 Tests: two items in a row failing to clone in different ways do not end the cycle; two
      failing on a tracker call do; a code-host failure after the worker ran counts

## 3. The breaker

- [ ] 3.1 A pure `signature(source, message)` applying the masks in `design.md` in order, and a
      pure `trailing(rows, item, role, source, signature)` counting as `design.md` *Counting*
      says. Tests for each mask, for each way the count stops, and for the outage exclusion
- [ ] 3.2 A `failure` handoff's `next` gains `'set-down'`, whose tail is, exactly (the count is
      the threshold constant):

      ```
      It has failed the same way 3 times in a row before starting work, so it will not try again until somebody replies or edits this
      ```

      If `defer-a-closed-pull-request` (#141) has landed, `somebody` becomes `someone with write
      access`, so the sentence names what lifts a deferral as `work-triage` then states it. It
      may otherwise be reworded only to keep it true of that rule. A directed handoff keeps its
      relabel sentence
- [ ] 3.3 `claimWithdrawn` takes the same sentence, appended after "Nothing was done, so there is
      nothing to clean up." On the third identical failure in the claim window, post it even
      where the claim message never landed
- [ ] 3.4 In `runItem`, on a failure before the worker (a refused claim window, a throw raised
      before `execute` spawned the worker, or a failure `execute` returns before spawning it;
      `execute` reports whether it spawned the worker, so a worker that started and produced
      nothing is not counted): build the signature, ask the count reader for the
      trailing count, and on a count of 3 or more including this one, unless the failure
      records a cure key, return `handed-off` with `handoff: 'failure'` and the set-down tail. Otherwise refuse as today. A count reader that
      throws or is absent counts as 0
- [ ] 3.5 The threshold is a named constant, 3, with a comment saying why three
- [ ] 3.6 Tests, one per scenario in *A failure before the worker that repeats sets the item
      down*, including a restart (a fresh loop reading the same rows) and a deferral lifted by
      a reply followed by an identical failure

## 4. The record

- [ ] 4.1 Append a `kind: 'pre-worker'` row for each failure before the worker, with `item`,
      `role`, `source`, `signature` and `reason`, wherever a run is recorded today: `serve`'s
      event handler and the single-cycle loops in `src/cli.ts`. A failure that records one of
      #101's cure keys keeps the run row it writes today, with its `cures`, so #101's conditions
      still see it
- [ ] 4.2 Each cycle, `serve`'s and `igor run`'s, appends a `kind: 'outage'` row when it ends on
      two surface failures, with `role`, the cycle's start as `since`, and every item whose run
      failed in that cycle, before or after the worker, as `design.md` says
- [ ] 4.3 Supply the count reader through `wiring.ts`: it reads `executions.ndjson` with `readLog`
- [ ] 4.4 Check that every reader of `executions.ndjson` that counts runs skips `pre-worker` and
      `outage` rows. #101's `stuck-conditions` requires readers to skip rows carrying a `kind`,
      and its task 2.3 builds that
- [ ] 4.5 One function, which `serve`'s cycle and the single cycle `igor run` runs in
      `src/cli.ts` both call, applies both two-in-a-row rules: it ends the cycle on two surface
      failures in a row, and on two runs in a row, of different items, that fail before the worker
      with the same source and signature. It keeps the previous run's item, source, signature and
      whether it was a surface failure, for the cycle only. Move `serve`'s surface-failure count
      into it, so `igor run` gains the surface rule. A cycle that ends on two surface failures
      appends the `outage` row of 4.2; one that ends on two identical failures appends an
      `outage` row naming only those two items
- [ ] 4.6 Tests through both `serve` and `igor run`: one per scenario in *Two identical failures
      before the worker on different items end the cycle* (the cycle ends and neither count
      moves; different failures continue and both count; an item alone in its cycle counts once),
      and two tracker failures in a row with different messages ending the cycle

## 5. After #101 merges

- [ ] 5.0 Restate against #101's text: its `work-discovery` watermark requirement lists why a
      cycle does not take an item (budget, a condition, no answer to the claim), and the
      watermark does not advance past an item left untaken for one of those reasons. A cycle
      ended by two identical failures before the worker leaves its remaining items untaken too,
      and the watermark must not pass them either. Add a `MODIFIED` block that names this
      reason, copied whole from #101's requirement once it is in force

## 6. Close

- [ ] 6.1 `npm test` passes; `openspec validate pre-worker-breaker --strict` passes
- [ ] 6.2 Gate two closes #155
