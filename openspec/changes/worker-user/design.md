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
- **`HOME` is the worker's own**, which sudo sets for the target user. Toolchain caches,
  `~/.claude` and `~/.gitconfig` are the worker's, not the Igor's.
- **`claude` is resolved by the Igor** on its own `PATH` and passed as an absolute path, so the
  worker runs the same binary the Igor's triage does.
- **The spawn is otherwise unchanged:** detached, so `sudo` leads a new process group, with
  stdio as pipes. With no terminal, sudo allocates no pty and the stream arrives as it does now
  (task 6.2 measures it).

The sudoers rule, installed as `/etc/sudoers.d/igor` (Adam accepted it on 2026-10-11):

```
igor ALL=(igor-worker) NOPASSWD: ALL
```

`ALL` here means any command as `igor-worker`, and as nobody else. That is no wider than
naming `claude`. Anything the service user could run as the worker, it could already run as
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

### `IGOR_WORKER_USER` names the user, in the Igor's environment

The worker user is a fact about the host, like `PATH`. So it is set where the host is
described: `Environment=` in the unit, `environment:` in compose, or exported in a shell.

**Not `igor.config.yaml`.** The lore repository is shared and edited by pull request, and a
lore pull request that set the worker user to the service user would turn isolation off for
every Igor that reads it. The start-up check would refuse that value, but a refused start is
still an outage triggered from a repository.

### The tree and outbox are shared through the worker's group

The Igor joins the worker user's primary group (`SupplementaryGroups=` in the unit). The worker
does not join the Igor's group.

| path | owner:group | mode | why |
|---|---|---|---|
| tree directory | igor:igor-worker | `2770` | setgid, so files created in it get the group |
| tree files from the clone | igor:igor-worker | `0660`, directories `2770` | cloned under umask `007`, so the worker can edit and remove them |
| git directory, `<tree>-git`, beside the tree | igor:igor-worker | group read, no group write | the worker reads history; it cannot write hooks or config |
| outbox, `<tree>-outbox` | igor:igor-worker | `2770` | the worker writes declarations and its git index here |
| files the worker creates | igor-worker:igor-worker | sudo's umask, at least `0027` | the Igor reads them through the group; only the worker writes them |
| worker's home | igor-worker:igor-worker | `0700` | its caches and `~/.claude`, out of the Igor's way |
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
  where the command takes it, and a changed path that is a submodule entry or holds its own
  `.git` stops the run, naming it.
- The Igor does not run `npm`, `node` or any command in the tree. Only the worker does.

### The Igor reads changes without following links

`changes()` reads each changed file with `readFile`, which follows symbolic links. A link the
worker made to `/etc/igor/<role>.pem` would be read as the Igor and published as the file's
content. With one user this was moot, because the worker could read the key itself. With two
users it is the one remaining path to the key.

So, after the worker's process group is killed and before anything is read:

- A changed path is checked with `lstat` on each component from the tree down. Where any of
  them is a link, the run stops naming it.
- A file is opened with `O_NOFOLLOW`, and its real path must still sit inside the tree's real
  path. This closes the race with a worker process that escaped the group by `setsid()`.
- A file the Igor cannot open stops the run, naming it. Skipping it is safe only while nobody
  is choosing which files are unreadable.
- Every path a refusal names is escaped for a markdown code span, as `quoteName` escapes a name
  that is not text: the worker chooses these names, and a backtick in one would end the span in
  the comment the Igor posts.
- The declaration file is opened with `O_NOFOLLOW` and read only if it is a regular file.

Refusing a link rather than publishing it as a link keeps the publishing paths as they are. The
Git Data API path could carry mode `120000`, but `createCommitOnBranch` has no mode at all. A
worker rarely has reason to create a link, and the stop says which path it was. #137
(`carry-what-a-tree-holds`), an open change, would publish a link with mode `120000`; whether
to carry a link that way once it lands is open (proposal).

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

### What each start checks

Before the first cycle, with a worker user configured, `run` and `serve` check in this order,
stopping at the first failure:

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
6. As the worker, `git config --global safe.directory '*'` is set if missing.

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

### Without a worker user: `serve` refuses, `run` warns (Adam, 2026-10-11)

- **`serve` refuses to start** with no `IGOR_WORKER_USER`, unless passed `--same-user`. An
  unattended Igor on issues anyone can file is the case the issue says must not run without
  isolation.
- **`run` runs as the same user** with a notice. It is a person at a terminal, usually on a
  laptop with their own login, where a second account is friction for no gain.
- **Both print the notice** whenever the worker runs as the Igor's user, so the choice is in
  every log.

The alternatives: refusing both without the flag, which is safer and adds a flag to every
development run, or warning in both, which leaves a server one missing line from the old exposure.

**macOS** has `sudo`, `dscl` and `sysadminctl`, so the same arrangement works there, with no
`/proc` to probe. The deployment guide gives the Linux steps. A macOS server is rare enough that
its steps are recorded only once someone has measured them.

### The unit

- `NoNewPrivileges=true` goes: it stops `sudo` from changing user at all. The worker keeps what
  any unprivileged account has and gains nothing else, since it has no sudoers entry.
- `SupplementaryGroups=igor-worker`, so the Igor is in the worker's group without relying on a
  login session.
- `ReadWritePaths=` adds the worker's home, `/var/lib/igor-worker`. `ProtectHome=read-only`
  would otherwise make a home under `/home` read-only for the worker too, since the worker runs
  inside the unit's mount namespace.
- `PrivateTmp=true` stays. Each Igor instance has its own `/tmp`, so the workers of different
  roles keep their trees in different directories. They share one worker user, though, and one
  user's processes can follow each other's `/proc/<pid>/cwd` and read each other's
  `/proc/<pid>/environ`; whether that reach holds across the units is task 6.6, and the proposal
  lists it as open.
- `Environment=IGOR_WORKER_USER=igor-worker`.
- `PATH` puts `/usr/local/bin` first, where `claude` now lives, because the worker cannot enter
  the service user's home and so cannot run `~igor/.local/bin/claude`.

## Risks / Trade-offs

- **The seat token is visible to what the worker runs.** It has to be in `claude`'s
  environment, and Claude Code passes its environment to the commands it runs. A worker can
  spend or leak its own seat. That was true before, and the template's comment on `npm test`
  already says so. Task 6.4 records what Claude Code actually passes.
- **Roles share the worker user.** One role's worker can leave something in `~/.npmrc` or a
  cache that another role's worker then runs, and that worker's output is published under the
  other role's App. Through `/proc` it may also read the other worker's seat token, and the
  worker-environment requirement gives a worker no seat's token but its own. A per-role worker
  user would be one more user, one more sudoers line, and a different `IGOR_WORKER_USER` for each
  role, set in that role's unit or in its `/etc/igor/<role>.env`. The proposal asks Adam to
  reconsider the shared user on this ground.
- **The worker can still reach the network.** It can send out its seat token and anything in
  its tree, which is the repository it was given.
- **A process that escapes the group by `setsid()`** survives the kill, as it does today. It
  runs as the worker, so it can reach nothing the worker couldn't, and the link checks hold
  against it.
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
  other's `/proc/<pid>/environ` or enter each other's tree through `/proc/<pid>/cwd`.
