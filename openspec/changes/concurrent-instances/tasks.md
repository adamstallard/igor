## 1. Rank

- [ ] 1.1 Read `IGOR_RANK` from the environment, defaulting to 1
- [ ] 1.2 Declare the roster in configuration, and refuse to start on a rank outside it
- [ ] 1.3 `EnvironmentFile=-/etc/igor/%i.env` in the unit, so the supervisor supplies it
- [ ] 1.4 Tests: default, declared, undeclared, and the message naming what is declared

## 2. The marker

- [ ] 2.1 The claim message carries the rank as a machine-readable trailer
- [ ] 2.2 Parse it back, tolerating a message a person has edited around
- [ ] 2.3 Verification reads the claim with the lowest sequence key, not the earliest timestamp
- [ ] 2.4 `RawComment` and the adapter's comment shape carry the surface's sequence key
- [ ] 2.5 Tests: same-timestamp claims order; a sibling's claim is not our own

## 3. Contention

- [ ] 3.1 Candidates are attempted from an offset derived from rank
- [ ] 3.2 A contended item is re-read after `(rank - 1)` settle intervals, before claiming
- [ ] 3.3 Tests: no wait where candidates outnumber processes; a loser posts nothing

## 4. Recovery

- [ ] 4.1 A claim carrying this process's own rank is taken and the item re-worked
- [ ] 4.2 A claim carrying a declared rank that is not ours is left alone
- [ ] 4.3 A claim carrying an undeclared rank is adoptable
- [ ] 4.4 An unattended claim past the bound is adoptable
- [ ] 4.5 Derive the tree sweep from rank rather than age, and drop the age heuristic
- [ ] 4.6 Remove `ABSOLUTE_CEILING_MS`, which nothing depends on once recovery is by identity
- [ ] 4.7 `docs/architecture.md` §6.7.2 pins the sweep threshold to that ceiling; restate it
- [ ] 4.8 Tests for each of 4.1–4.4, and that the bound never shortens a run

## 5. State

- [ ] 5.1 `discovery.json` and `deferred.json` become logs replayed on read
- [ ] 5.2 A rejected write re-reads and re-appends rather than reissuing its bytes
- [ ] 5.3 A conflict is not reported as a failed cycle
- [ ] 5.4 Tests: concurrent writers both survive; a retry preserves the winner's record

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, and the roster
- [ ] 6.2 Note that `TimeoutStopSec` bounds a graceful shutdown, so a long item outliving it
      turns a planned scale-down into a recovery
