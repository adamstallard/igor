# stuck-conditions Specification

## Purpose
Stop an Igor repeating work that fails for a reason no item can fix: a fault in its own
configuration, such as a command its allowlist refuses or a seat whose credential the provider
refuses. Each such fault is named by a cure key, which says what a person would change to fix it.
When handoffs recur on one cure key, the scope that key names (a role, a seat, or an Igor) stops
taking new items, says what would cure it, and resumes once the fault stops recurring.
## Requirements
### Requirement: A condition that recurs stops the affected scope from taking new work

Where the same cure key is recorded as the cause of a handoff repeatedly, the scope that key
names SHALL stop taking new items until the condition clears, and SHALL say which key stopped
it and what would cure it.

A first occurrence opens no condition, with one exception: a refused GitHub App credential opens
the Igor-scoped condition on its first occurrence, because an Igor whose App is refused can do
nothing on GitHub, so no item it took could find the cure.

#### Scenario: A recurring condition stops the scope

- **WHEN** one cure key has been recorded as the cause of a handoff enough times
- **THEN** the scope that key names takes no new items

#### Scenario: A first occurrence is not a condition

- **WHEN** a cure key is recorded for the first time
- **THEN** work continues, because one occurrence is what finds the cure

#### Scenario: A refused App credential stops at once

- **WHEN** GitHub refuses the Igor's App credential once
- **THEN** the Igor-scoped condition opens, and the Igor takes no new item

#### Scenario: The stop names its cure

- **WHEN** a scope stops on a condition
- **THEN** it states the cure key and what changing it would take, rather than reporting itself
  unavailable

#### Scenario: The record says which kind of idle this is

- **WHEN** a cycle takes no work because a condition is open
- **THEN** the decision record names the condition and its key, distinctly from an exhausted
  budget, from pacing, and from an empty queue

### Requirement: Conditions are counted, not graded

A condition SHALL be acted on by how often it has recurred and MUST NOT be graded by severity.
No configuration may declare a condition fatal, degraded, or otherwise ranked, and validation
SHALL reject one that tries.

#### Scenario: Two conditions with different consequences back off the same way

- **WHEN** one condition yields unverified pull requests and another yields nothing at all
- **THEN** both stop their scope on recurrence alone, with no ordering between them

#### Scenario: A configured severity is refused

- **WHEN** a role or org base declares a condition fatal or degraded
- **THEN** validation fails

### Requirement: A condition's scope is its cure's scope

A condition SHALL be keyed by what would cure it, and SHALL stop exactly what that cure governs. A
refused command stops the role whose `commands` refused it, a seat whose token cannot be read stops
every role drawing on that seat, and an Igor's own credential stops that Igor. A key naming a seat
is seat-scoped however many discriminators (*A discriminator qualifies an occurrence, never its
scope*) that seat has been observed against.

#### Scenario: A role-scoped condition leaves other roles working

- **WHEN** a role's allowlist refuses a command it needs
- **THEN** that role stops and roles that do not share the cure continue

#### Scenario: A seat-scoped condition stops every role on that seat

- **WHEN** a seat's token cannot be read
- **THEN** every role drawing on that seat stops, whatever their own configuration says

### Requirement: A discriminator qualifies an occurrence, never its scope

Where the cure key does not by itself identify what is stuck, each occurrence SHALL carry a
discriminator: an opaque value for what it was observed against, absent where the key alone
suffices. It is on every log row of the occurrence. Occurrences with different discriminators are
distinct occurrences of one condition, neither counting toward the other; a handoff carrying a new
one closes the open occurrence and starts a new count. The discriminator qualifies the occurrence,
never the scope.

#### Scenario: A cure key that does not identify what is stuck carries a discriminator

- **WHEN** a cure key names a seat's credential, which does not say which credential
- **THEN** each occurrence carries what the condition was observed against, and a handoff observed
  against a different one is a new occurrence rather than the next count of the open one

### Requirement: A condition is rebuilt from the execution log alone

A condition SHALL be rebuilt from the execution log on the state branch, with no condition state
stored apart from that log. It is rebuilt from the run rows carrying its cure key and the condition
rows the loop appends for what no run shows, such as taking a probe, the one item tried after a
cooldown. Every Igor appends to the one log, so the same cure met by several Igors is one condition.
Rows that are not runs carry a kind, so every reader counting runs, such as spend attribution, skips
them.

#### Scenario: One cure met by several Igors is one condition

- **WHEN** five Igors each hand back on the same cure key, having observed it against the same
  thing
- **THEN** it is one condition, counted once toward its recurrence and cleared once

#### Scenario: A probe is taken once

- **WHEN** a condition's cooldown has passed and one Igor has appended a row saying it is taking
  the probe
- **THEN** no other Igor takes a probe item for that condition until the probe's outcome is in
  the log

#### Scenario: The count survives the process

- **WHEN** a loop restarts while a condition is open
- **THEN** the condition and its count are read back rather than starting again from zero

### Requirement: A condition clears by not recurring, and a probe is what observes that

A condition SHALL clear when it stops recurring, with no outside signal of the cure. After a
cooldown the scope SHALL take exactly one item: the next it would take, not the item in work
when the condition opened. The condition SHALL clear if that item does not meet it; otherwise
the scope SHALL stop again for a longer cooldown.

A condition carrying a discriminator SHALL also clear the moment its scope yields a different
discriminator, as when a seat's credential hashes to a new value.

#### Scenario: A cured condition clears itself

- **WHEN** the cooldown passes and the probe item completes without meeting the condition
- **THEN** the condition is closed and the scope resumes

#### Scenario: A condition still present backs off further

- **WHEN** the probe meets the same condition again
- **THEN** the scope stops again and the next cooldown is longer

#### Scenario: One item, not a resumption

- **WHEN** a scope is probing
- **THEN** it takes one item and stops again until that item's outcome is known

#### Scenario: A changed discriminator clears without a probe

- **WHEN** a seat resolves a credential other than the one an open condition on that seat was
  observed against
- **THEN** the condition closes at once, without waiting for the cooldown and without spending
  an item

#### Scenario: The same credential still clears by probe

- **WHEN** the cooldown passes and the probe runs on the unchanged credential without meeting
  the condition
- **THEN** the condition closes, exactly as it would for a condition carrying no discriminator

#### Scenario: The probe is not the item that tripped it

- **WHEN** the item being worked when a condition opened is suppressed, closed, or claimed by
  somebody else
- **THEN** the probe is whichever item the scope would take next, and the condition can still
  clear

### Requirement: A seat's refused credential is a condition on that seat

A run the provider refuses for authentication SHALL mint `seat:<id>:credential` for the seat it
ran on, observed against a full SHA-256 hash of the credential it used: for a seat that names no
token source, the ambient `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` together.

A seat whose credential condition is open SHALL be passed over before its headroom is checked,
and the reason given SHALL be that the provider refused its credential, not unreadable usage or
no headroom.

#### Scenario: A refused credential is named where it is refused

- **WHEN** a run that did not finish comes back with the provider's authentication-error status
- **THEN** `seat:<id>:credential` is minted for the seat it ran on
- **AND** the execution record carries a full hash of the credential the run used

#### Scenario: A seat's own reading does not overrule the condition

- **WHEN** a seat with an open credential condition reports headroom, or reports nothing at all
- **THEN** it is passed over, and the reason is the refused credential

#### Scenario: The published record discloses no credential

- **WHEN** a refusal is recorded to a log that is committed
- **THEN** it carries a full cryptographic hash of the credential and no part of the credential

### Requirement: A credential refusal is the provider's verdict on a run that did not finish

A run SHALL be taken as refused for authentication only by the provider's own structured verdict, an
authentication-error status, never by the wording of a message, and only where the run also did not
finish. A run failing for any other reason SHALL NOT mint `seat:<id>:credential`. A run that exited
non-zero did not finish, even where its envelope (the JSON result it prints on exit) is silent about
erroring. A run that exited zero did not finish only where its envelope states that it errored.

#### Scenario: A failure that is not a credential refusal never counts

- **WHEN** a seat's runs fail repeatedly for any other reason
- **THEN** no credential condition opens, and the seat is still chosen

### Requirement: Reporting tells a refused credential from an unreadable one, and clears nothing

Budget reporting SHALL show a seat with an open credential condition on a line of the seat's own,
distinctly from a seat whose credential could not be read. It SHALL offer a way to print which
credential resolves for each seat, how many runs the provider refused it on, and when its next
probe is due. Reading any of this SHALL NOT clear the condition, and no command SHALL clear it.

#### Scenario: A stopped seat reads as stopped on its credential

- **WHEN** an operator inspects the budget and a seat's credential condition is open
- **THEN** the report says so once, for the seat
- **AND** it does not report that seat as having an unreadable credential

#### Scenario: The condition can be inspected without being cleared

- **WHEN** an operator asks for the credential state
- **THEN** the credential that resolves, the number of refusals and when the next probe is due
  are printed
- **AND** the condition is unchanged by having been read

### Requirement: No recurrence count or cooldown is fixed here

The recurrence threshold and the cooldown SHALL be configurable, and their defaults SHALL be
marked provisional until run history exists to fit them against. The cooldown SHALL grow with each
recurrence, up to a stated ceiling.

#### Scenario: Defaults are marked as unfitted

- **WHEN** an operator reads the threshold or the cooldown
- **THEN** each is declared provisional and says what it was reasoned from

