## 1. The agreement (gate one — this pull request)

- [x] 1.1 Five `setup-check` requirements: the surface and the four constraints — read-only,
      remedy and actor, degrade rather than fail, exit status
- [x] 1.2 Say which rows of `docs/deployment.md`'s "When something is wrong" table become
      checks and which stay prose, and why each one that dissolves does
- [x] 1.3 Say that the nested-store check is dissolved by
      [#111](https://github.com/adamstallard/igor/pull/111) rather than omitted
- [x] 1.4 `design.md` for the four choices with live alternatives: the name, the refusal of
      `--fix` and its consequence for writability, the three-outcome exit semantics, and
      protection read across two API surfaces

## 2. The local half — no credential needed

- [ ] 2.1 The destination resolves, is inside a git repository, and has an `origin` remote
      naming a GitHub repository. Reuse the failures `repoFromCheckout` already words rather
      than wording them twice
- [ ] 2.2 Every role under the destination resolves: call the same resolution `loadRole` makes,
      catch per role, report the role that failed and keep going. This is what covers the two
      seat rows of the deployment table for roles nobody ran
- [ ] 2.3 At least one role names at least one source, since nothing else refuses a role with
      none
- [ ] 2.4 The org-level `commands` list permits removing a tracked file. Gate the check on
      removals being publishable at all — until [#88](https://github.com/adamstallard/igor/pull/88)
      lands there is nothing for the permission to enable, and a finding before then is noise
- [ ] 2.5 The report renders with no credential present: every credentialled check unchecked
      with its reason, the local half run, exit zero

## 3. The credentialled half

- [ ] 3.1 Confirm against the live API which endpoints answer with which permission: effective
      branch rules, classic protection, ruleset definitions with their bypass actors, and
      repository permission for the authenticated account. Record what the reading actually
      said in `design.md`, including where it contradicts what that file assumed
- [ ] 3.2 Direct pushes to the default branch are prevented — a pull request is required
- [ ] 3.3 Approvals are not required, graded on whether a second account could approve;
      unchecked where the account list cannot be read
- [ ] 3.4 The reconciliation workflow is present **on the default branch**, not merely in the
      working tree — an uncommitted workflow never runs
- [ ] 3.5 The workflow's actor may bypass the protection, checked only where the branch is
      protected and the workflow is present, and reported unchecked where the bypass list is
      administrative and the credential is not
- [ ] 3.6 The state branch is reachable, and the credential holds the write permission pushing
      to it needs — read from the permission, never by writing
- [ ] 3.7 Write access for the account that claims, which is the deployment table's
      `the tracker did not record <account> as holding <item>` row, checkable before a claim
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
      confirming. If [#112](https://github.com/adamstallard/igor/pull/112) has landed, the step
      goes at the end of the section as `init` rewrote it
- [ ] 5.2 `README.md`, the two manual GitHub steps — branch protection and the Actions actor on
      the bypass list — point at the command instead of relying on being remembered. The
      warnings stay; what changes is that they end with a way to confirm
- [ ] 5.3 `docs/deployment.md`, "When something is wrong": name the command on the rows it
      evaluates, and leave the rows that need human judgement as prose — whether a machine
      account *should* have write access is not a question a command answers
- [ ] 5.4 `docs/architecture.md` §5.0.3: one sentence that the same principle — feedback rather
      than documentation — produced a setup check, naming where it is documented. The list of
      two stays two, because both of those are about a role's effective behaviour and this is
      about a repository's wiring
