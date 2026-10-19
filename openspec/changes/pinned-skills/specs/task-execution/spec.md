## MODIFIED Requirements

### Requirement: Execution obtains a disposable working tree through one seam

Execution is the only stage needing a checkout; discovery, triage, claiming and state all go
through the API. Execution SHALL obtain its working tree through a single provisioning seam and
SHALL treat that tree as disposable, making no assumption that a checkout persists between
tasks or is shared with another task. The tree SHALL be released when the task ends, whatever
its outcome.

Nothing a worker writes SHALL reach a later task, except three kinds of file: files in the
worker's home that the reset leaves alone, which `pinned-skills`' *Every call in the worker's
home starts from Igor's template* defines; files the worker's user writes outside its home,
wherever it can write; and, in same-user mode, where no worker user exists, files written in
the home after a reset by a process the worker started that left the worker's process group.
Igor does not make the third happen, and in same-user mode nothing stops it.

#### Scenario: Working tree provisioned for a task that needs one

- **WHEN** a claimed item is executed
- **THEN** the working tree is obtained through the provisioning seam
- **AND** no other stage of the loop requires a checkout

#### Scenario: No state carries between tasks

- **WHEN** a task begins in a working tree
- **THEN** nothing a worker wrote in an earlier task reaches it, except the three kinds of
  file the requirement names

#### Scenario: The tree is released on failure as well as success

- **WHEN** a task ends in failure, handoff, or a stop
- **THEN** its working tree is released

#### Scenario: The provisioning strategy is replaceable

- **WHEN** the way trees are provisioned changes
- **THEN** only the seam changes
- **AND** no requirement above depends on trees being clones, worktrees, or any other shape
