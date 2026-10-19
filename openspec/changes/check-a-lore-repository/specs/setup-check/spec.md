## ADDED Requirements

### Requirement: Setup is reported by one command, over what configuration alone cannot show

A single command SHALL report whether a configured lore repository is wired to work, covering
what neither the configuration nor an entry can show on its own. *The credential* below is the
code-host credential the command runs with, such as the person's own `gh` login or a CI token;
a role's App is read with that App's own key, where the command's environment holds it. It SHALL
inspect at least:

- **The destination.** That it resolves, is inside a git repository, and has an `origin` remote
  naming a repository on the code host.
- **Roles.** That every role file under the destination resolves, and that at least one role
  names at least one source.
- **Every role has a seat.** A role has a seat to spend from where the `seat:` or `pool:` it
  names, or inherits from a parent role file such as `roles/org.yaml`, resolves to at least one
  declared seat, whether or not that seat has budget left. A role with none
  SHALL be a finding, whether or not any seat is declared. Where seats are declared, resolving
  the role already fails, and the role is reported once, as a role that does not resolve.
- **A removal is permitted.** That the org-level `commands` list permits removing a tracked
  file.
- **Direct pushes to the default branch are prevented.** An entry pushed straight to the default
  branch is never promoted, as lore-review's *Lore reaches the default branch by pull request*
  says.
- **Approval is not required on a pull request.** Where the lore repository has no second person able to
  approve, requiring approvals blocks promotion outright, for the reasons lore-review's *Lore
  reaches the default branch by pull request* and task-execution's *A person approves every Igor
  pull request* give.
- **The merge-triggered reconciliation workflow is present on the default branch.** Without it
  promotion depends on someone having Igor installed and remembering to run it.
- **The workflow's own push is not blocked.** Where the default branch is protected and the
  workflow is present, that the actor the workflow pushes as may bypass the protection.
- **The state branch.** That it is reachable, and that the credential holds the write permission
  pushing to it requires.
- **Each role's GitHub identity can claim.** On GitHub every Igor is a GitHub App, one per
  role, claiming an issue with its `igor:<role>` label and a claim comment. For each role that
  claims on GitHub, the report SHALL say whether its identity is an App installed on the
  repository it claims on, with the permissions the label and the comment need. These SHALL be
  read from the App's installation, so the check works on a repository where nothing has been
  claimed yet. A role that claims only on Linear has no such App, and the
  report SHALL say the check does not apply to it.

A condition another command already reports, or that the configuration loader already refuses,
SHALL NOT be re-implemented here; where the report would otherwise be silent about it, the
report SHALL name the command that covers it. A per-role condition, such as a role that does not
resolve or an App that cannot claim, is refused at start by `igor run` or `igor serve` only for
the role that command runs, so the report SHALL check it for every role.

#### Scenario: Direct pushes to the default branch are possible

- **WHEN** the destination's default branch does not require a pull request before merging
- **THEN** it is reported as a finding
- **AND** the finding states that an entry committed directly stays provisional and never fires

#### Scenario: Approvals are required

- **WHEN** the destination requires an approving review on a pull request
- **AND** no person other than the one that proposes can approve
- **THEN** it is reported as a finding
- **AND** the finding states that no account may approve its own pull request

#### Scenario: Approvals are required where somebody else can give one

- **WHEN** the destination requires an approving review
- **AND** another person with write access could approve it
- **THEN** the check passes, and the report states that requiring approvals blocks self-merge

#### Scenario: The reconciliation workflow is absent

- **WHEN** the default branch carries no merge-triggered reconciliation workflow
- **THEN** it is reported as a finding
- **AND** the finding states that promotion then depends on someone running reconciliation by
  hand

#### Scenario: The workflow's actor cannot bypass the protection

- **WHEN** the default branch is protected, the workflow is present, and the actor it pushes as
  is not permitted to bypass the protection
- **THEN** it is reported as a finding
- **AND** the finding states that the workflow's own push is blocked by the rule it exists to
  work around

#### Scenario: A role's App cannot label the repository it claims on

- **WHEN** a role's App is not installed on the repository it claims on, or its installation
  cannot write issues there
- **THEN** it is reported as a finding naming that role and the permission it lacks

#### Scenario: A role names no source

- **WHEN** no role under the destination names a source
- **THEN** it is reported as a finding, because such a role discovers nothing and says nothing

#### Scenario: A role that does not resolve

- **WHEN** a role file fails to resolve, such as by naming a seat nobody declared
- **THEN** it is reported as a finding naming that role
- **AND** the remaining roles are still checked

#### Scenario: A destination that is not a git repository

- **WHEN** the destination is not inside a git repository, or has no `origin` remote naming a
  repository on the code host
- **THEN** it is reported as a finding naming what is missing

#### Scenario: An unreachable state branch

- **WHEN** the state branch cannot be read
- **THEN** it is reported as a finding

#### Scenario: A credential that cannot push to the state branch

- **WHEN** the credential's permission on the repository does not allow pushing to the state
  branch
- **THEN** it is reported as a finding naming the permission it lacks

#### Scenario: A role's App is read before any claim

- **WHEN** the command runs before any item has been claimed
- **THEN** each role's App installation and permissions are still reported

#### Scenario: A role whose App key is not available

- **WHEN** the command's environment does not hold a role's App key
- **THEN** that role's App check is reported as unchecked, naming what is missing

#### Scenario: A role that claims only on Linear

- **WHEN** a role claims only on Linear
- **THEN** the report says the App check does not apply to it

#### Scenario: Approvals that cannot be graded

- **WHEN** the destination requires an approving review, and the list of people who could
  approve cannot be read
- **THEN** the approval check is reported as unchecked, with the reason

#### Scenario: A role with no seat

- **WHEN** a role has no seat to spend from, whether or not the configuration declares any seat
- **THEN** it is reported as a finding naming that role, once
- **AND** the remaining roles are still checked

#### Scenario: Removals are not permitted

- **WHEN** the org-level `commands` list permits no removal of a tracked file
- **THEN** it is reported as a finding
- **AND** the finding states that the worker cannot delete a file and that the refusal would
  otherwise arrive after the work is paid for

#### Scenario: A condition another command already reports

- **WHEN** a seat names a token source that cannot be read
- **THEN** the report names the command that reports seats rather than reading the token itself

#### Scenario: A clean setup says what it checked

- **WHEN** every check passes
- **THEN** the report says so, naming what was checked rather than printing nothing

### Requirement: The check reports and never repairs

The command SHALL make no change to the destination, to its repository's settings, or to
anything on the code host. It SHALL offer no option to repair what it finds. Reading is the
whole of its contract.

Where a property cannot be read without writing — whether a branch can actually be pushed to —
the command SHALL report the permission that governs it rather than performing the write.

#### Scenario: A finding is not corrected

- **WHEN** branch protection is off
- **THEN** it is reported
- **AND** branch protection is not enabled, and no setting on the code host is altered

#### Scenario: No repair option exists

- **WHEN** the command is invoked asking it to fix what it finds
- **THEN** no such option is accepted

#### Scenario: Writability is read, not tested

- **WHEN** the state branch's writability is checked
- **THEN** the credential's permission is read
- **AND** nothing is pushed, committed or created to find out

### Requirement: Every finding names its remedy and who performs it

Every finding SHALL state what to do about it and who can do it, distinguishing a remedy the
operator performs on the code host from one a command performs.

#### Scenario: A remedy only a person can perform

- **WHEN** the workflow's actor is not permitted to bypass the default branch's protection
- **THEN** the finding names the setting to change on the code host
- **AND** states that it is the operator's to change, not the command's

#### Scenario: A remedy a command performs

- **WHEN** the reconciliation workflow is absent
- **THEN** the finding names the command that writes it

### Requirement: A check that cannot be made is skipped and said, not failed

Where a check cannot be performed — no credential, or a credential that may not read what the
check reads — the command SHALL skip that check, report it as unchecked with the reason, and
continue with the rest. It SHALL NOT abort the run, and SHALL NOT report an unchecked condition
as passing.

#### Scenario: No credential at all

- **WHEN** no code-host credential is available
- **THEN** every check needing one is reported as unchecked, with that reason
- **AND** the checks that read only the destination and its files still run

#### Scenario: A credential that may not read a setting

- **WHEN** the credential cannot read the default branch's protection or its bypass list
- **THEN** those checks are reported as unchecked, naming the permission they would need
- **AND** the remaining checks still run

#### Scenario: Unchecked is not passing

- **WHEN** a check is skipped
- **THEN** the report distinguishes it from a check that passed

### Requirement: The exit status distinguishes a finding from a clean run

The command SHALL exit non-zero when it has at least one finding, and zero otherwise, so that it
can be a step in CI or a smoke test after setup. A skipped check is not a finding and SHALL NOT
by itself make the exit status non-zero; a run in which every check was skipped SHALL exit zero
and SHALL say plainly that nothing was checked, so that a green exit is never mistaken for a
verified setup.

#### Scenario: Something is wrong

- **WHEN** at least one check reports a finding
- **THEN** the command exits non-zero

#### Scenario: Everything checked passes

- **WHEN** every check that ran passed, and some were skipped
- **THEN** the command exits zero
- **AND** the report states which were skipped

#### Scenario: Nothing could be checked

- **WHEN** every check was skipped
- **THEN** the command exits zero
- **AND** the report states that nothing was checked, rather than reporting a clean setup
