## Decisions

Terms used here:
- The *lore repository* holds an organization's Igor configuration: `igor.config.yaml`, the role
  files under `roles/`, the seat files under `seats/` that
  [#171](https://github.com/adamstallard/igor/pull/171) (`seat-files`) adds, and usually the lore
  entries themselves. The *lore checkout* is the server's clone of it, the working tree holding
  the `igor.config.yaml` that `igor serve` loads.
- A *fetch* downloads the lore repository's new commits into the lore checkout's object store. A
  *lore read* is a process loading its whole configuration from one commit, and a process
  *applies* a commit when it runs a cycle on the configuration that commit holds. A *pull* is a
  fetch and the lore read that follows it.
- The *startup checks* on a lore read are every check a starting `igor serve` makes on the
  configuration it reads: validation of the configuration files, and the check that the App can
  act on every repository the role works and on the lore repository. The check that the roster
  declares the process's rank is not one of them (decision 30).
- A *read-cleared condition* is the kind #171 defines in `stuck-conditions`: a failing read opens
  it, a later passing read clears it, it takes no probe item, and it stops nothing by itself.
- A *rank* is one of several processes running one role, and the *roster* in `igor.config.yaml`
  lists the ranks each role runs; both come from
  [#179](https://github.com/adamstallard/igor/pull/179) (`concurrent-instances`).
- `destination` is the key in `igor.config.yaml` naming where the lore entries live, usually the
  lore repository itself.
- [#176](https://github.com/adamstallard/igor/issues/176) is the issue this change specifies.

Every decision below is Adam's. Decisions 8 and 9 were this change's proposals, which Adam
accepted on 2026-10-18; decisions 11 to 31 were its proposals and open questions, which Adam
answered on 2026-10-19; and decisions 32 to 35 are Adam's answers, given on 2026-10-20, to the
open questions this change listed on 2026-10-19. Decisions 36 to 38 are his answers of
2026-10-21, which amend decisions 13 and 14. Decision 13 replaces the one this change proposed,
and Adam narrowed it on 2026-10-20. Decision 10 follows the order Adam set in issue #204.

1. **A pull whose configuration fails the startup checks is refused** (Adam, 2026-10-18). The
   process keeps the last configuration that passed and opens a read-cleared condition naming the
   commit, the failing file and the check it failed. The condition clears on a later passing
   read of the refused commit, of a commit that descends from it, or of a branch head that no
   longer holds the refused commit (decisions 13 and 36). The
   condition takes nothing out of use: the process goes on working under the configuration it
   kept. This holds at every read of pulled configuration, the per-cycle reread #179 adds
   included: a refused read also keeps the roster of the configuration that passed.
2. **`igor serve` never exits at runtime because of a condition** (Adam, 2026-10-18, recorded on
   [#82](https://github.com/adamstallard/igor/pull/82)). Refusing to start stays; a refused pull
   is not a refused start.
3. **A removed seat file always takes effect, even when the rest of the pull is refused** (Adam,
   2026-10-18). Igor drops the seat's token from memory, gives the seat to no new worker, kills
   each worker using it and hands off its item, and keeps running. #171 specifies the removal as
   *A removed seat file always takes effect*. This change says when it applies: as soon as a fetch
   brings it, without waiting for the next cycle.
4. **Seat files are decrypted only on a lore read** (Adam, 2026-10-18), never when a worker
   starts. Under this change a lore read happens at start and at the start of every cycle, so a
   fix to the server's key file is picked up at the next cycle without a new commit.
5. **When a pulled change changes a seat file, Igor posts the notice itself** (Adam,
   2026-10-17). #171's `seat-notice.yml` workflow, which mentions a seat's owner on an open pull
   request changing their seat file, has no `push` trigger (#171's decision 26): it says nothing
   after the merge, and Igor's notice is the only one then.
6. **#82's clause *a lore fix takes effect at the next restart* goes when this change archives**
   (Adam, 2026-10-18). This change's `stuck-conditions` delta modifies #82's *An open condition
   never ends a running service* to remove it. #82 archives first (decision 10), so the delta
   replaces an in-force requirement. A fix in the supervisor's environment for the process still
   needs a restart.
7. **Igor pulls between cycles and applies a new commit at the start of the next cycle, never
   interrupting a running worker** (Adam, 2026-10-11). A worker runs inside its cycle, so it
   finishes on the commit its cycle started under. Decision 3 is the one exception.
8. **A process applies one commit whole, read from a working tree of its own** (Adam,
   2026-10-18). Each `igor serve` process fetches into a ref of its own and
   keeps a detached worktree of the lore checkout, named by its role and rank, at the commit it
   applies. It reads its configuration and lore entries there, and never from the shared
   checkout's files. Before each read it makes the worktree match the commit exactly, with no git
   hook run, so nothing written there survives. Each cycle report names the commit applied.
   `design.md` gives the mechanism. *Rejected:* fast-forwarding the shared checkout. Several
   processes share that working tree, so one process could read it while another rewrites it.
   Git replaces a file by deleting it and writing it again, so a seat file read mid-rewrite would
   be missing, and decision 3 would kill the workers using a seat nobody removed.
9. **A restart falls back to the last commit that passed** (Adam, 2026-10-18). Each process keeps
   a *fetched* ref and an *applied* ref, the last commit whose
   read passed, across restarts. A restarting process reads the fetched commit; where it fails
   the startup checks, the process starts on the applied commit with the refused-read condition
   open. A failing lore commit refuses a start in two cases. In the first, the process has no
   applied ref, because it has never applied a commit or its refs went with a lost checkout or
   volume. In the second, the applied commit fails too (decision 17). In every case the seats a
   commit after the applied one deleted stay out. Without this, each process that restarted
   after a bad commit landed, through a crash, a deploy or a reboot, would exit 78 and stay down
   under #82's unit, until the whole fleet was down. #82's requirement *A process that refuses to
   start exits with status 78* already says that a start falling back this way is not a refusal,
   so this change's delta leaves that requirement alone.
10. **This change archives after #82,** whose requirement it modifies, in the place issue
    [#204](https://github.com/adamstallard/igor/issues/204) gives it (Adam, 2026-10-18).
11. **A fetch names the repository's GitHub URL, reads only the checkout's own git
    configuration, and the start refuses a checkout that could route around the App** (Adam,
    2026-10-19). That is a
    checkout with no branch or no upstream, an upstream remote that is not a credential-free
    `https://github.com/` URL, or a checkout configuration setting a key under `url.`, `http.`,
    `credential.`, `filter.`, `include.`, `includeIf.` or `submodule.`, or `core.fsmonitor`,
    `core.sshCommand`, `core.gitProxy`, `core.askPass`, `core.alternateRefsCommand` or
    `extensions.worktreeConfig` (`submodule.`, `core.askPass` and `extensions.worktreeConfig`
    added on 2026-10-20, after a consistency read); the process checks again before each git
    command, and runs none where such a key has appeared since start. Without this, an SSH remote, a URL rewrite, an extra header or a proxy
    would let the fetch authenticate as something other than the App, which `surface-adapter`
    forbids, and a filter, an fsmonitor or an alternate refs command would run a command from the
    configuration.
12. **A failed fetch opens no condition, and a fetch never delays the heartbeat** (Adam,
    2026-10-19). The process keeps running on a commit that passed,
    and every cycle report until a fetch succeeds says how long ago its last successful fetch
    was. The fetch runs as a child process, so #179's heartbeat write never waits on it, and one
    still running when the next fetch is due is
    ended. *Rejected:* a read-cleared condition, which every network blip would open.
13. **Refused reads are split by fault** (Adam, 2026-10-19, replacing a per-process key).
    - **A configuration that fails the startup checks** opens one read-cleared condition shared
      by the role, `lore:config:<role>`, keyed as #101 (`condition-backoff`) keys a condition, by
      what would cure it: one commit that passes cures every rank. A refused read by any rank
      opens it. It clears only on a passing read, by any rank of the role, of one of these: the
      refused commit or a commit that descends from it (Adam, 2026-10-20), or a branch head that
      no longer holds the refused commit (decision 36). A rank that has not yet fetched the refused
      commit, and passes on an older one, has not seen the cure, so its read clears nothing;
      otherwise the condition could open and clear repeatedly until every rank had fetched. A
      rank still on the refused commit fetches the passing one within one poll interval and
      applies it at its next cycle start. A passing read that retires the rank, because its
      roster drops that rank, also clears the condition where its commit is the refused one or
      descends from it. The report names the commit, the file and the check, and quotes no value from the
      file, since the execution log may sit in a public repository.
    - **A read that fails for a local reason** opens no configuration condition. A local reason
      is a git or filesystem operation failing while the commit is put in the process's working
      tree or a file is read from it: a git lock, such as `packed-refs.lock` in the shared
      repository or an `index.lock` left in the rank's own worktree, a full disk, or a worktree
      git can no longer use. A bad commit fails the checks in the same way for every rank, and a
      local fault doesn't, so it says nothing about the configuration. The rank runs that cycle
      on its applied commit and reads again at the next cycle start. After three cycle starts in
      a row fail this way, it opens the per-process read-cleared condition
      `lore:read:<role>-<rank>`, naming the failed operation and the kind of fault but no path
      outside the checkout, which its own next read that is not a local fault clears. A worktree
      that cannot be put back counts the same way (decision 33).
    - **A check GitHub did not answer, or a credential GitHub refused,** fails no read (decision
      29), so neither opens `lore:config:<role>`.
14. **Igor's seat notice goes out at most once per change, and only for a change a process
    applies** (Adam, 2026-10-19). A process compares the seat files of each commit it applies with those of the
    commit its applied ref named before. A refused commit is not announced, since Igor does not
    read it. The notice mentions the seat's owner as the file named it just before the commit
    that last changed the file: the lender whose token the file held. So a merge that changes
    `owner` cannot redirect the notice. Where the commit the process applied before names a
    different owner, the notice mentions that owner as well. It
    mentions no owner who both opened the pull request and pushed that commit to it, and no
    `owner` that is not a GitHub login, the two exclusions #171's workflow makes (#171's decision
    44), so a lender who opened the pull request is told where someone else pushed to it. Where a
    squash or rebase merge made the commit, that exclusion looks at who pushed the pull request's
    own last commit changing the file. Igor's
    notice after the merge is separate from the workflow's mentions on the pull request. An added
    seat file gets a notice mentioning the owner it names (decision 38). A deleted or renamed
    seat file gets none (decision 31). Before posting, the process creates a record on the state branch, named by the
    seat and the commit that last changed the file, with a call that fails where the record
    exists. A process whose call found the record posts nothing, so a change gets one notice
    however many processes apply it; a call that failed otherwise is tried again at each later
    passing read. A crash between the record and the post loses that notice, which `design.md`
    weighs against a duplicate. A change that lands while no process is running is announced
    when one restarts, since the applied ref survives the restart.
15. **A removed seat stays out until a read that passes holds it again** (Adam, 2026-10-19).
    Once any commit after
    the applied one deletes a seat's file, the seat stays out of the configuration in force,
    through later refused reads and restarts, even where a later refused commit adds the file
    back. The
    process derives this from its two refs and the history between them, so nothing else is
    stored.
16. **A first fetch that fails falls back to the checkout's own remote-tracking ref** (Adam,
    2026-10-19), the commit
    the operator last fetched, so a process that has never fetched still has a commit to read
    when its fetch fails. That helps only where GitHub's API still answers, since the start's App
    check needs the API. Where GitHub does not answer at all, the App
    check fails and the start exits as #82 says of such a check.
17. **A restart whose applied commit also fails is refused** (Adam, 2026-10-19). After an Igor
    upgrade the applied
    commit can fail checks it once passed. The process then has nothing that passes, and refuses
    to start, naming both commits.
18. **Lore entries are read where `destination` names** (Adam, 2026-10-19). Only the repository
    holding `igor.config.yaml` is fetched; a `destination` in another repository is not.
19. **No TLA+ model in this change** (Adam, 2026-10-19). How the ranks of one role agree on a
    commit belongs in
    #179's model (decision 21). The two refs are each written by one process, and a crash
    between two of its writes leaves a state a restart already handles. The one shared write,
    decision 14's record, rests on a single create that fails where the record exists, and the
    scenario *A rotated token is announced once* states that. `design.md` gives each.
20. **Igor fetches once per poll interval** (Adam, 2026-10-19), on every second firing of #179's
    heartbeat timer, which fires every half interval apart from the cycle, never blocking the
    heartbeat write. A removed seat thus applies within one interval even while a worker runs for
    hours; any other new commit applies at the start of the next cycle. *Rejected:* fetching
    only at the start of a cycle, which would leave a removed seat in use until the running
    worker finishes.
21. **The ranks of one role do not agree on a commit** (Adam, 2026-10-19). Each applies the newest
    commit it fetched, at its own cycle start, so for up to about one poll interval two ranks can
    run on different commits. #179 has the same gap without this change: a person restarting
    ranks one at a time after a change produces the same mix. #179's decision 43 settles it the
    same way: ranks do not coordinate on a lore commit. #179's model gives each process its own
    roster and poll interval, applied at that process's own cycle start, and finds both safe:
    - **Different rosters** always keep one worker per item.
    - **Different poll intervals** are safe by #179's decision 49 (Adam, 2026-10-21), which
      #179's spec and model carry: each heartbeat declares its process's poll interval. A
      process counts a sibling gone only after three poll intervals of the longest length it has
      seen, its own or one that sibling's heartbeat declared. It stands down after two poll
      intervals of the shortest length it has itself applied since it started. So a rank that
      stops writing heartbeats has stood down before any sibling counts it gone. Without the
      rule, TLC found a sibling on the shorter interval counting a rank on the doubled interval
      gone, and taking over its item, while that rank still worked it. With the rule, TLC finds
      no two workers on one item in any of #179's configurations.
22. **A worker publishes under its cycle's commit** (Adam, 2026-10-19), so an item's whole run
    uses one configuration and one set of lore entries. A removed seat is the one exception
    (decision 3). A person who wants a run stopped uses `work-claiming`'s stop, open to anyone.
23. **A fetch authenticates as the role's GitHub App** (Adam, 2026-10-19), with a token set for
    that one command, as `surface-adapter`'s *On GitHub, every call an Igor makes acts as its
    App* already requires. Deploy keys, and any credential stored in the checkout, are rejected.
24. **`SIGHUP` forces a pull** (Adam, 2026-10-19). The process fetches at once, without dropping
    its work. The shipped unit gains `ExecReload=`, so that `systemctl reload igor@<role>-<rank>`
    sends it; under compose, `docker compose kill -s HUP <service>` does the same, through the
    `tini` that #192's image runs as the container's main process, which passes the signal to
    `igor`. The commit a forced fetch brings applies at the next cycle start, except
    a seat it removes, which applies at once.
25. **The seat notice goes on the merged pull request** (Adam, 2026-10-19) that brought the
    commit last changing the seat file, or, for a commit pushed without a pull request, on that
    commit as a commit comment. #171's scenario *A push runs no notice workflow* then needs to
    allow that comment (task 6.2).
26. **A pull that removes the process's own role is a refused read, not an exit** (Adam,
    2026-10-19), whether the role file or the role's entry in `igor.config.yaml` goes. The
    process stays on its last configuration, with the condition naming the file; decision 9 does
    the same across a restart. Retiring a role means removing its units. A commit that keeps the
    role but drops this rank from the roster retires the rank, as #179 says (decision 30).
    *Rejected:* exiting, because a role deleted by mistake would then need every one of its units
    started again.
27. **Local edits and commits in the server's checkout are reported at start, not applied**
    (Adam, 2026-10-19). `igor serve` applies only what the fetched commit holds, and runs without
    them. An uncommitted edit never blocks a pull, as it could block a fast-forward, since
    decision 8 never fast-forwards the shared checkout.
28. **`igor run` doesn't pull** (Adam, 2026-10-19). It reads the checkout as it finds it, local
    edits included, because a developer running one cycle by hand wants their edits applied. On
    a server nothing updates that tree, so the deployment guide says to pull it before a run by
    hand (task 6.4).
29. **GitHub not answering during a lore read fails no read** (Adam, 2026-10-19). The startup
    checks include the App check, which needs GitHub. At a cycle start the process stays on the
    commit it applied and opens no condition; at start it exits as #82 says of such a check,
    with status 1, not 78. A credential GitHub refuses is treated the same way, as #82 already
    treats it at start. At a cycle start the process then takes no new item until a token mints
    again, as `surface-adapter` says of a credential refused while the Igor runs. Otherwise every GitHub blip at a cycle start would open
    `lore:config:<role>`, which decision 12 rejects for a failed fetch.
30. **A roster that drops the rank retires it** (Adam, 2026-10-19). The roster's declaring the
    rank is not a startup check on a lore read, so a passing read that drops it retires the rank
    as #179 says, and a start whose fetched commit drops it is refused, with no fallback to an
    applied commit that still declares it.
31. **A deleted or renamed seat file gets no notice after the merge** (Adam, 2026-10-19). #171's
    workflow comment before the merge already told the owner. The removal takes the token out of
    use at once, and the notice text, that Igor now reads the change, would be false, since no
    file is left at that path for Igor to read.

32. **A lore read that fails for a local reason at process start exits 1, with no fallback**
    (Adam, 2026-10-20). The supervisor restarts the process, as for a start GitHub does not
    answer. The applied commit would sit in the same worktree, so falling back to it does not
    help. *Rejected:* exiting 78, which tells the supervisor not to restart, so a full disk or a
    held lock would leave the rank down after the fault cleared.
33. **A rank whose lore worktree cannot be put back keeps working, from memory** (Adam,
    2026-10-20). After a refused read or a local fault the process checks out its applied commit
    again; where that fails too, the worktree is stuck. Each passing read keeps its configuration
    and lore entries in memory, and a cycle whose worktree is stuck runs on those, reads nothing
    from the worktree, and tries the repair again at the next cycle start. Each cycle start whose
    repair fails is a local fault, so after three in a row `lore:read:<role>-<rank>` opens.
    *Rejected:* taking no new item while the worktree is stuck, which stops a rank's work for a
    fault on its own disk.
34. **Each rule using #171's read-cleared kind says when it opens** (Adam, 2026-10-20). #171's
    definition lets the rule set how many failing reads in a row open the condition. A seat file
    that fails to decrypt opens `seat:<id>:decrypt` on the first; a local fault opens
    `lore:read:<role>-<rank>` on the third.
35. **An App that loses access to a repository the role works, or to the lore repository, refuses
    the read** (Adam,
    2026-10-20). Every rank's read is then refused under `lore:config:<role>`, though installing
    the App again cures it with no new commit. A commit that stops naming the repository cures it
    too. Either cure clears the condition at the next passing read, since the refused commit
    read again counts as one that descends from itself (decision 13).

36. **A force-push that drops the refused commit clears `lore:config:<role>`** (Adam,
    2026-10-21). A passing read of the lore branch's head also clears it where the refused commit
    is no longer in that head's history, including a force-push back to the refused commit's
    parent. The head counts only where the fetch that brought it started after the rank first
    knew the condition was open, an order the rank keeps for itself rather than comparing its
    clock with the time another server wrote on the condition's record. A head from an earlier
    fetch is usually just older than the refused commit: its rank has not fetched the refused
    commit yet, so its passing read clears nothing (decision 13).
    Without that limit, a rank whose fetches had failed could clear the condition while the
    refused commit is still the branch's tip, and decision 37 would then keep it clear.
37. **A commit already known does not reopen `lore:config:<role>`** (Adam, 2026-10-21). A
    refused read of the commit the condition refused, or of the commit whose read cleared it or
    one of its ancestors, leaves the condition clear. A rank whose fetch has not yet brought the fix would
    otherwise reopen it until that fetch. A read the App check refuses still reopens it, since an
    App that loses access again refuses a commit that passed before (decision 35). So does a read
    at process start: a process restarted on a stricter Igor can refuse a commit that older
    processes passed, and decision 9 has it start on its applied commit with the condition
    open.
38. **An added seat file gets a notice mentioning the owner it names** (Adam, 2026-10-21,
    answering #171's question on a seat file added back with old ciphertext from history). Such a
    file is an added file like any other, so its owner learns that Igor spends from it again. This
    replaces decision 14's rule that an added seat file gets no notice.

**Still open:** the findings below, for this change's next revision.

Three consistency reads ran on 2026-10-21; their findings are listed newest first.

**Findings of the newest 2026-10-21 consistency read, made once decision 21 cited #179's
decisions 43 and 49, for this change's next revision.** None is fixed, and none concerns poll
intervals:
- For Adam: whether #220's visibility check at start is one of this change's startup checks.
  #220 recommends it is, and archives first in #204's order, so this change has to settle it.
  If it is, a repository made private while Igor runs would open two conditions for one fault,
  `lore:config:<role>` and #220's own. And decision 37's exception covers only a read the App
  check refuses, so a commit already known that the visibility check later refuses would not
  reopen `lore:config:<role>`.
- For Adam: a process with no applied ref, after a lost checkout or as a new rank, never
  announces the seat changes it applies; no decision states that.
- For the author: task 6.2's four "in place of" strings no longer match #171's text. A seat file
  that one commit deletes and a later commit adds back, both between the applied commit and the
  fetched one, as a revert does, kills its workers under the design and task 4.1 but not under
  the requirement; the fixed case below is a file that goes and comes back between two applies.
  Also: "the condition's record" is defined nowhere,
  where #171 keeps no condition state apart from the log; a start fetch has no poll interval to
  bound it before the first read; the object-store limit, a second refused commit while the
  condition is open, and submodule recursion have no scenario, and *A later passing commit clears
  the condition* is broader than its rule; `condition-backoff`'s *A condition's scope is its
  cure's scope* names a change, not the `stuck-conditions` capability; and three requirements
  carry reasons that belong in `design.md`.

**Findings of a later 2026-10-21 consistency read, run after this revision's first fixes, for the
next revision.** This revision fixes four: the head rule compared one server's clock with a time
another wrote; a rank lacking the refused commit's object; a seat file deleted and added back
between two applies; and two missing scenarios. None of the items below is fixed:
- For Adam: some startup checks depend on the server, not the commit, such as an unreadable App
  key or a broken `destination` checkout, so a fault on one server opens the role-wide condition,
  another server's passing read clears it, and decision 37 then keeps it clear while the broken
  server refuses the clearing commit, so that server runs on its old commit with no condition
  open and nobody told; `design.md`'s premise that a running process's checks
  never change is false in general. #216 needs this change to fetch a separate `destination`
  repository, which decision 18 forbids, and its `igor run` fetches the `questions` branch, which
  decision 28 forbids. #216 is `lore-search`. The checkout must now be writable by the service
  user, since each process's worktree, refs and objects live in its `.git`, which #192's guide
  says it need not be, and no decision states that move.
- For the author: the scenarios *A rotated token is announced once* and *A token changed back is
  announced again* promise one notice without saying who pushed, while the rule excludes a lender
  who opened the pull request and pushed the change, as in a lender's own rotation; the condition
  a refused cycle-start read raises is defined both here and in #179's *A retired rank does not
  hold its items forever*; the `stuck-conditions` delta leaves no way for a fix in a separate
  `destination` repository to arrive; a merged symlink or committed `.igor` path in a worktree is
  not refused; `SIGHUP` "from its first moment" is unmeasured for the window before Node installs
  the handler; `git worktree repair` with no path rewrites the links of every linked worktree, other processes'
  included, so it needs the process's own path; the report of local changes
  to the checkout names no destination; `GIT_CONFIG_COUNT` entries in the environment still
  apply to the fetch; and the rule excluding a lender who pushed says nothing of when the pusher
  cannot be learned.

**Findings of the 2026-10-21 consistency read, for this change's next revision.** This revision
fixes five: a stale head clearing the condition, a restart on a stricter Igor, notices for files
whose names are not seat ids, "exactly one notice" for a change nobody is told of, and two
untested cases. None of the items below is fixed:
- For Adam: #171's read-cleared kind lets a rule that uses it state only what is read, what
  counts as failing, and how many failing reads open it. Decisions 36 and 37 add rules on when
  the condition clears and when it reopens, which that kind does not allow. Either #171's
  definition makes room for such rules, or these two are recast as part of what counts as a
  passing or failing read.
- For the author: `--first-parent` in the removal command misses a deletion on a merged side
  branch, which the requirement's "any commit" covers; task 1.1's fetch says
  `--no-recurse-submodules` and `design.md`'s does not; the open finding that a key file one
  server cannot read opens `lore:config:<role>` contradicts #171, under which that seat goes
  under `seat:<id>:decrypt`; #179 refuses a cycle read on any start check, roster and App check
  included, while this change retires a rank on a roster drop and opens nothing when GitHub
  does not answer; *startup checks* has three definitions, here, in #171 and in #179; a refused
  read clears `lore:read:<role>-<rank>`, though the kind clears only on a passing read; #216
  (`lore-search`) reads its relay files as of the applied commit, which a stuck cycle holds only
  in memory, where this change keeps only the configuration and lore entries; issue #176's body
  is stale, naming a per-process condition and nine open questions; `log.showSignature` with a
  `gpg.program` in `.git/config` would make the removal's `git log` run a command; tasks to
  measure who pushed a commit to a pull request, and whether the image's user can write the
  checkout, are missing; decision 9 and `design.md`'s restart section say "the refused-read
  condition" where they mean `lore:config:<role>`; and several scenarios are missing, among them
  a refused `.git/config` key reported by its section alone, and a cycle report saying how long
  ago the last fetch succeeded.

**Findings of the 2026-10-20 consistency reads, for this change's next revision,** none fixed
yet (the reads' other findings are fixed in this revision):
- For Adam: anyone who can write `.git/config` can usually write the fetched ref too, or point the
  upstream at another public `https://github.com/` repository after start, which the checks
  allow; the threat model needs stating, or the upstream fixed at start. A key file one server
  cannot read fails a startup check, so it opens the role's `lore:config:<role>` rather than
  counting as a local fault: a fault on one server opens the role-wide condition meant for a bad
  commit, and every other server's passing read clears it. Each condition's scope may also be
  wrong, since #101 keys a condition by what cures it: `lore:config:<role>` opens once per role
  although one commit cures every role, and `lore:read:<role>-<rank>` once per rank although a
  full disk is shared by every rank on the server. Deleting the
  state branch, the git branch where Igor keeps its records, decision 14's notice records among
  them, would let a process that applies a seat change after the others announce it a second
  time, as `design.md` describes.
- For the author: a force-push followed by a refused commit that adds a removed seat back escapes
  decision 15's derivation; a notice whose record call failed before a clean restart is never
  posted, against "exactly one"; #171's single-file re-read is called a lore read, which this
  change's definition excludes; #171's reason for refusing an in-checkout `seatKey` names a reset
  this change never makes (task 6.2 should rewrite both #171 passages); the removal's timing and the
  commit-comment scenario still contradict #171 until task 6.2 lands there before #171 archives;
  the failing file's path in `lore:config`'s report needs a form check; "the most recent commit
  that changed" a seat file is undefined for merge commits; nobody has measured that GitHub
  records who pushed a commit to a pull request; whether the image's user can write the checkout
  under compose is unmeasured; the dependency on #192 is not listed under *Impact*; the *applied
  ref* is used before it is defined; and the scenarios do not cover the rename case, the
  re-checkout after a local fault, or a config key added after start counting as a local fault.

**Measurements**, each a task: that fetches into distinct refs and checkouts of distinct
worktrees, from several processes sharing one object store, do not fail on each other's git
locks, and how long one fetch takes, which says how often a fetch would be killed when the next
is due (task 1.5). A lock failure is a failed fetch, or a read that fails for a local reason, so
the requirements hold either way; the measurement says how often it happens. That `SIGHUP` from
`docker compose kill` reaches `igor` through #192's image (task 1.6). What GitHub's list of pull
requests for a commit returns for a commit a squash or rebase merge made (task 5.4).
And that GitHub's Contents API refuses a `PUT` without a `sha` on an existing file (task 5.2),
which decision 14's record rests on. If it does not refuse, the record needs a commit and a ref
update that does not force.

## Why

Igor reads its configuration from the lore checkout, at start and, under #179, at each cycle,
and nothing in Igor ever updates that checkout. A merged change to a role, a new seat, or under
#171 a rotated seat token reaches a running Igor only after someone pulls on the server, and for
a file read only at start, restarts it. Under #171 a lender rotates their token through a pull
request, so that manual step would follow every rotation.

The lore repository is where an organization directs its Igors. Merging there should be enough.

## What Changes

- **`igor serve` fetches its lore repository's branch once per poll interval**, as its App, on a
  timer apart from the cycle, and on `SIGHUP`.
- **At the start of each cycle the process reads its configuration from the newest commit it has
  fetched**, in a worktree of its own. A configuration that passes the startup checks is applied
  whole. One that fails is refused under a read-cleared condition, and the last configuration
  that passed stays in force.
- **A removed seat file applies as soon as a fetch brings it**, through #171's requirement, and
  stays out until a read that passes holds it again.
- **A restart starts on the newest commit that passes.**
- **Igor posts at most one notice for each seat-file change it applies.**
- **#82's restart clause goes**: a lore fix reaches a running process at its next pull.

## Capabilities

### New Capabilities

- `lore-pull`: how a running `igor serve` process fetches its lore repository and applies what
  lands.

### Modified Capabilities

- `stuck-conditions`: #82's *An open condition never ends a running service* loses the clause
  that a lore fix waits for a restart.

## Impact

- `src/serve.ts`, `src/cli.ts` and `src/config.ts`: the fetch timer, the per-process worktree,
  the lore read at each cycle start, the start on the newest passing commit, and the
  refused-configuration condition; `src/state.ts`: a create-only write for the notice record.
- `deploy/igor.service`: `ExecReload=`.
- `docs/deployment.md`: how a merged change reaches a running Igor.
- Text in #82, #171 and #179 that calls pulling future work, and #171's scenario that nothing
  comments on a pushed commit, are rewritten (tasks 6.1 to 6.3).
- Depends on #171 for seat files, the read-cleared condition and the removal, on #179 for the
  per-cycle reread and its heartbeat timer, and on #82 for the requirement it modifies.
