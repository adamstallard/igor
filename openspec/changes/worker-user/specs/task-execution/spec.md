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
too. Every other `claude -p` the Igor starts with the
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
`skills_dir` (#174), the Igor user's home directory, or the Igor's credential
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

Once #137 has archived its requirement *An artifact carries a changed path as the tree holds
it* into this spec, a changed path that is itself a link SHALL be published as a link, as that
requirement carries one. The Igor SHALL NOT follow the link to do so. Until then, a changed
link SHALL stop the run before anything is published, naming the path.

The Igor can read its own credentials and the worker cannot. A link the worker makes to the
App's key, read by the Igor and published as the content of a file, would publish the key in a
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
user cannot write. The Igor makes #153's trailers against that tree (*#153's trailers are created
once, by the Igor, against the tree it staged*). The worked repository's checks (#189), which run
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
`Bug-hunter-Tree:`, SHALL name the tree of the last staging, unless #153 binds them to the Git
Data API's tree instead (#153's design item 3), and the Igor SHALL publish the tree the trailers
name. Under `igor serve`, no trailer SHALL be bound to the worker's index copy or to any other
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
- **AND** under `igor serve`, a tree left by a crash is removed by the startup sweep

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
installation, #174's home template (*Every call in the worker's home starts from Igor's
template*), or any script the Igor runs from `skills_dir` (#174). It SHALL try once, as the
worker user, to create and delete a file in `skills_dir`; the worker never needs to write there.
It SHALL check that `fs.protected_hardlinks` is `1`.

A path the check is given to probe that does not exist SHALL refuse the start, naming it: a
probe of a missing file would pass, and proves nothing. A file the check has no path for, such
as an environment file where `IGOR_ENV_FILES` is unset, SHALL be reported as not checked, never
as passed. Any failure, a successful create among them, SHALL refuse the start, naming what
failed and the path or setting involved, and the process SHALL then exit with status 78, as
#82's (`stopped-scope-visible`) *A process that refuses to start exits with status 78*
requires.

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

#### Scenario: A refused start exits with status 78

- **WHEN** any check above refuses the start
- **THEN** the process exits with status 78 before its first cycle

### Requirement: A prompt reaches claude on stdin, never in its arguments

Every `claude -p` the Igor starts SHALL take its prompt on stdin: the worker, every later model
step in the worker's tree, triage, #143's seat probe (a minimal call that reads a seat no run
has read), the usage read and #174's startup skills check, which is a model call and not this spec's isolation check. No
prompt and no system prompt SHALL appear in any process's arguments. A system prompt, and text
appended to one, SHALL reach `claude` through a file, named by `--system-prompt-file` or
`--append-system-prompt-file`. The Igor writes that file where the
user the process runs as can read it and no worker user can write it, and removes it once that
process exits. When the Igor starts again after a crash, it SHALL remove every system prompt
file the crash left, beside a tree or in the directory only the Igor can read. Under `igor serve`, the systemd unit SHALL set `ProtectProc=invisible`.

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

- **WHEN** the Igor starts #143's seat probe, the usage read or #174's startup skills check
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

- **WHEN** the Igor crashes while a `claude -p` it started is running, and starts again
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
by age*). `igor run` SHALL remove only trees carrying its own run id, as the Igor's own user and
without `sudo`; it SHALL NOT remove a tree another run, another rank or another role left. Two
`igor run`s of one role can then run at once without either removing the other's tree.

`serve` takes work from issues anyone can file with nobody watching, and that is the case #163
is about. `run` is a person at a terminal, usually on their own machine with their own
credentials. The notice keeps the trade visible.

#### Scenario: serve has no same-user flag

- **WHEN** `igor serve --same-user` is run
- **THEN** it refuses the flag as unknown, and starts nothing

#### Scenario: run on a development machine

- **WHEN** `igor run` starts
- **THEN** it runs the worker as the same user, and its first line says workers run as its own
  user and can read its credentials

#### Scenario: run sweeps only its own trees

- **WHEN** an `igor run` for the role `generalist` releases its tree on a host that also holds a
  rank-0 tree carrying another run's id, and the tree `generalist-1-b2`
- **THEN** it removes its own tree, as its own user and without `sudo`
- **AND** it leaves the other run's tree and `generalist-1-b2`

#### Scenario: run ignores a worker user on the host

- **WHEN** `igor run` starts on a host where a user named `igor-worker-<role>-<rank>` exists
- **THEN** it still runs the worker as the same user, and prints the same notice

## MODIFIED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's

Execution SHALL construct the worker's environment rather than inheriting the Igor's, and that
environment SHALL carry no credential other than the token of the seat the work is charged to.
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
network settings the host is configured with. None of those is a credential, and a missing one
shows as a toolchain error, never as the worker authenticating as something else. Under
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
fail.

A kill that reaches only the worker leaves a build, a test run or a script writing to a working
tree that is about to be released and swept. The tool window exists because such a subprocess
may legitimately run long, so a kill lands while one is running by construction rather than by
chance. Claude Code starts each command a worker runs in a session of its own, outside the
worker's process group, so under `igor run` such a command can outlive the kill.

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
