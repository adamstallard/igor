## ADDED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because of a condition, whatever its scope: the Igor's own
credential, the role it serves, or every seat that role could spend from. While conditions are
open it SHALL go on polling, SHALL take no new item in a stopped scope, as `condition-backoff`
requires, and SHALL state in each cycle's report which scopes are stopped and on which cure keys.
Each condition SHALL clear while the process runs, in every way the change that opens it says
it clears. Among them: `condition-backoff`'s probe; for a refused GitHub App credential, a token
minted again; and, for a read-cleared condition (#171's *A read-cleared condition opens on a
failing read and clears on a passing one*), a later read that passes. A fix the process does not
reread SHALL take effect when the process next starts. That covers every fix in the unit's
environment file. It also covers a fix in the lore repository to a file the process reads only
at start, as opposed to one it rereads at each cycle such as #179's `igor.config.yaml`. That
second case lasts until Igor pulling its lore checkout, which #176 is to specify, is built. Refusing to start on a bad setup is not affected, as
*A process that refuses to start exits with status 78* specifies.

#### Scenario: A condition on the Igor's own credential leaves the service running

- **WHEN** a condition naming the Igor's own credential is open
- **THEN** the service goes on polling and takes no new item
- **AND** each cycle's report names the cure key and what would cure it

#### Scenario: A stopped role leaves the service running

- **WHEN** a condition stops the role this process serves
- **THEN** the service goes on polling, and probes once the condition's cooldown has passed
- **AND** each cycle's report names the cure key

#### Scenario: Every seat stopped leaves the service running

- **WHEN** a condition has stopped each seat the role this process serves could spend from
- **THEN** the service goes on polling and reports those cure keys

#### Scenario: A cure made while the service runs is picked up without a restart

- **WHEN** a person fixes, while the service is running, a cure that lies outside Igor's own
  files, such as granting the GitHub App a permission a role needs
- **THEN** the service takes work again once its probe finds the fix

#### Scenario: A passing read clears a read-cleared condition

- **WHEN** a read-cleared condition is open and a later read of what it names passes
- **THEN** the condition clears, with no probe item taken

#### Scenario: A fix in the lore repository waits for a restart

- **WHEN** a person merges a fix to the lore repository, in a file the process reads only at
  start, while the service runs, before Igor pulling its lore checkout is built
- **THEN** the running process keeps the configuration it read at start
- **AND** the fix takes effect when the process next starts

#### Scenario: A fix in the environment file waits for a restart

- **WHEN** the operator fixes the App's key path in the unit's environment file while the
  service runs
- **THEN** the running process keeps the value it read at start
- **AND** the fix takes effect when the operator restarts the unit

### Requirement: A process that refuses to start exits with status 78

When `igor serve` refuses to start, it SHALL log the reason and exit with status 78. A refusal is
the failure of a check a requirement says refuses a start, in its run at start: before the first
cycle, such as config validation, or before the first model call, such as #174's check that the
pinned skills load. The same check failing on a later reread, such as #179's reread of
`igor.config.yaml` at a cycle, is not a refusal. It SHALL NOT exit with status 78 for any other
reason. The systemd unit this repository ships SHALL set `Restart=on-failure` and SHALL list 78,
and no other status, in `RestartPreventExitStatus=`. The compose file this repository ships SHALL
set `restart: on-failure:3` on each Igor's service. Task 1.6 measures that systemd then does not
restart a refusal, shows the unit failed, and keeps Igor's reason in its journal; task 1.8
measures compose.

#### Scenario: A bad setup still refuses to start

- **WHEN** a process starts with a configuration that fails validation
- **THEN** it logs which check failed and exits with status 78 before its first cycle

#### Scenario: systemd does not restart a refusal

- **WHEN** `igor serve`, run by the shipped unit, exits with status 78
- **THEN** systemd does not restart it
- **AND** the unit shows as failed, and its journal holds the reason Igor logged

#### Scenario: Compose retries a refusal three times, then leaves it down

- **WHEN** `igor serve`, run by the shipped compose file, exits with status 78 each time it starts
- **THEN** compose restarts it at most three times
- **AND** the container then stays down, and its log holds the reason Igor logged

#### Scenario: A clean exit is not restarted

- **WHEN** `igor serve`, run by the shipped unit, exits with status 0
- **THEN** systemd does not restart it, and the unit shows as inactive, not failed

#### Scenario: A crash is still restarted

- **WHEN** a running `igor serve` ends on an uncaught error
- **THEN** its exit status is not 78, and systemd restarts it

#### Scenario: A configuration error raised while running is not a refusal

- **WHEN** an error of a kind a startup check also raises, such as a configuration error, ends
  `igor serve` while it runs, raised by anything but a check that refuses a start
- **THEN** its exit status is not 78, and systemd restarts it

#### Scenario: A configuration refused at a cycle is not a refusal

- **WHEN** a running process rereads its configuration at a cycle and the reread fails a check it
  passed at start
- **THEN** the process does not exit, and the failure opens a condition, as #179, the change
  that rereads the configuration at each cycle, specifies

#### Scenario: A check that runs before the first model call is still a refusal

- **WHEN** #174's check that the pinned skills load fails before the first model call, after the
  first cycle has begun
- **THEN** the process exits with status 78

### Requirement: Every open condition is readable without naming a role

Every open condition SHALL be readable from a command that takes no argument and names no role,
stating for each one: the cure key, the scope it stops, how many times it has recurred, what would
cure it, and when its probe is due. Some conditions clear without a probe: a read-cleared
condition clears on a passing read and keeps no recurrence count, and one on a refused GitHub
App credential clears when a token is minted again (`condition-backoff`). For such a condition
the listing SHALL say what clears it in place of a probe time, and SHALL show a count only where
the condition keeps one. A condition met by several Igors SHALL appear once,
as the one condition it is. Where no condition is open, the command SHALL say so, and where the
execution log the conditions are rebuilt from cannot be read, it SHALL say that instead. Reading changes nothing, as `condition-backoff`'s
*Reporting tells a refused credential from an unreadable one, and clears nothing* requires of
every report: no condition cleared, no count reset, no cooldown shortened.

#### Scenario: A role-scoped stop is visible to somebody who did not know which role

- **WHEN** a condition stops one role of several
- **THEN** it is listed by a command that was given no role
- **AND** the listing names the cure key, the role it stops, and what would cure it

#### Scenario: One cure met by several Igors reads as one condition

- **WHEN** five Igors have met the same cure key
- **THEN** the listing shows one condition, with one count

#### Scenario: The listing says when the probe is due

- **WHEN** an open condition that clears by a probe is listed
- **THEN** the instant its next probe is due is shown

#### Scenario: A condition with no probe says what clears it

- **WHEN** a read-cleared condition is listed
- **THEN** the listing shows no probe time and no count, and says a passing read clears it

#### Scenario: Reading changes nothing

- **WHEN** an operator reads the listing
- **THEN** every condition is in the state it was in, with the same count and the same cooldown

#### Scenario: Nothing open reads as nothing open

- **WHEN** no condition is open
- **THEN** the listing says so
- **AND** that is distinct from a listing that could not be read
