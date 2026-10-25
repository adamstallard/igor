## ADDED Requirements

### Requirement: The worker runs as a separate, unprivileged user

The *service user* is the user the Igor runs as. The worker user of an Igor instance SHALL be `igor-worker-<role>-<rank>`: `igor-worker-`
followed by the instance name `<role>-<rank>` (#179), in which the rank is always written. The
systemd unit SHALL pass the instance name, `%i`, to `igor serve`, and the Igor SHALL sudo to
`igor-worker-` followed by that name as given: the worker user's name SHALL NOT depend on how
#179 splits the instance name into a role and a rank. A sibling rank that sweeps the trees a
gone rank of its role left SHALL build that rank's worker user the same way, as
`igor-worker-<role>-<rank>` from its own role and the number of the gone rank that #179's sweep
finds. The unit's `User=` and `Group=` SHALL name the service user and its group. The name SHALL NOT be read from `igor.config.yaml` or any other lore file. Under `igor serve`, execution
SHALL run the worker as that user, and every process the worker starts SHALL run as that user
too. Before each `sudo` that passes the worker user a secret, the Igor SHALL run
`sudo -n -u <worker user> true`, which passes none, and where that is refused SHALL fail the run
without the spawn, so that no refusal sudo logs holds the seat token or a proxy password. These
four `sudo` calls pass a secret: the worker's spawn, each later `claude -p` started in the
worker's tree, each of #189's checks, and the start check's probe of the metadata endpoint
through a proxy. The start check's probe runs before any run exists, so a refused check there
SHALL refuse the start with status 78 rather than fail a run, and nothing is recorded under the
instance's cure key. A failed spawn of the worker, and any other refused check, SHALL be recorded as
`stuck-conditions`' *A failed worker spawn is a condition on its instance* says. Every other `claude -p` the Igor starts with the
worker's tree as its working directory SHALL run as that user as well, such as #153's bug hunt
and prose pass. No prose or bug-hunter script SHALL run as that user: the Igor runs them as the
service user (*The Igor stages only after its checks, and #153's trailers bind the last staging*). No
argument of a command the Igor starts as the worker
user SHALL carry a prompt or text taken from the item. The worker user SHALL be neither root nor the service user. Under
`igor serve`, the worker SHALL NOT be able to read any credential the Igor holds: the files its environment was
loaded from, any private key or token file it reads, the private key that decrypts seat files,
and the Igor's own process environment, which holds the App key where it is given inline as
`GITHUB_APP_PRIVATE_KEY`.

The seat token the worker spends SHALL reach it only through the environment of the process
the Igor starts. It SHALL NOT appear in any process's arguments, and SHALL NOT be written to a
file.

Claude Code's permission checks cover its own tools and the commands it recognises, not the code
an allowed command runs. An allowed `npm test` runs a file the worker wrote. The operating
system's file permissions are the barrier that holds whatever the worker runs.

#### Scenario: Code an allowed command runs cannot read the Igor's credentials

- **WHEN** a worker writes a test that reads a file only the Igor's user can read, and runs it
  through an allowed test command
- **THEN** the read is refused
- **AND** the file's content appears nowhere in the run's output

#### Scenario: The Igor's environment is unreadable

- **WHEN** a worker reads the Igor process's environment through `/proc`
- **THEN** the read is refused

#### Scenario: A refused sudo logs no seat token

- **WHEN** a sudoers line the start check found was removed after the start, and `igor serve`
  is about to spawn a worker
- **THEN** its `sudo -n -u igor-worker-<role>-<rank> true`, which carries no secret, is refused,
  and the Igor fails the run without spawning, so no journal line holds the seat token
- **AND** where the refusal recurs, that instance takes no new item, while the role's other
  ranks go on, until the probe item #101's cooldown lets through spawns its worker successfully

#### Scenario: A check before one of #189's checks is refused

- **WHEN** a sudoers line is removed after the start, and the Igor is about to run one of #189's
  checks as the worker user
- **THEN** its `sudo -n -u igor-worker-<role>-<rank> true` is refused, the run fails without the
  check, and no journal line holds the proxy password

#### Scenario: The seat token is not on a command line

- **WHEN** a worker is started as the worker user
- **THEN** the seat token is in the worker's environment
- **AND** it is in no process's arguments
- **AND** the Igor writes it to no file
- **AND** under the sudoers file task 8.1 ships, no journal line `sudo` writes for that start
  holds it

#### Scenario: A model step after the worker runs as the worker user

- **WHEN** the Igor starts a `claude -p` in the worker's tree after the worker exits, such as a
  prose pass that runs the repository's tests
- **THEN** that process, and every process it starts, runs as the worker user

#### Scenario: The worker user's name comes from the instance

- **WHEN** the unit `igor@generalist-2` starts `igor serve generalist-2`
- **THEN** its worker runs as `igor-worker-generalist-2`
- **AND** the Igor itself runs as the service user the unit's `User=` names

#### Scenario: A role name holding a dash is not parsed

- **WHEN** the unit `igor@code-review-1` starts `igor serve code-review-1`
- **THEN** its worker runs as `igor-worker-code-review-1`

#### Scenario: A sibling sweeps a gone rank's trees as that rank's worker user

- **WHEN** rank 1 of the role `generalist` sweeps the trees of its gone rank 3
- **THEN** it removes them as `igor-worker-generalist-3`

#### Scenario: A lore file cannot name the worker user

- **WHEN** `igor.config.yaml` names a worker user
- **THEN** loading the configuration fails, as it does for any unknown key

### Requirement: The worker can write its tree and outbox and nothing the Igor depends on

The worker's outbox is the directory beside its tree where it writes its declarations. The lore
checkout is the Igor's local clone of its lore repository. The Igor's installation is the
directory holding the running `igor` and the `node` executable it runs on.

Under `igor serve`, the worker user SHALL be able to create, edit and remove files in its
working tree, write its outbox, and run the role's allowed commands, including `git rm` and
`git mv`. It SHALL NOT be able to write the tree's git directory, the lore checkout and every worktree of it an Igor
process reads its configuration from (#208, `lore-pull`), the Igor's installation,
`skills_dir` (#174's root-owned directory of pinned skills), the service user's home directory, or the Igor's credential
files. The Igor SHALL write its records, such as `executions.ndjson` on the `igor-state`
branch, only through the code host with its own credential, never in a local file the worker
could write.

A worker that can write a file the Igor later executes or trusts has the Igor's identity, and
then the separate user protects nothing.

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

The Igor SHALL run git in a worker's tree with hooks, the filesystem monitor and submodule
recursion turned off. Under `igor serve`, it SHALL NOT run any program that the worker could
have written or named, as the Igor's user. Under `igor run` the worker already runs as the
Igor's user and can write the tree's git configuration, so that rule holds only under `serve`;
the rest of this requirement holds in both modes. A changed path that holds a nested repository with working content
SHALL stop the run before anything is published, naming the path.

Every git command the Igor runs for a tree, its clone and checkout included, and every prose and
bug-hunter script it runs, SHALL run with `GIT_CONFIG_NOSYSTEM=1` and
`GIT_CONFIG_GLOBAL=/dev/null`, so that the only git configuration they read is the Igor's own
git directory's, which defines no filter. A git call that needs a committer identity, such as a
merge, SHALL be given the Igor's on its own command line. A repository that stores files through
a filter a configuration defines, such as Git LFS, is not supported until a later change defines
filters the Igor trusts: the Igor checks out such a file as what the repository stores, such as
an LFS pointer, and publishes it as that. Git's built-in conversions, which `.gitattributes`
turns on without any configuration, such as `eol`, `text` and `ident`, still apply.

Once #137 has archived its requirement *An artifact carries a changed path as the tree holds
it* into this spec, a changed submodule pointer (a gitlink) SHALL be published as the commit it
names, as that requirement carries one, and the Igor SHALL NOT enter the submodule's directory
or run git in it to do so. Until then, a changed gitlink SHALL stop the run before anything is
published, naming the path.

Git runs a hook, an fsmonitor command, or a filter that repository configuration names, as
whoever runs git. Where that is the Igor, a worker that could name one would be running code
as the Igor.

#### Scenario: A hook the worker left is not run

- **WHEN** a tree holds a hook or a `core.fsmonitor` setting that names a program
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the program does not run

#### Scenario: A filter the service user's configuration defines is not run

- **WHEN** the service user's global git configuration defines `filter.lfs`
- **AND** a worker's `.gitattributes` names that filter for a file it changed
- **THEN** the Igor's staging and status read run no filter
- **AND** the Igor publishes the file as the worker left it

#### Scenario: A nested repository's filter is not run

- **WHEN** a worker creates a nested repository in its tree whose own configuration defines a
  filter, and names that filter for a file
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the filter does not run
- **AND** the run stops naming the nested repository

#### Scenario: A moved submodule pointer is published as a pointer

- **WHEN** #137's requirement is archived into this spec
- **AND** a run's changes move a submodule's gitlink to another commit
- **THEN** the artifact carries the gitlink naming that commit
- **AND** the Igor runs no git command inside the submodule's directory

#### Scenario: A moved submodule pointer stops the run until pointers can be published

- **WHEN** #137's requirement is not yet archived into this spec
- **AND** a run's changes move a submodule's gitlink to another commit
- **THEN** the run stops naming the submodule's path

### Requirement: The Igor reads no file on the worker's behalf through a link

The Igor SHALL read what a worker changed only while no model step runs in its tree: after the
worker and every model step started since have exited and, under `igor serve`, after it has
killed every process the worker user owns (*A kill, a release and a sweep reach what the worker owns*). Under `igor serve`, it SHALL
find the changed paths against its own index, never an index the worker could write, such as
the *index copy*: the copy of the git directory's index the Igor puts in the worker's outbox for
`git rm` and `git mv`. Under `igor run` there is no worker user, and the Igor's index is the one the
worker writes. It SHALL NOT follow a symbolic
link, and SHALL NOT read a path through a directory that is a link. A changed path that lies
beneath a link SHALL stop the run before anything is published, naming the path. A changed file
the Igor cannot read stops the run under #120's *A path execution cannot read is never silently
omitted*. A changed file whose link count is above 1 SHALL stop the run the same way. Every path a refusal under this requirement or *Nothing the worker writes is executed by
the Igor* names SHALL be escaped for the markdown code span it is written in.

Every file the Igor reads from the worker's tree or outbox, the declaration file `reverts.json`
in the outbox included, SHALL be checked with `lstat` before it is opened, so that a FIFO or any other special file
found there is never opened. It SHALL be opened without following a symbolic link and without
blocking, and SHALL be read only if `fstat` on the opened file shows a regular file whose link
count is 1, so a file swapped after the `lstat` is caught too. Otherwise the run SHALL stop before anything
is published, naming the file. An error parsing a file read from the worker SHALL NOT quote the
file's content, in a refusal, a comment, a record or a log.

Where #137's requirement *An artifact carries a changed path as the tree holds it* is in this
spec, a changed path that is itself a link SHALL be published as a link, as that requirement
carries one. The Igor SHALL NOT follow the link to do so. Where it is not, a changed link SHALL
stop the run before anything is published, naming the path. Issue #204 archives #137 before
this change, so the first case is the one in force.

These rules cover every read of the worker's tree or outbox by the Igor, or by a process it runs
as its service user, not only the read of the changed paths: #187's (`scope-check`) reads for
its comparison of changed paths with the item, and the signing scripts #153
(`signed-publishing`) runs over the tree, prose's calls and bug-hunter's minting script, among
them. Each such read SHALL follow no link, and a file it reads SHALL pass the `lstat` and `fstat`
checks above.

The Igor can read its own credentials and the worker cannot. A link the worker makes to the
GitHub App's private key, read by the Igor and published as the content of a file, would publish the key in a
pull request. A hard link the worker made to a credential is a regular file inside the tree,
which the symbolic-link rules here do not catch.

#### Scenario: A link to a credential is published as a link

- **WHEN** #137's requirement is archived into this spec
- **AND** a worker creates `notes.txt` as a link to a file only the Igor can read
- **THEN** the artifact carries `notes.txt` as a link whose target is that file's path
- **AND** the linked file's content is in no artifact, comment or record

#### Scenario: A link stops the run until links can be published

- **WHEN** #137's requirement is not yet archived into this spec
- **AND** a worker creates `notes.txt` as a link to a file only the Igor can read
- **THEN** the run stops naming `notes.txt`
- **AND** the linked file's content is in no artifact, comment or record

#### Scenario: The signing scripts follow no link

- **WHEN** a worker replaces a file in its tree with a link to a file only the Igor can read, and
  a signing script of #153's reads that path
- **THEN** the read does not follow the link, and the run stops naming the path
- **AND** the linked file's content is in no artifact, comment, record or trailer

#### Scenario: A path beneath a linked directory stops the run

- **WHEN** a worker replaces a directory in its tree with a link, and a changed path lies
  beneath it
- **THEN** the run stops naming that path
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

#### Scenario: A path holding a backtick is escaped

- **WHEN** a run stops on a changed link named ``a`b``
- **THEN** the reason names the path in a code span that the backtick does not end

#### Scenario: A file the worker made unreadable is not dropped

- **WHEN** a worker creates a file the Igor cannot read
- **THEN** the run stops naming the file
- **AND** no artifact is published without it

### Requirement: The Igor publishes the tree it recorded before the checks

Once the Igor has read a worker's tree (*The Igor reads no file on the worker's behalf through a
link*), it SHALL record that tree as a tree object in its own git directory, which the worker
user cannot write. The Igor makes #153's trailers against that tree (*The Igor stages only after its checks,
and #153's trailers bind the last staging*). The worked repository's checks (#189), which run
as the worker user, SHALL run after that record. The Igor SHALL publish the recorded tree, or,
where #153's steps make trailers, the tree the trailers name. That recorded tree is how the Igor meets #189's rule
that what a check writes is not published (#189's *The loop runs the repository's checks in the
worker's tree*).

#### Scenario: A check cannot change the recorded tree

- **WHEN** a check running as the worker user rewrites a file the worker changed, and tries to
  write the Igor's git directory
- **THEN** the check starts only after the Igor has recorded the tree
- **AND** the write to the git directory fails
- **AND** the Igor publishes the tree object it recorded

### Requirement: The Igor stages only after its checks, and #153's trailers bind the last staging

The terms here are #153's (`signed-publishing`): prose's *first call* prints prose's rules and
a one-use *pass token*, which its *second call* needs to sign; bug-hunter's *minting script*
writes `Bug-hunter-Tree:`; its *triage* decides whether a diff gets a bug hunt. Each rule below
applies to one run of the model steps; #189's second worker run starts another. A *staging* is
the Igor's code adding the changed paths to the Igor's own index, which the worker user cannot
write.

Which of #153's model steps run, and in what order, is #153's (`signed-publishing`); where a
role runs both, bug-hunter SHALL run first and the prose pass after it. Each step edits the tree as it needs and SHALL run no prose or bug-hunter
signing script; bug-hunter SHALL end by reporting its `Bug-hunter:` value. Before the prose pass
starts, the Igor SHALL run prose's first call itself and give the rules and the pass token it
prints to the prose pass in its prompt. Bug-hunter's own triage SHALL then run on the prose
pass's diff before the cold read, on the model #153 pins: a diff it skips SHALL get no further
iteration, and any other diff SHALL get one more bug-hunter iteration. What the triage of the
answers to the cold read does is #153's.

The Igor MAY stage more than once in a run, such as before prose's first call and again after
the model steps that answer #153's cold read. Before every staging, every model step started so far SHALL have
exited, the Igor SHALL have killed every process the worker user owns (*A kill, a release and a
sweep reach what the worker owns*), and the link and hard-link checks of *The Igor reads no file
on the worker's behalf through a link*, and the nested-repository and submodule checks of
*Nothing the worker writes is executed by the Igor*, SHALL have passed. No model step SHALL stage, and nothing
SHALL stage while a model step runs. After the last staging, the Igor SHALL run prose's second
call, with the token, and bug-hunter's minting script, against the tree that staging holds. The
Igor SHALL run all three calls as the service user (prose's first call before the prose pass, and
its second call and bug-hunter's minting script after the last staging), with the scripts in
`skills_dir`, and with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` naming its own git
directory, the tree and its own index. Each trailer that binds a tree, `Prose:` and #153's
`Bug-hunter-Tree:`, SHALL name the tree of the last staging, and the Igor SHALL publish the
tree the trailers name. Under `igor serve`, no trailer SHALL be bound to the worker's index copy or to any other
copy the worker user could change.

The signing scripts come from `skills_dir`, which is root-owned, and the three variables keep
their git calls out of any `.git` the worker made in the tree, so running them as the service
user runs nothing the worker wrote. A staging reads every changed file into the git directory,
which the worker can read. Without the checks it could copy a key the worker hard-linked into
its tree, and without the kill a command still running could change a file after the checks
passed.

#### Scenario: Both trailers bind to the tree the Igor publishes

- **WHEN** bug-hunter and then the prose pass edit the tree
- **AND** the worker had marked a changed file unchanged in its index copy
- **THEN** every staging comes after the model steps started so far have exited
- **AND** the Igor runs prose's second call and bug-hunter's minting script against the last
  staged tree, which holds that file's change and both steps' edits
- **AND** both calls run as the service user, with the scripts in `skills_dir`
- **AND** that tree is the one the Igor publishes

#### Scenario: The Igor runs prose's first call

- **WHEN** the prose pass is about to start
- **THEN** the Igor runs prose's first call as the service user
- **AND** the prose pass's prompt holds the rules and the pass token that call printed
- **AND** no prose or bug-hunter script, `prose start` (the call that marks a session as having read prose's rules) included, runs as the worker user

#### Scenario: A .git the worker made does not reach the signing calls

- **WHEN** the worker replaces the tree's `.git` file with a `.git` directory holding a hook and
  a `core.fsmonitor` setting
- **THEN** the Igor's signing calls run neither
- **AND** they write no pass token into that directory

#### Scenario: A prose pass whose diff the triage skips needs no second hunt

- **WHEN** bug-hunter's triage skips the prose pass's diff, such as one that touches only comments
- **THEN** no further bug-hunter iteration runs

#### Scenario: A prose pass whose diff the triage does not skip gets one more hunt

- **WHEN** bug-hunter's triage does not skip the prose pass's diff, such as one that changes an
  error message
- **THEN** bug-hunter runs one more iteration before the Igor stages

#### Scenario: Every staging follows the kill and the checks

- **WHEN** the Igor stages before prose's first call, after the prose pass, and after the model
  steps that answer #153's cold read
- **THEN** before each staging every model step started so far has exited, every process the
  worker user owns has been killed, and the link and hard-link checks have passed
- **AND** both trailers name the tree of the last staging, which is the tree the Igor publishes

#### Scenario: A hard link made after the first staging is caught before the next

- **WHEN** a model step after the first staging hard-links a file only the Igor can read into
  the tree
- **THEN** the checks before the next staging stop the run, naming the path
- **AND** the file's content reaches no blob in the git directory

### Requirement: A kill, a release and a sweep reach what the worker owns

Under `igor serve`, a kill SHALL reach every process the worker user owns, whether or not it is
still in the worker's process group. The Igor SHALL make that kill whenever it kills a worker,
after model steps in a tree exit and before every read or staging of the tree, after the checks
that run as the worker user (#189), and before it releases the tree. Releasing a tree, and the startup
sweep, SHALL
remove what the worker created, including directories the Igor cannot write into. Under #179
(`concurrent-instances`), another rank of the same role sweeps the trees of a rank that #179
counts as gone. It SHALL run that removal as the gone rank's worker user, through
`sudo -n -u igor-worker-<role>-<k>`, where `<k>` is the gone rank.

#179 (`concurrent-instances`) places working trees in the unit's shared state directory. Under
`igor serve`, each tree's outbox and `<tree>-git`, the tree's git directory beside it, SHALL sit
beside the tree there, in `/var/lib/igor/trees`, never in the instance's private `/tmp`. The
tree and the outbox SHALL have the worker's group and mode `2770` there, and `<tree>-git` SHALL
be read-only to the worker.

The Igor cannot signal another user's processes or unlink entries in another user's directory,
so a kill or a removal that runs only as the Igor leaves both behind.

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
- **AND** under `igor serve`, a tree left by a crash is removed by the startup sweep, and under
  `igor run` by the start of the next `igor run` of the same role, once the crashed run's lock is
  free

#### Scenario: A command still running after the checks is killed before the release

- **WHEN** a check that runs as the worker user leaves a process running
- **THEN** the Igor kills it before it releases the tree

#### Scenario: Trees are in the shared state directory

- **WHEN** `igor serve` provisions a tree for a worker
- **THEN** the tree, its outbox and its `<tree>-git` are under `/var/lib/igor/trees`
- **AND** none of them is under the instance's `/tmp`
- **AND** the tree and the outbox have the worker's group and mode `2770`, and the worker user
  cannot write `<tree>-git`

### Requirement: Isolation is proved before any work is taken

`igor serve` SHALL check before the first cycle that its worker user exists, is not root, is not
the Igor's own user, and can be started without a password. It SHALL check that the Igor belongs
to the worker's group, and that `sudo -n -l` lists `!log_allowed` among the `Defaults` that apply
to the service user. And it SHALL check, as the worker user, that it can execute the `claude`
the Igor resolves; that it cannot read the Igor's process environment, any credential file the
Igor's configuration names, any environment file the unit names in `IGOR_ENV_FILES`, or a
canary file the check creates that only the Igor can read; and that it cannot write the lore
checkout, the worktree of it this process reads its configuration from (#208), the Igor's
installation, #174's home template (*Every model step in the worker's home starts from Igor's
template*), or any script the Igor runs from `skills_dir` (#174). It SHALL try once, as the
worker user, to create and delete a file in `skills_dir`; the worker never needs to write there.
It SHALL check that `fs.protected_hardlinks` is `1`.

It SHALL also check, as the worker user, what *A worker gets a secret only through the Igor,
which registers it* requires of the metadata endpoint and of root-equivalent groups and
sockets:

- that an HTTP request to port 80 of `169.254.169.254` and of `fd00:ec2::254` gets no HTTP
  response within 2 seconds, made directly and, where the worker is given a proxy, through it;
- that the worker user is in none of the groups `docker`, `lxd`, `incus` and `disk`, and that
  `sudo -n -l` run as it lists no command;
- that it cannot write `/run/docker.sock`, `/var/run/docker.sock`, `/run/podman/podman.sock` or
  `/run/containerd/containerd.sock`. A socket that does not exist passes, since a host without
  it is the safe case, unlike a path the check is given to probe (below).

And it SHALL check that the Igor's own process is not dumpable, and that `fs.suid_dumpable`
reads 0 (*The Igor's memory is never written out by a crash dump*).

A path the check is given to probe that does not exist SHALL refuse the start, naming it: a
probe of a missing file would pass, and proves nothing. A file the check has no path for, such
as an environment file where `IGOR_ENV_FILES`, the list of environment files the unit loads,
which the operator sets in the unit, is unset, SHALL be reported as not checked, never
as passed. Any failure, a successful create among them, SHALL refuse the start, naming what
failed and the path or setting involved, and the process SHALL then exit with status 78, as
#82's (`stopped-scope-visible`) *A process that refuses to start exits with status 78*
requires. Under the shipped compose file, whose `restart: unless-stopped` restarts every exit,
that same requirement has a process marked with `IGOR_REFUSAL_WAIT=1` wait before it exits 78,
longer with each refusal in a row, so compose retries a refused start more slowly each time.

A worker user that can read the key protects nothing, and nothing else would notice. The process
that holds the credentials is the only one that knows where they are, so it checks. systemd
reads the unit's environment files before the Igor starts, so the Igor learns their paths only
from the unit. Without `!log_allowed`, sudo writes the seat token it passes the worker to the
journal on every worker start.

#### Scenario: The worker user can read the App's key

- **WHEN** the worker user can read the file the Igor's private key is loaded from
- **THEN** the Igor refuses to start, naming that file

#### Scenario: The worker user is the Igor's own user

- **WHEN** the worker user the unit names is the user the Igor runs as, or root
- **THEN** the Igor refuses to start, saying a worker must run as a separate unprivileged user

#### Scenario: The worker user does not exist

- **WHEN** `igor serve` starts and `igor-worker-<role>-<rank>` is no user on the host
- **THEN** the Igor refuses to start, naming the user

#### Scenario: The Igor is not in the worker's group

- **WHEN** the Igor's groups do not include the worker user's primary group
- **THEN** the Igor refuses to start, naming the group

#### Scenario: The worker user can read the Igor's environment or the canary

- **WHEN** the worker user can read the Igor's `/proc/<pid>/environ`, or the canary file the
  check created
- **THEN** the Igor refuses to start, naming that path

#### Scenario: The worker user can write the lore checkout

- **WHEN** the worker user can write the lore checkout
- **THEN** the Igor refuses to start, naming the lore checkout

#### Scenario: The worker user can write the Igor's installation or configuration worktree

- **WHEN** the worker user can write the directory holding the running `igor`, the `node` it
  runs on, or the lore worktree this process reads its configuration from
- **THEN** the Igor refuses to start, naming that path

#### Scenario: Hard links are not protected

- **WHEN** `igor serve` starts and `fs.protected_hardlinks` is not `1`
- **THEN** the Igor refuses to start, naming `fs.protected_hardlinks`

#### Scenario: A named credential path does not exist

- **WHEN** `GITHUB_APP_PRIVATE_KEY_FILE` names a path that does not exist
- **THEN** the Igor refuses to start, naming that path

#### Scenario: The worker user can read an environment file the unit names

- **WHEN** `IGOR_ENV_FILES` names `/etc/igor/env` and the worker user can read it
- **THEN** the Igor refuses to start, naming `/etc/igor/env`

#### Scenario: An environment file the check cannot name is not checked

- **WHEN** `igor serve` starts with `IGOR_ENV_FILES` unset
- **THEN** the check reports the environment files as not checked
- **AND** it does not report them as passed

#### Scenario: The worker user can write a script the Igor runs

- **WHEN** the worker user can write a script under `skills_dir/skills/` that the Igor runs
- **THEN** the Igor refuses to start, naming that script

#### Scenario: The worker user can write the home template

- **WHEN** the worker user can write #174's home template
- **THEN** the Igor refuses to start, naming the template's path

#### Scenario: sudo logs the commands it allows

- **WHEN** `sudo -n -l` run as the service user does not list `!log_allowed`
- **THEN** the Igor refuses to start, naming `/etc/sudoers.d/igor` and the missing
  `Defaults:igor !log_allowed`

#### Scenario: The worker user can write skills_dir

- **WHEN** the worker user can create a file in `skills_dir`
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

- **WHEN** `/run/docker.sock` exists and the worker user can write it
- **THEN** the Igor refuses to start, naming the socket

#### Scenario: A host without Docker passes

- **WHEN** none of the four sockets exists
- **THEN** the socket check passes, and is not refused as a missing path

#### Scenario: The Igor is still dumpable

- **WHEN** `igor serve` reaches the start check and its own process is still dumpable, or
  `fs.suid_dumpable` is not 0
- **THEN** the Igor refuses to start, saying a crash could write its memory to disk

#### Scenario: A refused start exits with status 78

- **WHEN** any check above refuses the start
- **THEN** the process exits with status 78 before its first cycle

### Requirement: A prompt reaches claude on stdin, never in its arguments

Every `claude -p` the Igor starts SHALL take its prompt on stdin: the worker, every later model
step in the worker's tree, triage, #143's seat probe (a minimal call that reads a seat no run
has read) and #174's startup skills check, which is a model call and not this spec's start check. No
prompt and no system prompt SHALL appear in any process's arguments. A system prompt, and text
appended to one, SHALL reach `claude` through a file, named by `--system-prompt-file` or
`--append-system-prompt-file`. The Igor writes that file where the
user the process runs as can read it and no worker user can write it, and removes it once that
process exits. When `igor serve` starts again after a crash, it SHALL remove every system
prompt file the crash left: in `<tree>-prompt` beside a tree, or, for a process that runs as
the Igor, in the `0700` directory it writes such files in. Under `igor serve`, the systemd unit SHALL set `ProtectProc=invisible`.

On Linux every user can read every process's `/proc/<pid>/cmdline`, and `ps` prints it. A prompt
holds the item's text and the lore its scope allows, which can be private source content, so a
prompt in the arguments lets a worker of one instance read what another instance's worker or
triage was given. `ProtectProc=invisible` hides from a process every process of another user in
the unit; stdin keeps the prompt out of the arguments where that setting does not hold, such as
on a kernel without per-mount `hidepid`, and out of `sudo`'s log.

#### Scenario: The worker's prompt is not on its command line

- **WHEN** the Igor starts a worker
- **THEN** the item's prompt reaches `claude` on stdin
- **AND** neither it nor the system prompt is in any process's arguments

#### Scenario: Triage's prompt is not on its command line

- **WHEN** the Igor starts a triage call
- **THEN** the prompt about the item being triaged reaches `claude` on stdin
- **AND** the system prompt reaches it through `--system-prompt-file`

#### Scenario: Every other call takes its prompt on stdin

- **WHEN** the Igor starts #143's seat probe or #174's startup skills check
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
- **THEN** it removes that call's system prompt file as it starts

#### Scenario: A worker cannot see another user's processes

- **WHEN** a worker running as its worker user under the unit lists `/proc`
- **THEN** it sees no process of the Igor's user or of another worker user

### Requirement: serve always has a worker user, and run never does

`igor serve` SHALL always run its worker as its worker user, and SHALL offer no way to run it as
the Igor's own user. `igor run`, the one-shot command for development, SHALL always run the
worker as the Igor's own user, and SHALL say so when it starts, naming what the worker can then
read. Nothing else SHALL tell the Igor whether it has a worker user. Under #179 `igor run` is
rank 0, and each run's trees carry its own run id (#179's *The sweep removes trees by rank, never
by age*). That requirement says what `igor run` removes, and when: the trees, the home #174
gives each run as its worker's `HOME`, and the plugin directory #174 assembles for each run, of
an earlier run of its role whose process is gone. It also defines the lock file each run holds,
which a later run can take only once that run's process is gone. `igor run` SHALL remove each
of these as the Igor's own user and without `sudo`. Trees and their lock files sit in
`<state dir>/trees`, where `<state dir>` is the state directory #216 (`lore-search`) defines.

The notice SHALL also say that the worker can use whatever the person's own user can, since
nothing keeps it from their SSH agent, their Docker or credentials in their home (*A worker gets
a secret only through the Igor, which registers it*).

`serve` takes work from issues anyone can file with nobody watching, and that is the case #163
is about. `run` is a person at a terminal, usually on their own machine with their own
credentials. The notice keeps the trade visible.

#### Scenario: serve has no same-user flag

- **WHEN** `igor serve --same-user` is run
- **THEN** it refuses the flag as unknown, and starts nothing

#### Scenario: run on a development machine

- **WHEN** `igor run` starts
- **THEN** it runs the worker as the same user, and its first line says workers run as its own
  user, can read its credentials, and can use whatever the person's own user can

#### Scenario: run removes its trees as its own user

- **WHEN** an `igor run` removes a tree, a worker home or a plugin directory of an earlier run
  that #179's sweep has it remove
- **THEN** it removes it as its own user and without `sudo`

#### Scenario: run ignores a worker user on the host

- **WHEN** `igor run` starts on a host where a user named `igor-worker-<role>-<rank>` exists
- **THEN** it still runs the worker as the same user, and prints the same notice

### Requirement: A worker gets a secret only through the Igor, which registers it

Under `igor serve`, a secret SHALL reach a process running as the worker user only from the
Igor. In both modes, the Igor SHALL register every secret it hands a worker, a model step or a
check with credential redaction, by calling `rememberSecret` (#217's *Credential redaction
replaces every credential the Igor knows*), before it hands the secret over. Under `igor serve`
the secrets it hands over are the seat's token, which the worker and every later model step
get, and the user info, the `user:password@` part, of a proxy URL the Igor passes on from its
own environment, which the worker, every later model step and every check get with the proxy
settings.
The repository's checks, which #189 runs as the worker user, SHALL get no secret except the
user info of a proxy URL in the network settings the worker is given, which a check inherits
with them; the Igor registers that user info as #217 says. A later change
that hands a worker user another secret SHALL declare it in the server's own configuration, never
in lore, and register it the same way. In both modes, the Igor SHALL NOT hand over a secret shorter than 8 characters,
which `rememberSecret` does not register; it SHALL fail the run instead, naming the secret's
source. A proxy URL's user name with no password is registered with the rest of the user info,
but bound to its host, as `<user>@<host>`, which is how #217 registers it, and so is not a
secret this 8-character rule applies to.

A proxy URL's password is the exception to failing the run. Where a proxy URL the Igor would pass
on from its own environment holds a password of 1 to 7 characters, counted after
percent-decoding, `igor serve` and `igor run` SHALL refuse to start and exit with status 78. #82's
*A process that refuses to start exits with status 78* sets that status for `igor serve`, and
this requirement sets it for `igor run` too. The message SHALL name each variable that holds such
a URL, and never the password or the URL. A proxy URL that holds a user name and no password, or
an empty one (`user:@host`), is not refused, however short the name, because #217 registers that
name joined to its host and never alone.

No other secret SHALL reach the worker user from the Igor. `CLAUDE_CODE_MESSAGING_TOKEN`, which
Claude Code itself sets for the commands the worker runs, is outside this rule: the Igor never
holds it. Under `igor serve`:

- The worker user SHALL NOT be able to reach the cloud metadata endpoint, `169.254.169.254` or
  `fd00:ec2::254`. Where `igor serve` runs under the systemd unit, the unit SHALL set
  `IPAddressDeny=169.254.169.254 fd00:ec2::254`.
- The worker user SHALL be in none of the groups `docker`, `lxd`, `incus` and `disk`, SHALL hold
  no sudo rights, and SHALL NOT be able to write a container engine's socket.
- The Igor SHALL NOT store a credential in a tree's git directory, in its configuration or in a
  remote URL. A git command that authenticates SHALL be given its credential for that one
  command, in its environment.

In both modes, no variable that names an agent's socket, such as `SSH_AUTH_SOCK` or
`GPG_AGENT_INFO`, SHALL be passed to a worker, a model step or a check.

The start check proves the metadata and the groups, sudo and sockets bullets (*Isolation is
proved before any work is taken*). The deployment guide SHALL tell the operator to put no
credential in the worker user's home, such as a registry token in `~/.npmrc`; a credential a
worker needs is declared in the server's own configuration, and the Igor hands it over. Nothing
the Igor runs checks the home.

Under `igor run` the worker runs as the person's own user, so it can use whatever that user
can: their SSH agent, their Docker, the metadata endpoint, and any credential in their home or
their git configuration. The Igor passes it none of them, but nothing it does keeps the worker
from finding them, so this requirement's rule that a secret reaches the worker only from the Igor
does not bind `igor run`. That is `igor run`'s limit, and its notice says so (*serve always has a
worker user, and run never does*).

This change relies on a limit of #217's credential redaction: it matches a secret by its value
only for the values the Igor registered, so a secret that reaches the worker by another route is
stored as it stands, unless it has one of the token shapes #217 matches. A check runs code
the worker has just written, so a secret given to a check is given to that code. The metadata
endpoint hands the host's cloud credentials to any process that reaches it. Each of the groups and sockets the second bullet above names lets its holder start a
container or read a disk as root. And a credential in a tree's git directory would be one the worker could read, since
the worker user can read that directory.

#### Scenario: A secret is registered before the worker gets it

- **WHEN** the Igor hands a worker its seat's token, and the worker's output quotes the token
- **THEN** the token was registered with `rememberSecret` before the worker started
- **AND** credential redaction replaces it wherever #217 applies redaction to that output

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

#### Scenario: A secret too short to register is not handed over

- **WHEN** the chosen seat's token is shorter than 8 characters
- **THEN** no worker is started, and the run fails naming the seat's token source

#### Scenario: The metadata endpoint is out of the worker's reach

- **WHEN** under `igor serve` a test the worker wrote opens a connection to port 80 of
  `169.254.169.254`
- **THEN** the connection fails, and no reply reaches the test

#### Scenario: No agent socket reaches the worker

- **WHEN** the Igor's own environment holds `SSH_AUTH_SOCK`, under `igor serve` or `igor run`
- **THEN** no worker, model step or check the Igor starts has `SSH_AUTH_SOCK` in its environment

#### Scenario: A tree's git directory holds no credential

- **WHEN** the Igor clones a repository and later fetches into the tree
- **THEN** neither `<tree>-git/config` nor any remote URL in it holds a credential
- **AND** each command that fetched got its token in its own environment

### Requirement: Which secret reaches which process is decided by the Igor and its server

Which secret the Igor hands to which process SHALL be decided only by the Igor's code and the
server's own configuration: the Igor's environment, which the unit loads, and the files outside
the lore checkout that it names. Lore, an item and anything a worker writes SHALL NOT decide it.
Lore MAY choose which seat a role spends and which repositories have checks. It SHALL NOT choose
which secret a seat resolves to.

For seats, #171's *A seat file names its token only by ciphertext or its own variable* and *A
seat's token travels as ciphertext in its file* make this hold. A check gets no secret except a
proxy URL's user info, which comes with the server's own proxy settings, so no secret reaches a
check that lore could route.

A lore commit or an item is not the server's operator. Where lore could name the variable or the
file a secret is read from, one commit could hand the worker the App's key as its seat token.

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

Every `gh` and `git` process the Igor starts SHALL get an environment built from a list, as the
worker's is, never the Igor's own. The list is `PATH`, `HOME`, the network settings the worker's
environment carries (*The worker is given an explicit environment holding no credential but its
seat's*), and what each call needs:

- `gh` acting with a token of the Igor's gets that token as `GH_TOKEN`. A `gh` call made as a
  person's own login, holding no token of the Igor's, gets that person's `GH_TOKEN`,
  `GITHUB_TOKEN`, `GH_HOST`, `GH_CONFIG_DIR` and `XDG_CONFIG_HOME`, each where the Igor's
  environment sets it.
- `git` gets `GIT_SSL_CAINFO` and `GIT_SSL_CAPATH` where set. A git call that reaches a remote
  also gets the `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>` entries that
  set its credential helper, the variable that helper reads the token from, and
  `GIT_TERMINAL_PROMPT=0`. A git call that reaches no remote gets no token. Every git call also
  gets the variables *Nothing the worker writes is executed by the Igor* requires, and the
  `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` the call sets.

No other variable of the Igor's environment SHALL reach either, so neither gets a seat token, an
App variable, or a `GIT_CONFIG_*` entry an operator set.

`/etc/igor/env` loads every seat token into the Igor's environment, so a child that inherits that
environment holds them all, though it needs none of them.

#### Scenario: A gh child holds no seat token

- **WHEN** the Igor's environment holds `IGOR_SEAT_ADAM`, and the Igor runs `gh` with its App
  token
- **THEN** the `gh` process's environment holds `GH_TOKEN` and no `IGOR_SEAT_ADAM`

#### Scenario: A gh call as a person's login keeps that login

- **WHEN** the Igor runs `gh` as a person's own login, with `GH_CONFIG_DIR` set
- **THEN** the `gh` process gets `GH_CONFIG_DIR`, and no seat token

#### Scenario: A git child holds only its own token

- **WHEN** the Igor's environment holds `IGOR_SEAT_ADAM` and `GITHUB_APP_PRIVATE_KEY`, and the
  Igor fetches into a tree
- **THEN** the `git` process's environment holds its helper's token and neither of those

#### Scenario: A local git call gets no token

- **WHEN** the Igor runs `git status` in a tree
- **THEN** the `git` process's environment holds no token and no credential helper entry

#### Scenario: A proxy still reaches gh and git

- **WHEN** the Igor's environment sets `HTTPS_PROXY`
- **THEN** every `gh` and `git` process the Igor starts gets it

### Requirement: The Igor's memory is never written out by a crash dump

The Igor's memory holds every secret it has registered with `rememberSecret`, the App's key and
the seat tokens. Under `igor serve`, the Igor SHALL mark its own process not dumpable, with
`prctl(PR_SET_DUMPABLE, 0)`, and set its own core-file limit to 0, as the first thing it does,
before it reads any credential file or token source. Where `igor serve` runs under the systemd
unit, the unit SHALL also set `LimitCORE=0`. Where a call fails, the process is still dumpable at
the start check, or `fs.suid_dumpable` is not 0, the Igor SHALL refuse the start with status 78
(*Isolation is proved before any work is taken*). Under `igor run` the Igor SHALL make both calls
where Igor ships the native code that makes them, Linux on x64 and arm64; elsewhere, such as
macOS, `igor run` SHALL start without them. Under `igor run`, too, the calls come first,
before any credential file or token source is read.

A crash dump writes a process's whole memory to disk, where root, and often the process's own
user, can read it. A process that is not dumpable writes no core file while `fs.suid_dumpable`
is 0, and no other process of its user can attach to it with `ptrace` or read its memory. The
flag covers only the Igor's own process: a program the Igor starts does not inherit it.

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

## MODIFIED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's

Execution SHALL construct the worker's environment rather than inheriting the Igor's, and that
environment SHALL carry no credential other than the token of the seat the work is charged to
and, where a proxy URL in the host's network settings holds user info, that user info (below).
The tokens of other seats, and the credential the Igor acts on its surfaces with (the code host
and tracker it claims, comments and publishes on), MUST NOT be present. Where the chosen seat names a token source that cannot be read — an unset variable, an
unreadable or empty file, a command that fails, prints nothing, or never returns — execution
SHALL fail naming it rather than spawning a worker that authenticates as something else.

For an Igor acting as a GitHub App, the surface credential is anything that yields an App
token: the token itself, the `GITHUB_APP_*` variables, and a git credential helper or
`GIT_CONFIG_*` entry that mints one. None of them SHALL reach the worker, and the working tree
SHALL hold none of them.

The worker needs none of them. It edits files in a disposable tree; claiming, commenting,
branching and publishing all happen in the loop afterwards, with the loop's own credentials. An
inherited environment is therefore a set of credentials nothing in the worker has a use for,
one shell command away from a worker an item's text has steered.

Only what running a toolchain requires is passed: the search path, a home directory, and the
network settings the host is configured with. A missing one shows as a toolchain error, never
as the worker authenticating as something else. The search path and the home directory hold no
credential. A network setting can: a proxy URL's user info, which the Igor registers as *A
worker gets a secret only through the Igor, which registers it* says. Under
`igor serve`, where the worker runs as its worker user, `GIT_INDEX_FILE` is passed too, naming the index copy in the worker's outbox, so that `git rm` and `git mv` work
without write access to the git directory. It is not a credential.

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

Execution SHALL run the worker in its own process group. Under `igor run` it SHALL kill that
group, so that the subprocesses the worker spawned in that group die with it. Under `igor serve`
it SHALL instead kill every process the worker user owns (*A kill, a release and a sweep reach
what the worker owns*). A group or a worker user with no process left SHALL NOT make cleanup
fail. Under `igor serve` the kill SHALL first run `sudo -n -u <worker user> true` (proposal,
decision 53). A refused check SHALL fail the run before the Igor reads or stages anything from
the worker's tree or outbox, SHALL skip the kill, which the same sudoers line would refuse, and
SHALL be recorded as `stuck-conditions`' *A failed worker spawn is a condition on its instance*
says. At process exit the check SHALL run synchronously, like the kill, and a refusal there SHALL
be written to standard error only. An `exit` handler cannot wait, and at exit no run is left to
fail.

A kill that reaches only the worker leaves a build, a test run or a script writing to a working
tree that is about to be released and swept. The tool window exists because such a subprocess
may legitimately run long, so a kill lands while one is running by construction rather than by
chance. Claude Code starts each command a worker runs in a session of its own, outside the
worker's process group, so under `igor run` such a command can outlive the kill.

#### Scenario: A refused check before a kill fails the run

- **WHEN** under `igor serve` a sudoers line is removed after the worker starts, and the Igor is
  about to kill the worker user's processes
- **THEN** its `sudo -n -u igor-worker-<role>-<rank> true` is refused, and the run fails before
  the Igor reads or stages anything from the tree

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

Where the process is asked to terminate, execution SHALL kill every worker it spawned: under
`igor run` the worker's process group, and under `igor serve` every process the worker user owns.
Where the process winds down gracefully instead, the worker in hand SHALL be left running and
SHALL be killed the same way when the process exits.

A worker in its own group is outside the group a terminal signals, so nothing else will reach
it: detaching it obliges Igor to pass on what it is told. Forwarding on the signal itself would
end the item in hand, which shutdown is required to finish or hand off.

#### Scenario: An interrupted process takes the worker with it

- **WHEN** a process with no graceful shutdown is sent SIGINT or SIGTERM while a worker runs
- **THEN** the worker is killed before the process exits: its process group under `igor run`,
  and every process of the worker user under `igor serve`

#### Scenario: Winding down leaves the item in hand running

- **WHEN** a process that winds down gracefully is signalled while a worker runs
- **THEN** the worker keeps running, and the item is completed or handed off as it would be

#### Scenario: No worker outlives the process

- **WHEN** the process exits with a worker still running
- **THEN** that worker is killed: its process group under `igor run`, and every process of the
  worker user under `igor serve`

### Requirement: A base change is undone only where the resolution says so

Where resolving a conflict would publish a commit that names the base as a parent, the Igor
SHALL compare what the base changed since the merge base against what the resolution publishes,
and SHALL NOT publish it where any path would be restored to the state it held before the base
changed it — unless the resolution carries a declaration naming that path. Where an undeclared
path would be restored, nothing is published and the item is handed off naming those paths.

The commit's tree is the merge result, so a path the resolution leaves at the artifact's own
version is not a gap in the resolution — it is a revert of the base's change to that path, which
lands the moment the artifact merges. A reverted deletion appears in review as the file still
being there and a reverted rewrite as the file being unchanged, so review cannot be relied on to
catch either.

The comparison reads outcomes, not intentions. A resolution that takes the base's side, combines
both sides, or honours a deletion the base made restores nothing and needs no declaration. What
is refused undeclared is the exact undo: the base changed a path and the published content is
what stood there before it did.

**A declaration names one path and the base state it discards** — the base's content for that
path, or its absence where the base deleted it. It SHALL NOT take a blanket form: no wildcard,
no flag covering a whole resolution, nothing a role or a configuration file can set once. A
declaration whose named state is not what the base actually holds authorizes nothing, and a
declaration naming a path that would not be reverted changes nothing.

**A declared revert is still reported, wherever the refusal would have been.** Publishing it
does not make it quiet: the paths undone and the base state each one discards are named on the
published resolution and recorded with the run. The guard exists because an undone base change
is invisible to review, and a declaration converts that into a statement rather than an
exemption from it.

**A declaration is this run's word, and the place it is written is what says so.** It SHALL be
written outside the artifact's working tree, into a directory the Igor makes for the run, which no
one but the worker writes while it runs, and which the Igor removes with the tree. That directory SHALL be empty when the
worker starts, with two exceptions: for a second worker run, it holds the declarations #189
writes back into it; and under `igor serve` it holds the index copy, the copy of the git
directory's index the Igor puts there for the worker's `git rm` and `git mv`. Under `igor
serve` the worker's group, which the Igor belongs to, can read the directory. The index copy SHALL NOT be read as a
declaration. A file the repository itself keeps SHALL NOT
be read as a declaration, at any path and however it got there: a repository can commit a file at
any path inside itself, and one that is on disk in every fresh clone would authorize the same
revert on every run that ever clones it, each reporting a declaration nobody made.

No path inside the tree is reserved. A file the repository keeps at whatever path the channel
once used is ordinary content, carried into the artifact like any other.

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

- **WHEN** a resolution carries a declaration that names no specific path, or a configuration
  attempts to permit reverts generally
- **THEN** it authorizes nothing, and every revert is handed off as if undeclared

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

#### Scenario: The index copy in the outbox is not a declaration

- **WHEN** `igor serve` starts a first worker run on a resolution, with the index copy in its
  outbox
- **THEN** the index copy is the only file in the outbox when the worker starts
- **AND** the Igor reads no declaration from it
