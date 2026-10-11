Build after `condition-backoff` (#101) and `read-seat-windows-from-the-stream` (#143). Line numbers
below are main's at the time of writing and will have moved under those two changes; the names are
what to find. Where a task quotes text in a fenced block, that text is the deliverable: it may be
reworded only where a measurement in section 1 contradicts it, and then `design.md` records the
measurement.

## 1. Measure what the guides depend on

- [ ] 1.1 Measure whether a collaborator with `write`, not `admin`, can run
      `gh secret set IGOR_SEAT_TEST --repo <lore>` on a personal-account repository and on an
      organization's. Record the result in `design.md` under *Open*, and write the lender guide's
      access sentence (task 10.9) from it
- [ ] 1.2 On a test repository with a ruleset requiring code-owner review and no required
      approvals, measure what happens when a seat's holder, the file's only code owner, opens a
      pull request changing that file. Record whether it can merge, and what the operator must do
      if it cannot. The lender guide's *Afterwards* section says it
- [ ] 1.3 Measure `GET /repos/{owner}/{repo}/rules/branches/{branch}` with an Igor's App
      installation token: confirm it returns a ruleset's `pull_request` rule with
      `require_code_owner_review`, and that the classic protection endpoint answers 403 to the
      same token. Record both responses' shapes in `design.md`
- [ ] 1.4 Confirm `age-encryption` decrypts what `age -r <recipient> | base64 | tr -d '\n'`
      produces on macOS and Linux, after `base64 -d`, and that `age-keygen -y` derives the same
      recipient the package derives from the identity

## 2. Seats from files

- [ ] 2.1 `src/budget.ts`: replace `parseOrgBudget` with a reader of `<destination>/seats/*.yaml`
      that returns the seats, each with its `roles`. The id is the filename; the keys are those
      the requirement lists, refused by `keyCheck` in the shape every other level uses. `Pool`,
      `OrgBudget.pools`, `POOL_KEYS`, `BUDGET_KEYS` and `requireList`'s pool use go
- [ ] 2.2 Refusals, worded so:

      ```
      seats/<file>: the filename is the seat's id, so a seat file does not declare `id`
      seats/<file>: a seat's id is lowercase letters, digits and hyphens, starting with a letter or digit
      seats/<id>.yaml: `roles` is required: the list of roles this seat serves, which may be empty
      seats/<id>.yaml lists role "<role>", which has no file under roles/. Roles: <names>
      ```

- [ ] 2.3 `src/config.ts`: `budget` leaves `CONFIG_KEYS`, so a config still declaring it is refused
      by the existing unknown-key refusal. No dedicated message (Adam, 2026-10-11). `seatKey` joins
      `CONFIG_KEYS`: a string path, resolved against the config file's directory
- [ ] 2.4 `Config.budget` is filled from the seat files at load, so callers of `config.budget` keep
      working
- [ ] 2.5 Tests in `test/config.test.ts` and `test/budget.test.ts`: each scenario of *A seat is a
      file under `seats/`*; a config declaring `budget` is refused naming `budget`; no `seats/`
      means budget is not enforced; `recipient.txt` is not read as a seat

## 3. One token variable, possibly encrypted

- [ ] 3.1 `TokenSource` keeps `tokenEnv` alone. `resolveToken` loses the `tokenFile` and
      `tokenCommand` branches, and `runTokenCommand` and `TOKEN_COMMAND_TIMEOUT_MS` go
- [ ] 3.2 A seat file naming `token_command` or `token_file`, or another variable, is refused:

      ```
      seats/<id>.yaml names `token_command`. A seat file names its token only with token_env: IGOR_SEAT_<ID>, a variable in the server's environment. Put the token, or your secret store's output, in the server's env file under that name.
      seats/<id>.yaml names `token_file`. A seat file names its token only with token_env: IGOR_SEAT_<ID>, a variable in the server's environment. Put the token, or your secret store's output, in the server's env file under that name.
      seats/<id>.yaml names token_env: <given>. A seat's token variable is IGOR_SEAT_ plus its id: IGOR_SEAT_<ID>.
      ```

- [ ] 3.3 Add the `age-encryption` dependency. `resolveToken` decrypts a value beginning
      `YWdlLWVuY3J5cHRpb24ub3JnL3Yx` with the identity at `seatKey`, read when needed and not
      cached beyond the process
- [ ] 3.4 Decryption failures report the seat unreadable, worded so, after the existing `seat
      "<id>"` subject:

      ```
      holds an encrypted token in IGOR_SEAT_<ID>, and igor.config.yaml names no seatKey to decrypt it with.
      holds an encrypted token in IGOR_SEAT_<ID>, and the key at <path> could not be read: <reason>
      holds a token in IGOR_SEAT_<ID> encrypted to a different key from the one at <path>. Its holder re-encrypts it to seats/recipient.txt with `igor seat add <id>`.
      holds a value in IGOR_SEAT_<ID> that starts like an age ciphertext and is not one: <reason>
      ```

- [ ] 3.5 #101's credential digest is taken of the decrypted token. Test: the same token encrypted
      twice yields one digest
- [ ] 3.6 Tests: each scenario of *A seat's token may be ciphertext*; the plaintext appears in no
      record, transcript or handoff; the existing `token_file` and `token_command` tests in
      `test/budget.test.ts` are removed with the code they test

## 4. Which seats a role draws on

- [ ] 4.1 `src/role.ts` `requireSeat` (`:594-630`): a role's seats are the seat files listing it;
      `seat:` narrows to one, which must list the role. Refusals, worded so:

      ```
      role "<role>" names seat "<seat>", which has no seat file. Seats: <ids>
      role "<role>" names seat "<seat>", and seats/<seat>.yaml does not list it. The seat's holder lists the roles it serves in that file.
      role "<role>" is served by no seat. A seat serves a role when its file under seats/ lists the role in `roles`.
      ```

- [ ] 4.2 `poolFor` is replaced by a function returning the seats serving a role, and `budgetGate`
      (`src/budget.ts:870-900`) uses it. The fallback to `org.pools[0]` goes
- [ ] 4.3 `igor role explain` shows the seats a role draws on, each with the file that lists it
- [ ] 4.4 Tests: each scenario of *A role's seats are the seats whose files list it*

## 5. Choosing a seat by headroom

- [ ] 5.1 `chooseSeat` (`src/budget.ts:597-735`): compute eligibility with the existing rules, then
      rank by headroom, the soonest week reset, then id, as *A role draws on the seat with the most
      headroom* states. Its doc comment describes ranking, not pool order
- [ ] 5.2 `poolVerdict` and `derivedReset` take the seats serving the role, not a pool. Every
      user-facing "pool" in `src/budget.ts`, `src/handoff.ts` and `src/triage.ts` becomes "the
      seats serving role "<role>"", or "the role's seats" where the role is already named
- [ ] 5.3 The chosen-seat reason names the runner-up, so a reader sees why this seat won:

      ```
      <seat> has <n> points of headroom, the most of the seats serving <role> (next: <seat2>, <m>)
      <seat> and <seat2> both have <n> points of headroom; <seat>'s week resets sooner
      ```

- [ ] 5.4 Tests: each scenario of the requirement. The pool-order tests in `test/budget.test.ts`
      ('pool order is the allocation mechanism' and the tests #143's task 7.8 names) are rewritten
      against ranking

## 6. Warning when the holder's approval is not enforced

- [ ] 6.1 Read CODEOWNERS from the lore checkout, the first of `.github/CODEOWNERS`, `CODEOWNERS`,
      `docs/CODEOWNERS`, and match each seat file by GitHub's rules, the last matching line
      winning. Test against GitHub's documented examples, including a directory pattern, a
      leading `/`, `*`, and a line naming no owner
- [ ] 6.2 Read the default branch's active rules, then classic protection where no ruleset
      requires code-owner review, as `design.md` describes. Once per process
- [ ] 6.3 The warnings, worded so:

      ```
      warning: seats/<id>.yaml has no code owner, so a change to what this seat does needs nobody's approval. Add a CODEOWNERS line naming its holder: /seats/<id>.yaml @<holder>
      warning: code-owner review is not required on <branch>, so a seat's holder is not asked before their seat file changes. Turn on "Require review from Code Owners" in a ruleset on <branch>.
      warning: cannot tell whether code-owner review is required on <branch>. No ruleset requires it, and reading classic branch protection needs Administration read, which this credential lacks. Run `igor doctor` with the operator's credential.
      ```

- [ ] 6.4 Tests: each scenario of *Igor warns, and does not refuse*; no warning stops a load

## 7. `igor seat add`

- [ ] 7.1 `src/cli.ts`: `igor seat add <id> [--reserve <r>] [--roles <a,b>] [--dedicated]`. The
      repository comes from the clone's `origin`; the holder's login from `gh api user`
- [ ] 7.2 Read `seats/recipient.txt` from the default branch with `gh api`. Read the token with
      echo off. Encrypt with `age-encryption`, base64 on one line, and pass it to
      `gh secret set IGOR_SEAT_<ID> --repo <repo>` on standard input
- [ ] 7.3 A new seat: write `seats/<id>.yaml` and the CODEOWNERS line, commit on branch
      `seat/<id>`, push, and open a pull request with `gh pr create`. The file it writes:

      ```yaml
      # <id>'s seat: a Claude subscription lent to this team's Igors.
      # Its holder approves every change to this file (CODEOWNERS). See docs/seats.md.
      owner: <login>
      # The share of each window Igors leave for you, from 0 to 1.
      reserve: <r>
      # The roles that may draw on this seat. Remove one to stop it; add one to allow it.
      roles: [<roles>]
      # The server's variable holding this seat's token, encrypted so only the server can read it.
      token_env: IGOR_SEAT_<ID>
      ```

- [ ] 7.4 An existing seat: replace the secret, change nothing else, and say so:

      ```
      Replaced IGOR_SEAT_<ID>. The server reads the new token after the next deploy, which runs on the next push to <branch>; the operator can run the deploy workflow by hand to apply it now.
      ```

- [ ] 7.5 Refusals before the token is read: no `seats/recipient.txt` on the default branch; an
      invalid id; not in a clone of the lore repository
- [ ] 7.6 Tests, with `gh` faked: the scenarios of *`igor seat add` lends a seat in one step*, and
      that no argument list or written file contains the token

## 8. `igor doctor`

Composes with `check-a-lore-repository` (#113). Whichever builds second adds these to the command
the other built.

- [ ] 8.1 Who approves each seat file, the review rule, bypass actors, and unowned
      `recipient.txt`, `.github/` and `igor.config.yaml`, per *The check says who approves each
      seat file*. The stand-in finding, worded so:

      ```
      seats/<id>.yaml: @<codeowner> approves changes for <owner>, who is not a code owner of this file. Their approval is given outside GitHub. If they have an account on this repository, add: /seats/<id>.yaml @<login>
      ```

- [ ] 8.2 The runner guard, per *The check says whether the deploy runner is guarded*
- [ ] 8.3 The key match and env-file overlap, per *The check says whether the server's key
      matches the committed one*
- [ ] 8.4 Tests for each scenario of the three requirements

## 9. Migrating `adamstallard/igor-lore`

- [ ] 9.1 In `adamstallard/igor-lore`, on a branch and pull request: add `seats/adam.yaml` with
      `owner: adamstallard`, `reserve: 0.5`, `roles: [generalist]` and
      `token_env: IGOR_SEAT_ADAM`; delete `budget` from `igor.config.yaml`, `capacity_estimate`
      and `token_command` with it; delete `seat: adam` and its comment from `roles/org.yaml`; add
      `.github/CODEOWNERS` from the template with `@adamstallard` on every line. The token stays in
      the server's env file as `IGOR_SEAT_ADAM`, put there by hand from the keychain entry
      `claude-adam-personal`. No secret, no deploy workflow: the repository is public and on a
      personal account, so neither runner guard is available (`design.md`, *Open*)
- [ ] 9.2 Turn on a ruleset on `igor-lore`'s `main` requiring code-owner review, and confirm the
      load-time warnings are silent and `igor doctor` reports only the runner finding

## 10. Docs and templates

Done means a newcomer follows the operator guide on a fresh server and a fresh lore repository,
then the lender guide, and ends with a working seat. Every key and token the flow uses is covered:
where it is created, where it lives, who can read it, how it is rotated, and what to do if it
leaks.

- [ ] 10.1 `deploy/deploy-seats.yml`, the deploy workflow template, copied to
      `.github/workflows/` in the lore repository:

      ```yaml
      # Deploys this lore repository to the Igor server, which is this workflow's runner. It
      # writes every IGOR_SEAT_* secret to /etc/igor/seats.env, updates the lore checkout, and
      # restarts the Igors. Only a push to main runs it.
      #
      # The runner must run nothing else. Keep this repository private, or put the runner in a
      # group whose selected workflows are only this file on main. On a public repository with
      # neither, a fork's pull request can run code on the server, which holds every seat's
      # decrypted token. `igor doctor` checks for one of the two.
      name: deploy-seats
      on:
        push:
          branches: [main]
          paths: ['seats/**', 'roles/**', 'igor.config.yaml', '.github/workflows/deploy-seats.yml']
        workflow_dispatch:
      permissions:
        contents: read
      concurrency: deploy-seats
      jobs:
        deploy:
          runs-on: [self-hosted, igor]
          steps:
            # Every secret is in SECRETS; only IGOR_SEAT_* reach the file. A secret holds
            # ciphertext only the server's key decrypts, or a plain token an admin set.
            - name: Write seat tokens
              env:
                SECRETS: ${{ toJSON(secrets) }}
              run: |
                umask 077
                node -e '
                  const all = JSON.parse(process.env.SECRETS)
                  const lines = Object.entries(all)
                    .filter(([name, value]) => /^IGOR_SEAT_[A-Z0-9_]+$/.test(name) && !/[\r\n]/.test(value))
                    .map(([name, value]) => `${name}=${value}`)
                  process.stdout.write(lines.join("\n") + "\n")
                ' > /etc/igor/seats.env
            - name: Update the lore checkout
              run: git -C /srv/igor/lore pull --ff-only
            - name: Restart the Igors
              run: sudo systemctl restart 'igor@*'
      ```

- [ ] 10.2 `deploy/CODEOWNERS`, the template:

      ```
      # Who approves changes to this lore repository's seats. GitHub enforces it only where a
      # ruleset on the default branch has "Require review from Code Owners". See
      # docs/deployment.md in Igor.
      #
      # The last matching line wins, so the operator's lines come first and each seat's after.
      # Nothing else has a code owner: a `*` line would put every lore pull request behind the
      # operator's review.
      /seats/               @OPERATOR
      /seats/recipient.txt  @OPERATOR
      /.github/             @OPERATOR
      /igor.config.yaml     @OPERATOR

      # One line per seat, naming its holder. A holder with no GitHub account here gets no line,
      # and the /seats/ line makes the operator stand in; `igor doctor` reports it.
      /seats/example.yaml   @HOLDER
      ```

- [ ] 10.3 `deploy/igor.service`: a second `EnvironmentFile=-/etc/igor/seats.env` after
      `/etc/igor/env`, and the `LoadCredential=` example removed. Its comment:

      ```
      # Written by the lore repository's deploy workflow, and replaced whole on every deploy, so
      # edit /etc/igor/env instead. Where both name a variable, this file wins.
      ```

- [ ] 10.4 `deploy/env.example`: the `LoadCredential=` and `token_file` paragraph goes. The seat
      variable paragraph says the name is fixed, and where a deployed seat's token comes from:

      ```
      # One per seat, named IGOR_SEAT_ plus the seat's id, uppercased, with anything but a letter
      # or digit becoming an underscore: seat `fleet-1` reads IGOR_SEAT_FLEET_1. The seat file
      # under seats/ in the lore repository names the same variable, and Igor refuses any other.
      #
      # A seat lent through `igor seat add` is not set here: the deploy workflow writes it to
      # /etc/igor/seats.env. Set one here for a seat whose token you hold yourself.
      ```

- [ ] 10.5 `docs/deployment.md`, the operator guide, replacing *Adding a seat somebody has given
      you* and *Keeping the token out of your shells* with sections covering:
  - **The server keypair:** `age-keygen -o /etc/igor/seat-key.txt` as the service user, `0600`;
    commit `age-keygen -y` of it as `seats/recipient.txt`; name its path as `seatKey`; back it up;
    rotating it, which means every holder runs `igor seat add` again
  - **The self-hosted runner:** registering the server as a runner for the lore repository with
    the runner's own registration token, labelled `igor`, run as the service user; the guard, a
    private repository or a runner group restricted to `deploy-seats.yml` on `main`, and that a
    personal-account repository has only the first
  - **The deploy workflow:** copying `deploy/deploy-seats.yml`; creating `/etc/igor/seats.env`
    owned by the service user; the sudoers line letting the service user run
    `systemctl restart igor@*` and nothing else
  - **Repository settings:** a ruleset on the default branch requiring a pull request and
    code-owner review; CODEOWNERS from `deploy/CODEOWNERS`; who needs `write` to run
    `gh secret set` (from task 1.1); the bypass list, and why `seats/` should have none
  - **Declaring a seat by hand:** a seat file naming `token_env`, and the token in
    `/etc/igor/env`; a secret store's output goes there too
  - **Checking it:** `igor doctor`, and `igor budget` showing the new seat as readable
  - **When things go wrong:** removing a seat (delete the file and the secret); a holder leaving;
    a leaked server key (rotate it, and every holder revokes and re-issues their token); a leaked
    seat token (its holder revokes it at Anthropic)
  - The *When something is wrong* table gains the refusals of tasks 2.2, 3.2, 3.4 and 4.1, and
    loses its `pool:` rows
- [ ] 10.6 `docs/seats.md`, the lender guide, rewritten around the file. **Before lending:** this is
      your file, and nothing about your seat changes without your review; lending means trusting
      the server's operator, who can use your token within your subscription, and what they do to
      protect it (the private key, who can merge configuration, the runner guard); what bounds that
      trust (a `setup-token` only makes model requests, you can revoke it at any time, the reserve
      limits Igor's share, you can watch your usage at claude.ai)
- [ ] 10.7 `docs/seats.md`, **getting the token:** `claude setup-token`, once, in your own
      terminal, and why it never goes into chat or email
- [ ] 10.8 `docs/seats.md`, **lending it:** `igor seat add` in one step, and the manual equivalent
      for someone without Igor installed:

      ```sh
      git clone <lore-repo> && cd <lore-repo>
      read -rs TOKEN    # paste the token: not shown, and not kept in your shell history
      printf %s "$TOKEN" | age -r "$(cat seats/recipient.txt)" | base64 | tr -d '\n' \
        | gh secret set IGOR_SEAT_<ID>
      unset TOKEN
      ```

      then a pull request adding `seats/<id>.yaml` with their reserve and the roles it serves,
      and its CODEOWNERS line. `seats/recipient.txt` is read from an up-to-date `main`
- [ ] 10.9 `docs/seats.md`, **afterwards:** approving changes to your seat file, what happens when
      you change it yourself (task 1.2), watching your usage at claude.ai; **changing your mind:**
      rotating (the same steps again), withdrawing (delete the secret and the file, or revoke at
      Anthropic, which takes effect at once), and the one-year expiry (#145). Who may run
      `gh secret set`, from task 1.1
- [ ] 10.10 `docs/seats.md` *What the floor rests on* and *Several people, one fleet* describe the
      line (#143) and choice by headroom, with no pool and no listed order
- [ ] 10.11 `README.md`: the quick start declares a seat file and puts the token in the
      environment, with the shell wrapper `docs/deployment.md` already has; `token_command` and
      `token_file` go. *Budgets* loses `pools:` and `pool:engineering`, and its sample `igor budget`
      output loses the `pool engineering:` line
- [ ] 10.12 `docs/architecture.md` §6.5.1: a seat file lists the roles it serves, and the seat is
      chosen by headroom; "Order is the whole allocation mechanism today" and the `pools:`
      example go. §6.3.2's list of token mechanisms becomes `token_env` alone
- [ ] 10.13 `igor.config.example.yaml`: `budget` goes, replaced by a comment pointing at `seats/`
      and `seatKey`:

      ```yaml
      # Seats are files under seats/, one per Claude subscription, each approved by its holder.
      # See docs/seats.md for lending one and docs/deployment.md for running the server.
      #
      # The age private key that decrypts seat tokens the deploy workflow delivered. Only needed
      # once a seat's token is encrypted; a plain token in the env file needs no key.
      # seatKey: /etc/igor/seat-key.txt
      ```

- [ ] 10.14 `test/documented-config.test.ts`: the `budget` and `seats` levels become one `seat`
      level, read by the seat-file reader, and every `igor:budget` and `igor:seats` fence in the
      docs is retagged `igor:seat`
- [ ] 10.15 `igor budget` names, for each seat, the roles its file lists
