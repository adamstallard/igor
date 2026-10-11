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

- **Making the threshold configurable.** Three is a constant, chosen as #101's credential
  threshold was: one trips on a blip, two can be coincidence.
- **Catch-ups the code host settles on its own.** They take no claim and post nothing, so there
  is nothing to repeat. A catch-up that escalates into a claimed run is covered like any other.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-claiming`: a failure before the worker that repeats three times sets the item down, two
  identical ones on different items in a row end the cycle, and only a tracker or code-host
  failure counts as the surface failing. Both are added as
  requirements of their own rather than as changes to *A claim that cannot be kept is given back,
  out loud*, which `one-claiming-surface` also modifies.

## Impact

- `src/loop.ts`: `runItem` attributes a throw to the surface whose call threw, builds the
  failure's signature, asks how many identical failures precede it, and hands the item back on
  the third. Its claim-window path does the same for a refused claim.
- `src/claiming.ts`: the claim withdrawal carries the set-down sentence on the third failure.
- `src/handoff.ts`: a `set-down` tail for a failure handoff.
- `src/serve.ts`: ends a cycle on two identical failures before the worker on different items in
  a row, and appends an outage row whenever it ends a cycle, naming the items it covers.
- `src/wiring.ts`, `src/cli.ts`: write a row for each failure before the worker, and supply the
  count reader.
- Readers of `executions.ndjson`: any that counts runs skips rows carrying a `kind`, the rule
  #101 states too. The spend readers in `src/budget.ts` only sum cost, which a row without one
  leaves unchanged.
- `src/deferred.ts`: no change. The breaker defers through the existing handoff path.
