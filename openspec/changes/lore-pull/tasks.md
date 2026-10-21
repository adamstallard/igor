## 0. Before building

- [ ] 0.1 Build after #171 (`seat-files`), #179 (`concurrent-instances`) and #82
      (`stopped-scope-visible`) are built: this change uses #171's seat files, read-cleared
      condition and seat removal, #179's per-cycle reread and heartbeat timer, and modifies #82's
      requirement
- [ ] 0.2 Read Adam's answers to the proposal's *Still open* questions, which go into the
      proposal's *Decisions* section and this pull request's body, and change the named
      requirements where an answer differs from what they are written to

- [ ] 0.3 Four facts are measured before the code that rests on them is built: tasks 1.5, 1.6,
      5.2 and 5.4 each record one in `design.md`

## 1. Fetching

- [ ] 1.1 `igor serve` refuses to start where the lore checkout has no branch checked out or its
      branch has no upstream, where the upstream's remote URL is not a credential-free
      `https://github.com/` URL, or where the checkout's git config sets a key under `url.`,
      `http.`, `credential.`, `filter.`, `include.`, `includeIf.` or `submodule.`, or
      `core.fsmonitor`, `core.sshCommand`, `core.gitProxy`, `core.askPass`,
      `core.alternateRefsCommand` or `extensions.worktreeConfig`, naming the checkout and what is
      wrong, and a key by its section and last part only (`url.*.insteadOf`). Fetch with
      `--no-recurse-submodules`. Check again before each git command in the checkout; where such
      a key has appeared, run none, count a due fetch as failed and a read as a local fault, and
      name the key the same way in each cycle report
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
- [ ] 1.6 Measure with the shipped compose file and #192's image that `docker compose kill -s HUP
      <service>` reaches `igor serve` through `tini`, and that `igor serve` fetches and keeps
      running. Record it in `design.md`
- [ ] 1.7 Pass `-c safe.directory=<checkout>` to every git command in the checkout and the
      process's worktree, and test it in a checkout owned by another user

## 2. Reading one commit

- [ ] 2.1 Create or repair the process's own worktree at `.igor/worktrees/<role>-<rank>` inside the
      lore checkout, with hooks disabled and no system-wide or per-user git config, and append `.igor/` to `.git/info/exclude` where that line is missing. Never
      run `git worktree prune`
- [ ] 2.2 Before each cycle start's lore read, check out the commit in the worktree with `--force
      --detach`, hooks disabled and no system-wide or per-user git config, then `git clean
      -ffdx`. After a refused read or a local fault, check out the `applied` commit again the
      same way. Where that fails too, run the cycle on the configuration and lore entries of the
      last passing read, kept in memory, read nothing from the worktree, and try the checkout
      again at the next cycle start; each cycle start where it fails is a local fault toward task
      3.3b's count. A read of one file mid-cycle reads the worktree as it stands
- [ ] 2.3 Load the configuration, role files, seat files and, where `destination` is the lore
      repository, the lore entries, from the worktree. A relative path resolves against the directory
      holding `igor.config.yaml` in the lore checkout; where the result lies inside the checkout, read that path in the
      worktree, and where it lies outside, read that file
- [ ] 2.4 Each cycle report names the commit applied
- [ ] 2.5 Tests: the scenarios of *`igor serve` fetches its lore repository once per poll
      interval* and *A process applies one lore commit at a time, whole*

## 3. Starting and applying

- [ ] 3.1 At start, fetch and read `fetched`; with no `applied` ref, the configuration holds the
      seats the fetched commit holds; with no `fetched` ref and a failed fetch, set it
      from the checkout's remote-tracking ref. Where that commit fails and `applied` exists and
      passes, start on `applied` with the condition open; with no `applied`, or an `applied` that
      fails too, refuse to start, naming the commits read. A first read that fails for a local
      reason exits with status 1, with no fallback. Judge `applied` with every seat file it holds, so that a
      removed seat cannot make the commit that held it fail, then leave out every seat task 4.1
      leaves out, even where that leaves a role with no seat. A
      fetched commit whose roster drops the rank is refused as #179 says, with no fallback; an App
      check GitHub does not answer exits with status 1, as #82 says, not 78
- [ ] 3.2 At start, report each uncommitted change, and each local commit the `fetched` commit
      does not hold, as not applied, naming them
- [ ] 3.3 At the start of each cycle, read the commit `fetched` names, decrypting seat files as
      #171 says. A configuration that no longer declares the process's role, or lacks its role
      file, fails. A roster that drops the rank does not fail the read; the rank retires as #179
      says. An App check GitHub does not answer fails no read: the cycle runs on the applied
      commit with no condition. A passing read moves `applied` to it. A refused read keeps the commit `applied`
      names, with the seats task 4.1 leaves out, and opens the read-cleared condition
      `lore:config:<role>` where it is not open, whose report names the commit, the file and the
      check and quotes no value from the file, and records the refused commit. A passing read by
      any rank of the role clears it in two cases. One: the commit read is the refused one or
      descends from it (`git merge-base --is-ancestor`). Two: the commit read is the rank's
      fetched head, it does not descend from the refused commit, the fetch that brought it
      started after the rank first knew the condition was open (keep, in memory, whether each
      fetch began after that; compare no clock with another process's), and the rank's object
      store holds the refused commit. A passing read of any other commit leaves it open. The
      clearing record names the commit read. A refused read of the refused commit, or of the
      clearing commit or one of its ancestors, does not reopen it, unless the App check refused
      it or the read is at process start. Task 3.5 writes the tests for every scenario of the
      requirement; the six this rule adds are *A force-push that drops the refused commit clears
      it*, *A force-push back to the refused commit's parent clears it*, *A head fetched before
      the refusal clears nothing*, *A rank that rereads the refused commit does not reopen it*,
      *A commit before the fix does not reopen it* and *A new bad commit after the fix reopens
      it*
- [ ] 3.3b A read that fails while putting the commit in the worktree or reading a file from it,
      the stages `design.md` names, is a local fault: run the cycle on `applied`, open or clear
      no `lore:config:<role>`, and read again at the next cycle start. At the third such cycle
      start in a row, open `lore:read:<role>-<rank>` naming the failed operation and the kind of
      fault, with no path outside the checkout and no text of git's error; the process's next read
      that is not a local fault clears it
- [ ] 3.4 A fetch never changes the configuration or lore entries of the cycle already running
- [ ] 3.5 Tests: the scenarios of *`igor serve` starts on the newest commit that passes*, *A lore
      read at each cycle start applies what passes and refuses what fails* and *Processes apply
      new commits independently*

## 4. Removed seat files

- [ ] 4.1 After each fetch, list with the two commands `design.md` gives every seat file that some commit since the applied one deleted or the fetched commit lacks, and apply each removal at once
      through #171's task 3.7b, which drops the token, kills the workers using the seat and
      hands off their items, even while a worker runs and even where the commit fails. Leave each
      such seat out of the configuration in force until a read that passes holds its file
      again, through later refused reads and restarts
- [ ] 4.2 Drop the seat from the set new workers draw on before killing the workers using it, so
      that no worker started during the removal receives its token
- [ ] 4.3 Tests: the scenarios of *A removed seat file applies as soon as a fetch brings it*
- [ ] 4.4 Test that the commands list a seat file renamed in a commit, one deleted only in a
      merge commit's resolution, and one missing after a force-push to a commit that does not
      descend from `applied`

## 5. The seat notice

- [ ] 5.1 When a lore read passes, compare its commit's seat files with those of the commit the
      applied ref names, before moving the ref; a process with no applied ref compares nothing
- [ ] 5.2 Add to `src/state.ts` a create-only write: a Contents API `PUT` without a `sha`, which
      reports whether it created the file, found it existing, or failed otherwise. It passes its
      content and commit message through the credential redaction `writeState` and
      `appendRecord` apply (pull request #217, for issue #213). First
      measure that GitHub refuses such a `PUT` on an existing file, and record the result in
      `design.md`
- [ ] 5.3 For each seat file whose name has a seat id's form, changed and still at the same path
      or added, never one
      deleted or renamed (git's rename detection pairs a renamed file with a deleted one), create
      `notices/seats/<seat-id>/<commit-id>.json` on the state branch with that write, the commit
      being the most recent one that changed the file. Post only where the write created it;
      retry a write that failed otherwise at each later passing read while the process runs
- [ ] 5.4 Post on the merged pull request that brought that commit, found through GitHub's list
      of pull requests for a commit; where none, post a commit comment. For a changed file,
      mention the owner the file names in the first parent of 5.3's commit, the most recent one
      that changed the file, and also the owner the
      commit applied before names where that differs; for an added file, the owner it names; mention no owner who both opened the pull request and pushed that commit to it,
      as #171's decision 44 settles it, so a lender is mentioned where someone else pushed to the
      pull request they opened, and no `owner` without a GitHub login's form; mention an owner even
      where #171's workflow already mentioned them on that pull request; and post nothing where
      nobody is left. Where a squash or rebase merge made the commit, judge the push that
      brought the pull request's own last commit changing the file; first measure what GitHub's
      list of pull requests for a commit returns for such a commit, and record it in
      `design.md`. The notice reads as follows, and may be
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
- [ ] 6.2 #171: in `seat-budget`, *A seat's token travels as ciphertext in its file* says "at
      start, and at each cycle start, where #179 rereads the configuration and #208 makes its
      lore read", in place of "at start, and at each cycle start, where #179 rereads the
      configuration and, once built, #208 makes its lore read", #208 being this change's pull
      request, and loses "Until #208 pulls the checkout, the seat files change only when someone
      updates the checkout by hand." *A removed seat file always takes effect* says "When a fetch
      of the lore repository (`lore-pull`) brings a commit that lacks a seat file", in place of
      "When a pull of the lore checkout (`lore-pull`, #208) removes a seat file"; says "The
      removal applies as soon as the fetch brings it, as `lore-pull` specifies", in place of
      "The removal applies at the next cycle start's lore read."; and loses "Until #208 pulls the
      lore checkout, a seat file leaves the checkout only when someone updates the checkout by
      hand." Its scenario *A push runs no notice workflow* says that the
      workflow does not run and Igor's notice comments on the commit once a process applies it,
      in place of "nothing comments on the commit". While #171 is open, also rewrite its task
      3.7b where it waits on #176, the issue this change specifies, or on #208, whichever it names, and the passages in its `proposal.md` and `design.md` that say Igor
      does not pull yet
- [ ] 6.3 #179: while it is open, rewrite its `proposal.md` item that a roster change waits on #176, and
      its `design.md` sentence "Until #176 builds pulling, that checkout changes only when a person
      pulls it on the host"
- [ ] 6.4 `docs/deployment.md` says how a merged lore change reaches a running Igor: within one
      poll interval, at once with `systemctl reload` or `docker compose kill -s HUP <service>`,
      and that a refused change shows as the condition `lore:config:<role>`, and a fault on one
      server's disk or worktree as `lore:read:<role>-<rank>`. It says local
      edits on the server are not applied by `igor serve`, and that `igor run` on the server
      reads the shared checkout, which nothing updates, so a person pulls it before a run by
      hand. Remove any sentence, including #82's task 4.2 text, saying that a lore change needs a
      restart. A change to the unit's environment file still does

## 7. Closing out

- [ ] 7.1 `docs/architecture.md` §6.7 says that `igor serve` applies the lore repository's branch
      as fetched, never the server checkout's local edits
- [ ] 7.2 Archive in the place issue #204 gives this change, after #82, when every requirement
      holds; file an issue for any task left open, and tick it with a pointer to that issue
