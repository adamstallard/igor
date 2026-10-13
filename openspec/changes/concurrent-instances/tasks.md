## 1. Rank

- [ ] 1.1 `igor serve <role>.<rank>` takes the rank from its argument; `igor serve <role>` is rank 1
- [ ] 1.2 Declare the roster in configuration, and refuse to start on a rank outside it
- [ ] 1.3 The unit runs as `igor@<role>.<rank>`, passes the instance to `igor serve`, and reads
      `/etc/igor/<role>.env` for the App's credentials; how it names that file waits on the
      design's open question 1, whose third option renames the unit
- [ ] 1.4 Tests: no suffix, declared, undeclared, and the message naming what is declared

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
- [ ] 4.4 Every cycle is recorded on the state branch with its role and rank, and a claim whose
      rank has recorded no cycle for three of its role's poll intervals is adoptable; where the
      record goes waits on the design's open question 3
- [ ] 4.5 Working trees are named by role and rank, and the startup sweep removes those of its
      own rank and of undeclared ranks, never by age
- [ ] 4.6 Remove `ABSOLUTE_CEILING_MS`, the worker's kill at it, and the failure reason that names it
- [ ] 4.7 `docs/architecture.md` §6.7.2 pins the sweep threshold to that ceiling; restate it
- [ ] 4.8 Tests for each of 4.1–4.4, and that the bound never shortens a run, which waits on the
      design's open question 3

## 5. State

- [ ] 5.1 `discovery.json` and `deferred.json` become logs replayed on read
- [ ] 5.2 A discovery line carries its rank; the replayed mark per source is the lowest of each
      counted rank's latest
- [ ] 5.3 A rejected write re-reads and re-appends rather than reissuing its bytes
- [ ] 5.4 A conflict is not reported as a failed cycle
- [ ] 5.5 Tests: concurrent writers both survive; a retry preserves the winner's record; a
      lagging rank holds the mark down until it stops counting

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, and the roster
- [ ] 6.2 `docs/deployment.md` already says `TimeoutStopSec` bounds how long shutdown waits and
      not whether the item finishes. Add what follows for ranks: an item that outlives it is
      recovered by the same rank when it restarts, or by any process once that rank leaves the
      roster or passes the abandonment bound
