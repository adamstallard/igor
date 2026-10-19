## 0. Before building

- [ ] 0.1 Build after #171 (`seat-files`), #179 (`concurrent-instances`) and #82
      (`stopped-scope-visible`) are built: this change uses #171's seat files, read-cleared
      condition and seat removal, #179's per-cycle reread and heartbeat timer, and modifies #82's
      requirement
- [ ] 0.2 Read Adam's answers to the proposal's *Still open* questions and proposed decisions,
      which go into the proposal's *Decisions* section and this pull request's body, and change
      the named requirements where an answer differs from the recommendation

## 1. Fetching

- [ ] 1.1 `igor serve` refuses to start where the lore checkout has no branch checked out or its
      branch has no upstream, where the upstream's remote URL is not a credential-free
      `https://github.com/` URL, or where the checkout's git config sets a key under `url.`,
      `http.`, `credential.`, `filter.`, `include.` or `includeIf.`, or `core.fsmonitor`,
      `core.sshCommand` or `core.gitProxy`, naming the checkout and what is wrong
- [ ] 1.2 Fetch once per poll interval of the configuration in force, on #179's heartbeat timer at
      every second firing, with the command `design.md` gives: the repository's URL named
      outright, into `refs/igor/lore/<role>-<rank>/fetched`, with no hook, no auto-gc, no
      `FETCH_HEAD`, no system-wide or per-user git config, and the App's token supplied for that
      command only by the credential helper `src/worktree.ts` uses. Run it as a child process
      that never holds up the heartbeat write, and kill one still running when the next fetch is
      due
- [ ] 1.3 A failed fetch, a lock failure or a killed fetch included, is retried at the next
      firing and opens no condition; each cycle report until a fetch succeeds gives the age of
      the process's last successful fetch, or "none since start"
- [ ] 1.4 `igor serve` installs its `SIGHUP` handler before anything else at start. `SIGHUP`
      triggers a fetch at once, and the signal ends nothing and interrupts no worker.
      `deploy/igor.service` gains this line, with this comment above it, which may be reworded:

      ```ini
      # `systemctl reload igor@<role>-<rank>` makes the Igor fetch its lore repository now,
      # instead of within the next poll interval.
      ExecReload=/bin/kill -HUP $MAINPID
      ```
- [ ] 1.5 Measure on a Linux host: four processes fetching into their own refs and checking out
      their own worktrees of one repository at the same moment, a hundred times, counting lock
      failures; and how long one fetch of the lore repository takes. Record both in `design.md`
- [ ] 1.6 Measure with the shipped compose file that `docker compose kill -s HUP <service>`
      reaches `igor serve`, which fetches and keeps running. Record it in `design.md`

## 2. Reading one commit

- [ ] 2.1 Create or repair the process's own worktree at `.igor/worktrees/<role>-<rank>` inside the
      lore checkout, and append `.igor/` to `.git/info/exclude` where that line is missing. Never
      run `git worktree prune`
- [ ] 2.2 Before each lore read, check out the commit in the worktree with `--force --detach`,
      hooks disabled and no system-wide or per-user git config, then `git clean -ffdx`
- [ ] 2.3 Load the configuration, role files, seat files and, where `destination` is the lore
      repository, the lore entries, from the worktree. A relative path resolves against the lore
      checkout's root; where the result lies inside the checkout, read that path in the
      worktree, and where it lies outside, read that file
- [ ] 2.4 Each cycle report names the commit applied
- [ ] 2.5 Tests: the scenarios of *`igor serve` fetches its lore repository once per poll
      interval* and *A process applies one lore commit at a time, whole*

## 3. Starting and applying

- [ ] 3.1 At start, fetch and read `fetched`; with no `applied` ref, the configuration holds the
      seats the fetched commit holds; with no `fetched` ref and a failed fetch, set it
      from the checkout's remote-tracking ref. Where that commit fails and `applied` exists and
      passes, start on `applied` with the condition open; with no `applied`, or an `applied` that
      fails too, refuse to start, naming the commits read. Either way, leave out every seat task
      4.1 leaves out
- [ ] 3.2 At start, report each uncommitted change, and each local commit the `fetched` commit
      does not hold, as not applied, naming them
- [ ] 3.3 At the start of each cycle, read the commit `fetched` names, decrypting seat files as
      #171 says. A configuration that no longer declares the process's role, or lacks its role
      file, fails. A passing read moves `applied` to it. A refused read keeps the commit `applied`
      names, with the seats task 4.1 leaves out, and opens the read-cleared condition
      `lore:config:<role>-<rank>`, whose report names the commit, the file and the check and
      quotes no value from the file. A passing read clears it
- [ ] 3.4 A fetch never changes the configuration or lore entries of the cycle already running
- [ ] 3.5 Tests: the scenarios of *`igor serve` starts on the newest commit that passes*, *A lore
      read at each cycle start applies what passes and refuses what fails* and *Processes apply
      new commits independently*

## 4. Removed seat files

- [ ] 4.1 After each fetch, list with `git log --diff-filter=D <applied>..<fetched> -- seats/`
      every seat file a commit since the applied one deleted, and apply each removal at once
      through #171's task 3.7b, which drops the token, kills the workers using the seat and
      hands off their items, even while a worker runs and even where the commit fails. Leave each
      such seat out of the configuration in force until a read that passes holds its file
      again, through later refused reads and restarts
- [ ] 4.2 Drop the seat from the set new workers draw on before killing the workers using it, so
      that no worker started during the removal receives its token
- [ ] 4.3 Tests: the scenarios of *A removed seat file applies as soon as a fetch brings it*

## 5. The seat notice

- [ ] 5.1 When a lore read passes, compare its commit's seat files with those of the commit the
      applied ref names, before moving the ref; a process with no applied ref compares nothing
- [ ] 5.2 Add to `src/state.ts` a create-only write: a Contents API `PUT` without a `sha`, which
      reports whether it created the file, found it existing, or failed otherwise. First
      measure that GitHub refuses such a `PUT` on an existing file, and record the result in
      `design.md`
- [ ] 5.3 For each seat file changed, not added, create
      `notices/seats/<seat-id>/<commit-id>.json` on the state branch with that write, the commit
      being the most recent one that changed the file. Post only where the write created it;
      retry a write that failed otherwise at each later passing read while the process runs
- [ ] 5.4 Post on the merged pull request that brought that commit, found through GitHub's list
      of pull requests for a commit; where none, post a commit comment. Mention the owner the
      file names in that commit's first parent, and also the owner the commit applied before
      names where that differs; mention nobody #171's seat-notice workflow would
      not mention; and post nothing where nobody is left. The notice reads as follows, and may be
      reworded:

      ```text
      @<owner>: this change to `seats/<seat-id>.yaml` has landed, and Igor now reads it.
      If you did not expect it, revoke your token at Anthropic.
      ```
- [ ] 5.5 Tests: the scenarios of *Igor posts at most one notice for each seat-file change it
      applies*, with three processes applying one commit and exactly one notice posted

## 6. Removing what called pulling future work

For each item, edit the change if it is still open when this is built, or the in-force spec or
doc if it has archived. An archived change's own proposal and design are records of their time
and are left alone.

- [ ] 6.1 #82: this change's `stuck-conditions` delta replaces *An open condition never ends a
      running service* when this change archives, after #82. Before archiving, recopy #82's
      requirement as it is then in force into the delta, and change two things only: its lore
      sentence, which becomes "A fix in the lore repository SHALL reach the running process
      without a restart, as `lore-pull` specifies", and the steps of its scenario *A fix in the
      lore repository while the service runs*, whose name stays, since OpenSpec refuses a
      `MODIFIED` block that drops a scenario the in-force requirement has. If #82 is still open when this is built, also
      rewrite its task 0.3, its decision 6 and the passage in its `design.md` so that none says a
      lore fix waits for a restart
- [ ] 6.2 #171: in `seat-budget`, *A seat's token travels as ciphertext in its file* decrypts "at
      start, and on each lore read, which `lore-pull` makes at the start of every cycle", in
      place of "at start, and on each pull of its lore checkout once #176 specifies one"; and *A
      removed seat file always takes effect* says "When a fetch of the lore repository brings a
      commit that removes a seat file", in place of "When a pull of the lore checkout (#176)
      removes a seat file", and loses "Until #176 specifies pulling, a seat file leaves a running
      process only when it restarts". Its scenario *A push runs no notice workflow* says that the
      workflow does not run and Igor's notice comments on the commit once a process applies it,
      in place of "nothing comments on the commit". While #171 is open, also rewrite its task
      3.7b's wait on #176, and the passages in its `proposal.md` and `design.md` that say Igor
      does not pull yet
- [ ] 6.3 #179: while it is open, rewrite its `proposal.md` item that a roster change waits on #176, and
      its `design.md` sentence "Until #176 builds pulling, that checkout changes only when a person
      pulls it on the host"
- [ ] 6.4 `docs/deployment.md` says how a merged lore change reaches a running Igor: within one
      poll interval, at once with `systemctl reload` or `docker compose kill -s HUP <service>`,
      and that a refused change shows as the condition `lore:config:<role>-<rank>`. It says local
      edits on the server are not applied by `igor serve`, and that `igor run` on the server
      reads the shared checkout, which nothing updates, so a person pulls it before a run by
      hand. Remove any sentence, including #82's task 4.2 text, saying that a lore change needs a
      restart. A change to the unit's environment file still does

## 7. Closing out

- [ ] 7.1 `docs/architecture.md` §6.7 says that `igor serve` applies the lore repository's branch
      as fetched, never the server checkout's local edits
- [ ] 7.2 Archive in the place issue #204 gives this change, after #82, when every requirement
      holds; file an issue for any task left open, and tick it with a pointer to that issue
