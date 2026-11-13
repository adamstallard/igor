## MODIFIED Requirements

### Requirement: An open condition never ends a running service

`igor serve` SHALL NOT exit because of a condition, whatever its scope. While conditions are open
it SHALL go on polling, take no new item in a stopped scope, and state in each cycle's report (the
summary of the cycle that `igor serve` prints) which scopes are stopped, on which
`condition-backoff` cure keys, and what would cure each. Each condition SHALL clear while the
process runs, in every way the requirement defining that kind of condition says it clears, such as
by `condition-backoff`'s probe, by a token minted again for a refused GitHub App credential, or by
a later passing read for a read-cleared condition, the kind #171's *A read-cleared condition opens
on a failing read and clears on a passing one* adds to `stuck-conditions`.

A fix the process does not reread SHALL take effect at the process's next start, including every
fix in the environment its supervisor gives it: the unit's environment file, or the compose file's
`environment:`. A fix in the lore repository SHALL reach the running process without a restart, as
`lore-pull` specifies. Refusing to start on a bad setup falls under *A process that refuses to
start exits with status 78*, not this requirement.

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

- **WHEN** a person merges a fix to the lore repository while the service runs
- **THEN** the process applies it, as `lore-pull` specifies, with no restart

#### Scenario: A fix in the environment file waits for a restart

- **WHEN** the operator fixes the App's key path in the unit's environment file while the
  service runs
- **THEN** the running process keeps the value it read at start
- **AND** the fix takes effect when the operator restarts the unit
