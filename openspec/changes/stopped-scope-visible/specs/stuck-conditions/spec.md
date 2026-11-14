## ADDED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because a condition is open. It SHALL go on polling, and state in each
cycle's report, the summary it logs for the cycle, which scopes are stopped, on which cure keys,
and what would cure each. Each condition SHALL clear as its kind's requirement says. A fix the
process does not reread SHALL take effect at the first start whose environment holds it, and a fix to a lore
file read only at start at its first start after a person has updated the server's lore checkout.

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

#### Scenario: A fix in compose's environment waits for the container to be recreated

- **WHEN** the operator fixes the App's key path in the service's `.env` while the service runs,
  and compose then restarts the container after a crash
- **THEN** the restarted process still has the value the container was created with
- **AND** the fix takes effect when the operator runs `docker compose up -d`, which recreates the
  container

#### Scenario: A process that cannot rewrite its serving record still stops

- **WHEN** a condition on the Igor's own credential is open, and the process's last landed write
  of its serving record is 20 minutes old
- **THEN** the process stops its workers and exits as `role-process`'s *A serving process that
  cannot rewrite its record stops its workers* requires, which is not an exit because of the
  condition

### Requirement: A process that refuses to start exits with status 78

When a check a requirement says refuses a start fails as `igor serve` starts, before the first
cycle or the first model call, the process SHALL log the reason and exit with status 78, a
*refusal*, and SHALL NOT exit 78 otherwise. Such a check failing because GitHub or the model
provider did not answer, or GitHub refused the App's credential, SHALL exit 1 instead and is not
a refusal, nor is an outcome another requirement gives status 1, nor a failure on a later reread.

#### Scenario: A refused App credential at start exits 1

- **WHEN** GitHub refuses the App's credential as `igor serve` starts
- **THEN** the process logs the refusal and exits with status 1, not 78

#### Scenario: A bad setup still refuses to start

- **WHEN** a process starts for the first time with a configuration that fails validation
- **THEN** it logs which check failed and exits with status 78 before its first cycle

#### Scenario: A start check GitHub did not answer is not a refusal

- **WHEN** `igor serve` starts while GitHub does not answer `surface-adapter`'s start check that
  the App can act on the lore repository
- **THEN** it exits with status 1, not 78

#### Scenario: A start check the model provider did not answer is not a refusal

- **WHEN** a check that refuses a start makes a model call, and the model provider does not
  answer it
- **THEN** the process exits with status 1, not 78

#### Scenario: A crash is restarted

- **WHEN** a running `igor serve` ends on an uncaught error
- **THEN** its exit status is not 78, which the shipped supervisors restart

#### Scenario: A configuration error raised while running is not a refusal

- **WHEN** an error of a kind a startup check also raises, such as a configuration error, ends
  `igor serve` while it runs, raised by anything but a check that refuses a start
- **THEN** its exit status is not 78

#### Scenario: A configuration refused at a cycle is not a refusal

- **WHEN** a running process rereads a file it read at start, and the reread fails a check that
  refuses a start
- **THEN** the process does not exit, and the failure is handled as the requirement making the
  reread says

#### Scenario: A start that falls back to a configuration that passed is not a refusal

- **WHEN** a process restarts after its configuration came to fail validation, and a requirement
  has it start instead on a configuration that passed before
- **THEN** it does not exit with status 78, and starts on that configuration

#### Scenario: A check that runs before the first model call is still a refusal

- **WHEN** #174's check that the pinned skills load fails before the first model call, after the
  first cycle has begun
- **THEN** the process exits with status 78

### Requirement: The shipped systemd unit restarts a crash and leaves a refusal down

The systemd unit this repository ships SHALL set `Restart=on-failure`, `RestartSec=30s`, and
`RestartPreventExitStatus=78` naming no other status, so that systemd restarts a crash or an exit
1 after 30 seconds, leaves a refusal down with the unit failed, and leaves a clean exit down with
the unit inactive.

#### Scenario: systemd does not restart a refusal

- **WHEN** `igor serve`, run by the shipped unit, exits with status 78
- **THEN** systemd does not restart it
- **AND** the unit shows as failed, and its journal holds the reason Igor logged

#### Scenario: systemd retries an exit 1 slowly

- **WHEN** `igor serve`, run by the shipped unit, exits with status 1 at each start because GitHub
  refuses the App's credential
- **THEN** systemd starts it again 30 seconds after each exit, and its start-rate limit does not
  stop the unit

#### Scenario: A clean exit is not restarted

- **WHEN** `igor serve`, run by the shipped unit, exits with status 0
- **THEN** systemd does not restart it, and the unit shows as inactive, not failed

### Requirement: Under the shipped compose file, a failed start waits before it exits

The shipped compose file SHALL set `restart: unless-stopped` and, unlike the shipped unit,
`IGOR_REFUSAL_WAIT=1` on each Igor's service. With it set, a refusal, or a start's exit 1 for no
answer from GitHub or the model provider or a refused App credential, SHALL log its reason, wait,
then exit: 30 seconds after the first such start in a row, doubling, at most 30
minutes, kept across restarts, not recreation. A crash SHALL NOT wait. A passing start
SHALL reset the count, a stop signal the wait.

#### Scenario: Compose retries a refusal more slowly each time

- **WHEN** `igor serve`, run by the shipped compose file, refuses to start each time compose
  starts it
- **THEN** each attempt logs its reason, and waits longer than the one before it, before it
  exits with status 78
- **AND** compose restarts it after each exit, and `docker compose logs` holds every attempt's
  reason

#### Scenario: Compose retries a start GitHub refused slowly

- **WHEN** `igor serve`, run by the shipped compose file, exits with status 1 at each start
  because GitHub refuses the App's credential
- **THEN** each attempt waits longer than the one before it, at most 30 minutes, before it exits
  with status 1

#### Scenario: A first refusal waits 30 seconds

- **WHEN** a container under the shipped compose file refuses a start, after a start that passed
- **THEN** the process waits 30 seconds after logging its reason, then exits with status 78

#### Scenario: A start that passes resets the wait

- **WHEN** a container under the shipped compose file has refused three starts in a row, and
  the next start passes every check
- **THEN** a later refusal of that container waits as long as a first refusal does

#### Scenario: The count of failed starts is kept off every volume

- **WHEN** a container under the shipped compose file has refused twice in a row, and the
  operator removes it and creates it again, its volumes kept
- **THEN** the new container's first refusal waits as long as a first refusal does

#### Scenario: A crash during a start check's window does not wait

- **WHEN** a process under the shipped compose file has begun its first cycle, has not yet run
  #174's check, and ends on an uncaught error
- **THEN** it exits without waiting

#### Scenario: A takeover GitHub does not answer waits

- **WHEN** `igor serve`, run by the shipped compose file, exits with status 1 at start because
  GitHub does not answer #242's takeover write
- **THEN** it waits as a refusal does before it exits

#### Scenario: A stop signal ends the wait

- **WHEN** a container under the shipped compose file is waiting after a refusal, and an operator
  runs `docker compose stop`
- **THEN** the process stops at once, without waiting out the interval

#### Scenario: systemd does not wait on a refusal

- **WHEN** `igor serve`, run by the shipped unit, refuses to start
- **THEN** it exits with status 78 as soon as it has logged the reason

### Requirement: Every open condition is readable without naming a role

`igor conditions`, run with no argument, SHALL list every open condition once, however many Igors
met it, with its cure key, the scope it stops or that it stops nothing, what would cure it, its recurrence count where its
kind keeps one, and when its probe is due or, for a kind that clears without a probe, what clears
it, each as the requirement defining that kind says. It SHALL say when none is open, distinctly
from an execution log it cannot read. Reading the listing SHALL change nothing.

#### Scenario: A role-scoped stop is visible to somebody who did not know which role

- **WHEN** a condition stops one role of several
- **THEN** it is listed by a command that was given no role
- **AND** the listing names the cure key, the role it stops, and what would cure it

#### Scenario: A condition that stops nothing says so

- **WHEN** a seat's `seat:<id>:decrypt` is open, and it is #171's read-cleared kind, which stops
  nothing by itself
- **THEN** the listing names the seat, says the condition stops nothing, and says a passing read
  clears it

#### Scenario: One cure met by several Igors reads as one condition

- **WHEN** five Igors have met the same cure key
- **THEN** the listing shows one condition, with one count

#### Scenario: The listing says when the probe is due

- **WHEN** an open condition that clears by a probe is listed
- **THEN** the instant its next probe is due is shown

#### Scenario: A condition with no probe says what clears it

- **WHEN** a read-cleared condition is listed
- **THEN** the listing shows no probe time, and says a passing read clears it

#### Scenario: A refused App credential says a minted token clears it

- **WHEN** a condition on the Igor's refused GitHub App credential is open
- **THEN** the listing shows no probe time, and says a token minted again clears it

#### Scenario: A sudoers condition says a passing check clears it

- **WHEN** #175's condition `instance:dev@host-a:sudoers` is open
- **THEN** the listing shows its count and no probe time, and says a passing check at the start
  of a cycle on `host-a` clears it

#### Scenario: A seat's refused credential shows what budget reporting shows

- **WHEN** a seat's refused-credential condition is open
- **THEN** the listing shows the same count and probe time that budget reporting prints for it

#### Scenario: Reading changes nothing

- **WHEN** an operator reads the listing
- **THEN** every condition is in the state it was in, with the same count and the same cooldown

#### Scenario: Nothing open reads as nothing open

- **WHEN** no condition is open
- **THEN** the listing says so
- **AND** that is distinct from a listing that could not be read
