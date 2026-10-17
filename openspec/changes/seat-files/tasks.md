Build after `condition-backoff` (#101) and `read-seat-windows-from-the-stream` (#143). Line numbers
below are main's at the time of writing and will have moved under those two changes; the names are
what to find. Where a task quotes text in a fenced block, that text is the deliverable: it may be
reworded only where a measurement in section 1 contradicts it, and then `design.md` records the
measurement.

## 1. Measure what the guides depend on

- [ ] 1.1 Confirm `age-encryption` decrypts what `age -r <recipient> | base64 | tr -d '\n'`
      produces on macOS and Linux, after `base64 -d`, and that `age-keygen -y` derives the same
      recipient the package derives from the identity
- [ ] 1.2 Measure revoking one `setup-token` at Anthropic: that one token can be revoked without
      the holder's other tokens, how soon the next request with it is refused, and whether a run
      already in progress is refused. Record the result in `design.md`. Task 9.4's and 9.7's
      "stops the seat at once" says what the measurement found, such as "stops the seat within
      <n> minutes", and the proposal's open question is closed with it

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

- [ ] 2.3 `src/config.ts`: `budget` leaves `CONFIG_KEYS`. `seatKey` joins `CONFIG_KEYS`: a string
      path, resolved against the config file's directory
- [ ] 2.4 `Config.budget` is filled from the seat files at load, so callers of `config.budget` keep
      working
- [ ] 2.5 Tests in `test/config.test.ts` and `test/budget.test.ts`: each scenario of *A seat is a
      file under `seats/`*; no `seats/` means budget is not enforced; `recipient.txt` is not read
      as a seat


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
- [ ] 3.7 `src/execute.ts`'s worker environment: a seat whose token cannot be decrypted fails
      naming the seat and the reason, per the `task-execution` delta, with a test; the file and
      command cases and their tests go

## 4. Which seats a role draws on

- [ ] 4.1 `src/role.ts` `checkSeat` (`:517`): a role's seats are the seat files listing it;
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

## 6. Moving `adamstallard/igor-lore`'s seat

- [ ] 6.1 In `adamstallard/igor-lore`, on a branch and pull request: add `seats/adam.yaml` with
      `owner: adamstallard`, `reserve: 0.5`, `roles: [generalist]` and
      `token_env: IGOR_SEAT_ADAM`; delete `budget` from `igor.config.yaml`; delete `seat: adam` and
      its comment from `roles/org.yaml`. The token stays in the server's env file as
      `IGOR_SEAT_ADAM`, put there by hand from the keychain entry `claude-adam-personal`

## 7. `igor seat add`

- [ ] 7.1 `src/cli.ts`: `igor seat add <id> [--reserve <r>] [--roles <a,b>] [--dedicated]`. The
      lore repository comes from the clone's `upstream` remote where there is one, and otherwise
      `origin`; the holder's login from `gh api user`
- [ ] 7.2 Read `seats/recipient.txt` from the lore repository's default branch with `gh api`. Read
      the token with echo off. Encrypt with `age-encryption`, base64 on one line
- [ ] 7.3 A new seat: write `seats/<id>.yaml`. The file it writes:

      ```yaml
      # <id>'s seat: a Claude subscription lent to this team's Igors, on the terms below.
      # To withdraw, or to stop any use you did not agree to, revoke the token at Anthropic:
      # the seat stops at once. See docs/seats.md.
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
- [ ] 7.5 Commit on branch `seat/<id>`. Push to the lore repository where `gh api` says the holder
      may push, and otherwise to their fork, creating it with `gh repo fork` where it does not
      exist. Open the pull request through `gh`. Its body:

      ```
      Lends seat <id> to this team's Igors: <reserve> reserve, serving <roles>. The token is encrypted to seats/recipient.txt, so only the Igor server can read it. Revoking it at Anthropic stops the seat at once. After merging, the operator updates the server's lore checkout.
      ```

      and, for a rotation:

      ```
      Rotates seat <id>'s token. Nothing else about the seat changes. After merging, the operator updates the server's lore checkout.
      ```

- [ ] 7.6 Refusals before the token is read: no `seats/recipient.txt` on the default branch; an
      invalid id; a seat naming `token_env` (7.4); not in a clone of the lore repository or of a
      fork of it. After it is read: an empty token
- [ ] 7.7 Tests, with `gh` faked: the scenarios of *`igor seat add` lends a seat in one step*, and
      that no argument list, written file or child environment contains the token

## 8. `igor doctor`

Composes with `check-a-lore-repository` (#113). Whichever builds second adds these to the command
the other built.

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
- [ ] 8.3 A seat file carrying `encrypted_token` while `igor.config.yaml` declares no `seatKey` is
      a finding, worded so:

      ```
      seats/<id>.yaml carries an encrypted token, and igor.config.yaml names no seatKey, so Igor cannot read that seat. Set seatKey to the private key whose public half is seats/recipient.txt.
      ```
- [ ] 8.4 Worker-user (#175): its start-up probe checks that the worker user cannot read the file
      `seatKey` names. Whichever of the two changes builds second adds it

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
    `/etc/igor/env`; a secret store's output goes there too
  - **What the lender keeps:** they can revoke their token at any time, which stops the seat at
    once, and that is how they answer an edit to their seat file they did not agree to. The
    `seat-notice.yml` workflow mentions them on any pull request changing their file; keep it
    installed (`igor init` puts it there), and tell a lender whose `owner` is not a GitHub login
    about a change some other way
  - **Checking it:** `igor doctor`, and `igor budget` showing the new seat as readable
  - **When things go wrong:** removing a seat (delete its file); a lender withdrawing (they revoke
    the token; delete the file); a leaked server key (above); a leaked seat token (its holder
    revokes it at Anthropic and runs `igor seat add` with a new one)
  - The *When something is wrong* table gains the refusals of tasks 2.2, 3.2, 3.4 and 4.1, and
    loses its `pool:` rows
- [ ] 9.4 `docs/seats.md`, the lender guide, rewritten around the file. **Before lending:** you
      choose the roles your seat serves and the reserve it keeps, in your own pull request; you
      trust the server's operator, who can use your token within your subscription and can edit
      your seat file after it merges; what the operator does to protect the token (the server's
      private key; it travels encrypted in a file anyone may be able to read, and only that key
      opens it); what bounds that trust (a `setup-token` only makes model requests, the reserve
      limits Igor's share, you can watch your usage at claude.ai); that you are mentioned on any
      pull request that changes your seat file, as long as `owner` is your GitHub login; and
      **revoking the token at Anthropic is how you withdraw or object to anything: it stops the
      seat, whatever any file says**, with "at once" replaced by the speed task 1.2 measured, such
      as "within <n> minutes", if the token is not refused at once
- [ ] 9.5 `docs/seats.md`, **getting the token:** `claude setup-token`, once, in your own
      terminal, and why it never goes into chat, email, or a file unencrypted
- [ ] 9.6 `docs/seats.md`, **lending it:** `igor seat add` in one step, and the manual equivalent
      for someone without Igor installed:

      ```sh
      git clone <lore-repo> && cd <lore-repo>      # or your fork of it
      git pull <lore-repo> main                    # recipient.txt as main has it
      read -rs TOKEN    # paste the token: not shown, and not kept in your shell history
      printf %s "$TOKEN" | age -r "$(cat seats/recipient.txt)" | base64 | tr -d '\n'; echo
      unset TOKEN
      ```

      then a pull request adding `seats/<id>.yaml`, with that output as `encrypted_token`, their
      reserve and the roles it serves
- [ ] 9.7 `docs/seats.md`, **afterwards:** watching your usage at claude.ai, and what to do when
      you are mentioned on a pull request changing your seat file (say so there if you object; revoke
      the token if it merges anyway); **changing your mind:** rotating (`igor seat add` again, or the manual steps,
      changing only `encrypted_token`), changing roles or reserve (a pull request to your file),
      withdrawing or objecting (revoke at Anthropic, which takes effect at once), and the one-year
      expiry (#145)
- [ ] 9.8 `docs/seats.md` *What the floor rests on* and *Several people, one fleet* describe the
      line (#143) and choice by headroom, with no pool and no listed order
- [ ] 9.9 `README.md`: the quick start declares a seat file and puts the token in the
      environment, with the shell wrapper `docs/deployment.md` already has; `token_command` and
      `token_file` go. *Budgets* loses `pools:` and `pool:engineering`, and its sample `igor budget`
      output loses the `pool engineering:` line. The note "(#148 replaces `pools:` …)" goes, since
      it describes this change as future
- [ ] 9.10 `docs/architecture.md` §6.5.1: a seat file lists the roles it serves, and the seat is
      chosen by headroom; "Order is the whole allocation mechanism today" and the `pools:`
      example go, and the heading loses its "being replaced (#148)" marker. §6.3.2's list of
      token mechanisms becomes `encrypted_token` and `token_env`. §6.7.1's "One secret store for
      seat tokens, on the server" describes a lent token as ciphertext in its seat file
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
      # Tells a seat's owner when a pull request changes their seat file, by mentioning them on it.
      # Revoking their token is a lender's veto over how their seat is used, and this is how they
      # hear about a change in time to use it.
      #
      # It runs on pull_request_target, so it also runs for pull requests from forks, with a token
      # that can comment. That trigger runs with this repository's permissions, so this job reads
      # nothing from the pull request's head: no checkout and no file contents, only the list of
      # changed paths, each matched against the seat-file pattern before use. The owner comes from
      # the default branch's copy of the file. Keep it that way: reading or running the head here
      # would hand a fork's code a token that can write to this repository.
      name: Notify seat owners

      on:
        pull_request_target:
          types: [opened, reopened, synchronize, ready_for_review]
          paths: ['seats/**']

      permissions:
        contents: read
        pull-requests: write

      jobs:
        notify:
          runs-on: ubuntu-latest
          steps:
            - name: Mention the owner of each seat file this pull request changes
              env:
                GH_TOKEN: ${{ github.token }}
                REPO: ${{ github.repository }}
                PR: ${{ github.event.pull_request.number }}
                DEFAULT: ${{ github.event.repository.default_branch }}
                AUTHOR: ${{ github.event.pull_request.user.login }}
              run: |
                set -euo pipefail
                marker='<!-- igor-seat-notice -->'
                told=$(gh api --paginate "repos/$REPO/issues/$PR/comments" \
                  --jq ".[] | select(.user.login == \"github-actions[bot]\") | select(.body | startswith(\"$marker\")) | .body" \
                  | grep -oE '@[A-Za-z0-9-]+' | sort -u || true)
                lines=()
                while IFS= read -r path; do
                  [[ "$path" =~ ^seats/[a-z0-9][a-z0-9-]*\.yaml$ ]] || continue
                  owner=$(gh api "repos/$REPO/contents/$path?ref=$DEFAULT" --jq .content 2>/dev/null \
                    | base64 -d | sed -n 's/^owner:[[:space:]]*\([A-Za-z0-9-]*\)[[:space:]]*$/\1/p' \
                    | head -n 1) || continue
                  [[ "$owner" =~ ^[A-Za-z0-9](-?[A-Za-z0-9])*$ ]] || continue
                  [[ "$(tr A-Z a-z <<<"$owner")" == "$(tr A-Z a-z <<<"$AUTHOR")" ]] && continue
                  grep -qixF "@$owner" <<<"$told" && continue
                  told+=$'\n'"@$owner"
                  lines+=("- @$owner: this pull request changes your seat file, \`$path\`.")
                done < <(gh api --paginate "repos/$REPO/pulls/$PR/files" \
                  --jq '.[] | .filename, (.previous_filename // empty)' | sort -u)
                [[ ${#lines[@]} -eq 0 ]] && exit 0
                body="$marker"$'\n'"$(printf '%s\n' "${lines[@]}")"$'\n\n'
                body+="Your seat serves the roles and keeps the reserve its file states. If you don't agree to this change, say so here. To stop your seat being used at all, revoke its token at Anthropic: that takes effect at once, whatever this pull request does."
                gh api "repos/$REPO/issues/$PR/comments" -f body="$body" > /dev/null
      ```

- [ ] 10.2 `src/init.ts`: `igor init` installs `seat-notice.yml` beside `reconcile-on-merge.yml`,
      under the same rules for an existing file, and it can be named as a target, per the
      `lore-store` delta
- [ ] 10.3 Tests in `test/template.test.ts`: the template parses; its only trigger is
      `pull_request_target` with `paths: ['seats/**']`; its permissions are exactly
      `contents: read` and `pull-requests: write`; it runs on `ubuntu-latest`; it has no
      `uses:` step and no `actions/checkout`; and no expression in it reads
      `github.event.pull_request.head`
- [ ] 10.4 Tests of the script, run under bash with `gh` faked: each scenario of *A pull request
      that changes a seat file mentions that seat's owner*, and a path such as
      `seats/$(touch x).yaml` or one containing a space or `*`, which is neither run nor expanded;
      and a comment carrying the marker whose author is not `github-actions[bot]`, which does not
      count as a mention already made
- [ ] 10.5 In `adamstallard/igor-lore`, with task 6.1: add `.github/workflows/seat-notice.yml`
      from the template

## 11. Matching condition-backoff (#101)

#101's `stuck-conditions` is an open change, not yet a spec, so this change cannot modify it. If
#101 archives first, as the build order has it, this change adds a `stuck-conditions` delta making
these three changes. If this change archives first, #101's text is amended to make them:

- [ ] 11.1 *A seat's refused credential is a condition on that seat* hashes the plaintext token of
      a lent seat, as *A seat's token travels as ciphertext in its file* requires
- [ ] 11.2 *Reporting tells a refused credential from an unreadable one, and clears nothing* says
      "check a path or a variable". A seat file has no path, so it reads "a variable or a seat's
      key", or as the restating change words it
- [ ] 11.3 Where an unreadable seat stops every role drawing on it, the outcome of the proposal's
      open question on passing such a seat over is applied
