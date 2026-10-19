## ADDED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because of a condition, whatever its scope: the Igor's own
credential, the role it serves, or every seat that role could spend from. While conditions are
open it SHALL go on polling, SHALL take no new item in a stopped scope, as `condition-backoff`
requires, and SHALL state in each cycle's report which scopes are stopped, on which cure keys,
and what would cure each. Each condition SHALL clear while the process runs, in every way the
requirement defining its kind says it clears: `condition-backoff`'s probe; for a refused GitHub
App credential, a token minted again, as `surface-adapter` says; and, for a read-cleared
condition, a later read that passes, as #171's *A read-cleared condition opens on a failing read
and clears on a passing one* says.

A fix the process does not reread SHALL take effect when the process next starts. That covers
every fix in the environment its supervisor gives it: the unit's environment file, or the
compose file's `environment:`. A fix in the lore repository SHALL take effect once a person has
updated the server's lore checkout to hold it: at the next cycle for a file the process rereads
at each cycle, such as `igor.config.yaml` under #179, and at the next start for a file it reads
only at start. The lore sentence holds until #208 (`lore-pull`) replaces it. Refusing to start
on a bad setup is not affected by this requirement, as *A process that refuses to start exits
with status 78* specifies.

#### Scenario: A condition on the Igor's own credential leaves the service running

- **WHEN** a condition naming the Igor's own credential is open
- **THEN** the service goes on polling
- **AND** each cycle's report names the cure key and what would cure it

#### Scenario: A stopped role leaves the service running

- **WHEN** a condition stops the role this process serves
- **THEN** the service goes on polling, and probes once the condition's cooldown has passed
- **AND** each cycle's report names the cure key and what would cure it

#### Scenario: Every seat stopped leaves the service running

- **WHEN** a condition has stopped each seat the role this process serves could spend from
- **THEN** the service goes on polling, and each cycle's report names those cure keys and what
  would cure each

#### Scenario: A cure made while the service runs is picked up without a restart

- **WHEN** a condition stops a role because a tool its `commands` need is missing on the server,
  and a person installs the tool while the service runs
- **THEN** the service takes work again once its probe finds the fix

#### Scenario: A fix in the lore repository while the service runs

- **WHEN** a person merges a fix to the lore repository, in a file the process reads only at
  start, while the service runs, before #208 (`lore-pull`) is built
- **THEN** the running process keeps the configuration it read at start
- **AND** the fix takes effect when the process next starts after a person has updated the
  server's lore checkout

#### Scenario: A fix in the environment file waits for a restart

- **WHEN** the operator fixes the App's key path in the unit's environment file while the
  service runs
- **THEN** the running process keeps the value it read at start
- **AND** the fix takes effect when the operator restarts the unit

### Requirement: A process that refuses to start exits with status 78

When `igor serve` refuses to start, it SHALL log the reason and exit with status 78. A refusal is
the failure of a check a requirement says refuses a start, when that check runs as the process
starts: before the first cycle, such as config validation, or before the first model call, such
as #174's check that the pinned skills load. A check that fails because GitHub or the model
provider did not answer, or because GitHub refused the App's credential, is not a refusal: the
process SHALL exit with status 1, which the shipped supervisors restart. The same check failing on a later reread, such as #179's reread of
`igor.config.yaml` at a cycle, is not a refusal. Nor is a failing check at start where another
requirement has the process start instead on a configuration that passed before, as #208
(`lore-pull`) does for a process restarting after a failing lore commit landed. The process
SHALL NOT exit with status 78 for any other reason.

The systemd unit this repository ships SHALL set `Restart=on-failure` and SHALL list 78, and no
other status, in `RestartPreventExitStatus=`, so that systemd restarts a crash, leaves a refusal
down with the unit failed, and leaves a clean exit down with the unit inactive.

The compose file this repository ships SHALL set `restart: unless-stopped` on each Igor's
service, and SHALL mark the process as running under compose. A process so marked that refuses
to start SHALL, after logging its reason, wait before it exits 78. The wait SHALL grow with each
refusal in a row of that container, and SHALL reset once a start passes every check that
refuses a start. A process not so marked, such as one the systemd unit runs, SHALL exit 78
without waiting. A signal to stop SHALL end the wait at once, and the process SHALL then exit as
it does on that signal at any other time.

#### Scenario: A bad setup still refuses to start

- **WHEN** a process starts for the first time with a configuration that fails validation
- **THEN** it logs which check failed and exits with status 78 before its first cycle

#### Scenario: systemd does not restart a refusal

- **WHEN** `igor serve`, run by the shipped unit, exits with status 78
- **THEN** systemd does not restart it
- **AND** the unit shows as failed, and its journal holds the reason Igor logged

#### Scenario: Compose retries a refusal more slowly each time

- **WHEN** `igor serve`, run by the shipped compose file, refuses to start each time compose
  starts it
- **THEN** each attempt logs its reason, and waits longer than the one before it, before it
  exits with status 78
- **AND** compose restarts it after each exit, and `docker compose logs` holds every attempt's
  reason

#### Scenario: A start that passes resets the wait

- **WHEN** a container under the shipped compose file has refused three starts in a row, and
  the next start passes every check
- **THEN** a later refusal of that container waits as long as a first refusal does

#### Scenario: A stop signal ends the wait

- **WHEN** a container under the shipped compose file is waiting after a refusal, and an operator
  runs `docker compose stop`
- **THEN** the process stops at once, without waiting out the interval

#### Scenario: A start check GitHub did not answer is not a refusal

- **WHEN** `igor serve` starts while GitHub does not answer `surface-adapter`'s start check that
  the App can act on the lore repository
- **THEN** it exits with status 1, and systemd restarts it

#### Scenario: systemd does not wait on a refusal

- **WHEN** `igor serve`, run by the shipped unit, refuses to start
- **THEN** it exits with status 78 as soon as it has logged the reason

#### Scenario: A clean exit is not restarted

- **WHEN** `igor serve`, run by the shipped unit, exits with status 0
- **THEN** systemd does not restart it, and the unit shows as inactive, not failed

#### Scenario: A crash is restarted

- **WHEN** a running `igor serve` ends on an uncaught error
- **THEN** its exit status is not 78, it exits without waiting, and systemd or compose restarts
  it

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
App credential clears when a token is minted again, as `surface-adapter` says. For such a
condition the listing SHALL say what clears it in place of a probe time. It SHALL show a count
only for a condition whose kind keeps one, as the requirement defining that kind says. A seat's
refused credential, unlike the App's, keeps a count and a probe; for it, the count and the probe
time SHALL be the ones `condition-backoff`'s
*Reporting tells a refused credential from an unreadable one, and clears nothing* has budget
reporting print, read from the same conditions.

A condition is one cure key in the execution log every Igor appends to, so a condition several
Igors met SHALL appear once, with the one count the log holds for its cure key. Where no
condition is open, the command SHALL say so, and where the execution log the conditions are
rebuilt from cannot be read, it SHALL say that instead. Reading the listing SHALL change
nothing: no condition cleared, no count reset, no cooldown shortened.

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
