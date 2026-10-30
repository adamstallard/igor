## ADDED Requirements

### Requirement: A failed worker spawn is a condition on its instance

Under `igor serve`, the Igor SHALL record each of these under the cure key `instance:<role>-<rank>:sudoers`,
scoped to the instance that met it, the instance being one rank of a role as
`concurrent-instances` (#179) numbers them, each rank unique to one process across hosts:

- a spawn of the worker through `sudo` that fails, meaning `sudo` refused it or the process could
  not be started; the worker's own exit status is never a spawn failure;
- a refused `sudo -n -u <worker user> true` check that `task-execution` requires, before a spawn,
  a later `claude -p`, one of #189's checks or a kill, except the check before the start check's
  metadata probe, which refuses the start instead, and the check before a kill at process exit,
  which is written to standard error only.

The instance SHALL be a scope beside the role, the seat and the Igor that this capability's
requirement *A condition's scope is its cure's scope* names, and #101's code SHALL read a key of
that shape, with its new `instance` prefix, as naming the instance. A condition on it SHALL stop
only that instance taking new items; other ranks of the role, other roles and the Igor go on,
and `igor serve` does not exit, as `stopped-scope-visible` (#82) requires of every condition. The
condition SHALL be counted, opened and rebuilt from the execution log as every condition is, so
it opens once its occurrences reach #101's recurrence threshold. Each run row, the line the Igor
appends to the execution log for every run, SHALL name the instance that ran it. #101 counts
occurrences in a row, and a run that records none ends the row: naming the instance lets a clean
run of that instance do so for its condition, as a clean run of a role does for a role's. The stop
SHALL name the cure as the sudoers line for `igor-worker-<role>-<rank>` on the host that
instance runs on.

The condition SHALL clear only on a passing check: never by a probe item, and with no cooldown,
since the check observes the cure without spending an item. While it is open, the instance SHALL
run the check at the start of each cycle, before taking any item; a refused check there keeps
the condition open and is not an occurrence. The instance SHALL append a condition row of kind
`check`, naming the key and saying that the check passed, only where the check clears the
condition, not on every cycle. This is how `seat-files` (#171) clears its read-cleared conditions,
in *A read-cleared condition opens on a failing read and clears on a passing one*. Those stop
nothing by themselves, while this condition stops its instance, so it is stated here rather than as one of that
kind.

#### Scenario: A recurring spawn failure stops only its instance

- **WHEN** rank 2 of role `dev` fails to spawn its worker through `sudo` as many times as #101's
  recurrence threshold, and rank 1 of `dev` spawns its worker normally
- **THEN** a condition opens on `instance:dev-2:sudoers`, rank 2 takes no new item, rank 1 and every other
  role go on taking items, and the stop names the sudoers line for `igor-worker-dev-2`

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

#### Scenario: A passing check clears the condition at a cycle's start

- **WHEN** the condition on an instance is open, its sudoers line has been fixed, and the
  instance starts its next cycle
- **THEN** its check passes, the instance appends a condition row saying so, and the condition
  clears before the instance takes an item, with no cooldown waited

#### Scenario: A refused check keeps the condition open

- **WHEN** the condition on an instance is open, its cooldown under #101 would have passed, and
  its check at a cycle's start is refused
- **THEN** the condition stays open, the instance takes no new item and no probe item, and
  nothing is appended

#### Scenario: Clean runs between two failures keep the count from growing

- **WHEN** an instance's spawn fails once, the instance then runs items with clean spawns, and a
  later spawn fails once more
- **THEN** the clean runs, each naming the instance, count as runs that did not meet the
  condition, so the two failures are not a recurrence in a row
