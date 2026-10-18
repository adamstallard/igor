## ADDED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's token

Execution SHALL construct the worker's environment rather than inheriting the Igor's, and that
environment SHALL carry no credential other than the token of the seat the work is charged to. The
tokens of other seats, and the credential the Igor acts on its surfaces with (the code host and
tracker it claims, comments and publishes on), MUST NOT be present. Where the chosen seat names a
token source that cannot be read — a variable that is unset, a variable that is set but empty, or an
encrypted token that cannot be decrypted — execution SHALL fail naming the seat and the reason
rather than spawning a worker that authenticates as something else.

For an Igor acting as a GitHub App, the surface credential is anything that yields an App
token: the token itself, the `GITHUB_APP_*` variables, and a git credential helper or
`GIT_CONFIG_*` entry that mints one. None of them SHALL reach the worker, and the working tree
SHALL hold none of them.

The worker needs none of them. It edits files in a disposable tree; claiming, commenting,
branching and publishing all happen in the loop afterwards, with the loop's own credentials. An
inherited environment is therefore a set of credentials nothing in the worker has a use for,
one shell command away from a worker an item's text has steered.

Only what running a toolchain requires is passed: the search path, a home directory, and the network
settings the host is configured with. None of those is a credential, and a missing one shows as a
toolchain error, never as the worker authenticating as something else. Under `igor serve`,
where the worker runs as its worker user, `GIT_INDEX_FILE` is passed too, naming the index copy: the copy of git's index that #175
keeps in the worker's outbox, the directory beside its tree where the worker leaves files for
the Igor. It lets
`git rm` and `git mv` work without write access to the git directory. It is not a credential.

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

#### Scenario: A seat whose token variable is empty fails loudly

- **WHEN** the chosen seat names a token variable that is set but empty
- **THEN** execution fails naming the variable
- **AND** no worker is spawned

#### Scenario: A seat whose encrypted token cannot be decrypted fails loudly

- **WHEN** the chosen seat carries an encrypted token that the key `seatKey` names cannot decrypt,
  or no `seatKey` is declared
- **THEN** execution fails naming the seat and why
- **AND** no worker is spawned

#### Scenario: A toolchain still runs

- **WHEN** a worker runs a build or a test in its working tree
- **THEN** the search path, home directory and network settings it needs are present

#### Scenario: A worker running as its own user is given its index copy

- **WHEN** `igor serve` spawns a worker as its worker user
- **THEN** `GIT_INDEX_FILE` in its environment names the index copy in its outbox

## REMOVED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's

**Reason**: Its scenario *A seat whose file or command yields no token fails loudly* is false: a
seat file names no token file or command (*A seat file names its token only by ciphertext or its own
variable*). openspec will not archive a `MODIFIED` block that drops an in-force scenario. The
requirement is therefore removed and re-added under its full name: the in-force name stops at "its
seat's", and the new one ends "its seat's token". The re-added requirement is written over
worker-user's (#175) text, which is built first, and keeps its `GIT_INDEX_FILE` rule and scenario.
It has a scenario for a token that cannot be decrypted in place of the dropped one.

**Migration**: *The worker is given an explicit environment holding no credential but its seat's
token*, which keeps every other rule and scenario.
