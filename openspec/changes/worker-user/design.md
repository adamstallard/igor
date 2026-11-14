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

The worker runs as a separate Unix user on the machine `igor serve` runs on (proposal, decisions
1 and 55). This document says how.

## Decisions

### Worker guarantees are properties; the Linux worker user is how a local host meets them

The requirements state what any worker must meet, whatever runs it:

- no worker can read the Igor's credentials, or reach another role's worker or that worker's
  files;
- a worker gets only what the Igor hands it, such as its seat's token;
- the Igor can end a run and every process the run started.

A worker runs on a *local host* when it runs on the machine `igor serve` runs on. This change
specifies workers only on a local host, so its local-host rules bind every worker it builds; a
worker run anywhere else needs a change that says how it meets the properties. A local host meets
them with the worker user `igor-worker-<role>`, started through `sudo` under its own sudoers line;
with the kill by user, which ends every process that user owns; and with the role's trees under
`/var/lib/igor/trees/<role>`. The requirements name these in sentences and scenarios scoped to a
local host, and the rest of this document describes that host.

Igor's direction is for workers to run as cloud Claude Code sessions, coordinated by
`igor serve`. Cloud workers are outside this change's scope, and nothing here depends on them.
Claude Code's documentation gives a cloud session no status or completion signal a caller can
read, and no API to stop or cancel it. Without the signal the Igor could not tell when its worker
had finished, and it reads and publishes the tree only after every model step has exited. Without
the stop API it could not end a run that ran away, which the last guarantee needs.

*Rejected:* stating each guarantee as a rule about the worker user, which binds every rule to a
Unix account on the Igor's host.

### The worker is started through `sudo`

The Igor spawns:

```
sudo --non-interactive --user=<worker> --preserve-env=<names> -- \
  /usr/bin/env PATH=<path> <absolute path of claude> -p --system-prompt-file <file> … (the worker's other flags) < prompt
```

- **`--preserve-env=<names>`** passes the variables `workerEnv` builds except `PATH` and `HOME`,
  the seat token among them. In the argument list a token would be readable by every user on
  the host through `/proc/<pid>/cmdline` and `ps`. sudo logs every preserved variable with its
  value (measurement 6.5), so the sudoers file turns that log off for the service user (below).
- **The prompt goes on stdin, and the system prompt in a file**, for the same reason: a prompt
  holds the item's text and lore. On `main`, both are arguments. Every other `claude -p` the Igor
  starts, triage included, does the same (*Prompts go on stdin* says where the file sits).
- **`PATH` goes through `env`**, because Debian and Ubuntu set `secure_path` in sudoers, which
  replaces a preserved `PATH`. `PATH` is not a secret.
- **`HOME` is the worker's own**, set by sudo, and lasts across runs: toolchain caches,
  `~/.claude` and `~/.gitconfig` are the worker's. Before each `claude -p`, as
  part of the same `sudo` spawn so it can write the worker's home, `~/.claude` and
  `~/.claude.json` are reset from a template built into Igor, so nothing a worker planted there
  loads in a later call; the rest of the home stays. The reset keeps nothing it replaces, a
  stored login in `~/.claude/.credentials.json` included: every seat has a token and Igor never
  uses a stored login, so the seat's token is the worker's only credential. Before every reset
  the Igor kills every process the worker user owns, so none can read or write the new home.
  #174 (`pinned-skills`, an open change) decides the reset and template (its decision 9) and the
  kill (its decision 13). Whichever of #174 and this change is built second wires the reset and
  the kill into this spawn (task 0.10).
- **No script of the prose or bug-hunter skill runs through this `sudo`** (proposal, decision
  15). These skills check a commit's prose and code and sign the commit with trailers. #153 adds
  model steps after the worker that use both; the Igor runs every one of
  their scripts itself, as the service user, and the steps get what they need of the prose skill
  in their prompts (*#153's steps run no signing script*).
- **`claude` is resolved by the Igor** on its own `PATH` and passed as an absolute path, so the
  worker runs the same binary as the Igor's triage.
- **The spawn is otherwise unchanged:** detached, so `sudo` leads a new process group, with
  stdio as pipes. With no terminal, sudo allocates no pty, keeps `claude` in its process group,
  and passes the stream and the exit status through unchanged (measurement 6.2). The commands
  the worker runs leave that group (*Kill, release and sweep*).

The sudoers rule, installed as `/etc/sudoers.d/igor`, has one line per role a host serves. For
the `maintenance` role:

```
Defaults:igor !log_allowed
igor ALL=(igor-worker-maintenance) NOPASSWD: ALL
```

`Defaults:igor !log_allowed` stops sudo logging the commands it allows the service user; without
it, every worker start writes the seat token into the journal (measurement 6.5). sudo's
documentation says it still logs a command it refuses; task 6.12 measures that, and whether such
a line lists the preserved variables, the seat token among them. `Defaults:igor !syslog` also
stops the line, but turns off every sudo log line for the service user, refusals included.

`ALL` means any command as `igor-worker-maintenance` and nobody else. The service user is
already more privileged than the worker, so letting it run anything as the worker grants it
nothing new, and the rule grants no path to root. Naming
`claude`, the kill and the removal, with argument patterns sudo matches loosely, would protect
nothing the runas restriction doesn't. `ALL` also grants `SETENV`, which `--preserve-env` needs.

Rejected alternatives:

- **A setuid helper:** security-critical code Igor would write and ship. The unit would have to
  drop `NoNewPrivileges=true` for it just as for sudo (*The unit*), so it has sudo's costs and
  none of its review history.
- **`systemd-run --uid=`:** the service user would need a polkit rule to start units, and the
  worker would not be the Igor's child, so the stream, the kill and the exit status would go
  through `systemctl`. Worse, any local user can read a transient unit's environment over D-Bus
  with `systemctl show`, exposing the seat token to the worker and every other account.
- **Claude Code's sandbox**, denying the worker reads of `/etc/igor/` and `/proc`: nobody has
  measured whether its read restrictions bind a `node` process an allowed command starts, and
  even if they do, the guarantee would belong to the installed Claude Code version; #144 shows
  releases change behaviour a deployment depends on.
- **Keeping the App's key off the host**, passing the Igor short-lived tokens minted elsewhere:
  it bounds a leak to one token's lifetime but stops nothing, since the worker still reads
  whatever token, seat token or age key the Igor holds at that moment.

### Each role has its own worker user

A role's `igor serve` runs as one unit, `igor@<role>`, of which systemd runs one per host. Its
worker user is `igor-worker-<role>`, with its own home, `/var/lib/igor-worker-<role>`, and its
own sudoers line; the deployment templates generate all three for each role a host serves. The
unit names the user as `igor-worker-%i` (below).

Linux limits a user name to 32 characters and `igor-worker-` takes 12, so a role whose name
passes 20 characters, or holds a character a user name cannot, has no worker user `useradd` can
create. Loading the configuration does not refuse such a role; its `igor serve` refuses to start,
naming the missing user (*Isolation is proved before any work is taken*), and the deployment
guide states the limit (task 8.4).

Processes of one Unix user can normally read each other's `/proc/<pid>/environ` and follow each
other's `/proc/<pid>/cwd`, so a worker user shared by several roles would let one worker reach
another's:

- **seat token**, through `/proc/<pid>/environ`. The worker-environment requirement gives each
  worker only its own seat's token, and this read would hand it another role's;
- **tree**, edited through `/proc/<pid>/cwd` and then published under the other role's name;
- **home**, where one worker can leave a file, such as `~/.npmrc`, that the other then runs.

A worker user per role closes all three, at the cost of one more user, home and sudoers line per
role. Within one role, a file a run leaves outside `~/.claude` and `~/.claude.json` reaches that
role's later runs on the host. #174's decision 9 accepts that: the home has to last for
`~/.gitconfig` and the caches a repository's tests need, and such a file can steer only the same
role's later work, never another role's.

The `/proc` reach holds between two Igor units, each with its own mount namespace and `/tmp`
(measurement 6.6). With one worker user under two units, one worker read the other's seat token
from `/proc/<pid>/environ`, and listed and wrote its tree through `/proc/<pid>/cwd`. With a user
per unit, under `ProtectProc=invisible` the reader could not see the other worker at all, and
without it every one of those reads and writes was refused.

With one `igor@<role>` per host, running one worker at a time, a worker user belongs to one
worker, and its kill by user reaches no other (*Risks* covers two processes of one role on one
host).

### The unit names the worker user from its role

The unit's instance name is the role, so `igor-worker-%i` is the worker user's name. The unit
passes `%i` to `igor serve` as its argument, and the Igor sudoes to `igor-worker-` followed by
that argument: plain concatenation, with nothing parsed out of the name. `User=` and `Group=`
stay the service user, the account the Igor itself runs as; a worker running as it could read
the Igor's credentials. The unit uses `igor-worker-%i` directly for `SupplementaryGroups=` and
`ReadWritePaths=`. No drop-in is generated and no step edits `/etc/group`.

**The worker user's name does not come from `igor.config.yaml`.** The lore repository is shared and edited by pull request, and a lore
pull request that set the worker user to the service user would turn isolation off for every
Igor that reads it. The start-up check would refuse that value, but a refused start is still an
outage triggered from a repository.

### The tree and outbox are shared through the worker's group

The Igor joins the worker user's primary group through the unit's
`SupplementaryGroups=igor-worker-%i`; the worker does not join the Igor's.

| path | owner:group | mode | why |
|---|---|---|---|
| tree directory | igor:igor-worker-<role> | `2770` | setgid, so files created in it get the group |
| tree files from the clone | igor:igor-worker-<role>, until the worker edits one | `0660`, directories `2770` | cloned under umask `007`, so the worker can edit and remove them. Claude Code's Edit tool replaces a file, so an edited file becomes the worker's, with the old mode (measurement 6.3), and the Igor reads it through the group |
| git directory, `<tree>-git`, beside the tree | igor:igor-worker-<role> | group read, no group write | the worker reads history; it cannot write hooks or config |
| outbox, `<tree>-outbox` | igor:igor-worker-<role> | `2770` | the worker writes declarations and its git index here |
| files the worker creates | igor-worker-<role>:igor-worker-<role> | `0644`, directories `2755`: the umask under the `sudo` spawn is `0022` (measurement 6.10) | the Igor reads them through the group, and sets no umask. The group cannot write a directory the worker made, so the Igor cannot remove its entries; the release's first pass, as the worker, does |
| worker's home | igor-worker-<role>:igor-worker-<role> | `0700` | its caches, `~/.gitconfig` and `~/.claude`, out of the Igor's way; lasts across runs |
| the Igor's home, lore checkout, `/etc/igor` | igor:igor | `0700`/`0750` | the worker is not in this group |

**The git directory sits beside the tree, not in it.** The worker can write the tree's top
directory, so it can rename or replace anything there, `.git` included. A sticky bit would stop
that, and would also stop `git rm` of a top-level file the Igor owns. So the clone uses
`--separate-git-dir=<tree>-git`, leaving in the tree a `.git` file that points to it. The
worker's git follows that file; the Igor's never does, since every git command the Igor runs in
a tree names both directories with `--git-dir` and `--work-tree`. A `.git` the worker replaces
misleads only the worker.

**`git rm` and `git mv` write an index copy.** Both write the index, whose lock file sits beside
it, so writing the real index needs the git directory writable. So the Igor copies the index into
the outbox before the worker starts and sets `GIT_INDEX_FILE` to that copy in the worker's
environment, which the worker-environment requirement is modified to allow.

**The Igor reads changes against its own index, never the copy.** A worker that sets
skip-worktree or assume-unchanged in an index, or removes an entry with
`update-index --force-remove`, hides a change from a `git status` read against it. The worker's
own `git rm` and `git mv` show on disk anyway, as a removed path and a new one, so a read against
the git directory's own index, which the worker cannot write, sees both.

**The worker's git trusts the tree.** git refuses a repository another user owns unless
`safe.directory`, honoured only in global, system or command-line configuration, allows it.
#156 forbids `GIT_CONFIG_*` in the worker's environment (the worker-environment requirement), so
the start-up check sets `safe.directory=*` once, as the worker, in its own `~/.gitconfig`, which
affects only the worker.

### The Igor runs nothing the worker wrote

- Every git command the Igor runs in a tree passes `-c core.hooksPath=/dev/null`,
  `-c core.fsmonitor=false` and `-c submodule.recurse=false`, and `--ignore-submodules=all` where
  the command takes it. The first two are redundant while the git directory is read-only to the
  worker, and stay because the cost of being wrong is running code as the Igor. The submodule
  flags are for nested repositories, below.
- Filter, merge and diff drivers are defined only in configuration. `.gitattributes`, which the
  worker can write, can name a driver but not define one, and the tree's configuration is not
  the worker's to write. The service user's and the system's configuration can still define one,
  such as `filter.lfs`, which a name in `.gitattributes` would then run. So the Igor's git calls
  for a tree, its clone and checkout included, and the signing scripts run with
  `GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=/dev/null` (proposal, decision 33; task 3.6).
  Two costs follow. A Git LFS repository is not supported until a change defines filters the
  Igor trusts: an LFS file is checked out, read and published as its pointer. And #137 publishes
  a file stored through a clean filter as the filter's output, which with no filter defined is
  the pointer; whether #137 expects that or means the real content is open.

  The checkout leaves out the global configuration for a reason of its own: a checkout with it,
  as `main` makes one, runs LFS's smudge filter and writes each file's real content, and a later
  read without it, running no clean filter, would see every LFS file as changed. A checkout
  without it leaves pointers, which every later read agrees with.
- **A nested repository** is the exception: its own `.git/config` is the worker's, and git in
  the outer tree can recurse into it and run a filter that file defines. Hence the submodule
  flags, and a changed path that holds its own `.git` with working content stops the run,
  naming it.
- **A changed submodule pointer is published as a pointer.** #137 publishes a gitlink, mode
  `160000`, as the commit it names. The Igor never enters the submodule's directory or runs git
  in it. #137 is built first (*The Igor reads changes without following links*).
- The Igor does not run `npm`, `node` or any command in the tree. Only the worker user does.

### Every model step in the tree runs as the worker, and checks run on a recorded tree

#153 (`signed-publishing`) adds `claude -p` steps after the worker, a bug hunt and a prose pass,
which edit the tree and write the commit message and the pull request text. Bug-hunter runs
`npm test`, repository code that as the Igor could read the Igor's credentials, so every
`claude -p` the Igor starts in the tree goes through the worker's `sudo` spawn.

The link checks below and the Igor's read of the tree wait until the worker and the last model
step have exited and the Igor has killed every process the worker user owns (*Kill, release and
sweep*). The Igor then records the tree it read: it stages the changed paths in its own index and
writes the index's tree object (`git write-tree`) into its own git directory, which the worker
user cannot write. It makes #153's trailers, the commit-message lines `Prose:` and `Bug-hunter-Tree:`
that bind a tree, against that tree (below) and publishes from it.

#189 (`loop-verifies-commands`) then runs the worked repository's checks, such as its tests,
declared for it in the `repos` map in `roles/org.yaml`, as the worker user. Because the Igor
publishes the recorded tree, nothing a check writes, such as a coverage report or a link, reaches
the artifact: that is how this change meets #189's rule that what a check writes is not
published. That rule, and the second worker run when a check fails, are #189's;
that run is a new run of the model steps, recorded, checked and published the same way.

### #153's steps run no signing script; the Igor signs at the end

#153 binds each commit's trailers to a staged tree. `git add` writes objects into the git
directory, which is read-only to the worker user, and the only index the worker can write is its
copy in the outbox. So the steps neither stage nor sign, and the Igor runs every signing call as
the service user, in this order:

1. Bug-hunter runs, edits the tree, and ends by reporting its `Bug-hunter:` value. The step does
   not run `caller-result.sh`: as the worker, with nothing staged, that script mints its tree
   from HEAD, which leaves out the worker's edits, and fails when the worker's index copy holds a
   change (#153's measurement 0.14).
2. The Igor runs prose's first call, which prints the rules and a pass token, and gives both to
   the prose pass in its prompt. The prose pass edits the tree and writes the message by those
   rules. prose keeps its tokens under the git directory, so the worker cannot forge one; run as
   the worker, the first call could not write a token there at all (#153's measurement 0.9).
3. Bug-hunter's own triage, on the model #153 pins, runs on the prose pass's diff. A diff it
   judges to need no bug hunt gets no further iteration; any other gets one more bug-hunter
   iteration. That triage skips tests, specs, lockfiles, generated files, formatting and
   renames as well as comments and docs, and two models disagreed on whether to skip a
   spec-only diff (#153's measurement 0.11); #153 decides whether that is the line it wants and
   pins the model.
4. The cold read: a fresh model step, #153's, reads the commit's prose cold, after any extra
   iteration, so it also reads the comments that iteration writes. The prose pass then answers
   the cold read with edits, before prose signs. So no separate prose pass is needed after the
   extra iteration.
5. The Igor's code may stage more than once (proposal, decision 32); no model step stages. Under #153's
   design the Igor stages before prose's first call, which lists what the prose pass must
   rewrite from the staged changes; again after the prose pass, so the cold read reads its
   edits; and again after the answers to the cold read. Before each staging, every model step
   started so far has exited, and the kill and link checks above have run. Without the checks, `git add` would put a hard-linked
   key's content into a blob in the git directory, which the worker can read; without the kill, a
   command still running could change a file after the checks.
6. The Igor runs prose's second call, with the token from step 2, and bug-hunter's minting
   script, against the last staged tree. Both run with `GIT_DIR`, `GIT_WORK_TREE` and
   `GIT_INDEX_FILE` naming the Igor's git directory, the tree and the Igor's own index, and the
   scripts' git calls follow all three (#153's measurement 0.12). Run from inside the tree
   without them, they used the worker's planted `.git` directory and ran its hook and its
   `fsmonitor` command as the service user.

Each trailer that binds a tree, `Prose:` and #153's `Bug-hunter-Tree:`, names the tree of the
last staging in the Igor's own index, as #153's decision 35 has it, and the Igor publishes that
tree; an earlier staging would leave later edits, such as the answers to the cold read, out.
The worker cannot change the recorded tree object, and no copy it could change, its index copy
included, is ever what a trailer binds.

The signing scripts are the ones in `skills_dir`, which is root-owned, so running them as the
service user runs nothing the worker wrote. Start check 5 has the worker try to write each script
the Igor runs from there, and to create a file in the directory (*What each start checks*).

### The Igor reads changes without following links

`changes()` reads each changed file with `readFile`, which follows symbolic links. A link the
worker made to `/etc/igor/<role>.pem` would be read as the Igor and published as the file's
content. With one user the worker could read the key itself; with two, this is the one remaining
path to the key.

So, once the waits and the kill above are done, and before anything is read:

- A changed path is checked with `lstat` on each component from the tree down. Where a
  directory above it is a link, the run stops, naming the path: git does not track a path beyond
  a link, and reading one would follow the link. Where the path itself is a link, it is published
  as a link (below).
- A file is opened with `O_NOFOLLOW`, and its real path must still sit inside the tree's real
  path. This closes the race with a worker process still running, as one can under `igor run`,
  where no kill by user is made.
- A file the Igor cannot open stops the run, naming it. Skipping it would leave it out of the
  artifact, which is safe only while nobody chooses which files are unreadable, and the worker
  can.
- **A changed file whose link count is above 1 stops the run, naming it.** A hard link to
  `/etc/igor/<role>.pem` made in the tree is a regular file whose real path is inside the tree,
  so `O_NOFOLLOW` and the real-path check pass it. Linux's `fs.protected_hardlinks=1` stops an
  unprivileged user making a hard link to a file it cannot read or write, and the start check
  refuses a host without it; the link-count check stops one that exists anyway, such as one made
  before the setting was on.
- Every path a refusal names is escaped for a markdown code span, as `quoteName` escapes a name
  that is not text: the worker chooses these names, and a backtick in one would end the span in
  the comment the Igor posts.
- **Every file read from the tree or the outbox gets the same checks:** it is opened with
  `O_NOFOLLOW` and read only if it is a regular file whose link count is 1. That includes the
  declaration file, `reverts.json` in the outbox, which the changed-path checks never see.
- **A parse error never quotes what it parsed.** Node's `JSON.parse` puts the start of the text
  in its message (`Unexpected token 's', "secret-key…" is not valid JSON`), which would carry a
  hard-linked key's text into a refusal or record. An error about a file read from the worker
  names the file and says it did not parse, nothing more.

**A changed link is published as a link.** #137 (`carry-what-a-tree-holds`), an open change,
publishes a link with mode `120000` and its target text as content. The Igor reads that text with
`readlink`, after `lstat` confirms the path is a link, and never opens the file it points to. A
link to `/etc/igor/<role>.pem` then publishes that path, which the worker wrote, and none of the
key.

On `main`, `createBranchWithFiles` and `commitOnBranch` in `src/github.ts`, the two functions
that publish an artifact, send each path as a regular file, mode `100644` or `100755`. Issue #204
orders #137 to be built and archived before this change (task 0.4), so every build of this
change publishes links and gitlinks as #137 does, and the spec names no stop for either.

### Kill, release and sweep act as the worker where they must

- **Kill:** `sudo -n -u <worker> -- pkill -KILL -u <worker>`, which kills every process the
  worker user owns (proposal, decision 27); the Igor cannot signal them itself. A kill of
  `sudo`'s process group is not enough, since Claude Code 2.1.303 starts each Bash command in a
  new session (measurement 6.2). The Igor makes it each time it ends a worker, before every reset of the worker's home (#174's
  decision 13), once the last model step exits, after #189's checks, and before a release.

  Each kill first runs `sudo -n -u <worker> true` (proposal, decision 53), because a refused
  `sudo` and a `pkill` that found no process both exit with status 1. A refused check fails the
  run and is recorded under `instance:<role>:sudoers`, the key under which #101 counts
  failures of a role's `igor serve` processes (*A failed worker spawn is a condition on its instance*). At
  process exit the check and the kill are both synchronous (`spawnSync`), because an `exit`
  handler cannot wait, and a refused check there goes to standard error only, since no run is
  left to fail.
- **Release:** `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>` first, removing everything the
  worker owns and the Igor's files in directories the worker can write; then the Igor's own `rm`
  removes the rest and the git directory, which only the Igor can write. The second pass runs
  even when the first fails, as on `main`.
- **Sweep:** the same passes over each sweepable name. The name rule gains the `-git` suffix
  beside `-outbox`.

**Trees live in `/var/lib/igor/trees/<role>`.** Under `serve`, every tree, outbox and
`<tree>-git` is created in the role's directory of the state directory the unit's
`StateDirectory=igor` makes, not in the unit's private `/tmp`: one fixed path that the host and
#192's compose file can both provide (proposal, decision 20), and that the startup sweep finds on
every start. Every role a host serves shares the state directory, and a process can remove
another role's trees only as that role's worker user, for which it has no sudoers line. So each
role has its own directory, and a process's startup sweep looks only in its own, never at trees
it cannot remove. The table's modes and groups hold there unchanged.

### What each start checks

Before the first cycle, `serve` checks in this order, stopping at the first failure:

1. The user exists, its uid is not 0, and it is not the Igor's own user.
2. `sudo -n -u <worker> -- true` succeeds.
3. The Igor's groups include the worker's primary group.
4. As the worker, `test -x` succeeds on the absolute path of the `claude` the Igor resolves.
   Without it, every item would fail at spawn instead of the Igor refusing to start.
5. As the worker, one `sudo` call runs `test -r`, `test -w` or `test -x` on each path below and
   reports which succeed. Each path that succeeds is a refusal naming it.
   - not readable: `/proc/<igor pid>/environ` (Linux); the file `GITHUB_APP_PRIVATE_KEY_FILE`
     names; the file holding #171's age key that decrypts seat files, whose path the `seatKey`
     setting names; each environment file the unit names in `IGOR_ENV_FILES`, which on the
     shipped unit are `/etc/igor/env` and `/etc/igor/<role>.env`; the Igor user's home, which
     must also fail `test -x`, so the worker cannot enter it; and a canary the check writes, mode
     `0600`, in a fresh `0700` directory the Igor owns
   - not writable: the lore checkout, and the worktree of it this process reads its
     configuration from (#208, `lore-pull`); the directory holding the running `igor`; the `node`
     executable; #174's home template, each of its files and directories; and each script the
     Igor runs from `skills_dir`, prose's and bug-hunter's among them
   - `skills_dir`, #174's directory of pinned skills: in a second `sudo` call the worker tries to
     create a file in it and delete it, and a create that succeeds is a refusal. The worker never
     needs to write there.
   - Every path in this check must exist: a missing one refuses the start, naming it, since
     `test -r` and `test -w` fail on a missing file and the check would pass it.
6. `/proc/sys/fs/protected_hardlinks` reads `1`. Otherwise the worker could make a hard link to
   the App's key in its tree.
7. As the service user, `sudo -n -l` lists `!log_allowed` among the `Defaults` that apply to it.
   Without it sudo writes the seat token to the journal on every worker start (measurement 6.5).
8. As the worker, `git config --global safe.directory '*'` is set if missing.
9. As the worker, an HTTP `GET /` to port 80 of `169.254.169.254` and of `[fd00:ec2::254]`,
   each with a 2-second limit, made by the `node` the Igor runs on: directly, and again through
   each proxy the worker is given in `HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY` or
   `https_proxy`, the last two by a `CONNECT` to port 80. Any HTTP response is a refusal. A
   connection refused, unreachable, blocked, timed out, or accepted and closed with no response
   passes, so a network stack that accepts every connection, as Docker Desktop's does, is not
   taken for the endpoint (*Secrets reach the worker only through the Igor*).
10. The worker user's groups, from `id -Gn` as the worker, include none of `docker`, `lxd`,
    `incus` and `disk`; `sudo -n -l` as the worker lists no command; and, as the worker,
    `test -w` fails on `/run/docker.sock`, `/var/run/docker.sock`, `/run/podman/podman.sock` and
    `/run/containerd/containerd.sock`.
11. The Igor's own process is not dumpable: the native addon's read of `PR_GET_DUMPABLE`
    returns 0, and `/proc/sys/fs/suid_dumpable` reads 0 (*The Igor cannot be dumped*).
12. As the worker, none of `~/.npmrc`, `~/.netrc`, `~/.git-credentials`, `~/.docker/config.json`,
    `~/.aws/credentials` and `~/.config/gh/hosts.yml` exists in its home, as a file or a link,
    checked with `test -e` or `test -L`, so a dangling link counts (proposal, decision 54). Each
    that does is a refusal naming it.

A socket in check 10 or a file in check 12 that does not exist passes, unlike the paths in
check 5, since a host without it is the safe case. A file the check has no path for is reported
as not checked, never as passed: where `IGOR_ENV_FILES` is unset, as in #192's container, which
loads no environment file, the report says the environment files were not checked.

The canary gives check 5 a file to find unreadable where every real credential is in the
environment and no key file exists. It also fails the check if the worker user is privileged in a way the uid check
misses, such as through `CAP_DAC_READ_SEARCH`.

systemd reads the unit's `EnvironmentFile=` lines before the Igor starts, so the Igor learns
those paths only from the unit, which sets `IGOR_ENV_FILES` to them (task 8.2). The `/proc`
probe cannot stand in for probing the files, since it checks the Igor's process, not the files'
permissions.

Under the unit's `ProtectProc=invisible` the worker user cannot see the Igor's `/proc/<pid>`, so
check 5's `environ` probe finds nothing and passes: the worker cannot read the Igor's
environment, which is the property checked. Where the setting has no effect, `environ` is
readable by its owner alone, so the probe passes for the same reason, and fails if the worker can
read it some other way.

### Secrets reach the worker only through the Igor

A worker gets a secret only from the Igor, which registers each one with `rememberSecret`, added
by #217 (`redact-state-branch`), before handing it over, so credential redaction matches it by
value in every record, transcript and check output the Igor stores. A secret reaching the worker
any other way is stored as it stands, unless it has a token shape #217 matches. A secret shorter than 8 characters, which
`rememberSecret` does not register, is never handed over: a seat token that short fails the run,
naming its source, and a proxy password that short refuses the start.

Under `serve` the Igor hands over two secrets: the seat's token, which the worker and every later
model step get; and the user info, the `user:password@` part, of a proxy URL the Igor passes on
from its own environment, which the worker and #189's checks get with the proxy settings. A check
gets no seat token, because it runs code the worker has just written; the proxy password reaching
that code is accepted (proposal, decision 47).
`CLAUDE_CODE_MESSAGING_TOKEN`, which Claude Code sets for the commands the worker runs, is outside
the rule that a worker gets secrets only from the Igor, since the Igor never holds it.

Five side channels could carry a secret to the worker past the Igor:

| side channel | how `serve` deals with it |
|---|---|
| the cloud metadata endpoint, `169.254.169.254` and `fd00:ec2::254`, which hands any caller the instance's cloud credentials | the unit's `IPAddressDeny=` (below), and start check 9 |
| an SSH agent | `workerEnv` builds the environment from a list, which holds no `SSH_AUTH_SOCK`, in both modes; a test proves no agent variable passes (task 1.9) |
| the `docker`, `lxd`, `incus` or `disk` group, a container engine's socket, or a sudo right, each of which reads `/etc/igor` as root | start check 10 |
| a credential in the tree's git configuration or a remote URL, which the worker can read in `<tree>-git` | `gitEnv` on `main` already gives each git command its token in that command's environment and writes none to a file; a test proves `<tree>-git/config` holds none (task 2.7) |
| credentials an operator put in the worker's home, such as `~/.npmrc` | start check 12 refuses six common credential files there (proposal, decision 54); the rest of the home rests on the operator, and the deployment guide says to put no credential there (task 8.4) |

**The metadata endpoint is blocked for the whole unit** (proposal, decision 42). The unit sets
`IPAddressDeny=169.254.169.254 fd00:ec2::254`, which systemd enforces with a BPF program on the
unit's control group, inherited by every process in it. A process `sudo` starts stays in that
group unless `pam_systemd` in sudo's PAM stack opens a session for it and moves it into the
worker user's slice; measurement 6.2 did not record the group, and task 6.15 does. Debian's
`/etc/pam.d/sudo` includes `common-session-noninteractive`, which holds no `pam_systemd`; other
distributions are task 6.15's to check.

The line also blocks the Igor, which needs no cloud credential; a seat's `token_command` reading
a cloud secret store with the instance's role would fail, but #171's seat code, built first,
removes `token_command`. On a kernel without cgroup BPF, systemd warns and enforces nothing, and
start check 9 refuses. The line does not stop a proxy fetching the endpoint for a worker, so
check 9 also asks through each proxy. On Google Compute Engine and Oracle Cloud the same address
is the DNS resolver, so a host whose `/etc/resolv.conf` names it, with no local resolver between,
would lose DNS in the unit (task 6.15). #192's container has no unit, so its host must block the
endpoint; check 9 refuses there until it does.

*Rejected:* a host firewall rule by owner per worker user, such as nftables' `meta skuid`, since
it needs a host step outside the unit, kept across reboots, and a new rule for every worker
user. It is the fallback if task 6.15 finds `sudo` moving the worker out of the unit's group.

**The `gh` and `git` children get a list too** (proposal, decision 44). They hold no worker
secret, but on `main` they inherit the Igor's whole environment, every seat token from
`/etc/igor/env` among them. Each gets `PATH`, `HOME`, the same network settings the worker gets,
and its own token, and nothing else.

**Lore picks a seat, never its secret** (proposal, decision 45). Only the Igor's code and the
server's own configuration decide which secret goes to which process. #171 fixes a seat's
variable to `IGOR_SEAT_<ID>`, binds its ciphertext to its id, and removes `token_file` and
`token_command`; #189's checks get no secret but a proxy URL's user info, from the server's own
environment, not from lore (proposal, decision 47). The proposal checks every token source
against the rule. On `main` a seat names its variable, file or command freely, which breaks the
rule, so #171's seat code is built before this change's (proposal, decision 46).

`igor run` passes no agent socket either, but closes none of the other four side channels: its
worker runs as the person, who may hold an agent, a Docker group and a home full of credentials,
and the notice says so (task 5.4).

### The Igor cannot be dumped

The Igor's memory holds the registry, the App's key and every seat token it has read. A crash
dump writes that memory to disk, where on a host running systemd-coredump root and the process's
own user can read it with `coredumpctl`. These stop it:

- **`LimitCORE=0` in the unit**, so the kernel writes no core file for any process in it.
- **`prctl(PR_SET_DUMPABLE, 0)`**, called by the Igor as it starts, before it reads any
  credential file or token source. The environment the unit loads is in the Igor's memory from
  its first instruction, before the call; under the unit, `LimitCORE=0` covers a crash in that
  moment, and in #192's container nothing does. While `fs.suid_dumpable` is 0, a process that is
  not dumpable writes no core whatever the limit, its `/proc/<pid>` entries become root's, and no
  process of the same user can `ptrace` it. The flag is not inherited across `execve`, so it
  changes nothing for the worker or any program the Igor starts. At `fs.suid_dumpable=2`, as
  Ubuntu sets it with apport, the kernel still dumps such a process, owned by root, to a pipe
  handler, so start check 11 refuses unless it reads 0.
- **`setrlimit(RLIMIT_CORE, 0)`**, called by the Igor, so `serve` in #192's container, which has
  no unit, writes no core either.

Node has no `prctl` and no `setrlimit`, and none of Igor's four dependencies is native, so Igor
ships a native addon of three calls: `prctl(PR_SET_DUMPABLE, 0)`, `setrlimit(RLIMIT_CORE, 0)`
and `prctl(PR_GET_DUMPABLE)` to read the flag back. It is written in Rust through `napi-rs`, with
prebuilt Linux binaries for x64 and arm64, so installing needs no compiler (proposal, decision
43). Under `serve`, an addon that fails to load, a call that fails, or a flag that reads back as
anything but 0 refuses the start with status 78 (start check 11). Under `igor run` the Igor makes
the two setting calls where it ships the addon, Linux on x64 and arm64, and elsewhere, such as on macOS,
starts without them.

### Every seat has a token, and no call uses a stored login

Every `claude -p` the Igor starts authenticates with the token of the seat it spends, from its
environment, under `serve` and `run` alike. The worker and the model steps after it run as the
worker user with the seat's token; triage runs as the Igor with the token of the seat the budget
gate chose (#171's *Triage's model call is made only where a seat can pay for it*); a seat probe
uses the token of the seat it reads, and task 1.10 removes the live `/usage` read of a seat's
budget. #171, built first,
refuses a seat file that names no token; such a seat would run on the calling user's login, the
service user's for triage and the worker user's for the worker, so its usage could be read under
one login and spent under another. Neither the service user nor any worker user is logged in to
Claude, and #174's reset deletes a login stored in the worker's home, so the worker has none to
come by. How a person creates a token is in
#171's guides (its task 9.5).

Under `igor run`, the seat is the token in `IGOR_RUN_TOKEN`, an implicit local seat (#171's
*`igor run` spends its own token as an implicit local seat*): nothing in the lore repository
describes it, and `run` spends no lent seat. Triage and the worker under `run` both authenticate
with it, and the worker's environment holds it as it would any seat's token.

`token_env`, `token_file` and `token_command` seats are already on `main` (the in-force
`seat-budget` requirement *A seat names its token through exactly one mechanism*, read by
`parseOrgBudget` in `src/budget.ts`). What #171 removes is the in-force allowance for a seat with no token
and for an organization with no seats, which run on the ambient login. Until #171 archives, that
allowance and the proposal's decision 21, that every seat has a token, disagree. That window is
accepted (proposal, decision 34), since what is built follows decision 21.

### Prompts go on stdin

On Linux every user can read every process's `/proc/<pid>/cmdline`. Today `claudeWorker`
(`src/execute.ts`) and `runClaude` (`src/triage.ts`) pass the prompt and `--system-prompt` as
arguments, so a worker of one role could read another worker's item and lore, or triage's,
through `/proc` or `ps`. Two things close that:

- **stdin and a file.** Every `claude -p` takes its prompt on stdin, and its system prompt,
  which cannot share stdin, in a file named by `--system-prompt-file`, written before the spawn
  and removed after the process exits. For a process running as the worker user, the file sits
  in `<tree>-prompt`, a directory the Igor owns beside the tree, mode `2750` with the worker's
  group, so the worker can read it and not write it; never in the tree or the outbox, which the
  worker writes. For a process running as the Igor, such as triage, it sits in a directory only
  the Igor can read. The startup sweep removes a file a crash left in either place. Measurement 6.9, on Claude Code 2.1.303: `-p` with stream-json output reads its
  prompt from stdin and its system prompt from `--system-prompt-file`, and the usage read and
  triage's `json` call take their prompts from stdin too.
- **`ProtectProc=invisible`** in the unit. systemd mounts the unit's `/proc` with
  `hidepid=invisible`, so a process sees only its own user's processes. That needs per-mount
  `hidepid`, in Linux 5.8 and later; on an older kernel the setting has no effect, and the
  prompts are still out of the arguments. Measurement 6.8 confirmed it on Linux 6.12 under the
  unit as task 8.2 changes it; task 6.11 repeats it on a Linux server's kernel.

Out of the arguments, the prompts are also out of `sudo`'s log, which records each command line:
measurement 6.5 found no prompt text there, only the paths of `claude` and of the system prompt
file, and the worker's flags, which name the role's allowed commands.

### `igor doctor` gets no check

`igor doctor` (#113) reports on a lore repository from wherever someone has a checkout, usually
not the host and not as the service user. Isolation belongs to one host and one service user,
and only the Igor process knows its key paths and pid, so the start-up check, which refuses
rather than reports, covers it. Under doctor's rule (*name the command that covers it*), doctor
could at most add a line saying the Igor checks worker isolation when it starts: a later edit to
#113's branch, not made here.

### `serve` always has a worker user, `run` never does

- **`serve` always runs its worker as its worker user**, and refuses to start if that user does
  not exist (*What each start checks*). An unattended Igor on issues anyone can file is the case
  the issue says must not run without isolation.
- **`run` always runs the worker as the same user**, with a notice. It is the one-shot command
  for development: a person at a terminal, usually on a laptop with their own login, where a
  second account is friction for no gain. The notice puts the choice in every log.
- **`run` removes trees as its own user**, with no `sudo`, since its worker ran as that user;
  so too the worker home and plugin directory #174 gives each run, which #174 names and removes.
  Which trees go is the in-force sweep's rule, *The abandoned-tree threshold derives from the
  worker's longest possible life*, which removes a tree only once it is older than any run could
  last, so never a live run's. `run` does not sweep `/var/lib/igor/trees/<role>`, where `serve`
  trees sit.

So the command says whether there is a worker user, and nothing in the environment or the
configuration does (proposal, decision 3). Rejected alternatives:
`serve --same-user`, which leaves an unattended Igor whose worker can read its credentials;
refusing both without a worker user, which adds a step to every development run; and warning in
both, under which a server whose worker user was never created would run its worker as the
service user, the exposure #163 found.

**macOS runs `serve` only in #192's container image** (`deploy-image`), and runs `run` on the
host. macOS has no `/proc` to probe and no `fs.protected_hardlinks`, so start check 6 would
refuse a worker user there anyway. The deployment guide gives the Linux steps. #192 merges as it
is; this change's implementation adds to its image `sudo`, a worker user for each role the
compose file runs, and their sudoers lines, and moves the compose file's trees volume to
`/var/lib/igor/trees` (proposal, decision 20; task 8.3).

### The unit

- `NoNewPrivileges=true` goes: it stops `sudo` from changing user at all. The worker keeps what
  any unprivileged account has and gains nothing else, since it has no sudoers entry.
- `SupplementaryGroups=igor-worker-%i` puts the Igor in the worker's group, and
  `ReadWritePaths=/var/lib/igor-worker-%i` keeps the worker's home writable inside the unit's
  mount namespace, where `ProtectSystem=strict` makes `/var` read-only (*The unit names the
  worker user from its role*).
- `PrivateTmp=true` stays for everything but the trees. A process started through `sudo` keeps
  the unit's mount namespace and so shares the Igor's private `/tmp`, where every temporary file
  the Igor writes goes in a `0700` directory of its own. Trees live under `StateDirectory=igor`,
  which this change adds and which systemd keeps writable under `ProtectSystem=strict`.
- `PATH` puts `/usr/local/bin` first, where `claude` now lives, because the worker cannot enter
  the service user's home to run `~igor/.local/bin/claude`.
- `ProtectProc=invisible` (*Prompts go on stdin*).
- `IPAddressDeny=169.254.169.254 fd00:ec2::254` (*Secrets reach the worker only through the
  Igor*).
- `LimitCORE=0` (*The Igor cannot be dumped*).
- `Restart=on-failure`, `RestartPreventExitStatus=78` and `RestartSec=30s`, all three #82's
  lines. A refused start exits 78 (#82's *A process that refuses to start exits with status
  78*), so systemd leaves the unit failed, with Igor's reason in the journal, rather than
  restarting it to be refused again. A start that exits 1, where GitHub or the model provider did
  not answer or GitHub refused the App's credential, is restarted 30 seconds later; a refused
  credential exits 1, not 78, because its cure, such as a key replaced at the same path, is read
  by the next start (#82's decision 13). A start every 30 seconds never reaches systemd's default
  rate limit of five starts in ten seconds, which would leave the unit failed for good. A crash
  is still restarted.

### Requirements that hold one behaviour each

Each requirement stays under OpenSpec's 500-character limit (issue #232), stating its rule;
examples and edge cases are scenarios, and the reasons are below. A rule with two behaviours is
two requirements, each with its own scenarios. Most such pairs share one bullet in *Reasons*
below. In these four, the first requirement has no bullet of its own and rests on the reasons for
the second, given in *Reasons* or, where it has no bullet there, in the decisions above:

- *A sudo that passes a secret is preceded by a check that passes none*, beside *The worker runs
  as a separate, unprivileged user*.
- *Under serve, a role's trees sit in its own directory of the state directory*, beside *A kill,
  a release and a sweep reach what the worker owns*.
- *A proxy password too short to register refuses the start*, beside *A worker gets a secret
  only through the Igor, which registers it*.
- *A git child gets a token only when it reaches a remote*, beside *The gh and git children get
  an environment built from a list*.

### Reasons the requirements rest on

- *The worker runs as a separate, unprivileged user.* Claude Code's permission checks cover its
  own tools and the commands it recognises, not the code an allowed command runs, such as a file
  the worker wrote that `npm test` runs. File permissions hold whatever the worker runs.
- *The worker can write its tree and outbox and nothing the Igor depends on.* A worker that can
  write a file the Igor later executes or trusts has the Igor's identity, and the separate user
  then protects nothing.
- *Nothing the worker writes is executed by the Igor.* Git runs a hook, an fsmonitor command or a
  configured filter as whoever runs git, so a worker that could name one to the Igor would run
  code as the Igor. The rule against running a program the worker wrote binds only `igor serve`:
  under `igor run` the worker already runs as the Igor's user and can write the tree's git
  configuration.
- *The Igor reads no file on the worker's behalf through a link* and *Every file read from the
  worker is a regular file with one link.* A link to the App's key, read by the Igor, would
  publish the key in a pull request. A hard link is a regular file inside the tree, which the
  symbolic-link rules do not catch, and a FIFO would hang the read. Under
  `igor run` these rules do not apply: the worker runs as the person, who can read the same
  credentials, so a link reaches nothing the person could not already publish.
- *The Igor runs prose's first call, and bug-hunter checks the prose pass* and *The Igor stages
  only after its checks, and #153's trailers bind the last staging.* The terms are #153's: prose's
  first call prints prose's rules and a one-use pass token, which its second call needs to sign;
  bug-hunter's minting script writes `Bug-hunter-Tree:`; its triage decides whether a diff gets a
  bug hunt. Each rule applies to one run of the model steps, and #189's second worker run starts
  another. *#153's steps run no signing script* gives the reasons for the order.
- *A kill, a release and a sweep reach what the worker owns.* The Igor cannot signal another
  user's processes or unlink entries in its directories, so a kill or removal run only as the
  Igor leaves both behind.
- *Isolation is proved before any work is taken.* A worker user that can read the key protects
  nothing, and nothing else would notice; only the process holding the credentials knows where
  they are, so it checks. A failed check exits with status 78, which the shipped compose file
  does not restart in a loop; #82's *A process that refuses to start
  exits with status 78* says how it waits before exiting.
- *A worker gets a secret only through the Igor, which registers it* and *Under serve, the worker
  user has no route to a credential the Igor did not hand it.* #217's redaction matches by value
  only the secrets the Igor registered, and each side channel hands over a credential the Igor
  never registered (*Secrets reach the worker only through the Igor*, which also gives
  `igor run`'s limit). A check runs
  code the worker has just written, so a secret given to a check is given to that code.
- *Which secret reaches which process is decided by the Igor and its server.* For seats, #171's
  *A seat file names its token only by ciphertext or its own variable* and *A seat's token travels
  as ciphertext in its file* make this hold. A check's only secret is a proxy URL's user info,
  which comes with the server's own proxy settings. Where lore could name the variable or the file
  a secret is read from, one commit could hand the worker the App's key as its seat token.
- *The worker is given an explicit environment holding no credential but its seat's.* Claiming,
  commenting, branching and publishing happen in the loop afterwards, with the loop's own
  credentials, so the worker needs no code-host or tracker credential. An inherited environment holds
  credentials nothing in the worker uses, one shell command away from a worker that an item's
  text has steered. Only
  what a toolchain needs is passed: the search path, a home directory and the host's network
  settings.
- *A kill reaches the worker's whole process tree.* A kill that reaches only the worker leaves a
  build, a test run or a script writing to a tree about to be released; under `igor run` a
  command in a session of its own can still outlive it (*Risks*).
- *Igor forwards the termination it is sent.* A worker in its own group is outside the group a
  terminal signals, so only Igor reaches it. Igor forwards the termination when it exits, not when
  the signal arrives, because killing the worker on arrival would end the item in hand, which
  shutdown must finish or hand off.
- *A base change is undone only where the resolution says so* and *A declaration is read only
  from the run's own outbox.* When the worker resolves a conflict with the base, the branch the
  pull request targets, the commit's tree is the merge result, so a path left at the artifact's
  own version reverts the base's change, which review sees as nothing changed. So the Igor
  compares each path the base changed with its state before that change, and where one is
  restored without a declaration naming it, `reverts.json` in the outbox, publishes nothing and
  hands the item off. The comparison reads outcomes: a resolution that takes the base's side, combines both sides or
  honours the base's deletion restores nothing. A repository can commit a file at any path, and
  one on disk in every fresh clone would authorize the same revert on every run, so no path in
  the tree is reserved for declarations. The first requirement is in force, and its `MODIFIED`
  copy keeps every scenario in force.
- *A failed worker spawn is a condition on its instance* and *A sudoers condition clears only on
  a passing check at a cycle's start.* #101 opens a condition after a number of consecutive
  failures, and a run that records none resets the count. Each execution-log row for a run
  names its instance, so the count is kept per instance and a clean run of the instance resets
  that instance's count. Clearing on a
  passing check is how #171 clears its read-cleared conditions (*A read-cleared condition opens
  on a failing read and clears on a passing one*); those stop nothing by themselves, while this
  one stops its instance, so it is its own requirement.

## Risks / Trade-offs

- **The seat token is within reach of what the worker runs.** It has to be in `claude`'s
  environment. Claude Code removes `CLAUDE_CODE_OAUTH_TOKEN` from its commands' environment but
  gives them `CLAUDE_PID`, and `claude` runs as the same worker user, so a test can read the
  token from `/proc/$CLAUDE_PID/environ` (measurements 6.1 and 6.4).
  `ProtectProc=invisible` hides only other users' processes, so it does not stop that read. A
  worker can spend or leak its own seat, as it could under one user; the comment on `npm test`
  in `templates/org.yaml` says so.
- **Other clouds' metadata addresses are not blocked.** The line names two: `169.254.169.254`,
  which AWS, Google Cloud, Azure and Oracle use, and EC2's IPv6 `fd00:ec2::254`. A cloud that
  serves metadata elsewhere, such as Alibaba Cloud's `100.100.100.200`, stays reachable.
- **The worker can still reach the network**, to send out its seat token and anything in its
  tree, the repository it was given.
- **Under `igor run`, a command the worker started can outlive the run.** It sits outside the
  worker's process group (*Kill, release and sweep*), and `run` cannot kill by user, which would
  kill the Igor and the person's own processes (#174's decision 13). It runs as the developer,
  who could run it anyway. Under `serve` the kill by user ends it (proposal, decision 27).
- **Two `igor serve` processes of one role on one host share one worker user.** Each one's kill
  by user then ends the other's worker, and each can read the other's seat token through
  `/proc`. Neither the shipped unit, `igor@<role>`, nor the compose file, one container per role,
  starts two; a person who starts a second by hand gets that.
- **A role served from several hosts shares one condition on its instance.** The cure key
  `instance:<role>:sudoers` names the role, not the host, so one host's broken sudoers line
  stops the role's `igor serve` on every host until a passing check clears it; the stop names the
  host whose line to fix.
- **With `Defaults:igor !log_allowed`, the journal does not record which commands the Igor ran
  as a worker user.** The pam session lines remain, holding no command and no environment
  (measurement 6.5).

## Measurements (2026-10-18)

Run on a Docker Desktop container on a Mac, with systemd 252 as PID 1 and Linux
6.12.76-linuxkit, the kernel of Docker Desktop's virtual machine, not a server's. sudo 1.9.13p3,
Node 22, git 2.39, Claude Code 2.1.303 on haiku, `fs.protected_hardlinks=1`. The service user
was `igor`, with its home `0700`. Task 8.4's commands, run as written, made the worker users and
`/etc/sudoers.d/igor` from a `deploy/sudoers.example` holding task 8.1's text without the
`Defaults` line: `visudo -cf` printed `parsed OK`, and the commands made each user, its `0700`
home and its line. Canaries, each a random string owned by `igor` with mode `0600`, stood at
`/etc/igor/env`, `/etc/igor/maintenance-1.env`, `/etc/igor/maintenance-1.pem` and a stand-in for
the `seatKey` path, all in `/etc/igor` (`0700`), and at `/home/igor/canary.txt`. A real seat
token, in its own `0600` file, let the worker run a model.

The unit was `deploy/igor.service` with task 8.2's changes. With Igor's spawn not built, a Node
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
  (*Risks*).
- **6.2, `sudo` under the unit: confirms, except the kill.** sudo ran under `ProtectSystem=strict`
  and `PrivateTmp=true` without `NoNewPrivileges`, and refused with it. Every stream line
  parsed. The init event read `apiKeySource: "none"`, and a `rate_limit_event` arrived, which is
  the sign the call ran on the seat's token. `claude` sat in the process group of the `sudo` the
  Igor spawned. Exit statuses 0 and 3, and a `SIGKILL`, reached the Igor. **Contradicts the
  design:** a kill of that group as the worker ended `claude` and `sudo` and left `npm test`
  running, reparented to PID 1 and still holding the tree, because Claude Code starts each Bash command in a new session. `sudo -u <worker>
  pkill -KILL -u <worker>` left nothing. Decision 27 and *Kill, release and sweep* follow it.
  Today's `killTree` on `main` would leave the same processes.
- **6.3, git with a read-only git directory and an index copy: confirms.** `git rm`, `git mv`,
  `git log` and `git show` succeeded as the worker. The Igor's read against its own index saw the
  modified file, the path `git rm` removed and the path `git mv` moved from as removed, and the
  path it moved to as new. The Edit and Write tools changed a file the Igor owned; Edit replaced
  it, so it kept its mode and became the worker's (the table above).
- **6.4, the environment of a command `claude` runs.** `CLAUDE_CODE_OAUTH_TOKEN` was absent,
  contradicting the design's assumption that Claude Code passes its environment on; the token
  stays within reach through `CLAUDE_PID` (*Risks*). `GIT_INDEX_FILE` was passed, which `git rm`
  and `git mv` need. `SUDO_COMMAND` held sudo's command line, which carries the system prompt
  file's path and no prompt. Claude Code also passed `CLAUDE_CODE_MESSAGING_TOKEN` and
  `CLAUDE_CODE_MESSAGING_SOCKET`; what that token authorizes is task 6.13.
- **6.5, what sudo logs per worker start. Contradicts the design.** Per spawn, sudo wrote one
  journal line holding the working directory, the target user, every preserved variable with its
  value, the seat token in full among them, and the command line. The command line held no prompt
  text. The journal was persistent; root, the `adm` and `systemd-journal` groups and the service
  user could read the line, and the worker user could not. Both `Defaults:igor !log_allowed` and
  `Defaults:igor !syslog` removed it, leaving only pam's session lines; `visudo -c` accepted
  both. Decision 28 takes `!log_allowed`. The token was real, since a model had to run, so one
  journal read made while measuring printed it unredacted into the measuring agent's transcript.
  That token counted as leaked and has been revoked. Task 6.12, which re-runs the measurement,
  counts the journal lines holding a token and never prints them.
- **6.6, two units with one worker user: confirms proposal decision 7** (*Each role has its own
  worker user*). Plain processes stood in for `claude`, which tests the same operating-system
  property.
- **6.7, the unit's groups, home and sudo: confirms.** `id` in the unit showed the worker's group
  among the Igor's through `SupplementaryGroups=igor-worker-%i`, with no `/etc/group` edit. The
  worker wrote its home, and a unit without that home in `ReadWritePaths=` made the write fail.
- **6.8, `ProtectProc=invisible`: confirms, on Linux 6.12.** A worker user listing `/proc` saw
  only its own user's processes. With `ProtectProc=default` it saw root's, `igor`'s and the other
  worker users'. A server's kernel is task 6.11.
- **6.9, prompts on stdin: confirms** (*Prompts go on stdin*). Separately, with a token in the
  environment, `/usage` printed only the session's local cost summary and no `% used` lines, in
  both the argument and the stdin form. That bears on #143, not on this change.
- **6.10, the modes of what the worker creates: the umask was `0022`.** The Write tool, `npm
  install`, `git rm`'s rewrite of the index copy, `mkdir` and `touch` made files `0644` and
  directories `2755`, owned by the worker user; `git mv` kept the moved file's inode, mode and
  owner. The Igor read every one through the group. The worker's directories are not group
  writable, which the release's first pass, as the worker, handles. No umask needs setting.

Not measured: a published artifact, since nothing publishes without Igor's code (task 6.14); a
server's kernel for 6.8 (task 6.11); task 8.4's commands with decision 28's `Defaults` line (task
6.12); and the start check in #192's container (task 8.3).
