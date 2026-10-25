## 1. Rank and the roster

- [ ] 1.1 `igor serve <role>-<rank>` takes the rank from the last dash-separated part of its
      argument, and refuses a name without one, as `role-config` says. `igor run <role>` runs as
      rank 0
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
      The unit's restart lines are #82's (`stopped-scope-visible`): `Restart=on-failure` and
      `RestartPreventExitStatus=78`, with `RestartSec=30s` and no `SuccessExitStatus=`. A rank the roster no longer
      declares exits 0 (4.25), which that policy does not restart; this change adds no line for it

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
      them, printing nothing of the line but its number (proposal, decision 59). The message is
      the first below, as written, for a line that starts with `KEY=`, an unclosed quote's
      included, or the second, as written, for a line with no `KEY=` at its start:

      ```text
      /etc/igor/<role>.env line <n>: a value must be in single quotes, as KEY='...', or use only letters, digits and _ . / : @ -. Igor reads this file itself and takes no other form.
      /etc/igor/<role>.env line <n>: each line must be blank, a # comment, or KEY=value.
      ```
- [ ] 1.7 Tests for 1.5 and 1.6: a double-quoted value, an unquoted value holding `$` or a
      backtick, a plain path, a single-quoted value holding `$` taken as written, and a
      single-quoted private key across several lines are each judged as `role-config` says, and
      the refusal in 1.6 holds nothing of the line but its number, including for a line of a
      private key that a stray `'` left outside its value; `TOKEN=` with no value is refused;
      a name with no rank is refused as 1.5 says; and a name such as `../x-1`, whose role is not
      one `role-config` accepts, is refused by the role-name check before any file is read
- [ ] 1.8 `deploy/igor.service` sets `StateDirectory=igor`, and working trees are made under
      `<state dir>/trees`, where the state directory is as #216 (`lore-search`, its decision 105)
      defines it: `$STATE_DIRECTORY`, which `StateDirectory=igor` sets, and otherwise
      `$XDG_STATE_HOME/igor`. Every instance of the template shares it, unlike the temporary
      directory, which `PrivateTmp=true` makes private to each instance
- [ ] 1.9 `igor run <role>` runs as rank 0 whatever the roster declares, with no wait and no
      check of any serving rank. Without `--plan` it writes `heartbeats/<role>-0-<run id>.json`
      from the timer of 4.15, its first write before its first cycle, and its claim messages
      carry `Igor-Rank: 0` and `Igor-Run: <run id>`, the run id of 4.5. Where the rank is 0,
      verification compares the run id too. A sibling judges a run's claim messages gone by that
      run's own file. It passes over every labelled item that carries any claim message posted
      since its latest release, whatever its rank and whether or not that rank is gone, posting
      nothing, except that it answers a stop said on such an item once none of its claim messages
      counts any longer. It removes its heartbeat file as it exits, and a serving process removes a run's
      file once it counts that run gone (decision 54). It spends only `IGOR_RUN_TOKEN`; #171's tasks build that spending. `igor run --plan` writes no heartbeat, claims nothing and removes no
      tree. Test: a run beside a serving rank 1 starts at once and writes its heartbeat before
      its cycle; a run passes over an item held by a gone rank and one held by rank 0; two runs
      that both claim one item read different run ids, and only the earlier message's run works
      it; a crashed run's claim is taken over once its own file stops changing, while another
      run's file still changes; a run's heartbeat file is gone once it exits, and a crashed
      run's once rank 1 counts it gone; `--plan` writes nothing and removes no tree
- [ ] 1.10 Refuse, when the configuration loads, a role whose name does not match
      `[a-z][a-z0-9-]*`, or for which `igor-worker-<role>-<rank>` is longer than 32 characters for
      any rank the role may run, with these messages, as written:

      ```text
      Role "<role>": a role's name must start with a lowercase letter and hold only lowercase letters, digits and -.
      Role "<role>": its worker user igor-worker-<role>-<rank> would be longer than the 32 characters Linux allows in a user name. Give the role a shorter name.
      ```

      Test: an uppercase letter, a dot, a leading digit, and a name that fits at rank 1 but not
      at a higher rank the roster declares
- [ ] 1.11 Refuse a configuration whose settle interval is not shorter than its poll interval,
      with this message, as written:

      ```text
      Role "<role>": its settle interval (<settle>) must be shorter than its poll interval (<poll>). A claim is verified within one poll interval of its message, so with this setting the role would work nothing.
      ```

      Test: equal intervals are refused, naming both values; a shorter settle interval loads

## 2. The marker

- [ ] 2.1 The claim message carries the rank as a machine-readable trailer
- [ ] 2.2 Parse it back from the bot's unedited comment (2.17), tolerating text before the trailers
- [ ] 2.3 Verification reads the claim with the lowest sequence key, not the earliest timestamp
- [ ] 2.4 `RawComment` and the adapter's comment shape carry the surface's sequence key
- [ ] 2.5 Tests: same-timestamp claims order; a sibling's claim is not our own
- [ ] 2.6 A process that loses a claim to a process of its own role leaves the role's label in
      place
- [ ] 2.7 The re-read that verifies a claim comes within one poll interval of the claim message;
      a later re-read works nothing, and gives the claim back as 4.21 gives back a failed
      verification
- [ ] 2.8 Tests: a same-role loser keeps the label on the item; a late verification works
      nothing and, holding the item, removes the label and gives the claim back out loud; a claim
      message from before a release does not count
- [ ] 2.9 A claim message counts only when its timestamp is later than the item's latest release,
      read from the item's label events; a message in the release's second does not count, and
      the item is claimed at a later cycle. No process waits for the release's second to pass
- [ ] 2.10 A taker's claim message on a handed-over item carries a second trailer, after
      `Igor-Rank:`, recording the hand-over, exactly as below, where `<login>` is the person
      recorded as having handed the item over in the holding message it took over, or, where that
      message records no hand-over, the person who added the label; and the adapter reads an item whose holding claim message carries it as
      handed over by that person:

      ```text
      Igor-Handed-Over-By: <login>
      ```
- [ ] 2.11 Tests for 2.9, 2.10 and 2.14: a message in the release's second does not count; a
      superseded message does not count once its rank returns; a taken-over hand-over still
      reads as handed over, so that when the Igor later brings its own pull request for the item
      up to date and gives the claim back, the label stays, and a stop said on the item is not
      lifted by a later go-ahead, as for any handed-over item
- [x] 2.12 Measure on GitHub whether comment ids still ascend in the order of creation for claim
      comments posted on one issue within one second, by several ranks at once. Record the
      result in `design.md`, under *Ordering is the surface's sequence key, never a timestamp*.
      Measured 2026-10-19: within one second the ids never contradicted the seconds, and every
      listing returns comments in id order; `design.md` records it
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
- [x] 2.15 Measure on GitHub whether a label event's time and a comment's time on one issue come
      from one clock, to the second, so that a comment posted after a release never shows an
      earlier second. Record the result in `design.md`, under *Ordering is the surface's
      sequence key, never a timestamp*. Measured 2026-10-19: one clock, in whole seconds;
      `design.md` records it
- [ ] 2.16 Claim messages and their trailers are read only from comments the role's bot account
      wrote. Test: a person's comment carrying `Igor-Rank:` is not a claim message
- [ ] 2.17 A bot comment whose GraphQL `lastEditedAt` is set is not a claim message, and none of
      its trailers is read; a hidden, unhidden or reacted-to comment still counts. Test: an
      edited claim message adding `Igor-Supersedes:` or removing `Igor-Handed-Over-By:` changes
      nothing a process reads, and a hidden claim message still holds the item
- [x] 2.18 Before building 2.17, measure on GitHub whether an unedited bot comment keeps its
      updated time equal to its created time when people react to it, when it is hidden, and
      when its issue is transferred. Record the result in `design.md`. If any of them changes
      the updated time, 2.17 would make that claim message stop counting, so it goes back to
      Adam before it is built. Measured 2026-10-19: hiding changes `updated_at`, and Adam
      decided 2.17 reads `lastEditedAt` instead (`design.md`, *An edit is read from GraphQL
      `lastEditedAt`*)
- [ ] 2.19 Measure on GitHub which repository roles can edit or delete a comment the role's App
      wrote: write, triage, maintain or admin. Record the result in `design.md`. It is for
      information only: decision 30's accepted risk stands whatever it shows (Adam, 2026-10-21)
- [ ] 2.20 Trailers are read only from lines beginning with `Igor-` at their first character, and
      before posting any comment other than a claim message, the bot indents by one space each
      line of it that begins with `Igor-`, composed or interpolated, before #153 signs it
      (decisions 53 and 57). Test: a mention reply whose model text ends in
      `Igor-Rank: 1` and `Igor-Supersedes: 2` is posted with both lines indented, and no process
      reads it as a claim message
- [ ] 2.21 A process counts its role as run by several processes while any other process's
      heartbeat file, a serving rank's or a run's, is on the state branch and not gone, as well
      as while its roster declares several ranks (decision 56). Test: with the roster grown from
      `[1]` to `[1, 2]` and rank 1 still on the old one, rank 1 contests a hand-over once rank 2's
      file is there

## 3. Contention

- [ ] 3.1 Each item's owner is the rank at place `h mod n` in the roster's declared ranks in
      ascending order, where `h` is a hash of the item's id every process computes alike, such as
      the first eight bytes of its SHA-256 read as an unsigned number. The item's order of ranks
      is its owner, each declared rank after it, wrapping, then rank 0
- [ ] 3.2 A process attempts first the candidates it goes first for: those where no rank ahead of
      it in the item's order is available, by its own heartbeat read (4.11). Before claiming any
      other candidate it waits one settle interval per available rank ahead of it, re-reads, and
      posts only if no claim that counts is on it
- [ ] 3.3 Tests: the owner goes first; an owner whose heartbeat says it is not available passes
      the item to the next available rank; a rank behind the owner waits and posts nothing when
      the owner has claimed; two ranks that each judge themselves first resolve by verification
- [ ] 3.4 A hand-over among one role's ranks goes through the same contest: the rank that goes
      first posts at once; any other free rank waits as 3.2 says. A rank whose worker is running
      does not contend. The rank that posts verifies its claim after the settle interval
- [ ] 3.5 Tests for 3.4: the owner posts and the others post nothing; a busy owner leaves the
      item to the next available rank, which posts at once; two ranks that both post resolve by
      the earliest claim message
- [ ] 3.6 Only the first available rank in a chat message's order, by 3.1's hash of the
      message's id, creates an issue from it; with no rank available, the message waits for the
      next cycle (proposal, decision 58). Tests: of two available ranks reading one message, only
      its owner creates the issue; with the owner's heartbeat showing it unavailable, the next
      rank creates it

## 4. Recovery

- [ ] 4.1 A claim whose earliest counted claim message carries this process's own rank is taken
      and the item re-worked
- [ ] 4.2 A claim carrying another rank that is not gone is left alone
- [ ] 4.3 A claim carrying a rank the roster does not declare is adoptable only once that rank
      is gone
- [ ] 4.4 Every serving process overwrites `heartbeats/<role>-<rank>.json` on the state branch,
      and each `igor run` overwrites `heartbeats/<role>-0-<run id>.json`, every half
      poll interval, from the timer of 4.15, which keeps running while a worker runs. The file holds an id the
      process chose at random when it started, a counter it increments on each write, and
      whether the process is available: free, with no claim in hand and not stood down, and with
      a seat it can spend by #143's *A role has a seat it can spend when the gate would choose one
      now*, the poll interval the process applies, and the state-directory id of the state
      directory it uses, read as #216 defines it, or none where it reads none (decision 55). It holds no time. Each process keeps in memory, per sibling, the id and counter it last read from the
      sibling's file and when, by its own clock, it last saw them change. A claim is adoptable
      once three poll intervals, as 4.27 measures them, have passed since then, or since this
      process started if later. A missing file does not change
- [ ] 4.5 Working trees are named `<role>-<rank>-<id>`, with an id holding no dash, and read from
      the end of the name. At startup a serving process removes those of its own
      role and rank. At the start of each cycle it removes those of every rank the roster does not
      declare and that is gone to it. Never by age. With each tree go its outbox and its
      `<tree>-git` and `<tree>-prompt` directories, where there are any. Each tree and its
      outbox are removed as the worker user of the rank that made it, as #175's release removes
      them, and each `<tree>-git` and `<tree>-prompt` as the service user. A serving process never removes a tree of rank 0. Each `igor run`
      picks a run id of eight lowercase letters and digits at its start, names every tree it
      makes `<role>-0-<id>` with an id starting with that run id, and removes each of its own
      trees as it releases it when the task ends, under its own user. Each run holds an
      exclusive lock on `<role>-0-<run id>.lock` in the trees' directory while it runs; at its
      start, before its first cycle, it finds every other run of its role whose lock it can take.
      For each such run it removes the run's trees, with their outboxes, `<tree>-git` and
      `<tree>-prompt`, and #174's home and plugin directory of that run, and then that run's lock file. `igor run --plan`
      removes nothing. Tests: two runs at once each keep and remove only their own trees; a run
      removes what a crashed run left and leaves what a live run holds; `--plan` removes no tree
- [ ] 4.6 Remove `ABSOLUTE_CEILING_MS`, the worker's kill at it, and the failure reason that names it
- [ ] 4.7 `docs/architecture.md` §6.7.2 pins the sweep threshold to that ceiling; restate it to
      describe the sweep by rank
- [ ] 4.8 Tests for each of 4.1–4.4, and for the `work-claiming` scenarios on a lost state branch
      (no live rank's claim is taken) and a restart while a file is missing (the clock starts
      again); and that the abandonment bound never shortens a run: a run longer than
      three poll intervals keeps its rank counted
- [ ] 4.9 While it works a `condition-backoff` probe item, the process that took the probe
      appends a keepalive row to the execution log every poll interval, from its heartbeat
      timer, naming its probe row, and stops the probe's worker and gives the claim back where
      two keepalive appends in a row fail, an append counting as failed where it has not landed
      within half a poll interval (decision 61); a
      probe lapses once 90 minutes, three of the maximum poll interval, pass since its latest
      keepalive row, or since its probe row where it has none, instead of after `SWEEP_AFTER_MS`
      (decision 22). #101's code is on `main`, so this change's build replaces its
      `SWEEP_AFTER_MS` lapse with the keepalive lapse. Tests: a
      probe worked for three hours with keepalives does not lapse; a prober whose keepalive
      appends fail twice in a row stops its worker; a probe whose rank crashed
      lapses after 90 minutes for a process of another role
- [ ] 4.10 A process's first heartbeat lands before its first cycle
- [ ] 4.11 A process reads its role's heartbeat files before choosing each candidate and again
      before verifying a claim, all of them with their contents in one request, such as one
      GraphQL query for the `heartbeats/` tree's entries with each blob's text. A file has
      changed when it has a blob id other than the one this process last read. Measure that the
      request returns every file's blob id and text, and record in `design.md` which rate limit
      it spends
- [ ] 4.12 Taking an item over a gone rank's claim message removes the role's label and adds it
      again, then posts the claim message at once. On an item with the Igor's open pull request
      it releases nothing, as 4.16 says
- [ ] 4.13 A process that has failed to write its heartbeat for two poll intervals, as 4.27
      measures them, starts no claim,
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
      under the last configuration that passed and raises #208's `lore:config:<role>`, naming
      the failing file and check; it never exits for it. Whether it is of the read-cleared kind
      #171 (`seat-files`) defines is open (proposal, *Still open*). The condition opens, clears
      and does not reopen exactly as #208's `lore-pull` requirements say, its limits on clearing by a head that no
      longer holds the refused commit included; this task restates none of them. A roster that
      drops the process's own rank is no failed check: that read passes and retires the rank.
      Whichever of #171, #208 and this build lands last wires the condition to those rules. Each
      process applies the newest lore commit it has fetched, with no coordination between ranks.
      Test: a malformed roster at a cycle keeps the last roster and raises the condition, and a
      fixed commit descending from it clears it; a roster that drops the rank retires it
- [ ] 4.18 Tests for 4.16 and 4.17: a recovered claim with the Igor's pull request open is caught
      up, whether its own predecessor's or a gone sibling's, and a person's label stays; a
      returning rank does not count its superseded message; a rank removed from the roster is
      not adopted while its heartbeat changes; a process whose rank leaves the roster finishes or
      hands off its item and exits
- [ ] 4.19 Measure the requests to GitHub's `core` REST rate limit that one rank makes in one
      cycle, with two and with three ranks running. Measure the `core` limit an App installation
      gets, which is not the 5,000 an hour measured on a personal account, and record in
      `design.md` how many ranks one App's limit allows at the default poll. Measured so far
      (2026-10-19): a tree read and a Contents PUT cost one `core` request each; the rest waits
      on a running multi-rank Igor and an App's key
- [ ] 4.20 PR #175 (`worker-user`) adds a git directory, `<tree>-git`, beside each tree. 4.5
      sweeps it already, assuming that name; check the name against #175 as merged. Trees and
      their git directories live in `<state dir>/trees` (1.8). #175 keeps `PrivateTmp=true`
      for everything else, and records its side of this itself, including the sibling's removal
      as the gone rank's worker user (4.5)
- [ ] 4.21 Only the rank whose claim message holds an item removes the role's label: a
      withdrawal after a failed post or a failed verification, setting an item down after a
      repeated failure before the worker (#173), and answering a stop. Any other rank drops out
      silently, removing and posting nothing. After a failed post or verification, the process
      reads the item's claim messages (#173's test): another process's message counting means
      silence; its own message holding means a withdrawal, out loud, whose removal follows a
      fresh read of the heartbeat files and claim messages and happens only where its own
      message still holds the item; no message counting means out loud, with #173's refusal and
      the label left, except as 4.26 says; a failed read means nothing now and a reread at the next cycle's
      start, or before `igor run` exits, which decides the same way. A reread that fails again
      is #173's unreadable claim: it counts one `tracker` failure toward the item's breaker, and
      gives the claim back with the refused run's post, or at the third in a row sets the item
      down with the set-down post, leaving the label either way (decision 52). Which failures count toward a set-down, and what is
      posted, are #173's rules; whichever of #173's build and this build lands second wires
      them to the holder test here
- [ ] 4.22 A stop said on a handed-over item is answered only by the rank whose claim message
      holds it; other ranks ignore it. Where no claim message counts, the rank that reaches the
      item answers it
- [ ] 4.23 Tests for 4.21, 4.22 and 4.26: a rank that does not hold the item and fails its
      verification leaves the label; a holder whose verification fails withdraws out loud; a
      claim message posted between the test and the removal keeps the label on; a failed test
      is read again at the next cycle; a failed post sends the removal of the label it set
      while under half a settle interval has passed since it started setting it, and later
      sends no removal and leaves the label; the holder sets an item down; a stop on a handed-over item a sibling
      works is ignored by the other rank; a stop on a hand-over nobody has claimed is answered
- [ ] 4.24 A heartbeat read is used only to judge whether each file changed and whether its
      rank is available. A process does not stop for anything it finds in its own file, such
      as another process's id after a lost or rolled-back state branch: keeping one serving
      process per rank is the operator's. Test: a lost or rolled-back state branch stops no
      process
- [ ] 4.25 A process exiting because the roster no longer declares its rank logs the line below,
      as written, and exits with status 0. Test: the status and the line

      ```text
      The roster no longer declares rank <rank> of <role>. Exiting; systemd will not restart this rank.
      ```
- [ ] 4.26 A process that set the role's label in this claim and whose claim message failed to
      post removes that label where its test finds no claim message that counts. It checks the
      time before sending the removal: it sends it only while less than half a settle interval
      has passed since it started to set the label, by its own monotonic clock, and otherwise
      sends none and leaves the label. This is the first listed exception to
      4.21 (Adam, 2026-10-21); 4.22's stop on an item no claim message holds is the second
- [ ] 4.27 Each process keeps, from its start, the shortest poll interval it has applied, and,
      per sibling, the longest interval it has seen that sibling's heartbeat declare in a write:
      a heartbeat whose counter changed since the last read. It forgets every sibling's
      declarations when it detects a loss or rollback of the state branch: a serving rank's file it
      had read is missing, not a run's, which a run removes as it exits or a serving process
      removes once it counts the run gone, or a sibling file's counter
      is lower than the one last read under the same process id; a new id is a restart, not a
      loss. It counts a sibling
      gone after three of the longest of its own current interval and the intervals it keeps for
      that sibling, or after three of the maximum poll interval, 30 minutes, where it keeps none; it stands down after two of its
      shortest applied interval; it writes its heartbeat every half of its own current interval.
      The process's own restart starts all of it afresh. Tests: a process that saw a sibling declare 20 minutes
      counts it gone only after 60 minutes; one on 10 minutes that saw only 10, after 30; one on
      20 minutes that saw only 10, after 60; a process
      that has just started, or has just found a sibling's file missing, counts in the maximum
      until that sibling's next heartbeat lands, and so counts it gone only after 90 minutes; a process that started on 10
      minutes and applied 20 stands down after 20 minutes (Adam, 2026-10-21 and 2026-10-24)
- [ ] 4.28 Loading the configuration refuses a poll interval above the maximum of 30 minutes,
      naming the value and the maximum, and so does `igor serve --poll` given a value above it;
      a process refusing to start for either exits with status 78.
      The maximum is a constant in Igor, not a setting. Test: a role setting 45 minutes is
      refused with both values named

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
      early holds its mark back, a stand-down among them through this change's `MODIFIED` block on that
      requirement. Build the hold-back for a stand-down as that rule holds it back for an
      exhausted budget. #101 is merged and archived; the block matches its in-force text apart
      from the stand-down and the rewording of #101's watermark sentence that the proposal's *Still
      open* lists
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
      request has updated since this process last triaged it, the pull request no longer
      merges, or it carries a review to act on, #150's actionable review (`work-triage`), over
      which the holder resumes the item with a worker as #150 builds. Keep each item's last
      triage time in memory. Test: no triage call for an unchanged item; a new comment, or a pull
      request that stops merging, brings one; a change request brings a worker

## 6. Documentation

- [ ] 6.1 `docs/deployment.md`: running several processes, ranks, the roster, and the role's
      environment file. Say this about the file, as written:

      ```text
      Write each value in /etc/igor/<role>.env in single quotes, as KEY='value', or plain, using only letters, digits and _ . / : @ -. Igor reads this file itself, takes a single-quoted value exactly as written, and refuses to start on any other line, naming its line number and nothing of its content. A single-quoted value may span lines, as a private key does, but cannot hold a single quote.
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
- [ ] 6.5 `docs/deployment.md` says that a rank the roster no longer declares exits with status 0
      and stays down, and that it runs again only once the roster declares it. It says the
      abandonment bound, the heartbeat period and the stand-down threshold follow the poll
      interval and have no settings of their own, and that the settle interval must be shorter
      than the poll interval
- [ ] 6.6 `docs/deployment.md` says `igor run` runs as rank 0 beside any serving rank, that
      two people may run `igor run` for one role at once, each with its own run id, trees,
      home and heartbeat file, and that a run removes at its start what a crashed run left
- [ ] 6.7 At archive, point `.github/workflows/tla-concurrent-instances.yml`'s paths and working
      directory at where the model then lives, so TLC keeps checking it
- [ ] 6.8 `deploy/docker-compose.yml` sets `STATE_DIRECTORY` and mounts its `igor-trees` volume at
      `$STATE_DIRECTORY/trees`, where 1.8 puts the trees, in place of `/tmp`, and its comment says
      so. Without it, trees move to `~/.local/state/igor/trees` inside the container and the
      volume holds nothing
