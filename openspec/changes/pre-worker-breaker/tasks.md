## 1. The agreement (gate one, this pull request)

- [x] 1.1 `work-claiming`: only a tracker or code host failing counts as the surface failing; a
      failure before the worker that repeats three times sets the item down
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
- [ ] 2.3 Tests: two items in a row failing to clone do not end the cycle; two failing on a
      tracker call do; a code-host failure after the worker ran counts

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
- [ ] 3.4 In `runItem`, on a failure before the worker (a refused claim window, or a throw with no
      worker output and nothing published): build the signature, ask the count reader for the
      trailing count, and on a count of 3 or more including this one, return `handed-off` with
      `handoff: 'failure'` and the set-down tail. Otherwise refuse as today. A count reader that
      throws or is absent counts as 0
- [ ] 3.5 The threshold is a named constant, 3, with a comment saying why three
- [ ] 3.6 Tests, one per scenario in *A failure before the worker that repeats sets the item
      down*, including a restart (a fresh loop reading the same rows) and a deferral lifted by
      a reply followed by an identical failure

## 4. The record

- [ ] 4.1 Append a `kind: 'pre-worker'` row for each failure before the worker, with `item`,
      `role`, `source`, `signature` and `reason`, wherever a run is recorded today: `serve`'s
      event handler and the single-cycle loops in `src/cli.ts`
- [ ] 4.2 `serve` appends a `kind: 'outage'` row when it ends a cycle on two surface failures,
      with `role`, the cycle's start as `since`, and the two runs' items
- [ ] 4.3 Supply the count reader through `wiring.ts`: it reads `executions.ndjson` with `readLog`
- [ ] 4.4 Every reader of `executions.ndjson` that counts runs skips rows carrying a `kind`. This
      is `condition-backoff`'s task 2.3 too; whichever lands first adds it. Today's spend
      readers only sum cost, which a row without one leaves unchanged, so check each rather
      than assume

## 5. Close

- [ ] 5.1 `npm test` passes; `openspec validate pre-worker-breaker --strict` passes
- [ ] 5.2 Gate two closes #155
