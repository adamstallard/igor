## ADDED Requirements

### Requirement: A read-cleared condition opens on a failing read and clears on a passing one

A read-cleared condition SHALL be a condition on something Igor reads, such as a file, that opens
when a read of it fails and clears when a later read passes. It SHALL open on the number of failing
reads in a row that the rule using it sets, or on the first where that rule sets none. It SHALL
clear only on a passing read, never by a probe item, and with no cooldown. It SHALL stop nothing by
itself. A read SHALL append a condition row only where it opens or clears the condition.

#### Scenario: A failing read opens the condition at once

- **WHEN** a read of a file that a read-cleared condition watches fails for the first time, and
  the rule using the condition sets no count
- **THEN** the condition opens, without waiting for a recurrence

#### Scenario: A rule that sets a count opens the condition on that count

- **WHEN** the rule using a read-cleared condition sets three failing reads in a row, and two
  reads in a row have failed
- **THEN** the condition is not open
- **AND** it opens when the third read in a row fails

#### Scenario: A passing read clears it, with no probe

- **WHEN** a later read of that file passes
- **THEN** the condition clears, with no cooldown waited and no probe item taken

#### Scenario: The condition stops nothing by itself

- **WHEN** a read-cleared condition on a seat file is open, and the role that seat serves has
  another eligible seat
- **THEN** the role keeps working on that other seat
- **AND** only the seat whose file failed to read is out of use

#### Scenario: Where the failed read leaves a role no seat, seat-budget decides

- **WHEN** a read-cleared condition on a seat file is open, and the role that seat serves has no
  other eligible seat
- **THEN** the seat's token is still missing, and seat-budget's
  *A role with no eligible seat stops only on conditions no read clears* says what follows: the role hands off rather than stops
- **AND** the condition records the fault, names its cure, and is reported like any other
  condition

#### Scenario: A rule using the kind states only its own particulars

- **WHEN** a rule opens a condition of this kind
- **THEN** it cites this requirement and states only what is read, what counts as failing, how
  many failing reads in a row open the condition, and what the condition is on

#### Scenario: A read that changes nothing appends no row

- **WHEN** a read leaves a read-cleared condition as it was, open or clear
- **THEN** no condition row is appended
- **AND** a read that opens or clears it appends one

## MODIFIED Requirements

### Requirement: A condition clears by not recurring, and a probe is what observes that

An open condition SHALL clear when it stops recurring. After a cooldown the scope SHALL take exactly
one probe item, unless it is read-cleared; if that item does not meet the condition it SHALL clear,
and if it does the scope SHALL stop for a longer cooldown. A condition with a discriminator (a tag on each occurrence) SHALL also clear at once when the scope resolves another. #175's sudoers condition clears only as *A sudoers condition clears only on a passing check at a cycle's start* says.

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

#### Scenario: The probe is the next ordinary item

- **WHEN** a condition's cooldown passes
- **THEN** the probe is the next item the scope would ordinarily take, not the item that was
  being worked when the condition opened

#### Scenario: A read-cleared condition takes no probe item

- **WHEN** a read-cleared condition has been open past any cooldown
- **THEN** no probe item is taken for it, and it clears only as *A read-cleared condition opens
  on a failing read and clears on a passing one* says, when a later read passes

### Requirement: A condition that recurs stops the affected scope from taking new work

Where the same cure key is recorded as the cause of a handoff repeatedly, the scope that key names
SHALL stop taking new items until the condition clears, and SHALL say which key stopped it and what
would cure it. Recurrence is the trigger, with two exceptions. A refused GitHub App credential opens
on its first occurrence and stops the Igor, as `app-identity` requires. A read-cleared condition
opens on as many failing reads in a row as its rule sets, one where it sets none, and stops nothing.

#### Scenario: A recurring condition stops the scope

- **WHEN** one cure key has been recorded as the cause of a handoff enough times
- **THEN** the scope that key names takes no new items

#### Scenario: A first occurrence is not a condition

- **WHEN** a cure key is recorded for the first time, other than a refused App credential or a
  read-cleared condition
- **THEN** work continues, because one occurrence is what finds the cure

#### Scenario: A refused App credential stops at once

- **WHEN** GitHub refuses the Igor's App credential once
- **THEN** the Igor-scoped condition opens, and the Igor takes no new item

#### Scenario: A seat file that fails to decrypt opens at once

- **WHEN** a read of the seat files fails to decrypt a seat's file for the first time
- **THEN** the condition on that seat opens, without waiting for a recurrence, as seat-budget's
  *A failed decryption opens `seat:<id>:decrypt` on the seat* says

#### Scenario: A malformed seat file opens at once

- **WHEN** a read of the seat files finds a seat's file malformed for the first time
- **THEN** the condition on that seat opens, without waiting for a recurrence, as seat-budget's
  *A malformed seat file takes only its own seat out* says

#### Scenario: A good read clears the decryption condition

- **WHEN** a later read of the seat files decrypts that seat's file
- **THEN** the condition on that seat clears, as a read-cleared condition does

#### Scenario: A seat under a read-cleared condition is observed only by reading

- **WHEN** a seat's file is under a read-cleared condition
- **THEN** the seat is never chosen and never probed, so no run or probe item uses it
- **AND** reading the file again is the only observation of its cure

#### Scenario: The stop names its cure

- **WHEN** a scope stops on a condition
- **THEN** it states the cure key and what changing it would take, rather than reporting itself
  unavailable

#### Scenario: The record says which kind of idle this is

- **WHEN** a cycle takes no work because a condition is open
- **THEN** the decision record names the condition and its key, distinctly from an exhausted
  budget, from holding back at the line, and from an empty queue

### Requirement: A condition's scope is its cure's scope

A condition SHALL be keyed by its cure and stop exactly what that cure governs: a refused command
its role, an unreadable seat that seat, for every role on it, an Igor's credential that Igor, and a failed worker
spawn its instance. A role with another eligible seat SHALL keep working on it. A condition SHALL be
rebuilt from the execution log alone. Where the key does not say what is stuck, each occurrence
SHALL carry a discriminator naming what it was observed against.

#### Scenario: A role left with no eligible seat follows seat-budget

- **WHEN** a seat-scoped condition leaves a role with no eligible seat
- **THEN** whether that role stops or hands off is as seat-budget's
  *A role with no eligible seat stops only on conditions no read clears* says

#### Scenario: One cure met by several Igors is one condition

- **WHEN** five Igors each hand back on the same cure key, having observed it against the same
  thing
- **THEN** it is one condition, counted once toward its recurrence and cleared once

#### Scenario: A cure key that does not identify what is stuck carries a discriminator

- **WHEN** a cure key names a seat's credential, which does not say which credential
- **THEN** each occurrence carries what the condition was observed against, and a handoff observed
  against a different one is a new occurrence rather than the next count of the open one

#### Scenario: A new discriminator closes the open occurrence

- **WHEN** an occurrence observed against one discriminator is open, and a handoff is observed
  against a different one
- **THEN** the open occurrence closes and a new count starts from that handoff
- **AND** neither occurrence counts toward the other

#### Scenario: A key that says what is stuck carries no discriminator

- **WHEN** a cure key such as `role:web:commands` fully says what is stuck
- **THEN** its occurrences carry no discriminator

#### Scenario: A discriminator never narrows the scope

- **WHEN** a seat's credential condition has been observed against several discriminators
- **THEN** every occurrence carries its discriminator on each of its rows, and the condition is
  seat-scoped all the same

#### Scenario: A credential belonging to an Igor stops that Igor

- **WHEN** a condition's cure is a credential belonging to an Igor
- **THEN** that Igor stops

#### Scenario: A role-scoped condition leaves other roles working

- **WHEN** a role's allowlist refuses a command it needs
- **THEN** that role stops and roles that do not share the cure continue

#### Scenario: A seat-scoped condition stops every role on that seat

- **WHEN** a seat's token cannot be read, under a condition that is not read-cleared, such as an
  unset `token_env` variable, and it is the only seat serving each role drawing on it
- **THEN** every role drawing on that seat stops, whatever their own configuration says

#### Scenario: An undecryptable seat's condition stops no role

- **WHEN** the only seat serving a role is under a condition because Igor could not decrypt its
  file
- **THEN** the role does not stop, and hands off naming the condition

#### Scenario: A seat-scoped condition passes the seat over for a role with another seat

- **WHEN** a seat's token cannot be read, and a role drawing on it is served by another eligible
  seat
- **THEN** that role draws on the other seat and does not stop

#### Scenario: A condition is rebuilt from runs and condition rows

- **WHEN** a condition is read back
- **THEN** it is rebuilt from the run rows that carry its cure key, and from condition rows the
  loop appended for what no run shows, such as a probe being taken
- **AND** every Igor appends to the one log, and no record of the condition is kept elsewhere

#### Scenario: Condition rows are not counted as runs

- **WHEN** a reader that counts runs, such as spend attribution, reads the log
- **THEN** it skips condition rows, which carry a kind that run rows do not

#### Scenario: A probe is taken once

- **WHEN** a condition's cooldown has passed and one Igor has appended a row saying it is taking
  the probe
- **THEN** no other Igor takes a probe item for that condition until the probe's outcome is in
  the log

#### Scenario: The count survives the process

- **WHEN** a loop restarts while a condition is open
- **THEN** the condition and its count are read back rather than starting again from zero

### Requirement: A seat's refused credential is a condition on that seat

A run the provider refuses for authentication, recognised by its authentication-error status where
the run did not finish, SHALL record an occurrence of `seat:<id>:credential` for the seat it ran on, tagged with its credential's full SHA-256 hash. A seat probe so refused SHALL count as one recorded occurrence
of that key, as a refused run does; one that succeeds SHALL clear the condition at once,
with no cooldown or probe item. A seat whose condition is open SHALL be passed over as refused.

#### Scenario: A refused credential is named where it is refused

- **WHEN** a run that did not finish comes back with the provider's authentication-error status
- **THEN** `seat:<id>:credential` is minted for the seat it ran on
- **AND** the execution record carries a full hash of the credential the run used

#### Scenario: A refusal is read from the status, not the wording

- **WHEN** a run's message reads like an authentication failure but the provider's structured
  verdict is not an authentication-error status
- **THEN** no credential condition is minted

#### Scenario: A non-zero exit has already said the run did not finish

- **WHEN** a run exits non-zero with the provider's authentication-error status, and its final JSON result is silent about erroring
- **THEN** the run counts as not finished, and `seat:<id>:credential` is minted

#### Scenario: A zero exit must state that it errored

- **WHEN** a run exits zero with the provider's authentication-error status
- **THEN** `seat:<id>:credential` is minted only where the run states that it errored
- **AND** the looser test Igor uses to decide whether a run is worth recording, any non-success, is not applied

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

#### Scenario: A lent seat's credential is hashed after decryption

- **WHEN** a seat whose file carries `encrypted_token` is refused
- **THEN** the credential hashed is the decrypted token that seat-budget's *A seat's token
  travels as ciphertext in its file* defines, never the ciphertext

#### Scenario: Every credential hashed is a seat's own token

- **WHEN** a refused credential is hashed
- **THEN** it is the token the seat's file names a source for, never a stored Claude login, which
  Igor never uses

#### Scenario: A seat probe's refusal counts as a refused run

- **WHEN** a seat probe is answered with an authentication failure
- **THEN** it counts as one occurrence of `seat:<id>:credential`, as a refused run does, and the
  condition opens once its occurrences recur as the recurrence rule requires

#### Scenario: A seat probe that succeeds clears the condition

- **WHEN** a seat's credential condition is open and a seat probe of it succeeds
- **THEN** the condition clears, with no cooldown waited and no probe item taken
- **AND** a report of when the condition's next probe is due names the seat's next hourly seat
  probe, not a probe item

### Requirement: Reporting tells a refused credential from an unreadable one, and clears nothing

Budget reporting SHALL show a seat with an open credential condition on a line of the seat's own,
distinctly from a seat whose credential could not be read. It SHALL offer a way to print, for each
seat, which credential resolves, identified by its source and its hash and never by the credential
itself, how many runs the provider refused it on, and when its next probe is due. Reading any of
this SHALL NOT clear the condition, and no command SHALL clear it.

#### Scenario: A stopped seat reads as stopped on its credential

- **WHEN** an operator inspects the budget and a seat's credential condition is open
- **THEN** the report says so once, for the seat
- **AND** it does not report that seat as having an unreadable credential

#### Scenario: The condition can be inspected without being cleared

- **WHEN** an operator asks for the credential state
- **THEN** the credential that resolves, the number of refusals and when the next probe is due
  are printed
- **AND** the credential is shown by its source and its hash, never itself
- **AND** the condition is unchanged by having been read

#### Scenario: No command clears a credential condition

- **WHEN** an operator wants an open credential condition cleared
- **THEN** no command clears it
