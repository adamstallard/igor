## ADDED Requirements

### Requirement: The worker runs as a separate, unprivileged user

A worker user is configured where `IGOR_WORKER_USER` in the Igor's environment names one. It
SHALL be read from nowhere else. Where a worker user is configured, execution SHALL run the
worker as that user, and every process the worker starts SHALL run as that user too. The worker user SHALL be neither root nor
the user the Igor runs as. The worker SHALL NOT be able to read any credential the Igor holds:
the files its environment was loaded from, any private key or token file it reads, the private
key that decrypts seat files, and the Igor's own process environment, which holds the App key
where it is given inline as `GITHUB_APP_PRIVATE_KEY`.

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

#### Scenario: The worker user is read from the environment only

- **WHEN** `igor.config.yaml` names a worker user and `IGOR_WORKER_USER` is unset
- **THEN** no worker user is configured

### Requirement: The worker can write its tree and outbox and nothing the Igor depends on

The worker's outbox is the directory beside its tree where it writes its declarations. The lore
checkout is the Igor's local clone of its lore repository. The Igor's installation is the
directory holding the running `igor` and the `node` executable it runs on.

The worker user SHALL be able to create, edit and remove files in its working tree, write its
outbox, and run the role's allowed commands, including `git rm` and `git mv`. It SHALL NOT be
able to write the tree's git directory, the lore checkout, the Igor's installation, the Igor
user's home directory, or the Igor's credential files. The Igor SHALL write its records, the
`igor-state` branch with `executions.ndjson` among them, only through the code host with its
own credential, never in a local file the worker could write.

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

### Requirement: Nothing the worker writes is executed by the Igor

The Igor SHALL run git in a worker's tree with hooks, the filesystem monitor and submodule
recursion turned off. It SHALL NOT run any program that the worker could have written or
named, as the Igor's user. A changed path that is a submodule entry or a nested repository
SHALL stop the run before anything is published, naming the path.

Git runs a hook, an fsmonitor command, or a filter that repository configuration names, as
whoever runs git. Where that is the Igor, a worker that could name one would be running code
as the Igor.

#### Scenario: A hook the worker left is not run

- **WHEN** a tree holds a hook or a `core.fsmonitor` setting that names a program
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the program does not run

#### Scenario: A nested repository's filter is not run

- **WHEN** a worker creates a nested repository in its tree whose own configuration defines a
  filter, and names that filter for a file
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the filter does not run
- **AND** the run stops naming the nested repository

### Requirement: The Igor reads no file on the worker's behalf through a link

When the Igor reads what a worker changed, it SHALL find the changed paths against its own
index, never an index the worker could write. It SHALL NOT follow a symbolic link, and SHALL NOT
read a path through a directory that is a link. A changed path that is a link, or lies beneath
one, SHALL stop the run before anything is published, naming the path. A changed file the Igor
cannot read SHALL stop the run the same way, rather than be left out of the artifact. The
worker's declaration file in the outbox SHALL be read only if it is a regular file.

The Igor can read its own credentials and the worker cannot. A link the worker makes to the
App's key, read by the Igor and published as the content of a file, would publish the key in a
pull request.

#### Scenario: A link to a credential is not published

- **WHEN** a worker creates `notes.txt` as a link to a file only the Igor can read
- **THEN** the run stops naming `notes.txt`
- **AND** the linked file's content is in no artifact, comment or record

#### Scenario: An index the worker edited hides nothing

- **WHEN** a worker modifies a file and marks it unchanged in the index copy it was given
- **THEN** the Igor still reads the file as changed
- **AND** the artifact carries the change

#### Scenario: A link in the outbox is not followed

- **WHEN** a worker makes its declaration file a link to another file
- **THEN** the Igor does not read the linked file
- **AND** the run stops, saying the declaration is not a regular file

#### Scenario: A file the worker made unreadable is not dropped

- **WHEN** a worker creates a file the Igor cannot read
- **THEN** the run stops naming the file
- **AND** no artifact is published without it

### Requirement: A kill, a release and a sweep reach what the worker owns

A kill SHALL reach every process in the worker's process group when the worker runs as another
user, as it does when the worker runs as the Igor. Releasing a tree, and the startup sweep, SHALL
remove what the worker created, including directories the Igor cannot write into.

The Igor cannot signal another user's processes or unlink entries in another user's directory,
so a kill or a removal that runs only as the Igor leaves both behind.

#### Scenario: A killed worker's subprocess dies with it

- **WHEN** a worker running as the worker user is killed while a test it started is running
- **THEN** neither the worker nor the test outlives the kill

#### Scenario: A tree with a directory only the worker can write is removed

- **WHEN** a worker leaves a directory in its tree with mode `0700`
- **THEN** releasing the tree removes it
- **AND** a tree left by a crash is removed by the startup sweep

### Requirement: Isolation is proved before any work is taken

Where a worker user is configured, `run` and `serve` SHALL check before the first cycle that the
user exists, is not root, is not the Igor's own user, and can be started without a password.
They SHALL check that the Igor belongs to the worker's group. And they SHALL check, as the worker
user, that it can execute the `claude` the Igor resolves; that it cannot read the Igor's process
environment, any credential file the Igor's configuration names, or a canary file the check
creates that only the Igor can read; and that it cannot write the lore checkout or the Igor's
installation. Any failure SHALL refuse the start, naming what failed and the path involved.

A worker user that can read the key protects nothing, and nothing else would notice. The process
that holds the credentials is the only one that knows where they are, so it checks.

#### Scenario: The worker user can read the App's key

- **WHEN** the worker user can read the file the Igor's private key is loaded from
- **THEN** the Igor refuses to start, naming that file

#### Scenario: The worker user is the Igor's own user

- **WHEN** the configured worker user is the user the Igor runs as, or root
- **THEN** the Igor refuses to start, saying a worker must run as a separate unprivileged user

#### Scenario: The worker user does not exist

- **WHEN** `IGOR_WORKER_USER` names no user on the host
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

#### Scenario: The worker user cannot run claude

- **WHEN** the worker user cannot execute the `claude` the Igor resolves
- **THEN** the Igor refuses to start, naming that path

#### Scenario: sudo asks for a password

- **WHEN** the Igor cannot start a process as the worker user without a password
- **THEN** the Igor refuses to start, naming the sudoers file to install

### Requirement: Without a worker user, an unattended Igor refuses to start

Where no worker user is configured, `serve` SHALL refuse to start unless the operator passes
`--same-user`, which runs the worker as the Igor's own user. `run` SHALL run the worker as the
Igor's own user without the flag. Whenever a worker runs as the Igor's own user, the Igor SHALL
say so when it starts, naming what the worker can then read.

`serve` takes work from issues anyone can file with nobody watching, and that is the case #163
is about. `run` is a person at a terminal, usually on their own machine with their own
credentials. The notice keeps the trade visible in both.

#### Scenario: serve with no worker user

- **WHEN** `igor serve` starts with no worker user configured and without `--same-user`
- **THEN** it refuses to start, naming `IGOR_WORKER_USER` and `--same-user`

#### Scenario: serve accepting the same user

- **WHEN** `igor serve --same-user` starts with no worker user configured
- **THEN** it runs, and its first line says workers run as its own user and can read its
  credentials

#### Scenario: run on a development machine

- **WHEN** `igor run` starts with no worker user configured
- **THEN** it runs the worker as the same user and prints the same notice

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
shows as a toolchain error, never as the worker authenticating as something else. Where a worker user is configured, `GIT_INDEX_FILE`
is passed too, naming the index copy in the worker's outbox, so that `git rm` and `git mv` work
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

- **WHEN** a worker is spawned as the configured worker user
- **THEN** `GIT_INDEX_FILE` in its environment names the index copy in its outbox
