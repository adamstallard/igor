## 1. Rank and the roster

- [ ] 1.1 `igor serve <role>-<rank>` takes the rank from the last dash-separated part of its
      argument, and refuses a name without one, as `role-config` says. `igor run <role>` runs as
      rank 1
- [ ] 1.2 Read the roster from the top-level `roster` key of `igor.config.yaml`: a map from a
      role's name to its list of ranks. A role the roster does not name runs rank 1 only. Refuse
      a roster entry naming a role with no role file, a rank that is not a whole number from 1,
      or a rank listed twice. Refuse to start on a rank outside the roster, naming the ranks it
      declares
- [ ] 1.3 In `deploy/igor.service`, which runs as `igor@<role>-<rank>`, replace
      `EnvironmentFile=/etc/igor/%i.env` and the `ExecStart` line with exactly this:

      ```ini
      ExecStart=/bin/sh -c 'role="$${1%%-*}"; set -a; . "/etc/igor/$${role}.env"; set +a; exec /usr/local/bin/igor serve "$$1"' igor %i
      ```

      systemd turns `$$` into `$` and `%%` into `%`, and `%i` into the instance, so `sh` runs
      `role="${1%-*}"` with `$1` set to `generalist-2`, which strips the last dash-separated
      part. The App's credentials reach `igor` only through its environment. `sh`'s arguments
      are the script, the word `igor`, which `sh` takes as its `$0` and names itself by in
      errors, and the instance. Keep `EnvironmentFile=/etc/igor/env`, the shared file of seat
      tokens every role reads. Above the `ExecStart` line, put this comment, as written:

      ```ini
      # /etc/igor/<role>.env is read by the shell's dot command, not by systemd.
      # Write each value in single quotes, KEY='value', or plain, using only
      # letters, digits and _ . / : @ -. Outside single quotes the shell expands
      # $, ` and \, and Igor refuses to start on any other value.
      ```

      The unit's header comment, which may be reworded, names the instance with its rank:
      `igor@<role>-<rank>`, and installs one as `sudo systemctl enable --now igor@maintenance-1`
- [ ] 1.4 Tests: a name without a rank, a role whose name has a dash, declared, undeclared, a
      role the roster does not name, a malformed roster, and the message naming what is declared
- [ ] 1.5 Refuse `igor serve` given a name whose last dash-separated part is not a whole number
      from 1, with this message, as written, where `<name>` is the name given:

      ```text
      "<name>" names no rank. Igor serves a role as <role>-<rank>, with the rank always written, such as <name>-1.
      ```
- [ ] 1.6 When `/etc/igor/<role>.env` exists, refuse to start if any value in it is neither
      single-quoted nor plain, as `role-config` defines them, never printing the value, with this
      message, as written:

      ```text
      /etc/igor/<role>.env line <n>: the value of <KEY> must be in single quotes, or use only letters, digits and _ . / : @ -. The unit's shell reads this file, and outside single quotes it expands $, ` and \, so Igor may not receive the value as written. Write it as <KEY>='...'
      ```
- [ ] 1.7 Tests for 1.5 and 1.6: a double-quoted value, an unquoted value holding `$` or a
      backtick, a plain path, and `'it'\''s'` are each judged as `role-config` says, and the
      refusal in 1.6 never holds the value
- [ ] 1.8 `deploy/igor.service` sets `StateDirectory=igor`, and working trees are made under
      `/var/lib/igor/trees`, which every instance of the template shares, rather than under the
      temporary directory, which `PrivateTmp=true` makes private to each instance
- [ ] 1.9 `igor run <role>`, with or without `--plan`, refuses where the roster does not declare
      rank 1. Before anything else, it reads rank 1's heartbeat file, and reads it again after
      one of the role's poll intervals, even where the file was missing; where the file changed
      or appeared, it refuses with this message, as written:

      ```text
      igor@<role>-1 is serving <role>. A run by hand would take its claims and remove its trees. Stop it first, or leave the work to it.
      ```

      Test: a changed or newly written file refuses, and one missing or unchanged at both reads
      runs

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
      read from the item's label events; a message in the release's second does not count, and
      the item is claimed at a later cycle. No process waits for the release's second to pass
- [ ] 2.10 A taker's claim message on a handed-over item carries a second trailer, after
      `Igor-Rank:`, recording the hand-over, exactly as below, where `<login>` is the person who
      added the label; and the adapter reads an item whose holding claim message carries it as
      handed over by that person:

      ```text
      Igor-Handed-Over-By: <login>
      ```
- [ ] 2.11 Tests for 2.9, 2.10 and 2.14: a message in the release's second does not count; a
      superseded message does not count once its rank returns; a taken-over hand-over still
      reads as handed over, so that when the Igor later brings its own pull request for the item
      up to date and gives the claim back, the label stays, and a stop said on the item is not
      lifted by a later go-ahead, as for any handed-over item
- [ ] 2.12 Measure on GitHub whether comment ids still ascend in the order of creation for claim
      comments posted on one issue within one second, by several ranks at once. Record the
      result in `design.md`, under *Ordering is the surface's sequence key, never a timestamp*
- [ ] 2.13 Before a Linear adapter is built, define what taking over a gone rank's claim means
      on Linear, where removing the label and adding it again has no counterpart. Nothing in
      this change builds a Linear adapter, so file this as an issue before archiving the change
- [ ] 2.14 A claim message that takes over a gone rank's claim on an item with the Igor's open
      pull request carries, after `Igor-Rank:`, a trailer naming the rank whose message it
      supersedes, exactly as below; every process then reads that rank's earlier claim messages
      on the item as not counting. The trailer's wording is proposed, for Adam to confirm:

      ```text
      Igor-Supersedes: <rank>
      ```
- [ ] 2.15 Measure on GitHub whether a label event's time and a comment's time on one issue come
      from one clock, to the second, so that a comment posted after a release never shows an
      earlier second. Record the result in `design.md`, under *Ordering is the surface's
      sequence key, never a timestamp*
- [ ] 2.16 Claim messages and their trailers are read only from comments the role's bot account
      wrote. Test: a person's comment carrying `Igor-Rank:` is not a claim message

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
- [ ] 4.4 Every process overwrites `heartbeats/<role>-<rank>.json` on the state branch every poll
      interval, from a timer that keeps running while a worker runs. The file holds an id the
      process chose at random when it started and a counter it increments on each write, and no
      time. Each process keeps in memory, per sibling, the id and counter it last read from the
      sibling's file and when, by its own clock, it last saw them change. A claim is adoptable
      once three poll intervals have passed since then, or since this process started if later.
      A missing file does not change
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
      before verifying a claim, all of them in one request for the state branch's tree. A
      file has changed when the tree gives it a blob id other than the one this process last
      read, so no file's contents are fetched
- [ ] 4.12 Taking an item over a gone rank's claim message removes the role's label and adds it
      again, then posts the claim message at once. On an item with the Igor's open pull request
      it releases nothing, as 4.16 says
- [ ] 4.13 A process that has failed to write its heartbeat for two poll intervals starts no claim
      and stops its running worker at the next checkpoint, leaving the claim and saying nothing
      on the item, since a sibling may already have taken it over; it resumes once a heartbeat
      lands. Where 4.15 finds a worker can go longer than one poll interval between checkpoints,
      it does so after one missed heartbeat
- [ ] 4.14 Tests for 4.10 to 4.13: a rolled-back heartbeat file only postpones a gone verdict; a
      rank whose clock stepped back is still counted; a restart starts every sibling's count
      afresh; a returning rank leaves an item adopted from it; a process that cannot write its
      heartbeat stands down before a sibling counts it gone, and posts nothing on the item; a
      taker posts at once after its release
- [ ] 4.15 Make a running worker reach a checkpoint at least once every two poll intervals,
      including at a role's shortest allowed poll, and measure the real gap. On `main` a
      checkpoint is the claim re-read in `src/execute.ts`, made on a worker event at most every
      30 seconds, so the gap is as long as the worker's longest silence: up to
      `MODEL_SILENCE_MS`, 5 minutes, while the model writes a turn, since `claude -p` is run
      without partial messages, and up to `TOOL_SILENCE_MS`, 30 minutes, while a tool runs. Both
      exceed two intervals at some allowed poll, so a checkpoint that does not wait for an event
      is needed. Where the gap cannot be held to one interval, 4.13's stand-down after one missed
      heartbeat applies, and the gap must never exceed two
- [ ] 4.16 A claim left by this process's predecessor or by a gone rank on an item with the Igor's
      own open pull request is caught up: the item is not re-worked, the pull request is brought
      up to date where it no longer merges, and the claim is given back as a catch-up gives it
      back, leaving the pull request open and a person's label in place. Over a gone rank's
      claim, the process releases nothing: it posts its own claim message, carrying 2.14's
      trailer, and verifies it. Triage does not skip such an item as work in flight
      (`work-triage`)
- [ ] 4.17 A process reads the roster at the start of each cycle. When its own rank is no longer
      declared, it starts no claim, finishes its item or hands it off out loud, as shutdown
      does, keeps writing heartbeats meanwhile, and then exits
- [ ] 4.18 Tests for 4.16 and 4.17: a recovered claim with the Igor's pull request open is caught
      up, whether its own predecessor's or a gone sibling's, and a person's label stays; a
      returning rank does not count its superseded message; a rank removed from the roster is
      not adopted while its heartbeat changes; a process whose rank leaves the roster finishes or
      hands off its item and exits
- [ ] 4.19 Measure the requests to GitHub's `core` REST rate limit that one rank makes in one
      cycle, with two and with three ranks running, and record in `design.md` how many ranks
      one App's limit allows at the default poll
- [ ] 4.20 PR #175 (`worker-user`) adds a git directory, `<tree>-git`, beside each tree. 4.5
      sweeps it already, assuming that name; check the name against #175 as merged. Trees and
      their git directories live in `/var/lib/igor/trees` (1.8). #175 keeps `PrivateTmp=true`
      for everything else, and records its side of this itself

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
      Write each value in /etc/igor/<role>.env in single quotes, as KEY='value', or plain, using only letters, digits and _ . / : @ -. The unit's shell reads the file with its dot command, and outside single quotes it expands $, ` and \, so a value holding one of them would reach Igor changed. Igor refuses to start on any other value. A value that itself holds a single quote is written as 'it'\''s'.
      ```
- [ ] 6.2 `docs/deployment.md` already says `TimeoutStopSec` bounds how long shutdown waits and
      not whether the item finishes. Add what follows for ranks: an item that outlives it is
      recovered by the same rank when it restarts, or by any process once that rank passes the
      abandonment bound
- [ ] 6.3 `docs/architecture.md` calls a role's processes interchangeable: in §2, under
      *Processes of an Igor are interchangeable*, and in the passages on Discord polling and on
      one identity per role. Restate each: a role's processes share one identity and differ
      only by rank, which decides who recovers a claim and the order and wait of contention
- [ ] 6.4 Every place that starts a role by its name alone gives the rank: `README.md` and
      `docs/deployment.md` say `igor serve <role>-<rank>`, `deploy/docker-compose.yml` runs
      `igor serve maintenance-1`, and the unit's header comment installs `igor@<role>-<rank>`
