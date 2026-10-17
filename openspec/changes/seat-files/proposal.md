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
   `templates/seat-notice.yml`, which `igor init` installs (Adam, 2026-10-11). It runs on
   `pull_request_target` on GitHub-hosted runners and reads nothing from the pull request's head.
   *Rejected:* a pull request template line, CODEOWNERS without review, the `pull_request`
   trigger, a self-hosted runner, and Igor commenting (`design.md`).
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
    2026-10-17), so every change to a seat file goes through the notice workflow.
    `check-a-lore-repository` (#113) reports a branch that does not.
15. **An undecryptable seat is passed over where the role has another usable seat** (Adam,
    2026-10-17). Under #101 it would otherwise stop every role its file lists. A role whose seats
    are all under open conditions still stops, as #101 says (task 11.3).
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
    `files` and `engines: node >= 26`, and a licence check runs before publishing. Publishing is a
    tag-triggered workflow on GitHub-hosted runners, with npm provenance and an npm token held as
    a repository secret (section 12 of `tasks.md`).
20. **The keys are X25519 keys in age's format** (Adam, 2026-10-17).
21. **The lender guide documents one path, `npx igor-agent seat add`**, with Node as the only
    prerequisite (Adam, 2026-10-17). It has no manual `age` section and no route through a clone.
22. **`igor seat add` opens the pull request through `gh` where `gh` is installed and signed in**
    (Adam, 2026-10-17). Otherwise it opens, or prints, GitHub's prefilled new-file link, which
    forks the repository for a lender without write access; the lender then clicks "Propose new
    file". Igor never holds the lender's GitHub credentials.

**Still open:**

- **What `igor seat add` does without `gh`, beyond printing the link.** Decision 22 covers
  opening the pull request. Three steps before it assume `gh` or a clone: knowing which lore
  repository to use (found today from the clone's remote), knowing the holder's login for
  `owner` and checking it (`gh api user`, `gh api users/<owner>`), and reading
  `seats/recipient.txt` and any existing seat file from the default branch, which a private
  repository refuses without a credential. A clean machine with only Node (task 12.4) has
  neither `gh` nor a clone. And for a rotation, GitHub's new-file link cannot replace a file
  that exists, and its edit link takes no prefilled content.
- **A worker run as the Igor's own user can read `seatKey`.** #175 still lets `igor run` and
  `igor serve --same-user` run the worker as the Igor's own user. Decision 11 orders the builds,
  and says nothing about those two modes once seats carry ciphertext.
- **`gh api users/<owner>` confirms that a login exists, not that it is the holder's.** A login
  that exists but belongs to a stranger passes decision 12's check. Also, `design.md` allows a
  lender with no GitHub account, and `igor doctor` would report that lender's seat file as a
  finding for as long as the file exists. Such a lender also cannot open their own pull request
  or follow the prefilled link, so the argument that the lender states the terms in their own
  pull request does not hold for them.
- **Whether a role with no eligible seat, where at least one seat is under an open condition,
  should hand off or stop.** Decision 15 covers only a role with another usable seat. A role whose
  seats are all under open conditions stops, as #101 says, and a role whose seats are all at their
  lines hands off. A role with some of each is not decided.
- **Whether GitHub's prefilled link works as decision 22 needs** (task 1.0): that its value
  survives the automatic fork, and that it holds a whole seat file with ciphertext. If not, the
  choice goes back to Adam.
- **GitHub Actions on the bypass list can still change a seat file without a pull request.** Lore
  setup lets GitHub Actions bypass the default branch's protection, so that the reconciliation
  workflow can commit. That also lets a workflow on a pushed branch commit a seat-file change to
  the default branch with no pull request and no notice. Decision
  14's pull-request-only merges do not close that.
- **Decision 19's npm token conflicts with `design.md`'s reason for rejecting repository
  secrets.** Every writer can read a repository secret, so any writer could publish `igor-agent`,
  which lenders run through `npx`. npm's trusted publishing, through OIDC, would need no stored
  token. Decision 19 stands as given until Adam says otherwise.
- **`igor doctor` is defined by `check-a-lore-repository` (#113)**, which is not in this change's
  build order. Decisions 12 and 14 and section 8 of `tasks.md` rely on it.
- **What decision 19's licence check covers**: the package's own licence field and `LICENSE`
  file, its dependencies' licences, or both.

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
  on GitHub-hosted runners and reads nothing from the pull request's head.
- **`igor seat add`** lends a seat in one step: it reads the token without echoing it, encrypts
  it, writes the seat file, and opens the pull request through `gh`, or gives the lender
  GitHub's prefilled link to propose the file. Run again, it rotates the token.
- **Igor is published to npm as `igor-agent`**, so a lender runs `npx igor-agent seat add` with
  nothing installed but Node.
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
- Build order: `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143) and
  worker-user (#175), then this. This change and #143 archive together, #143 first (Adam,
  2026-10-17), so no in-force text names `capacity_estimate` or `dedicated`, the keys the two
  changes remove. The `MODIFIED` blocks here are
  written against #143's text where #143 modifies the same requirement.
- worker-user (#175) modifies the same worker-environment requirement, to let `GIT_INDEX_FILE`
  reach the worker. #175 is built first, so this change's block is written over #175's text and
  keeps that rule.
