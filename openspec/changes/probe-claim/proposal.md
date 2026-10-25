# Exactly one Igor takes a due probe

## Decisions

1. **Adopt *Exactly one Igor takes a due probe, decided by the log after it writes*** as a new
   `stuck-conditions` requirement. It adds to the in-force probe rules and modifies none of them.
2. **The oldest unended probe row decides, in the order a fresh read of the log returns rows, read again after a settle interval.** An Igor
   that finds the probe due appends its probe row, waits until any append that could land ahead
   of it has landed, reads the log again, and takes the item only when its own row is the oldest
   probe row that has not ended. This is #226's suggested fix with two corrections: a void names
   its row rather than its item (decision 3), and the read waits a settle interval rather than
   come at once (this decision). It orders by
   the store's sequence and uses no conditional write, as `work-claiming` already requires of
   claims, and lets the earliest row decide, as #179 does among one role's processes. *Rejected:* a conditional append from the read that decided,
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
5. **An item that would probe several conditions probes them one at a time, in key order, and is
   taken only where its rows decide for all of them** (Adam, 2026-10-24, replacing bids for every
   key at once); its rows are otherwise all voided. Bidding for every key at once let two Igors
   each win one key and void both without end; bidding in one shared order leaves only the
   holder of the first key bidding for the second.
6. **A lapse is judged alike by every Igor in the scope, from the log.** Otherwise Igors disagree on
   the oldest unended row. This change decides only that property; it does not choose the lapse
   rule. The code on `main` lapses a row older than `SWEEP_AFTER_MS`, the worker's run ceiling
   plus an hour, counted from the timestamp in the row, which every Igor reads alike, and this
   change leaves that rule as it is. #179 removes that ceiling, and Adam decided on 2026-10-24
   that #179's task 4.9 replaces the rule with a keepalive: the Igor working a probe item
   appends a row naming its probe row every poll interval of its own role, and the probe lapses
   once 90 minutes, three times #179's 30-minute maximum poll interval, pass with no such row.
   A process of any role can judge that lapse from the log alone. A rank's heartbeat, the rule
   #179 first had, could not be judged that way, since a process sees only its own role's
   heartbeat files.
7. **A TLA+ model, `model/ProbeClaim.tla`, proves the requirement**, with one negative
   configuration per rule, run by `.github/workflows/tla-probe-claim.yml`.
8. **A lapse that compares a log timestamp with a reader's clock allows 5 minutes of clock
   skew** (2026-10-24, at Adam's request to bound the skew; the figure is this change's choice).
   Every lapse rule's bound must cover it, so no Igor reads a live Igor's row as lapsed while
   the hosts' clocks agree within 5 minutes, as NTP keeps them. Hosts further apart are outside
   what the requirement covers; the model holds no clocks.

9. **The append deadline and the probe settle interval are fixed in code** (Adam, 2026-10-24),
   an exception to `role-config`'s rule that every interval is configurable. An Igor's probe settle interval has to outlast every other Igor's append deadline, not only its own; were either configurable, one Igor's settle interval could end while another's append is still within its deadline. The deadline is set from this change's task 4.1, a
   measurement of an append. The settle interval is the longer of twice the deadline and the
   deadline plus 5 minutes (Adam, 2026-10-24, amending "twice the deadline"): twice is a margin
   chosen because a probe is rare, so the wait costs little. The 5 minutes cover the clock skew
   the requirement assumes: at midnight a slow host's clock can stamp a row it begins up to 5 minutes after another Igor's row landed with a time before midnight, filing it in the earlier day's partition, ahead of that row; such a row lands within the deadline, so it has landed once the deadline plus 5 minutes have passed.
10. **The append deadline applies to probe rows only** (Adam, 2026-10-24). Every other append
    to the log, a void row's included, has no deadline; once #179 archives, its rule that a
    conflicted state write is retried until it succeeds applies to them, and it is met once
    #179's code, which builds that retry, is built. Until then, a void row whose append fails is not retried, and its probe row holds the scope until
    it lapses.
11. **This change stays second in #204's archive order** (Adam, 2026-10-24). Issue #204 sets
    the order in which open changes archive. First is #101, already archived, so this change is
    the first still open, and so this fix to a rule in force waits behind no change it does not
    depend on.

**Still open:**

- **Whether to accept the midnight gap.** A probe-row write the store accepts after its Igor gave up
  on it can, at midnight only, land ahead of a row already read as deciding and give a second
  probe (`design.md`, *The settle interval, and its one gap*). *Recommended:* accept it, since it
  needs a write the store accepts after its deadline, at midnight, while two Igors race for one
  probe. Revisit the conditional append if it is ever seen.
- **The midnight gap is written into the requirement's scope** while the item above asks
  whether to accept it. If Adam rejects it, the exception goes, and the requirement then has to
  cover that write too, which needs a mechanism such as the conditional append decision 2
  rejects.
- **Fixes the authors still owe, found by a consistency read on 2026-10-24.** None is a
  decision, and none blocks review of the rules:
  - The in-force scenario *A probe is taken once* speaks of "a row saying it is taking the
    probe", which this change's terms make a bid; the wording should say so.
  - Decision 2's rejection of the conditional append cites a compare-and-set that
    `appendRecord`'s own write already relies on, so its reason needs restating. The rejection
    stands: #179 retries `appendRecord`'s compare-and-set, while a conditional append from the
    deciding read could not be retried without losing the read it is conditional on.
  - Nobody has measured that GitHub's contents API returns every write another client had
    landed; the settle interval assumes it, and task 4.2 measures it.

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
  takes no item and voids its row. An item that would probe several conditions bids for them one at
  a time, in key order, and is taken only where its rows decide for all of them.
- A probe row's append gets a deadline, and the read that decides bypasses the cache of past days
  and fails where any partition read fails.
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
