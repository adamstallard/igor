## MODIFIED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because of a condition, whatever its scope: the Igor's own
credential, the role it serves, or every seat that role could spend from. While conditions are
open it SHALL go on polling, SHALL take no new item in a stopped scope, as `condition-backoff`
requires, and SHALL state in each cycle's report which scopes are stopped and on which cure keys.
Each condition SHALL clear while the process runs, in every way the OpenSpec change that defines it
says it clears. Among them: `condition-backoff`'s probe; for a refused GitHub App credential, a token
minted again; and, for a read-cleared condition (#171's *A read-cleared condition opens on a
failing read and clears on a passing one*), a later read that passes. A fix in the lore
repository SHALL reach the running process without a restart, as `lore-pull` specifies. A fix the process does not reread SHALL take
effect when the process next starts. That covers every fix in the unit's environment file.
Refusing to start on a bad setup is not affected, as *A process that refuses to start exits with
status 78* specifies.

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

#### Scenario: A fix in the lore repository is picked up without a restart

- **WHEN** a person merges a fix to the lore repository while the service runs
- **THEN** the process applies it, as `lore-pull` specifies, with no restart

#### Scenario: A fix in the environment file waits for a restart

- **WHEN** the operator fixes the App's key path in the unit's environment file while the
  service runs
- **THEN** the running process keeps the value it read at start
- **AND** the fix takes effect when the operator restarts the unit
