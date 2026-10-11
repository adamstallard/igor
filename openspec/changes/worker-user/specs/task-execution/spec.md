## ADDED Requirements

### Requirement: The worker runs as a separate, unprivileged user

Where a worker user is configured, execution SHALL run the worker as that user, and every
process the worker starts SHALL run as that user too. The worker user SHALL be neither root nor
the user the Igor runs as. The worker SHALL NOT be able to read any credential the Igor holds:
the files its environment was loaded from, any private key or token file it reads, the private
key that decrypts seat files, and the Igor's own process environment.

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

### Requirement: The worker can write its tree and outbox and nothing the Igor depends on

The worker user SHALL be able to create, edit and remove files in its working tree, write its
outbox, and run the role's allowed commands, including `git rm` and `git mv`. It SHALL NOT be
able to write the tree's git directory, the lore checkout, the Igor's installation, the Igor
user's home directory, or the Igor's credential files. The Igor's records, the
`igor-state` branch with `executions.ndjson` among them, are written through the code host with
the Igor's own credential, which the worker cannot read.

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

### Requirement: Nothing the worker writes is executed by the Igor

The Igor SHALL run git in a worker's tree with hooks and the filesystem monitor turned off. It
SHALL NOT run any program that the worker could have written or named, as the Igor's user.

Git runs a hook, an fsmonitor command, or a filter that repository configuration names, as
whoever runs git. Where that is the Igor, a worker that could name one would be running code
as the Igor.

#### Scenario: A hook the worker left is not run

- **WHEN** a tree holds a hook or a `core.fsmonitor` setting that names a program
- **AND** the Igor reads the tree's changes after the worker exits
- **THEN** the program does not run

### Requirement: The Igor reads no file on the worker's behalf through a link

When the Igor reads what a worker changed, it SHALL NOT follow a symbolic link, and SHALL NOT
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
user, that it cannot read the Igor's process environment, any credential file the Igor's
configuration names, or a canary file the check creates that only the Igor can read, and cannot
write the lore checkout or the Igor's installation. Any failure SHALL refuse the start, naming
what failed and the path involved.

A worker user that can read the key protects nothing, and nothing else would notice. The process
that holds the credentials is the only one that knows where they are, so it checks.

#### Scenario: The worker user can read the App's key

- **WHEN** the worker user can read the file the Igor's private key is loaded from
- **THEN** the Igor refuses to start, naming that file

#### Scenario: The worker user is the Igor's own user

- **WHEN** the configured worker user is the user the Igor runs as, or root
- **THEN** the Igor refuses to start, saying a worker must run as a separate unprivileged user

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
