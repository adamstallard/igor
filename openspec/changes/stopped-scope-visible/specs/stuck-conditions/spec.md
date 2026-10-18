## ADDED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because of a condition, whatever its scope: the Igor's own
credential, the role it serves, or every seat that role could spend from. While conditions are
open it SHALL go on polling, SHALL take no new item in a stopped scope, as `condition-backoff`
requires, and SHALL state in each cycle's report which scopes are stopped and on which cure keys.
Each condition SHALL clear while the process runs, in every way the change that opens it says
it clears. Among them: `condition-backoff`'s probe; for a refused GitHub App credential, a token
minted again; and, for a read-cleared condition, a later read that passes. A read-cleared
condition is one that a failing read opens and a passing read clears, with no probe; #171
defines the kind in *A read-cleared condition opens on a failing read and clears on a passing
one*. A fix the process does not reread SHALL take effect when the process next starts. That
covers every fix in the unit's environment file, and every fix in the lore repository until Igor
pulling its lore checkout, which #176 is to specify, is built. Refusing to start on a bad setup is not affected, as
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

- **WHEN** a person merges a fix to the lore repository while the service runs, before Igor
  pulling its lore checkout is built
- **THEN** the running process keeps the configuration it read at start
- **AND** the fix takes effect when the process next starts

#### Scenario: A fix in the environment file waits for a restart

- **WHEN** the operator fixes the App's key path in the unit's environment file while the
  service runs
- **THEN** the running process keeps the value it read at start
- **AND** the fix takes effect when the operator restarts the unit

### Requirement: A process that refuses to start exits with status 78

When `igor serve` refuses to start, it SHALL log the reason and exit with status 78. A refusal is
the failure of any check a requirement says refuses a start, whenever that check runs: before the
first cycle, such as config validation, or before the first model call, such as #174's check
that the pinned skills load. A process SHALL also exit with status 78 where another requirement
ends it for good on a fault a person must look at. Under #179 a role can run as several
processes, each with a number it keeps across restarts, its *rank*, and a rank that finds another
process has taken its rank is such a case. It SHALL NOT exit with status 78 for any other reason.
The systemd unit this repository ships SHALL list 78 in `RestartPreventExitStatus=`. Task 1.6
measures that systemd then does not restart the unit, shows it failed, and keeps Igor's reason in
its journal.

#### Scenario: A bad setup still refuses to start

- **WHEN** a process starts with a configuration that fails validation
- **THEN** it logs which check failed and exits with status 78 before its first cycle

#### Scenario: systemd does not restart a refusal

- **WHEN** `igor serve`, run by the shipped unit, exits with status 78
- **THEN** systemd does not restart it
- **AND** the unit shows as failed, and its journal holds the reason Igor logged

#### Scenario: A crash is still restarted

- **WHEN** a running `igor serve` ends on an uncaught error
- **THEN** its exit status is not 78, and systemd restarts it

#### Scenario: A configuration error raised while running is not a refusal

- **WHEN** an error of a kind a startup check also raises, such as a configuration error, ends
  `igor serve` while it runs, raised by anything but a check that refuses a start
- **THEN** its exit status is not 78, and systemd restarts it

#### Scenario: A check that runs before the first model call is still a refusal

- **WHEN** #174's check that the pinned skills load fails before the first model call, after the
  first cycle has begun
- **THEN** the process exits with status 78

### Requirement: Every open condition is readable without naming a role

Every open condition SHALL be readable from a command that takes no argument and names no role,
stating for each one: the cure key, the scope it stops, how many times it has recurred, what would
cure it, and when its probe is due. A condition met by several Igors SHALL appear once, as the one
condition it is. Where no condition is open, the command SHALL say so, and where the record
cannot be read, it SHALL say that instead. Reading changes nothing, as `condition-backoff`'s
*Reporting tells a refused credential from an unreadable one, and clears nothing* requires of
every report: no condition cleared, no count reset, no cooldown shortened.

An operator asking whether anything is stuck does not know which role to ask about; that is the
question. A surface that takes a role answers only for somebody who already suspects the right
one, and the fleet-wide reading — several Igors stopped on one cure key — is the strongest signal
available here and the one a per-role surface cannot produce at all.

It states the probe time because the operator's next question, having read a stop, is whether
their cure took. A stop with no time on it cannot be told from a stop nothing is going to do
anything about.

Reading cannot clear, for the reason a breaker cannot be reset by being asked: an operator who
believes they have fixed a credential and has not would clear the stop and pay for the belief on
the next items. A condition closes only on an observation, never on a claim. For most conditions
that observation is the probe. For a read-cleared condition, such as a seat file Igor could not
decrypt, it is a later read that passes (#171's *A read-cleared condition opens on a failing read
and clears on a passing one*).

#### Scenario: A role-scoped stop is visible to somebody who did not know which role

- **WHEN** a condition stops one role of several
- **THEN** it is listed by a command that was given no role
- **AND** the listing names the cure key, the role it stops, and what would cure it

#### Scenario: One cure met by several Igors reads as one condition

- **WHEN** five Igors have met the same cure key
- **THEN** the listing shows one condition, with one count

#### Scenario: The listing says when the probe is due

- **WHEN** an open condition is listed
- **THEN** the instant its next probe is due is shown

#### Scenario: Reading changes nothing

- **WHEN** an operator reads the listing
- **THEN** every condition is in the state it was in, with the same count and the same cooldown

#### Scenario: Nothing open reads as nothing open

- **WHEN** no condition is open
- **THEN** the listing says so
- **AND** that is distinct from a listing that could not be read
