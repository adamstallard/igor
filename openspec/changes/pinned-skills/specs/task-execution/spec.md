## MODIFIED Requirements

### Requirement: Execution obtains a disposable working tree through one seam

Execution is the only stage needing a checkout; discovery, triage, claiming and state all go
through the API. Execution SHALL obtain its working tree through a single provisioning seam and
SHALL treat that tree as disposable, making no assumption that a checkout persists between
tasks or is shared with another task. The tree SHALL be released when the task ends, whatever
its outcome.

#### Scenario: Working tree provisioned for a task that needs one

- **WHEN** a claimed item is executed
- **THEN** the working tree is obtained through the provisioning seam
- **AND** no other stage of the loop requires a checkout

#### Scenario: No state carries between tasks

- **WHEN** a task begins in a working tree
- **THEN** nothing a worker wrote in an earlier task reaches it, except the three kinds of
  file *Nothing a worker writes reaches a later task but three kinds of file* names

#### Scenario: The tree is released on failure as well as success

- **WHEN** a task ends in failure, handoff, or a stop
- **THEN** its working tree is released

#### Scenario: The provisioning strategy is replaceable

- **WHEN** the way trees are provisioned changes
- **THEN** only the seam changes
- **AND** no requirement above depends on trees being clones, worktrees, or any other shape

## ADDED Requirements

### Requirement: Nothing a worker writes reaches a later task but three kinds of file

Nothing a worker writes SHALL reach a later task, except three kinds of file: files in the
worker's home that the reset of `pinned-skills`' *Every model step in the worker's home starts
from Igor's template* leaves alone; files the worker's user writes outside its home; and, in
same-user mode, where no worker user exists, files written in the home after a reset by a
process the worker started that left its process group, a third kind Igor does not cause and
nothing stops.

#### Scenario: Only files outside the reset carry to a later task

- **WHEN** a worker writes a hook under `~/.claude`, a `~/.gitconfig` in its home, and a file
  outside its home that its user can write
- **AND** a later task begins in the same home
- **THEN** the hook does not reach that task
- **AND** the reset before it removes neither the `~/.gitconfig` nor the file outside the home
