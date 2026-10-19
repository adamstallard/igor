## Decisions

Terms used here:
- The *lore repository* holds an organization's Igor configuration: `igor.config.yaml`, the role
  files under `roles/`, the seat files under `seats/` that
  [#171](https://github.com/adamstallard/igor/pull/171) (`seat-files`) adds, and usually the lore
  entries themselves. The *lore checkout* is the server's clone of it, which every `igor serve`
  process on that server starts in.
- A *fetch* downloads the lore repository's new commits into the lore checkout's object store. A
  *lore read* is a process loading its whole configuration from one commit, and a process
  *applies* a commit when it runs a cycle on the configuration that commit holds. A *pull* is a
  fetch and the lore read that follows it.
- The *startup checks* are the checks `igor serve` makes before its first cycle. Of these, only
  the validation of the configuration files is one that a pulled file can fail.
- A *read-cleared condition* is the kind #171 defines in `stuck-conditions`: a failing read opens
  it, a later passing read clears it, it takes no probe item, and it stops nothing by itself.
- A *rank* is one of several processes running one role, and the *roster* in `igor.config.yaml`
  lists the ranks each role runs; both come from
  [#179](https://github.com/adamstallard/igor/pull/179) (`concurrent-instances`).
- `destination` is the key in `igor.config.yaml` naming the repository the lore entries live in,
  usually the lore repository itself.
- [#176](https://github.com/adamstallard/igor/issues/176) is the issue this change specifies.
  Questions marked *open on #176* were first raised there.

Decided by Adam:

1. **A pull whose configuration fails the startup checks is refused** (2026-10-18). The process
   keeps the last configuration that passed and opens a read-cleared condition naming the failing
   file and the check it failed. A later passing read clears it. The condition takes nothing out
   of use: the process goes on working under the configuration it kept. This holds wherever a
   process rereads pulled configuration, the roster included.
2. **`igor serve` never exits at runtime because of a condition** (2026-10-18, recorded on
   [#82](https://github.com/adamstallard/igor/pull/82)). Refusing to start stays; a refused pull
   is not a refused start.
3. **A removed seat file always takes effect, even when the rest of the pull is refused**
   (2026-10-18). Igor drops the seat's token from memory, gives the seat to no new worker, kills
   each worker using it and hands off its item, and keeps running. #171 specifies the removal as
   *A removed seat file always takes effect*. This change says when it applies: as soon as a fetch
   brings it, without waiting for the next cycle.
4. **Seat files are decrypted only on a lore read** (2026-10-18), never when a worker starts.
   Under this change a lore read happens at start and at the start of every cycle, so a fix to
   the server's key file is picked up at the next cycle without a new commit.
5. **When a pulled change adds or changes a seat file, Igor posts the notice itself**
   (2026-10-17). #171's `seat-notice.yml` workflow, which mentions a seat's owner on an open pull
   request changing their seat file, gets no `push` trigger: it says nothing after the merge, and
   Igor's notice is the only one then.
6. **#82's clause *a lore fix takes effect at the next restart* goes once this change is built**
   (2026-10-18). This change's `stuck-conditions` delta modifies #82's *An open condition never
   ends a running service* to remove it, and task 6.1 says where to make the edit if #82 has
   not archived by then. A fix in the systemd unit's environment file still needs a restart.
7. **Igor pulls between cycles and applies a new commit at the start of the next cycle, never
   interrupting a running worker** (2026-10-11). A worker runs inside its cycle, so it finishes
   on the commit its cycle started under. Decision 3 is the one exception. Adam's wording was
   that Igor fast-forwards the checkout; decision 8 proposes a different way to the same end.

Proposed in this change, for Adam's review:

8. **A process applies one commit whole, read from a working tree of its own.** Each `igor serve`
   process fetches into a ref of its own and keeps a detached worktree of the lore checkout,
   named by its role and rank, at the commit it applies. It reads its configuration and lore
   entries there, and never from the shared checkout's files. Before each read it makes the
   worktree match the commit exactly, with no git hook run, so nothing written there survives.
   Each cycle report names the commit applied. `design.md` gives the mechanism. *Rejected:*
   fast-forwarding the shared checkout, as the 2026-10-11 decision worded it. Several processes
   share that working tree, so one process could read it while another rewrites it. Git replaces
   a file by deleting it and writing it again, so a seat file read mid-rewrite would be missing,
   and decision 3 would kill the workers using a seat nobody removed.
9. **A fetch names the repository's GitHub URL, and the start refuses a checkout that could route
   around the App.** That is a branch with no upstream, an upstream remote that is not a
   credential-free `https://github.com/` URL, or a checkout config with `url.<base>.insteadOf`.
   Without this check, an SSH remote or a URL rewrite would let the fetch authenticate as the
   host's key, which `surface-adapter` forbids.
10. **A failed fetch opens no condition.** The process keeps running on a commit that passed, and
    the cycle report says how long ago its last successful fetch was. *Rejected:* a read-cleared
    condition, which every network blip would open.
11. **The condition a refused read opens is per process: `lore:config:<role>-<rank>`.** Every
    Igor appends to one execution log, so one condition named `lore:config` would be cleared by
    any other process whose read passed.
12. **A restart falls back to the last commit that passed.** Each process keeps a *fetched* ref
    and an *applied* ref, the last commit whose read passed, across restarts. A restarting
    process reads the fetched commit; where it fails the startup checks, the process starts on
    the applied commit with the refused-read condition open. It refuses to start only when it
    has no applied ref, on its first start ever. In every case the seat files the fetched
    commit lacks stay removed. Without this, each process that restarted after a bad commit
    landed, through a crash, a deploy or a reboot, would exit 78 and stay down under #82's unit,
    until the whole fleet was down. This narrows #82's *refusal*, a failing check at start, to a
    first start, and is for Adam to confirm.
13. **Igor's seat notice goes out once per change, and only for a change a process applies.** A
    process compares the seat files of each commit it applies with those of the commit its
    applied ref named before. A refused commit is not announced, since Igor does not read it. The notice mentions
    the owner the file named before the change, the lender whose token it held, so a merge that
    changes `owner` cannot redirect it. Before posting, the process creates a record of the notice
    on the state branch, and the creation fails where the record already exists. A process whose
    creation failed posts nothing, so a change gets one notice however many processes apply it. A
    change that lands while no process is running is announced when one restarts, since the
    applied ref survives the restart.
14. **A `destination` in another repository is not fetched.** Only the repository holding
    `igor.config.yaml` is pulled. Lore entries kept elsewhere are read as they are today.
15. **No TLA+ model in this change.** How the ranks of one role agree on a commit belongs in
    #179's model, as *Still open* says. The one shared write here, decision 13's record, rests on
    a single create that fails where the record exists, and its scenario states that.
16. **This change archives after #82,** whose requirement it modifies. Issue
    [#204](https://github.com/adamstallard/igor/issues/204) holds the archive order and does not
    list this change yet. #204's body says a change is added there before any change depending
    on the new order is edited. Adding this one is for Adam to do or approve.

**Still open.** Each has a recommendation, and the requirements are written to it, so an answer
that differs changes the named requirement.

- **How often Igor pulls.** *Recommended:* one fetch per poll interval, on a timer apart from the
  cycle, so a removed seat applies within one interval even while a worker runs for hours. A
  new commit otherwise applies at the start of the next cycle.
  #179's heartbeat timer already fires every half interval; the fetch can ride every second
  firing. *Rejected:* fetching only at the start of a cycle, which would leave a removed seat in use
  until the running worker finishes. Requirement: *`igor serve` fetches its lore repository once
  per poll interval*.
- **How the ranks of one role agree on which commit applies.** *Recommended:* they do not
  agree. Each process applies the newest commit it has fetched, at its own cycle start, so for
  up to about one poll interval two ranks can run on different commits. Whether that is safe is a
  question about #179's rules, and #179 has the same gap without this change: a person who
  restarts ranks one at a time after a change produces the same mix. #179's model holds the
  roster and the poll interval the same for every process. Its design says TLC checked safety
  only at the fixed ratios of its timings to the poll interval, and that its rules depend on
  those ratios. A rank that has applied a shorter poll interval would judge a sibling still on
  the longer one gone while that sibling works. *Recommended for the safety part:* fold it into
  #179. Its model
  gives each process its own view of the roster and the poll interval, which changes at that
  process's own cycle start, and keeps its invariant of no two workers on one item. If TLC
  finds a violation, the likely rule is that a heartbeat carries its writer's poll interval and
  a sibling judges it by that interval. Requirement: *Processes apply new commits independently*.
- **A worker mid-task when a pull changes its role's configuration.** *Recommended:* the item's
  whole run, publishing included, finishes on the configuration and lore of its cycle's commit,
  as decision 7 implies. A person who wants it stopped uses `work-claiming`'s stop, open to
  anyone. Requirement: *A
  lore read at each cycle start applies what passes and refuses what fails*.
- **How a fetch authenticates.** *Recommended:* as the role's GitHub App, with a token set for
  that one command, as `surface-adapter`'s *On GitHub, every call an Igor makes acts as its App*
  already requires of every git call `igor serve` makes. The start already refuses where the App
  cannot act on the lore repository (`surface-adapter`'s *An Igor that cannot act as its App
  does not start*). *Rejected:* a deploy key or a credential stored in the checkout, which that
  requirement forbids. Requirement: *`igor serve` fetches its lore repository once per poll
  interval*.
- **Whether a pull can be forced.** *Recommended:* yes. `SIGHUP` makes the process fetch at once,
  and the shipped unit gains `ExecReload=` so that `systemctl reload igor@<role>-<rank>` sends
  it. Under compose, `docker compose kill -s HUP <service>` does the same. A forced fetch is
  still applied at the next cycle start, except a removed seat. Requirement: *A pull can be forced
  with SIGHUP*.
- **Where Igor posts the seat notice** (open on #176). *Recommended:* on the merged pull request
  that brought the commit last changing the seat file. Where no pull request brought it, the
  notice goes on that commit as a commit comment. Requirement: *Igor posts one notice for each
  seat-file change it applies*.
- **A pull that removes the role a process runs** (open on #176). *Recommended:* nothing
  special. A missing role file fails the startup checks, so decision 1 keeps the process on its
  last configuration, with the condition naming the role file, until the operator stops the unit
  or restores the file; decision 12 does the same across a restart. *Rejected:* standing down and
  exiting like #179's rank removed from the roster, because a role deleted by mistake would then
  need every one of its units started again.
- **Local edits and commits in the server's checkout** (open on #176, where it was asked as a
  fast-forward of the checkout failing on local changes). *Recommended:* `igor serve` applies only what the lore repository's branch holds.
  At start it reports each uncommitted change, and each local commit missing from that branch,
  as not applied, and runs without them. Nothing fails, since decision 8 never fast-forwards the
  shared checkout. Requirement: *`igor serve` starts on the newest commit that passes*.
- **Whether `igor run` pulls** (open on #176). *Recommended:* no. It reads the checkout's
  working tree as it finds it, local edits included, as it does today, because a developer
  running one cycle by hand wants their edits applied. Requirement: *`igor run` reads the
  checkout as it finds it*.
- **Two measurements.** That fetches into distinct refs and checkouts of distinct worktrees,
  from several processes sharing one object store, do not fail on each other's git locks (task
  1.5). A lock failure is reported as a failed fetch, so the requirement holds either way; the
  measurement says how often it happens. And that GitHub's Contents API refuses a `PUT` without
  a `sha` on an existing file (task 5.2), which decision 13's one notice rests on. If it does
  not refuse, the record needs a commit and a ref update that does not force.
- **Conflict with #175 (`worker-user`), reported and not resolved.** #175 keeps a worker from
  writing the lore checkout, so that a worker cannot widen its own role. Under this change Igor
  reads its configuration from per-process worktrees. `design.md` puts them inside the lore
  checkout's directory, and decision 8's reset before each read discards any write there, but
  #175's list names the lore checkout, not the worktrees, and should say it covers them.

## Why

Igor reads its configuration from the lore checkout once, at start, and nothing in Igor ever
updates that checkout. A merged change to a role, a new seat, or under #171 a rotated seat token
reaches a running Igor only after someone pulls on the server and restarts it. Under #171 a lender
rotates their token through a pull request, so that manual step would follow every rotation.

The lore repository is where an organization directs its Igors. Merging there should be enough.

## What Changes

- **`igor serve` fetches its lore repository's branch once per poll interval**, as its App, on a
  timer apart from the cycle, and on `SIGHUP`.
- **At the start of each cycle the process reads its configuration from the newest commit it has
  fetched**, in a worktree of its own. A configuration that passes the startup checks is applied
  whole. One that fails is refused under a read-cleared condition, and the last configuration
  that passed stays in force.
- **A removed seat file applies as soon as a fetch brings it**, through #171's requirement.
- **A restart starts on the newest commit that passes.**
- **Igor posts one notice for each seat-file change it applies.**
- **#82's restart clause goes**: a lore fix reaches a running process at its next pull.

## Capabilities

### New Capabilities

- `lore-pull`: how a running `igor serve` process keeps its lore checkout current and applies
  what lands.

### Modified Capabilities

- `stuck-conditions`: #82's *An open condition never ends a running service* loses the clause
  that a lore fix waits for a restart.

## Impact

- `src/serve.ts`, `src/cli.ts` and `src/config.ts`: the fetch timer, the per-process worktree,
  the lore read at each cycle start, the start on the newest passing commit, and the
  refused-configuration condition.
- `deploy/igor.service`: `ExecReload=`.
- `docs/deployment.md`: how a merged change reaches a running Igor.
- Text in #82, #171 and #179 that calls pulling future work is rewritten (tasks 6.1 to 6.3).
- Depends on #171 for seat files, the read-cleared condition and the removal, on #179 for the
  per-cycle reread and its heartbeat timer, and on #82 for the requirement it modifies.
