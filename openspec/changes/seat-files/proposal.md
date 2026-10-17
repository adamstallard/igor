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

**Still open:**

- **A seat file naming no token uses the server's ambient login.** A contributed file with
  neither key gets its own id, roles and reserve and spends whatever credential the server
  holds, which can be a pay-per-use API key: the hole a fixed `token_env` closes. *Recommended:*
  refuse a seat file that names neither, or allow it only where the operator sets a flag.
- **Any worker can read `seatKey` until worker-user (#175) is built.** Until then, a worker
  steered by issue text can read the key and so decrypt every lender's token from the lore
  repository. *Recommended:* make #175 a prerequisite for lending, and add `seatKey` to #175's
  start-up probe (task 8.4).
- **Nothing checks that `owner` is a GitHub login.** A name that is someone else's login @-mentions a stranger
  about a private seat. *Recommended:* `igor seat add` and `igor doctor` check `owner` with
  `gh api users/<owner>`.
- **A plain token pasted into a pull request is public before any refusal.** Igor refuses it at
  load, after merging, and nobody is told if the pull request never merges. *Recommended:*
  accept, since the notice workflow must not read the head; the lender guide already says the
  token never goes into a file unencrypted.
- **A direct push to the default branch changes a seat file with no notice.** *Recommended:*
  require pull-request-only merges for the lore repository, which `check-a-lore-repository`
  (#113) reports.
- **An undecryptable seat stops every role its file lists.** #101 stops every role drawing on an
  unreadable seat; with choice by headroom, a role with other seats could pass it over.
  *Recommended:* pass the seat over where the role has another eligible seat, and reword #101's
  rule to match (task 11.3).
- **`dedicated` has no effect once #143 is built.** Every seat then defaults to reserve 0 and no
  rule reads the key. *Recommended:* drop `dedicated`, together with #143.
- **"Nothing runs on a seat holder's machine"** is the reason `design.md` gives for rejecting a
  runner per holder, yet `igor seat add` runs there. *Recommended:* narrow the rule to recurring
  jobs; `igor seat add` is a one-off the holder runs.
- **Whether revoking a `setup-token` stops it at once** is unmeasured (task 1.2). Decision 3 rests
  on it.

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
- **The lender can revoke their token at any time, and that stops the seat at once.** It is their
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
  `reserve`, whether the seat is `dedicated`, the `roles` it serves, and its token.
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
  it, writes the seat file, and opens the pull request. Run again, it rotates the token.
- **The `work-triage` requirements stop saying "pool"**, and speak of the seats serving a role.
- **Docs for both sides.** The operator guide in `docs/deployment.md`; the lender guide in
  `docs/seats.md`, which says what a lender trusts the operator with and that revoking the token
  is how they withdraw or object.

## Capabilities

### New Capabilities

None. `setup-check` gains requirements here, and is created by whichever of this change and
`check-a-lore-repository` archives first.

### Modified Capabilities

- `seat-budget`: seats come from seat files, the token from ciphertext in the file or the seat's
  own variable. Pools and the budget mapping's key checks are removed. Seat choice is by headroom.
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
- `docs/deployment.md`, `docs/seats.md`, `docs/architecture.md` §6.5.1, `README.md`,
  `igor.config.example.yaml`, `deploy/`.
- `adamstallard/igor-lore`: `seats/adam.yaml`.
- Build order: `condition-backoff` (#101), then `read-seat-windows-from-the-stream` (#143), then
  this. The `MODIFIED` blocks here are written against #143's text where #143 modifies the same
  requirement.
- worker-user (#175) modifies the same worker-environment requirement, to let `GIT_INDEX_FILE`
  reach the worker. Whichever of #175 and this change archives second rewrites its block on top of
  the other's archived text, carrying both changes, or the first one's change is lost.
