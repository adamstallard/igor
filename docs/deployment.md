# Running an Igor

Igor is self-hosted, and not by preference. An Igor runs on a Claude subscription seat, a seat
token cannot be handed to a third party, and so there is no version of this where a vendor runs
Igors for you (§6.8). Every adopter runs their own.

The runnable parts are in [`deploy/`](../deploy). This document covers what cannot be scripted:
credentials, and the handful of things that go wrong.

## What the machine needs

Igor shells out rather than reimplementing, so four things must be on the path:

| | for |
|---|---|
| `git` | cloning a working tree per task |
| `gh` | the tracker and the code host |
| `claude` | triage, execution, and reading a seat's usage |
| `node` 18+ | Igor itself |

## Before it can run

Three things, in this order. None can be automated, and the first two are the ones people miss.

1. **A machine account per Igor**, with write access to the repositories it works. Not a
   GitHub App — an App's bot user cannot be an issue assignee, so claiming would silently
   degrade to a comment. [`machine-accounts.md`](machine-accounts.md) has the steps and the
   traps.

2. **A seat token per seat**, from `claude setup-token` run while signed in *as that seat*.
   Name it in `igor.config.yaml` under `token_env`. A seat naming a variable that is unset is
   reported unreadable and skipped, deliberately: falling back to whatever login is ambient
   would mean reading one seat's usage and spending another's.

   A seat is usually somebody else's subscription, so this step is a request rather than a
   task. [`seats.md`](seats.md) is written for them: what the command is, what it grants, what
   `reserve` protects, and how to hand a token over without pasting it into a channel.

   This applies to your own seat too, trying it out on your own machine before any of the
   above. A worker's environment is written out rather than inherited, so it cannot reach a
   keychain or an ambient login however you are signed in — the credential has to be a token
   in a variable the seat names. `igor budget` says so against any seat missing one.

3. **A lore repository**, holding `igor.config.yaml` and `roles/`, checked out where the
   service runs. Igor finds its configuration by walking up from the working directory, the way
   git does, so the working directory *is* the configuration.

## systemd

```bash
sudo cp deploy/igor.service /etc/systemd/system/igor@.service
sudo install -m 600 deploy/env.example /etc/igor/env   # then fill it in
sudo systemctl enable --now igor@maintenance
journalctl -u igor@maintenance -f
```

The unit is a template, so the role name is the instance: `igor@maintenance`, `igor@backend`.
Several Igors run from one unit file.

### Adding a seat somebody has given you

Four steps, once a colleague has sent you a token ([`seats.md`](seats.md) is what to send them):

1. **Declare the seat** in `igor.config.yaml`, which is committed. The token is not:

   ```yaml
   budget:
     seats:
       - {id: adam, owner: adam@example.com, reserve: 0.5, token_env: IGOR_SEAT_ADAM}
   ```

   `token_env` is the *name* of a variable. Putting the token itself here commits a credential
   to a repository — the single mistake this arrangement exists to prevent.

2. **Put the value where the process will read it**, never in the repository.

   Under systemd, the shared env file `/etc/igor/env`:

   ```sh
   IGOR_SEAT_ADAM=…
   ```

   Seat tokens belong in the shared file rather than a per-instance one, because a seat is a
   subscription several Igors may draw from. `GH_TOKEN` is the opposite — it is identity, and
   belongs in `/etc/igor/<role>.env`.

   Evaluating from a shell rather than a unit, the same rule applies with different plumbing —
   a file only you can read, sourced by your profile:

   ```sh
   umask 077 && mkdir -p ~/.config/igor
   printf 'export IGOR_SEAT_ADAM=%s\n' 'paste-the-token-here' > ~/.config/igor/env
   echo '[ -f ~/.config/igor/env ] && . ~/.config/igor/env' >> ~/.zshrc
   ```

   Not `~/.zshrc` directly: a profile is usually world-readable and ends up in dotfile
   backups and screen shares. A `0600` file it sources is the same convenience without that.

3. **Pick it up.** Under systemd, `sudo systemctl restart igor@maintenance`. From a shell,
   open a new one — a token exported into one shell is invisible to every other.

4. **Check `igor budget`.** The seat should print its windows. A seat whose variable is unset
   reports unreadable and is skipped, never substituted with whatever login is ambient.

`igor budget` reading a seat is necessary and not sufficient. Reading inherits this process's
environment, so an ambient login or a keychain can answer for a seat that has no `token_env` at
all — while a worker's environment is written out rather than inherited and has no such
fallback. `budget` says so explicitly where it applies, and the cure is a `token_env` that is
set.

### When a seat token expires

A `claude setup-token` credential lasts **one year**, and the lifetime cannot be configured.
Nothing warns beforehand.

What you get instead is a clear failure: the seat reports unreadable in `igor budget`, and a
worker's handoff carries the message the CLI actually gave rather than an exit code. Rotating
is the same command the colleague ran the first time, and step 2 again.

A calendar reminder eleven months out is cruder than it should be and is currently the only
way to be told in advance.

`TimeoutStopSec=900` bounds how long shutdown waits, and is not a promise that the item in hand
finishes. The loop stops taking new items as soon as it is signalled, but a worker is bounded by
silence on its stream rather than by the clock and may legitimately run for hours. An Igor
killed mid-item leaves a claim on a tracker with no explanation, which is the single failure the
whole claim protocol exists to prevent — so raise this where a long item matters more than a
prompt shutdown, and do not lower it.

## Docker

```bash
cp deploy/env.example .env      # then fill it in
docker compose -f deploy/docker-compose.yml up -d
```

`stop_grace_period: 15m` is the same consideration as the systemd timeout, for the same reason.

## macOS

`launchd` works and the shape is the same, with two traps worth knowing because both fail
quietly:

**A launchd job does not follow the code.** `ProgramArguments` and `WorkingDirectory` are
absolute paths, and moving or renaming the repository leaves them pointing at nothing. The
running process keeps its old paths in memory, so everything looks healthy until the next
restart or login. After any move, update both keys, reinstall dependencies at the new location,
and confirm it is running from the new place rather than merely running:

```bash
lsof -a -p $(lsof -ti :PORT) -d cwd -Fn | grep ^n
```

**A launchd job inherits no shell**, so `PATH` must be spelled out. If `node` came from a
version manager, that path may contain a per-shell directory with a process id in its name,
which disappears when the manager cleans up. Point at a stable interpreter.

## Checking on it

```bash
igor budget                 # what each seat has left, read live
igor run <role> --plan      # what it would claim right now, claiming nothing
```

Everything an Igor did is on the `igor-state` branch of the lore repository:
`executions/` for what it worked and what that cost, one `.ndjson` file per UTC day,
`discovery.json` for the watermarks, `transcripts/` for why it did what it did. Readable with
`git show`, no checkout needed.

## When something is wrong

| symptom | cause |
|---|---|
| `seat "x" reads its token from Y, which is not set` | the seat has no token; it is skipped rather than substituted |
| `role "x" names seat "y", which is not declared` | the role spends a seat or `pool:` no `budget` block declares; every command refuses until the name matches one, since a default would charge the wrong seat |
| `role "x" names no seat` | seats are declared but this role names none; set `seat:` on it or on a level it inherits from. Omitting it used to fall through to the first pool declared, which may be a person's |
| `the tracker did not record <account> as holding <item>` | the machine account lacks write access — GitHub accepts the assignment and silently drops it |
| nothing is ever claimed | run `igor run <role> --plan`; the funnel prints where every candidate was dropped |
| an item was claimed and nothing happened | there is no such case; every path that holds a claim posts before releasing. If you find one, it is a bug |

To stop an Igor working a particular item, comment **stop** on it. That works for anyone, needs
no permission, and is not configurable. To stop an Igor entirely, stop the service — it will
finish the item it holds.
