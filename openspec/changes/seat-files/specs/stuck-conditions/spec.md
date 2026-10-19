## ADDED Requirements

### Requirement: A read-cleared condition opens on a failing read and clears on a passing one

A read-cleared condition SHALL be a condition on something Igor reads, such as a file, that
opens when a read of it fails and clears when a later read of it passes. It SHALL open on that
first failing read, with no recurrence count. It SHALL clear only on a passing read: never by a
probe item, and with no cooldown, since *A condition clears by not recurring, and a probe is what
observes that* does not apply to it. It SHALL stop nothing by itself. What the failed read could
not supply, such as a seat's token, is still missing, and the rule for that thing says what
follows: for a seat, seat-budget's *A role draws on the seat with the most headroom* has a role
with no other eligible seat hand off rather than stop. The condition records the fault and names its cure, and it is reported like any other
condition. A read SHALL append a condition row only where it opens or clears the condition, not on
every read.

A rule that opens a condition of this kind cites this requirement and states only what is read,
what counts as failing, and what the condition is on. Seat-budget's *A seat's token travels as
ciphertext in its file* is one such rule, for a seat file Igor fails to decrypt.

A read is its own observation of the cure. A probe item takes work to find out whether a fault
recurs; a file that reads cleanly has already shown it.

#### Scenario: A failing read opens the condition at once

- **WHEN** a read of a file that a read-cleared condition watches fails for the first time
- **THEN** the condition opens, without waiting for a recurrence

#### Scenario: A passing read clears it, with no probe

- **WHEN** a later read of that file passes
- **THEN** the condition clears, with no cooldown waited and no probe item taken

#### Scenario: The condition stops nothing by itself

- **WHEN** a read-cleared condition on a seat file is open, and the role that seat serves has
  another eligible seat
- **THEN** the role keeps working on that other seat
- **AND** only the seat whose file failed to read is out of use

## MODIFIED Requirements

### Requirement: A condition clears by not recurring, and a probe is what observes that

An open condition SHALL clear when it stops recurring, with nothing external required to
announce the cure. After a cooldown the affected scope SHALL take exactly one item; where that
item does not meet the condition it SHALL clear, and where it does the scope SHALL stop again
for a longer cooldown. An item meets the condition when its run records the same cure key again.
A read-cleared condition is the exception: it clears only as *A
read-cleared condition opens on a failing read and clears on a passing one* says, by a later read
that passes, and the scope takes no probe item for it.

A condition carrying a discriminator SHALL clear by that rule and by one more: it SHALL also
clear the moment the scope resolves a different discriminator, with no cooldown waited and no
item spent. Both hold together. A credential condition clears on a probe that does not meet it,
as every condition does, and it clears on the credential changing, which needs no probe to see.

The probe is the general observation because for most conditions nothing else is observable
from inside the loop: an allowlist edited on some other surface announces nothing, so running is
the only way to find out. A discriminator is observable. A seat resolving a credential other
than the one the condition was observed against is the cure having happened, visible before any
item is claimed — and holding such a scope for a cooldown it no longer needs keeps an operator
who has already fixed the thing waiting out a backoff that lengthens each time. That second
clear is the whole reason a credential-shaped stop was worth having, and it is kept here rather
than left to a mechanism of its own.

Nobody sends a fixed signal, and nobody should have to: the cure is a configuration change made
by whoever reads the stop, on a surface that has no channel back to the loop, and a condition
that waits to be told is a condition somebody has to remember to close. But a stopped scope runs
nothing and therefore observes nothing, so absence can never be established from inside the
stop. The probe is the only way out of that: one run buys the observation, and the cooldown
bounds what it costs to be wrong.

The probe SHALL be the next item the scope would ordinarily take, not the item that was being
worked when the condition opened. A condition is scoped to its cure and says nothing about any
item, and the item that first met it may be legitimately unworkable for its own reasons — an
Igor waiting for that one item to become available again is stopped on something unrelated to
the cure it is trying to observe.

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

#### Scenario: A read-cleared condition takes no probe item

- **WHEN** a read-cleared condition has been open past any cooldown
- **THEN** no probe item is taken for it, and it clears only when a later read passes

### Requirement: A condition that recurs stops the affected scope from taking new work

Where the same cure key is recorded as the cause of a handoff repeatedly, the scope that key
names SHALL stop taking new items until the condition clears, and SHALL say which key stopped
it and what would cure it.

An Igor stuck on its own configuration is not stuck on anything an item can fix. Nothing about
the item produced the outcome, so nothing about the next item avoids it: the loop claims,
spends a worker, hands back, and does it again every poll interval against the whole backlog.
The cost is not only money. Each attempt leaves a handoff on somebody's issue saying an Igor
could not proceed, which is a notification to a person who cannot act on it either.

Recurrence is the trigger, except for the two conditions below. A first occurrence is information — an unverified pull request still
carries the diff, and a handoff naming the missing command is how the cure gets found at all.
The twentieth is waste, whatever the cause.

Two conditions open on their first occurrence. The first is a refused GitHub App credential,
which stops the Igor itself. An Igor whose App is refused can do nothing on GitHub, so no item
it takes could find the cure, and `app-identity` already requires that it take no new item while
refused. The second is the read-cleared condition on a seat file Igor fails to decrypt, which
seat-budget's *A seat's token travels as ciphertext in its file* opens. Unlike the first, it
stops nothing (*A read-cleared condition opens on a failing read and clears on a passing one*). Such a seat is never
chosen and never probed, so no run or probe item ever uses it, and reading the file again is the
only observation of its cure.

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
- **THEN** the condition on that seat clears, as a read-cleared condition does

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
A role with another eligible seat SHALL keep working on it. Whether a role with no eligible seat
stops or hands off is seat-budget's *A role draws on the seat with the most headroom*. A
condition
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
names the seat and not the credential, so one seat's two tokens produce the identical key — and a
condition rebuilt from that key with a count and an open state cannot answer the question its own
stop turns on: is this about the credential resolving now? A condition is an occurrence and not a
thing; a cure key opens, clears and reopens over its life, so a condition keyed on the cure alone
answers for the most recent occurrence in the log when asked about the one being checked. The discriminator is the part of an
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

"Did not finish" is asked differently on the two paths into it. A non-zero exit has already said
so, so an envelope silent about erroring is still a refusal there. A run that exited zero, and
may have published a pull request, has to state that it errored before it can stop its own seat.
The looser test Igor uses to decide whether a run is worth *recording*, which does not need the
run to state that it errored, is wrong here: being permissive there costs a spurious capture, while here it costs a working seat, repeatedly.

The hash is a full SHA-256, never a prefix, a suffix or a short digest. Execution records are
committed, and a few characters of a token are credential material; a short digest is cheap to
collide, and a collision reads as "the same credential resolved", which is exactly what clears a
credential condition. For a seat whose file carries `encrypted_token`, the credential hashed is
the one seat-budget's *A seat's token travels as ciphertext in its file* defines: the decrypted
token, never the ciphertext. Every seat file names a token source, and Igor never uses a stored Claude login, so
every credential hashed is a seat's own token.

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
