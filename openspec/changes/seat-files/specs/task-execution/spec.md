## ADDED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's token

Execution SHALL build the worker's environment, not inherit the Igor's, carrying no credential but the token of the seat the work is charged to and, where a host proxy URL
holds user info, that user info. Other seats' tokens and the Igor's surface credential MUST NOT be
present. Where the chosen seat's token variable (`token_env` or `IGOR_RUN_TOKEN`) is unset or empty, it SHALL fail naming the seat and why, spawning no worker. Only what running a toolchain requires SHALL be passed
besides.

#### Scenario: The surface credential is absent

- **WHEN** a worker is spawned while the Igor holds a code-host token
- **THEN** that token is not in the worker's environment

#### Scenario: No credential for any surface the Igor acts on reaches the worker

- **WHEN** a worker is spawned while the Igor holds credentials for the code host and tracker it
  claims, comments and publishes on
- **THEN** none of them is in the worker's environment

#### Scenario: Nothing that yields an App token reaches the worker

- **WHEN** a worker is spawned for an Igor acting as a GitHub App
- **THEN** its environment holds no App token, no `GITHUB_APP_*` variable and no `GIT_CONFIG_*`
  entry
- **AND** its working tree holds none of them, and its git config names no credential helper

#### Scenario: Only the chosen seat's token is present

- **WHEN** several seats are declared and one is chosen for an item
- **THEN** that seat's token is in the worker's environment
- **AND** no other seat's token is

#### Scenario: A seat whose token variable is unset fails loudly

- **WHEN** the chosen seat names a token variable that is not set
- **THEN** execution fails naming the seat and the variable, and saying the variable is not set
- **AND** no worker is spawned

#### Scenario: A seat whose token variable is empty fails loudly

- **WHEN** the chosen seat names a token variable that is set but empty
- **THEN** execution fails naming the seat and the variable, and saying the variable is empty
- **AND** no worker is spawned

#### Scenario: A lent seat's worker gets the token decrypted at the last read

- **WHEN** the chosen seat carries an encrypted token, decrypted when Igor last read the seat files
- **THEN** the worker's environment holds that plaintext
- **AND** nothing is decrypted when the worker is spawned

#### Scenario: A seat Igor could not decrypt never reaches a worker

- **WHEN** Igor could not decrypt a seat's file at its last read of the seat files
- **THEN** that seat is never chosen for a worker, as seat-budget's *A seat Igor cannot decrypt is
  unreadable and passed over* says

#### Scenario: `igor run`'s worker gets `IGOR_RUN_TOKEN`

- **WHEN** `igor run` spawns a worker
- **THEN** the chosen seat is the implicit local seat of seat-budget's *`igor run` spends its own
  token as an implicit local seat*, and the token in the worker's environment is the value of
  `IGOR_RUN_TOKEN`

#### Scenario: A toolchain still runs

- **WHEN** a worker runs a build or a test in its working tree
- **THEN** the search path, home directory and network settings it needs are present

#### Scenario: Nothing beyond a toolchain's needs is passed

- **WHEN** a worker is spawned
- **THEN** its environment holds, besides its seat's token, only the search path, a home
  directory and the network settings the host is configured with, and `GIT_INDEX_FILE` where a worker running as its worker user is given a copy of git's index (below)

#### Scenario: A proxy URL's user info reaches the worker

- **WHEN** the host's `HTTPS_PROXY` is `http://alice:s3cretpass@proxy.internal:3128`
- **THEN** the worker's environment holds that `HTTPS_PROXY`, user info included
- **AND** it holds no other credential but the seat's token

#### Scenario: A proxy URL's user info is registered for redaction

- **WHEN** a network setting passed to the worker is a proxy URL holding user info
- **THEN** `redact-state-branch`'s (#217) *Credential redaction replaces every credential the
  Igor knows* registers it: the password and the whole URL, and a user name with no password
  only as `<user>@<host>`, never on its own

#### Scenario: A worker running as its own user is given its index copy

- **WHEN** `igor serve` spawns a worker as its worker user
- **THEN** `GIT_INDEX_FILE` in its environment names the copy of git's index kept in its outbox, the directory beside its tree where the worker leaves files for the Igor
- **AND** it lets `git rm` and `git mv` work without write access to the git directory, and is
  not a credential

## REMOVED Requirements

### Requirement: The worker is given an explicit environment holding no credential but its seat's

**Reason**: Its scenario *A seat whose file or command yields no token fails loudly* is false: a
seat file names no token file or command (*A seat file names its token only by ciphertext or its own
variable*). openspec will not archive a `MODIFIED` block that drops an in-force scenario. The
requirement is therefore removed and re-added under its full name: the in-force name stops at "its
seat's", and the new one ends "its seat's token". #175 (`worker-user`) archives before this
change, so the re-added requirement is written over #175's text, and keeps #175's `GIT_INDEX_FILE`
rule and scenario. #175's code builds that rule, after this change's code.
It has a scenario for a lent seat's decrypted token in place of the dropped one.

**Migration**: *The worker is given an explicit environment holding no credential but its seat's
token*, which keeps every other rule and scenario.
