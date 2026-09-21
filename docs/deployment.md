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
| `node` 26+ | Igor itself |

The floor is 26 rather than something older because Igor resolves provider reset phrases with
`Temporal`, which 26 is the first release to ship unflagged.

## Before it can run

Three things, in this order. None can be automated, and the first two are the ones people miss.

1. **A machine account per Igor**, with write access to the repositories it works. Not a
   GitHub App — an App's bot user cannot be an issue assignee, so claiming would silently
   degrade to a comment. [`machine-accounts.md`](machine-accounts.md) has the steps and the
   traps.

2. **A seat token per seat**, from `claude setup-token` run while signed in *as that seat*.
   Name where it lives in `igor.config.yaml`: `token_env` for a variable, `token_file` for a
   path, or `token_command` for something to run and take stdout — exactly one per seat. A
   seat naming a source that cannot be read is reported unreadable and skipped, deliberately:
   falling back to whatever login is ambient would mean reading one seat's usage and spending
   another's.

   A seat is usually somebody else's subscription, so this step is a request rather than a
   task. [`seats.md`](seats.md) is written for them: what the command is, what it grants, what
   `reserve` protects, and how to hand a token over without pasting it into a channel.

   This applies to your own seat too, trying it out on your own machine before any of the
   above: however you are signed in, the credential has to come from whichever of the three a
   worker is told to read — it never falls back to a keychain or an ambient login on its own.
   [Adding a seat somebody has given you](#adding-a-seat-somebody-has-given-you) is below.

   What to do with a token once you have one is
   [Adding a seat somebody has given you](#adding-a-seat-somebody-has-given-you) below: where
   the name goes, where the value goes, and how to check it took.

3. **A lore repository**, holding `igor.config.yaml` and `roles/`, checked out where the
   service runs — `WorkingDirectory` in the unit, because Igor finds its configuration by
   walking up from there. Creating one is
   [Setting up a lore repository](../README.md#setting-up-a-lore-repository) in the README.

And one thing about the repositories a role is pointed at: its work has to be text. A binary
file a worker changes is published corrupted rather than dropped, and the diff gives no sign of
it — [`architecture.md`](architecture.md) §6.7.3 has why that is tolerated and what would
change it.

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

   ```yaml igor:config
   budget:
     seats:
       - {id: adam, owner: adam@example.com, reserve: 0.5, token_env: IGOR_SEAT_ADAM}
   ```

   `token_env` is the *name* of a variable. Putting the token itself here commits a credential
   to a repository — the single mistake this arrangement exists to prevent.

2. **Set that variable in the environment Igor runs with.** A seat that names `token_env` is
   read through that variable and nothing else — not a file, not your keychain, not whatever
   login happens to be signed in. Both recipes below are only ways of getting a variable set:
   one for a service, one for a shell.

   Under systemd, an `EnvironmentFile=` the unit already names — the shared `/etc/igor/env`:

   ```sh
   IGOR_SEAT_ADAM=…
   ```

   No `export`: systemd parses this file itself rather than sourcing it in a shell, so shell
   syntax is not available here. Seat tokens belong in the shared file rather than a per-instance
   one, because a seat is a subscription several Igors may draw from. `GH_TOKEN` is the
   opposite — it is identity, and belongs in `/etc/igor/<role>.env`.

   Running from a shell instead, `token_env` needs the variable set in the shell that starts
   `igor`, which means a wrapper rather than an export — or `token_command`, which reads the
   store itself and needs no shell at all:
   [Keeping the token out of your shells](#keeping-the-token-out-of-your-shells) below.

3. **Pick it up.** Under systemd, `sudo systemctl restart igor@maintenance`. From a shell,
   open a new one — a token exported into one shell is invisible to every other.

4. **Check `igor budget`.** The seat should print its windows — read live where the credential
   answers with them, derived from observation and record where it does not. A seat whose
   variable is unset reports its credential unreadable and is skipped, never substituted with
   whatever login is ambient. That is a different row from a seat nobody has observed, which
   wants `igor observe` run on the owner's machine, and from a seat that has run out, which
   wants waiting.

`igor budget` reading a seat is necessary and not sufficient. Reading inherits this process's
environment, so an ambient login or a keychain can answer for a seat that names no token source
at all — while a worker's environment is written out rather than inherited and has no such
fallback. `budget` says so explicitly where it applies, and the cure is a token source that
resolves.

### Keeping the token out of your shells

Exporting from your profile puts the token in the environment of every process you start, not
just `igor` — a package manager's install scripts, every CLI, anything that reads its own
environment and sends it somewhere. On a machine that runs `npm install` that is the exposure
worth caring about, rather than the `0600` file.

Keep the secret in a store and have the seat name the command that reads it. Once, typed at a
prompt — it asks for the value twice and echoes neither, so the token never reaches a command
line:

```sh
security add-generic-password -a "$USER" -s igor-seat-adam -w
```

Then in `igor.config.yaml`, and nowhere in any shell:

```yaml igor:seats
- id: adam
  token_command: security find-generic-password -a "$USER" -s igor-seat-adam -w
```

`pass`, `gopass` and `op read` substitute for `security find-generic-password` unchanged; a
vault the team already shares is the better choice for somebody else's seat, since it is where
they handed the token over.

`token_env` reads the variable at the moment igor runs and stores nothing, so it need only
exist for that one process — but on a laptop something has to put it there, which means a
wrapper:

```sh
igor() {
  IGOR_SEAT_ADAM="$(security find-generic-password -a "$USER" -s igor-seat-adam -w)" \
    command igor "$@"
}
```

Open a new shell, then delete `~/.config/igor/env` and the line sourcing it. That wrapper covers
`igor` invoked as a command and nothing else: `npm run igor --` from a clone bypasses it and
finds no token. `token_command` has neither cost, which is why it is the one to reach for on a
laptop. Under a service the variable comes from the unit rather than a shell, and `token_env`
earns its place there.

Whichever source names it, **do not set `CLAUDE_CODE_OAUTH_TOKEN` yourself.** That is the
variable `claude` itself reads, so it authenticates everything igor spawns rather than the seat
you named — and `igor observe`, which has to read a window under your own login, gets the seat's
credential instead and reports that it carries no subscription.

This does not remove the token from the `igor` process or the worker it spawns, which is where
it has to be. It removes it from everything else you run.

**With no secret store at all**, a `0600` file the profile sources is the fallback. Not the
profile itself, which is usually world-readable and ends up in dotfile backups and screen
shares:

```sh
umask 077 && mkdir -p ~/.config/igor
read -rs TOKEN                        # paste it here: no echo, and no shell history
printf 'export IGOR_SEAT_ADAM=%s\n' "$TOKEN" > ~/.config/igor/env && unset TOKEN
echo '[ -f ~/.config/igor/env ] && . ~/.config/igor/env' >> ~/.zshrc
```

Not the token on a command line either: zsh skips space-prefixed commands only when
`HIST_IGNORE_SPACE` is set, which is not the default, so it would sit in the history file in
plain text long after the env file was locked down. This is a fallback and not an alternative —
it still exports into every shell, which is the thing this section is about.

**On a server this is the wrong shape, and `LoadCredential=` is the way out of it** — encrypt
the token with `systemd-creds encrypt`, name it in the unit with `LoadCredential=`, and point
the seat's `token_file` at wherever the unit's `$CREDENTIALS_DIRECTORY` puts it (systemd
documents that path per unit in `systemd.exec(5)`). Nothing lands in the unit's own
environment, so it is not inherited by anything the unit spawns and not in a crash dump —
which `EnvironmentFile=` cannot say. `token_command` covers a secret store the same way, in
place of a file: `security find-generic-password`, `pass show`, `op read`, run and its stdout
taken as the token, with no wrapper needed. `EnvironmentFile=` with the file `0600` and owned
by the service user remains the arrangement for `token_env`, and the service user running
nothing else is what stands in for the isolation there.

### When a seat token expires

A `claude setup-token` credential lasts **one year**, and the lifetime cannot be configured.
Nothing warns beforehand.

What you get instead is a clear failure: the seat reports its credential unreadable in
`igor budget` — distinctly from a seat nobody has observed and from one that has run out — and
a worker's handoff carries the message the CLI actually gave rather than an exit code. Rotating
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
igor budget                 # what each seat has left, and what state each one is in
igor run <role> --plan      # what it would claim right now, claiming nothing
```

`--plan` persists nothing: no watermark, no cycle record. Looking at the backlog does not
consume it, so this is safe to run when something is already wrong. `--claim` is a separate
path rather than a preview, and claims the item it names even alongside `--plan`.

Everything an Igor did is on the `igor-state` branch of the lore repository:
`executions/` for what it worked and what that cost, one `.ndjson` file per UTC day,
`discovery.json` for the watermarks, `transcripts/` for why it did what it did, and
`refusals/` for the whole envelope behind a limit — one JSON file each, which is what a reset
phrase can be read off later. Most are seats that ran out; the rest are runs that met a limit
the provider named in a field of its own and did not stop for it. Each file's `outcome` says
which it was, and `matched` which fields named the limit — `result` alone is the worker's own
prose, which a crash on an item about rate limits trips too. Readable with `git show`, no
checkout needed.

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
