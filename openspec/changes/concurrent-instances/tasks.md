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
- [ ] 2.6 A process that loses a claim to a process of its own role leaves the role's label in
      place
- [ ] 2.7 The re-read that verifies a claim comes within one poll interval of the claim message;
      a later re-read stands down without working the item
- [ ] 2.8 Tests: a same-role loser keeps the label on the item; a late verification stands down; a claim
      message from before a release does not count

## 3. Contention

- [ ] 3.1 Candidates are attempted from an offset derived from rank
- [ ] 3.2 A contended item is re-read after `(rank - 1)` settle intervals, before claiming
- [ ] 3.3 Tests: no wait where candidates outnumber processes; a loser posts nothing

## 4. Recovery

- [ ] 4.1 A claim whose earliest counted claim message carries this process's own rank is taken
      and the item re-worked
- [ ] 4.2 A claim carrying a declared rank that is not ours is left alone
- [ ] 4.3 A claim carrying an undeclared rank is adoptable
- [ ] 4.4 Every process overwrites `heartbeats/<role>.<rank>.json` on the state branch every poll
      interval with the time by its own clock, from a timer that keeps running while a worker
      runs. Each process keeps in memory, per sibling, the latest time it has read from the
      sibling's file and when it last saw that time move forward. A claim is adoptable once three
      poll intervals have passed since then, or since this process started if later. A missing
      file, or one older than a time already read, does not move forward
- [ ] 4.5 Working trees are named by role and rank, and the startup sweep removes those of its
      own rank and of undeclared ranks, never by age
- [ ] 4.6 Remove `ABSOLUTE_CEILING_MS`, the worker's kill at it, and the failure reason that names it
- [ ] 4.7 `docs/architecture.md` §6.7.2 pins the sweep threshold to that ceiling; restate it to
      describe the sweep by rank
- [ ] 4.8 Tests for each of 4.1–4.4, and for the `work-claiming` scenarios on a lost state branch
      (no live rank's claim is taken) and a restart while a file is missing (the clock starts
      again); and that the abandonment bound never shortens a run: a run longer than
      three poll intervals keeps its rank counted
- [ ] 4.9 A `condition-backoff` probe records its rank, and lapses when that rank misses three
      heartbeats instead of after `SWEEP_AFTER_MS`. PR #101 builds `condition-backoff` and is not
      merged: whichever of #101 and this build lands second makes this edit
- [ ] 4.10 A process's first heartbeat lands before its first cycle
- [ ] 4.11 A process reads its role's heartbeat files before choosing each candidate and again
      before verifying a claim
- [ ] 4.12 Taking an item over a gone or undeclared rank's claim message removes the role's label
      and adds it again before posting the claim message
- [ ] 4.13 A process that has failed to write its heartbeat for two poll intervals starts no claim
      and stops its running worker at the next checkpoint, leaving the claim; it resumes once a
      heartbeat lands
- [ ] 4.14 Tests for 4.10 to 4.13: a rolled-back heartbeat file does not count as moving forward;
      a restart starts every sibling's count afresh; a returning rank leaves an item adopted from
      it; a process that cannot write its heartbeat stands down before a sibling counts it gone
- [ ] 4.15 Measure how often a running worker reaches a checkpoint, and make it at least once
      every poll interval, including at a role's shortest allowed poll

## 5. State

- [ ] 5.1 `discovery.json` and `deferred.json` become logs replayed on read
- [ ] 5.2 A discovery line carries its rank; the replayed mark per source is the lowest of each
      counted rank's latest, or of every rank's latest when no rank counts
- [ ] 5.3 A rejected write re-reads and re-appends rather than reissuing its bytes
- [ ] 5.4 A conflict is not reported as a failed cycle
- [ ] 5.5 Tests: concurrent writers both survive; a retry preserves the winner's record; a
      lagging rank holds the mark down until it stops counting; with every rank gone, the lowest
      latest mark still applies
- [ ] 5.6 A cycle appends its mark only after it has attempted every candidate it will attempt.
      A cycle that stops early, because its budget ran out or its process stood down, appends a
      mark below the oldest candidate it did not attempt. A cycle whose process crashes first
      appends none
- [ ] 5.7 Every cycle also considers each open item carrying the role's label, whatever the mark
- [ ] 5.8 Tests: a crash between triage and the claims leaves the items above the mark; a crashed
      rank's claim below every mark is taken over

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, and the roster
- [ ] 6.2 `docs/deployment.md` already says `TimeoutStopSec` bounds how long shutdown waits and
      not whether the item finishes. Add what follows for ranks: an item that outlives it is
      recovered by the same rank when it restarts, or by any process once that rank leaves the
      roster or passes the abandonment bound
