## 0. Before building

- [ ] 0.1 Build after #171 (`seat-files`), #179 (`concurrent-instances`) and #82
      (`stopped-scope-visible`) are built: this change uses #171's seat files, read-cleared
      condition and seat removal, #179's per-cycle reread and heartbeat timer, and modifies #82's
      requirement
- [ ] 0.2 Read Adam's answers to the proposal's *Still open* questions, and change the named
      requirements where an answer differs from the recommendation

## 1. Fetching

- [ ] 1.1 `igor serve` refuses to start where the lore checkout's branch has no upstream, where
      the upstream's remote URL is not a credential-free `https://github.com/` URL, or where the
      checkout's git config sets `url.<base>.insteadOf`, naming the checkout and what is wrong
- [ ] 1.2 Fetch once per poll interval, on #179's heartbeat timer at every second firing, with the
      command `design.md` gives: the repository's URL named outright, into
      `refs/igor/lore/<role>-<rank>/fetched`, with no hook, no auto-gc and no `FETCH_HEAD`, and
      the App's token supplied for that command only by the credential helper `src/worktree.ts`
      uses
- [ ] 1.3 A failed fetch, a lock failure included, is reported in the next cycle report with the
      age of the process's last successful fetch, or "none since start", retried at the next
      firing, and opens no condition
- [ ] 1.4 `SIGHUP` triggers a fetch at once, and the signal ends nothing and interrupts no worker.
      `deploy/igor.service` gains this line, with this comment above it, which may be reworded:

      ```ini
      # `systemctl reload igor@<role>-<rank>` makes the Igor fetch its lore repository now,
      # instead of within the next poll interval.
      ExecReload=/bin/kill -HUP $MAINPID
      ```
- [ ] 1.5 Measure on a Linux host: four processes fetching into their own refs and checking out
      their own worktrees of one repository at the same moment, a hundred times, counting lock
      failures; and how long one fetch of the lore repository takes. Record both in `design.md`

## 2. Reading one commit

- [ ] 2.1 Create or repair the process's own worktree at `.igor/worktrees/<role>-<rank>` inside the
      lore checkout, and list `.igor/` in `.git/info/exclude`. Never run `git worktree prune`
- [ ] 2.2 Before each lore read, check out the commit in the worktree with `--force --detach` and
      hooks disabled, then `git clean -ffdx`
- [ ] 2.3 Load the configuration, role files, seat files and, where `destination` is the lore
      repository, the lore entries, from the worktree. A relative path that resolves inside the
      repository is read from the worktree; one that resolves outside it resolves against the
      lore checkout's directory
- [ ] 2.4 Each cycle report names the commit applied
- [ ] 2.5 Tests: the scenarios of *`igor serve` fetches its lore repository once per poll
      interval* and *A process applies one lore commit at a time, whole*

## 3. Starting and applying

- [ ] 3.1 At start, fetch and read `fetched`; with no `fetched` ref and a failed fetch, set it
      from the checkout's remote-tracking ref. Where that commit fails and `applied` exists, start
      on `applied` with the condition open; with no `applied`, refuse to start. Either way, drop
      every seat file the `fetched` commit lacks
- [ ] 3.2 At start, report each uncommitted change and each local commit missing from the upstream
      as not applied, naming them
- [ ] 3.3 At the start of each cycle, read the commit `fetched` names, decrypting seat files as
      #171 says. A passing read moves `applied` to it. A refused read keeps the commit `applied`
      names, with any seat removals applied since, and opens the read-cleared condition
      `lore:config:<role>-<rank>`, whose report names the commit, the file and the check. A
      passing read clears it
- [ ] 3.4 A fetch never changes the configuration or lore entries of the cycle already running
- [ ] 3.5 Tests: the scenarios of *`igor serve` starts on the newest commit that passes*, *A lore
      read at each cycle start applies what passes and refuses what fails* and *Processes apply
      new commits independently*

## 4. Removed seat files

- [ ] 4.1 After each fetch, list `seats/` in the fetched commit with `git ls-tree`, and apply each
      removal at once through #171's task 3.7b, which drops the token, kills the workers using
      the seat and hands off their items, even while a worker runs and even where the
      commit fails. Keep the removed seat out of the configuration in force from then on,
      through later refused reads and restarts
- [ ] 4.2 Drop the seat from the set new workers draw on before killing the workers using it, so
      that no worker started during the removal receives its token
- [ ] 4.3 Tests: the scenarios of *A removed seat file applies as soon as a fetch brings it*

## 5. The seat notice

- [ ] 5.1 When a lore read passes, compare its commit's seat files with those of the commit the
      applied ref names, before moving the ref; a process with no applied ref compares nothing
- [ ] 5.2 For each seat file added or changed, `PUT` `notices/seats/<seat-id>/<blob-id>.json` on
      the state branch through the Contents API without a `sha`, and post only when that `PUT`
      created the file. First measure that GitHub refuses such a `PUT` on an existing file, and
      record the result in `design.md`
- [ ] 5.3 Post on the merged pull request that brought the commit last changing the file, found
      through GitHub's list of pull requests for a commit; where none, post a commit comment.
      Mention the owner the file named before the change, or for an added file the owner it
      names; mention nobody #171's seat-notice workflow would not mention; and post nothing where
      nobody is left. The notice reads as follows, and may be reworded:

      ```text
      @<owner>: this change to `seats/<seat-id>.yaml` has landed, and Igor now reads it.
      If you did not expect it, revoke your token at Anthropic.
      ```
- [ ] 5.4 Tests: the scenarios of *Igor posts one notice for each seat-file change it applies*,
      with three processes applying one commit and exactly one notice posted

## 6. Removing what called pulling future work

For each item, edit the change if it is still open when this is built, or the in-force spec or
doc if it has archived. An archived change's own proposal and design are records of their time
and are left alone.

- [ ] 6.1 #82: *An open condition never ends a running service* loses its clause that a lore fix
      waits for a restart, and its scenario *A fix in the lore repository waits for a restart*.
      This change's `stuck-conditions` delta does that at archive; before archiving, recopy #82's
      requirement as it then stands into the delta, changing only that clause and that scenario.
      The delta also says "the OpenSpec change that defines it" where #82 says "the change that
      opens it". While #82 is open, also rewrite its task 0.3, its decision 6 and the passage in
      its `design.md` so that none says a lore fix waits for a restart
- [ ] 6.2 #171: in `seat-budget`, *A seat's token travels as ciphertext in its file* decrypts "at
      start, and on each lore read, which `lore-pull` makes at the start of every cycle", in
      place of "at start, and on each pull of its lore checkout once #176 specifies one"; and *A
      removed seat file always takes effect* says "When a fetch of the lore repository brings a
      commit that removes a seat file", in place of "When a pull of the lore checkout (#176)
      removes a seat file", and loses "Until #176 specifies pulling, a seat file leaves a running
      process only when it restarts". While #171 is open, also rewrite its task 3.7b's wait on
      #176, and the passages in its `proposal.md` and `design.md` that say Igor does not pull
      yet
- [ ] 6.3 #179: while it is open, rewrite its `proposal.md` item that a roster change waits on #176, and
      its `design.md` sentence "Until #176 builds pulling, that checkout changes only when a person
      pulls it on the host"
- [ ] 6.4 `docs/deployment.md` says how a merged lore change reaches a running Igor: within one
      poll interval, at once with `systemctl reload`, and that a refused change shows as the
      condition `lore:config:<role>-<rank>`. It says local edits on the server are not applied.
      Remove any sentence, including #82's task 4.2 text, saying that a lore change needs a
      restart. A change to the unit's environment file still does

## 7. Closing out

- [ ] 7.1 `docs/architecture.md` §6.7 says that `igor serve` applies the lore repository's branch
      as fetched, never the server checkout's local edits
- [ ] 7.2 Archive in the place issue #204 gives this change, after #82, when every requirement
      holds; file an issue for any task left open, and tick it with a pointer to that issue
