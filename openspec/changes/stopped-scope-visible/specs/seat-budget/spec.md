## ADDED Requirements

### Requirement: A seat a condition has stopped reads as stopped

Budget reporting SHALL show a seat an open condition has stopped as stopped, on the seat's own
line, naming each open condition on it and what would clear it, with any headroom it has against
its reserve line. A seat whose only condition is its refused credential, or whose conditions are
all read-cleared, SHALL NOT be shown as stopped, but as `condition-backoff` shows a refused credential or #171 a
read-cleared condition,
naming each condition. A condition not scoped to a seat SHALL NOT appear.

#### Scenario: A stopped seat says so on its own line

- **WHEN** an operator inspects the budget and a condition has stopped a seat
- **THEN** the report says so once for that seat, naming the cure key and what would clear it

#### Scenario: Stopped is not unreadable and not refused

- **WHEN** a seat is stopped by a condition keyed `seat:<id>:<setting>` that is neither its
  token's read nor its refused credential, a kind no requirement in force defines yet
- **THEN** it is not reported as a credential that could not be read
- **AND** it is not reported as a credential the provider refused, nor as not checked in place
  of stopped

#### Scenario: A seat Igor could not decrypt reads as unreadable

- **WHEN** a seat's only open condition is that Igor could not decrypt its seat file, and the
  command running the report cannot decrypt it either
- **THEN** the report shows the seat as unreadable where the command could read the key file,
  and as not checked where it could not, as #171 requires, naming the condition in both
- **AND** it does not show the seat as stopped

#### Scenario: A malformed seat file's seat reads as #171 shows it

- **WHEN** a seat's only open condition is `seat:<id>:file`, for its malformed seat file
- **THEN** the report shows the seat with its file's refusal, as #171 shows it, naming the
  condition
- **AND** it does not show the seat as stopped

#### Scenario: A seat stopped on its unreadable token says both

- **WHEN** a seat's token cannot be read, and the condition that opens on it, one no later read
  clears, has stopped the seat
- **THEN** the seat's line shows it as stopped, naming the condition, and also says its credential
  could not be read

#### Scenario: A stopped seat the command cannot decrypt says both

- **WHEN** a lent seat is stopped, and the operator running `igor budget` cannot read the key
  file that decrypts seat files
- **THEN** the seat's line shows it as stopped, naming each open condition, and also says it was
  not checked, as #171 requires

#### Scenario: A role's reserve sets a stopped seat's line

- **WHEN** a stopped seat declares reserve 0, and a role it serves declares reserve 0.3
- **THEN** that role's headroom on the seat is shown against the line #171's *A role may hold
  back more of a seat than the seat does* sets for it

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
