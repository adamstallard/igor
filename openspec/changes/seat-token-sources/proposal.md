## Why

`readUsage` and `workerEnv` both resolve a seat's token as `env[tokenEnv]`. That is the only
way in, which forces the credential to exist as an environment variable in whatever starts
Igor.

On a laptop that can be scoped down with a wrapper function, since the variable only has to
exist for the one process. On a server it cannot: the arrangement this project documents is
`EnvironmentFile=`, which puts the token in the unit's environment for the lifetime of the
service, inherited by everything it spawns and visible in a crash dump.

systemd already has the better mechanism. `systemd-creds encrypt` stores the secret encrypted
at rest, TPM-bound where there is one, and `LoadCredential=` decrypts it into a tmpfs file
readable only by that unit — never in an environment. Igor cannot use it, because systemd
supplies a path in `$CREDENTIALS_DIRECTORY` and Igor reads a variable name.

## What Changes

**A seat may name `token_file` or `token_command` alongside `token_env`.** `token_file` reads
the token from a path — what `LoadCredential=` decrypts it to. `token_command` runs something
and takes its stdout — what `security find-generic-password`, `pass`, and `op read` need,
without a wrapper. Exactly one of the three may be set; a seat naming more than one is
rejected at config load.

**Resolution is one function, used by both readers.** `readUsage` (reading a seat's own usage)
and `workerEnv` (what a worker authenticates with) each resolved `token_env` themselves,
duplicated. Both now call one `resolveToken`, so a third source did not mean writing the file
read and the subprocess spawn twice.

**A `token_command` that never answers is a failure, not a hang.** A secret store blocked on an
interactive prompt — `pass`/`gpg` with no TTY under a service, `op read` wanting a fresh
sign-in — would otherwise wait forever: before the worker's own watchdog is armed for
`workerEnv`, and indefinitely for `igor budget`. The command is killed and reported unreadable
past a provisional timeout, the same shape as every other bound in this codebase that has not
yet been measured against a real task.

**A seat naming none of the three is unchanged.** It reads through whatever login is ambient
for `readUsage`, and forwards the ambient login for `workerEnv` — the behaviour from before
these existed, for the org running with no seats declared and for `igor budget` used from a
developer's own machine. Only a seat that names a source it cannot read is refused; that
failure is reported and the seat is skipped, never substituted with another credential.

Explicitly out of scope:

- **Reading `$CREDENTIALS_DIRECTORY` implicitly.** Igor does not expand systemd specifiers or
  read its own environment to find a credentials directory; the operator writes the literal
  path `LoadCredential=` puts the secret at into `token_file`. Doing that expansion for them is
  a smaller, separable convenience.
- **Validating that a `token_command` is safe to run.** It is operator-configured, the same
  trust level as the command Igor spawns for `claude` itself, and never reaches text from a
  tracker item.

## Capabilities

### Modified Capabilities

- `seat-budget`: a seat names its token through exactly one of three mechanisms rather than
  only an environment variable.
- `task-execution`: the worker's environment is built from whichever of the three the chosen
  seat names, generalizing what was `token_env`-only.

## Impact

- Closes the gap between how Igor documents running under systemd (`EnvironmentFile=`, a
  credential live in the unit's environment for its whole lifetime) and how systemd itself
  wants a secret handled (`LoadCredential=`, decrypted into a file only that unit reads).
- `pass`, `op read`, and a platform keychain read through `token_command` need no shell wrapper
  around `igor` — the seat's own config says how to reach them.
- No existing seat config changes meaning: `token_env` behaves exactly as before, and a seat
  naming nothing still falls back to the ambient login it always did.
