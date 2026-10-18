## ADDED Requirements

### Requirement: A seat a condition has stopped reads as stopped

Budget reporting SHALL show a seat that an open condition has stopped as stopped, on a line of the
seat's own, naming the cure key and what would clear it. That line SHALL be distinguishable from
every other state that keeps a seat unspent: a credential that could not be read, a credential
the provider refused, no headroom left, no unreset reading of its windows, and holding back at
its reserve line, the fullness above which #143 starts no new work on the seat (#143's *Holding
back at the line is distinguishable from having nothing to do*). A stopped seat that has headroom
SHALL show that headroom too, against the reserve line #143's report uses.

Two kinds of seat under a condition are not shown as stopped. A seat whose only open condition is its
refused credential SHALL be shown on the line `condition-backoff`'s *Reporting tells a refused
credential from an unreadable one, and clears nothing* gives it. A seat whose only open condition
is that Igor could not decrypt its seat file SHALL be shown as #171 (`seat-files`) reports an
undecryptable seat, on the line for a credential that could not be read, and that line SHALL name
the condition.

A condition scoped to a role SHALL NOT appear in budget reporting. Reading the report clears
nothing, as `condition-backoff`'s same requirement says of every report.

#### Scenario: A stopped seat says so on its own line

- **WHEN** an operator inspects the budget and a condition has stopped a seat
- **THEN** the report says so once for that seat, naming the cure key and what would clear it

#### Scenario: Stopped is not unreadable and not refused

- **WHEN** a seat is stopped by a condition
- **THEN** it is not reported as a credential that could not be read
- **AND** it is not reported as a credential the provider refused

#### Scenario: A seat Igor could not decrypt reads as unreadable

- **WHEN** a seat is under a condition because Igor could not decrypt its seat file
- **THEN** the report shows it on the line for a credential that could not be read, naming the
  decryption failure and the condition
- **AND** it does not show the seat as stopped

#### Scenario: A refused credential alone is not a stop

- **WHEN** a seat's only open condition is its refused credential
- **THEN** the report shows it on the refused-credential line, not as stopped

#### Scenario: Stopped is not out of headroom

- **WHEN** a stopped seat still has headroom in both windows
- **THEN** the report shows the headroom it has against its line, and the stop that is keeping it
  unspent

#### Scenario: Stopped is not awaiting a reading, nor holding back

- **WHEN** one seat is stopped, a second has no unreset reading of its windows, and a third is
  holding back at its line
- **THEN** the report shows three different states, one on each seat's line

#### Scenario: A role's stop is not in the budget

- **WHEN** a condition stops a role
- **THEN** budget reporting is unchanged by it

#### Scenario: The report does not clear what it reports

- **WHEN** the budget has been read
- **THEN** the condition's count and cooldown are unchanged
