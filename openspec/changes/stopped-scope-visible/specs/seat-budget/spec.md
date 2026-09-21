## ADDED Requirements

### Requirement: A seat a condition has stopped reads as stopped

Budget reporting SHALL show a seat that an open condition has stopped as stopped, on a line of the
seat's own, naming the cure key and what would clear it. That state SHALL be distinguishable from
a seat whose credential could not be read, from a seat whose credential the provider refused, and
from a seat with no headroom left or no capacity figure at all. A condition scoped to a role SHALL
NOT appear in budget reporting, and reading the report SHALL NOT clear a condition.

Whether a seat can be spent from is the question a budget report exists to answer, and a stopped
seat is one more answer to it. It is already the shape used for the two adjacent states: an
unreadable credential prints once for the seat rather than per window, because a credential is not
a fact about a window, and a stopped seat is not one either.

The states are not interchangeable, and merging them sends the wrong person to the wrong file.
Unreadable is a token this machine could not read. Refused is a token the provider read and
rejected. Stopped is a seat whose cure has recurred until it was worth ceasing to try — the token
may be perfectly readable and perfectly valid. Each has a different first thing to check.

A role's stop stays out. A role refused a command it needs is not a statement about anybody's
capacity, and a budget report is read by somebody asking what their seats have left — putting it
there files it where its reader is not.

#### Scenario: A stopped seat says so on its own line

- **WHEN** an operator inspects the budget and a condition has stopped a seat
- **THEN** the report says so once for that seat, naming the cure key and what would clear it

#### Scenario: Stopped is not unreadable and not refused

- **WHEN** a seat is stopped by a condition
- **THEN** it is not reported as a credential that could not be read
- **AND** it is not reported as a credential the provider refused

#### Scenario: Stopped is not out of headroom

- **WHEN** a stopped seat still has headroom in both windows
- **THEN** the report shows the headroom it has and the stop that is keeping it unspent

#### Scenario: A role's stop is not in the budget

- **WHEN** a condition stops a role
- **THEN** budget reporting is unchanged by it

#### Scenario: The report does not clear what it reports

- **WHEN** the budget has been read
- **THEN** the condition's count and cooldown are unchanged
