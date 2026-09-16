## ADDED Requirements

### Requirement: A seat names its token through exactly one mechanism

A seat SHALL be able to name where its token is held by exactly one of three mechanisms: an
environment variable, a file path, or a command whose stdout is the token. Configuration
naming more than one on a single seat SHALL be rejected. A seat naming none of the three is
unaffected by this requirement — it reads through whatever login is ambient, as it did before
these existed.

A file and a command were added alongside the environment variable because an environment
variable cannot be scoped to a single long-lived service: whatever process starts Igor
inherits it for its whole lifetime, and everything that process spawns inherits it in turn. A
file that a secret-management mechanism decrypts into a location only the running unit can
read, or a command that queries a secret store directly, both avoid holding the credential in
an environment at all.

#### Scenario: A seat reads its token from a file

- **WHEN** a seat names a file holding its token
- **THEN** the token is read from that file's contents at the moment it is needed

#### Scenario: A seat reads its token from a command

- **WHEN** a seat names a command to run for its token
- **THEN** the command's stdout, taken at the moment the token is needed, is the token

#### Scenario: Naming more than one mechanism is rejected

- **WHEN** a seat's configuration names more than one of an environment variable, a file, and a
  command for its token
- **THEN** validation fails

#### Scenario: A file or command that cannot produce a token is refused, not substituted

- **WHEN** a seat names a file that cannot be read or is empty, or a command that fails, prints
  nothing, or never returns
- **THEN** the seat is reported unreadable
- **AND** no other credential is used in its place

#### Scenario: A command that never answers does not hang the reading

- **WHEN** a seat's command runs past a bounded timeout without exiting
- **THEN** it is killed and treated as a failure to produce a token
- **AND** reading the seat's usage, or spawning a worker, does not wait on it indefinitely
