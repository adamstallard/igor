## ADDED Requirements

### Requirement: A seat a condition has stopped reads as stopped

Budget reporting SHALL show a seat that an open condition has stopped as stopped, on a line of the
seat's own, naming the cure key and what would clear it. That line SHALL be distinguishable from
every other state that keeps a seat unspent: a credential that could not be read, a credential
the provider refused, no headroom left, no unreset reading of its windows where its reserve is
above 0, a seat lent through a seat file and shown as not checked because the command cannot read the
key file that decrypts it (#171),
and holding back at its reserve line, the fullness above which #143 starts no new work on the seat (#143's *Holding
back at the line is distinguishable from having nothing to do*). A stopped seat that has headroom
SHALL show that headroom too, against the seat's reserve line as #143's report shows it, per role
where a role reserves more than the seat.

Two kinds of seat under a condition are not shown as stopped. A seat whose only open condition is its
refused credential SHALL be shown on the line `condition-backoff`'s *Reporting tells a refused
credential from an unreadable one, and clears nothing* gives it. A seat whose only open condition
is that Igor could not decrypt its seat file SHALL be shown as #171 (`seat-files`) reports an
undecryptable seat: on the line for a credential that could not be read, or, where the command
cannot read the key file, as not checked. Either line SHALL name the condition. A seat with more than one open condition, or with one of any other kind, SHALL
be shown as stopped, its line naming every open condition on the seat.

A condition scoped to a role, or to the Igor's own GitHub App credential, SHALL NOT appear in
budget reporting. Reading the report SHALL
clear nothing: no condition cleared, no count reset, no cooldown shortened.

#### Scenario: A stopped seat says so on its own line

- **WHEN** an operator inspects the budget and a condition has stopped a seat
- **THEN** the report says so once for that seat, naming the cure key and what would clear it

#### Scenario: Stopped is not unreadable and not refused

- **WHEN** a seat is stopped by a condition
- **THEN** it is not reported as a credential that could not be read
- **AND** it is not reported as a credential the provider refused, nor as not checked

#### Scenario: A seat Igor could not decrypt reads as unreadable

- **WHEN** a seat's only open condition is that Igor could not decrypt its seat file
- **THEN** the report shows it on the line for a credential that could not be read, naming the
  decryption failure and the condition, or, where the command cannot read the key file, as not
  checked, naming the condition
- **AND** it does not show the seat as stopped

#### Scenario: A refused credential alone is not a stop

- **WHEN** a seat's only open condition is its refused credential
- **THEN** the report shows it on the refused-credential line, not as stopped

#### Scenario: A refused credential beside another condition is a stop

- **WHEN** a seat has its refused-credential condition open and a second condition on the seat,
  such as Igor failing to decrypt its seat file
- **THEN** the report shows the seat as stopped, naming both conditions

#### Scenario: Stopped is not out of headroom

- **WHEN** a stopped seat still has headroom in both windows
- **THEN** the report shows the headroom it has against its line, and the stop that is keeping it
  unspent

#### Scenario: Stopped is not awaiting a reading, nor holding back

- **WHEN** one seat is stopped, a second has no unreset reading of its windows, and a third is
  holding back at its line
- **THEN** the report shows three different states, one on each seat's line

#### Scenario: A stop on a role or on the App credential is not in the budget

- **WHEN** a condition stops a role, or the Igor's own GitHub App credential
- **THEN** budget reporting is unchanged by it

#### Scenario: The report does not clear what it reports

- **WHEN** the budget has been read
- **THEN** the condition's count and cooldown are unchanged
