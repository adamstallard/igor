## MODIFIED Requirements

### Requirement: Execution obtains a disposable working tree through one seam

Execution is the only stage needing a checkout; discovery, triage, claiming and state all go
through the API. Execution SHALL obtain its working tree through a single provisioning seam and
SHALL treat that tree as disposable, making no assumption that a checkout persists between
tasks or is shared with another task. The tree SHALL be released when the task ends, whatever
its outcome.

Nothing a worker writes SHALL reach a later task, except what lies outside the reset of the
worker's home, which `pinned-skills`' *Every call in the worker's home starts from Igor's
template* defines.

#### Scenario: Working tree provisioned for a task that needs one

- **WHEN** a claimed item is executed
- **THEN** the working tree is obtained through the provisioning seam
- **AND** no other stage of the loop requires a checkout

#### Scenario: No state carries between tasks

- **WHEN** a task begins in a working tree
- **THEN** nothing a worker wrote in an earlier task reaches it, except what lies outside the
  reset of the worker's home: `~/.gitconfig`, files a repository's tests cache in the home, any
  other file left in the home outside `~/.claude` and `~/.claude.json`,
  `~/.claude/.credentials.json`, files left outside the home wherever the worker's user can
  write, and what a process that escaped the run's process group writes: until the end of the
  task with a worker user, and at any time in same-user mode, where nothing kills it

#### Scenario: The tree is released on failure as well as success

- **WHEN** a task ends in failure, handoff, or a stop
- **THEN** its working tree is released

#### Scenario: The provisioning strategy is replaceable

- **WHEN** the way trees are provisioned changes
- **THEN** only the seam changes
- **AND** no requirement above depends on trees being clones, worktrees, or any other shape
