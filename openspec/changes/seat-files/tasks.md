Build after `condition-backoff` (#101) and `read-seat-windows-from-the-stream` (#143). Line numbers
below are main's at the time of writing and will have moved under those two changes; the names are
what to find. Where a task quotes text in a fenced block, that text is the deliverable: it may be
reworded only where a measurement in section 1 contradicts it, and then `design.md` records the
measurement.

## 1. Measure what the guides depend on

- [ ] 1.1 On a test repository with a ruleset requiring code-owner review and no required
      approvals, measure what happens when a seat's holder, the file's only code owner, opens a
      pull request changing that file, as a rotation does. Record whether it can merge, and what
      the operator must do if it cannot, in `design.md` under *Still to measure*. The lender
      guide's *Afterwards* and *Changing your mind* sections say it
- [ ] 1.2 Measure `GET /repos/{owner}/{repo}/rules/branches/{branch}` with an Igor's App
      installation token: confirm it returns a ruleset's `pull_request` rule with
      `require_code_owner_review`, and that the classic protection endpoint answers 403 to the
      same token. Record both responses' shapes in `design.md`
- [ ] 1.3 Confirm `age-encryption` decrypts what `age -r <recipient> | base64 | tr -d '\n'`
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


## 3. The token: ciphertext in the file, or the seat's own variable

- [ ] 3.1 `TokenSource` becomes `encryptedToken` or `tokenEnv`. `resolveToken` loses the
      `tokenFile` and `tokenCommand` branches, and `runTokenCommand` and
      `TOKEN_COMMAND_TIMEOUT_MS` go
- [ ] 3.2 Refusals at load, worded so:

      ```
      seats/<id>.yaml names `token_command`. A seat file names its token only with encrypted_token, the token encrypted to seats/recipient.txt, or token_env: IGOR_SEAT_<ID>, a variable in the server's environment.
      seats/<id>.yaml names `token_file`. A seat file names its token only with encrypted_token, the token encrypted to seats/recipient.txt, or token_env: IGOR_SEAT_<ID>, a variable in the server's environment.
      seats/<id>.yaml names both encrypted_token and token_env. Keep one.
      seats/<id>.yaml names token_env: <given>. A seat's token variable is IGOR_SEAT_ plus its id: IGOR_SEAT_<ID>.
      seats/<id>.yaml: encrypted_token is not an age ciphertext. If it is a token, it is now in this repository's history: revoke it at Anthropic, then run `igor seat add <id>` with a new one.
      ```

- [ ] 3.3 Add the `age-encryption` dependency. `resolveToken` decrypts `encryptedToken` with the
      identity at `seatKey`, read when needed and not cached beyond the process
- [ ] 3.4 Decryption failures report the seat unreadable, worded so, after the existing `seat
      "<id>"` subject:

      ```
      carries an encrypted token, and igor.config.yaml names no seatKey to decrypt it with.
      carries an encrypted token, and the key at <path> could not be read: <reason>
      carries a token encrypted to a different key from the one at <path>. Its holder re-encrypts it to seats/recipient.txt with `igor seat add <id>`.
      carries an encrypted token that could not be decrypted: <reason>
      ```

- [ ] 3.5 #101's credential digest is taken of the decrypted token. Test: the same token encrypted
      twice yields one digest
- [ ] 3.6 Tests: each scenario of *A seat file names its token only by ciphertext or its own
      variable* and *A seat's token travels as ciphertext in its file*; the plaintext appears in
      no record, transcript or handoff; the existing `token_file` and `token_command` tests in
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
      lore repository comes from the clone's `upstream` remote where there is one, and otherwise
      `origin`; the holder's login from `gh api user`
- [ ] 7.2 Read `seats/recipient.txt` from the lore repository's default branch with `gh api`. Read
      the token with echo off. Encrypt with `age-encryption`, base64 on one line
- [ ] 7.3 A new seat: write `seats/<id>.yaml` and the CODEOWNERS line. The file it writes:

      ```yaml
      # <id>'s seat: a Claude subscription lent to this team's Igors.
      # Its holder approves every change to this file (CODEOWNERS). See docs/seats.md.
      owner: <login>
      # The share of each window Igors leave for you, from 0 to 1.
      reserve: <r>
      # The roles that may draw on this seat. Remove one to stop it; add one to allow it.
      roles: [<roles>]
      # Your token, encrypted to the Igor server's key in seats/recipient.txt. Only the server can
      # decrypt it. Rotate it with `igor seat add <id>`.
      encrypted_token: <ciphertext>
      ```

- [ ] 7.4 An existing seat: replace `encrypted_token` and change nothing else
- [ ] 7.5 Commit on branch `seat/<id>`. Push to the lore repository where `gh api` says the holder
      may push, and otherwise to their fork, creating it with `gh repo fork` where it does not
      exist. Open the pull request through `gh`. Its body:

      ```
      Lends seat <id> to this team's Igors: <reserve> reserve, serving <roles>. The token is encrypted to seats/recipient.txt, so only the Igor server can read it. After merging, the operator pulls the server's lore checkout and restarts the Igors.
      ```

      and, for a rotation:

      ```
      Rotates seat <id>'s token. Nothing else about the seat changes. After merging, the operator pulls the server's lore checkout and restarts the Igors.
      ```

- [ ] 7.6 Refusals before the token is read: no `seats/recipient.txt` on the default branch; an
      invalid id; not in a clone of the lore repository or of a fork of it
- [ ] 7.7 Tests, with `gh` faked: the scenarios of *`igor seat add` lends a seat in one step*, and
      that no argument list, written file or child environment contains the token

## 8. Migrating `adamstallard/igor-lore`

- [ ] 8.1 In `adamstallard/igor-lore`, on a branch and pull request: add `seats/adam.yaml` with
      `owner: adamstallard`, `reserve: 0.5`, `roles: [generalist]` and
      `token_env: IGOR_SEAT_ADAM`; delete `budget` from `igor.config.yaml`, `capacity_estimate`
      and `token_command` with it; delete `seat: adam` and its comment from `roles/org.yaml`; add
      `.github/CODEOWNERS` from the template with `@adamstallard` on every line. The token stays in
      the server's env file as `IGOR_SEAT_ADAM`, put there by hand from the keychain entry
      `claude-adam-personal`
- [ ] 8.2 Turn on a ruleset on `igor-lore`'s `main` requiring code-owner review, and confirm the
      load-time warnings are silent and `igor doctor` reports nothing about seats

## 9. `igor doctor`

Composes with `check-a-lore-repository` (#113). Whichever builds second adds these to the command
the other built.

- [ ] 9.1 Who approves each seat file, the review rule, bypass actors, and unowned
      `recipient.txt`, `.github/` and `igor.config.yaml`, per *The check says who approves each
      seat file*. The stand-in finding, worded so:

      ```
      seats/<id>.yaml: @<codeowner> approves changes for <owner>, who is not a code owner of this file. Their approval is given outside GitHub. If they have an account on this repository, add: /seats/<id>.yaml @<login>
      ```

- [ ] 9.2 The key match, per *The check says whether the server's key matches the committed one*
- [ ] 9.3 Tests for each scenario of the two requirements

## 10. Docs and templates

Done means a newcomer follows the operator guide on a fresh server and a fresh lore repository,
then the lender guide, and ends with a working seat. Every key and token the flow uses is covered:
where it is created, where it lives, who can read it, how it is rotated, and what to do if it
leaks.

- [ ] 10.1 `deploy/CODEOWNERS`, the template:

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

- [ ] 10.2 `deploy/igor.service`: the `LoadCredential=` example and its comment go
- [ ] 10.3 `deploy/env.example`: the `LoadCredential=` and `token_file` paragraph goes. The seat
      variable paragraph says the name is fixed and when to use one:

      ```
      # A seat whose token you hold yourself, named IGOR_SEAT_ plus the seat's id, uppercased,
      # with anything but a letter or digit becoming an underscore: seat `fleet-1` reads
      # IGOR_SEAT_FLEET_1. Its seat file under seats/ in the lore repository names the same
      # variable with token_env, and Igor refuses any other.
      #
      # A seat lent through `igor seat add` is not set here: its token is encrypted in its seat
      # file, and Igor decrypts it with the key igor.config.yaml names as seatKey.
      ```

- [ ] 10.4 `docs/deployment.md`, the operator guide, replacing *Adding a seat somebody has given
      you* and *Keeping the token out of your shells* with sections covering:
  - **The server keypair, first and prominently, since it is the whole protection:**
    `age-keygen -o /etc/igor/seat-key.txt` as the service user, `0600`, owned by the service
    user; commit `age-keygen -y` of it as `seats/recipient.txt`; name its path as `seatKey`; back
    it up off the server where only the operator can read it, and what losing it costs (every
    holder re-encrypts); rotating it (a new keypair, the new public key committed, every holder
    runs `igor seat add`); a leaked key (rotate, and every holder revokes at Anthropic and
    re-issues, because old ciphertext in history decrypts with the old key)
  - **Repository settings:** a ruleset on the default branch requiring a pull request and
    code-owner review; CODEOWNERS from `deploy/CODEOWNERS`; that lenders need no access beyond
    opening a pull request, from a fork if need be; the bypass list, and why `seats/` should have
    none
  - **Taking in a seat:** reviewing the pull request (the file's `roles` and `reserve`, its
    CODEOWNERS line, and that `recipient.txt` is untouched), merging it, then pulling the server's
    lore checkout and restarting the Igors, since nothing else updates it
  - **Declaring a seat by hand:** a seat file naming `token_env: IGOR_SEAT_<ID>`, and the token in
    `/etc/igor/env`; a secret store's output goes there too
  - **Checking it:** `igor doctor`, and `igor budget` showing the new seat as readable
  - **When things go wrong:** removing a seat (delete its file and its CODEOWNERS line); a holder
    leaving (the same, and they revoke the token); a leaked server key (above); a leaked seat token
    (its holder revokes it at Anthropic and runs `igor seat add` with a new one)
  - The *When something is wrong* table gains the refusals of tasks 2.2, 3.2, 3.4 and 4.1, and
    loses its `pool:` rows
- [ ] 10.5 `docs/seats.md`, the lender guide, rewritten around the file. **Before lending:** this is
      your file, and nothing about your seat changes without your review; lending means trusting
      the server's operator, who can use your token within your subscription, and what they do to
      protect it (the private key, who can merge configuration); your token travels encrypted in a
      file anyone may be able to read, and only the server's key opens it; what bounds that trust
      (a `setup-token` only makes model requests, you can revoke it at any time, the reserve
      limits Igor's share, you can watch your usage at claude.ai)
- [ ] 10.6 `docs/seats.md`, **getting the token:** `claude setup-token`, once, in your own
      terminal, and why it never goes into chat, email, or a file unencrypted
- [ ] 10.7 `docs/seats.md`, **lending it:** `igor seat add` in one step, and the manual equivalent
      for someone without Igor installed:

      ```sh
      git clone <lore-repo> && cd <lore-repo>      # or your fork of it
      git pull <lore-repo> main                    # recipient.txt as main has it
      read -rs TOKEN    # paste the token: not shown, and not kept in your shell history
      printf %s "$TOKEN" | age -r "$(cat seats/recipient.txt)" | base64 | tr -d '\n'; echo
      unset TOKEN
      ```

      then a pull request adding `seats/<id>.yaml`, with that output as `encrypted_token`, their
      reserve and the roles it serves, and its CODEOWNERS line
- [ ] 10.8 `docs/seats.md`, **afterwards:** approving changes to your seat file, what happens when
      you change it yourself (task 1.1), watching your usage at claude.ai; **changing your mind:**
      rotating (`igor seat add` again, or the manual steps, changing only `encrypted_token`),
      withdrawing (revoke at Anthropic, which takes effect at once, and a pull request removing
      the file), and the one-year expiry (#145)
- [ ] 10.9 `docs/seats.md` *What the floor rests on* and *Several people, one fleet* describe the
      line (#143) and choice by headroom, with no pool and no listed order
- [ ] 10.10 `README.md`: the quick start declares a seat file and puts the token in the
      environment, with the shell wrapper `docs/deployment.md` already has; `token_command` and
      `token_file` go. *Budgets* loses `pools:` and `pool:engineering`, and its sample `igor budget`
      output loses the `pool engineering:` line
- [ ] 10.11 `docs/architecture.md` §6.5.1: a seat file lists the roles it serves, and the seat is
      chosen by headroom; "Order is the whole allocation mechanism today" and the `pools:`
      example go. §6.3.2's list of token mechanisms becomes `encrypted_token` and `token_env`
- [ ] 10.12 `igor.config.example.yaml`: `budget` goes, replaced by a comment pointing at `seats/`
      and `seatKey`:

      ```yaml
      # Seats are files under seats/, one per Claude subscription, each approved by its holder.
      # See docs/seats.md for lending one and docs/deployment.md for running the server.
      #
      # The age private key that decrypts the encrypted_token in each seat file. Only needed once
      # a seat carries one; a seat naming token_env needs no key.
      # seatKey: /etc/igor/seat-key.txt
      ```

- [ ] 10.13 `test/documented-config.test.ts`: the `budget` and `seats` levels become one `seat`
      level, read by the seat-file reader, and every `igor:budget` and `igor:seats` fence in the
      docs is retagged `igor:seat`
- [ ] 10.14 `igor budget` names, for each seat, the roles its file lists
