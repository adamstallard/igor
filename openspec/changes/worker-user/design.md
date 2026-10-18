## Context

Today the worker runs as the Igor's service user. `workerEnv` keeps the Igor's tokens out of
the worker's environment, but a process running as that user can read them from disk, and on
Linux from `/proc/<pid>/environ`. #163's measurement showed Claude Code's path checks stop
`head` and the Read tool and do not stop `node` run by `npm test`.

What the Igor holds:

| credential | where |
|---|---|
| seat tokens for `token_env` | `/etc/igor/env`, loaded by systemd into the Igor's environment |
| the App's identity and key path | `/etc/igor/<role>.env` |
| the App's private key | `/etc/igor/<role>.pem`, read by the Igor; or inline as `GITHUB_APP_PRIVATE_KEY` in `/etc/igor/<role>.env`, and so in the Igor's environment |
| the age private key that decrypts seat files: #171 (`seat-files`) moves seat tokens into encrypted files in the lore repository, replacing `token_file` | the path `seatKey` names, read by the Igor |
| seat token files | the paths a seat's `token_file` names (on `main`; #171 removes them) |
| minted installation tokens | the Igor's memory, and the environment of each `gh` child |

Adam decided on 2026-10-11 that the worker runs as a separate Unix user. This document says how.

## Decisions

### The worker is started through `sudo`

The Igor spawns:

```
sudo --non-interactive --user=<worker> --preserve-env=<names> -- \
  /usr/bin/env PATH=<path> <absolute path of claude> -p … (the worker's flags, unchanged)
```

- **`--preserve-env=<names>`** carries exactly the variables `workerEnv` builds, minus `PATH`
  and `HOME`, and the seat token is one of them. A token in the argument list would be readable
  by every user on the host through `/proc/<pid>/cmdline` and `ps`.
- **`PATH` goes through `env`**, because Debian and Ubuntu set `secure_path` in sudoers, and
  that replaces a preserved `PATH`. `PATH` is not a secret.
- **`HOME` is the worker's own**, which sudo sets for the target user, and it lasts across
  runs. Toolchain caches, `~/.claude` and `~/.gitconfig` are the worker's, not the Igor's.
  Before each `claude -p`, `~/.claude` and `~/.claude.json` are reset from a template built into
  Igor, so nothing a worker planted there loads in a later call, and the rest of the home stays.
  The reset keeps `~/.claude/.credentials.json`, the stored Claude login, so an organization with
  no seats still runs. The Igor does the reset as the worker user, through this same `sudo`.
  #174 (`pinned-skills`, an open change) specifies the reset and its template in its decision 9,
  and the kill of every process the worker user owns before every reset in its decision 13
  (Adam, 2026-10-17). Whichever of this change and #174 is built second makes this `sudo`
  spawn run #174's reset and kill (task 0.6).
- **#153's `prose start` runs as the worker too** (Adam, 2026-10-17), through this same `sudo`
  and after the reset. `prose start` is the prose skill's first call; it writes a session mark,
  a file under `~/.local/state`, which #153's prose steps check for before they sign. Those steps
  run as the worker and look in the worker's home, so the mark must be there and be the
  worker's. Run as the service user, `prose start` could not write the worker's `0700` home, and
  the unit's `ProtectHome=read-only` would stop it writing the service user's own
  `~/.local/state`.
- **`claude` is resolved by the Igor** on its own `PATH` and passed as an absolute path, so the
  worker runs the same binary the Igor's triage does.
- **The spawn is otherwise unchanged:** detached, so `sudo` leads a new process group, with
  stdio as pipes. With no terminal, sudo allocates no pty and the stream arrives as it does now
  (task 6.2 measures it).

The sudoers rule, installed as `/etc/sudoers.d/igor`, has one line per Igor instance (Adam
accepted the line on 2026-10-11, and one worker user per instance on 2026-10-17). For rank 1 of
the `maintenance` role:

```
igor ALL=(igor-worker-maintenance-1) NOPASSWD: ALL
```

`ALL` here means any command as `igor-worker-maintenance-1`, and as nobody else. That is no wider
than naming `claude`. Anything the service user could run as the worker, it could already run as
itself with more privilege, and the rule grants no path to root. Naming commands instead would
need one entry for `claude`, one for the kill and one for the removal, with argument patterns
sudo matches loosely. It would protect nothing the runas restriction doesn't. `ALL` also implies
`SETENV`, which `--preserve-env` needs.

**Rejected: a setuid helper.** It would be security-critical code that Igor writes and ships,
and the unit's `NoNewPrivileges=true` blocks it exactly as it blocks sudo. It has sudo's costs
and none of its review history.

**Rejected: `systemd-run --uid=`.** The service user needs a polkit rule to start units, and
the worker would not be the Igor's child, so the stream, the kill and the exit status would all
go through `systemctl`. Worst, a transient unit's environment is a unit property that any local
user can read over D-Bus with `systemctl show`, so the seat token would be readable by the
worker itself and by every other account on the host.

**Rejected direction: Claude Code's sandbox** for the worker, denying reads of `/etc/igor/` and
`/proc`. Whether its read restrictions bind a `node` process an allowed command starts has
not been measured. Even if they do, the guarantee would belong to whichever Claude Code version
is installed, and #144 shows releases change behaviour a deployment depends on.

**Rejected direction: keeping the App's key off the host** and passing the Igor short-lived
tokens minted elsewhere. That bounds a leak to one token's lifetime but stops nothing: the
worker still reads whatever token, seat token or age key the Igor holds at that moment.

### Each instance has its own worker user (Adam, 2026-10-17)

An Igor instance is one unit, `igor@<role>-<rank>` under #179 (`concurrent-instances`), with the
rank always written. Its worker user is `igor-worker-<role>-<rank>`, with its own home,
`/var/lib/igor-worker-<role>-<rank>`, and its own sudoers line. The deployment templates generate
all three for each instance. The unit names the user as `igor-worker-%i` (below).

On Linux, processes of one Unix user can normally read each other's `/proc/<pid>/environ` and
follow each other's `/proc/<pid>/cwd`. With one worker user shared by several instances, that
opens three routes from one worker into another's:

- **Its seat token**, read through `/proc/<pid>/environ`. The worker-environment requirement
  gives each worker only its own seat's token, and the other worker may belong to another role
  or to another rank of the same role drawing on a different seat.
- **Its tree**, edited through `/proc/<pid>/cwd`, whose output is then published under the other
  instance's name.
- **Its home**, where one worker can leave a file, such as `~/.npmrc`, that the other then runs.

A worker user per instance closes all three, at the cost of one more user, home and sudoers line
per instance. Within one instance, a file a run leaves outside `~/.claude` and `~/.claude.json`
reaches that instance's later runs. Adam accepted that (#174's decision 9): the home has to last
for `~/.gitconfig` and the caches a repository's tests need, and such a file can steer only the
same instance's own later work, never another instance's.

Whether the `/proc` reach holds between two Igor units, each with its own mount namespace and
`/tmp`, is not measured. Task 6.6 measures it, and its result goes in this section and in
`docs/deployment.md`. The per-instance users do not wait for it.

### The unit names the worker user from its instance (Adam, 2026-10-17)

An instance is named `<role>-<rank>`, with the rank always written, so `%i` is already the dash
form and `igor-worker-%i` is the worker user's name. The unit uses it directly for
`SupplementaryGroups=` and `ReadWritePaths=`. No drop-in is generated per instance, no step edits
`/etc/group`, and the Igor computes no name. The GitHub App identity stays one per role: the rank
appears only in names on the host. This depends on #179 naming instances `<role>-<rank>`, which
#179 is to do in its own next revision (task 0.8).

The dash form is kept, rather than naming the user `igor-worker-<role>.<rank>`, because a dot in
a user name reads as `user.group` to tools such as `chown`.

Adam's decision also names `User=` and `Group=`. In a unit those set the account the Igor process
itself runs as, and that has to stay the service user, or the worker user could read the Igor's
credentials. So what those two settings hold, and how the Igor learns the name it sudoes to, are
open (proposal, *Still open*).

**Not `igor.config.yaml`.** The lore repository is shared and edited by pull request, and a
lore pull request that set the worker user to the service user would turn isolation off for
every Igor that reads it. The start-up check would refuse that value, but a refused start is
still an outage triggered from a repository.

`serve` always has a worker user and `run` never does (proposal, decision 3), so nothing in the
environment or the configuration has to say whether a worker user is in use.

### The tree and outbox are shared through the worker's group

The Igor joins the worker user's primary group through the unit's
`SupplementaryGroups=igor-worker-%i` (*The unit*, below). The worker
does not join the Igor's group.

| path | owner:group | mode | why |
|---|---|---|---|
| tree directory | igor:igor-worker-<role>-<rank> | `2770` | setgid, so files created in it get the group |
| tree files from the clone | igor:igor-worker-<role>-<rank> | `0660`, directories `2770` | cloned under umask `007`, so the worker can edit and remove them |
| git directory, `<tree>-git`, beside the tree | igor:igor-worker-<role>-<rank> | group read, no group write | the worker reads history; it cannot write hooks or config |
| outbox, `<tree>-outbox` | igor:igor-worker-<role>-<rank> | `2770` | the worker writes declarations and its git index here |
| files the worker creates | igor-worker-<role>-<rank>:igor-worker-<role>-<rank> | sudo's umask, at least `0027` | the Igor reads them through the group; only the worker writes them |
| worker's home | igor-worker-<role>-<rank>:igor-worker-<role>-<rank> | `0700` | its caches, `~/.gitconfig` and `~/.claude`, out of the Igor's way; lasts across runs |
| the Igor's home, lore checkout, `/etc/igor` | igor:igor | `0700`/`0750` | the worker is not in this group |

**The git directory sits beside the tree, not in it.** The worker can write the tree's top
directory, so it can rename or replace anything there, `.git` included. A sticky bit would stop
that, and would also stop `git rm` of a top-level file the Igor owns. So the clone uses
`--separate-git-dir=<tree>-git`, which leaves a `.git` file in the tree pointing at it. The
worker's git follows that file. The Igor's git never does: every git command the Igor runs in a
tree names the git directory and the tree explicitly (`--git-dir`, `--work-tree`). A `.git` the
worker replaces then misleads only the worker.

**`git rm` and `git mv` write an index copy.** Both write the index, and the index needs a
lock file beside it, so writing the real one needs the git directory writable. So the Igor
copies the index into the outbox before the worker starts and sets `GIT_INDEX_FILE` to that copy
in the worker's environment, which the worker-environment requirement is modified to allow.

**The Igor reads changes against its own index, never the copy.** An index decides what
`git status` reports: a worker that sets skip-worktree or assume-unchanged in it, or removes an
entry with `update-index --force-remove`, hides a change from a read made against it. The
worker's own `git rm` and `git mv` show on disk anyway, as a removed path and a new one, so the
a status read against the git directory's own index, which the worker cannot write, sees
both the removed path and the new one.

**The worker's git trusts the tree.** The tree belongs to the Igor, and git refuses to work in a
repository another user owns unless `safe.directory` allows it. That setting is honoured only
in global, system or command-line configuration. #156 forbids `GIT_CONFIG_*` in the worker's
environment (the worker-environment requirement), so the start-up check sets `safe.directory=*` in the worker user's own
`~/.gitconfig` once, as the worker. That file affects only the worker.

### The Igor runs nothing the worker wrote

- Every git command the Igor runs in a tree passes `-c core.hooksPath=/dev/null -c
  core.fsmonitor=false`. With the git directory read-only to the worker this is redundant, and
  it stays because the cost of being wrong is running code as the Igor.
- Filter, merge and diff drivers are defined only in configuration. `.gitattributes`, which the
  worker can write, can name a driver but cannot define one, and the tree's configuration is
  not the worker's to write.
- A nested repository is the exception: its own `.git/config` is the worker's, and git running
  in the outer tree can recurse into it and run a filter that file defines. So every git command
  the Igor runs in a tree also passes `-c submodule.recurse=false` and `--ignore-submodules=all`
  where the command takes it, and a changed path that holds its own `.git` with working content
  stops the run, naming it.
- **A changed submodule pointer is published as a pointer once #137 lands (Adam, 2026-10-17).**
  A gitlink, mode `160000`, names a commit, and #137 publishes it as that commit. The Igor
  publishes the commit the gitlink names and never enters the submodule's directory or runs git
  in it. Until #137 lands, a changed gitlink stops the run, naming it, as a changed link does
  (*The Igor reads changes without following links*, below).
- The Igor does not run `npm`, `node` or any command in the tree. Only the worker user does.

### Every model step in the tree runs as the worker, and checks run on a recorded tree (Adam, 2026-10-17)

#153 (`signed-publishing`) adds `claude -p` steps after the worker: a bug hunt and a prose pass,
which edit the tree and write the commit message and the pull request text. Bug-hunter runs
`npm test`, so those steps run
repository code, and they edit the tree. Run as the Igor, that code could read the Igor's
credentials. So every `claude -p` the Igor starts with the tree as its working directory goes
through the same `sudo` spawn as the worker.

The kill, the link checks below and the Igor's read of the tree wait until the worker and the
last model step have exited. The Igor then records the tree it read: it stages the changed paths
in its own index and writes the index's tree object (`git write-tree`) into its own git
directory, which the worker user cannot write. #153's trailers are created against that tree
(below), and the Igor publishes from that tree object. #189 (`loop-verifies-commands`) has the Igor run the role's
checks, such as its tests, as the worker user, and they run after that record. The Igor publishes
the recorded tree, so anything a check writes, such as a coverage report or a link, is discarded,
and #189's rule that checks do not change what is published stands.

### #153's steps are signed once, at the end (Adam, 2026-10-17)

#153 binds each commit's trailers to a staged tree. `git add` writes objects into the git
directory, which is read-only to the worker user, and the index the worker can write is its copy
in the outbox. So the steps do not stage or sign. Bug-hunter runs, then the prose pass, and each
only edits the tree. After the last model step exits, the Igor's code stages the changed paths
once, in the Igor's own index, and both trailers, `Bug-hunter:` and `Prose:`, are created
against the tree of that index. That tree is the one the Igor records, runs the link checks on,
and publishes. The trailers bind to the published tree only if the clone's tree equals the tree
the Git Data API builds from the same files; the two can differ in file modes. #153's own task
0.4 measures that, and where they differ #153 binds the trailers to the API's tree instead (its
design, item 3). The worker cannot change the recorded tree object,
and a copy the worker could change, the index copy included, is never what a trailer is bound
to.

Staging before each step instead would run `git add` over the worker's files before the link
and hard-link checks, and the prose pass's edits, made after bug-hunter's staging, would be
missing from the tree bug-hunter's trailer named. Who runs the calls that produce the trailers
(prose's `prose check` and bug-hunter's trailer script) against the Igor's index, which neither
step can write, is open (proposal, *Still open*; task 0.5).

### The Igor reads changes without following links

`changes()` reads each changed file with `readFile`, which follows symbolic links. A link the
worker made to `/etc/igor/<role>.pem` would be read as the Igor and published as the file's
content. With one user this was moot, because the worker could read the key itself. With two
users it is the one remaining path to the key.

So, once the last process the Igor started as the worker user for the run has exited and its
process group is killed, and before anything is read:

- A changed path is checked with `lstat` on each component from the tree down. Where a
  directory above it is a link, the run stops naming the path. Where the path itself is a link,
  it is published as a link or stops the run, as below.
- A file is opened with `O_NOFOLLOW`, and its real path must still sit inside the tree's real
  path. This closes the race with a worker process that escaped the group by `setsid()`.
- A file the Igor cannot open stops the run, naming it. Skipping it is safe only while nobody
  is choosing which files are unreadable.
- **A changed file whose link count is above 1 stops the run, naming it** (Adam, 2026-10-17). A
  hard link to `/etc/igor/<role>.pem`, made in the tree, is a regular file whose real path is
  inside the tree, so `O_NOFOLLOW` and the real-path check pass it. Linux's
  `fs.protected_hardlinks=1` stops an unprivileged user making a hard link to a file it cannot
  read or write, and the start check refuses a host without it (*What each start checks*). The
  link-count check stops one that exists anyway, such as one made before the setting was on.
- Every path a refusal names is escaped for a markdown code span, as `quoteName` escapes a name
  that is not text: the worker chooses these names, and a backtick in one would end the span in
  the comment the Igor posts.
- **Every file read from the tree or the outbox gets the same checks** (Adam, 2026-10-17): it is
  opened with `O_NOFOLLOW` and read only if it is a regular file whose link count is 1. That
  includes the declaration file, `reverts.json` in the outbox, which the worker writes and the
  changed-path checks above never see.
- **A parse error never quotes what it parsed.** Node's `JSON.parse` puts the start of the text
  in its error message (`Unexpected token 's', "secret-key…" is not valid JSON`), so a refusal
  or record built from that message would carry a hard-linked key's text out. An error about a
  file read from the worker names the file and says it did not parse, and nothing more.

**A changed link is published as a link once #137 lands (Adam, 2026-10-17).** #137
(`carry-what-a-tree-holds`), an open change, publishes a link with mode `120000` and its target
text as content. The Igor reads that text with `readlink`, after `lstat` confirms the path is a
link, and never opens the file it points to. A link to `/etc/igor/<role>.pem` then publishes
the path `/etc/igor/<role>.pem`, which the worker wrote, and none of the key.

Until #137 lands, a changed link stops the run. The two functions that publish an artifact,
`createBranchWithFiles` and `commitOnBranch` in `src/github.ts`, send each path as a file, mode
`100644` or `100755`, so a link could be published only as a regular file. Task 0.4 says
whether a link is published or stops the run when this change is built.

A path beneath a linked directory stops the run either way. Git does not track a path beyond a
link, and reading one would follow the link.

### Kill, release and sweep act as the worker where they must

- **Kill:** `sudo -n -u <worker> -- kill -KILL -- -<pgid>`, where `<pgid>` is the pid of the
  `sudo` the Igor spawned. The Igor cannot signal the worker's processes itself. Without a pty,
  sudo is expected to keep the command in its own process group and to exit when the command
  does; task 6.2 measures both. At process exit the call is synchronous (`spawnSync`), because
  an `exit` handler cannot wait.
- **Release:** `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>` first. That removes everything
  the worker owns and the Igor's files in directories the worker can write. Then the Igor's own
  `rm` removes the rest, and the git directory, which only the Igor can write. Both passes run
  whatever the first does, as now.
- **Sweep:** the same passes over each sweepable name. The name rule gains the `-git` suffix
  beside `-outbox`.

**Trees live in `/var/lib/igor/trees` (Adam, 2026-10-17).** Under `serve`, every tree, outbox and
`<tree>-git` is created in the shared state directory, not in the instance's private `/tmp`.
#179 (`concurrent-instances`) has a sibling rank sweep a gone rank's trees after a crash, and one
unit cannot see another's private `/tmp`. The modes and groups in the table above hold there
unchanged. The sibling's removal pass runs as the gone rank's worker user, which owns what that
rank's worker wrote; the sudoers file has a line for every instance under the one service user,
so the sibling can sudo to it. The sibling needs that user's name. Forming it from the role and
rank would be the Igor computing a name, which the proposal's decision 5 rules out, so how the
sibling gets it is open (proposal, *Still open*).

### What each start checks

Before the first cycle, `serve` checks in this order, stopping at the first failure:

1. The user exists, its uid is not 0, and it is not the Igor's own user.
2. `sudo -n -u <worker> -- true` succeeds.
3. The Igor's groups include the worker's primary group.
4. As the worker, `test -x` on the absolute path of the `claude` the Igor resolves succeeds.
   Without it, every item would fail at spawn instead of the Igor refusing to start.
5. As the worker, one `sudo` call runs `test -r` or `test -w` on each path below and reports
   which ones succeed. Every path that succeeds is a refusal, and the refusal names it.
   - not readable: `/proc/<igor pid>/environ` (Linux); the file
     `GITHUB_APP_PRIVATE_KEY_FILE` names; the path `seatKey` names; each seat's `token_file`;
     the Igor user's home, which must also not be traversable; and a canary the check
     writes, mode `0600`, in a fresh `0700` directory of the Igor's
   - not writable: the lore checkout; the directory holding the running `igor`; the `node`
     executable
   - `skills_dir`, #174's directory of pinned skills: in a second `sudo` call, the worker tries
     to create a file in it and delete it, and a create that succeeds is a refusal (Adam,
     2026-10-17). The worker never needs to write there.
6. `/proc/sys/fs/protected_hardlinks` reads `1` (Adam, 2026-10-17). Otherwise the worker could
   make a hard link to the App's key in its tree.
7. As the worker, `git config --global safe.directory '*'` is set if missing.

The canary is what makes the check prove something on a host where every real credential is in
the environment and no key file exists. It fails if the worker user is privileged in a way
the uid check misses, such as through `CAP_DAC_READ_SEARCH`.

The env files themselves are not probed: systemd reads them, so the Igor never learns their
paths. The `/proc` probe covers what they contain, an inline `GITHUB_APP_PRIVATE_KEY`
included, and the deployment guide puts them in a directory the worker cannot enter. On macOS,
which has no `/proc`, nothing probes an inline key.

### `igor doctor` gets no check (Adam, 2026-10-11)

`igor doctor` (#113) reports on a lore repository and is run from wherever someone has a
checkout, usually not the host and not as the service user. Isolation is a property of one
host and one service user, and only the Igor process knows its key paths and its own pid. The
start-up check above is the place for it, and it refuses rather than reports. Under doctor's own
rule (*name the command that covers it*), the most it could add is one line saying the Igor
checks worker isolation when it starts. That is a later edit to its branch, not one made here.

### `serve` always has a worker user, `run` never does (Adam, 2026-10-11; amended 2026-10-17)

- **`serve` always runs its worker as its worker user**, and refuses to start if that user does
  not exist (*What each start checks*). It has no `--same-user` flag. An unattended Igor on
  issues anyone can file is the case the issue says must not run without isolation.
- **`run` always runs the worker as the same user**, with a notice. It is the one-shot command
  for development: a person at a terminal, usually on a laptop with their own login, where a
  second account is friction for no gain. The notice puts the choice in every log.

So the command says whether there is a worker user, and no setting does. The alternatives:
`serve --same-user`, which leaves an unattended Igor whose worker can read its credentials;
refusing both without a worker user, which adds a step to every development run; and warning in
both, where one forgotten setting on a server would bring back the exposure #163 found.

**macOS runs `serve` only in #192's container image** (`deploy-image`), and runs `run` on the
host. macOS has no `/proc` to probe and no `fs.protected_hardlinks`, so start check 6 would
refuse a worker user there anyway. The deployment guide gives the Linux steps.

### The unit

- `NoNewPrivileges=true` goes: it stops `sudo` from changing user at all. The worker keeps what
  any unprivileged account has and gains nothing else, since it has no sudoers entry.
- The unit names the worker user as `igor-worker-%i` (above). `SupplementaryGroups=igor-worker-%i`
  puts the Igor in the worker's group, and `ReadWritePaths=/var/lib/igor-worker-%i` keeps the
  worker's home writable inside the unit's mount namespace, where `ProtectSystem=strict` makes
  `/var` read-only. The proposal's decision 5 names `User=` and `Group=` too; what those two
  hold is open (proposal, *Still open*).
- `PrivateTmp=true` stays for everything but the trees. Trees live in the shared
  `/var/lib/igor/trees` (above), under the unit's `StateDirectory=` (#179), so
  `ReadWritePaths=` must keep that directory writable too.
- `PATH` puts `/usr/local/bin` first, where `claude` now lives, because the worker cannot enter
  the service user's home and so cannot run `~igor/.local/bin/claude`.

## Risks / Trade-offs

- **The seat token is visible to what the worker runs.** It has to be in `claude`'s
  environment, and Claude Code passes its environment to the commands it runs. A worker can
  spend or leak its own seat. That was true before, and the template's comment on `npm test`
  already says so. Task 6.4 records what Claude Code actually passes.
- **The worker can still reach the network.** It can send out its seat token and anything in
  its tree, which is the repository it was given.
- **A process that escapes the group by `setsid()`** survives the kill of the group. It runs
  as the worker, so it can reach nothing the worker couldn't, and the link checks hold against
  it. Before every reset of the worker's home, Igor kills every process the worker user owns
  (#174's decision 13), so it cannot outlive the model step it escaped from.
- **`sudo` logs each command line** to the auth log, and the worker's command line holds the
  prompt. Task 6.5 measures what lands there. If it is the whole prompt, the template turns off
  sudo's logging for the Igor's user.

## Measurements owed

All on a Linux host with the shipped unit, canary files at the real paths and modes, and never a
real secret. Results go back into this document, including where they contradict it.

- Task 6.1, the #163 attack: `npm test` running a file the worker wrote reads each canary and
  `/proc/<pid>/environ`, under the real worker flags.
- Task 6.2: the stream under `sudo`, the kill of the group, and `sudo` under the unit's
  `ProtectSystem=strict`.
- Task 6.3: `git rm` and `git mv` against an index copy, with the git directory read-only and
  outside the tree.
- Task 6.4: the environment Claude Code gives the commands it runs.
- Task 6.5: what `sudo` logs per worker start.
- Task 6.6: whether two workers running as one worker user, under two Igor units, can read each
  other's `/proc/<pid>/environ` or enter each other's tree through `/proc/<pid>/cwd`. Its result
  informs the docs; nothing waits for it.
