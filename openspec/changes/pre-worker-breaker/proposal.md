## Decisions

1. **A breaker per item** (Adam, 2026-10-11). Today a failure before the worker is refused: the
   claim is given back and the item is tried again next cycle. On the third identical failure in
   a row, the item is instead handed back deferred, or *set down*, and that run's message says
   the Igor has stopped retrying and what brings the item back. *Rejected:* a configurable
   threshold. Three is a constant, as in #101 (about to merge), whose stops open on the third
   recurrence: one trips on a blip, two can be coincidence.
2. **The count is rebuilt from `executions.ndjson`**, one `kind: "pre-worker"` row per failure.
   *Rejected:* a count in memory, which a restart loses; and a store of its own, which two Igors
   can overwrite and which can disagree with the log (`design.md`).
3. **Identical means the same source and the same masked message.** The source is which
   surface's call threw. *Rejected:* the source alone, and the raw message, which names a
   temporary path that differs every run. *Accepted risk* (Adam, 2026-10-11): `HTTP 404` and
   `HTTP 500` from the same call count as identical.
4. **Only a tracker or code-host failure counts toward the surface-failure rule**, which ends a
   cycle on two such failures in a row (Adam, 2026-10-11). Which surface failed is known from
   which surface's call threw. *Rejected:* reading it from the
   error's wording.
5. **Two identical failures before the worker, on different items in a row, end the cycle**
   (Adam, 2026-10-11), and neither counts toward its item's breaker.
6. **After a deferral lifts, one identical failure sets the item down again** (Adam,
   2026-10-11), not three. The answer that lifted it did not cure the failure.
7. **An item alone in its cycle counts a failure every item would meet, once per cycle** (Adam,
   2026-10-11). With one run, nothing tells the item's failure from the environment's.
8. **The deferral lifts by `work-triage`'s existing rule**, with no rule of its own.
9. **Both cycles apply decision 5: `serve`'s and the one `igor run` runs.** The coordinating
   agent chose this on 2026-10-11, for Adam to overrule.

**Still open:**

- **The set-down is posted before the run is known to be excluded.** Whether a failure is part
  of an outage, or of two identical failures on different items, is known only after the next
  run. An item with two genuine failures behind it is set down by the first failure of an
  outage, though both the surface-failure rule and decision 5 say that failure does not count. *Recommendation:* accept and record it; the item
  comes back when answered, and the alternative, holding the decision until the next run, was
  rejected because a crash between items loses it.
- **A fact about the Igor sets an item down.** #101's change, `condition-backoff`, says in its
  `work-triage` delta that an item SHALL NOT be suppressed where the cause was a fact about the
  Igor, such as a seat whose token is unset. A full disk, an expired clone token or an unset
  token met alone in three cycles sets the item down here. *Recommendation:* a failure #101
  records as a condition (a fault in the Igor's own configuration, recognised by its cure key,
  that stops the Igor or its seat rather than the item) never counts toward the breaker, and the
  remaining alone-in-cycle cost stays accepted (decision 7).
- **`igor run` has no surface-failure rule.** Decision 9 gives it the identical-failure rule
  only. Its cycle never stops on two tracker failures, so
  during an outage, tracker failures whose messages differ count toward each item's breaker.
  *Recommendation:* the one comparison function (task 4.5) applies both two-in-a-row rules, in
  both cycles.
- **The masks are unmeasured.** Nobody has checked that real repeated failures give one
  signature after masking (task 0.1). If they never match, the breaker never trips, which is
  today's behaviour.
- **The set-down sentence names what lifts a deferral.** #141, which lets only someone with
  write access lift a deferral, changes that sentence if it lands first (task 3.2).

## Why

When a claimed run fails **before the worker starts**, the item is refused and tried again next
cycle ([#155](https://github.com/adamstallard/igor/issues/155)). Examples are a clone that fails,
a branch that cannot be set up, a full disk, or a tracker call during the claim. Retrying such a
failure is cheap, so nothing defers the item. The deferral record holds only failures after the
worker was paid for.

A deterministic failure therefore repeats forever. Every poll claims the item (its `igor:<role>`
label and a claim comment), fails, posts a handoff ending "It will try again next cycle", and
releases. Nothing remembers that the item failed the same way last cycle.

There is a second effect. Every throw out of a claimed run is marked as a surface failure, and
`serve` ends the cycle on the second in a row. A clone failure on one item is not the tracker
failing, but it counts as if it were. If that item sorts first, a real outage then ends the
cycle one item early.

## What Changes

**A breaker per item (Adam, 2026-10-11).** The Igor counts an item's failures before the worker,
in a row. On the third identical one it hands the item back deferred instead of refusing it, and
the message it posts on that run says it has stopped retrying and what brings the item back. The
first two failures are retried as today.

- **The count is rebuilt from the execution log.** It is not kept in a store of its own, so it
  survives a restart. Each failure before the worker appends one row to `executions.ndjson`,
  the same log [#101](https://github.com/adamstallard/igor/pull/101)'s conditions are rebuilt
  from (`design.md`).
- **Identical means the same source and the same message.** The source is the tracker, the code
  host, the working tree or the Igor's own code. The message is compared with its variable parts
  masked: numbers, hashes and the tree's temporary path.
- **In a row means nothing broke the sequence.** A run of the item that reached the worker, or a
  failure before the worker that was not identical, starts the count again. An edit or a reply
  does not. So once a deferral lifts, an identical failure sets the item down again at once.
- **An outage is not the item's failure.** A failure in a cycle that the outage rule then ended
  does not count toward any item's breaker.
- **The deferral lifts as any handed-back item's does.** That rule is `work-triage`'s *An item
  handed back is not re-worked until something answers*. The breaker adds no rule of its own,
  so [#141](https://github.com/adamstallard/igor/pull/141)'s "only a writer lifts a deferral"
  applies here once it lands.

**Only a tracker or code-host failure is a surface failure (Adam, 2026-10-11).** The cycle's
two-in-a-row rule counts a run only where a call to the tracker or the code host failed. A
failure in the working tree or in the Igor's own code does not count. Which call failed is known
from which surface's call threw, not read from the error's wording.

**A failure every item meets ends the cycle (Adam, 2026-10-11).** When two runs in a row, of
different items, fail before the worker identically, as a full disk or an expired clone token
makes them, the cycle ends and neither failure counts toward its item's breaker. An item alone in
its cycle counts such a failure once. Without this, every item would be claimed and posted on
three times and then set down, and stay down after the cause was fixed.

Out of scope:

- **Catch-ups the code host settles on its own.** They take no claim and post nothing, so there
  is nothing to repeat. A catch-up that escalates into a claimed run is covered like any other.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-claiming`: a failure before the worker that repeats three times sets the item down, two
  identical ones on different items in a row end the cycle, and only a tracker or code-host
  failure counts as the surface failing. Modifying the in-force *A claim that cannot be kept is
  given back, out loud* would mean restating its whole text, so all three are added as
  requirements of their own.

## Impact

- `src/loop.ts`: `runItem` attributes a throw to the surface whose call threw, builds the
  failure's signature, asks how many identical failures precede it, and hands the item back on
  the third. Its claim-window path does the same for a refused claim.
- `src/claiming.ts`: the claim withdrawal carries the set-down sentence on the third failure.
- `src/handoff.ts`: a `set-down` tail for a failure handoff.
- `src/serve.ts`: ends a cycle on two identical failures before the worker on different items in
  a row, and appends an outage row whenever it ends a cycle, naming the items it covers.
- `src/cli.ts`: its single cycle ends on the same two failures and appends the same outage row.
- `src/wiring.ts`, `src/cli.ts`: write a row for each failure before the worker, and supply the
  count reader.
- Readers of `executions.ndjson`: #101's `stuck-conditions` requires every reader that counts
  runs to skip rows carrying a `kind`, and its task 2.3 makes the readers do so. The two kinds added here rely on that rule.
- `src/deferred.ts`: no change. The breaker defers through the existing handoff path.
