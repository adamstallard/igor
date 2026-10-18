## Decisions

1. **One file per seat, `seats/<id>.yaml`, and pools are dropped** (Adam, 2026-09-28). The
   lender's own pull request adds the file, naming the roles the seat serves and its reserve.
2. **A lent token travels as age ciphertext in the seat file**, encrypted to
   `seats/recipient.txt` and decrypted with the private key `seatKey` names (Adam, 2026-10-11).
   *Rejected:* GitHub secrets delivered by a deploy workflow on a self-hosted runner, the
   2026-09-28 model: on a public repository a fork's pull request can run its own self-hosted
   workflow on the server. `design.md` lists the other options and why each was rejected.
3. **The lender's control is their token** (Adam, 2026-10-11). Revoking it at Anthropic stops the
   seat, and that is their veto over anything the operator does with it. *Rejected:* a
   CODEOWNERS line per seat file with code-owner review required, which needs administrator
   settings, checks that they stay on, and a stand-in for a lender with no GitHub account.
4. **An operator's own seat may name `token_env`, fixed to `IGOR_SEAT_<ID>`; `token_command` and
   `token_file` are refused in a seat file** (Adam, 2026-10-04 and 2026-10-11). A free variable
   name could hand `claude` the GitHub token, or spend another seat under this one's id.
5. **A role draws on the seat with the most headroom**; ties go to the soonest week reset, then
   the seat id (Adam, 2026-10-04, #147). A role naming `seat: x` is refused unless `seats/x.yaml`
   lists it. *Rejected:* keeping pools or an `order` key, which brings back an ordering the
   lender never stated.
6. **A pull request changing a seat file @-mentions its owner**, through
   `templates/seat-notice.yml`, which `igor init` installs (Adam, 2026-10-11). It runs only on
   `pull_request_target` (decision 26), on GitHub-hosted runners, and reads nothing from the pull
   request's head. *Rejected:* a pull request template line, CODEOWNERS
   without review, the `pull_request` trigger, a self-hosted runner, and Igor commenting on open
   lore pull requests (`design.md`). The before-merge comment is the workflow's; Igor posts its
   own notice only after a seat-file change lands and Igor pulls it (#176).
7. **`igor doctor` reports a missing `seat-notice.yml`, and a server private key (`seatKey`) whose
   public half does not match `seats/recipient.txt`** (Adam, 2026-10-11). A change to
   `recipient.txt` notifies no lender, because it changes no token already on the server; each
   lender meets the new key when they next rotate.
8. **Smaller choices, which Adam accepted as `design.md` proposed them** (2026-10-11): the
   ciphertext is base64 on one line, made with the `age-encryption` package, so a lender needs no
   `age` binary; a seat id is lowercase letters, digits and hyphens; `roles` is required and may be
   empty; a role name with no role file is refused; the config key is `seatKey`; a role's own
   `reserve` key, which #143 adds, stays on the role; `work-triage` says "the seats serving a role"
   in place of "pool".
9. **No code handles a configuration written before seat files** (Adam, 2026-10-11): no migration,
   and no message for a leftover `budget` or `pools`, since Igor has no users yet. `igor-lore`'s
   one seat is moved by hand (task 6.1).

10. **A seat file must name its token** (Adam, 2026-10-17). One naming neither `encrypted_token`
    nor `token_env` is refused at load. *Rejected:* allowing it behind a flag the operator sets.
    Such a file would spend whatever login the server holds, which can be a pay-per-use API key.
11. **Worker-user (#175) is built before this change** (Adam, 2026-10-17). A worker running as
    the server's own user could read `seatKey` and decrypt every lender's token. #175's start-up
    probe checks, as the worker user, that the worker cannot read the Igor's credentials; this
    change adds the file `seatKey` names to what it checks (task 8.4).
12. **`igor seat add` and `igor doctor` check that `owner` is a GitHub login**, with
    `gh api users/<owner>` (Adam, 2026-10-17), because the notice workflow can mention only a
    GitHub login.
13. **A plain token pasted into a pull request is public before Igor can refuse it, and that is
    accepted** (Adam, 2026-10-17). The notice workflow must not read the pull request's head, so
    nothing can catch it there. The lender guide says so (task 9.5).
14. **The lore repository's default branch requires a pull request before merging** (Adam,
    2026-10-17), so the lender is told of a change to their seat file made through a pull
    request before it lands. GitHub Actions can push past the rule, for the reconciliation
    workflow; a seat-file change pushed that way reaches the lender only through Igor's notice
    when it pulls the change (#176).
    `check-a-lore-repository` (#113) reports a branch that does not.
15. **An undecryptable seat is passed over where the role has another usable seat** (Adam,
    2026-10-17). Under #101 it would otherwise stop every role its file lists. A role whose seats
    are all under open conditions still stops, as #101 says (task 11.3), except that a seat
    whose file Igor could not decrypt counts as one at its line, so its condition never stops a
    role (decision 31).
16. **The `dedicated` seat key is dropped** (Adam, 2026-10-17). After #143 any seat may keep a
    reserve, and choice by most headroom already spends a reserve-0 seat first. This change
    restates #143's *A role may hold back more of a seat than the seat does* to say "a seat at
    reserve 0" where #143 says "a dedicated seat". Its scenario keeps the title *A role reserve
    with a dedicated seat is valid*, because openspec will not rename an in-force scenario, and
    reads "dedicated" as plain English for a seat no person uses.
17. **Nothing keeps running on a seat holder's machine** (Adam, 2026-10-17): no runner, daemon or
    scheduled job. This rules out a runner per lender, which `design.md` rejects for delivering
    the token, and allows `igor seat add`, a one-off command the lender chooses to run.
18. **Revocation speed is not measured** (Adam, 2026-10-17). The lender guide says revoking the
    token is how a lender withdraws, and promises no speed.
19. **Igor is published to npm in this change** (Adam, 2026-10-17): package `igor-agent`, `bin`
    `igor`, its description the README's opening line verbatim (#27). `package.json` declares
    `files` and `engines: node >= 26`. Publishing is a tag-triggered workflow on GitHub-hosted
    runners using **npm trusted publishing (OIDC)**, so no npm token is stored anywhere and
    provenance is built in (Adam, 2026-10-17). *Rejected:* an npm token held as a repository
    secret, which any writer could read and use to publish `igor-agent`, which lenders run
    through `npx`. Before publishing, a **licence check covers both the package's own licence
    field and every dependency's licence**, against an allowlist, and fails the release otherwise
    (Adam, 2026-10-17). Section 12 of `tasks.md` holds the work.
20. **The keys are X25519 keys in age's format** (Adam, 2026-10-17).
21. **The lender guide documents one path, `npx igor-agent seat add`**, with Node and a
    signed-in `gh` as the prerequisites (Adam, 2026-10-17; the `gh` prerequisite is decision 22). It has no manual `age` section and no route through a clone.
22. **`igor seat add` requires `gh`, installed and signed in, and opens the pull request
    through it** (Adam, 2026-10-17). Without `gh` it refuses. Igor never holds the lender's GitHub
    credentials: `gh` keeps its own login. *Rejected:* opening GitHub's prefilled new-file link
    where `gh` is missing, which still needed `gh` or a clone to find the lore repository, the
    holder's login and the public key, and could not replace an existing file for a rotation.
23. **Igor refuses to decrypt a lent seat where the worker runs as the Igor's own user** (Adam,
    2026-10-17). Under #175's same-user mode, which is `igor run` only, a worker could read
    `seatKey` and so every lent token. There, only the operator's own `token_env`
    seats run. Lending requires the worker-user setup of #175.
24. **A lender needs a GitHub account to lend for themselves, and that is accepted** (Adam,
    2026-10-17). Someone without one lends through the operator, whose login is then the seat
    file's `owner`. That `gh api users/<owner>` proves a login exists, not that it is the
    holder's, is accepted too.
25. **A role with no eligible seat, where some seats are under an open condition and the rest are
    at their reserve lines, hands off, naming the condition in the handoff** (Adam, 2026-10-17).
    It stops only when every seat serving it is under a condition, as #101 says, and none of
    those conditions is on a seat Igor could not decrypt (decision 31).
26. **The notice workflow has no `push` trigger; `seat-notice.yml` runs on `pull_request_target`
    only** (Adam, 2026-10-17, dropping that day's earlier push trigger). The only notice after a
    change lands comes from Igor, when it pulls the lore change (#176). *Rejected:* a push trigger
    as well, which would mention a lender twice for one change, and which GitHub does not start
    for a push made with a workflow's own `GITHUB_TOKEN`, the commit it was meant to catch.
27. **`igor doctor` (#113, `check-a-lore-repository`) is built before this change** (Adam,
    2026-10-17). Decisions 12 and 14 and section 8 of `tasks.md` add to the command #113 builds.
28. **`igor seat add` takes `--lore <owner/repo>`, required outside a clone and inferred inside
    one** (Adam, 2026-10-17). Outside a clone it commits the seat file and opens the pull request
    through the GitHub API with `gh`, with no local clone. Inside a clone it commits on a new
    branch and opens the pull request with `gh`. Either way `gh` is required (decision 22).
29. **A lent seat whose file the server cannot decrypt is ineligible** (Adam, 2026-10-17): seat
    choice never picks it, and #143's probe skips it. It is under a condition on the seat, as
    every seat whose token cannot be read is. For a wrong key or a corrupt file, that
    condition names the seat and its lender, so someone re-lends it; for a missing `seatKey` or
    an unreadable key file it names the key, whose cure is the operator's. Decision 31 says how
    the condition opens and clears. A lent seat that same-user mode leaves undecrypted (decision
    23) is ineligible and skipped by the probe the same way; there is no fault in its file, so it
    raises no condition, and a role whose seats are all lent hands off. Adam confirmed this last
    rule on 2026-10-17.
30. **The licence allowlist of decision 19 is MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0,
    0BSD, CC0-1.0, Unlicense and BlueOak-1.0.0** (Adam, 2026-10-17). Any other licence, copyleft
    included, fails the release until someone adds it to the list on purpose.
31. **An undecryptable seat's condition is tied to reading seat files** (Adam, 2026-10-17). Igor
    opens the condition when it fails to decrypt a seat file, at start and, once #176 specifies
    pulling the lore checkout, on each pull, and clears it when a later read decrypts the file.
    The seat counts as one at its line, so a role with no other usable seat hands off each item
    as a role whose seats are all at their lines does, and the handoff names the condition.
    Adam's words were that such a role "waits like a role whose seats are all full". This
    narrows decisions 15 and 25: such a condition never stops a role.
    *Rejected:* #101's way of opening and clearing a seat condition, from recurring handoffs and
    from #143's probe, which never reach a seat that is never picked or probed.

**Still open:**

- **Whether a decryption failure when a worker is spawned opens the condition** (decision 31).
  A seat can be chosen and then fail to decrypt, for example after its key file's permissions
  change; decision 31 ties the condition to reading seat files, at start and on a pull.
- **Pulling the lore checkout is not yet specified** (#176), so until it is, decision 31's
  condition opens and clears at start only. Igor's own notice after a seat-file change lands is
  decided (decisions 6 and 26); where Igor posts it is open on #176.

## Why

A seat is someone's Claude subscription. Whether lending one to a team's Igors fits Anthropic's
terms turns on whether usage on the seat stays its owner's, directed by them, or is someone else
driving it (`code.claude.com/docs/en/legal-and-compliance`). Directing your seat is like directing
your own agent to work on what your teammates file: the use is still yours, set by standing
instructions.

Two things make that true here, and neither depends on a review rule:

- **The lender states the terms themselves, in a pull request of their own.** It adds
  `seats/<id>.yaml`, which names the roles their seat serves and the `reserve` it keeps. The
  operator merges it. Today every seat lives in the one `igor.config.yaml`, which the operator
  writes, and which roles draw on a seat follows from pool membership the lender never sees.
- **The lender can revoke their token at any time, and that stops the seat.** It is their
  veto over anything the operator does with the seat afterwards, including an edit to their file
  they did not want. Withdrawing and objecting are the same act: revoking the token at Anthropic.

The token has to reach the server too. Today a holder sends their `setup-token` to the operator
over a trusted channel, which every team improvises. This change makes lending one pull request:
the holder encrypts the token to the server's public key and puts the ciphertext in their seat
file, so only the server can read it, and they can open the pull request from a fork.

Tracked in [#148](https://github.com/adamstallard/igor/issues/148), with the seat-choice rule
from [#147](https://github.com/adamstallard/igor/issues/147).

## What Changes

- **Every seat is a file, `seats/<id>.yaml`, in the lore repository**, the way a role is
  `roles/<name>.yaml`. The filename is the seat's id. It declares the holder (`owner`), the
  `reserve`, the `roles` it serves, and its token, which every seat file must name.
- **`budget` leaves `igor.config.yaml`.** Seats are read from `seats/`, and pools are gone, so the
  mapping has nothing left in it.
- **A lent seat's token travels as ciphertext in its file**, as `encrypted_token`, encrypted with
  age to the public key committed as `seats/recipient.txt`. Igor decrypts it with the private key
  whose path `igor.config.yaml` names as `seatKey`. Delivering the token needs no GitHub secret,
  workflow or runner. The private key is the whole protection, and the operator guide treats it
  so.
- **An operator's own seat may name `token_env` instead**, which must be `IGOR_SEAT_` plus the
  seat's id, for a token the operator puts in the server's env file. `token_command` and
  `token_file` are refused in a seat file, naming the key. Neither remaining form runs or reads
  anything else, so Igor never needs to know who wrote a seat file.
- **Pools are removed.** A role's seats are every seat whose file lists it. Among those it can
  use, the Igor picks the one with the most headroom under its line, and the soonest weekly reset
  breaks a tie. A role may still name a single seat, which must list it.
- **A pull request that changes a seat file mentions its owner**, through a workflow `igor init`
  installs, so the lender hears of a change in time to revoke. It runs on `pull_request_target`
  on GitHub-hosted runners and reads nothing from the pull request's head. Igor's own notice
  after a change lands comes with #176, which builds pulling the lore checkout; this change does
  not build it.
- **`igor seat add`** lends a seat in one step: it reads the token without echoing it, encrypts
  it, writes the seat file, and opens the pull request through `gh`, which it requires. Run
  again, it rotates the token.
- **Igor is published to npm as `igor-agent`**, so a lender runs `npx igor-agent seat add` with
  nothing installed but Node and a signed-in `gh`.
- **The `work-triage` requirements stop saying "pool"**, and speak of the seats serving a role.
- **Docs for both sides.** The operator guide in `docs/deployment.md`; the lender guide in
  `docs/seats.md`, which says what a lender trusts the operator with and that revoking the token
  is how they withdraw or object. The lender guide documents one path, `npx igor-agent seat add`.

## Capabilities

### New Capabilities

None. `setup-check` gains requirements here, and is created by whichever of this change and
`check-a-lore-repository` archives first.

### Modified Capabilities

- `seat-budget`: seats come from seat files, the token from ciphertext in the file or the seat's
  own variable. Pools and the budget mapping's key checks are removed. Seat choice is by headroom.
  #143's role-reserve requirement is restated without the `dedicated` key. The spend requirement
  is removed and re-added under a new name, without its scenario of a seat naming no token,
  because openspec will not apply a `MODIFIED` block that drops a scenario.
- `work-triage`: the model-stage and untriaged-reporting requirements are worded for the seats
  serving a role instead of a pool. Two are re-added under new names, because their scenario names
  said "pool".
- `setup-check`: `igor doctor` reports whether the committed public key matches the server's
  private key, whether a seat carries ciphertext while no `seatKey` is declared, and whether the
  seat-notice workflow is on the default branch.
- `task-execution`: the worker-environment requirement says a seat's token comes from its
  variable or is decrypted from its file; a token file and a token command are gone. It is removed
  and re-added under its full name, "…but its seat's token" (the in-force name stops at "its
  seat's"), because openspec will not apply a `MODIFIED` block that drops an in-force scenario,
  and the file-and-command scenario must go.
- `lore-store`: `igor init` also writes the seat-notice workflow.
- `stuck-conditions` (#101's, in force first): an unreadable seat is passed over by a role with
  another eligible seat; a lent seat's credential is its decrypted token; the report's remedy
  names the seat's `IGOR_SEAT_<ID>` variable or the private key file that `seatKey` names.

## Impact

- `src/budget.ts`: `parseOrgBudget`, `Pool`, `poolFor` and pool order in `chooseSeat` give way to
  reading `seats/` and ranking by headroom. `resolveToken` loses the file and command branches and
  gains decryption.
- `src/config.ts`: `budget` leaves `CONFIG_KEYS`; `seatKey` joins it.
- `src/role.ts`: a role's seats come from the seat files; `checkSeat` checks that the named
  seat lists the role.
- `src/cli.ts`: `igor seat add`. `src/init.ts` and `templates/seat-notice.yml`: the notice
  workflow.
- A new dependency on the `age-encryption` package.
- `package.json` (renamed `igor-agent`, its description replaced) and a release workflow under
  `.github/workflows/`.
- `docs/deployment.md`, `docs/seats.md`, `docs/architecture.md` §6.5.1, `README.md`,
  `igor.config.example.yaml`, `deploy/`.
- `adamstallard/igor-lore`: `seats/adam.yaml`.
- Build order: `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143),
  worker-user (#175) and `check-a-lore-repository` (#113), then this. This change and #143 archive together, #143 first (Adam,
  2026-10-17), so no in-force text names `capacity_estimate` or `dedicated`, the keys the two
  changes remove. The `MODIFIED` blocks here are
  written against #143's text where #143 modifies the same requirement.
- worker-user (#175) modifies the same worker-environment requirement, to let `GIT_INDEX_FILE`
  reach the worker. #175 is built first, so this change's block is written over #175's text and
  keeps that rule.
