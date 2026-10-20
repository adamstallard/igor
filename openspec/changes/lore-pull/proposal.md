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
  act on every repository the configuration names.
- A *read-cleared condition* is the kind #171 defines in `stuck-conditions`: a failing read opens
  it, a later passing read clears it, it takes no probe item, and it stops nothing by itself.
- A *rank* is one of several processes running one role, and the *roster* in `igor.config.yaml`
  lists the ranks each role runs; both come from
  [#179](https://github.com/adamstallard/igor/pull/179) (`concurrent-instances`).
- `destination` is the key in `igor.config.yaml` naming where the lore entries live, usually the
  lore repository itself.
- [#176](https://github.com/adamstallard/igor/issues/176) is the issue this change specifies.

Every decision below is Adam's. Decisions 8 and 9 were this change's proposals, which Adam
accepted on 2026-10-18, and decisions 11 to 31 were its proposals and open questions, which Adam
answered on 2026-10-19. Decision 13 is his replacement for the one proposed. Decision 10 follows
the order Adam set in issue #204.

1. **A pull whose configuration fails the startup checks is refused** (Adam, 2026-10-18). The
   process keeps the last configuration that passed and opens a read-cleared condition naming the
   commit, the failing file and the check it failed. A later passing read clears it. The
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
    `credential.`, `filter.`, `include.` or `includeIf.`, or `core.fsmonitor`, `core.sshCommand`,
    `core.gitProxy` or `core.alternateRefsCommand`; the process checks again before each git
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
      opens it, and the next passing read by any rank of the role clears it. A rank still on the
      refused commit fetches the passing one within one poll interval and applies it at its next
      cycle start. A rank retired by a passing read is no exception: that read clears the condition
      too. The report names the commit, the file and the check, and quotes no value from the
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
      outside the checkout, which its own next read that is not a local fault clears.
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
    own last commit changing the file. The
    workflow's rule of one mention per pull request does not carry over: Igor's notice after the
    merge is a separate one. An added seat file gets no notice, as #171's workflow mentions
    nobody for one, since its `owner` is unvetted. A deleted or renamed seat file gets none from
    Igor either (decision 31). Before posting, the process creates a record on the state branch, named by the
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
    ranks one at a time after a change produces the same mix. #179's model, as it stands, holds
    the roster and the poll interval the same for every process, and its design says TLC checked
    safety only at fixed ratios of its timings to the poll interval. A rank that has applied a
    shorter interval would judge a sibling still on the longer one gone while that sibling works.
    Checking this is #179's task, reported to #179 and not yet taken up there. Its model would
    give each process its own view of the roster and the poll interval, changing at that
    process's own cycle start, and keep its invariant of no two workers on one item. If TLC finds a violation, the likely rule is that a heartbeat carries its writer's poll
    interval and a sibling judges it by that.
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

**Still open.** Each has a recommendation. For the first, the requirements follow decision 13 as
Adam gave it, and the recommendation would narrow it. For the others, the requirements follow the
recommendation.

- **Which passing read clears `lore:config:<role>`.** Under decision 13 any rank's passing read
  clears it, including a rank that has not yet fetched the refused commit and passes on the
  commit before it. That rank clears the condition, and a sibling still on the refused commit
  opens it again at its next cycle start, so the condition can open and clear more than once in
  the poll interval before every rank has fetched. *Recommended:* only a passing read of a commit
  that holds the refused one, its descendant, clears it; a rank behind the refused commit has not
  seen the cure. An answer that agrees adds that clause to *A lore read at each cycle start
  applies what passes and refuses what fails*.
- **A local fault at start.** Decision 13 covers a cycle start. *Recommended:* a start whose first
  read fails for a local reason exits with status 1, which the supervisor restarts, as for a
  start GitHub does not answer, and does not fall back to the applied commit, which the same
  worktree would hold. A full disk or a held lock is not a bad setup, so 78, which tells the
  supervisor not to restart, would leave the rank down after the fault cleared. Requirement:
  *`igor serve` starts on the newest commit that passes*.
- **A cycle whose working tree cannot be put back.** After a refused read or a local fault the
  process checks out its applied commit again, so that the cycle's lore entries come from it.
  *Recommended:* where that checkout fails too, the cycle takes no new item, since it could not
  read the lore entries its items need. Requirement: *A process applies one lore commit at a
  time, whole*.
- **Three local faults before `lore:read:<role>-<rank>` opens, against #171's read-cleared
  kind,** which opens on the first failing read with no recurrence count. *Recommended:* #171's
  *A read-cleared condition opens on a failing read and clears on a passing one* gains a clause
  letting a rule set how many failing reads in a row open it. That is #171's to decide, and is
  reported to it. Until #171 has the clause, this change defines the failing read as the third
  local fault in a row. Requirement: *A lore read at each
  cycle start applies what passes and refuses what fails*.
- **An App that loses access to a repository the configuration names.** The App check then
  fails on a commit that passed before, so every rank's read is refused under
  `lore:config:<role>`, though installing the App again cures it with no new commit.
  *Recommended:* keep it a refused read: a commit that stops naming the repository cures it too,
  and the next passing read after either cure clears the condition. Requirement: *`igor serve`
  starts on the newest commit that passes*.

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
