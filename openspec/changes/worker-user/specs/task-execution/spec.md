## ADDED Requirements

### Requirement: The worker runs as a separate, unprivileged user

Under `igor serve`, every model step and every process one starts SHALL be unable to read any
credential the Igor holds (its environment files, key or token files, seat-file key or process
environment) or reach another role's worker or that worker's files, and no argument of theirs
SHALL hold the item's text or the seat token. On a *local host*, the machine `igor serve` runs on,
they SHALL run as the *worker user* `igor-worker-<role>`, never root or the unit's `User=`, the
*service user*.

#### Scenario: Code an allowed command runs cannot read the Igor's credentials

- **WHEN** a worker writes a test that reads a file only the Igor's user can read, and runs it
  through an allowed test command
- **THEN** the read is refused
- **AND** the file's content appears nowhere in the run's output

#### Scenario: The Igor's environment is unreadable

- **WHEN** a worker reads the Igor process's environment through `/proc`
- **THEN** the read is refused

#### Scenario: The seat token is not on a command line

- **WHEN** a worker is started as the worker user
- **THEN** the seat token is in the worker's environment
- **AND** it is in no process's arguments
- **AND** the Igor writes it to no file
- **AND** under the sudoers file the deployment ships, no journal line `sudo` writes for that
  start holds it

#### Scenario: A worker cannot reach another role's worker

- **WHEN** on a local host role `dev`'s worker reads or writes a file in a tree of role `docs`, or
  reads the environment of `docs`'s worker through `/proc`
- **THEN** each is refused

#### Scenario: A model step after the worker runs as the worker user

- **WHEN** the Igor starts a `claude -p` in the worker's tree after the worker exits, such as a
  prose pass that runs the repository's tests
- **THEN** that process, and every process it starts, runs as the worker user

#### Scenario: The worker user's name comes from the role

- **WHEN** the unit `igor@generalist` starts `igor serve generalist`
- **THEN** its worker runs as `igor-worker-generalist`
- **AND** the Igor itself runs as the service user the unit's `User=` names

#### Scenario: A role name holding a dash is not parsed

- **WHEN** the unit `igor@code-review` starts `igor serve code-review`
- **THEN** its worker runs as `igor-worker-code-review`

#### Scenario: A lore file cannot name the worker user

- **WHEN** `igor.config.yaml`, or any other lore file, names a worker user
- **THEN** the Igor does not use that name, and loading `igor.config.yaml` with it fails, as it
  does for any unknown key

### Requirement: A sudo that passes a secret is preceded by a check that passes none

Before each `sudo` that passes the worker user a secret, the Igor SHALL run
`sudo -n -u <worker user> true`, so that no refusal sudo logs holds the seat token or a proxy
password. A refused check SHALL fail the run without that `sudo`, except before the
start check's metadata probe, where it SHALL refuse the start with status 78. A refused check that
fails a run, and a failed spawn, SHALL be recorded as `stuck-conditions`' *A failed worker spawn
is a condition on its instance* says.

#### Scenario: Four calls pass a secret

- **WHEN** the Igor spawns the worker, starts a later `claude -p` in its tree, runs one of #189's
  checks, or probes the metadata endpoint through a proxy at the start check
- **THEN** it runs `sudo -n -u igor-worker-<role> true` first

#### Scenario: A refused sudo logs no seat token

- **WHEN** a sudoers line the start check found was removed after the start, and `igor serve`
  is about to spawn a worker
- **THEN** its `sudo -n -u igor-worker-<role> true`, which carries no secret, is refused, and the
  Igor fails the run without spawning, so no journal line holds the seat token
- **AND** where refusals reach #101's recurrence threshold, that instance takes no new item
  until its check at the start of a cycle passes

#### Scenario: A check before one of #189's checks is refused

- **WHEN** a sudoers line is removed after the start, and the Igor is about to run one of #189's
  checks as the worker user
- **THEN** its `sudo -n -u igor-worker-<role> true` is refused, the run fails without the check,
  and no journal line holds the proxy password

#### Scenario: A refused check before the metadata probe refuses the start

- **WHEN** the start check is about to probe the metadata endpoint through a proxy, and its
  `sudo -n -u igor-worker-<role> true` is refused
- **THEN** `igor serve` refuses to start with status 78, and nothing is recorded under the
  instance's cure key

### Requirement: The worker can write its tree and outbox and nothing the Igor depends on

Under `igor serve`, the worker SHALL be able to create, edit and remove files in its working
tree, write its outbox, and run the role's allowed commands. It SHALL NOT be able to write the
tree's git directory, the lore checkout or any worktree of it the Igor reads configuration from,
the Igor's installation, `skills_dir`, the Igor's home or the Igor's credential files. The Igor
SHALL write its records only through the code host, never to a local file the worker could write.

#### Scenario: The worker edits and removes files in its tree

- **WHEN** a worker edits a file, creates one in a new directory, and runs `git rm` and `git mv`
- **THEN** each succeeds
- **AND** the artifact carries every one of those changes

#### Scenario: The tree's git directory is not writable by the worker

- **WHEN** a worker writes a hook or a configuration file into the tree's git directory
- **THEN** the write is refused

#### Scenario: The lore checkout is not writable by the worker

- **WHEN** a worker writes to the Igor's lore checkout or its installation
- **THEN** the write is refused

#### Scenario: The Igor's home and credential files are not writable by the worker

- **WHEN** a worker writes into the Igor user's home directory, or over a key file the Igor
  reads
- **THEN** the write is refused

#### Scenario: The worker cannot write the Igor's records

- **WHEN** a worker writes a file named `executions.ndjson` anywhere it can write
- **THEN** the Igor's record of the run is the one it wrote on the `igor-state` branch through the
  code host, and the worker's file is not read as a record

### Requirement: Nothing the worker writes is executed by the Igor

The Igor SHALL run git in a tree with hooks, fsmonitor and submodule recursion off, and
run its git commands for a tree, and prose's and bug-hunter's scripts, with
`GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=/dev/null`. Under `igor serve` it SHALL NOT run as
its own user any program the worker could have written or named. A changed nested repository with
working content SHALL stop the run, naming it. A changed gitlink SHALL be published as the commit
it names, without entering the submodule.

#### Scenario: A hook the worker left is not run

- **WHEN** a tree holds a hook or a `core.fsmonitor` setting that names a program
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the program does not run

#### Scenario: A filter the service user's configuration defines is not run

- **WHEN** the service user's global git configuration defines `filter.lfs`
- **AND** a worker's `.gitattributes` names that filter for a file it changed
- **THEN** the Igor's staging and status read run no filter
- **AND** the Igor publishes the file as the worker left it

#### Scenario: With no global configuration, a merge is given the Igor's identity on its command line

- **WHEN** the Igor runs a git merge in a tree, which needs a committer identity
- **AND** the merge reads no system or global git configuration, which held that identity
- **THEN** the merge gets the Igor's identity on its own command line

#### Scenario: A file stored through Git LFS is published as its pointer

- **WHEN** the worked repository stores a file through Git LFS
- **THEN** the Igor checks it out and publishes it as the LFS pointer the repository stores
- **AND** git's built-in conversions that `.gitattributes` turns on, such as `eol`, still apply

#### Scenario: A nested repository's filter is not run

- **WHEN** a worker creates a nested repository in its tree whose own configuration defines a
  filter, and names that filter for a file
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the filter does not run
- **AND** the run stops naming the nested repository, and nothing is published

#### Scenario: A moved submodule pointer is published as a pointer

- **WHEN** a run's changes move a submodule's gitlink to another commit
- **THEN** the artifact carries the gitlink naming that commit
- **AND** the Igor runs no git command inside the submodule's directory

### Requirement: The Igor reads no file on the worker's behalf through a link

The Igor SHALL read a worker's changes only after every model step in its tree has exited; under
`igor serve`, also only after killing every process the worker user owns, and against its own
index, never one the worker could write. Neither it nor a process it runs as the service user SHALL
follow a symbolic link or read through a linked directory. A changed path beneath a link, or with
more than one hard link, SHALL stop the run, naming the path. A changed link SHALL be published as
a link.

#### Scenario: A link to a credential is published as a link

- **WHEN** a worker creates `notes.txt` as a link to a file only the Igor can read
- **THEN** the artifact carries `notes.txt` as a link whose target is that file's path
- **AND** the linked file's content is in no artifact, comment or record

#### Scenario: The signing scripts follow no link

- **WHEN** a worker replaces a file in its tree with a link to a file only the Igor can read, and
  a signing script of #153's, or the scope check of #187 (an open change listing changed paths
  its item does not name), reads that path
- **THEN** the read does not follow the link
- **AND** the linked file's content is in no artifact, comment, record or trailer

#### Scenario: A path beneath a linked directory stops the run

- **WHEN** a worker replaces a directory in its tree with a link, and a changed path lies
  beneath it
- **THEN** the run stops naming that path, and nothing is published
- **AND** nothing is read through the link

#### Scenario: A link a later model step makes is seen

- **WHEN** a model step after the worker creates a link in the tree
- **THEN** the Igor's link checks before the next staging see it

#### Scenario: A hard link stops the run

- **WHEN** a changed file in the tree has a link count of 2
- **THEN** the run stops naming the file
- **AND** nothing is published

#### Scenario: An index the worker edited hides nothing

- **WHEN** under `igor serve` a worker modifies a file and marks it unchanged in the index copy it
  was given
- **THEN** the Igor still reads the file as changed
- **AND** the artifact carries the change

#### Scenario: A path holding a backtick is escaped

- **WHEN** a run stops on a changed path named ``a`b``, under this requirement, *Every file read
  from the worker is a regular file with one link* or *Nothing the worker writes is executed by
  the Igor*
- **THEN** the reason names the path in a code span that the backtick does not end

#### Scenario: A file the worker made unreadable is not dropped

- **WHEN** a worker creates a file the Igor cannot read
- **THEN** the run stops naming the file, as #120's *A path execution cannot read is never
  silently omitted* requires
- **AND** no artifact is published without it

### Requirement: Every file read from the worker is a regular file with one link

Each file the Igor, or a process it runs as the service user, reads from the worker's tree or
outbox, the declaration file `reverts.json` included, SHALL be checked with `lstat` before it is
opened, opened without following a link and without blocking, and read only if `fstat` shows a
regular file whose link count is 1. Otherwise the run SHALL stop before anything is published,
naming the file. An error parsing such a file SHALL NOT quote its content anywhere the Igor
writes.

#### Scenario: A link in the outbox is not followed

- **WHEN** a worker makes its declaration file a link to another file
- **THEN** the Igor does not read the linked file
- **AND** the run stops, saying the declaration is not a regular file

#### Scenario: A hard-linked declaration file is not read

- **WHEN** the declaration file `reverts.json` has a link count of 2
- **THEN** the Igor does not read it
- **AND** the run stops, saying the declaration has more than one hard link

#### Scenario: A declaration file that is a FIFO is never opened

- **WHEN** the worker makes `reverts.json` a FIFO
- **THEN** the Igor does not open it, and does not wait on it
- **AND** the run stops, saying the declaration is not a regular file

#### Scenario: A declaration swapped for a FIFO after the check does not hang the Igor

- **WHEN** `reverts.json` is a regular file when the Igor checks it, and a process the worker
  started replaces it with a FIFO before the Igor opens it
- **THEN** the open does not wait on the FIFO
- **AND** the run stops, saying the declaration is not a regular file

#### Scenario: A declaration that does not parse is not quoted

- **WHEN** the declaration file is a regular file with one link whose content is not valid JSON
- **THEN** no refusal, comment, record or log the Igor writes quotes any of its content

### Requirement: The Igor publishes the tree it recorded before the checks

After the last staging of the changed paths into its own index, the Igor SHALL record the staged
tree as a tree object in its own git directory, which the worker user cannot write. The worked
repository's checks (#189), which run as the worker user, SHALL run only after that record, and the
Igor SHALL publish the recorded tree.

#### Scenario: A check cannot change the recorded tree

- **WHEN** a check running as the worker user rewrites a file the worker changed, and tries to
  write the Igor's git directory
- **THEN** the check starts only after the Igor has recorded the tree
- **AND** the write to the git directory fails
- **AND** the Igor publishes the tree object it recorded

### Requirement: The Igor runs prose's first call, and bug-hunter checks the prose pass

Where a role runs both of #153's bug-hunter and prose steps, bug-hunter SHALL run first. No model
step SHALL run a prose or bug-hunter script; bug-hunter SHALL end by reporting its `Bug-hunter:`
value. Before the prose pass, the Igor SHALL run prose's first call itself and put the rules and
pass token it prints in the pass's prompt. Bug-hunter's triage SHALL then run on the prose pass's
diff before #153's cold read: a diff it skips SHALL get no further iteration, and any other diff
one more.

#### Scenario: The Igor runs prose's first call

- **WHEN** the prose pass is about to start
- **THEN** the Igor runs prose's first call as the service user, with the script in `skills_dir`
- **AND** the prose pass's prompt holds the rules and the pass token that call printed
- **AND** no prose or bug-hunter script, `prose start` (the call that marks a session as having
  read prose's rules) included, runs as the worker user

#### Scenario: A prose pass whose diff the triage skips needs no second hunt

- **WHEN** bug-hunter's triage skips the prose pass's diff, such as one that touches only comments
- **THEN** no further bug-hunter iteration runs

#### Scenario: A prose pass whose diff the triage does not skip gets one more hunt

- **WHEN** bug-hunter's triage does not skip the prose pass's diff, such as one that changes an
  error message
- **THEN** bug-hunter runs one more iteration before the Igor stages

### Requirement: The Igor stages only after its checks, and #153's trailers bind the last staging

A *staging* is the Igor adding the changed paths to its own index. Before each, every model step
started so far SHALL have exited, every process the worker user owns SHALL have been killed, and
the checks on links, hard links, nested repositories and submodules SHALL have passed. After the
last, the Igor SHALL run prose's second call and bug-hunter's minting script against it, and both
trailers, `Prose:` and `Bug-hunter-Tree:`, SHALL name that staging's tree, which the Igor publishes.

#### Scenario: Both trailers bind to the tree the Igor publishes

- **WHEN** bug-hunter and then the prose pass edit the tree
- **AND** the worker had marked a changed file unchanged in its index copy
- **THEN** every staging comes after the model steps started so far have exited
- **AND** the Igor runs prose's second call, with the first call's pass token, and bug-hunter's
  minting script against the last staged tree, which holds that file's change and both steps' edits
- **AND** both calls run as the service user, with the scripts in `skills_dir`
- **AND** that tree is the one the Igor publishes

#### Scenario: A .git the worker made does not reach the signing calls

- **WHEN** the worker replaces the tree's `.git` file with a `.git` directory holding a hook and
  a `core.fsmonitor` setting
- **THEN** the Igor's signing calls run neither
- **AND** they write no pass token into that directory, since they run with `GIT_DIR`,
  `GIT_WORK_TREE` and `GIT_INDEX_FILE` naming the Igor's own git directory, the tree and its own
  index

#### Scenario: Every staging follows the kill and the checks

- **WHEN** the Igor stages before prose's first call, after the prose pass, and after the model
  steps that answer #153's cold read
- **THEN** before each staging every model step started so far has exited, every process the
  worker user owns has been killed, and the link and hard-link checks have passed
- **AND** both trailers name the tree of the last staging, which is the tree the Igor publishes

#### Scenario: No staging happens while a model step runs

- **WHEN** a model step is running in the worker's tree
- **THEN** neither it nor the Igor stages until it has exited

#### Scenario: #189's second worker run is a run of its own

- **WHEN** #189 starts a second worker run after a check fails
- **THEN** the order of #153's steps, the extra bug-hunter iteration and the last staging the
  trailers bind apply to that run afresh, as they did to the first

#### Scenario: A hard link made after the first staging is caught before the next

- **WHEN** a model step after the first staging hard-links a file only the Igor can read into
  the tree
- **THEN** the checks before the next staging stop the run, naming the path
- **AND** the file's content reaches no blob in the git directory

### Requirement: A kill, a release and a sweep reach what the worker owns

Under `igor serve`, the Igor SHALL make the kill that *A kill reaches the worker's whole process
tree* requires each time it kills a worker, and also after model steps in a tree exit, before each
read or staging of the tree, after #189's checks, and before it releases the tree. Releasing a
tree, and the startup sweep, SHALL remove what the worker created. On a local host that kill is
by worker user, and releasing and the sweep SHALL act as the worker user where the Igor cannot
write.

#### Scenario: A killed worker's subprocess dies with it

- **WHEN** a worker running as the worker user is killed while a test it started is running
- **THEN** neither the worker nor the test outlives the kill

#### Scenario: A command still running after the last model step is killed before the read

- **WHEN** the last model step exits while a command it started in its own session is still
  running
- **THEN** the Igor kills that command before it reads the tree

#### Scenario: A tree with a directory only the worker can write is removed

- **WHEN** a worker leaves a directory in its tree with mode `0700`
- **THEN** releasing the tree removes it
- **AND** under `igor serve`, a tree left by a crash is removed by the startup sweep

#### Scenario: A command still running after the checks is killed before the release

- **WHEN** a check that runs as the worker user leaves a process running
- **THEN** the Igor kills it before it releases the tree

### Requirement: Under serve, a role's trees sit in its own directory of the state directory

Under `igor serve` on a local host, each tree, its outbox and `<tree>-git`, its git directory,
SHALL sit side by side in `/var/lib/igor/trees/<role>`, under the unit's `StateDirectory=igor`,
never in the unit's private `/tmp`. The tree and the outbox SHALL have the worker's group and mode
`2770`, and `<tree>-git` SHALL be read-only to the worker. Each process's startup sweep SHALL look
only in its own role's directory.

#### Scenario: Trees are in the role's directory

- **WHEN** `igor serve` provisions a tree for a worker
- **THEN** the tree, its outbox and its `<tree>-git` are under `/var/lib/igor/trees/<role>`
- **AND** none of them is under the unit's `/tmp`
- **AND** the tree and the outbox have the worker's group and mode `2770`, and the worker user
  cannot write `<tree>-git`

#### Scenario: A sweep leaves another role's trees alone

- **WHEN** the `igor serve` process of role `dev` starts on a host where role `docs` has trees
  under `/var/lib/igor/trees/docs`
- **THEN** its startup sweep removes nothing under `/var/lib/igor/trees/docs`

### Requirement: Isolation is proved before any work is taken

Before its first cycle, `igor serve` SHALL prove as the worker user that it can run `claude` but
cannot read a credential, write the Igor's code or configuration, or reach the metadata endpoint,
and has no root-equivalent right or credential file in its home. It SHALL check that this is a
separate user sudo starts without a password, that the Igor is in its group and not dumpable, that
sudo logs no allowed command, and that `fs.protected_hardlinks=1`. A failure SHALL refuse the
start, naming it.

#### Scenario: The worker user can read the App's key

- **WHEN** the worker user can read the file the Igor's private key is loaded from
- **THEN** the Igor refuses to start, naming that file

#### Scenario: The worker user is the Igor's own user

- **WHEN** the worker user the unit names is the user the Igor runs as, or root
- **THEN** the Igor refuses to start, saying a worker must run as a separate unprivileged user

#### Scenario: The worker user does not exist

- **WHEN** `igor serve` starts and `igor-worker-<role>` is no user on the host
- **THEN** the Igor refuses to start, naming the user

#### Scenario: The Igor is not in the worker's group

- **WHEN** the Igor's groups do not include the worker user's primary group
- **THEN** the Igor refuses to start, naming the group

#### Scenario: The worker user can read the Igor's environment or the canary

- **WHEN** the worker user can read the Igor's `/proc/<pid>/environ`, or a canary file the
  check created that only the Igor can read
- **THEN** the Igor refuses to start, naming that path

#### Scenario: The worker user can write the lore checkout

- **WHEN** the worker user can write the lore checkout
- **THEN** the Igor refuses to start, naming the lore checkout

#### Scenario: The worker user can write the Igor's installation or configuration worktree

- **WHEN** the worker user can write the directory holding the running `igor`, the `node` it
  runs on, or the lore worktree this process reads its configuration from (#208)
- **THEN** the Igor refuses to start, naming that path

#### Scenario: Hard links are not protected

- **WHEN** `igor serve` starts and `fs.protected_hardlinks` is not `1`
- **THEN** the Igor refuses to start, naming `fs.protected_hardlinks`

#### Scenario: A named credential path does not exist

- **WHEN** a path the check is given to probe does not exist, such as one
  `GITHUB_APP_PRIVATE_KEY_FILE` or `IGOR_ENV_FILES` names
- **THEN** the Igor refuses to start, naming that path, since a probe of a missing file proves
  nothing

#### Scenario: The worker user can read an environment file the unit names

- **WHEN** `IGOR_ENV_FILES`, the list of environment files the operator sets in the unit, names
  `/etc/igor/env` and the worker user can read it
- **THEN** the Igor refuses to start, naming `/etc/igor/env`

#### Scenario: An environment file the check cannot name is not checked

- **WHEN** the check has no path for a file it would probe, such as the environment files when
  `igor serve` starts with `IGOR_ENV_FILES` unset
- **THEN** the check reports that file as not checked
- **AND** it does not report them as passed

#### Scenario: The worker user can write a script the Igor runs

- **WHEN** the worker user can write a script under `skills_dir/skills/` that the Igor runs
- **THEN** the Igor refuses to start, naming that script

#### Scenario: The worker user can write the home template

- **WHEN** the worker user can write #174's home template (*Every model step in the worker's
  home starts from Igor's template*)
- **THEN** the Igor refuses to start, naming the template's path

#### Scenario: sudo logs the commands it allows

- **WHEN** `sudo -n -l` run as the service user does not list `!log_allowed`
- **THEN** the Igor refuses to start, naming `/etc/sudoers.d/igor` and the missing
  `Defaults:igor !log_allowed`

#### Scenario: The worker user can write skills_dir

- **WHEN** one try by the worker user to create and delete a file in `skills_dir` creates it
- **THEN** the Igor refuses to start, naming `skills_dir`
- **AND** the file the check created is deleted

#### Scenario: The worker user cannot run claude

- **WHEN** the worker user cannot execute the `claude` the Igor resolves
- **THEN** the Igor refuses to start, naming that path

#### Scenario: sudo asks for a password

- **WHEN** the Igor cannot start a process as the worker user without a password
- **THEN** the Igor refuses to start, naming the sudoers file to install

#### Scenario: The worker user can reach the cloud metadata endpoint

- **WHEN** an HTTP request the worker user makes to port 80 of `169.254.169.254` or
  `fd00:ec2::254`, directly or through the proxy it is given, gets an HTTP response
- **THEN** the Igor refuses to start, naming that address and, where the response came
  through the proxy, the variable that holds the proxy URL, never the URL

#### Scenario: A host with no metadata endpoint passes

- **WHEN** neither address gives an HTTP response within 2 seconds, whether the connection is
  refused, blocked, times out, or is accepted and then closed
- **THEN** that check passes

#### Scenario: The worker user is in a root-equivalent group

- **WHEN** the worker user's groups include `docker`, `lxd`, `incus` or `disk`
- **THEN** the Igor refuses to start, naming the group

#### Scenario: The worker user may sudo

- **WHEN** `sudo -n -l` run as the worker user lists a command
- **THEN** the Igor refuses to start, saying the worker user must hold no sudo rights

#### Scenario: The worker user can write a container socket

- **WHEN** one of `/run/docker.sock`, `/var/run/docker.sock`, `/run/podman/podman.sock` and
  `/run/containerd/containerd.sock` exists and the worker user can write it
- **THEN** the Igor refuses to start, naming the socket

#### Scenario: The worker user's home holds a credential file

- **WHEN** the worker user's home holds one of `~/.npmrc`, `~/.netrc`, `~/.git-credentials`,
  `~/.docker/config.json`, `~/.aws/credentials` and `~/.config/gh/hosts.yml`, whether the
  operator or an earlier worker put it there
- **THEN** the Igor refuses to start, naming the file

#### Scenario: A link to a credential file in the worker user's home refuses the start

- **WHEN** the worker user's home holds `~/.docker/config.json` as a symbolic link, even one
  whose target does not exist
- **THEN** the Igor refuses to start, naming `~/.docker/config.json`

#### Scenario: A host without Docker passes

- **WHEN** none of the four sockets exists, and none of the six credential files is in the
  worker user's home
- **THEN** those checks pass, and neither is refused as a missing path

#### Scenario: The Igor is still dumpable

- **WHEN** `igor serve` reaches the start check and its own process is still dumpable, or
  `fs.suid_dumpable` is not 0
- **THEN** the Igor refuses to start, saying a crash could write its memory to disk

#### Scenario: A refused start exits with status 78

- **WHEN** any check above refuses the start
- **THEN** the process exits with status 78 before its first cycle

### Requirement: A prompt reaches claude on stdin, never in its arguments

Every `claude -p` the Igor starts SHALL take its prompt on stdin, and no process's arguments SHALL
hold a prompt or system prompt. A system prompt, or text appended to one, SHALL reach
`claude` through `--system-prompt-file` or `--append-system-prompt-file`, in a file the process's
user can read and no worker user can write. The Igor SHALL remove that file once the process
exits, or, after a crash, when `igor serve` next starts. Under `igor serve` the unit SHALL set
`ProtectProc=invisible`.

#### Scenario: The worker's prompt is not on its command line

- **WHEN** the Igor starts a worker
- **THEN** the item's prompt reaches `claude` on stdin
- **AND** neither it nor the system prompt is in any process's arguments

#### Scenario: Triage's prompt is not on its command line

- **WHEN** the Igor starts a triage call
- **THEN** the prompt about the item being triaged reaches `claude` on stdin
- **AND** the system prompt reaches it through `--system-prompt-file`

#### Scenario: Every other call takes its prompt on stdin

- **WHEN** the Igor starts a later model step in the worker's tree, #143's seat probe (a minimal
  call that reads a seat no run has read) or #174's startup skills check
- **THEN** its prompt reaches `claude` on stdin, and no argument holds it

#### Scenario: Text appended to a system prompt goes through a file

- **WHEN** the Igor appends text to a `claude -p`'s system prompt
- **THEN** the text reaches `claude` through `--append-system-prompt-file`
- **AND** no argument holds it

#### Scenario: No worker user can write the system prompt file

- **WHEN** the Igor writes the system prompt file for a `claude -p`
- **THEN** no worker user can write that file or replace it

#### Scenario: The system prompt file is gone after the call

- **WHEN** a `claude -p` the Igor started exits
- **THEN** the file its system prompt was read from no longer exists

#### Scenario: A system prompt file a crash left is swept

- **WHEN** `igor serve` crashes while a `claude -p` it started is running, and starts again
- **THEN** it removes that call's system prompt file as it starts, whether it is in
  `<tree>-prompt` beside a tree or in the `0700` directory, readable only by the Igor, where it
  writes such files for its own processes

#### Scenario: A worker cannot see another user's processes

- **WHEN** a worker running as its worker user under the unit lists `/proc`
- **THEN** it sees no process of the Igor's user or of another worker user

### Requirement: serve always has a worker user, and run never does

`igor serve` SHALL run its worker only on a local host, and so always as its worker user, with no
way to run it as the Igor's own user. `igor run`, for development, SHALL always run the worker as
the Igor's own user and say so when it starts, naming what the worker can then use: the Igor's
credentials and whatever the person's own user can. Nothing else SHALL tell the Igor whether it
has a worker user. What `igor run` removes of an earlier run, it SHALL remove as its
own user, without `sudo`.

#### Scenario: serve has no same-user flag

- **WHEN** `igor serve --same-user` is run
- **THEN** it refuses the flag as unknown, and starts nothing

#### Scenario: run on a development machine

- **WHEN** `igor run` starts
- **THEN** it runs the worker as the same user, and its first line says workers run as its own
  user, can read its credentials, and can use whatever the person's own user can

#### Scenario: run removes its trees as its own user

- **WHEN** an `igor run` removes a tree of an earlier run, or the worker home or plugin directory
  #174 gives each run
- **THEN** it removes it as its own user and without `sudo`

#### Scenario: run ignores a worker user on the host

- **WHEN** `igor run` starts on a host where a user named `igor-worker-<role>` exists
- **THEN** it still runs the worker as the same user, and prints the same notice

### Requirement: A worker gets a secret only through the Igor, which registers it

Under `igor serve`, a secret SHALL reach the worker, a model step or a check only from the Igor.
Those secrets are the seat's token, a forwarded proxy URL's user info, which is all #189's checks
get, and any the server's own configuration declares. In both modes the Igor SHALL register each
secret it hands over with #217's `rememberSecret` first, SHALL fail the run rather than hand over
one shorter than 8 characters, and SHALL pass no agent socket variable.

#### Scenario: A secret is registered before the worker gets it

- **WHEN** the Igor hands a worker its seat's token, and the worker's output quotes the token
- **THEN** the token was registered with `rememberSecret` before the worker started
- **AND** credential redaction replaces it wherever #217's *Credential redaction replaces every
  credential the Igor knows* applies redaction to that output

#### Scenario: Under `igor run`, the worker can use its person's own credentials

- **WHEN** under `igor run` the person's home holds `~/.netrc`, and a test the worker wrote reads
  it
- **THEN** the test reads it, since the worker runs as the person's own user
- **AND** the Igor handed the worker no secret but the run's token, which it registered first

#### Scenario: A check gets no secret where no proxy URL holds one

- **WHEN** under `igor serve` the Igor runs a repository's check as the worker user, and no proxy
  URL in the Igor's environment holds user info
- **THEN** the check's environment holds no seat token and no other secret the Igor holds

#### Scenario: A check inherits the proxy's password

- **WHEN** under `igor serve` the Igor's environment sets `HTTPS_PROXY` to a URL holding a user
  and password, and the Igor runs a repository's check as the worker user
- **THEN** the check's environment holds that `HTTPS_PROXY`, user and password included
- **AND** the password was registered for redaction before the check started

#### Scenario: A secret too short to register is not handed over

- **WHEN** the chosen seat's token is shorter than 8 characters
- **THEN** no worker is started, and the run fails naming the seat's token source

#### Scenario: Claude Code's messaging token is outside the rule

- **WHEN** Claude Code sets `CLAUDE_CODE_MESSAGING_TOKEN` for the commands the worker runs
- **THEN** the Igor neither registers nor strips it, since the Igor never holds it

#### Scenario: No agent socket reaches the worker

- **WHEN** the Igor's own environment holds `SSH_AUTH_SOCK` or `GPG_AGENT_INFO`, under
  `igor serve` or `igor run`
- **THEN** no worker, model step or check the Igor starts has either in its environment

### Requirement: A proxy password too short to register refuses the start

Where a proxy URL the Igor would pass on from its own environment holds a password of 1 to 7
characters, counted after percent-decoding, `igor serve` and `igor run` SHALL refuse to start and
exit with status 78, naming each variable that holds such a URL, never the password or the URL. A
user name with no password, or with an empty one (`user:@host`), is registered bound to its host
(#217), so however short it is, it SHALL neither refuse the start nor fail a run.

#### Scenario: A short proxy password refuses the start

- **WHEN** `igor serve` starts with `HTTPS_PROXY` set to `http://alice:pw12@proxy.internal:3128`
- **THEN** it refuses to start and exits with status 78, naming `HTTPS_PROXY`
- **AND** the message holds neither `pw12` nor the URL

#### Scenario: igor run refuses a short proxy password too

- **WHEN** `igor run` starts with `HTTPS_PROXY` set to `http://alice:pw12@proxy.internal:3128`
- **THEN** it refuses to start and exits with status 78, naming `HTTPS_PROXY`
- **AND** the message holds neither `pw12` nor the URL

#### Scenario: A proxy user name with no password is registered with its host

- **WHEN** `igor serve` starts with `HTTPS_PROXY` set to `http://alice@proxy.internal:3128`, or
  to `http://alice:@proxy.internal:3128`
- **THEN** it starts, and the user name is registered for redaction with its host, as #217's rule
  says, and never as `alice` alone

### Requirement: Under serve, the worker user has no route to a credential the Igor did not hand it

Under `igor serve`, the worker SHALL reach neither the metadata endpoint, `169.254.169.254` or
`fd00:ec2::254`, nor a root-equivalent right, and the Igor SHALL put no credential in a tree's git
directory or remote URL. On a local host the unit SHALL block the endpoint with `IPAddressDeny=`,
the worker user SHALL be in none of `docker`, `lxd`, `incus` and `disk`, hold no sudo right and
write no container socket, and the deployment guide SHALL tell operators to keep credentials out
of its home.

#### Scenario: The metadata endpoint is out of the worker's reach

- **WHEN** under `igor serve` a test the worker wrote opens a connection to port 80 of
  `169.254.169.254`
- **THEN** the connection fails, and no reply reaches the test

#### Scenario: A tree's git directory holds no credential

- **WHEN** the Igor clones a repository and later fetches into the tree
- **THEN** neither `<tree>-git/config` nor any remote URL in it holds a credential
- **AND** each command that fetched got its token in its own environment

### Requirement: Which secret reaches which process is decided by the Igor and its server

Which secret the Igor hands to which process SHALL be decided only by the Igor's code and the
server's own configuration: the Igor's environment, which the unit loads, and the files outside
the lore checkout that it names. Lore, an item and anything a worker writes SHALL NOT decide it.
Lore MAY choose which seat a role spends and which repositories have checks, never which secret a
seat resolves to.

#### Scenario: Lore chooses a seat, not its secret

- **WHEN** #171's code is built, and a lore commit moves a role from seat `a` to seat `b`
- **THEN** the role's worker gets the token seat `b` resolves to, from `IGOR_SEAT_B` or from
  ciphertext naming `b`

#### Scenario: An item cannot route a secret

- **WHEN** an item's text asks for a variable of the Igor's environment to be given to the
  worker
- **THEN** the worker's environment is the one the Igor builds, unchanged by the item

#### Scenario: A worker's output cannot route a secret

- **WHEN** a worker leaves a file in its outbox or tree naming a variable of the Igor's
  environment
- **THEN** no later model step or check gets that variable

### Requirement: The gh and git children get an environment built from a list

Every `gh` and `git` process the Igor starts SHALL get an environment built from a list, never the
Igor's own: `PATH`, `HOME`, the network settings of the worker's environment, and what the call
needs. `gh` acting with a token of the Igor's SHALL get it as `GH_TOKEN`; a `gh` call as a
person's own login SHALL get that person's `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`, `GH_CONFIG_DIR`
and `XDG_CONFIG_HOME` where set. No other variable SHALL reach either.

#### Scenario: A gh child holds no seat token

- **WHEN** the Igor's environment holds `IGOR_SEAT_ADAM`, and the Igor runs `gh` with its App
  token
- **THEN** the `gh` process's environment holds `GH_TOKEN` and no `IGOR_SEAT_ADAM`

#### Scenario: A gh call as a person's login keeps that login

- **WHEN** the Igor runs `gh` as a person's own login, with `GH_CONFIG_DIR` set
- **THEN** the `gh` process gets `GH_CONFIG_DIR`, and no seat token

#### Scenario: A proxy still reaches gh and git

- **WHEN** the Igor's environment sets `HTTPS_PROXY`
- **THEN** every `gh` and `git` process the Igor starts gets it

### Requirement: A git child gets a token only when it reaches a remote

A `git` process the Igor starts SHALL get `GIT_SSL_CAINFO` and `GIT_SSL_CAPATH` where set, the
`GIT_CONFIG_NOSYSTEM` and `GIT_CONFIG_GLOBAL` that *Nothing the worker writes is executed by the
Igor* requires, and any `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` the call sets. Only a git
call that reaches a remote SHALL also get the `GIT_CONFIG_*` entries that set its credential
helper, the variable that helper reads the token from, and `GIT_TERMINAL_PROMPT=0`.

#### Scenario: A git child holds only its own token

- **WHEN** the Igor's environment holds `IGOR_SEAT_ADAM` and `GITHUB_APP_PRIVATE_KEY`, and the
  Igor fetches into a tree
- **THEN** the `git` process's environment holds its helper's token and neither of those
- **AND** no `GIT_CONFIG_*` entry an operator set in the Igor's environment

#### Scenario: A local git call gets no token

- **WHEN** the Igor runs `git status` in a tree
- **THEN** the `git` process's environment holds no token and no credential helper entry

### Requirement: The Igor's memory is never written out by a crash dump

Under `igor serve`, as the first thing it does, before reading any credential, the Igor SHALL make
its process not dumpable (`prctl(PR_SET_DUMPABLE, 0)`) and set its core-file limit to 0, and the
unit SHALL set `LimitCORE=0`. Where either call fails, or the start check finds it dumpable or
`fs.suid_dumpable` not 0, the start SHALL be refused with status 78. `igor run` SHALL make both
calls first where Igor ships native code for them (Linux on x64 and arm64), and start without them
elsewhere.

#### Scenario: The Igor under serve is not dumpable

- **WHEN** `igor serve` has passed its start check
- **THEN** `prctl(PR_GET_DUMPABLE)` in its process returns 0
- **AND** a crash of the process writes no core file

#### Scenario: A failed call refuses the start

- **WHEN** under `igor serve` the Igor cannot make itself not dumpable
- **THEN** it refuses to start, and exits with status 78

#### Scenario: igor run on Linux makes the call

- **WHEN** `igor run` starts on Linux on x64
- **THEN** `prctl(PR_GET_DUMPABLE)` in its process returns 0 before it reads any token

#### Scenario: igor run on macOS starts without the call

- **WHEN** `igor run` starts on macOS
- **THEN** it starts, without the call

### Requirement: A declaration is read only from the run's own outbox

A declaration SHALL be read only from the outbox: a directory outside the working tree that the
Igor makes for the run, that only the worker writes while it runs, and that the Igor removes with
the tree. It SHALL be empty when the worker starts, but for the declarations #189 writes back into
it for a second worker run and, under `igor serve`, the worker's index copy, which SHALL NOT be
read as a declaration; the worker's group, which holds the Igor, can read it.

#### Scenario: The index copy in the outbox is not a declaration

- **WHEN** `igor serve` starts a first worker run on a conflict-resolution item, with the index
  copy in its outbox
- **THEN** the index copy is the only file in the outbox when the worker starts
- **AND** the Igor reads no declaration from it

## MODIFIED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's

Execution SHALL build the worker's environment, never inherit the Igor's, from only the search
path, a home directory, the host's network settings, the chosen seat's token and, under
`igor serve`, `GIT_INDEX_FILE` naming the index copy in the outbox. Only that token and a proxy
URL's user info SHALL be credentials in it; other seats' tokens and the Igor's code-host and
tracker credential MUST NOT be in it or the tree. An unreadable token source SHALL fail the run,
naming it.

#### Scenario: The surface credential is absent

- **WHEN** a worker is spawned while the Igor holds a code-host token
- **THEN** that token is not in the worker's environment

#### Scenario: Nothing that yields an App token reaches the worker

- **WHEN** a worker is spawned for an Igor acting as a GitHub App
- **THEN** its environment holds no App token, no `GITHUB_APP_*` variable and no `GIT_CONFIG_*`
  entry
- **AND** its working tree's git config names no credential helper

#### Scenario: Only the chosen seat's token is present

- **WHEN** several seats are declared and one is chosen for an item
- **THEN** that seat's token is in the worker's environment
- **AND** no other seat's token is

#### Scenario: A seat whose token variable is unset fails loudly

- **WHEN** the chosen seat names a token variable that is not set
- **THEN** execution fails naming the variable
- **AND** no worker is spawned

#### Scenario: A seat whose file or command yields no token fails loudly

- **WHEN** the chosen seat names a file that cannot be read or is empty, or a command that
  fails, prints nothing, or is killed at its timeout
- **THEN** execution fails naming what was tried and why
- **AND** no worker is spawned

#### Scenario: A toolchain still runs

- **WHEN** a worker runs a build or a test in its working tree
- **THEN** the search path, home directory and network settings it needs are present

#### Scenario: A worker running as its own user is given its index copy

- **WHEN** `igor serve` spawns a worker as its worker user
- **THEN** `GIT_INDEX_FILE` in its environment names the index copy in its outbox

### Requirement: A kill reaches the worker's whole process tree

A kill SHALL end the worker and every process it started, and SHALL NOT fail where none is left.
The worker SHALL always run in its own process group, which a kill under `igor run` ends. Under
`igor serve` the kill SHALL end every process the worker user owns, first running
`sudo -n -u <worker user> true`; if that is refused, the kill SHALL be skipped, the run SHALL fail
before the tree or outbox is read or staged, and the refusal SHALL be recorded as a failed spawn
is (`stuck-conditions`).

#### Scenario: A refused check before a kill fails the run

- **WHEN** under `igor serve` a sudoers line is removed after the worker starts, and the Igor is
  about to kill the worker user's processes
- **THEN** its `sudo -n -u igor-worker-<role> true` is refused, and the run fails before the Igor
  reads or stages anything from the tree

#### Scenario: A refused check at process exit goes to standard error only

- **WHEN** under `igor serve` the process exits with a worker running, and the check before the
  kill is refused
- **THEN** the check ran synchronously, like the kill, and the refusal is written to standard
  error and recorded nowhere else

#### Scenario: A killed worker takes its subprocesses with it

- **WHEN** a worker with a subprocess running in its process group is killed for a limit
- **THEN** the subprocess does not outlive it

#### Scenario: A stopped run takes its subprocesses with it

- **WHEN** a worker with a subprocess running in its process group is killed because the run was
  stopped
- **THEN** the subprocess does not outlive it

#### Scenario: A worker that exited on its own

- **WHEN** cleanup kills a worker whose process group is already gone
- **THEN** no error is raised

#### Scenario: Under serve a command in its own session dies with the worker

- **WHEN** under `igor serve` a worker is killed while a command it started in a session of its
  own is running
- **THEN** that command does not outlive the kill

### Requirement: Igor forwards the termination it is sent

Where the process is asked to terminate, execution SHALL kill every worker it spawned and every
process each started: under `igor run` the worker's process group, and under `igor serve` on a
local host every process the worker user owns.
Where the process winds down gracefully instead, the worker in hand SHALL be left running and
SHALL be killed the same way when the process exits.

#### Scenario: An interrupted process takes the worker with it

- **WHEN** a process with no graceful shutdown is sent SIGINT or SIGTERM while a worker runs
- **THEN** the worker is killed before the process exits: its process group under `igor run`,
  and every process of the worker user under `igor serve` on a local host

#### Scenario: Winding down leaves the item in hand running

- **WHEN** a process that winds down gracefully is signalled while a worker runs
- **THEN** the worker keeps running, and the item is completed or handed off as it would be

#### Scenario: No worker outlives the process

- **WHEN** the process exits with a worker still running
- **THEN** that worker is killed: its process group under `igor run`, and every process of the
  worker user under `igor serve` on a local host

### Requirement: A base change is undone only where the resolution says so

Where resolving a conflict would publish a commit naming the base, the branch its pull request
targets, as a parent, and a path the base changed since the merge base would be restored to its
state before that change, the Igor SHALL publish nothing and hand the item off naming that path,
unless a declaration names the path and the base state it discards. A declaration SHALL name one
path and its base state, never a blanket form. No file the repository keeps SHALL be read as a
declaration.

#### Scenario: A rewrite the base made is restored without a declaration

- **WHEN** a resolution would publish, for a path the base rewrote, the content that stood there
  before the base rewrote it, and no declaration names that path
- **THEN** nothing is published
- **AND** the item is handed off naming that path

#### Scenario: A deletion the base made is undone without a declaration

- **WHEN** a resolution would publish a path the base deleted since the merge base, and no
  declaration names that path
- **THEN** nothing is published
- **AND** the item is handed off naming that path

#### Scenario: A declared revert is published and said out loud

- **WHEN** a resolution restores a path the base changed and carries a declaration naming that
  path and the base state it discards
- **THEN** the resolution is published
- **AND** the path and what it undoes are named on the resolution and recorded with the run

#### Scenario: A declaration covers the path it names and nothing else

- **WHEN** a resolution restores two paths the base changed and declares one of them
- **THEN** nothing is published
- **AND** the handoff names the undeclared path

#### Scenario: A declaration that does not match what the base holds authorizes nothing

- **WHEN** a declaration names a base state for a path that is not the state the base holds
- **THEN** the revert is treated as undeclared and the item is handed off

#### Scenario: A blanket declaration is not a declaration

- **WHEN** a resolution carries a declaration that names no specific path, or a role or a
  configuration file attempts to permit reverts generally
- **THEN** it authorizes nothing, and every revert is handed off as if undeclared

#### Scenario: A declaration for a path that is not reverted changes nothing

- **WHEN** a resolution carries a declaration naming a path the resolution does not restore
- **THEN** the declaration changes nothing, and the resolution is judged as if it were absent

#### Scenario: A resolution that keeps the base's work needs no declaration

- **WHEN** every path the base changed survives the resolution, whether taken whole or combined
  with the artifact's own change
- **THEN** the resolution is published and no handoff is posted

#### Scenario: Agreeing with the base is not a revert

- **WHEN** the base deleted a path and the resolution deletes it too
- **THEN** the resolution is published, because nothing was restored

#### Scenario: A declaration the repository commits is not this run's word

- **WHEN** the repository keeps a file of declarations in its own tree and no worker writes one
  for this run
- **THEN** the revert is treated as undeclared and the item is handed off

#### Scenario: A file the repository keeps is content, not a channel

- **WHEN** the tree holds a file of declarations at a path the repository tracks
- **THEN** it is carried into the artifact like any other file, and authorizes nothing

#### Scenario: The declaration does not reach the artifact

- **WHEN** a resolution is published
- **THEN** no declaration is part of the published commit

#### Scenario: The check runs before the commit, not after it

- **WHEN** a resolution is refused
- **THEN** no commit reaches the artifact's branch
- **AND** the refusal does not depend on anything the code host is asked afterwards

#### Scenario: A first artifact is unaffected

- **WHEN** an artifact is produced rather than resolved
- **THEN** no such comparison is made, because its commit names no base as a parent
