## ADDED Requirements

### Requirement: Setup is reported by one command, over what configuration alone cannot show

A single command SHALL report whether a configured lore repository is wired to work, covering
what neither the configuration nor an entry can show on its own. It SHALL inspect at least:

- **The destination.** That it resolves, is inside a git repository, and has an `origin` remote
  naming a repository on the code host.
- **Roles.** That every role file under the destination resolves, and that at least one role
  names at least one source. A role naming no source discovers nothing, and nothing else
  refuses it.
- **A removal is permitted.** That the org-level `commands` list permits removing a tracked
  file, reported from the point at which a removal can be published at all. Until then it is
  not a finding.
- **Direct pushes to the default branch are prevented.** Promotion reconciles pull requests, so
  an entry pushed straight to the default branch has nothing to promote it, stays provisional,
  never fires, and is reported nowhere.
- **Approval is not required on a pull request.** No account may approve its own pull request,
  so where the store has no second account able to approve, requiring approvals blocks
  promotion outright.
- **The merge-triggered reconciliation workflow is present on the default branch.** Without it
  promotion depends on someone having Igor installed and remembering to run it.
- **The workflow's own push is not blocked.** Where the default branch is protected and the
  workflow is present, that the actor the workflow pushes as may bypass the protection.
- **The state branch.** That it is reachable, and that the credential holds the write permission
  pushing to it requires.
- **Write access for the account that claims.** The code host accepts an assignment from an
  account without write access and silently drops it, so the permission SHALL be reported
  before anything is claimed rather than inferred from a claim that did not stick.

A condition another command already reports, or that the configuration loader already refuses,
SHALL NOT be re-implemented here; where the report would otherwise be silent about it, the
report SHALL name the command that covers it.

#### Scenario: Direct pushes to the default branch are possible

- **WHEN** the destination's default branch does not require a pull request before merging
- **THEN** it is reported as a finding
- **AND** the finding states that an entry committed directly stays provisional and never fires

#### Scenario: Approvals are required

- **WHEN** the destination requires an approving review on a pull request
- **AND** no account other than the one that proposes can approve
- **THEN** it is reported as a finding
- **AND** the finding states that no account may approve its own pull request

#### Scenario: Approvals are required where somebody else can give one

- **WHEN** the destination requires an approving review
- **AND** another account with write access could approve it
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

#### Scenario: A role names no source

- **WHEN** no role under the destination names a source
- **THEN** it is reported as a finding, because such a role discovers nothing and says nothing

#### Scenario: A role that does not resolve

- **WHEN** a role file fails to resolve — naming a seat nobody declared, or naming none where
  seats are declared
- **THEN** it is reported as a finding naming that role
- **AND** the remaining roles are still checked

#### Scenario: Removals are not permitted

- **WHEN** removals can be published, and the org-level `commands` list permits no removal of a
  tracked file
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
whole of its contract: a diagnostic that can change branch protection is one an operator
hesitates to run, and hesitating to run it is the failure this exists to remove.

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
operator performs on the code host from one a command performs. Several remedies are settings
changes no command may make, and a report that names a problem without naming who can act on it
leaves the reader exactly where the prose left them.

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
