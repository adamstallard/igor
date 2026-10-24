# Exactly one Igor takes a due probe

## Decisions

1. **Adopt *Exactly one Igor takes a due probe, decided by the log after it writes*** as a new
   `stuck-conditions` requirement. It adds to the in-force probe rules and modifies none of them.
2. **The first probe row the log accepted decides, read again after a settle interval.** An Igor
   that finds the probe due appends its probe row, waits until any append that could land ahead
   of it has landed, reads the log again, and takes the item only when its own row is the oldest
   probe row that has not ended. This is #226's suggested fix with two corrections, and it is the
   rule #179 adopts for claims. *Rejected:* a conditional append from the read that decided,
   because every write to the state branch, by any role, would refuse a pending probe append; a lock
   file per condition, because it is condition state stored apart from the log; a designated
   prober, because seat scopes span roles whose processes cannot see each other's heartbeats; the
   newest row deciding, because a stale re-read then gives two Igors the item. `design.md` gives
   each in full.
3. **A void row names its probe row, not its item.** Two processes of one role can pick the same
   item, and a void by item would end the winner's probe too. This corrects #226, which had a void
   end its item's probe.
4. **Every Igor whose row does not decide voids it, and so does one whose append failed or may
   have failed.** A row nobody is working would otherwise hold the scope until it lapses.
5. **An item that probes several conditions is taken only where its rows decide for all of them**,
   and its rows are otherwise all voided.
6. **A lapse is judged alike by every Igor in the scope, from the log.** Otherwise Igors disagree on
   the oldest unended row. `SWEEP_AFTER_MS` meets this. #179's lapse, when a probe's rank is gone,
   meets it only for a role-scoped condition: a process of another role on the same seat cannot
   see that rank's heartbeat. #179 already records that gap as a conflict with #101.
7. **A TLA+ model, `model/ProbeClaim.tla`, proves the requirement**, with one negative
   configuration per rule, run by `.github/workflows/tla-probe-claim.yml`.

**Still open:**

- **Whether to accept the midnight gap.** A probe-row write the store accepts after its Igor gave up
  on it can, at midnight only, land ahead of a row already read as deciding and give a second
  probe (`design.md`, *The settle interval, and its one gap*). *Recommended:* accept it, since it
  needs a write the store accepts after its deadline, at midnight, while two Igors race for one
  probe. Revisit the conditional append if it is ever seen.
- **The append deadline and the probe settle interval.** *Recommended:* fix both in code rather
  than configure them, with the deadline set from task 4.2's measurement and the settle interval
  twice the deadline. A probe is rare, so the wait costs little.

## Why

The in-force *A condition clears by not recurring, and a probe is what observes that* says that
after a cooldown "the affected scope SHALL take exactly one item". It does not hold with two
Igors in one scope: two roles on one seat, or two processes of one role. Both can read the log as
due before either one's probe row lands, and both then take an item. A bug-hunter run proved it
with a test that failed on `main` on 2026-10-24, and its reviewer could not refute it
([#226](https://github.com/adamstallard/igor/issues/226), candidate 4). Each time, a second item
is claimed and a worker spent against a fault that is probably still there. Adam decided on
2026-10-24 to fix it, spec first, with a TLA+ model.

## What Changes

- An Igor takes a due probe item only when a read of the log, made a settle interval after its own
  probe row landed, shows its row as the oldest unended probe row since the last occurrence.
- A probe row carries an identifier, and a void row ends only the row it names.
- An Igor whose row does not decide, whose read fails, whose claim is lost, or whose append failed
  takes no item and voids its row. An item probing several conditions is taken only where its rows
  decide for all of them.
- Appends get a deadline, and the read that decides bypasses the cache of past days.
- `model/` holds the TLA+ model and its configurations, and CI runs them.

## Capabilities

### Modified Capabilities

- `stuck-conditions`: adds one requirement on who takes a due probe.

## Impact

- **Code:** `probeRunning` and `conditionOf` in `src/conditions.ts`; `probe` in `src/wiring.ts`
  and its callers in `src/serve.ts` and `src/cli.ts`; `appendRecord` and `readLog` in
  `src/state.ts`, for the append deadline and a read that bypasses the cache of past days.
- **Other changes:** cites only requirements already in force, adds one no other change cites, and
  modifies none, so `openspec archive` puts no constraint on its place.
  [#204](https://github.com/adamstallard/igor/issues/204), which states the whole archive order,
  lists it second, just after #101 (already archived), so that it is not queued behind changes it
  has nothing to do with. #179 (`concurrent-instances`) changes how a probe row lapses, and
  #171 (`seat-files`) modifies the neighbouring requirements; `design.md` says how each fits.
