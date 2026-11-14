# Exactly one Igor takes a due probe

## Why

The in-force *A condition clears by not recurring, and a probe is what observes that* says that
after a cooldown "the affected scope SHALL take exactly one item". It does not hold with two
Igors in one scope, such as two roles on one seat. Both can read the log as
due before either one's probe row lands, and both then take an item. A bug-hunter run proved it
with a test that failed on `main` on 2026-10-24, and its reviewer could not refute it
([#226](https://github.com/adamstallard/igor/issues/226), candidate 4). Each time, a second item
is claimed and a worker spent against a fault that is probably still there.

## What Changes

- An Igor takes a due probe item only when a read of the log, made a settle interval after its own
  probe row landed, shows its row as the oldest unended probe row since the last occurrence.
- A probe row carries an identifier, and a void row ends only the row it names.
- An Igor whose row does not decide, whose read fails, whose claim is lost, or whose append failed
  takes no item and voids its row. An item that would probe several conditions bids for them one at
  a time, in key order, and is taken only where its rows decide for all of them.
- A probe row's append gets a deadline, and the read that decides reads every partition from
  yesterday on fresh
  and fails where any partition read fails.
- `model/` holds the TLA+ model and its configurations, and CI runs them.

## Capabilities

### Modified Capabilities

- `stuck-conditions`: adds eight requirements on who takes a due probe.

## Impact

- **Code:** `probeRunning` and `conditionOf` in `src/conditions.ts`; `probe` in `src/wiring.ts`
  and its callers in `src/serve.ts` and `src/cli.ts`; `appendRecord` and `readLog` in
  `src/state.ts`, for the append deadline and a read of every partition from yesterday on that
  bypasses the cache.
- **Other changes:** cites only requirements already in force and modifies none.
  [#204](https://github.com/adamstallard/igor/issues/204), which states the whole archive
  order, lists it second, just after #101 (already archived), so that it is not queued behind changes it
  has nothing to do with. #171 (`seat-files`) and #175 modify other `stuck-conditions` requirements that
  this change's requirements sit beside; `design.md` says how they fit.
