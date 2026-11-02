## ADDED Requirements

### Requirement: Setup is reported by one command, over what configuration alone cannot show

A single command SHALL report whether a configured lore repository is wired to work, covering
what neither the configuration nor an entry can show on its own. *The credential* below is the
code-host credential the command runs with, such as the person's own `gh` login or a CI token;
a role's App is read with that App's own key, where the command's environment holds it, and where
it does not, that role's App check is unchecked. It SHALL inspect at least:

- **The destination.** That it resolves, is inside a git repository, and has an `origin` remote
  naming a repository on the code host.
- **Roles.** That every role file under the destination resolves, and that every role names at
  least one source.
- **Every role has a seat.** A role has a seat to spend from when resolving its seats, as
  `seat-budget` defines that for `igor serve`, yields at least one declared seat, whether or not
  that seat has budget left. It is `igor serve`'s definition because a seat is what `igor serve`
  spends. A role with none SHALL be a finding, whether or not any seat is declared. Where seats
  are declared, resolving the role also fails; the role SHALL still be reported once.
- **A removal is permitted.** That the org-level `commands` list permits removing a tracked
  file.
- **Direct pushes to the default branch are prevented.** The default branch requires a pull
  request before merging, and administrators are bound by that rule too. An entry pushed straight
  to the default branch is never promoted, as lore-review's *Lore reaches the default branch by
  pull request* says. Where administrators may bypass the rule, as classic branch protection lets
  them with `enforce_admins` off, or a ruleset whose bypass list holds the administrator role,
  an administrator can still push straight to the default branch. That SHALL be a finding, and
  the report SHALL say that administrators can bypass the rule, not that the branch is protected
  against direct pushes. For the check of the workflow's push, below, the branch still counts as
  protected: the bypass is administrators' alone, so the rule still blocks the workflow's actor.
- **Approval is not required on a pull request.** Where fewer than two people with write access
  could approve, requiring approvals blocks promotion outright, for the reasons lore-review's
  *Lore reaches the default branch by pull request* and task-execution's *A person approves every
  Igor pull request* give.
- **The merge-triggered reconciliation workflow is present on the default branch.**
- **The workflow's own push is not blocked.** Where the default branch is protected and the
  workflow is present, that the actor the workflow pushes as may bypass the protection.
- **The state branch.** That it is reachable, and that the credential holds the write permission
  pushing to it requires.
- **Each role's GitHub identity can act.** For each role that claims on GitHub, the report SHALL
  invoke the check `igor run` and `igor serve` make before discovery, surface-adapter's *An Igor
  that cannot act as its App does not start*, and report what it finds. A GitHub role's identity
  is its App (work-claiming's *On GitHub, an Igor is a GitHub App and claims with its role's
  label*). The check reads the App's installation, so it works on a repository where nothing has
  been claimed yet. A role that claims only on Linear has no such App, and the report SHALL say
  the check does not apply to it.

The command MAY invoke a check another part of Igor already makes, and SHALL NOT re-implement
one. It SHALL invoke the configuration loader's validation, in a mode that reads no secret: no
private key file, no token, and no token command run. It SHALL report each finding that
validation makes, named with its source. A configuration that fails to load is itself a finding,
and the checks that do not need it still run. Where a condition is reported only at runtime, such
as a seat whose token cannot be read, the report SHALL name the command that covers it, here
`igor budget`, rather than check it. A per-role check SHALL cover every role. `igor run` and
`igor serve` check only the role they run.

Text the report takes from repository files, such as a file name, a key or a seat's owner, SHALL
be printed so that it cannot act as a GitHub Actions workflow command: no line of the report
SHALL begin with `::` because of such text.

#### Scenario: Direct pushes to the default branch are possible

- **WHEN** the destination's default branch does not require a pull request before merging
- **THEN** it is reported as a finding
- **AND** the finding states that an entry committed directly stays provisional and never fires

#### Scenario: Administrators can push past the pull-request rule

- **WHEN** the default branch requires a pull request before merging
- **AND** administrators may bypass that rule, as with `enforce_admins` off
- **THEN** it is reported as a finding, and the report does not call the branch protected
  against direct pushes
- **AND** the finding states that an administrator can push straight to the default branch
- **AND** where the reconciliation workflow is present, the check that its actor may bypass the
  protection still runs

#### Scenario: Approvals are required

- **WHEN** the destination requires an approving review on a pull request
- **AND** fewer than two people with write access could approve
- **THEN** it is reported as a finding
- **AND** the finding states that no account may approve its own pull request

#### Scenario: Approvals are required where somebody else can give one

- **WHEN** the destination requires an approving review
- **AND** two or more people with write access could approve it
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

- **WHEN** a role's App is not installed on a repository the role works, or its installation
  lacks a permission the start-up check requires there
- **THEN** it is reported as a finding naming that role and the permission it lacks

#### Scenario: A role names no source

- **WHEN** a role under the destination names no source
- **THEN** it is reported as a finding, because such a role discovers nothing and says nothing

#### Scenario: A configuration that fails to load

- **WHEN** the configuration fails the loader's validation
- **THEN** each failure is reported as a finding, named with its source
- **AND** the checks that do not need the configuration still run

#### Scenario: A file name cannot inject a workflow command

- **WHEN** a role file is named `::add-mask::x.yaml` and the report runs in GitHub Actions
- **THEN** no line of the report begins with `::`

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

#### Scenario: The loader's validation is invoked, not re-implemented

- **WHEN** the configuration's validation finds a problem, such as a seat file carrying an
  encrypted token where no key to decrypt it is declared
- **THEN** the report shows that finding, naming the validation as its source
- **AND** no key file or token is read to produce it

#### Scenario: A condition another command already reports

- **WHEN** a seat names a token source that cannot be read
- **THEN** the report names the command that reports seats rather than reading the token itself

#### Scenario: A clean setup says what it checked

- **WHEN** every check passes
- **THEN** the report says so, naming what was checked rather than printing nothing

### Requirement: The check reports and never repairs

The command SHALL make no change to the destination, to its repository's settings, or to
anything on the code host. It SHALL offer no option to repair what it finds.

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
