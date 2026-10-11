## Why

A seat is someone's Claude subscription. **The holder decides what their seat does and how much,
and the operator configures exactly that on their behalf.** The holder chooses which of the team's
roles it serves and what `reserve` it keeps. Directing your seat this way is the same as directing
your own agent to work on what your teammates file: the use is still yours, set by standing
instructions. Whether lending a seat fits Anthropic's terms turns on exactly this
(`code.claude.com/docs/en/legal-and-compliance`): whether usage on a seat is its owner's, or
someone else driving it.

Nothing records or enforces that today. Every seat lives in the one `igor.config.yaml` under
`budget.seats`, and which roles draw on a seat follows from pool membership and each role's
`seat:`. An edit to a pool can put a seat to work for a new role without its holder seeing it.

**The holder's approval needs one file per seat, because CODEOWNERS matches paths, not lines.**
An entry inside the shared config cannot have an owner of its own. A file can: one CODEOWNERS line
per seat file, with "require review from code owners" on the lore repository's default branch,
means any change to what a seat does needs its holder's approval, and git keeps the record of what
they agreed to. The operator still makes the edits; the holder approves them.

The token has to reach the server too. Today a holder sends their `setup-token` to the operator
over a trusted channel, which every team improvises. This change gives every team a recommended
way built on GitHub, which Igor already uses: the token is encrypted to the server's public key
and stored as a GitHub Actions secret, so only the server can read it.

Tracked in [#148](https://github.com/adamstallard/igor/issues/148), with the seat-choice rule
from [#147](https://github.com/adamstallard/igor/issues/147).

## What Changes

- **Every seat is a file, `seats/<id>.yaml`, in the lore repository**, the way a role is
  `roles/<name>.yaml`. The filename is the seat's id. It declares the holder (`owner`), the
  `reserve`, whether the seat is `dedicated`, the `roles` it serves, and `token_env`.
- **`budget` leaves `igor.config.yaml`.** Seats are read from `seats/`, and pools are gone, so the
  mapping has nothing left in it. A config that still declares it is refused by the config's
  existing unknown-key refusal, with no dedicated message (Adam, 2026-10-11). The one migration is
  moving `adamstallard/igor-lore`'s seat into `seats/adam.yaml`.
- **A seat file names its token only by `token_env`**, and that name is `IGOR_SEAT_` plus the
  seat's id. `token_command` and `token_file` are refused in a seat file, naming the key. Neither
  form runs or reads anything, so Igor never needs to know who wrote a seat file.
- **A `token_env` value may be ciphertext.** Igor decrypts it with the server's age private key,
  whose path `igor.config.yaml` names as `seatKey`. A plain token in the variable still works.
- **Pools are removed.** A role's seats are every seat whose file lists it. Among those it can
  use, the Igor picks the one with the most headroom under its line, and the soonest weekly reset
  breaks a tie. A role may still name a single seat, which must list it.
- **Igor warns, and does not refuse, when the holder's approval is not enforced:** a seat file
  with no code owner, or a default branch without the code-owner review rule. GitHub enforces the
  rule; a refusal would give GitHub's settings a kill switch over the fleet.
- **A holder with no GitHub account on the lore repository** has the operator stand in as the
  seat file's code owner, and `igor doctor` says so for that seat.
- **`igor seat add`** lends a seat in one step: it reads the token without echoing it, encrypts
  it, sets the `IGOR_SEAT_<ID>` secret, writes the seat file and its CODEOWNERS line, and opens
  the pull request.
- **Docs and templates for both sides.** The operator guide in `docs/deployment.md`, with a deploy
  workflow, a CODEOWNERS file and a unit change under `deploy/`. The lender guide in
  `docs/seats.md`.

## Capabilities

### New Capabilities

None. `setup-check` gains requirements here, and is created by whichever of this change and
`check-a-lore-repository` archives first.

### Modified Capabilities

- `seat-budget`: seats come from seat files, the token from `token_env` alone, possibly encrypted.
  Pools and the budget mapping's key checks are removed. Seat choice is by headroom.
- `setup-check`: `igor doctor` reports the operator standing in for a holder, the code-owner
  review rule, the runner guard, and whether the committed public key matches the server's
  private key.

## Impact

- `src/budget.ts`: `parseOrgBudget`, `Pool`, `poolFor` and pool order in `chooseSeat` give way to
  reading `seats/` and ranking by headroom. `resolveToken` loses the file and command branches and
  gains decryption.
- `src/config.ts`: `budget` leaves `CONFIG_KEYS`; `seatKey` joins it.
- `src/role.ts`: a role's seats come from the seat files; `requireSeat` checks the named seat
  lists the role.
- `src/cli.ts`: `igor seat add`.
- A new dependency on the `age-encryption` package.
- `docs/deployment.md`, `docs/seats.md`, `docs/architecture.md` §6.5.1, `README.md`,
  `igor.config.example.yaml`, `deploy/`.
- `adamstallard/igor-lore`: `seats/adam.yaml` and a CODEOWNERS file.
- Build order: `condition-backoff` (#101), then `read-seat-windows-from-the-stream` (#143), then
  this. The `MODIFIED` blocks here are written against #143's text where #143 modifies the same
  requirement.
