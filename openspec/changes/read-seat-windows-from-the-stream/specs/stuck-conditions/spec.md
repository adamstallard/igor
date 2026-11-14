## MODIFIED Requirements

### Requirement: A seat's refused credential is a condition on that seat

A run the provider refuses for authentication, recognised by its authentication-error status where
the run did not finish, SHALL mint `seat:<id>:credential` for the seat it ran on, against a full
SHA-256 hash of its credential. A seat probe so refused SHALL count as one recorded occurrence of
that key, as a refused run does; one that succeeds SHALL clear the condition at once, with no
cooldown and no work item. A seat whose condition is open SHALL be passed over, as refused its
credential.

#### Scenario: A refused credential is named where it is refused

- **WHEN** a run that did not finish comes back with the provider's authentication-error status
- **THEN** `seat:<id>:credential` is minted for the seat it ran on
- **AND** the execution record carries a full hash of the credential the run used

#### Scenario: A refusal is read from the status, not the wording

- **WHEN** a run's message reads like an authentication failure but the provider's structured
  verdict is not an authentication-error status
- **THEN** no credential condition is minted

#### Scenario: A non-zero exit has already said the run did not finish

- **WHEN** a run exits non-zero with the provider's authentication-error status, and its envelope
  is silent about erroring
- **THEN** the run counts as not finished, and `seat:<id>:credential` is minted

#### Scenario: A zero exit must state that it errored

- **WHEN** a run exits zero with the provider's authentication-error status
- **THEN** `seat:<id>:credential` is minted only where the run states that it errored
- **AND** the looser test Igor uses to decide whether a run is worth recording is not applied

#### Scenario: A failure that is not a credential refusal never counts

- **WHEN** a seat's runs fail repeatedly for any other reason
- **THEN** no credential condition opens, and the seat is still chosen

#### Scenario: A seat's own reading does not overrule the condition

- **WHEN** a seat with an open credential condition reports headroom, or reports nothing at all
- **THEN** it is passed over, and the reason is the refused credential
- **AND** the reason is not that its usage could not be read, nor that it has no headroom

#### Scenario: The published record discloses no credential

- **WHEN** a refusal is recorded to a log that is committed
- **THEN** it carries a full cryptographic hash of the credential and no part of the credential
- **AND** the hash is a full SHA-256, never a prefix, a suffix or a short digest

#### Scenario: A seat probe's refusal counts as a refused run

- **WHEN** a seat probe is answered with an authentication failure
- **THEN** it counts as one occurrence of `seat:<id>:credential`, as a refused run does, and the
  condition opens once its occurrences recur as the recurrence rule requires

#### Scenario: A seat probe that succeeds clears the condition

- **WHEN** a seat's credential condition is open and a seat probe of it succeeds
- **THEN** the condition clears, with no cooldown waited and no probe item taken
- **AND** a report of when the condition's next probe is due names the seat's next hourly seat
  probe
