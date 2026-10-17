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

The image in [Docker](#docker) below carries all four at exact versions, which are the ones CI
tests against. On a host you install them yourself; matching those versions gets you what CI
tested.

**"On the path" means the service's path, not your shell's.** A service inherits no shell
profile, and systemd's default `PATH` doesn't include `~/.local/bin`, which is where `claude`'s
native installer puts it for whoever ran the installer. `deploy/igor.service` sets
`Environment=PATH=` with the service user's `~/.local/bin` first. Check that it's right with
`sudo -u igor sh -lc 'command -v claude'` and edit the unit to match. If it's wrong, every
triage and worker call fails to start. The same applies to `gh` if it came from Homebrew
(`/opt/homebrew/bin` on macOS, `/home/linuxbrew/.linuxbrew/bin` on Linux).

**Don't let `claude` update itself on the server.** A native install updates in the background,
and a release is expected to change how `claude -p` authenticates: `--bare` will become its
default, and bare mode ignores a seat's `setup-token`
([igor#144](https://github.com/adamstallard/igor/issues/144)). The unit sets
`DISABLE_AUTOUPDATER=1`, so an upgrade only happens when you run `claude update` as the service
user and then restart the Igors. Read the release notes before you do. Claude Code's setup
docs say apt, dnf and apk installs don't update themselves either.

## Before it can run

Three things, in this order. None can be automated, and the first two are the ones people miss.

1. **A GitHub App per role**, installed on the account that holds the repositories the role
   works and its lore repository. Every `gh` and `git` call an Igor makes acts as that App.
   [Giving an Igor its GitHub App](#giving-an-igor-its-github-app) below has the steps.

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

### Giving an Igor its GitHub App

**An Igor acts on GitHub as a GitHub App, one App per role.** Its pull requests, comments and
claims show as `<name>[bot]`. An App needs no personal token renewed and no seat, and it needs
no server: minting a token and calling the API are outbound, and the Igor polls.

1. **Create the App.** On GitHub, under the account that owns the repositories the role works
   on and its lore repository: **Settings → Developer settings → GitHub Apps → New GitHub App**.

   | Field | Value |
   |---|---|
   | GitHub App name | Any free name, such as `igor-<role>`. Commits and claims show as `<name>[bot]`. |
   | Homepage URL | Any; the lore repository's URL is fine. |
   | Webhook | Untick **Active**. Igor polls; nothing receives events. |
   | Repository permissions | **Contents**, **Issues** and **Pull requests**: Read and write. **Workflows**: Read and write only if the role changes files under `.github/workflows/`. |
   | Where can this GitHub App be installed? | **Only on this account.** |

   On the App's **General** page, copy the **App ID**, and under **Private keys** click
   **Generate a private key**. GitHub downloads a `.pem` file; it is the App's password.

2. **Install it.** In the App's settings, **Install App**, then **Install** on the account,
   choosing **Only select repositories**: every repository the role works on, and its lore
   repository. One installation must cover them all, or the Igor refuses to start.

3. **Store it on the host.** Move the key to `/etc/igor/<role>.pem` and add the three
   variables to `/etc/igor/<role>.env`, both `0600` and owned by the service user:

       GITHUB_APP_IDENTITY=<role>
       GITHUB_APP_ID=<App ID>
       GITHUB_APP_PRIVATE_KEY_FILE=/etc/igor/<role>.pem

   Start the Igor. If anything is missing or wrong, it refuses to start and names it.

**The credentials come from that environment and nowhere else.** A person running an Igor from
a shell exports the same three variables. `GITHUB_APP_PRIVATE_KEY`, holding the key itself,
may replace the file variable; set both and the Igor refuses to start. An ambient `GH_TOKEN`
or a host `gh` login is never used, so don't log `gh` in as the service user: nothing in Igor
needs that login, and a worker allowed to run `gh` could use it. To diagnose an App, the
`github-app` skill's `check` reads the same variables:
`sudo -u igor sh -c 'set -a; . /etc/igor/<role>.env; python3 github_app.py check'`. Igor does
not need the skill.

**Why an App claims with a label.** An App's bot user cannot be an issue assignee or a
requested reviewer: the can-this-user-be-assigned check returns 404, and the assignment 403,
on any plan. So an Igor claims an issue by adding the label `igor:<role>` and posting the claim
comment, and the assignee stays a person's. An Igor leaves alone an issue assigned to a person
unless it carries that Igor's label, and a person adding the label hands the issue to that
Igor, which starts without waiting the settle interval. Adding a label the repository lacks
creates it, so a new role needs no label set up.

**One App per role, never shared.** An Igor tells a person removing its label, which is a
stop, from its own release by comparing the event's actor with its own bot account, and that
works only if no other Igor shares the account. Processes of one role share its App.

**Revoking** an Igor is uninstalling its App. Its history stays attributable to it.

Which seat pays for an Igor's model calls is separate from its App: [`seats.md`](seats.md).

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
   one, because a seat is a subscription several Igors may draw from. The GitHub App is the
   opposite: it is identity, and its lines belong in `/etc/igor/<role>.env`.

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

The `Dockerfile` at the repository root has two targets on one base:

- `runtime` is what `deploy/docker-compose.yml` runs: node, git, `gh` and `claude`, with `igor`
  on the path, running as the image's `node` user.
- `development` has the same tools and no Igor. The devcontainer and CI are both built from it.

```bash
cp deploy/env.example deploy/.env       # then fill it in
cp <the App's key> deploy/maintenance.pem && chmod 600 deploy/maintenance.pem
sudo chown 1000:1000 deploy/maintenance.pem   # Linux hosts only; skip on macOS
git clone <your lore repository> deploy/lore
docker compose -f deploy/docker-compose.yml up -d
```

Compose reads `.env`, `lore` and `maintenance.pem` from `deploy/`, beside the compose file, not
from the directory you run it in. Compose mounts the key at `/run/secrets/maintenance.pem`, so
set `GITHUB_APP_PRIVATE_KEY_FILE=/run/secrets/maintenance.pem` in `deploy/.env`, replacing the
systemd path `env.example` ships with.

The container runs as uid 1000, and outside swarm, compose mounts the key and the lore
checkout with their host owner and mode. So on a Linux host the key must be owned by uid 1000,
which is what the `chown` above does. The lore checkout only needs to be readable by uid 1000,
because Igor writes its state to the `igor-state` branch through the GitHub API, not into the
checkout. Without the `chown`, the Igor refuses to start, saying the private key cannot be read.

Docker Desktop on macOS opens mounted files as your own user, so there the key must stay
yours. Chowned to uid 1000 and `0600`, your user can no longer read it, and compose fails to
mount it.

Nothing secret is in the image. Seat tokens and the App's key reach the container at run time,
through `env_file` and `secrets`, and `.dockerignore` keeps `.env` and `.pem` files out of the
build context.

`stop_grace_period: 15m` is the same consideration as the systemd timeout, for the same reason.

### Pinned versions

Each tool's version is set in one place, an `ARG` at the top of the `Dockerfile`. The table
shows the current values:

| tool | version | how the image gets it |
|---|---|---|
| node | 26.3.0 | the `node:26.3.0-trixie-slim` base image |
| git | 2.47.3 | Debian trixie's package, pinned to its full version `1:2.47.3-0+deb13u1` |
| python3 | 3.13.5 | Debian trixie's packages: `python3` `3.13.5-1` and the interpreter, `python3.13` `3.13.5-2+deb13u5` |
| `gh` | 2.94.0 | the release tarball, checked against its SHA-256 for each architecture |
| `claude` | 2.1.296 | `npm install -g @anthropic-ai/claude-code@2.1.296` |

The build ends by checking the installed version of git, python3, `gh` and `claude`, and fails
if any differs from its pin; node's version is fixed by the base image's tag. The image sets
`DISABLE_AUTOUPDATER=1`, so `claude` changes only when the image is rebuilt with a new pin.

To move `gh`, change the version and its checksums together; each `gh` release publishes a
`checksums.txt`.

Igor's own code is not Python, but the image needs python3. A worker runs the shared skills,
whose scripts are Python (`prose`, `bug-hunter`, `spec-trace`). Igor itself runs `prose.py` to
check the signature on text a worker wants to publish
([#153](https://github.com/adamstallard/igor/issues/153),
[#174](https://github.com/adamstallard/igor/issues/174)). The image has no pip and no virtual
environment, so those scripts can use only Python's standard library.

**A Debian pin holds back security fixes until you move it.** A fix first appears in
`trixie-security` beside the pinned revision. The image keeps building, still with the pinned,
unfixed revision. At Debian's next point release, `trixie` itself carries only the new revision,
apt cannot find the pinned one, and the image stops building. Move a pin when a security fix
for git or python lands, rather than waiting for the build to break. To see what the archive
carries, ask the base image:

```bash
docker run --rm node:26.3.0-trixie-slim sh -c \
  'apt-get update -qq && apt-cache madison git python3 python3.13'
```

`madison` lists each version the archive holds, newest first. Set `GIT_VERSION` to git's newest,
`PYTHON3_VERSION` to python3's and `PYTHON3_13_VERSION` to python3.13's, epoch and revision
included, and let CI run the suite against it. Each python variable also pins the other packages
of its family, which Debian always publishes at the same version as the one `madison` lists:
the `Dockerfile` comment above `GIT_VERSION` names them.

### Upgrading the `claude` pin

`claude` is the pin that matters. Igor reads the CLI's output rather than an API with a
contract: the result envelope's `result`, `is_error`, `total_cost_usd`, `modelUsage`,
`terminal_reason`, `rate_limit_info`, `session_id` and `permission_denials`, and the text
`/usage` prints for `igor budget`. A release that renames or reshapes any of these breaks
nothing loudly. Costs read as zero, limits go unnoticed, or a seat reads as unreadable.

1. Read the release notes for every version between the pin and the target. Look for changes
   to `-p`, to `--output-format json` and `stream-json`, to `/usage`, and to authentication:
   a seat's `setup-token` must still be honoured
   ([igor#144](https://github.com/adamstallard/igor/issues/144)).
2. Change `CLAUDE_CODE_VERSION` in the `Dockerfile`. That one line is the whole change.
3. Rebuild and run `igor budget` in the container, with `deploy/.env` holding a seat's token:
   `docker compose -f deploy/docker-compose.yml run --build --rm maintenance igor budget`.
   Every seat should print its windows.
4. Let one Igor work one small item, then read the `igor-state` branch of the lore repository.
   The item's record under `executions/` should show a non-zero cost and per-model usage, and
   its transcript should be under `transcripts/` on the same branch.

CI runs the test suite against the new pin, but the tests run a stand-in script, not the real
CLI. Steps 3 and 4 are what check the format.

### Developing in the image

`.devcontainer/devcontainer.json` opens a clone in the `development` target and runs `npm ci`
when the container is created. That `npm ci` writes Linux builds into the checkout's
`node_modules`, so run `npm ci` again before running anything from the same checkout on a
macOS host. Some tests create commits, so git needs an identity in the container. VS Code
copies yours in; with the `devcontainer` CLI, set `user.name` and `user.email` yourself.

CI (`.github/workflows/ci.yml`) builds the same target on every pull request and every push to
`main`, then runs `npm run typecheck` and `npm test` inside it.

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
consume it, so this is safe to run when something is already wrong. `--claim` is not a preview
and the two are refused together, so the claim lines a preview prints are run without `--plan`.

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
| `the GitHub App "x" is missing GITHUB_APP_ID …` | `/etc/igor/<role>.env` lacks that variable; the Igor reads its App only from its environment |
| `… is set for "default", since GITHUB_APP_IDENTITY is unset, and this Igor acts as "x"` | `GITHUB_APP_IDENTITY` is missing, or names another role; it must be the role's name |
| `both GITHUB_APP_PRIVATE_KEY_FILE and GITHUB_APP_PRIVATE_KEY are set` | keep one of them |
| `the private key for "x" … cannot be read` or `… cannot sign` | the path is wrong, the service user cannot read it, or it is not the `.pem` GitHub generated |
| `GitHub refused the credentials of the App "x" (App ID n)` | the App ID is wrong, or the key was deleted on the App's page |
| `the App "x" is not installed on <owner>` | install it on the account holding the repository |
| `the App "x" is installed on <owner> but cannot reach <repo>` | add the repository to the installation |
| `… through more than one installation` | the role's repositories and its lore repository are on different accounts; one Igor uses one installation |
| `… lacks Issues write` (or another permission) | grant it in the App's settings, then accept the new permissions on the installation |
| `the App's installation lacks Workflows write` | reported, not refused; a publish changing `.github/workflows/` fails until it is granted |
| `taking no new work, GitHub would not mint a token for the App "x"` | the key was deleted or the App uninstalled while it ran; it tries once a cycle and resumes by itself |
| `the tracker did not record <account> as holding <item>` | the claim label did not stick: read back after it was added, the issue does not carry it |
| nothing is ever claimed | run `igor run <role> --plan`; the funnel prints where every candidate was dropped |
| `9 left untriaged — the budget is used up, back at …` | every seat the role may use is held. Nothing is wrong with the host: triage is a spend, so it does not run where the gate names no seat, and those nine items wait rather than being decided about. It keeps discovering and keeps reading comments, so a **stop** still lands |
| `9 left untriaged — no seat's usage could be read …` | the same stop, for a reason a clock will not clear: the sentence names what to go and look at, and only "used up" means spend |
| an item was claimed and nothing happened | there is no such case; every path that holds a claim posts before releasing. If you find one, it is a bug |

An Igor that is quiet is not necessarily an Igor that is broken, and the cycle line says
which. `Not logged in · Please run /login` is **not** what it looks like when every seat is held: triage no
longer falls back to whatever login is ambient, so that message means what it says, and running
`/login` on a machine whose seats are simply held fixes nothing.

To stop an Igor working a particular item, comment **stop** on it. That works for anyone, needs
no permission, and is not configurable. To stop an Igor entirely, stop the service — it will
finish the item it holds.
