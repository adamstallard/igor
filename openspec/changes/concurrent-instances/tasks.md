## 1. Rank

- [ ] 1.1 `igor serve <role>.<rank>` takes the rank from its argument; `igor serve <role>` is rank 1
- [ ] 1.2 Declare the roster in configuration, and refuse to start on a rank outside it
- [ ] 1.3 In `deploy/igor.service`, which runs as `igor@<role>.<rank>`, replace
      `EnvironmentFile=/etc/igor/%i.env` and the `ExecStart` line with exactly this:

      ```ini
      ExecStart=/bin/sh -c 'role="$${1%%%%.*}"; set -a; . "/etc/igor/$${role}.env"; set +a; exec /usr/local/bin/igor serve "$$1"' igor %i
      ```

      systemd turns `$$` into `$` and `%%` into `%`, and `%i` into the instance, so `sh` runs
      `role="${1%%.*}"` with `$1` set to `generalist.2`. The App's credentials reach `igor` only
      through its environment. `sh`'s arguments are the script, the word `igor`, which `sh`
      takes as its `$0` and names itself by in errors, and the instance. Keep
      `EnvironmentFile=/etc/igor/env`, the shared file of seat tokens every role reads. Say in the unit's comment that the role's file must be
      valid shell
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
- [ ] 4.4 Every process overwrites `heartbeats/<role>.<rank>.json` on the state branch every poll
      interval, from a timer that keeps running while a worker runs, and a claim whose rank's
      heartbeat is older than three poll intervals is adoptable
- [ ] 4.5 Working trees are named by role and rank, and the startup sweep removes those of its
      own rank and of undeclared ranks, never by age
- [ ] 4.6 Remove `ABSOLUTE_CEILING_MS`, the worker's kill at it, and the failure reason that names it
- [ ] 4.7 `docs/architecture.md` §6.7.2 pins the sweep threshold to that ceiling; restate it to
      describe the sweep by rank
- [ ] 4.8 Tests for each of 4.1–4.4, and that the bound never shortens a run: a run longer than
      three poll intervals keeps its rank counted
- [ ] 4.9 A `condition-backoff` probe records its rank, and lapses when that rank misses three
      heartbeats instead of after `SWEEP_AFTER_MS`. PR #101 builds `condition-backoff` and is not
      merged: whichever of #101 and this build lands second makes this edit

## 5. State

- [ ] 5.1 `discovery.json` and `deferred.json` become logs replayed on read
- [ ] 5.2 A discovery line carries its rank; the replayed mark per source is the lowest of each
      counted rank's latest, or of every rank's latest when no rank counts
- [ ] 5.3 A rejected write re-reads and re-appends rather than reissuing its bytes
- [ ] 5.4 A conflict is not reported as a failed cycle
- [ ] 5.5 Tests: concurrent writers both survive; a retry preserves the winner's record; a
      lagging rank holds the mark down until it stops counting; with every rank gone, the lowest
      latest mark still applies

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, and the roster
- [ ] 6.2 `docs/deployment.md` already says `TimeoutStopSec` bounds how long shutdown waits and
      not whether the item finishes. Add what follows for ranks: an item that outlives it is
      recovered by the same rank when it restarts, or by any process once that rank leaves the
      roster or passes the abandonment bound
