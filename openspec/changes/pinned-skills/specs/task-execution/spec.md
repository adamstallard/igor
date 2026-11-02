## MODIFIED Requirements

### Requirement: Execution obtains a disposable working tree through one seam

Execution SHALL obtain its working tree through a single provisioning seam, SHALL treat it as
disposable, assuming no checkout persists between tasks or is shared with another task, and
SHALL release it when the task ends, whatever its outcome. Nothing a worker writes SHALL reach a
later task, except what the reset leaves in its home, what the user it runs as writes outside the
home, and, in same-user mode, what a process it started that left its process group writes in the
home after a reset.

#### Scenario: Working tree provisioned for a task that needs one

- **WHEN** a claimed item is executed
- **THEN** the working tree is obtained through the provisioning seam
- **AND** no other stage of the loop requires a checkout: discovery, triage, claiming and state
  all go through the API of the surface Igor works on, such as GitHub's

#### Scenario: No state carries between tasks

- **WHEN** a task begins in a working tree
- **THEN** nothing a worker wrote in an earlier task reaches it, except three kinds of file: files
  in the worker's home that the reset of `pinned-skills`' *Every model step in the worker's home
  starts from Igor's template* leaves alone; files the user the worker runs as (the worker user,
  or in same-user mode the user Igor runs as) writes outside the worker's home, wherever it can
  write; and, in same-user mode, where no worker user exists, files written in
  the home after a reset by a process the worker started that left the worker's process group
- **AND** Igor does not cause the third kind, and nothing stops it

#### Scenario: The tree is released on failure as well as success

- **WHEN** a task ends in failure, handoff, or a stop
- **THEN** its working tree is released

#### Scenario: The provisioning strategy is replaceable

- **WHEN** the way trees are provisioned changes
- **THEN** only the seam changes
- **AND** no requirement above depends on trees being clones, worktrees, or any other shape
