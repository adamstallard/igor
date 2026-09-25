## 1. The agreement (gate one — this pull request)

- [x] 1.1 Two `lore-store` requirements: what `init` writes, and what it leaves alone
- [x] 1.2 The default `commands` list and every exclusion stated in the requirement rather than
      left to the implementation, since it is what a worker may execute with a seat's credential
- [x] 1.3 The root-of-the-repository clause, so the config `init` writes is not one
      [#111](https://github.com/adamstallard/igor/pull/111) refuses from a subdirectory
- [x] 1.4 `design.md` for the three choices with live alternatives: shipping `git rm:*` before
      [#88](https://github.com/adamstallard/igor/pull/88), folding `init-workflow` into `init`,
      and skipping per file rather than refusing the run
- [x] 1.5 Capability chosen against the discriminator — which requirements in force would have
      to be reworded — and the reasoning recorded in `proposal.md`

## 2. `templates/org.yaml`

- [ ] 2.1 The org template: `commands`, `allow`, `completion`, lane exclusions, and standing
      instructions, each line carrying why it is there. The template may land before the command
      does; a `cp templates/org.yaml roles/org.yaml` step in the README must not, because `init`
      would delete it again
- [ ] 2.2 `git rm:*` and `git mv:*` ship **live**: #88 merged and archived, so a worker's removal
      now reaches the artifact and the requirement's condition is met. Comment them only if that
      stops being true
- [ ] 2.3 A test that the shipped template loads as a role and merges as an org base, so it
      cannot rot into a file that no longer parses
- [ ] 2.4 A test asserting the exclusions by name — nothing in the shipped list commits, pushes,
      removes unscoped, or runs an interpreter — so widening the default has to be deliberate

## 3. `igor init`

- [ ] 3.1 The command, run inside an existing repository, writing the config, `roles/org.yaml`,
      a role stub and the workflow
- [ ] 3.2 The config at the repository root with `destination: .`; refuse outside a repository,
      and refuse inside Igor's own installation, where the config would be one the loader is
      already obliged to reject
- [ ] 3.3 Per-file skip: name what was there, write what was not, succeed; `--force` overwrites,
      all-or-nothing across the targets the run is writing
- [ ] 3.4 `--only <target…>` selects which of the four to write, the shape `promote --only` has;
      without it, all four
- [ ] 3.5 Retire `init-workflow` (`src/cli.ts`): the workflow writer becomes a function `init`
      calls, so one code path writes `reconcile-on-merge.yml` and there is no second command
      writing it
- [ ] 3.6 The closing report: the four values only the operator knows, plus branch protection and
      the Actions bypass as what remains
- [ ] 3.7 Tests for each scenario in the delta, including the partial re-run and the
      subdirectory case

## 4. Documentation

- [ ] 4.1 README **Setting up a lore repository**: steps 2, 3 and 5 collapse into `igor init`;
      steps 1, 4 and 6 stay manual. The `igor init-workflow` block goes, since the command does
      — name `init --only workflow` where re-running that piece alone is worth mentioning
- [ ] 4.2 README **Roles**: show the org file. It shows a role example and never an org file,
      which is why the file holding `commands` is the one with no starting point
- [ ] 4.3 `docs/architecture.md` §5.0.3: a sentence in the `commands` paragraph naming
      `templates/org.yaml` as what a setup starts from. **Not** an entry in the "two commands
      matter more than any amount of prose" list — that passage is about feedback loops on a
      config that already exists (`role explain`, `role dry-run`), and `init` is a one-time
      command that creates one
- [ ] 4.4 `docs/deployment.md` needs nothing, checked rather than assumed: its "Before it can
      run" step 3 links to the README section instead of restating the sequence, and the link
      survives the rewrite. Tick this when 4.1 lands and the anchor still resolves
