## Decisions

1. **The worker runs as a separate Unix user** (Adam, 2026-10-11). *Rejected:* Claude Code's
   sandbox, whose read limits on a process an allowed command starts are unmeasured and belong to
   whichever release is installed; and keeping the App's key off the host, which bounds a leak
   but stops none.
2. **`sudo` starts the worker, under one sudoers line per worker user:
   `igor ALL=(igor-worker-<role>) NOPASSWD: ALL`** (Adam, 2026-10-11, with one worker user per
   role from decision 7). Each line lets the service user act as that worker user and nobody
   else. *Rejected:* a setuid helper, which is security-critical code Igor would ship; and
   `systemd-run --uid=`, which exposes a unit's environment, seat token included, to every local
   user over D-Bus.
3. **Without a worker user, `serve` refuses to start unless passed `--same-user`, and `run` runs
   the worker as the same user with a notice** (Adam, 2026-10-11). *Rejected:* refusing both,
   which adds a flag to every development run; and warning in both, which leaves a server one
   missing line from the exposure #163 found.
4. **`igor doctor` (#113) gets no check** (Adam, 2026-10-11). Only the Igor process knows its key
   paths and pid, so `run` and `serve` check isolation when they start.
5. **`IGOR_WORKER_USER` is read from the Igor's environment, not `igor.config.yaml`.**
   *Rejected:* a configuration key, which a lore pull request could point at the service user.
6. **A changed file the Igor cannot read stops the run**, rather than being left out of the
   artifact. While the worker chooses which files are unreadable, skipping them is not safe.
7. **One worker user per role, or per Igor instance, rather than one shared by every role**
   (Adam, 2026-10-17). Where a role runs one instance, the two are the same, and the template
   names the user `igor-worker-<role>`. Which applies when a role runs several instances is
   open (#179, under *Still open*). *Rejected:* one worker user shared by every role on a host.
   On Linux, processes of one user can normally read each other's `/proc/<pid>/environ`, so one
   role's worker could read another role's seat token. Task 6.6 measures that reach between
   two Igor units before the per-role users are built, and records it in `design.md`.
8. **`deploy/igor.service` drops `NoNewPrivileges`**, which stops `sudo` from changing user, and
   **`claude` moves to `/usr/local/bin`**, because the worker cannot enter the service user's
   home.
9. **A changed symbolic link is published as a link once #137 lands** (Adam, 2026-10-17). #137
   (`carry-what-a-tree-holds`) is an open change that publishes a link as its target text, mode
   `120000`. The Igor reads the link with `lstat` and `readlink` and never follows it, so the
   file it points to never reaches the artifact. Until #137 lands, a changed link stops the
   run, because the publishing paths can carry only regular files.
10. **Every `claude -p` that runs in the worker's tree runs as the worker user** (Adam,
    2026-10-17). That includes #153's (`signed-publishing`) model steps after the worker, the
    prose pass and the bug hunt, which run repository code such as `npm test` and edit the
    tree. The link checks run after the last of them exits.
11. **`skills_dir` (#174) joins the start check's write probe** (Adam, 2026-10-17). As the worker
    user, the check tries once to create and delete a file there, and refuses to start if it
    can. The worker never needs to write there.

**Still open:**

- **Measurements 6.1 to 6.6** are owed before tasks.md sections 2 to 4 (the tree, what the Igor
  runs and reads, and kill and release) are built: #163's attack as the worker user, the stream
  and kill under `sudo` in the unit, `git rm` and `git mv` against the index copy, what
  environment Claude Code passes to the commands it runs, what `sudo` logs, and the reach
  between workers of one user.
- **macOS** has no `/proc` to probe, and its steps are unmeasured.
- **If task 6.6 finds no `/proc` reach between two units**, whether one user per role still
  holds. A shared home is a second route between roles (`design.md`).
- **Per role or per instance, under #179.** #179 (`concurrent-instances`) names a unit
  instance `<role>.<rank>`, so `igor-worker-%i` would give each rank its own user, and the
  sudoers lines and `useradd` steps here assume one per role. Ranks of one role sharing a user
  could draw on different seats and read each other's tokens through `/proc`.
- **#153's steps stage with `git add`.** `git add` writes objects into the git directory, which
  is read-only to the worker user, and #153's steps now run as that user. Which index their
  signed tree is bound to, the worker's copy or the Igor's own, is not said either.
- **#189's checks run as the worker user after the Igor reads the tree.** #189
  (`loop-verifies-commands`) has the Igor run the role's checks, such as its tests, as the
  worker user before publishing. Those checks run repository code, which could change the tree
  after the link checks. Decision 10 covers `claude -p` only.
- **Submodules under #137.** When a base branch moves a submodule to another commit, #137
  publishes the conflict resolution with the submodule at that commit. This change stops any
  run whose changed paths include a submodule entry, so such a resolution can never be
  published. Decision 9 covers links only.
- **A fresh home per run.** #174 decided (2026-10-17) that each worker run gets a fresh, empty
  home, discarded afterwards. This design gives the worker user one lasting home,
  `/var/lib/igor-worker-<role>`.

## Why

A worker can read any file the Igor's service user can read
([#163](https://github.com/adamstallard/igor/issues/163)). Claude Code refuses its own Read tool
and `head` outside the tree, but a test file the worker writes in the tree runs under an allowed
`npm test` and reads whatever it likes. Measured on 2026-10-07, it printed a canary placed outside
the tree. The same route reads the per-role env file, the App's private key (#156), the seat
tokens, the age private key that decrypts seat files once #171 lands, and, on Linux, the Igor's
own `/proc/<pid>/environ`.

A worker takes instructions from issue text, which anyone who can file an issue can write. With
the App's key they can mint installation tokens for every repository the App is installed on,
until the key is rotated. Of the directions in the issue, a separate Unix user is the only one
that doesn't depend on Claude Code enforcing anything.

## What Changes

- **The worker runs as a second Unix user**, named by `IGOR_WORKER_USER`, one per role. The Igor
  starts it through `sudo`, under a sudoers rule that lets the service user run commands as that
  one user and nobody else. The seat token reaches `claude` through its environment, never its
  arguments. Every later model step in the tree, such as #153's prose pass and bug hunt, runs as
  the same user.
- **The worker gets its tree, its outbox, its seat token and its tools, and nothing else.** The
  tree and outbox are shared through the worker's group, of which the Igor is a member. The
  git directory sits beside the tree, the Igor's and read-only to the worker. `git rm` and
  `git mv` write an index copy kept in the outbox, and the Igor reads the changes against its
  own index, never that copy.
- **Nothing the worker writes is run or followed by the Igor.** The Igor runs git in a tree
  with hooks, fsmonitor and submodule recursion off, and follows no symbolic link. It stops a
  run on a nested repository, a path beneath a link, or a file it cannot read, rather than
  dropping it. A changed link is published as a link once #137 lands, and stops the run until
  then. These checks run after the last process in the tree exits.
- **A kill, a release and the startup sweep act as the worker user** where the worker's own
  processes and files need it.
- **Every start checks the isolation.** `run` and `serve` refuse to start, naming what is wrong,
  if the worker user is missing, privileged, or the Igor's own user, if `sudo` asks for a
  password, if the worker cannot run `claude`, or if the worker can read the Igor's process
  environment, a key or token file the Igor's configuration names, or a canary, or can write
  the lore checkout, the Igor's installation or `skills_dir`. The env files systemd loads are not probed,
  since the Igor never learns their paths; the process-environment check covers what they hold.
- **Without a worker user**, `serve` refuses to start unless passed `--same-user`, and `run`
  runs the worker as the same user with a notice.
- **Deployment:** `deploy/igor.service` gains the role's worker user, its group and its home,
  and drops `NoNewPrivileges`, which blocks `sudo`. A new `deploy/sudoers.example` and a section
  in `docs/deployment.md` cover creating a worker user for each role. `claude` moves out of the service user's home,
  because the worker must be able to run it.

Not changed: triage and usage reads still run `claude` as the Igor, because triage allows no
tools and a usage read, the `claude` call that reads a seat's
quota, runs no item text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: seven requirements added. The worker, and every model step in its tree,
  runs as a separate user. That user can write nothing the Igor depends on, and the Igor runs
  nothing it writes. The Igor reads no file through a symbolic link. A kill and a release reach
  what the worker owns. The isolation is checked before any work. And the behaviour without a
  worker user is defined. One is modified: *The worker is given an explicit environment holding no
  credential but its seat's* also passes `GIT_INDEX_FILE`, naming the worker's index copy.

## Impact

- `src/execute.ts` (`claudeWorker`, `workerEnv`'s caller, the kill), `src/worktree.ts`
  (provision, release, `changes()`), `src/sweep.ts`, `src/cli.ts` (`run`, `serve`), and a new
  module for the start-up probe.
- `deploy/igor.service`, `deploy/docker-compose.yml`, a new `deploy/sudoers.example`,
  `docs/deployment.md`, and a paragraph in `docs/architecture.md` §6.3.2.
- `igor doctor` (#113) gains no check (Adam, 2026-10-11); design.md says why.
