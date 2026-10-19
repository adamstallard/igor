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

Decisions 1 to 7 are Adam's. Decisions 8 and 9 were this change's proposals, which Adam accepted
on 2026-10-18. Decision 10 follows the order Adam set in issue #204.

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
8. **A process applies one commit whole, read from a working tree of its own** (proposed here,
   accepted by Adam on 2026-10-18). Each `igor serve` process fetches into a ref of its own and
   keeps a detached worktree of the lore checkout, named by its role and rank, at the commit it
   applies. It reads its configuration and lore entries there, and never from the shared
   checkout's files. Before each read it makes the worktree match the commit exactly, with no git
   hook run, so nothing written there survives. Each cycle report names the commit applied.
   `design.md` gives the mechanism. *Rejected:* fast-forwarding the shared checkout. Several
   processes share that working tree, so one process could read it while another rewrites it.
   Git replaces a file by deleting it and writing it again, so a seat file read mid-rewrite would
   be missing, and decision 3 would kill the workers using a seat nobody removed.
9. **A restart falls back to the last commit that passed** (proposed here, accepted by Adam on
   2026-10-18). Each process keeps a *fetched* ref and an *applied* ref, the last commit whose
   read passed, across restarts. A restarting process reads the fetched commit; where it fails
   the startup checks, the process starts on the applied commit with the refused-read condition
   open. A failing lore commit refuses a start only where the process has no applied ref: one
   that has never applied a commit, or whose refs went with a lost checkout or volume. In every
   case the seats a later commit deleted stay out. Without this, each process that restarted
   after a bad commit landed, through a crash, a deploy or a reboot, would exit 78 and stay down
   under #82's unit, until the whole fleet was down. #82's requirement *A process that refuses to
   start exits with status 78* already says that a start falling back this way is not a refusal,
   so this change's delta leaves that requirement alone.
10. **This change archives after #82,** whose requirement it modifies, in the place issue
    [#204](https://github.com/adamstallard/igor/issues/204) gives it (Adam, 2026-10-18).

Proposed in this change (2026-10-18 and 2026-10-19), for Adam's review:

11. **A fetch names the repository's GitHub URL, reads only the checkout's own git
    configuration, and the start refuses a checkout that could route around the App.** That is a
    checkout with no branch or no upstream, an upstream remote that is not a credential-free
    `https://github.com/` URL, or a checkout configuration setting a key under `url.`, `http.`,
    `credential.`, `filter.`, `include.` or `includeIf.`, or `core.fsmonitor`, `core.sshCommand`
    or `core.gitProxy`. Without this, an SSH remote, a URL rewrite, an extra header or a proxy
    would let the fetch authenticate as something other than the App, which `surface-adapter`
    forbids, and a filter or fsmonitor would run a command from the configuration.
12. **A failed fetch opens no condition.** The process keeps running on a commit that passed,
    and every cycle report until a fetch succeeds says how long ago its last successful fetch
    was. A fetch never delays #179's heartbeat write, and one still running at the next firing is
    ended. *Rejected:* a read-cleared condition, which every network blip would open.
13. **The condition a refused read opens is per process: `lore:config:<role>-<rank>`.** Every
    Igor appends to one shared execution log, so one condition named `lore:config` would be
    cleared by any other process whose read passed. The read that retires a rank is a passing read,
    since only such a read changes the roster, and that same read clears the rank's condition,
    so no retired rank leaves one open. Its report names the commit, the file and the check, and quotes
    no value from the file, since the execution log may sit in a public repository.
14. **Igor's seat notice goes out at most once per change, and only for a change a process
    applies.** A process compares the seat files of each commit it applies with those of the
    commit its applied ref named before. A refused commit is not announced, since Igor does not
    read it. The notice mentions the owner the file named before the commit that last changed
    it, the lender whose token it held, so a merge that changes `owner` cannot redirect it; where
    the commit the process applied before names another owner, it mentions that one too. An
    added seat file gets no notice, as #171's workflow mentions nobody for one, since its `owner`
    is unvetted. Before posting, the process creates a record on the state branch, named by the
    seat and the commit that last changed the file, with a call that fails where the record
    exists. A process whose call found the record posts nothing, so a change gets one notice
    however many processes apply it; a call that failed otherwise is tried again at each later
    passing read. A crash between the record and the post loses that notice, which `design.md`
    weighs against a duplicate. A change that lands while no process is running is announced
    when one restarts, since the applied ref survives the restart.
15. **A removed seat stays out until a read that passes holds it again.** Once any commit after
    the applied one deletes a seat's file, the seat stays out of the configuration in force,
    through later refused reads and restarts, even where a later refused commit adds the file
    back. The
    process derives this from its two refs and the history between them, so nothing else is
    stored.
16. **A first fetch that fails falls back to the checkout's own remote-tracking ref,** the commit
    the operator last fetched, so a process that has never fetched can still start while GitHub
    does not answer.
17. **A restart whose applied commit also fails is refused.** After an Igor upgrade the applied
    commit can fail checks it once passed. The process then has nothing that passes, and refuses
    to start, naming both commits.
18. **A `destination` in another repository is not fetched.** Only the repository holding
    `igor.config.yaml` is pulled. Lore entries kept elsewhere are read where the configuration
    names them.
19. **No TLA+ model in this change.** How the ranks of one role agree on a commit belongs in
    #179's model, as *Still open* says. The two refs are each written by one process, and a crash
    between two of its writes leaves a state a restart already handles. The one shared write,
    decision 14's record, rests on a single create that fails where the record exists, and the
    scenario *A rotated token is announced once* states that. `design.md` gives each.

**Still open.** Each has a recommendation, and the requirements are written to it, so an answer
that differs changes the named requirement.

- **How often Igor pulls.** *Recommended:* one fetch per poll interval, on a timer apart from the
  cycle, so a removed seat applies within one interval even while a worker runs for hours. A
  new commit otherwise applies at the start of the next cycle. #179's heartbeat timer already
  fires every half interval; the fetch can ride every second firing, without blocking the
  heartbeat write. *Rejected:* fetching only at the start of a cycle, which would leave a
  removed seat in use until the running worker finishes. Requirement: *`igor serve` fetches its
  lore repository once per poll interval*.
- **How the ranks of one role agree on which commit applies.** *Recommended:* they do not
  agree. Each process applies the newest commit it has fetched, at its own cycle start, so for
  up to about one poll interval two ranks can run on different commits. Whether that is safe is a
  question about #179's rules, and #179 has the same gap without this change: a person who
  restarts ranks one at a time after a change produces the same mix. #179's model holds the
  roster and the poll interval the same for every process. Its design says TLC checked safety
  only at the fixed ratios of its timings to the poll interval, and that its rules depend on
  those ratios. A rank that has applied a shorter poll interval would judge a sibling still on
  the longer one gone while that sibling works. *Recommended for the safety part:* fold it into
  #179, whose model would then give each process its own view of the roster and the poll interval, which
  changes at that process's own cycle start, and keeps its invariant of no two workers on one
  item. If TLC finds a violation, the likely rule is that a heartbeat carries its writer's poll
  interval and a sibling judges it by that interval. Requirement: *Processes apply new commits
  independently*.
- **Whether a worker's publishing also runs on its cycle's commit.** Decision 7 has a worker
  finish on its cycle's commit. *Recommended:* publishing included, so the item's whole run uses
  one configuration and one set of lore entries. A person who wants it stopped uses
  `work-claiming`'s stop, open to anyone. Requirement: *A lore read at each cycle start applies
  what passes and refuses what fails*.
- **How a fetch authenticates.** *Recommended:* as the role's GitHub App, with a token set for
  that one command, as `surface-adapter`'s *On GitHub, every call an Igor makes acts as its App*
  already requires of every git call `igor serve` makes. The start already refuses where the App
  cannot act on the lore repository (`surface-adapter`'s *An Igor that cannot act as its App
  does not start*). *Rejected:* a deploy key or a credential stored in the checkout, which that
  requirement forbids. Requirement: *`igor serve` fetches its lore repository once per poll
  interval*.
- **Whether a pull can be forced.** *Recommended:* yes. `SIGHUP` makes the process fetch at once,
  and the shipped unit gains `ExecReload=` so that `systemctl reload igor@<role>-<rank>` sends
  it. Under compose, `docker compose kill -s HUP <service>` does the same; the shipped compose
  file runs `igor` as the container's main process, and task 1.6 measures that the signal
  reaches it. A forced fetch is still applied at the next cycle start, except a removed seat.
  Requirement: *A pull can be forced with SIGHUP*.
- **Where Igor posts the seat notice** (raised on #176). *Recommended:* on the merged pull
  request that brought the commit last changing the seat file. Where no pull request brought it,
  the notice goes on that commit as a commit comment, which #171's scenario *A push runs no
  notice workflow* then needs to allow (task 6.2). Requirement: *Igor posts at most one notice
  for each seat-file change it applies*.
- **The per-process condition key, against `condition-backoff`'s keying by cure.** #101 (`condition-backoff`) keys a
  condition by what would cure it, so that one cure met by five Igors is one condition, and #82
  lists such a condition once. Decision 13 keys a refused read by process, so one bad
  `igor.config.yaml` lists as one condition per process. *Recommended:* keep the per-process
  key. Each process refuses and clears on its own read, and a key shared by the role would let
  a rank whose read passed clear a sibling still refused. Requirement: *A lore read at each cycle
  start applies what passes and refuses what fails*.
- **A pull that removes the role a process runs** (raised on #176). *Recommended:* a missing role
  file, or a configuration that no longer declares the role, fails the startup checks, so
  decision 1 keeps the process on its last configuration, with the condition naming the file,
  until the operator stops the unit or restores the role; decision 9 does the same across a
  restart. A commit that keeps the role but drops this rank from the roster retires the rank, as
  #179 says. *Rejected:* standing down and exiting like #179's rank removed from the roster,
  because a role deleted by mistake would then need every one of its units started again.
  Requirement: *A lore read at each cycle start applies what passes and refuses what fails*.
- **Local edits and commits in the server's checkout** (raised on #176). *Recommended:*
  `igor serve` applies only what the fetched commit holds. At start it reports each uncommitted
  change, and each local commit the fetched commit does not hold, as not applied, and runs
  without them. Nothing fails, since decision 8 never fast-forwards the shared checkout.
  Requirement: *`igor serve` starts on the newest commit that passes*.
- **Whether `igor run` pulls** (raised on #176). *Recommended:* no. It reads the checkout's
  working tree as it finds it, local edits included, because a developer running one cycle by
  hand wants their edits applied. On a server nothing updates that tree, so the deployment
  guide says to pull it before a run by hand (task 6.4). Requirement: *`igor run` reads the
  checkout as it finds it*.
- **Three measurements.** That fetches into distinct refs and checkouts of distinct worktrees,
  from several processes sharing one object store, do not fail on each other's git locks, and
  how long one fetch takes, which says how often a fetch would be killed when the next is due
  (task 1.5). A lock failure is
  reported as a failed fetch, so the requirement holds either way; the measurement says how
  often it happens. That `SIGHUP` from `docker compose kill` reaches `igor` under the shipped
  compose file (task 1.6). And that GitHub's Contents API refuses a `PUT` without a `sha` on an
  existing file (task 5.2), which decision 14's record rests on. If it does not refuse, the
  record needs a commit and a ref update that does not force.
- **Conflict with #175 (`worker-user`), recorded here and not raised on #175.** #175 keeps a
  worker from writing the lore checkout, so that a worker cannot widen its own role. Under this
  change Igor reads its configuration from per-process worktrees. `design.md` puts them inside
  the lore checkout's directory, and decision 8's reset before each read discards any write
  there, but #175's list names the lore checkout, not the worktrees, and should say it covers
  them.

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
