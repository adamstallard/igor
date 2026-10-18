## MODIFIED Requirements

### Requirement: A condition that recurs stops the affected scope from taking new work

Where the same cure key is recorded as the cause of a handoff repeatedly, the scope that key
names SHALL stop taking new items until the condition clears, and SHALL say which key stopped
it and what would cure it.

An Igor stuck on its own configuration is not stuck on anything an item can fix. Nothing about
the item produced the outcome, so nothing about the next item avoids it: the loop claims,
spends a worker, hands back, and does it again every poll interval against the whole backlog.
The cost is not only money. Each attempt leaves a handoff on somebody's issue saying an Igor
could not proceed, which is a notification to a person who cannot act on it either.

Recurrence is the trigger, except for the two conditions below. How many occurrences count as
recurring is left to *No recurrence count or cooldown is fixed here*. A first occurrence is information — an unverified pull request still
carries the diff, and a handoff naming the missing command is how the cure gets found at all.
The twentieth is waste, whatever the cause.

Two conditions open on their first occurrence. The first is a refused GitHub App credential,
which stops the Igor itself. An Igor whose App is refused can do nothing on GitHub, so no item
it takes could find the cure, and `app-identity` already requires that it take no new item while
refused. The second is a seat file Igor fails to decrypt. Igor reads the seat files at start
and, once #176 specifies pulling the lore checkout, on each pull. The first read that fails to
decrypt a seat's file opens the condition on that seat. That condition SHALL clear when a later
read decrypts the file, and SHALL NOT clear by a probe item: the cooldown and probe of *A
condition clears by not recurring, and a probe is what observes that* do not apply to it. It
takes the seat out of every role's choice and stops no role (*A condition's scope is its cure's
scope*). Such a seat is never chosen and never probed, so no run or probe item ever uses it, and
reading the file again is the only observation of its cure (seat-budget's *A seat's token
travels as ciphertext in its file*).

#### Scenario: A recurring condition stops the scope

- **WHEN** one cure key has been recorded as the cause of a handoff enough times
- **THEN** the scope that key names takes no new items

#### Scenario: A first occurrence is not a condition

- **WHEN** a cure key is recorded for the first time, other than a refused App credential or a
  seat file Igor fails to decrypt
- **THEN** work continues, because one occurrence is what finds the cure

#### Scenario: A refused App credential stops at once

- **WHEN** GitHub refuses the Igor's App credential once
- **THEN** the Igor-scoped condition opens, and the Igor takes no new item

#### Scenario: A seat file that fails to decrypt opens at once

- **WHEN** a read of the seat files fails to decrypt a seat's file for the first time
- **THEN** the condition on that seat opens, without waiting for a recurrence

#### Scenario: A good read clears the decryption condition

- **WHEN** a later read of the seat files decrypts that seat's file
- **THEN** the condition on that seat clears, with no cooldown waited and no probe item taken

#### Scenario: The stop names its cure

- **WHEN** a scope stops on a condition
- **THEN** it states the cure key and what changing it would take, rather than reporting itself
  unavailable

#### Scenario: The record says which kind of idle this is

- **WHEN** a cycle takes no work because a condition is open
- **THEN** the decision record names the condition and its key, distinctly from an exhausted
  budget, from pacing, and from an empty queue

### Requirement: A condition's scope is its cure's scope

A condition SHALL be keyed by what would cure it, and SHALL stop exactly what that cure governs:
a refused command stops the role whose `commands` refused it, an unreadable seat is taken out of
the choice of every role drawing on that seat, a credential belonging to an Igor stops that Igor.
A role with another eligible seat SHALL keep working on it (seat-budget's *A role draws on the
seat with the most headroom*). A role whose seats are all under open conditions SHALL stop. A
role with no eligible seat, where some but not all of its seats are under open conditions, SHALL
hand off, naming those conditions, as seat-budget's requirement says. A condition on a seat whose
file Igor could not decrypt SHALL stop no role, whatever the role's other seats are under: the
seat counts as one at its line, as seat-budget's *A seat's token travels as ciphertext in its
file* says, which also says when the condition opens and clears. A condition
SHALL be rebuilt from the execution log on the state branch, with no stored record of its own:
from the run rows that carry its cure key, and from condition rows the loop appends for what no
run shows, such as a probe being taken. Every Igor appends to the one log, so the same cure met
by several Igors is one condition.

Where the cure key does not by itself identify what is stuck, each occurrence SHALL also carry a
discriminator: an opaque value naming what the condition was observed against, absent wherever
the key already says it. Occurrences observed against different discriminators are different
occurrences of the same condition — one does not count toward the other, and a handoff carrying
a new one closes the open occurrence and starts a new count rather than extending it. The
discriminator qualifies the occurrence and never the scope: a key naming a seat is seat-scoped
however many discriminators that seat has been observed against.

For most cures the key is the identity. `role:web:commands` fully says what is stuck and what a
person would edit, and two Igors meeting it met the same thing. A key naming a seat's credential
names the seat and not the credential, so two different tokens on one seat produce the same key. A
credential condition stops the seat only while it is about the credential the seat resolves now, and
a condition rebuilt from the key alone cannot tell whether it is. A condition is an occurrence and
not a thing: a cure key opens, clears and opens again over its life, and a condition keyed on the
cure alone would mix the counts of every time it opened. The discriminator is the part of an
occurrence's identity the cure key cannot express, which is why it is on every row of that
occurrence rather than alongside it as context.

**No condition state is stored apart from the log.** A summary written beside a log can disagree
with it, a run logged and its summary not updated or the reverse, and that disagreement is a bug
nobody can diagnose from either side. Rebuilding every condition from one log rules it out, and
appends from several Igors cannot overwrite each other. Rows that are not runs carry a kind, so
every reader that counts runs, such as spend attribution, skips them.

Keying by the process that hit the condition would count one cure five times, back off five
times over, and clear five times — with the fifth Igor still discovering for itself something
four others already recorded. The cure is the thing that is singular; everything else is a
witness to it.

Scoping by cure also keeps the stop as small as it can honestly be. A role refused one command
is the only thing that refusal says anything about, and stopping the fleet for it wastes
capacity that was never affected.

#### Scenario: One cure met by several Igors is one condition

- **WHEN** five Igors each hand back on the same cure key, having observed it against the same
  thing
- **THEN** it is one condition, counted once toward its recurrence and cleared once

#### Scenario: A cure key that does not identify what is stuck carries a discriminator

- **WHEN** a cure key names a seat's credential, which does not say which credential
- **THEN** each occurrence carries what the condition was observed against, and a handoff observed
  against a different one is a new occurrence rather than the next count of the open one

#### Scenario: A role-scoped condition leaves other roles working

- **WHEN** a role's allowlist refuses a command it needs
- **THEN** that role stops and roles that do not share the cure continue

#### Scenario: A seat-scoped condition stops every role on that seat

- **WHEN** a seat's token cannot be read, for a reason other than a seat file Igor cannot
  decrypt, and it is the only seat serving each role drawing on it
- **THEN** every role drawing on that seat stops, whatever their own configuration says

#### Scenario: An undecryptable seat's condition stops no role

- **WHEN** the only seat serving a role is under a condition because Igor could not decrypt its
  file
- **THEN** the role does not stop, and hands off naming the condition

#### Scenario: A seat-scoped condition passes the seat over for a role with another seat

- **WHEN** a seat's token cannot be read, and a role drawing on it is served by another eligible
  seat
- **THEN** that role draws on the other seat and does not stop

#### Scenario: A probe is taken once

- **WHEN** a condition's cooldown has passed and one Igor has appended a row saying it is taking
  the probe
- **THEN** no other Igor takes a probe item for that condition until the probe's outcome is in
  the log

#### Scenario: The count survives the process

- **WHEN** a loop restarts while a condition is open
- **THEN** the condition and its count are read back rather than starting again from zero

### Requirement: A seat's refused credential is a condition on that seat

A run the provider refuses for authentication SHALL mint `seat:<id>:credential` for the seat it
ran on, observed against a full cryptographic hash of the credential the run used. The refusal
SHALL be recognised by the provider's own structured verdict, an authentication-error status, and
never by the wording of a message, and only where the run also did not finish. A run that failed
for any other reason SHALL NOT mint it.

A seat whose credential condition is open SHALL be passed over before its headroom is checked,
whatever its own reading says, and the reason given SHALL be that the provider refused its
credential, not that its usage could not be read and not that it has no headroom.

Nothing on the machine separates a revoked credential from a working one: `/usage` exits zero for
either, and `claude auth status` reports the same fields for a valid `setup-token` and for a
garbage string. The record of runs the provider refused is the only account of a refused
credential, which is why the seat's own reading cannot overrule it.

"Did not finish" is asked differently for a run that exited non-zero and one that exited zero. A
non-zero exit already says the run did not finish, so it is a refusal even where the run's JSON
result says nothing about erroring. A run that exited zero, and may have published a pull
request, is a refusal only where its JSON result says it errored. The looser test Igor uses when
it decides whether to record a run is wrong here: being loose there costs a spurious record, while
here it costs a working seat, repeatedly.

The hash is a full SHA-256, never a prefix, a suffix or a short digest. Execution records are
committed, and a few characters of a token are credential material; a short digest is cheap to
collide, and a collision reads as "the same credential resolved", which is exactly what clears a
credential condition. For a seat whose file carries `encrypted_token`, the credential hashed is
the decrypted token, never the ciphertext (seat-budget's *A seat's token travels as ciphertext in
its file*). Every seat file names a token source, so no seat's credential is an ambient one.

#### Scenario: A refused credential is named where it is refused

- **WHEN** a run that did not finish comes back with the provider's authentication-error status
- **THEN** `seat:<id>:credential` is minted for the seat it ran on
- **AND** the execution record carries a full hash of the credential the run used

#### Scenario: A failure that is not a credential refusal never counts

- **WHEN** a seat's runs fail repeatedly for any other reason
- **THEN** no credential condition opens, and the seat is still chosen

#### Scenario: A seat's own reading does not overrule the condition

- **WHEN** a seat with an open credential condition reports headroom, or reports nothing at all
- **THEN** it is passed over, and the reason is the refused credential

#### Scenario: Re-encrypting a lent token is the same credential

- **WHEN** a lender encrypts the same token again, and the new ciphertext merges
- **THEN** the hash is unchanged, and an open credential condition stays open

#### Scenario: The published record discloses no credential

- **WHEN** a refusal is recorded to a log that is committed
- **THEN** it carries a full cryptographic hash of the credential and no part of the credential

### Requirement: Reporting tells a refused credential from an unreadable one, and clears nothing

Budget reporting SHALL show a seat with an open credential condition on a line of the seat's own,
distinctly from a seat whose credential could not be read. It SHALL offer a way to print which
credential resolves for each seat, identified by its source and its hash and never by the
credential itself, how many runs the provider refused it on, and when its next
probe is due. Reading any of this SHALL NOT clear the condition, and no command SHALL clear it.

The two are fixed by different people in different places: one is a token this machine could not
read, the other a token the provider read and refused. A report that merged them would send somebody
to check the seat's `IGOR_SEAT_<ID>` variable or the private key file that `seatKey` names, when
either is correct. The line is the seat's, not each window's, because a refused credential is true
of both windows at once and of a seat with no window figures at all.

There is no reset command because replacing a revoked credential always means presenting a
different string, and the next resolution's hash is that fact. A command that cleared the
condition on request would clear it for an operator who believed they had fixed the credential
and had not, and the seat would go straight back to failing items.

#### Scenario: A stopped seat reads as stopped on its credential

- **WHEN** an operator inspects the budget and a seat's credential condition is open
- **THEN** the report says so once, for the seat
- **AND** it does not report that seat as having an unreadable credential

#### Scenario: The condition can be inspected without being cleared

- **WHEN** an operator asks for the credential state
- **THEN** the credential that resolves, the number of refusals and when the next probe is due
  are printed
- **AND** the condition is unchanged by having been read
