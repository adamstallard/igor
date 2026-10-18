## 1. Rank and the roster

- [ ] 1.1 `igor serve <role>-<rank>` takes the rank from the last dash-separated part of its
      argument, and refuses a name without one, as `role-config` says. `igor run <role>` runs as
      rank 1
- [ ] 1.2 Read the roster from the top-level `roster` key of `igor.config.yaml`: a map from a
      role's name to its list of ranks. A role the roster does not name runs rank 1 only. Refuse
      a roster entry naming a role with no role file, a rank that is not a whole number from 1,
      or a rank listed twice. Refuse to start on a rank outside the roster, naming the ranks it
      declares
- [ ] 1.3 In `deploy/igor.service`, which runs as `igor@<role>-<rank>`, remove
      `EnvironmentFile=/etc/igor/%i.env` and make the `ExecStart` line exactly this, with no
      shell between systemd and `igor`:

      ```ini
      ExecStart=/usr/local/bin/igor serve %i
      ```

      Keep `EnvironmentFile=/etc/igor/env`, the shared file of seat tokens every role reads.
      Above the `ExecStart` line, put this comment, as written:

      ```ini
      # Igor reads /etc/igor/<role>.env itself; neither systemd nor a shell does.
      # Write each value in single quotes, KEY='value', or plain, using only
      # letters, digits and _ . / : @ -. Igor refuses to start on any other line.
      ```

      The unit's header comment, which may be reworded, names the instance with its rank:
      `igor@<role>-<rank>`, and installs one as `sudo systemctl enable --now igor@maintenance-1`.
      Beside `Restart=always`, add these lines, as written, with the comment above them, which
      may be reworded:

      ```ini
      # 78: Igor refused to start, or another process took this rank; the unit
      # shows failed. 79: the roster no longer declares this rank; the unit
      # shows inactive. Neither is restarted. The journal says why.
      RestartPreventExitStatus=78 79
      SuccessExitStatus=79
      ```

      `ProtectProc=invisible`, which PR #175 (`worker-user`) adds to the same unit, stays in it;
      whichever of the two lands second keeps the other's lines
- [ ] 1.4 Tests: a name without a rank, a role whose name has a dash, declared, undeclared, a
      role the roster does not name, a malformed roster, and the message naming what is declared
- [ ] 1.5 Refuse `igor serve` given a name whose last dash-separated part is not a whole number
      from 1, with this message, as written, where `<name>` is the name given:

      ```text
      "<name>" names no rank. Igor serves a role as <role>-<rank>, with the rank always written, such as <name>-1.
      ```
- [ ] 1.6 When `/etc/igor/<role>.env` exists, `igor serve` reads it itself, before anything
      reads a credential, and sets each key it holds in its own environment, in place of the
      same key it started with. It refuses to start on any line that is not blank, a `#`
      comment, or `KEY=value` with a single-quoted or plain value, as `role-config` defines
      them, never printing the value. The message is the first below, as written, or the
      second, as written, for a line with no `KEY=` at its start:

      ```text
      /etc/igor/<role>.env line <n>: the value of <KEY> must be in single quotes, as <KEY>='...', or use only letters, digits and _ . / : @ -. Igor reads this file itself and takes no other form.
      /etc/igor/<role>.env line <n>: each line must be blank, a # comment, or KEY=value.
      ```
- [ ] 1.7 Tests for 1.5 and 1.6: a double-quoted value, an unquoted value holding `$` or a
      backtick, a plain path, a single-quoted value holding `$` taken as written, and a
      single-quoted private key across several lines are each judged as `role-config` says, and
      the refusal in 1.6 never holds the value
- [ ] 1.8 `deploy/igor.service` sets `StateDirectory=igor`, and working trees are made under
      `/var/lib/igor/trees`, which every instance of the template shares, rather than under the
      temporary directory, which `PrivateTmp=true` makes private to each instance
- [ ] 1.9 `igor run <role>`, with or without `--plan`, refuses where the roster does not declare
      rank 1. Without `--plan`, before anything else, it reads rank 1's heartbeat file, prints
      what it is waiting for and for how long, waits half of the role's poll interval plus the
      time one heartbeat write takes, and reads the file again, even where the file was missing. Where the file changed or appeared, it
      refuses. Both messages are below; the first may be reworded, and the second is as written:

      ```text
      Checking whether igor@<role>-1 is serving <role>: waiting <duration> for its heartbeat.
      igor@<role>-1 is serving <role>. A run by hand would take its claims and remove its trees. Stop it first, or leave the work to it.
      ```

      `igor run --plan` neither waits nor refuses, and skips the startup sweep. Once a run goes
      ahead it writes `heartbeats/<role>-1.json` with an id of its own from the timer of 4.15,
      its first write before its first cycle, and follows 4.24. `--plan` writes no heartbeat.
      Test: a changed or newly written file refuses; one missing or unchanged at both reads runs
      and writes its own id before its cycle; `--plan` beside a changed file runs at once,
      writes nothing and removes no tree
- [ ] 1.10 Refuse, when the configuration loads, a role whose name does not match
      `[a-z][a-z0-9-]*`, or for which `igor-worker-<role>-<rank>` is longer than 32 characters for
      any rank the role may run, with these messages, as written:

      ```text
      Role "<role>": a role's name must start with a lowercase letter and hold only lowercase letters, digits and -.
      Role "<role>": its worker user igor-worker-<role>-<rank> would be longer than the 32 characters Linux allows in a user name. Give the role a shorter name.
      ```

      Test: an uppercase letter, a dot, a leading digit, and a name that fits at rank 1 but not
      at a higher rank the roster declares
- [ ] 1.11 Measure how long one heartbeat write takes on GitHub's Contents API, including a retry
      after the state branch rejects it because another write moved the branch, and record in
      `design.md` the bound `igor run`'s wait (1.9) uses for it

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
      on the item as not counting. Adam confirmed the wording on 2026-10-18:

      ```text
      Igor-Supersedes: <rank>
      ```
- [ ] 2.15 Measure on GitHub whether a label event's time and a comment's time on one issue come
      from one clock, to the second, so that a comment posted after a release never shows an
      earlier second. Record the result in `design.md`, under *Ordering is the surface's
      sequence key, never a timestamp*
- [ ] 2.16 Claim messages and their trailers are read only from comments the role's bot account
      wrote. Test: a person's comment carrying `Igor-Rank:` is not a claim message
- [ ] 2.17 A bot comment whose updated time differs from its created time is not a claim message,
      and none of its trailers is read. Test: an edited claim message adding `Igor-Supersedes:`
      or removing `Igor-Handed-Over-By:` changes nothing a process reads
- [ ] 2.18 Before building 2.17, measure on GitHub whether an unedited bot comment keeps its
      updated time equal to its created time when people react to it, when it is hidden, and
      when its issue is transferred. Record the result in `design.md`. If any of them changes
      the updated time, 2.17 would make that claim message stop counting, so it goes back to
      Adam before it is built

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
- [ ] 4.4 Every process overwrites `heartbeats/<role>-<rank>.json` on the state branch every half
      poll interval, from the timer of 4.15, which keeps running while a worker runs. The file holds an id the
      process chose at random when it started and a counter it increments on each write, and no
      time. Each process keeps in memory, per sibling, the id and counter it last read from the
      sibling's file and when, by its own clock, it last saw them change. A claim is adoptable
      once three poll intervals have passed since then, or since this process started if later.
      A missing file does not change
- [ ] 4.5 Working trees are named `<role>-<rank>-<id>`, with an id holding no dash, and read from
      the end of the name. At startup a process removes those of its own
      role and rank. At the start of each cycle it removes those of every rank the roster does not
      declare and that is gone to it. Never by age. With each tree go its outbox and its
      `<tree>-git` directory, where there is one. Each tree is removed as the worker user of the
      rank that made it, under `sudo -u igor-worker-<role>-<rank>`, which #175's sudoers lines
      allow.
      `igor run --plan` removes nothing
- [ ] 4.6 Remove `ABSOLUTE_CEILING_MS`, the worker's kill at it, and the failure reason that names it
- [ ] 4.7 `docs/architecture.md` §6.7.2 pins the sweep threshold to that ceiling; restate it to
      describe the sweep by rank
- [ ] 4.8 Tests for each of 4.1–4.4, and for the `work-claiming` scenarios on a lost state branch
      (no live rank's claim is taken) and a restart while a file is missing (the clock starts
      again); and that the abandonment bound never shortens a run: a run longer than
      three poll intervals keeps its rank counted
- [ ] 4.9 A `condition-backoff` probe records its rank, and lapses when that rank is gone,
      three poll intervals without its heartbeat changing, instead of after `SWEEP_AFTER_MS`. PR #101 builds `condition-backoff` and is not
      merged: whichever of #101 and this build lands second makes this edit
- [ ] 4.10 A process's first heartbeat lands before its first cycle
- [ ] 4.11 A process reads its role's heartbeat files before choosing each candidate and again
      before verifying a claim, all of them in one request for the state branch's tree. A
      file has changed when the tree gives it a blob id other than the one this process last
      read, so no file's contents are fetched
- [ ] 4.12 Taking an item over a gone rank's claim message removes the role's label and adds it
      again, then posts the claim message at once. On an item with the Igor's open pull request
      it releases nothing, as 4.16 says
- [ ] 4.13 A process that has failed to write its heartbeat for two poll intervals starts no claim,
      and the timer of 4.15 stops its running worker at its next firing, leaving the claim and
      saying nothing on the item, since a sibling may already have taken it over; it resumes once
      a heartbeat lands
- [ ] 4.14 Tests for 4.10 to 4.13: a rolled-back heartbeat file only postpones a gone verdict; a
      rank whose clock stepped back is still counted; a restart starts every sibling's count
      afresh; a returning rank leaves an item adopted from it; a process that cannot write its
      heartbeat stands down before a sibling counts it gone, and posts nothing on the item; a
      taker posts at once after its release
- [ ] 4.15 Igor's own loop runs a timer, apart from the cycle and the worker, that fires every
      half poll interval. Each firing writes the heartbeat (4.4) and checks whether the process
      has stood down (4.13); where it has, the timer stops the running worker itself, without
      waiting for a worker event. A stop said by a person is still seen where `main` sees it, at
      the claim re-read `src/execute.ts` makes on a worker event. Test: a stand-down while the
      worker emits no event stops the worker within half a poll interval
- [ ] 4.16 A claim left by this process's predecessor or by a gone rank on an item with the Igor's
      own open pull request is caught up: the item is not re-worked, the pull request is brought
      up to date where it no longer merges, and the claim is given back as a catch-up gives it
      back, leaving the pull request open and a person's label in place. Over a gone rank's
      claim, the process releases nothing: it posts its own claim message, carrying 2.14's
      trailer, and verifies it. Triage does not skip such an item as work in flight
      (`work-triage`)
- [ ] 4.17 A process reads the roster at the start of each cycle. When its own rank is no longer
      declared, it starts no claim, finishes its item or hands it off out loud, as shutdown
      does, keeps writing heartbeats meanwhile, and then exits as 4.25 says. Where the
      configuration read at a cycle fails a check a starting process makes, the process goes on
      under the last configuration that passed and raises a condition naming the failing file
      and check, of the read-cleared kind #171 (`seat-files`) defines in `stuck-conditions`; it
      never exits for it. Whichever of #171 and this build lands second makes the condition that
      kind. Test: a malformed roster at a cycle keeps the last roster and raises the condition,
      and a fixed one clears it
- [ ] 4.18 Tests for 4.16 and 4.17: a recovered claim with the Igor's pull request open is caught
      up, whether its own predecessor's or a gone sibling's, and a person's label stays; a
      returning rank does not count its superseded message; a rank removed from the roster is
      not adopted while its heartbeat changes; a process whose rank leaves the roster finishes or
      hands off its item and exits
- [ ] 4.19 Measure the requests to GitHub's `core` REST rate limit that one rank makes in one
      cycle, with two and with three ranks running. Measure the `core` limit an App installation
      gets, which is not the 5,000 an hour measured on a personal account, and record in
      `design.md` how many ranks one App's limit allows at the default poll
- [ ] 4.20 PR #175 (`worker-user`) adds a git directory, `<tree>-git`, beside each tree. 4.5
      sweeps it already, assuming that name; check the name against #175 as merged. Trees and
      their git directories live in `/var/lib/igor/trees` (1.8). #175 keeps `PrivateTmp=true`
      for everything else, and records its side of this itself, including the sibling's removal
      as the gone rank's worker user (4.5)
- [ ] 4.21 Only the rank whose claim message holds an item removes the role's label: standing
      down after a failed verification, setting an item down after a repeated failure before the
      worker (#173), and answering a stop. Any other rank drops out silently, removing and
      posting nothing. #173's spec has only the holder count its failures before the worker;
      whichever of #173's build and this build lands second makes a rank that does not hold the
      item count none of its failures and post no set-down
- [ ] 4.22 A stop said on a handed-over item is answered only by the rank whose claim message
      holds it; other ranks ignore it. Where no claim message counts, the rank that reaches the
      item answers it
- [ ] 4.23 Tests for 4.21 and 4.22: a rank that does not hold the item and fails its verification
      leaves the label; the holder sets an item down; a stop on a handed-over item a sibling
      works is ignored by the other rank; a stop on a hand-over nobody has claimed is answered
- [ ] 4.24 Each heartbeat write names the blob the process last wrote to its file, or, before its
      first write, the blob the file held at its start, so that a write over another process's
      is refused. On a refusal, and when a tree read gives its own file a blob id other than the
      one it last wrote, the process reads the file's id. An id other than its own, written
      since it started, means another process took its rank: it stops its worker, starts and
      posts nothing, leaves its claims, logs the line below, as written, and exits with status
      78. The id the file held at its start is its predecessor's, and a missing file holds none.

      ```text
      Another process took rank <rank> of <role>: its id is in heartbeats/<role>-<rank>.json. Stopping for good; start this rank again only once that process has stopped.
      ```

      Test: a write over another process's id is refused and the process exits 78 with that
      line; `igor run` stops the same way when a restarted rank 1 overwrites its id; a
      predecessor's id and a missing file stop nobody
- [ ] 4.25 A process exiting because the roster no longer declares its rank logs the line below,
      as written, and exits with status 79; no other exit uses 79. Test: the status and the line

      ```text
      The roster no longer declares rank <rank> of <role>. Exiting; systemd will not restart this rank.
      ```
- [ ] 4.26 Measure on a Linux host that a unit listing 79 in `SuccessExitStatus=` and
      `RestartPreventExitStatus=` is not restarted after its process exits with 79, and shows as
      inactive in `systemctl status`. Record the result in `design.md`

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
      A cycle whose process crashes first appends none. A cycle cut short, by a stand-down
      among other reasons, holds its mark back by #101's rule in `work-discovery`, *Watermarks
      reduce reconsideration without governing it*, which lists every reason a cycle that stops
      early does so. Build the hold-back for a stand-down as that rule holds it back for an
      exhausted budget. Adam decided the stand-down belongs in #101's rule, whose text does not
      name it yet; it must before this change archives (listed in the proposal, since #101 is
      under review)
- [ ] 5.7 Every cycle also considers each open item carrying the role's label, whatever the mark
- [ ] 5.8 Tests: a crash between triage and the claims leaves the items above the mark; a crashed
      rank's claim below every mark is taken over
- [ ] 5.9 A sibling rank's mark counts only once this process has seen that rank's heartbeat change
      since it started; its own rank's mark always counts. Test: after a restart, a
      dead rank's old mark does not hold the mark down
- [ ] 5.10 A labelled item whose holding claim message carries a sibling's rank that is not gone
      is passed over before triage, with no triage call (`work-triage`). Test: no triage call
      for it
- [ ] 5.11 PR #106 (`role-keyed-watermark`) keys the watermark by role, and allows one mark per
      role and rank, never one per run, as this change requires (Adam, 2026-10-18). Whichever of
      #106 and this build lands second makes the discovery log hold one line per rank, each
      naming its role, and folds them into one mark per role and source as 5.2 says
- [ ] 5.12 PR #99 (`failure-record`) adds to `discovery.json` the candidate ids a cycle carries to
      the next. Whichever of #99 and this build lands second makes those ids log lines too,
      replayed per source as the union of each rank's latest
- [ ] 5.13 A first run considers the role's labelled items whatever their update time, as well
      as the items inside the look-back window
- [ ] 5.14 PR #150 (`two-gate`) also MODIFIES `work-triage`'s *Items with work already in flight
      are skipped*: this change adds the exception for a claim this process takes over on the
      Igor's own artifact, and #150 adds one of its own, which its delta states. Whichever of #150
      and this change archives second copies the other's exception and scenarios into its delta
      by hand before archiving, or the archive drops them
- [ ] 5.15 Where this process's own claim message holds an item whose Igor pull request still
      merges, triage passes the item over with no triage call, unless the item or the pull
      request has updated since this process last triaged it, or the pull request no longer
      merges (`work-triage`). Keep each item's last triage time in memory. Test: no triage call
      for an unchanged item; a new comment, or a pull request that stops merging, brings one

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, the roster, and the role's
      environment file. Say this about the file, as written:

      ```text
      Write each value in /etc/igor/<role>.env in single quotes, as KEY='value', or plain, using only letters, digits and _ . / : @ -. Igor reads this file itself, takes a single-quoted value exactly as written, and refuses to start on any other line, naming its key but never its value. A single-quoted value may span lines, as a private key does, but cannot hold a single quote.
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
- [ ] 6.5 `docs/deployment.md` says what exit statuses 78 and 79 mean and what to do: 78, read
      the journal, fix what it names, and start the unit again; 79, nothing, unless the rank
      should run, when the roster must declare it first. It says the abandonment bound, the
      heartbeat period, the stand-down threshold and `igor run`'s wait follow the poll interval
      and have no settings of their own
