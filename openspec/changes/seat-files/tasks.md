Build after `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143), worker-user
(#175), `pinned-skills` (#174, whose startup skills check and reset tasks 3.10 relies on) and
`check-a-lore-repository` (#113, which adds `igor doctor`). Line numbers below are main's at the
time of writing and will have moved under those five changes; the names are
what to find. *Gate two* is the review of the implementation, after Adam approves this
specification. Where a task quotes text in a fenced block, that text is the deliverable: unless the
task itself says who may reword it, it may be reworded only where a measurement in section 1
contradicts it, and then `design.md` records the measurement.

## 1. Measure what the guides depend on

- [x] 1.1 Confirm `age-encryption` decrypts what `age -r <recipient> | base64 | tr -d '\n'`
      produces on macOS and Linux, after `base64 -d`, and that `age-keygen -y` derives the same
      recipient the package derives from the identity. Confirmed 2026-10-18, both ways and across
      the two systems: `design.md`, *Encryption and decryption use the `age-encryption` package*
- [x] 1.2 Find how the holder of a `claude setup-token` token revokes it. Answered by Adam,
      2026-10-19: through the claude.ai web interface; he did not give the exact page.
      `design.md`, *How the token reaches the server*, records it, and the lender guide says so
      (9.4, 9.7)

- [ ] 1.3 Before gate two, create a test `setup-token`, revoke it through the claude.ai web
      interface, and confirm that a model call with it is then refused. Record the steps and the
      result in `design.md`, *How the token reaches the server*. If the revoked token still
      works, decision 3 goes back to Adam before section 7 is built

## 2. Seats from files

- [ ] 2.1 `src/budget.ts`: replace `parseOrgBudget` with a reader of `<destination>/seats/*.yaml`
      that returns the seats, each with its `roles`. The id is the filename; the keys are those
      the requirement lists, refused by `keyCheck` in the shape every other level uses. `Pool`,
      `OrgBudget.pools`, `POOL_KEYS`, `BUDGET_KEYS` and `requireList`'s pool use go, and so do the
      `dedicated` key and the `Seat.dedicated` field
- [ ] 2.2 Refusals, worded so:

      ```
      seats/<file>: the filename is the seat's id, so a seat file does not declare `id`
      seats/<file>: a seat's id is lowercase letters, digits and hyphens, starting with a letter or digit
      seats/<id>.yaml: `roles` is required: the list of roles this seat serves, which may be empty
      seats/<id>.yaml lists role "<role>", which has no file under roles/. Roles: <names>
      seats/<id>.yaml lists "<role>", the org base, which is not a role a seat serves. Roles: <names>
      ```

- [ ] 2.2a A seat file that a refusal of 2.2 or 3.2 names, or whose YAML does not parse, is
      malformed and takes only its own seat out (proposal, decisions 67 and 72; *A malformed seat
      file takes only its own seat out*). The configuration loads; the seat is ineligible and
      skipped by #143's probe, under the read-cleared condition `seat:<id>:file`, which a later
      lore read finding the file well formed clears. Every file whose name is not a seat id
      shares one condition, `seats:filename`. 3.2's plain-token refusal still fails the
      configuration. The refusal's own text goes to the configuration's validation, and so to
      `igor doctor`, and to `igor budget`. The condition's report quotes nothing from the file but
      its name, worded so (may be reworded; it must name no key, value or owner from the file):

      ```
      seats/<id>.yaml is malformed, so no role draws on seat "<id>". `igor doctor` says what is wrong with it.
      A file under seats/ has a name that is not a seat id, so it declares no seat. `igor doctor` names it.
      ```

      A malformed file whose `roles` reads as a list of known roles serves them, ineligibly; while
      a malformed file whose `roles` cannot be read is present, a role no other seat file lists is
      not refused at load and hands off naming the open conditions. A role whose `seat:` names a
      malformed file's seat is not refused. Tests: the scenarios of the requirement
- [ ] 2.3 `src/config.ts`: `budget` leaves `CONFIG_KEYS`. `seatKey` joins `CONFIG_KEYS`: a string
      path, resolved against the config file's directory. A `seatKey` that resolves inside the
      lore checkout is refused at load, worded so:

      ```
      seatKey <path> is inside the lore repository. The private key must live outside it: committed, it is public, and uncommitted, it is discarded when the checkout is reset.
      ```
- [ ] 2.4 `Config.budget` is filled from the seat files at load, so callers of `config.budget` keep
      working
- [ ] 2.5 Tests in `test/config.test.ts` and `test/budget.test.ts`: each scenario of *A seat is a
      file under `seats/`*; no `seats/` refuses each role at load (4.1's third refusal);
      `recipient.txt` is not read as a seat


## 3. The token: ciphertext in the file, or the seat's own variable

- [ ] 3.1 `TokenSource` becomes `encryptedToken` or `tokenEnv`. `resolveToken` loses the
      `tokenFile` and `tokenCommand` branches, and `runTokenCommand` and
      `TOKEN_COMMAND_TIMEOUT_MS` go
- [ ] 3.2 Refusals, worded so. The last fails the configuration at load; each other takes its
      seat out (2.2a):

      ```
      seats/<id>.yaml names `token_command`. A seat file names its token only with encrypted_token, the token encrypted to seats/recipient.txt, or token_env: IGOR_SEAT_<ID>, a variable in the server's environment.
      seats/<id>.yaml names `token_file`. A seat file names its token only with encrypted_token, the token encrypted to seats/recipient.txt, or token_env: IGOR_SEAT_<ID>, a variable in the server's environment.
      seats/<id>.yaml names no token. A seat file names its token with encrypted_token, the token encrypted to seats/recipient.txt, or token_env: IGOR_SEAT_<ID>, a variable in the server's environment.
      seats/<id>.yaml names both encrypted_token and token_env. Keep one.
      seats/<id>.yaml names token_env: <given>. A seat's token variable is IGOR_SEAT_ plus its id: IGOR_SEAT_<ID>.
      seats/<id>.yaml: encrypted_token is not an age ciphertext. If it is a token, it is now in this repository's history: revoke it at Anthropic, then run `igor seat add <id>` with a new one.
      ```

- [ ] 3.3 Add the `age-encryption` dependency. Decrypt each seat's `encryptedToken` with the
      identity at `seatKey` on each lore read, at start and at each cycle start (#179's reread,
      and #208's once built), and hold the plaintext in memory until the next lore read; `resolveToken` returns the held value and
      never decrypts. Nothing is decrypted when a worker or a probe starts (proposal, decision 37).
      The plaintext is `<id>:<token>`: split it at the first colon, and fail decryption where
      there is no colon or the id is not the file's own; the seat's token is the part after the
      colon (proposal, decision 40). Tests: *Ciphertext copied into another seat file is refused*
      and *A plaintext with no seat id is refused*
- [ ] 3.4 Decryption failures report the seat unreadable, worded so, after the existing `seat
      "<id>"` subject:

      ```
      carries an encrypted token, and igor.config.yaml names no seatKey to decrypt it with.
      carries an encrypted token, and the key at <path> could not be read: <reason>
      carries a token encrypted to a different key from the one at <path>. Its holder re-encrypts it to seats/recipient.txt with `igor seat add <id>`.
      carries an encrypted token that could not be decrypted: <reason>
      carries a token encrypted for seat "<found>", not for this seat. Only a token encrypted for this seat by `igor seat add <id>` is used.
      carries an encrypted token with no seat id before it. Its holder re-encrypts it with `igor seat add <id>`.
      ```

- [ ] 3.5 #101's credential digest is taken of the decrypted token, without the seat id before it.
      Test: the same token encrypted twice yields one digest
- [ ] 3.6 Tests: each scenario of *A seat file names its token only by ciphertext or its own
      variable* and *A seat's token travels as ciphertext in its file*; the plaintext appears in
      no record, transcript or handoff; the existing `token_file` and `token_command` tests in
      `test/budget.test.ts` are removed with the code they test
- [ ] 3.7 `src/execute.ts`'s worker environment: a lent seat's worker gets the plaintext held
      from the last read of the seat files, per the `task-execution` delta. Test: with the key
      file made unreadable after start, a worker on a seat decrypted at start still gets its
      token, and no decryption runs at spawn. The file and command cases and their tests go
- [ ] 3.7a A decrypted token is held in memory only and reaches a worker only through its
      environment (*A decrypted seat token never touches the server's disk*). Test: a run with a
      seat whose token is a known test value, then a search of every log, transcript, handoff,
      condition report and file on the state branch that the run wrote, and of the argument
      lists of processes Igor started, finds the value nowhere; a forced spawn failure and a
      forced crash print the seat's id and not the value
- [ ] 3.7b When a pull of the lore checkout (#176) removes a seat file, apply the removal even
      where the rest of the pull is refused: drop the token from memory, give the seat to no new
      worker, kill each worker using it (the `claude -p` child and every process its worker user
      owns), and hand off its item, with the Igor process still running. Where no seat file then
      lists a role, as after removing the last one, the role has no usable seat: it hands off
      what its workers held, takes no new item, and makes no model call on a stored login. Tests:
      the scenarios of *A removed seat file always takes effect*. This task needs the pull that
      `lore-pull` (#208) builds, and #208 archives after this change, so before this change
      archives, file an issue for this task and tick it with a pointer to the issue
- [ ] 3.8 Under `igor run`, the only seat is the implicit local seat `_run`, whose token is
      `IGOR_RUN_TOKEN`'s value, with reserve 0 and no role reserve applied (proposal, decision
      39; Adam confirmed the id, the reserve and the unapplied role reserve on 2026-10-19). No seat file's seat is drawn on, and no `encrypted_token` is decrypted. No seat file
      needs to list the role. At start Igor prints, worded so:

      ```
      igor run spends the token in IGOR_RUN_TOKEN, as seat "_run". It draws on no seat under seats/.
      ```

      Where the variable is unset or empty, `igor run` refuses before any model call, worded so:

      ```
      igor run needs a Claude token in IGOR_RUN_TOKEN. It spends that token and no other. To create one:
        1. In another terminal, run: claude setup-token
        2. Sign in with the Claude account whose subscription igor run should spend.
        3. Copy the token it prints, set IGOR_RUN_TOKEN to it, and run igor run again.
      ```

      Tests: the scenarios of *`igor run` spends its own token as an implicit local seat* and
      *A lent seat is decrypted only where the worker has a user of its own*
- [ ] 3.8a Where the configuration names a `seatKey` and `igor run` can read the file at that
      path, `igor run` refuses to start before any model call (proposal, decision 65), worded so:

      ```
      igor run can read the seat key at <path>, and its worker runs as the same user, so it could read every lent token. Run igor run as a user that cannot read <path>.
      ```

      Test: *`igor run` refuses where it can read the server's key*
- [ ] 3.9 A seat whose file Igor fails to decrypt, for any reason, on a lore read, opens a condition on the seat, and a later read that decrypts it
      clears the condition (Adam, 2026-10-17). The seat is ineligible, #143's probe skips it,
      and its condition stops no role: a role with no other
      usable seat hands off rather than stops, with a condition handoff naming the condition and
      its cure and stating no return time (proposal, decision 63). Where the key is read but the
      ciphertext does not decrypt with it, the condition's report, which a handoff quotes, names
      the seat and never its `owner`, since a handoff may sit on a public issue (proposal,
      decision 58). `igor budget` names the `owner` on the seat's line, shown only where it has a
      GitHub login's form. Task 3.4's line is the seat's unreadable report, which `igor budget`
      shows. Where the plaintext names another seat's id, or none, the condition's
      report adds task 3.4's line for that case. For a missing `seatKey` or a key file that
      cannot be read, the condition's report is task 3.4's line for that case, which names the key. Worded so, one line per case (may be reworded;
      each must name the seat and who re-lends it, and no owner):

      ```
      seat "<id>" carries a token this Igor cannot decrypt, so no role draws on it. Its lender re-lends it with `igor seat add <id>`; `igor budget` names the lender.
      seat "<id>" carries a token this Igor cannot decrypt, so no role draws on it. Its seat file names no owner: the operator re-lends it with `igor seat add <id>` or removes the file.
      ```

      Tests: the scenarios *A lent seat that does not decrypt is skipped, and its lender named
      only to the operator*, *`igor budget` shows an owner only in a login's form*, *A failed
      decryption opens the condition, and a good read clears it*, *A role whose only seat is
      undecryptable hands off rather than stops*, and `stuck-conditions`' *An undecryptable
      seat's condition stops no role*. Until `lore-pull` (#208) pulls the checkout, the test of a
      good read updates the seat file in the checkout by hand, then waits for the next cycle start

- [ ] 3.9a Where the gate would choose a lent seat for which the process holds no plaintext,
      because another process's passing read cleared the condition this process's read opened,
      the process first makes a lore read of that seat's file, from the commit it last applied
      (proposal, decisions 60 and 71), at most once a cycle. A pass gives it the plaintext; a
      failure passes the seat over for this process only and appends no condition row. Test: *A process with no token for an
      eligible seat reads its file first*

- [ ] 3.10 No model call Igor makes, under `igor serve` or `igor run`, is given a stored Claude
      login in place of a seat's token (proposal, decision 36; *A spend with no seat behind it is
      not made*).
      Triage, worker runs and probes each carry the chosen seat's token, and where the gate names
      no seat no call is made. Test: with a stored login in the home directory of the user Igor
      runs `claude` as, and no seat serving the role, a cycle makes no model call; with a seat, every call carries
      that seat's token, #174's startup skills check included (proposal, decision 42). The reset
      that removes a stored login from a worker's home is #174's and #175's. Under `igor serve`
      no stored login exists. Under `igor run`, #174's task 0.3 found that Claude Code 2.1.303 does
      not prefer a stored login over the token in the environment. Were a version to, a call would
      spend the developer's own login, which is accepted (proposal, decision 45), and nothing works
      around it
- [ ] 3.11 #143's probe skips a seat whose condition `seat:<id>:decrypt` is open, and `igor run`
      makes no seat probe (proposal, decision 41; the `MODIFIED` block on #143's *A seat nothing
      has read is probed on the Igor server with its own token*). Tests: *An undecryptable seat
      is not probed* and *`igor run` probes no seat*
- [ ] 3.12 Confirm, on a server set up by the operator guide, that the service user's home holds
      no stored Claude login, so that under `igor serve` none exists (proposal, decisions 45 and
      68). Do it before gate two (Adam, 2026-10-19). If one can exist there, that goes back to Adam

## 4. Which seats a role draws on

- [ ] 4.1 `src/role.ts` `checkSeat` (`:517`): a role's seats are the seat files listing it;
      `seat:` narrows to one, which must list the role. Refusals, worded so:

      ```
      role "<role>" names seat "<seat>", which has no seat file. Seats: <ids>
      role "<role>" names seat "<seat>", and seats/<seat>.yaml does not list it. The seat's holder lists the roles it serves in that file.
      role "<role>" is served by no seat. A seat serves a role when its file under seats/ lists the role in `roles`. With no lender, declare one from your own token: docs/deployment.md, "Declaring a seat by hand".
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

## 6. Moving `adamstallard/igor-lore`'s seat

- [ ] 6.1 In `adamstallard/igor-lore`, on a branch and pull request: add `seats/adam.yaml` with
      `owner: adamstallard`, `reserve: 0.5`, `roles: [generalist]` and
      `token_env: IGOR_SEAT_ADAM`; delete `budget` from `igor.config.yaml`; delete `seat: adam` and
      its comment from `roles/org.yaml`. The token stays in the server's env file as
      `IGOR_SEAT_ADAM`, put there by hand from the keychain entry `claude-adam-personal`

## 7. `igor seat add`

- [ ] 7.1 `src/cli.ts`: `igor seat add <id> [--lore <owner/repo>] [--reserve <r>] [--roles <a,b>]`.
      `--lore` names the lore repository. In a clone of the lore repository, or of a fork of it,
      `--lore` may be left out, and the lore repository comes from the clone's `upstream` remote
      where there is one, and otherwise `origin`. Outside a clone, a missing `--lore` is refused
      before the token is read. Before reading the token, print the lore repository, and the
      remote it came from where it was inferred, worded so:

      ```
      Lending to <owner/repo> (from the clone's <remote> remote).
      ```

      The holder's login comes from `gh api user`
- [ ] 7.1b For a new seat, prompt for whichever of `--reserve` and `--roles` is left out, before
      the token is read (proposal, decision 69). A rotation prompts for neither. The reserve is
      asked again until it is a number from 0 to 1; the roles are asked again while a name has no
      role file on the default branch, and an empty answer writes `roles: []`. Worded so; Adam
      may reword it:

      ```
      Reserve: the share of each usage window Igors leave for you, from 0 to 1. 0 lets Igors use the whole window; 0.5 keeps half of it for you.
      Reserve:
      ```

      ```
      Roles: the kinds of Igor work your seat pays for. Your seat serves only the roles you name here. Roles defined in <owner/repo>: <names>
      Roles (comma-separated, or empty to serve none yet):
      ```

      Test: *A left-out reserve and roles are asked for*
- [ ] 7.1a Check `owner` with `gh api users/<owner>` before writing the seat file (proposal,
      decision 12). With the owner taken from `gh api user` the check passes in every ordinary
      case; it is kept so that `owner` is checked the same way wherever it is written. A login it
      does not find is refused, worded so:

      ```
      <owner> is not a GitHub login, so no change to seats/<id>.yaml could mention you.
      ```
- [ ] 7.2 Read `seats/recipient.txt` from the lore repository's default branch with `gh api`. Then
      print the steps for creating a token, worded so. Adam may reword this text as he chooses:

      ```
      To lend your seat, create a token for it:
        1. In another terminal, run: claude setup-token
        2. Sign in with the Claude account whose subscription you are lending.
        3. Copy the token it prints. It is shown once.
      Paste it here. It will not be shown, and it is encrypted before it leaves this command.
      ```

      Read the token with echo off. Encrypt `<id>:<token>` with `age-encryption`, base64 on one
      line (proposal, decision 40). Test: the ciphertext decrypts to the seat id, a colon and the
      token
- [ ] 7.3 A new seat: write `seats/<id>.yaml`. The file it writes:

      ```yaml
      # <id>'s seat: a Claude subscription lent to this team's Igors, on the terms below.
      # To withdraw, or to stop any use you did not agree to, revoke the token at Anthropic,
      # which stops the seat. See docs/seats.md.
      owner: <login>
      # The share of each window Igors leave for you, from 0 to 1.
      reserve: <r>
      # The roles that may draw on this seat.
      roles: [<roles>]
      # Your token, encrypted to the Igor server's key in seats/recipient.txt. Only the server can
      # decrypt it. Rotate it with `igor seat add <id>`.
      encrypted_token: <ciphertext>
      ```

- [ ] 7.4 An existing seat naming `encrypted_token`: replace it and change nothing else. One naming
      `token_env` is refused before the token is read, worded so:

      ```
      seats/<id>.yaml names token_env: its token is set on the Igor server by the operator, so `igor seat add` does not rotate it.
      ```
- [ ] 7.5 Commit on branch `seat/<id>`, in the lore repository where `gh api` says the holder
      may push, and otherwise in their fork, creating it with `gh repo fork` where it does not
      exist. Inside a clone, commit locally and push the branch. Outside a clone, create the
      branch and commit the file through the GitHub API with `gh api`, cloning nothing. Open the
      pull request through `gh`. Its body:

      ```
      Lends seat <id> to this team's Igors: <reserve> reserve, serving <roles>. The token is encrypted to seats/recipient.txt, so only the Igor server can read it. Revoking it at Anthropic stops the seat. After merging, the operator updates the server's lore checkout.
      ```

      and, for a rotation:

      ```
      Rotates seat <id>'s token. Nothing else about the seat changes. After merging, the operator updates the server's lore checkout.
      ```

- [ ] 7.6 Refusals before the token is read: `gh` not installed or not signed in; no
      `seats/recipient.txt` on the default branch; an invalid id; a seat naming `token_env` (7.4).
      Outside a clone, a missing `--lore`. After it is read: an empty token. The `--lore`
      refusal, worded so:

      ```
      igor seat add is not running in a clone of the lore repository, so it needs --lore <owner/repo> to know where to open the pull request.
      ```

      The `gh` refusal, worded so:

      ```
      igor seat add opens your pull request through gh, so it needs gh installed and signed in: https://cli.github.com, then `gh auth login`.
      ```
- [ ] 7.7 Tests, with `gh` faked, signed out and absent: the scenarios of *`igor seat add` lends a
      seat in one step*, and that no argument list, written file or child environment contains the
      token

## 8. `igor doctor`

Adds to the `igor doctor` command that `check-a-lore-repository` (#113) builds, which is built
first (Adam, 2026-10-17).

- [ ] 8.1 The key match, per *The check says whether the server's key matches the committed one*,
      with a test for each of its scenarios. A key file the person running the check cannot read
      is reported unchecked with the reason, the way `check-a-lore-repository` reports a check it
      cannot make
- [ ] 8.2 The notice workflow, per *The check says whether seat owners are told of changes to
      their seat files*, read from the default branch the way the reconciliation-workflow check
      reads its file, with a test for each of its scenarios. The finding, worded so:

      ```
      .github/workflows/seat-notice.yml is missing from <branch>, so no lender is told when a pull request changes their seat file, and revoking their token is their only veto. Run `igor init` to write it.
      ```

      Where the file is present, read the workflow's state and whether Actions are enabled for
      the repository; a disabled workflow, or Actions off, is a finding, and an unreadable state
      is unchecked. Read the workflow's most recent run; a failed run is a finding naming it.
      Tests: *A disabled notice workflow*, *A failing notice workflow is reported* and *The
      workflow's state cannot be read*
- [ ] 8.3 The configuration's validation, which reads no secret, reports a seat file carrying
      `encrypted_token` while `igor.config.yaml` declares no `seatKey` (proposal, decision 43).
      `igor doctor` shows it because #113 has `doctor` invoke that validation; `doctor` has no
      check of its own for it. The finding, worded so:

      ```
      seats/<id>.yaml carries an encrypted token, and igor.config.yaml names no seatKey, so Igor cannot read that seat. Set seatKey to the private key whose public half is seats/recipient.txt.
      ```
- [ ] 8.4 Add `seatKey` to worker-user's (#175) start-up probe, which is built first: the worker
      user cannot read the file `seatKey` names, and a start where it can is refused, naming the
      path. Test it with the probe's other paths. #175's task 0.1 lists the same path; where #175
      already added it, this task is the test alone
- [ ] 8.5 The owner check, per *The check says whether each seat's owner is a GitHub login*, with a
      test for each of its scenarios. The finding, worded so:

      ```
      seats/<id>.yaml names owner <owner>, which is not a GitHub user's login, so the notice workflow cannot reach the seat's holder about a change to that file. The seat's holder, or the operator for a holder with no GitHub account, sets owner to a GitHub login in a pull request.
      ```

      An `owner` not in a login's form is reported without calling `gh api`; an `owner`
      that `gh api users/<owner>` reports as an organization gets the same finding

## 9. Docs and templates

Done means a newcomer follows the operator guide on a fresh server and a fresh lore repository,
then the lender guide, and ends with a working seat. Every key and token the flow uses is covered:
where it is created, where it lives, who can read it, how it is rotated, and what to do if it
leaks.

- [ ] 9.1 `deploy/igor.service`: the `LoadCredential=` example and its comment go
- [ ] 9.2 `deploy/env.example`: the `LoadCredential=` and `token_file` paragraph goes. The seat
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

- [ ] 9.3 `docs/deployment.md`, the operator guide, replacing *Adding a seat somebody has given
      you* and *Keeping the token out of your shells* with sections covering:
  - **The server keypair, first and prominently, since it is the whole protection:**
    `age-keygen -o /etc/igor/seat-key.txt` as the service user, `0600`, owned by the service
    user; commit `age-keygen -y` of it as `seats/recipient.txt`; name its path as `seatKey`; back
    it up off the server where only the operator can read it, and what losing it costs (every
    holder re-encrypts); rotating it (a new keypair, the new public key committed, every holder
    runs `igor seat add`); a leaked key (rotate, and every holder revokes at Anthropic and
    re-issues, because old ciphertext in history decrypts with the old key)
  - **Taking in a seat:** what to check in the pull request (the file's `roles` and `reserve`, and
    that `recipient.txt` is untouched), that lenders need no access beyond opening it, from a fork
    if need be, and that the seat takes effect once the server's lore checkout is updated (#176)
  - **Declaring a seat by hand:** a seat file naming `token_env: IGOR_SEAT_<ID>`, and the token in
    `/etc/igor/env`; a secret store's output goes there too. Give the steps for creating the
    token, as 9.5 gives them: `claude setup-token`, signed in with the Claude account whose
    subscription the seat is
  - **The first seat, for an organization with no lenders:** Igor never uses a stored Claude
    login, so nothing runs until a seat file lists each role. The operator creates a token from
    the organization's own subscription and declares it by hand, as above, or lends it with
    `igor seat add` like any lender. With no seat file, each role is refused at start
  - **What the lender keeps:** they can revoke their token at any time, which stops the seat, and
    that is how they answer an edit to their seat file they did not agree to. The
    `seat-notice.yml` workflow mentions them on any pull request changing their file; keep it
    installed (`igor init` puts it there), and tell a lender whose `owner` is not a GitHub login
    about a change some other way. Require a pull request before merging to the default branch,
    since only a pull request's notice comes before the change lands; `igor doctor` reports a branch that
    does not
  - **Checking it:** `igor doctor`, and `igor budget` showing the new seat as readable
  - **When things go wrong:** removing a seat (delete its file, and for a `token_env` seat also
    remove its `IGOR_SEAT_<ID>` variable from the server's env file, since a later pull request
    adding a file of that id would spend whatever token the variable still holds); a lender withdrawing (they revoke
    the token; delete the file); a leaked server key (above); a leaked seat token (its holder
    revokes it at Anthropic and runs `igor seat add` with a new one)
  - The *When something is wrong* table gains the refusals of tasks 2.2, 3.2, 3.4 and 4.1, and
    loses its `pool:` rows
  - Every passage saying that a seat may name no token, or that a login on the server can answer
    for a seat, goes, such as step 4's sentence that "an ambient login or a keychain can answer
    for a seat that names no token source"
- [ ] 9.4 `docs/seats.md`, the lender guide, rewritten around the file. **Before lending:** you
      choose the roles your seat serves and the reserve it keeps, in your own pull request; you
      trust the server's operator, who can use your token within your subscription and can edit
      your seat file after it merges; what the operator does to protect the token (the server's
      private key; it travels encrypted in a file anyone may be able to read, and only that key
      opens it); what bounds that trust (a `setup-token` only makes model requests, the reserve
      limits Igor's share, you can watch your usage at claude.ai); that you are mentioned on each
      push to a pull request that changes your seat file, as long as `owner` is your GitHub login;
      and **revoking the token at Anthropic, through the claude.ai web interface, is how you
      withdraw or object to anything: it stops the seat, whatever any file says**. The guide
      promises no speed for it, and names no page more exact than claude.ai, since Adam gave none
      (task 1.2)
- [ ] 9.5 `docs/seats.md`, **getting the token:** the steps, numbered: run `claude setup-token`
      once, in your own terminal; sign in with the Claude account whose subscription you lend;
      copy the token it prints, which is shown once; and paste it when `igor seat add` asks,
      which prints the same steps (7.2). Why it never goes into chat, email, or a file
      unencrypted. A plain token
      pasted into a pull request is public as soon as it is pushed, before Igor can refuse it, and
      is to be revoked at once
- [ ] 9.6 `docs/seats.md`, **lending it:** one path, `npx igor-agent seat add <id> --lore <owner/repo>`, with Node and
      `gh`, installed and signed in, as the prerequisites: what it asks for, and that it opens the
      pull request through `gh`. A person with no GitHub account lends through the operator, whose
      login is then the seat file's `owner`. No manual `age` steps and no route through a clone
- [ ] 9.7 `docs/seats.md`, **afterwards:** watching your usage at claude.ai, and what to do when
      you are mentioned on a pull request changing your seat file (say so there if you object; revoke
      the token if it merges anyway); **changing your mind:** rotating (`npx igor-agent seat add`
      again, changing only `encrypted_token`), changing roles or reserve (a pull request to your
      file), withdrawing or objecting (revoke the token at Anthropic, through claude.ai), and the one-year expiry (#145).
      **Removing your seat file** gets this text, which Adam may reword:

      ```text
      Revoking your token at Anthropic is the only real withdrawal. Removing your seat file only stops Igor's own use of your token.
      ```
- [ ] 9.8 `docs/seats.md` *What the floor rests on* and *Several people, one fleet* describe the
      line (#143) and choice by headroom, with no pool and no listed order
- [ ] 9.9 `README.md`: the quick start declares a seat file and puts the token in the
      environment, with the shell wrapper `docs/deployment.md` already has; `token_command` and
      `token_file` go. *Budgets* loses `pools:` and `pool:engineering`, and its sample `igor budget`
      output loses the `pool engineering:` line, and its `dedicated: true` seat goes. The note
      "(#148 replaces `pools:` …)" goes, since it describes this change as future. The install
      section says Igor installs from npm as `igor-agent`, in place of "Igor is not on npm yet".
      "Declare no seats at all and budget is not enforced, and roles need not name one." goes:
      every role needs a seat, and the quick start's seat file is how an organization with no
      lenders gets one. The README's `npm unlink -g igor-lore` becomes `npm unlink -g igor-agent`.
      Where the README runs `igor run`, it first sets `IGOR_RUN_TOKEN` to a token from `claude
      setup-token`, and says `igor run` spends that token and no seat under `seats/` (proposal,
      decision 39)
- [ ] 9.10 `docs/architecture.md` §6.5.1: a seat file lists the roles it serves, and the seat is
      chosen by headroom; "Order is the whole allocation mechanism today" and the `pools:`
      example go, and the heading loses its "being replaced (#148)" marker. §6.3.2's list of
      token mechanisms becomes `encrypted_token` and `token_env`. §6.7.1's "One secret store for
      seat tokens, on the server" describes a lent token as ciphertext in its seat file. §6.6,
      "Distribution: public repository now, npm later", loses its **planned** marker and its
      "when a second adopter appears" rule, and says Igor is published to npm as `igor-agent`
      (proposal, decision 19)
- [ ] 9.11 `igor.config.example.yaml`: `budget` goes, replaced by a comment pointing at `seats/`
      and `seatKey`:

      ```yaml
      # Seats are files under seats/, one per Claude subscription, each stating the roles it
      # serves and the reserve it keeps. See docs/seats.md for lending one and
      # docs/deployment.md for running the server.
      #
      # The age private key that decrypts the encrypted_token in each seat file. Only needed once
      # a seat carries one; a seat naming token_env needs no key.
      # seatKey: /etc/igor/seat-key.txt
      ```

- [ ] 9.12 `test/documented-config.test.ts`: the `budget` and `seats` levels become one `seat`
      level, read by the seat-file reader, and every `igor:budget` and `igor:seats` fence in the
      docs is retagged `igor:seat`
- [ ] 9.13 `igor budget` names, for each seat, the roles its file lists

## 10. Telling a lender about a change to their seat file

- [ ] 10.1 `templates/seat-notice.yml`, worded so. The comment's text is the deliverable too:

      ```yaml
      # Tells a seat's owner about every pull request that changes their seat file, by mentioning
      # them on it, and again on every push to it that changes that file. Revoking their token is a lender's veto over how their seat is used, and this
      # is how they hear about a change before it lands. After a change lands, the Igor posts its
      # own notice when it pulls the change into its lore checkout; this workflow posts nothing
      # then.
      #
      # It runs on pull_request_target, so it also runs for pull requests from forks, with a token
      # that can comment. That trigger runs with this repository's permissions, so this job takes
      # nothing from the pull request's head but the names of the paths it changes. It fetches the
      # head's commits and trees as git data, with no checkout and no file contents, and runs
      # nothing from them. Each name is matched against the seat-file pattern before use. The owner
      # comes from the default branch's copy of the file. Keep it that way: reading or running the
      # head's files here would hand a fork's code a token that can write to this repository.
      #
      # The trigger has no paths filter, and must not get one: GitHub's filter misses a seat file
      # that sorts after a pull request's first 3,000 files, so a padded pull request could hide
      # a change from its lender. A pull request with no seat file costs one fetch and posts nothing.
      #
      # It reads no earlier comment to decide whom to mention. Every workflow in this repository
      # posts as github-actions[bot], and a pull request from a branch here can bring its own
      # workflow, so no comment, whoever it seems to come from, proves an owner was told.
      name: Notify seat owners

      on:
        pull_request_target:
          types: [opened, reopened, synchronize, ready_for_review, edited]

      permissions:
        contents: read
        pull-requests: write

      jobs:
        notify:
          runs-on: ubuntu-latest
          steps:
            - name: Mention the owner of each seat file this event changes
              env:
                GH_TOKEN: ${{ github.token }}
                REPO: ${{ github.repository }}
                PR: ${{ github.event.pull_request.number }}
                BASE: ${{ github.event.pull_request.base.sha }}
                DEFAULT: ${{ github.event.repository.default_branch }}
                AUTHOR: ${{ github.event.pull_request.user.login }}
                SENDER: ${{ github.event.sender.login }}
                ACTION: ${{ github.event.action }}
                BEFORE: ${{ github.event.before }}
                BASE_CHANGED: ${{ github.event.changes.base.ref.from != '' }}
              run: |
                set -euo pipefail
                # An edit that leaves the base branch alone, such as a new title, changes no file.
                [[ "$ACTION" == edited && "$BASE_CHANGED" != true ]] && exit 0
                export GIT_DIR="$RUNNER_TEMP/pr.git"
                git init -q --bare "$GIT_DIR"
                gh auth setup-git
                url="https://github.com/$REPO"
                git fetch -q --no-tags --filter=blob:none "$url" \
                  "+$BASE:refs/igor/base" "+refs/pull/$PR/head:refs/igor/head"
                # A push names what that push changed. Where the head before it cannot be
                # fetched, as after some force-pushes, compare with the base instead.
                range=(refs/igor/base...refs/igor/head)
                if [[ "$ACTION" == synchronize ]] &&
                  git fetch -q --no-tags --filter=blob:none "$url" "+$BEFORE:refs/igor/before" 2>/dev/null; then
                  range=(refs/igor/before refs/igor/head)
                fi
                git diff --name-only --no-renames -z "${range[@]}" -- seats/ > "$RUNNER_TEMP/paths"
                lines=()
                while IFS= read -r -d '' path; do
                  [[ "$path" =~ ^seats/[a-z0-9][a-z0-9-]*\.yaml$ ]] || continue
                  owner=$(gh api "repos/$REPO/contents/$path?ref=$DEFAULT" --jq .content 2>/dev/null \
                    | base64 -d | yq -r '.owner // ""') || continue
                  [[ "$owner" =~ ^[A-Za-z0-9](-?[A-Za-z0-9])*$ ]] || continue
                  me=$(tr A-Z a-z <<<"$owner")
                  # The owner's own push to their own pull request needs no notice; anyone
                  # else's push to it does.
                  [[ "$me" == "$(tr A-Z a-z <<<"$AUTHOR")" && "$me" == "$(tr A-Z a-z <<<"$SENDER")" ]] && continue
                  lines+=("- @$owner: this pull request changes your seat file, \`$path\`.")
                done < "$RUNNER_TEMP/paths"
                [[ ${#lines[@]} -eq 0 ]] && exit 0
                body="$(printf '%s\n' "${lines[@]}")"$'\n\n'
                body+="Your seat serves the roles and keeps the reserve its file states. "
                body+="If you don't agree to this change, say so here. "
                body+="To stop your seat being used at all, revoke its token at Anthropic, whatever this change does."
                gh api "repos/$REPO/issues/$PR/comments" -f body="$body" > /dev/null
      ```

- [ ] 10.2 `src/init.ts`: `igor init` installs `seat-notice.yml` beside `reconcile-on-merge.yml`,
      under the same rules for an existing file, and it can be named as a target, per the
      `lore-store` delta
- [ ] 10.3 Tests in `test/template.test.ts`: the template parses; its only trigger is
      `pull_request_target`, with no `paths` or `paths-ignore` filter; its permissions are exactly
      `contents: read` and `pull-requests: write`; it runs on `ubuntu-latest`; it has no
      `uses:` step and no `actions/checkout`; and no expression in it reads
      `github.event.pull_request.head`
- [ ] 10.4 Tests of the script, run under bash with `gh` faked and a local repository standing in
      for GitHub's: each scenario of *A pull request that changes a seat file mentions that seat's
      owner*; and a path such as `seats/$(touch x).yaml` or one containing a space, a newline or
      `*`, which is neither run nor expanded; a pull request of 3,101 files whose seat file sorts
      after the first 3,000; a push whose earlier head cannot be fetched, which falls back to the
      base; and an earlier comment shaped like the notice, from any author, which changes nothing
- [ ] 10.5 In `adamstallard/igor-lore`, with task 6.1: add `.github/workflows/seat-notice.yml`
      from the template
- [x] 10.6 ~~Measure whether a push through the Actions bypass runs `seat-notice.yml`~~ Moot:
      the workflow's `push` trigger is dropped (proposal, decision 26; Adam, 2026-10-17), so no
      push runs it
- [x] 10.7 Measure whether GitHub starts a `pull_request_target` workflow filtered on
      `seats/**` for a pull request that changes more than 300 files, one of them a seat file.
      Measured 2026-10-19: it ran at 351 files, and at 3,101 files missed a seat file sorting after
      the first 3,000. `design.md`, *The lender hears about a change to their seat file*, records
      it. Adam dropped the filter (decision 46)
- [x] 10.8 ~~Run the shipped `seat-notice.yml` on a 3,101-file pull request~~ Dropped (Adam,
      2026-10-19; proposal, decision 62): `git diff --name-only` with a `seats/` pathspec never
      pages through the pull request's files, and the 3,000-file limit belongs only to GitHub's
      `paths:` filter and files API. 10.4's local test covers *A seat file in a very large pull
      request is still noticed*
- [ ] 10.9 Before the template ships, run the shipped `seat-notice.yml` in a scratch repository on
      an ordinary small pull request that changes a seat file, from a fork, then push a second
      commit that changes the file again. Confirm both the opening and the push mention the
      seat's owner. Record the result in `design.md`, *The lender hears about a change to their
      seat file*

## 11. Matching condition-backoff (#101)

#101 is in force before this change is built, and the `stuck-conditions` delta here restates five
of its requirements. Build each against #101's code:

- [ ] 11.1 *A seat's refused credential is a condition on that seat*: the hash is of the decrypted
      token of a lent seat, never the ciphertext, and the ambient-credential case goes, since
      every seat file names a token source. Test: the same token encrypted twice leaves an open
      condition open
- [ ] 11.2 *Reporting tells a refused credential from an unreadable one, and clears nothing*: the
      report's remedy for an unreadable seat names the seat's `IGOR_SEAT_<ID>` variable or the
      private key file that `seatKey` names, never a token file path
- [ ] 11.3 *A condition's scope is its cure's scope*: an unreadable seat, including one whose token
      cannot be decrypted, is taken out of every role's choice, and a role stops where every seat
      serving it is under an open condition that is not read-cleared (Adam, 2026-10-17); a seat
      whose file Igor could not decrypt, or whose file is malformed, stops no role (3.9, 2.2a). A role with no eligible seat
      where only some seats are under conditions, and the rest are at their lines, hands off
      rather than stops, naming each condition in the handoff (Adam, 2026-10-17). Test each of its seat scenarios

- [ ] 11.4 *A condition that recurs stops the affected scope from taking new work*, in the
      exception to recurrence it states: a seat file Igor fails to decrypt opens the seat's
      condition on its first occurrence, and a later read
      that decrypts the file clears it, with no cooldown and no probe item (proposal, decision
      31; task 3.9). It is a read-cleared condition, built once as *A read-cleared condition opens
      on a failing read and clears on a passing one* states, so the conditions #179 and #208 open
      on a refused configuration reuse the same code (proposal, decision 38). The code takes, from the rule using
      it, how many failing reads in a row open it, one by default. Tests: the first failed read
      opens it; with a count of three, the third failed read in a row opens it and the first two
      do not; a good read clears it; no probe item is ever taken for it; it stops no scope by
      itself
- [ ] 11.5 *A condition clears by not recurring, and a probe is what observes that*: a read-cleared
      condition takes no probe item and waits for no cooldown; it clears only on a passing read
      (proposal, decision 38). Test: the scenario *A read-cleared condition takes no probe item*
## 12. Publishing to npm as `igor-agent`

- [ ] 12.1 `main` already builds to `dist/` with `tsc`, `prepack` runs the build, `bin.igor` is
      `./dist/cli.js`, and `files` is declared. Test that a tarball from `npm pack`, installed
      where no TypeScript tooling is, runs `igor --help`, and add to `files` whatever the installed
      package reads that it lacks
- [ ] 12.2 `package.json`: `name` becomes `igor-agent` (it is `igor-lore` on `main`), `bin` stays
      `igor`, and `description` is the README's opening line, verbatim and not reworded:

      ```
      AI teammates that find their own work, claim it in the open, and draw on what the team has already learned.
      ```

      Add `engines`, set to `node >= 26`
- [ ] 12.2a A licence check, run by 12.3 before publishing: the package's own `license` field and
      every dependency's licence are each on an allowlist kept in the repository, and any that is
      not fails the release, naming the package and its licence (Adam, 2026-10-17). The
      allowlist holds exactly these SPDX identifiers (Adam, 2026-10-17); any other, copyleft
      included, fails until someone adds it on purpose:

      ```
      MIT
      ISC
      BSD-2-Clause
      BSD-3-Clause
      Apache-2.0
      0BSD
      CC0-1.0
      Unlicense
      BlueOak-1.0.0
      ```
- [ ] 12.3 A release workflow under `.github/workflows/`, triggered by pushing a version tag, on
      GitHub-hosted runners: it builds, runs the licence check, and publishes through npm trusted
      publishing (OIDC), with `id-token: write` in its permissions and no npm token stored
      anywhere (Adam, 2026-10-17). Configure `igor-agent` on npm to trust this workflow. Trusted
      publishing adds provenance to each version. `igor-agent` does not exist on npm yet: first
      measure whether a trusted publisher can be configured for a package that has never been
      published. If trusted publishing cannot make the first publish, Adam makes that one publish
      by hand (proposal, decision 59)
- [ ] 12.4 Test from a clean machine with only Node and a signed-in `gh` installed that
      `npx igor-agent seat add <id> --lore <owner/repo>` works outside any clone, after the first
      release. Record the result in `design.md`

## 13. Archiving

- [ ] 13.1 Archive in the order issue #204 holds, so that this change's `MODIFIED` blocks apply
      to #101's and #143's in-force text and its `setup-check` delta finds #113's requirements
      (proposal, decision 32). This change archives in the same commit as #143
- [ ] 13.2 #99 (`structured-failure-record`, its task 8.1) rewrites the same pointer in
      `work-triage`'s *A candidate left untriaged is not a candidate triage decided about*,
      "what becomes of it is #78". Whichever of the two archives second merges the two texts by
      hand
- [ ] 13.3 If #196 (spec-trace) has merged by the time this change archives, its CI fails each new
      scenario with no tagged test. Tag a test for each scenario this change adds. For a scenario
      no test in this repository can run, such as *A pull request from a fork is noticed too*,
      do what #196 provides for such a scenario, or ask Adam if it provides nothing
