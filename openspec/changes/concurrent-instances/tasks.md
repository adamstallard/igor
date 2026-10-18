## 1. Rank and the roster

- [ ] 1.1 `igor serve <role>.<rank>` takes the rank from its argument; `igor serve <role>` is rank 1
- [ ] 1.2 Read the roster from the top-level `roster` key of `igor.config.yaml`: a map from a
      role's name to its list of ranks. A role the roster does not name runs rank 1 only. Refuse
      a roster entry naming a role with no role file, a rank that is not a whole number from 1,
      or a rank listed twice. Refuse to start on a rank outside the roster, naming the ranks it
      declares
- [ ] 1.3 In `deploy/igor.service`, which runs as `igor@<role>.<rank>`, replace
      `EnvironmentFile=/etc/igor/%i.env` and the `ExecStart` line with exactly this:

      ```ini
      ExecStart=/bin/sh -c 'role="$${1%%%%.*}"; set -a; . "/etc/igor/$${role}.env"; set +a; exec /usr/local/bin/igor serve "$$1"' igor %i
      ```

      systemd turns `$$` into `$` and `%%` into `%`, and `%i` into the instance, so `sh` runs
      `role="${1%%.*}"` with `$1` set to `generalist.2`. The App's credentials reach `igor` only
      through its environment. `sh`'s arguments are the script, the word `igor`, which `sh`
      takes as its `$0` and names itself by in errors, and the instance. Keep
      `EnvironmentFile=/etc/igor/env`, the shared file of seat tokens every role reads. Above the
      `ExecStart` line, put this comment, as written:

      ```ini
      # /etc/igor/<role>.env is read by the shell's dot command, not by systemd.
      # Write every value in single quotes, KEY='value': inside double quotes the
      # shell expands $, ` and \, and Igor refuses to start on a double-quoted value.
      ```
- [ ] 1.4 Tests: no suffix, declared, undeclared, a role the roster does not name, a malformed
      roster, and the message naming what is declared
- [ ] 1.5 Refuse a role file whose name contains a dot, with this message, as written, where
      `<name>` is the file's name without `.yaml`:

      ```text
      Role "<name>" has a dot in its name. A process is named <role>.<rank>, so a role's name cannot contain a dot. Rename roles/<name>.yaml.
      ```
- [ ] 1.6 When `/etc/igor/<role>.env` exists, refuse to start if any value in it is in double
      quotes, never printing the value, with this message, as written:

      ```text
      /etc/igor/<role>.env line <n>: <KEY> is in double quotes. The unit's shell expands $, ` and \ inside double quotes, so Igor may not receive the value as written. Put it in single quotes: <KEY>='...'
      ```
- [ ] 1.7 Tests for 1.5 and 1.6, including that the refusal in 1.6 never holds the value
- [ ] 1.8 `deploy/igor.service` sets `StateDirectory=igor`, and working trees are made under the
      directory it gives, which every instance of the template shares, rather than under the
      temporary directory, which `PrivateTmp=true` makes private to each instance

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
- [ ] 2.9 A claim message counts only when its timestamp is later than the item's latest release,
      read from the item's label events; a message in the release's second does not count
- [ ] 2.10 A taker's claim message on a handed-over item carries a second trailer, after
      `Igor-Rank:`, recording the hand-over, exactly as below, where `<login>` is the person who
      added the label; and the adapter reads an item whose holding claim message carries it as
      handed over by that person:

      ```text
      Igor-Handed-Over-By: <login>
      ```
- [ ] 2.11 Tests for 2.9 and 2.10: a message in the release's second does not count; a
      taken-over hand-over still reads as handed over, so that when the Igor later brings its
      own pull request for the item up to date and gives the claim back, the label stays, and a
      stop said on the item stands
- [ ] 2.12 Measure on GitHub whether comment ids still ascend in the order of creation for claim
      comments posted on one issue within one second, by several ranks at once. Record the
      result in `design.md`, under *Ordering is the surface's sequence key, never a timestamp*
- [ ] 2.13 Before a Linear adapter is built, define what taking over a gone rank's claim means
      on Linear, where removing the label and adding it again has no counterpart. Nothing in
      this change builds a Linear adapter, so file this as an issue before archiving the change

## 3. Contention

- [ ] 3.1 Candidates are attempted from an offset derived from rank
- [ ] 3.2 Rank k contends only when it has fewer than k candidates. A contended item is re-read
      after `(rank - 1)` settle intervals, before claiming
- [ ] 3.3 Tests: no wait when rank k has at least k candidates; a loser posts nothing
- [ ] 3.4 A hand-over among one role's ranks goes through the same contest: rank k waits
      `(k - 1)` settle intervals, re-reads, and posts only if no claim message that counts is
      there; rank 1 posts at once. A rank whose worker is running does not contend. The rank
      that posts verifies its claim after the settle interval
- [ ] 3.5 Tests for 3.4: the lowest free rank posts and the others post nothing; a busy rank
      does not contend; two ranks that both post resolve by the earliest claim message

## 4. Recovery

- [ ] 4.1 A claim whose earliest counted claim message carries this process's own rank is taken
      and the item re-worked
- [ ] 4.2 A claim carrying another rank that is not gone is left alone
- [ ] 4.3 A claim carrying a rank the roster does not declare is adoptable only once that rank
      is gone
- [ ] 4.4 Every process overwrites `heartbeats/<role>.<rank>.json` on the state branch every poll
      interval with the time by its own clock, from a timer that keeps running while a worker
      runs. Each process keeps in memory, per sibling, the latest time it has read from the
      sibling's file and when it last saw that time move forward. A claim is adoptable once three
      poll intervals have passed since then, or since this process started if later. A missing
      file, or one older than a time already read, does not move forward
- [ ] 4.5 Working trees are named by role and rank. At startup a process removes those of its own
      rank. At the start of each cycle it removes those of every rank the roster does not
      declare and that is gone to it. Never by age. With each tree go its outbox and its
      `<tree>-git` directory, where there is one
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
      before verifying a claim, all of them in one request for the state branch's tree. It
      fetches a file's contents only when the tree gives the file a blob id other than the one it
      last read
- [ ] 4.12 Taking an item over a gone rank's claim message removes the role's label and adds it
      again, then waits until the second of that release has passed, and only then posts the
      claim message
- [ ] 4.13 A process that has failed to write its heartbeat for two poll intervals starts no claim
      and stops its running worker at the next checkpoint, leaving the claim; it resumes once a
      heartbeat lands. Where 4.15 finds a worker can go longer than one poll interval between
      checkpoints, it does so after one missed heartbeat
- [ ] 4.14 Tests for 4.10 to 4.13: a rolled-back heartbeat file does not count as moving forward;
      a restart starts every sibling's count afresh; a returning rank leaves an item adopted from
      it; a process that cannot write its heartbeat stands down before a sibling counts it gone;
      a taker posts only after its release's second
- [ ] 4.15 Measure how often a running worker reaches a checkpoint, including at a role's shortest
      allowed poll. Make it at least once every poll interval; where it cannot be, 4.13's
      stand-down after one missed heartbeat applies, and the gap must never exceed two
      intervals
- [ ] 4.16 A recovered claim on an item with the Igor's own open pull request is released as a
      catch-up releases its claim, leaving the pull request open and a person's label in place,
      and the item is not re-worked
- [ ] 4.17 A process reads the roster at the start of each cycle. When its own rank is no longer
      declared, it stands down as in 4.13 and exits once its worker has stopped
- [ ] 4.18 Tests for 4.16 and 4.17: a recovered claim with the Igor's pull request open is a
      catch-up; a rank removed from the roster is not adopted while its heartbeat moves forward;
      a process whose rank leaves the roster stands down and exits
- [ ] 4.19 Measure the requests to GitHub's `core` REST rate limit that one rank makes in one
      cycle, with two and with three ranks running, and record in `design.md` how many ranks
      one App's limit allows at the default poll
- [ ] 4.20 PR #175 (`worker-user`) adds a git directory, `<tree>-git`, beside each tree. 4.5
      sweeps it already, assuming that name. #175 also keeps each instance's trees under its own
      `/tmp`, with `PrivateTmp=true`, where 1.8 moves them to the shared `StateDirectory`.
      Whichever of #175 and this build lands second reconciles both with the other as merged

## 5. State

- [ ] 5.1 Every state file more than one process writes becomes a log replayed on read, or is
      otherwise written so a retry discards nothing: `discovery.json`, `deferred.json`,
      `reconcile.json`, and the daily record logs that `src/state.ts` re-uploads whole
- [ ] 5.2 A discovery line carries its role and its rank; the replayed mark per source is the
      lowest of each counted rank's latest, or of every rank's latest when no rank counts,
      capped at the cold start's look-back (`COLD_START_DAYS`)
- [ ] 5.3 A rejected write re-reads and re-appends rather than reissuing its bytes
- [ ] 5.4 A conflict is not reported as a failed cycle
- [ ] 5.5 Tests: concurrent writers both survive; a retry preserves the winner's record; a
      lagging rank holds the mark down until it stops counting; with every rank gone, the lowest
      latest mark still applies, and never reaches earlier than the cold start's look-back
- [ ] 5.6 A cycle appends its mark only after it has attempted every candidate it will attempt.
      A cycle that stops early, because its budget ran out or its process stood down, appends a
      mark below the oldest candidate it did not attempt. A cycle whose process crashes first
      appends none
- [ ] 5.7 Every cycle also considers each open item carrying the role's label, whatever the mark
- [ ] 5.8 Tests: a crash between triage and the claims leaves the items above the mark; a crashed
      rank's claim below every mark is taken over
- [ ] 5.9 A sibling rank's mark counts only once this process has seen that rank's heartbeat move
      forward since it started; its own rank's mark always counts. Test: after a restart, a
      dead rank's old mark does not hold the mark down
- [ ] 5.10 A labelled item whose holding claim message carries a sibling's rank that is not gone
      is passed over before triage, with no triage call (`work-triage`). Test: no triage call
      for it
- [ ] 5.11 PR #106 (`role-keyed-watermark`) keys the watermark by role. Whichever of #106 and this
      build lands second makes the discovery log hold one line per rank, each naming its role,
      and folds them into one mark per role and source as 5.2 says
- [ ] 5.12 PR #99 (`failure-record`) adds to `discovery.json` the candidate ids a cycle carries to
      the next. Whichever of #99 and this build lands second makes those ids log lines too,
      replayed per source as the union of each rank's latest
- [ ] 5.13 A first run considers the role's labelled items whatever their update time, as well
      as the items inside the look-back window

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, the roster, and the role's
      environment file. Say this about the file, as written:

      ```text
      Write every value in /etc/igor/<role>.env in single quotes, as KEY='value'. The unit's shell reads the file with its dot command, and inside double quotes it expands $, ` and \, so a value holding one of them would reach Igor changed. Igor refuses to start on a double-quoted value. A value that itself holds a single quote is written as 'it'\''s'.
      ```
- [ ] 6.2 `docs/deployment.md` already says `TimeoutStopSec` bounds how long shutdown waits and
      not whether the item finishes. Add what follows for ranks: an item that outlives it is
      recovered by the same rank when it restarts, or by any process once that rank passes the
      abandonment bound
- [ ] 6.3 `docs/architecture.md` calls a role's processes interchangeable: in §2, under
      *Processes of an Igor are interchangeable*, and in the passages on Discord polling and on
      one identity per role. Restate each: a role's processes share one identity and differ
      only by rank, which decides who recovers a claim and the order and wait of contention
