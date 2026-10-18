## ADDED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because of a condition, whatever its scope: the Igor's own
credential, the role it serves, or every seat that role could spend from. While conditions are
open it SHALL go on polling, SHALL take no new item in a stopped scope, as `condition-backoff`
requires, and SHALL state in each cycle's report which scopes are stopped and on which cure keys.
Each condition SHALL clear while the process runs, the way it clears without this change: by
`condition-backoff`'s probe, or, for a refused GitHub App credential, once a token mints again.
Refusing to start on a bad setup is not affected: the checks a process makes before its first
cycle still end it.

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

- **WHEN** a person fixes, while the service is running, a setting the process rereads while it
  runs, such as a seat file Igor reads again (#171), rather than one in the lore repository
  before #176 or in the unit's environment file
- **THEN** the service takes work again once its probe, or its next read of that setting, finds
  the fix

#### Scenario: A bad setup still refuses to start

- **WHEN** a process starts with a configuration that fails validation
- **THEN** it exits non-zero before its first cycle, as it does without this change

### Requirement: Every open condition is readable without naming a role

Every open condition SHALL be readable from a command that takes no argument and names no role,
stating for each one: the cure key, the scope it stops, how many times it has recurred, what would
cure it, and when its probe is due. A condition met by several Igors SHALL appear once, as the one
condition it is. Reading SHALL change nothing — no condition cleared, no count reset, no cooldown
shortened.

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
that observation is the probe. For a seat Igor could not decrypt, it is a later read of the seat files that decrypts that seat's
file, as #171 specifies.

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
