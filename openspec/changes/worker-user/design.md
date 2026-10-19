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
  /usr/bin/env PATH=<path> <absolute path of claude> -p --system-prompt-file <file> … (the worker's other flags) < prompt
```

- **`--preserve-env=<names>`** carries exactly the variables `workerEnv` builds, minus `PATH`
  and `HOME`, and the seat token is one of them. A token in the argument list would be readable
  by every user on the host through `/proc/<pid>/cmdline` and `ps`. sudo logs every variable it
  preserves, value included (measurement 6.5), so the sudoers file turns that log off for the
  service user (below).
- **The prompt goes on stdin, and the system prompt in a file** (Adam, 2026-10-18), for the
  same reason: a prompt holds the item's text and the lore its scope allows. Today both are
  arguments. The file is one the Igor writes where the worker user can read it and cannot write
  it, and removes once the process exits. Every other `claude -p` the Igor starts, triage and
  the usage read included, does the same (*Prompts go on stdin*, below).
- **`PATH` goes through `env`**, because Debian and Ubuntu set `secure_path` in sudoers, and
  that replaces a preserved `PATH`. `PATH` is not a secret.
- **`HOME` is the worker's own**, which sudo sets for the target user, and it lasts across
  runs. Toolchain caches, `~/.claude` and `~/.gitconfig` are the worker's, not the Igor's.
  Before each `claude -p`, `~/.claude` and `~/.claude.json` are reset from a template built into
  Igor, so nothing a worker planted there loads in a later call, and the rest of the home stays.
  The reset keeps nothing it replaces, a stored login in `~/.claude/.credentials.json`
  included (Adam, 2026-10-18): every seat has a token, and Igor never uses a stored login, so
  the seat's token in the environment is the worker's only credential. The Igor does the reset as the worker user, through this same `sudo`.
  #174 (`pinned-skills`, an open change) specifies the reset and its template in its decision 9,
  and the kill of every process the worker user owns before every reset in its decision 13
  (Adam, 2026-10-17). Whichever of this change and #174 is built second makes this `sudo`
  spawn run #174's reset and kill (task 0.10).
- **No prose or bug-hunter script runs through this `sudo`** (Adam, 2026-10-18; proposal,
  decision 15). The Igor runs every prose and bug-hunter script itself, as the service user, and
  the model steps get what they need from the prose skill in their prompts (*#153's steps run
  no signing script*, below).
- **`claude` is resolved by the Igor** on its own `PATH` and passed as an absolute path, so the
  worker runs the same binary the Igor's triage does.
- **The spawn is otherwise unchanged:** detached, so `sudo` leads a new process group, with
  stdio as pipes. With no terminal, sudo allocates no pty, keeps `claude` in sudo's process
  group, and passes the stream and the exit status through unchanged (measurement 6.2). The
  commands the worker runs do not stay in that group (*Kill, release and sweep*, below).

The sudoers rule, installed as `/etc/sudoers.d/igor`, has one line per Igor instance (Adam
accepted the line on 2026-10-11, and one worker user per instance on 2026-10-17). For rank 1 of
the `maintenance` role:

```
Defaults:igor !log_allowed
igor ALL=(igor-worker-maintenance-1) NOPASSWD: ALL
```

`Defaults:igor !log_allowed` stops sudo logging the commands it allows the service user. Without
it, each worker start wrote the seat token into the journal, because sudo logs every preserved
variable with its value (measurement 6.5); root, the `adm` and `systemd-journal` groups and the
service user itself can read the journal. sudo's documentation says it still logs a command it
refuses; task 6.12 measures that.
`Defaults:igor !syslog` also stopped the line, but turns off every sudo log line for the service
user, refusals included.

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

Linux limits a user name to 32 characters, and `igor-worker-` takes 12 of them. #179's
requirement *A process is named by its role and rank* refuses, when the configuration loads, a
role name outside `[a-z][a-z0-9-]*`, and a role whose `igor-worker-<role>-<rank>` would pass 32
characters for any rank the roster declares for it (Adam, 2026-10-18). The refusal names the role. A role that loads therefore always has worker
users that `useradd` can create.

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

The `/proc` reach holds between two Igor units, each with its own mount namespace and `/tmp`
(measurement 6.6). With one worker user under two units, one worker read the other's seat token
from `/proc/<pid>/environ`, and listed and wrote its tree through `/proc/<pid>/cwd`. With a user
per instance, under `ProtectProc=invisible` the reader could not see the other worker at all,
and without it every one of those reads and writes was refused.

### The unit names the worker user from its instance (Adam, 2026-10-17)

An instance is named `<role>-<rank>`, with the rank always written, so `%i` is already the dash
form and `igor-worker-%i` is the worker user's name. The unit passes `%i` to `igor serve` as its
argument, and the Igor sudoes to `igor-worker-` followed by that argument. That is plain
concatenation: forming the worker user's name never splits the instance name into a role and a
rank. #179 finds the role and rank in the instance name for its own purposes: the rank is the
last dash-separated part, and is always written (#179's *A process is named by its role and
rank*). A sibling rank, another instance of the same role, can sweep the trees of a retired
rank, one the roster no longer declares, once that retired rank is gone, its heartbeat stopped (*Trees live in `/var/lib/igor/trees`*, below). It builds that
rank's worker user the same way, as `igor-worker-<role>-<rank>` from its role and the gone
rank's number, as #179's roster and sweep identify it.

The unit's `User=` and `Group=` stay the service user: they set the account the Igor process
itself runs as, and a worker that ran as that account could read the Igor's credentials. The
unit uses `igor-worker-%i` directly for `SupplementaryGroups=` and `ReadWritePaths=`. No drop-in
is generated per instance and no step edits `/etc/group`.

The dash form is kept, rather than naming the user `igor-worker-<role>.<rank>`, because a dot in
a user name reads as `user.group` to tools such as `chown`.

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
| tree files from the clone | igor:igor-worker-<role>-<rank>, until the worker edits one | `0660`, directories `2770` | cloned under umask `007`, so the worker can edit and remove them. Claude Code's Edit tool replaces a file rather than writing it in place, so an edited file becomes the worker's, and Edit gives the new file the old one's mode (measurement 6.3); the Igor still reads it through the group |
| git directory, `<tree>-git`, beside the tree | igor:igor-worker-<role>-<rank> | group read, no group write | the worker reads history; it cannot write hooks or config |
| outbox, `<tree>-outbox` | igor:igor-worker-<role>-<rank> | `2770` | the worker writes declarations and its git index here |
| files the worker creates | igor-worker-<role>-<rank>:igor-worker-<role>-<rank> | `0644`, directories `2755`: the umask under the `sudo` spawn is `0022` (measurement 6.10) | the Igor reads them through the group, and sets no umask. The group cannot write a directory the worker made, so the Igor cannot remove its entries; the release's first pass, as the worker, does |
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
worker's own `git rm` and `git mv` show on disk anyway, as a removed path and a new one, so a
status read against the git directory's own index, which the worker cannot write, sees both.

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
  not the worker's to write. The service user's and the system's configuration can still
  define one, such as `filter.lfs`, which a name in `.gitattributes` would then run. How to keep
  those two configurations out of the Igor's git calls is open in the proposal; task 3.6 builds
  the recommended way unless Adam chooses another.
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

The link checks below and the Igor's read of the tree wait until the worker and the last model
step have exited, and the Igor has killed every process the worker user owns (*Kill, release and
sweep*). The Igor then records the tree it read: it stages the changed paths in its own index
and writes the index's tree object (`git write-tree`) into its own git directory, which the
worker user cannot write. The Igor makes #153's trailers against that tree (below), and
publishes from that tree object. #189 (`loop-verifies-commands`) then runs the worked
repository's checks, such as its tests, which the `repos` map in `roles/org.yaml` declares for
that repository. They run as the worker user, after that record. Because the Igor publishes the
recorded tree, nothing a check writes, such as a coverage report or a link, reaches the
artifact: that is how this change meets #189's rule that what a check writes is not published.
The rule, and the second worker run when a check fails, are #189's. #189's second worker run is a
new run of the model steps, and its tree is recorded, checked and published the same way.

### #153's steps run no signing script; the Igor signs once, at the end (Adam, 2026-10-17 and 2026-10-18)

#153 binds each commit's trailers to a staged tree. `git add` writes objects into the git
directory, which is read-only to the worker user, and the index the worker can write is its copy
in the outbox. So the steps neither stage nor sign, and the Igor runs every signing call as the
service user. The order is:

1. Bug-hunter runs, edits the tree, and ends by reporting its `Bug-hunter:` value. As the worker,
   its `caller-result.sh` mints HEAD's tree when nothing is staged, and fails when the worker's
   index copy holds a change (#153's measurement 0.14), so the step does not run it.
2. The Igor runs prose's first call, which prints the rules and a pass token, and gives both to
   the prose pass in its prompt (Adam, 2026-10-18). The prose pass edits the tree and writes the
   message by those rules. prose keeps its tokens under the git directory, which the worker
   cannot write, so the worker cannot forge one. Run as the worker, the first call could not
   write a token there at all (#153's measurement 0.9).
3. Bug-hunter's own triage, on the model #153 pins, runs on the prose pass's diff. A diff it
   skips gets no further iteration; any other diff gets one more bug-hunter iteration. That
   triage skips tests, specs, lockfiles, generated files, formatting and renames as well as
   comments and docs, and two models disagreed on whether to skip a spec-only diff (#153's measurement 0.11);
   #153 decides whether that is the line it wants and pins the model. No prose pass follows
   the extra iteration (Adam, 2026-10-18, on #153): the prose pass is not meant to change code,
   so the iteration runs only in an edge case. The comments that iteration writes still get a
   reader: #153's cold read of the commit reads them, and the prose pass, answering that cold
   read, fixes what the cold read names.
4. After the last model step exits, the Igor kills every process the worker user owns and runs
   the link checks below. Only then does the Igor's code stage the changed paths, once, in its
   own index. Staging first would put a hard-linked key's content into a blob in the git
   directory, which the worker can read.
5. The Igor runs prose's second call, with the token from step 2, and bug-hunter's minting
   script, against the staged tree. Both run with `GIT_DIR`, `GIT_WORK_TREE` and
   `GIT_INDEX_FILE` naming the Igor's git directory, the tree and the Igor's own index. The
   scripts' git calls follow all three (#153's measurement 0.12). Run from inside the tree
   without them, they used the worker's planted `.git` directory and ran its hook and its
   `fsmonitor` command as the service user.

Each trailer that binds a tree, `Prose:` and #153's `Bug-hunter-Tree:`, then names the tree the
Igor records, runs the link checks on, and publishes. The signing scripts are the ones in
`skills_dir`, which is root-owned, so running them as the service user runs nothing the worker
wrote. The start check's write probe of `skills_dir` tries only its top level, not its
subdirectories, so their safety rests on the owner and modes #174 installs them with.

The trailers bind the index's tree unless #153 binds them to the tree the Git Data API builds
from the same files (#153's design item 3); #153's task 0.4 found the two differ only for a
link or a submodule. A changed link or submodule stops the run until #137 lands, so for
everything this change publishes the two trees are equal. Either way the Igor publishes the
tree the trailers name. The worker cannot change the recorded tree object, and a copy
the worker could change, the index copy included, is never what a trailer is bound to.

Staging before each step instead would run `git add` over the worker's files before the link
and hard-link checks, and the prose pass's edits, made after bug-hunter's staging, would be
missing from the tree bug-hunter's trailer named.

### The Igor reads changes without following links

`changes()` reads each changed file with `readFile`, which follows symbolic links. A link the
worker made to `/etc/igor/<role>.pem` would be read as the Igor and published as the file's
content. With one user this was moot, because the worker could read the key itself. With two
users it is the one remaining path to the key.

So, once the last process the Igor started as the worker user for the run has exited and the
Igor has killed every process that user owns, and before anything is read:

- A changed path is checked with `lstat` on each component from the tree down. Where a
  directory above it is a link, the run stops naming the path. Where the path itself is a link,
  it is published as a link or stops the run, as below.
- A file is opened with `O_NOFOLLOW`, and its real path must still sit inside the tree's real
  path. This closes the race with a worker process still running, as one can under `igor run`,
  where no kill by user is made.
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

- **Kill:** `sudo -n -u <worker> -- pkill -KILL -u <worker>`, which kills every process the
  worker user owns (proposal, decision 27). The Igor cannot signal the worker's processes
  itself. A kill of `sudo`'s process group is not enough: Claude Code 2.1.303 starts each Bash
  command in a new session, and in measurement 6.2 a kill of the group ended `claude` and left
  the `npm test` it was running alive, reparented to PID 1 and still holding the tree. The kill
  by user left nothing. The Igor makes it on every kill, before every reset of the worker's home
  (#174's decision 13), once the last model step exits, after #189's checks, and before a
  release. Each instance has its own worker user and runs one worker at a time, so the kill
  reaches no other instance. At process exit the call is synchronous (`spawnSync`), because an
  `exit` handler cannot wait.
- **Release:** `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>` first. That removes everything
  the worker owns and the Igor's files in directories the worker can write. Then the Igor's own
  `rm` removes the rest, and the git directory, which only the Igor can write. The second pass
  runs even when the first fails, as the release on `main` does.
- **Sweep:** the same passes over each sweepable name. The name rule gains the `-git` suffix
  beside `-outbox`.

**Trees live in `/var/lib/igor/trees` (Adam, 2026-10-17).** Under `serve`, every tree, outbox and
`<tree>-git` is created in the shared state directory, not in the instance's private `/tmp`.
#179 (`concurrent-instances`) has a sibling rank sweep the trees of a rank the roster no longer
declares, once that rank is gone, and one unit cannot see another's private `/tmp`. A rank that
restarts sweeps its own trees as it starts. The modes and groups in the table above hold there
unchanged.

**A sibling sweeps as the gone rank's worker user (Adam, 2026-10-18).** The sibling runs the
release's first pass as `sudo -n -u igor-worker-<role>-<k> -- rm -rf -- <tree> <outbox>`, where
`<k>` is the gone rank, because that user owns what the gone rank's worker wrote. Every instance
runs as the one service user, and the deployment guide (task 8.4) keeps a retired rank's
sudoers line, so the line written for the gone rank still lets the service user act as that
worker user; no sudoers line is added for sweeping. The sibling reads the gone rank's number
from the tree's name, which carries the role and rank (#179), and builds the worker user's name
from its role and that number, the same concatenation the Igor uses for its own.

### What each start checks

Before the first cycle, `serve` checks in this order, stopping at the first failure:

1. The user exists, its uid is not 0, and it is not the Igor's own user.
2. `sudo -n -u <worker> -- true` succeeds.
3. The Igor's groups include the worker's primary group.
4. As the worker, `test -x` on the absolute path of the `claude` the Igor resolves succeeds.
   Without it, every item would fail at spawn instead of the Igor refusing to start.
5. As the worker, one `sudo` call runs `test -r`, `test -w` or `test -x` on each path below and reports
   which ones succeed. Every path that succeeds is a refusal, and the refusal names it.
   - not readable: `/proc/<igor pid>/environ` (Linux); the file
     `GITHUB_APP_PRIVATE_KEY_FILE` names; the path `seatKey` names; each seat's `token_file`;
     `/etc/igor/<role>.env`, once #179 has the Igor read it itself;
     the Igor user's home, which must also fail `test -x`, so the worker cannot enter it; and a canary the check
     writes, mode `0600`, in a fresh `0700` directory of the Igor's
   - not writable: the lore checkout, and the worktree of it this process reads its
     configuration from (#208, `lore-pull`); the directory holding the running `igor`; the `node`
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

`/etc/igor/env` is not probed: systemd reads it, so the Igor never learns its path. Under #179
the Igor reads `/etc/igor/<role>.env` itself and sets its keys in its own environment after
starting; check 5 probes that file as not readable once #179 has landed (task 0.8). Whether
those keys show in `/proc/<pid>/environ` is not measured; the worker cannot read the Igor's
`/proc` at all under `ProtectProc=invisible`. The `/proc` probe
covers what `/etc/igor/env` holds, and the deployment guide puts both files in a directory the
worker cannot enter. On macOS, which has no `/proc`, nothing probes `/etc/igor/env`.

Under the unit's `ProtectProc=invisible` (*The unit*, below) the worker user cannot see the
Igor's `/proc/<pid>` at all, so the `environ` probe in check 5 finds nothing to read and passes.
It passes because the worker cannot read the Igor's environment, which is the property it
checks. On a kernel where the setting has no effect, `environ` is readable by its owner alone,
so the probe passes for the same reason, and fails if the worker can read it some other way.

### Every seat has a token, and no call uses a stored login (Adam, 2026-10-18)

Every `claude -p` the Igor starts authenticates with the token of the seat it spends, from its
environment, under `serve` and `run` alike. The worker and the model steps after it run as the
worker user with the seat's token; triage runs as the Igor with the token of the seat the budget
gate chose (#171's *Triage's model call is made only where a seat can pay for it*); a usage read
and a seat probe use the token of the seat they read. #171 refuses a seat file that names no
token. A seat with no token would run on whatever login the calling user holds, the service
user's for a usage read and the worker user's for the worker, so it could be read under one
login and spent under another; with no such seat, that cannot happen. Neither the service user
nor any worker user is logged in to Claude, and #174's reset deletes a login stored in the
worker's home, so there is no stored login for the worker user to come by. How a person creates
a token is in #171's guides (its task 9.5).

Under `igor run`, the seat is the token in `IGOR_RUN_TOKEN` (Adam, 2026-10-18), an
implicit local seat (#171's *`igor run` spends its own token as an implicit local seat*):
nothing in the lore repository describes it, and `run` spends
no lent seat. Triage and the worker under `run` both authenticate with it, and the worker's
environment holds it as it would hold any seat's token.

This does not wait for #171. `token_env`, `token_file` and `token_command` seats are on `main`
(the in-force `seat-budget` requirement *A seat names its token through exactly one mechanism*,
read by `parseOrgBudget` in `src/budget.ts`), so every seat can name a token now. What #171
removes is the in-force allowance for a seat with no token and for an organization with no
seats, which run on the ambient login. Until #171 archives, that allowance and the proposal's
decision 21, that every seat has a token, disagree; the proposal lists it for Adam, and what is
built follows decision 21.

### Prompts go on stdin (Adam, 2026-10-18)

On Linux every user can read every process's `/proc/<pid>/cmdline`. Today `claudeWorker`
(`src/execute.ts`) and `runClaude` (`src/triage.ts`) pass the prompt and `--system-prompt` as
arguments, so a worker of one instance could read another worker's item and lore, or triage's,
through `/proc` or `ps`. Two things close that:

- **stdin and a file.** Every `claude -p` takes its prompt on stdin. The system prompt cannot
  share stdin, so it goes in a file named by `--system-prompt-file`, which the Igor writes before
  the spawn and removes after the process exits. For a process running as the worker user, the
  file sits in a directory the Igor owns, beside the tree, mode `2750` with the worker's group,
  so the worker can read it and not write it; never in the tree or the outbox, which the worker
  writes. When the Igor starts again after a crash, its startup sweep removes a file the crash left, here
  or in the Igor's own directory. For a process running as the Igor, such as triage, the file sits in a directory only
  the Igor can read.
  Measurement 6.9 confirmed, on Claude Code 2.1.303, that `-p` with stream-json output reads
  its prompt from stdin and takes its system prompt from `--system-prompt-file`, and that the
  usage read and triage's `json` call take their prompts from stdin too.
- **`ProtectProc=invisible`** in the unit. systemd mounts the unit's `/proc` with
  `hidepid=invisible`, so a process sees only its own user's processes. That needs per-mount
  `hidepid`, in Linux 5.8 and later; on an older kernel the setting has no effect, and the
  prompts are still out of the arguments. Measurement 6.8 confirmed it on Linux 6.12 under the
  unit as task 8.2 changes it, with `ProtectProc=invisible` set; task 6.11 repeats it on a Linux server's kernel.

Moving the prompt to stdin and the system prompt to a file also keeps both out of `sudo`'s log,
which records each command line: measurement 6.5 found no prompt text there, only the paths of `claude` and of
the system prompt file, and the worker's flags, which name the role's allowed commands.

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
- **`run` sweeps only its own trees** (Adam, 2026-10-18). Under #179 `run` is rank 0,
  so its trees are `<role>-0-<id>`. Its release and startup sweep remove those alone, as the
  Igor's own user with no `sudo`, which is the user its worker ran as. A tree a `serve` instance
  left belongs to that instance's worker user, which `run` cannot act as, and `run` leaves it.

So the command says whether there is a worker user, and no setting does. The alternatives:
`serve --same-user`, which leaves an unattended Igor whose worker can read its credentials;
refusing both without a worker user, which adds a step to every development run; and warning in
both, under which a server whose worker user was never created would run its worker as the
service user, the exposure #163 found.

**macOS runs `serve` only in #192's container image** (`deploy-image`), and runs `run` on the
host. macOS has no `/proc` to probe and no `fs.protected_hardlinks`, so start check 6 would
refuse a worker user there anyway. The deployment guide gives the Linux steps. #192 merges as it
is, and this change's implementation, built after this specification is approved, adds to its image `sudo`, a worker user for each instance the
compose file runs, and their sudoers lines, and moves the compose file's trees volume to
`/var/lib/igor/trees` (proposal, decision 20; task 8.3).

### The unit

- `NoNewPrivileges=true` goes: it stops `sudo` from changing user at all. The worker keeps what
  any unprivileged account has and gains nothing else, since it has no sudoers entry.
- The unit names the worker user as `igor-worker-%i` (above). `SupplementaryGroups=igor-worker-%i`
  puts the Igor in the worker's group, and `ReadWritePaths=/var/lib/igor-worker-%i` keeps the
  worker's home writable inside the unit's mount namespace, where `ProtectSystem=strict` makes
  `/var` read-only. `User=` and `Group=` stay the service user, and the unit's `ExecStart=`
  passes `%i` to `igor serve`.
- `PrivateTmp=true` stays for everything but the trees. A process started through `sudo` keeps
  the unit's mount namespace, so the workers share the Igor's private `/tmp`: every temporary
  file the Igor writes under `/tmp` goes in a `0700` directory of its own, never directly in
  `/tmp`. Trees live in the shared
  `/var/lib/igor/trees` (above), under the unit's `StateDirectory=` (#179), so
  `ReadWritePaths=` must keep that directory writable too.
- `PATH` puts `/usr/local/bin` first, where `claude` now lives, because the worker cannot enter
  the service user's home and so cannot run `~igor/.local/bin/claude`.
- `ProtectProc=invisible` hides every other user's processes from each process in the unit
  (*Prompts go on stdin*, above).
- `Restart=on-failure` and `RestartPreventExitStatus=78` (Adam, 2026-10-18), as
  #82 requires. A refused start exits 78 (#82's *A process that refuses to start exits with
  status 78*), and systemd leaves the instance failed, with Igor's reason in the journal,
  instead of restarting it 30 seconds later (the unit's `RestartSec=30`) to be refused again. A rank #179 removed from the
  roster exits 0, which `Restart=on-failure` does not restart, so the unit shows it inactive. A
  crash is still restarted.

## Risks / Trade-offs

- **The seat token is within reach of what the worker runs.** It has to be in `claude`'s
  environment. Claude Code removes `CLAUDE_CODE_OAUTH_TOKEN` from the environment of the
  commands it runs, but gives them `CLAUDE_PID`, and `claude` runs as the same worker user, so a
  test can read the token from `/proc/$CLAUDE_PID/environ` (measurements 6.1 and 6.4).
  `ProtectProc=invisible` hides only other users' processes, so it does not stop that read. A
  worker can spend or leak its own seat. That was true before, and the comment on `npm test` in
  `templates/org.yaml` already says so.
- **The worker can still reach the network.** It can send out its seat token and anything in
  its tree, which is the repository it was given.
- **Under `igor run`, a command the worker started can outlive the run.** Claude Code starts
  each Bash command in a new session, so a kill of the worker's process group misses it, and
  `run` cannot kill by user, which would kill the Igor and the person's own processes (#174's
  decision 13). It runs as the developer, who could run it anyway. Under `serve` the kill by user
  ends it (proposal, decision 27).
- **sudo logs each command it allows the service user, with every preserved variable,** unless
  the sudoers file says otherwise. With `Defaults:igor !log_allowed` it logs none of them, so the
  journal no longer records which commands the Igor ran as a worker user; the pam session lines
  remain, holding no command and no environment (measurement 6.5).

## Measurements (2026-10-18)

Run on a Docker Desktop container on a Mac, with systemd 252 as PID 1 and Linux
6.12.76-linuxkit, the kernel of Docker Desktop's virtual machine, not a server's. sudo 1.9.13p3,
Node 22, git 2.39, Claude Code 2.1.303 on haiku, `fs.protected_hardlinks=1`. The service user
was `igor`, with its home `0700`. The worker users and `/etc/sudoers.d/igor` were made by task
8.4's commands, run as written, with `deploy/sudoers.example` written from task 8.1's text before it gained the `Defaults`
line:
`visudo -cf` printed `parsed OK`, and the commands made each user, its `0700` home and its line.
Canaries, each a random string owned by `igor` with mode `0600`, stood at `/etc/igor/env`,
`/etc/igor/maintenance-1.env`, `/etc/igor/maintenance-1.pem` and a stand-in for the `seatKey`
path, all in `/etc/igor` (`0700`), and at `/home/igor/canary.txt`. A real seat token, in its own `0600` file, let
the worker run a model.

The unit was `deploy/igor.service` with task 8.2's changes. Igor's spawn is not built, so a Node
script running as `igor` did what this design says, in order: the clone with its modes, the
outbox and index copy, the system prompt file, start checks 2 and 7, the `sudo` spawn with the
prompt on stdin, the stream parse, the kill, and the read against the Igor's index. The attacker's
file was a test, run by `npm test`, committed in the repository. One shortcut: the test found the
Igor's pid in a pid file instead of with `ps`.

- **6.1, #163's attack as the worker user: confirms.** Claude Code refused its Read tool, `head`
  and `tail` outside the tree. The test's reads of the five canaries got `EACCES`. Its read of the
  Igor's `/proc/<pid>/environ` got `ENOENT` under `ProtectProc=invisible`, and `EACCES` with
  `ProtectProc=default`. Its writes into the lore checkout and into `<tree>-git/hooks/` got
  `EACCES`. No canary string was in the streams, the transcripts, the trees, the outboxes or the
  journal. Found along the way: the test read the seat token from `/proc/$CLAUDE_PID/environ`
  (*Risks*, above).
- **6.2, `sudo` under the unit: confirms, except the kill.** sudo ran under `ProtectSystem=strict`
  and `PrivateTmp=true` without `NoNewPrivileges`, and refused with it. Every stream line
  parsed. The init event read `apiKeySource: "none"`, and a `rate_limit_event` arrived, which is
  the sign the call ran on the seat's token. `claude` sat in the process group of the `sudo` the
  Igor spawned. Exit statuses 0 and 3, and a `SIGKILL`, reached the Igor. **Contradicts the
  design:** a kill of that group as the worker ended `claude` and `sudo` and left `npm test`
  running, because Claude Code starts each Bash command in a new session. `sudo -u <worker>
  pkill -KILL -u <worker>` left nothing. Decision 27 and *Kill, release and sweep* follow it.
  Today's `killTree` on `main` would leave the same processes.
- **6.3, git with a read-only git directory and an index copy: confirms.** `git rm`, `git mv`,
  `git log` and `git show` succeeded as the worker. The Igor's read against its own index saw the
  modified file, the path `git rm` removed and the path `git mv` moved from as removed, and the
  path it moved to as new. The Edit
  and Write tools changed a file the Igor owned; Edit replaced it, so it kept its mode and became
  the worker's (the table above).
- **6.4, the environment of a command `claude` runs.** `CLAUDE_CODE_OAUTH_TOKEN` was absent, which
  contradicts what this design said before the measurement, that Claude Code passes its
  environment on; the
  token stays within reach through `CLAUDE_PID` (*Risks*). `GIT_INDEX_FILE` was passed, which
  `git rm` and `git mv` need. `SUDO_COMMAND` held sudo's command line, which carries the system
  prompt file's path and no prompt. Claude Code also passed `CLAUDE_CODE_MESSAGING_TOKEN` and
  `CLAUDE_CODE_MESSAGING_SOCKET`; what that token authorizes is task 6.13.
- **6.5, what sudo logs per worker start. Contradicts the design.** Per spawn, sudo wrote one
  journal line holding the working directory, the target user, every preserved variable with its
  value, the seat token in full among them, and the command line. The command line held no prompt
  text. The journal was persistent; root, the `adm` and `systemd-journal` groups and the service
  user could read the line, and the worker user could not. Both `Defaults:igor !log_allowed` and
  `Defaults:igor !syslog` removed it, leaving only pam's session lines; `visudo -c` accepted
  both. Decision 28 takes `!log_allowed`. The token was real, since a model had to run, so
  one journal read made while measuring printed it unredacted into the measuring agent's
  transcript, so that token counts as leaked and is its owner's to revoke; 6.12 counts the lines it looks for and never prints them.
- **6.6, two units with one worker user: confirms decision 7** (*Each instance has its own worker
  user*, above). Plain processes stood in for `claude`, which tests the same operating-system
  property.
- **6.7, the unit's groups, home and sudo: confirms.** `id` in the unit showed the worker's group
  among the Igor's through `SupplementaryGroups=igor-worker-%i`, with no `/etc/group` edit. The
  worker wrote its home, and a unit without that home in `ReadWritePaths=` made the write fail.
- **6.8, `ProtectProc=invisible`: confirms, on Linux 6.12.** A worker user listing `/proc` saw
  only its own user's processes. With `ProtectProc=default` it saw root's, `igor`'s and the other
  worker users'. A server's kernel is task 6.11.
- **6.9, prompts on stdin: confirms** (*Prompts go on stdin*, above). Separately, with a token in
  the environment, `/usage` printed only the session's local cost summary and no `% used` lines,
  in both the argument and the stdin form. That bears on #143, not on this change.
- **6.10, the modes of what the worker creates: the umask was `0022`.** The Write tool, `npm
  install`, `git rm`'s rewrite of the index copy, `mkdir` and `touch` made files `0644` and
  directories `2755`, owned by the worker user; `git mv` kept the moved file's inode, mode and
  owner. The Igor read every one through the group. The worker's directories are not group
  writable, which the release's first pass, as the worker, handles. No umask needs setting.

Not measured: a published artifact, since nothing publishes without Igor's code (task 6.14); a server's
kernel for 6.8 (task 6.11); task 8.4's commands with decision 28's `Defaults` line (task 6.12);
and the start check in #192's container (task 8.3).
