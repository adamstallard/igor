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
  whose path `igor.config.yaml` names as `seatKey`. No GitHub secret, workflow or runner is
  involved. The private key is the whole protection, and the operator guide treats it so.
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

None. `setup-check` gains a requirement here, and is created by whichever of this change and
`check-a-lore-repository` archives first.

### Modified Capabilities

- `seat-budget`: seats come from seat files, the token from ciphertext in the file or the seat's
  own variable. Pools and the budget mapping's key checks are removed. Seat choice is by headroom.
- `work-triage`: the model-stage and untriaged-reporting requirements are worded for the seats
  serving a role instead of a pool. Two are re-added under new names, because their scenario names
  said "pool".
- `setup-check`: `igor doctor` reports whether the committed public key matches the server's
  private key.

## Impact

- `src/budget.ts`: `parseOrgBudget`, `Pool`, `poolFor` and pool order in `chooseSeat` give way to
  reading `seats/` and ranking by headroom. `resolveToken` loses the file and command branches and
  gains decryption.
- `src/config.ts`: `budget` leaves `CONFIG_KEYS`; `seatKey` joins it.
- `src/role.ts`: a role's seats come from the seat files; `requireSeat` checks the named seat
  lists the role.
- `src/cli.ts`: `igor seat add`. `src/init.ts` and `templates/seat-notice.yml`: the notice
  workflow.
- A new dependency on the `age-encryption` package.
- `docs/deployment.md`, `docs/seats.md`, `docs/architecture.md` §6.5.1, `README.md`,
  `igor.config.example.yaml`, `deploy/`.
- `adamstallard/igor-lore`: `seats/adam.yaml`.
- Build order: `condition-backoff` (#101), then `read-seat-windows-from-the-stream` (#143), then
  this. The `MODIFIED` blocks here are written against #143's text where #143 modifies the same
  requirement.
