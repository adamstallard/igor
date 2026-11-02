**[#156](https://github.com/adamstallard/igor/pull/156)'s implementation, App support, has
merged:** 3.7 checks Apps only, with no check of a claiming account's write access.

## 1. The agreement (gate one — this pull request)

- [x] 1.1 Five `setup-check` requirements: the surface and the four constraints — read-only,
      remedy and actor, degrade rather than fail, exit status
- [x] 1.2 Say which rows of `docs/deployment.md`'s "When something is wrong" table become
      checks and which stay prose, and why each one that dissolves does
- [x] 1.3 Say that the nested-store check is dissolved by
      [#111](https://github.com/adamstallard/igor/pull/111) rather than omitted
- [x] 1.4 `design.md` for the five choices with live alternatives: the name; the refusal of
      `--fix` and its consequence for writability; the three-outcome exit semantics, with
      approvals graded on who could approve; protection read across two API surfaces; and the
      App check

## 2. The local half — no credential needed

- [ ] 2.1 The destination resolves, is inside a git repository, and has an `origin` remote
      naming a GitHub repository. Reuse the failures `repoFromCheckout` already words rather
      than wording them twice
- [ ] 2.2 Every role under the destination resolves: call the same resolution `loadRole` makes,
      catch per role, report the role that failed and keep going. This covers the deployment
      table's undeclared-seat row for roles nobody ran, and a role with no seat where seats are
      declared, since resolving it fails
- [ ] 2.3 Every role names at least one source, since nothing else refuses a role with none;
      each role naming none is a finding
- [ ] 2.4 The org-level `commands` list permits removing a tracked file. Igor publishes a change
      made only of removals ([#88](https://github.com/adamstallard/igor/pull/88)), so an Igor that
      cannot run `git rm` fails work it would otherwise publish
- [ ] 2.5 The report renders with no credential present: every credentialled check unchecked
      with its reason, the local half run, exit zero
- [ ] 2.6 Every role has a seat to spend from, whether or not any seat is declared (proposal,
      decision 3). A role with none is a finding naming the role, once: where seats are declared
      it is 2.2's role that does not resolve, and where none are, 2.6 reports it. Test: the
      scenario *A role with no seat*, with seats declared and with none
- [ ] 2.7 Invoke the configuration loader's validation in a mode that reads no secret, no private
      key file and no token, and report each finding it makes, named with its source (proposal,
      decision 4). Where the validation has no such mode, add one rather than re-implementing a
      check. A configuration that fails to load is a finding, and the checks that do not need it
      still run. Test: the scenarios *The loader's validation is invoked, not re-implemented*
      and *A configuration that fails to load*
- [ ] 2.8 Print text taken from repository files so that no report line begins with `::`, which
      GitHub Actions reads as a workflow command. Test: *A file name cannot inject a workflow
      command*

## 3. The credentialled half

- [ ] 3.1 Confirm against the live API which endpoints answer with which permission: effective
      branch rules, classic protection, ruleset definitions with their bypass actors, and
      repository permission for the authenticated account. Record what the reading actually
      said in `design.md`, including where it contradicts what that file assumed
- [ ] 3.2 Direct pushes to the default branch are prevented — a pull request is required, and
      administrators cannot bypass it: classic protection has `enforce_admins` on, and no ruleset
      lists the administrator role among its bypass actors. Where they can, the finding says that
      an administrator can push straight to the default branch. Test: *Direct pushes to the
      default branch are possible* and *Administrators can push past the pull-request rule*
- [ ] 3.3 Approvals are not required, graded on whether a second person could approve, since
      an Igor's approval never counts; unchecked where the account list cannot be read
- [ ] 3.4 The reconciliation workflow is present **on the default branch**, not merely in the
      working tree — an uncommitted workflow never runs
- [ ] 3.5 The workflow's actor may bypass the protection, checked only where the branch is
      protected and the workflow is present, and reported unchecked where the bypass list is
      administrative and the credential is not
- [ ] 3.6 The state branch is reachable, and the credential holds the write permission pushing
      to it needs — read from the permission, never by writing
- [ ] 3.7 Invoke, for each GitHub role, the check `igor run` and `igor serve` make before
      discovery (surface-adapter's *An Igor that cannot act as its App does not start*). That
      check verifies the role's App is installed where the role works, with the permissions it
      needs; `doctor` runs it on a repository where nothing has been claimed yet. A role whose App key is not in the environment is unchecked; a role that
      claims only on Linear is not applicable. Confirm against the live API where an
      installation's permissions can be read, and record it in `design.md`. Since #156 every
      role's identity on GitHub is its App, so 3.7 has no branch for any other kind
- [ ] 3.8 Every credentialled check degrades individually: one unreadable endpoint skips one
      check, not the run

## 4. The report and the exit status

- [ ] 4.1 Three states per check — pass, finding, unchecked — visually distinct, with unchecked
      never rendering as a pass
- [ ] 4.2 Every finding carries its remedy and who performs it: a command to run, or a setting
      on the code host that is the operator's to change
- [ ] 4.3 Where a condition belongs to another command — a seat token that cannot be read —
      name that command rather than reading it here
- [ ] 4.4 Non-zero with any finding, zero otherwise; an all-unchecked run exits zero and says
      nothing was checked rather than reporting a clean setup
- [ ] 4.5 Tests: a clean setup, each finding in isolation, a run with no credential, a run whose
      credential reads some endpoints and not others, and the exit status of each

## 5. Documentation

- [ ] 5.1 `README.md`, "Setting up a lore repository": a final step running the command and
      confirming, at the end of the section as [#112](https://github.com/adamstallard/igor/pull/112)'s
      `init` rewrote it
- [ ] 5.2 `README.md`, the two manual GitHub steps — branch protection and the Actions actor on
      the bypass list — point at the command instead of relying on being remembered. The
      warnings stay; what changes is that they end with a way to confirm
- [ ] 5.3 `docs/deployment.md`, "When something is wrong": name the command on the rows it
      evaluates, and leave the rows that need human judgement as prose — whether an Igor's App
      *should* hold the permissions it was granted is not a question a command answers
- [ ] 5.4 `docs/architecture.md` §5.0.3: one sentence that the same principle — feedback rather
      than documentation — produced a setup check, naming where it is documented. The list of
      two stays two, because both of those are about a role's effective behaviour and this is
      about a repository's wiring
