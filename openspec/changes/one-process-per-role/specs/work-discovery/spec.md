## MODIFIED Requirements

### Requirement: The cycle repeats without supervision

Igor SHALL provide a process that runs the cycle on the configured interval until stopped. A
single cycle invoked by hand is the unit that process repeats, not a substitute for it.

#### Scenario: Cycles repeat on the interval

- **WHEN** the process is started for a role
- **THEN** it runs a cycle, waits the role's poll interval, and runs another

#### Scenario: A failing cycle does not end the process

- **WHEN** a cycle fails
- **THEN** the failure is reported and the next cycle still runs

#### Scenario: Shutdown finishes the item in hand

- **WHEN** the process is asked to stop while its workers work items
- **THEN** it completes or hands off each of them before exiting
- **AND** it begins no further item

#### Scenario: Budget is re-checked between items

- **WHEN** several items are claimed in one cycle and capacity runs out partway
- **THEN** the remaining items are not started
- **AND** the reason is reported
