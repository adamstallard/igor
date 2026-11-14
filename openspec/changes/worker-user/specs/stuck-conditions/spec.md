## ADDED Requirements

### Requirement: A failed worker spawn is a condition on its instance

Under `igor serve`, each failed `sudo` spawn of the worker, and each refused check that
`task-execution` counts as a failed spawn, SHALL be recorded under
`instance:<role>@<host>:sudoers`, `<host>` being the system's host name. A role's
*instance* is its `igor serve` processes on one host; a condition on it SHALL stop new items only for
that instance. Each run row SHALL name its instance, and a clean run ends the instance's count. The stop SHALL
name the worker user's sudoers line and the host.

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

A condition SHALL be keyed by its cure and stop exactly what that cure governs: a refused command
its role, an unreadable seat every role on it, an Igor's credential that Igor, and a failed worker
spawn its instance. It SHALL be rebuilt from the execution log alone. Where the key does not say
what is stuck, each occurrence SHALL carry a discriminator naming what it was observed against;
occurrences are counted apart by it, and it SHALL never change the scope.

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

An open condition SHALL clear when it stops recurring. After a cooldown the scope SHALL take one
item, the next it would take: if that item does not meet the condition, the condition SHALL
clear; if it does, the scope SHALL stop for a longer cooldown. A condition with a discriminator
SHALL also clear at once when the scope resolves a different one. A sudoers condition on an
instance clears only as *A sudoers condition clears only on a passing check at a cycle's start*
says.

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
