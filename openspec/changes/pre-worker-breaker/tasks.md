## 0. Before building

- [ ] 0.1 Capture real failure messages, each twice on separate runs: a clone on a full disk, a
      clone with an expired token, a catch-up merge that fails, and a tracker call answered 5xx.
      Check that each pair gives one signature after `design.md`'s masks and that different
      causes give different ones, and record the captures in `design.md`. If a pair does not
      match, change the masks; a breaker whose signatures never match never trips, and every
      failure is retried as in the in-force code.
      Check too that a tracker call answered 404 and one answered 500 give different
      signatures. Also capture a clone whose token mint the code host refuses because the App's
      credential is refused. Record whether, during the run of the item whose clone failed, the
      failure reaches #101's App condition and so records a cure key. Also capture a clone the
      code host does not answer, and record how the tree provider can tell it from a clone the
      code host refused: git exits 128 for both
- [ ] 0.2 Sections 2 to 4 wait until `condition-backoff` (#101) merges (Adam, 2026-10-18), and
      until #213's redaction function merges (pull request #217; Adam, 2026-10-20). Tasks 3.1
      and 4.1 call that function
- [ ] 0.3 Check that #179's retry of a refused write to a state file more than one process
      writes covers appends to `executions.ndjson`, with the ranks a role runs appending
      together. Record the result in `design.md`. If it does not, report it to #179: a lost
      `pre-worker` row of a matching failure undercounts, a lost run row of a worker start or a
      lost row of a different failure joins the failures on either side of it into one count
      (`model/findings/LateRows.cfg`), and a lost `outage` row lets an outage's failures count
- [x] 0.4 Make the model match Adam's answers to its three findings (2026-10-20): `SetDownOnce`
      TRUE in every configuration but its negative, `negative/NoSetDownOnce.cfg`, with
      `NoDoubleSetDown` checked in every configuration CI runs; `findings/LateRows.cfg` kept as
      an accepted limit; `findings/WithdrawRace.cfg` kept to show what `AtomicWithdraw`, #179's
      mechanism, rests on. Also `IgorPostsLiftNothing`, the lifting rule, with
      `NoSetDownWithoutAnswer` and `negative/NoIgorPostsLiftNothing.cfg`

## 1. The agreement

- [x] 1.1 `work-claiming`: only a tracker or code host failing counts as the surface failing; a
      failure before the worker that repeats three times sets the item down; two identical ones
      on different items in a row end the cycle
- [x] 1.2 `design.md`: the count rebuilt from `executions.ndjson`, what "identical" means, how an
      outage is excluded, and where the set-down is said
- [x] 1.3 `model/PreWorkerBreaker.tla`, a TLA+ model of the breaker across ranks, with its
      configurations, negatives and findings, and `.github/workflows/tla-pre-worker-breaker.yml`,
      which runs TLC on them (`design.md`, *What the model proves*)

## 2. Which surface failed

- [ ] 2.1 In `runItem`, pass `execute` the tracker, code host and tree provider through wrappers
      that tag an error thrown out of any call with `tracker`, `code-host` or `tree`, and with
      its HTTP status or exit code and whether the surface answered, as `passesMark` reads a
      status (`design.md`). An untagged error is `igor`. A clone the code host did not answer is
      tagged `code-host`, by what task 0.1 finds; a failed token mint inside a clone stays
      `tree`
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
      token and a URL's credentials stripped before the masks run, for each way the count stops,
      for a `cured` row skipped, and for the outage exclusion
- [ ] 3.2 A `failure` handoff's `next` gains `'set-down'`, whose tail is, exactly, with `<N>` the
      number of identical failures in a row, 3 or more:

      ```
      It has failed the same way <N> times in a row before starting work, so it will not try again until somebody replies or edits this
      ```

      If `defer-a-closed-pull-request` (#141) has landed, `somebody` becomes `someone with write
      access`, so the sentence names what lifts a deferral as `work-triage` then states it. It
      may otherwise be reworded only to keep it true of *What lifts a set-down* (Adam approved the
      sentence as written, 2026-10-20). An undirected handoff's "It
      will try again next cycle" becomes this sentence. A directed handoff, whose tail is its
      relabel sentence alone, gets this sentence first and keeps the relabel sentence after it.
      In place of the raw error message the in-force handoff quotes, a set-down's post names the
      failure from the row's `source` and status, such as "Setting up the working tree failed
      (exit code 128)", and quotes no part of the message (Adam, 2026-10-20). That example may be
      reworded
- [ ] 3.3 On the third identical failure in the claim window, whichever message `takeClaim`
      posts carries the same sentence: `claimWithdrawn`, right after "Nothing was done, so there
      is nothing to clean up.", or `claimStuck`, where the release did not clear the label, right
      after "Nothing was done.". Either way it comes before a directed claim's relabel sentence.
      Post it even where the claim message never landed (Adam, 2026-10-19). Count the failure,
      and post the set-down, only where the item carries no claim message of another rank of
      the role that counts under #179's rules (Adam, 2026-10-19); where it carries one, or where
      the read of the claim messages fails, count nothing, post nothing and leave the role's
      label on the item (Adam, 2026-10-20). The withdrawal releases only claim messages posted
      before that test, by the mechanism #179 decides (Adam, 2026-10-20). Tests for each case,
      and for a set-down posted where the claim message never landed
- [ ] 3.4 In `runItem`, on a failure before the worker (a refused claim window, a throw raised
      before `execute` spawned the worker, or a failure `execute` returns before spawning it;
      #101's `workerless` mark on a run row tells that last kind apart from a worker that
      started and produced nothing): build the signature, ask the count reader for the
      trailing count, and on a count of 3 or more including this one,
      unless 4.5's function says this run is the second of two that end the cycle, and unless the failure
      records a cure key, return `handed-off` with `handoff: 'failure'` and the set-down tail.
      Otherwise refuse: give the claim back with the refusal. This turns a failure `execute`
      returns, which the in-force code hands off and defers at once, into a refusal (the
      proposal's decision 26, Adam, 2026-10-19). A count reader that throws or is absent counts as 0, and the
      `pre-worker` row is still written. Where a role runs several ranks under #179, only the
      rank holding the claim does any of this; a rank that another rank's claim outranks drops
      out silently, writing no `pre-worker` row. Rank 0, `igor run`'s, is one of those ranks.
      In the claim window, 3.3's test of the item's claim messages decides instead. Before
      posting a set-down, read the item's record in `deferred.json`; where it holds a set-down by
      this role that has not lifted, post no set-down, and give the claim back with the refusal,
      leaving out its "It will try again next cycle" (Adam, 2026-10-20). `deferred.json` is
      keyed by item alone, so a set-down's record names its role
- [ ] 3.5 The threshold is a named constant, 3, with a comment saying why three
- [ ] 3.6 Tests, one per scenario in *A failure before the worker that repeats sets the item
      down*, including a restart (a fresh loop reading the same rows) and a deferral lifted by
      a reply followed by an identical failure
- [ ] 3.7 A set-down's record in `deferred.json` says it is a set-down. The check that decides
      whether a deferral has lifted lifts a set-down only on a person's reply or edit, or on
      another role's successful run on the item, such as a pull request that role opened for it;
      an Igor's other posts and label edits lift nothing (Adam, 2026-10-20). Decide how a role
      tells another role's successful run from its other posts, and record it in `design.md`

## 4. The record

- [ ] 4.1 Append a `kind: 'pre-worker'` row for each failure before the worker, with `item`,
      `role`, `rank`, `held`, the cycle's start as `cycle`, `source`, `httpStatus` or
      `exitCode`, `cured`, and the fingerprint of 3.1, and no message text, wherever a run is
      recorded: `serve`'s event handler, and the two loops of `igor
      run`'s cycle in `src/cli.ts`, over the items it claims and over its catch-ups, and
      `igor run --claim`'s catch-up path, which must also defer a set-down item. Write the full
      message, after #213's redaction, to the process's own log. Tests check that no part of the
      message reaches the row, and that a token and a URL's credentials do not reach the log. A
      failure that records one of #101's cure keys writes its `pre-worker` row with `cured:
      true`, and keeps its ordinary run row, with its `cures`, so #101's conditions still see
      it. A failure
      `execute` returns keeps its run row too, which #101's code marks `workerless`, so #101's
      probe, the one item it lets through to test whether a fault has cleared, still ends on
      it. *Counting* reads #101's `workerless` mark; no second marker is added
- [ ] 4.2 Each cycle, `serve`'s and `igor run`'s, appends a `kind: 'outage'` row when it ends on
      two surface failures, with `role`, `rank`, the cycle's start as `since`, every item whose
      run failed before the worker in that cycle as `items`, and as `failures` each named
      failure's fields from 4.1, with no message text, as `design.md` says
- [ ] 4.3 Supply the count reader through `wiring.ts`: it reads `executions.ndjson` with `readLog`.
      `readLog` reports a failed listing of the day files and each day file it failed to read
      (in the in-force code `listPartitions` and `readStateRaw` return an empty result for either), and the count
      reader treats such a read as one that failed, so the run sets nothing down
- [ ] 4.4 Check that every reader of `executions.ndjson` that counts runs skips `pre-worker` and
      `outage` rows. #101's `stuck-conditions` requires readers to skip rows carrying a `kind`,
      and its task 2.3 builds that
- [ ] 4.5 One function, which `serve`'s cycle and the single cycle `igor run` runs in
      `src/cli.ts` both call, applies both two-in-a-row rules: it ends the cycle on two surface
      failures in a row, and on two runs in a row, of different items, that fail before the worker
      with the same source and message. It keeps the previous run's item, source, message and
      whether it was a surface failure, for the cycle only. Move `serve`'s surface-failure count
      into it, so `igor run` gains the surface rule. A cycle that ends on two surface failures
      appends the `outage` row of 4.2; one that ends on two identical failures appends an
      `outage` row naming only those two items. Where the two identical failures are also
      surface failures, the cycle ends on the surface rule and writes 4.2's row. A rank that
      drops out because another rank holds the item, and a run that records a cure key, leave
      the previous run in place
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
- [ ] 6.3 In the commit that archives this change, point
      `.github/workflows/tla-pre-worker-breaker.yml`'s paths and working directory at the
      archived change's `model/`, or the archive's push runs the workflow against a directory
      that no longer exists
