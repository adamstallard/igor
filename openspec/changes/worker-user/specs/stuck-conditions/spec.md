## ADDED Requirements

### Requirement: A failed worker spawn is a condition on its instance

Under `igor serve`, each failed `sudo` spawn of the worker, and each refused check
`task-execution` counts as one, SHALL be recorded under the cure key
`instance:<role>@<host>:sudoers`, `<host>` being the host's name. A role's *instance* is its
`igor serve` processes on one host; a condition on it SHALL stop only that instance taking new
items. Each run row SHALL name its instance, so a clean run ends its count. The stop SHALL name the
sudoers line for `igor-worker-<role>` and the host.

#### Scenario: A recurring spawn failure stops only its instance

- **WHEN** role `dev`'s `igor serve` fails to spawn its worker through `sudo` as many times as
  #101's recurrence threshold
- **THEN** a condition opens on `instance:dev@host-a:sudoers`, a key #101's code reads as naming
  the instance, `dev`'s `igor serve` on `host-a` takes no new item, every other role goes on
  taking items, and the stop names the sudoers line for `igor-worker-dev`
- **AND** `igor serve` does not exit
- **AND** an `igor run` of `dev` is not stopped by it

#### Scenario: An open condition is rebuilt after a restart

- **WHEN** the condition on an instance is open and its `igor serve` restarts
- **THEN** while the sudoers line is still broken, the start check's
  `sudo -n -u igor-worker-<role> true` refuses the start with status 78, and no cycle runs
- **AND** once the line is fixed and the process starts, the condition, rebuilt from the
  execution log as every condition is, clears at the first cycle's check, before the instance
  takes an item

#### Scenario: One host's broken sudoers line stops only that host

- **WHEN** role `dev` is served on `host-a` and `host-b`, and only `host-a`'s sudoers line is
  broken
- **THEN** only `host-a`'s failures count toward `instance:dev@host-a:sudoers`, and `host-b`'s
  clean runs and passing checks neither end that count nor clear that condition
- **AND** while it is open, `dev`'s `igor serve` on `host-b` goes on taking items

#### Scenario: The stop names the host whose line to fix

- **WHEN** a condition opens on `instance:dev@host-a:sudoers`
- **THEN** the stop names the sudoers line for `igor-worker-dev` and the host `host-a`

#### Scenario: An igor run's rows leave the count alone

- **WHEN** an `igor run` of role `dev` runs items between two failed spawns of `dev`'s
  `igor serve`
- **THEN** its run rows name no instance, so they neither count as failures nor end the
  instance's recurrence in a row

#### Scenario: A first spawn failure stops nothing

- **WHEN** an instance's `sudo` spawn of its worker fails once
- **THEN** the failure is recorded under the instance's cure key, and the instance goes on taking
  items

#### Scenario: A refused check counts as a spawn failure does

- **WHEN** an instance's check before a later `claude -p` in its worker's tree is refused
- **THEN** the run fails, and the refusal is recorded under the instance's cure key

#### Scenario: A worker that exits non-zero is not a spawn failure

- **WHEN** an instance's worker starts and later exits with a non-zero status
- **THEN** nothing is recorded under the instance's cure key

#### Scenario: Clean runs between two failures keep the count from growing

- **WHEN** an instance's spawn fails once, the instance then runs items with clean spawns, and a
  later spawn fails once more
- **THEN** the clean runs, each naming the instance, count as runs that did not meet the
  condition, so the two failures are not a recurrence in a row

### Requirement: A sudoers condition clears only on a passing check at a cycle's start

While the condition on an instance is open, the instance SHALL run its `sudo -n -u <worker user>
true` check at the start of each cycle, before taking any item, and the condition SHALL clear only
when that check passes: never by a probe item, and with no cooldown. A refused check there SHALL
keep the condition open and SHALL NOT count as an occurrence. The instance SHALL append a condition
row whose `kind` is `check`, naming the key, only where the check clears the condition.

#### Scenario: A passing check clears the condition at a cycle's start

- **WHEN** the condition on an instance is open, its sudoers line has been fixed, and the
  instance starts its next cycle
- **THEN** its check passes, the instance appends a condition row saying so, and the condition
  clears before the instance takes an item, with no cooldown waited
- **AND** that row's `kind` is `check`, and it names the key `instance:<role>@<host>:sudoers`
  of the condition it clears

#### Scenario: A refused check keeps the condition open

- **WHEN** the condition on an instance is open, its cooldown under #101 would have passed, and
  its check at a cycle's start is refused
- **THEN** the condition stays open, the instance takes no new item and no probe item, and
  nothing is appended

## MODIFIED Requirements

### Requirement: A condition's scope is its cure's scope

A condition SHALL be keyed by what would cure it, and SHALL stop exactly what that cure governs:
a refused command stops the role whose `commands` refused it, an unreadable seat stops every
role drawing on that seat, a credential belonging to an Igor stops that Igor, and a failed worker
spawn stops its instance, a role's `igor serve` processes on one host. A condition
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
stop turns on: is this about the credential resolving now? The discriminator answers it. A condition is an occurrence and not a
thing; a cure key opens, clears and reopens over its life, so a condition keyed on the cure alone
answers for the last occurrence when asked about this one. The discriminator is the part of an
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

- **WHEN** a seat's token cannot be read
- **THEN** every role drawing on that seat stops, whatever their own configuration says

#### Scenario: A probe is taken once

- **WHEN** a condition's cooldown has passed and one Igor has appended a row saying it is taking
  the probe
- **THEN** no other Igor takes a probe item for that condition until the probe's outcome is in
  the log

#### Scenario: The count survives the process

- **WHEN** a loop restarts while a condition is open
- **THEN** the condition and its count are read back rather than starting again from zero

### Requirement: A condition clears by not recurring, and a probe is what observes that

An open condition SHALL clear when it stops recurring, with nothing external required to
announce the cure. After a cooldown the affected scope SHALL take exactly one item; where that
item does not meet the condition it SHALL clear, and where it does the scope SHALL stop again
for a longer cooldown. A sudoers condition on an instance is the exception: it clears only as *A
sudoers condition clears only on a passing check at a cycle's start* says, with no cooldown and no
probe item.

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
nothing and therefore observes nothing, so that the condition no longer recurs can never be
established from inside the stop. The probe is the only way out of that: one run buys the observation, and the cooldown
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
