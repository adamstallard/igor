## ADDED Requirements

### Requirement: A failed worker spawn is a condition on its instance

Under `igor serve`, the Igor SHALL record under the cure key `instance:<role>:sudoers` each failed
`sudo` spawn of the worker, and each refused check `task-execution` records under that key. A role's
*instance* is its `igor serve` processes; a condition on it SHALL stop only the instance taking new
items. Each run row, the execution-log row a run writes, SHALL name its instance, so a clean run
ends its count. The stop SHALL name the sudoers line for `igor-worker-<role>` on the host that
failed.

#### Scenario: A recurring spawn failure stops only its instance

- **WHEN** role `dev`'s `igor serve` fails to spawn its worker through `sudo` as many times as
  #101's recurrence threshold
- **THEN** a condition opens on `instance:dev:sudoers`, a key #101's code reads as naming the
  instance, `dev`'s `igor serve` takes no new item,
  every other role goes on taking items, and the stop names the sudoers line for
  `igor-worker-dev`
- **AND** `igor serve` does not exit
- **AND** an `igor run` of `dev` is not stopped by it

#### Scenario: An open condition is rebuilt after a restart

- **WHEN** the condition on an instance is open and its `igor serve` restarts
- **THEN** the condition is rebuilt from the execution log, as every condition is, and the
  instance still takes no new item

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

#### Scenario: A refused check keeps the condition open

- **WHEN** the condition on an instance is open, its cooldown under #101 would have passed, and
  its check at a cycle's start is refused
- **THEN** the condition stays open, the instance takes no new item and no probe item, and
  nothing is appended
