## ADDED Requirements

### Requirement: A failed worker spawn is a condition on its instance

Under `igor serve`, the Igor SHALL record each of these under a cure key scoped to the instance
that met it, `igor@<role>-<rank>`, the instance being one rank of a role as `concurrent-instances`
(#179) numbers them:

- a spawn of the worker through `sudo` that fails, meaning `sudo` refused it or the process could
  not be started; the worker's own exit status is never a spawn failure;
- a refused `sudo -n -u <worker user> true` check that `task-execution` requires, before a spawn,
  a later `claude -p`, one of #189's checks or a kill, except the check before the start check's
  metadata probe, which refuses the start instead, and one at process exit, which is written to
  standard error only.

The instance SHALL be a scope beside the role, the seat and the Igor that this capability's
requirement *A condition's scope is its cure's scope* names, and #101's code SHALL read the
instance's key as naming that scope. A condition on it SHALL stop only that instance taking new items; other
ranks of the role, other roles and the Igor go on, and `igor serve` does not exit, as `stopped-scope-visible`
(#82) requires of every condition. The condition SHALL be counted, opened and rebuilt from the
execution log as every condition is, so it opens once its occurrences reach #101's recurrence threshold. To
make that possible, each run row SHALL name the instance that ran it. The stop SHALL name the
cure as the sudoers line for `igor-worker-<role>-<rank>` on the host that instance runs on.

It SHALL clear on the instance's next spawn of its worker that succeeds, which is the spawn of
the probe item that *A condition clears by not recurring, and a probe is what observes that* lets
through after the cooldown (decision 31). A check refused later in that run is a new occurrence,
counted from one.

#### Scenario: A recurring spawn failure stops only its instance

- **WHEN** rank 2 of role `dev` fails to spawn its worker through `sudo` as many times as #101's
  recurrence threshold, and rank 1 of `dev` spawns its worker normally
- **THEN** a condition opens on `igor@dev-2`, rank 2 takes no new item, rank 1 and every other
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

#### Scenario: A probe's successful spawn clears the condition

- **WHEN** the condition on an instance has waited its cooldown, the sudoers line has been fixed,
  and the instance's probe item spawns its worker
- **THEN** the condition clears, and the instance takes items again

#### Scenario: A check refused after the probe's spawn starts a new count

- **WHEN** an instance's probe item spawns its worker, and the check before a later `claude -p`
  in that run is refused
- **THEN** the condition has cleared, and the refusal is a new first occurrence that stops
  nothing
