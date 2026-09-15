## Context

Everything here concerns one call: the `spawn` in `claudeWorker`. Three faults met there
because nobody had written down what the child process is supposed to have.

## What the measurements said

Run against `claude` 2.1.272 on macOS, each in a scratch directory with `env -i` and an
isolated `HOME`, so the operator's own settings could not answer for the worker.

### `acceptEdits` does not deny Bash. It denies the commands that matter

The premise this change started from was that `--permission-mode acceptEdits` leaves Bash
prompting and headless has nobody to prompt, so Bash is denied. That is not what happens.

| command | `acceptEdits`, no allowlist |
|---|---|
| `echo DONE` | ran |
| `touch bashmade.txt` | ran |
| `node --version` | ran |
| `node -e "console.log(6*7)"` | **denied** |
| `npm install left-pad` | **denied** |

The CLI classifies read-only and trivially-scoped commands as safe and auto-approves them; a
command that executes arbitrary code or installs anything is denied. So the conclusion survives
— the worker cannot run a test suite, a type check, or a script, which is what the PR #5
transcript complained of — but the mechanism is narrower than "Bash is denied," and code or
comments written against the wider claim would be wrong.

### `--allowed-tools` is additive to the permission mode

The open question was whether supplying `--allowed-tools` makes `Edit` and `Write` need listing
explicitly. It does not, provided the mode stays:

| flags | Write | Bash |
|---|---|---|
| `--permission-mode acceptEdits` | allowed | safe commands only |
| `--permission-mode acceptEdits --allowed-tools "Bash(touch:*)"` | allowed | allowed |
| `--allowed-tools "Bash(touch:*)"` alone | **denied**, recorded in `permission_denials` | allowed |

So `--permission-mode acceptEdits` stays and `--allowed-tools` is added beside it, and a role's
`commands` never has to carry `Edit` or `Write` — which keeps the field about commands.

### What the environment actually needs

- `PATH` — required. `env -i HOME=… npx vitest` fails with `env: node: No such file or directory`.
- `CLAUDE_CODE_OAUTH_TOKEN` — sufficient on its own for authentication. `PATH` plus the token,
  with no `HOME` at all, ran a prompt successfully.
- `HOME` — **not** required by `claude` once the token is set, and `npm install` and `git log`
  both worked without it here, because macOS supplies a home from the passwd database. It is
  passed anyway, for the worked repository's toolchain rather than for `claude`: a cache
  written to a fallback home is a cache written somewhere a service user may not own.
- `USER` and `LOGNAME` — needed only for the keychain fallback. `PATH+HOME` alone returned
  "Not logged in · Please run /login"; adding `USER` and `LOGNAME` authenticated from the
  macOS keychain. They are deliberately **not** passed: with a seat token they buy nothing, and
  leaving them out removes the path by which a worker could authenticate as something other
  than its seat.
- `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and their lowercase spellings — forwarded when set.
  Proven load-bearing: a bogus `HTTPS_PROXY` made `claude` fail with
  `API Error: Connection refused — a firewall or proxy may be blocking it`. On a host behind a
  proxy, dropping these fails as a network error that looks like anything but a missing
  variable.
- `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR` — forwarded when set, for the same
  reason and the same failure shape. Not separately measured; they are the TLS half of the
  proxy configuration and are file paths rather than secrets.

### The worked repository's own settings did not widen anything

Worth checking, because it is the channel this design refuses to read from. A
`.claude/settings.json` in the working directory declaring `permissions.allow:
["Bash(node:*)"]` did **not** let the worker run `node -e`; the command was still denied. The
operator's own `~/.claude/settings.json`, with `defaultMode: auto`, did not widen it either —
an explicit `--permission-mode` on the command line wins over a configured default.

So the hole the design closes is currently shut by the CLI anyway. That is not a reason to
depend on it: it is undocumented, it is a behaviour of one version, and a worker able to edit
files is able to write that file. The allowlist comes from the role.

## Decisions

### The seat's token travels by name, not by value

`Gate` gains `tokenEnv?: string` — the chosen seat's `token_env`, which the gate already has in
hand from `chooseSeat` — and `ExecuteOptions` gains `seatTokenEnv?: string`. Execution reads
the variable at the single point where the child's environment is built.

The alternative was to put the token's *value* on the `Gate`. Both were workable; the name was
chosen because `Gate` is an ordinary object that flows through `RunOptions`, gets spread into
`execute`, and is read by emitters. A value on it would exist in memory in several places that
have no business holding a credential, and would eventually be printed by something.

`ExecuteOptions` learns the name of the variable holding the credential the worker authenticates
with. It does not learn about pools, headroom, shares or readings, so nothing about budgets has
widened.

The token is forwarded **by name** through the loop as well: `runItem` spreads its options into
`execute`, and a field riding that spread is a field nobody has to keep correct. `seatTokenEnv`
is assigned explicitly from `options.budget?.tokenEnv`.

### An unset variable fails, an unnamed one falls back

Two cases, deliberately different, and both mirror `readUsage`:

- The seat names a `token_env` that is unset or empty → throw, naming the variable. `readUsage`
  already refuses this rather than falling through to an ambient login, and a worker that
  authenticated as somebody else while being billed to this seat is the same mistake one stage
  later. In practice the gate cannot choose such a seat, because reading its usage failed and
  it was passed over; the check is there for the configuration that has not been thought of.
- No seat names a `token_env` at all — including the documented "declare no seats and budget is
  not enforced" configuration → forward an ambient `CLAUDE_CODE_OAUTH_TOKEN` or
  `ANTHROPIC_API_KEY` if one is set. Without this, every unenforced-budget install would break
  on the day this shipped: the worker would be spawned with no credential and answer
  "Not logged in". `readUsage` does exactly the same thing by inheriting the environment when
  the seat names nothing.

### Narrowing `commands` means an exact subset

`allow` is a closed set, so "does the child widen the parent" is set membership. Command
patterns are not a closed set, and deciding whether `Bash(npm run test)` is narrower than an
inherited `Bash(npm *)` is glob subsumption — a matcher, which is a parser, which `role-config`
already forbids for lanes. So an entry is accepted only if it appears verbatim in what the role
inherits.

The cost is real and is the right cost: a legitimately narrower pattern is rejected and has to
be written as one the parent already lists. The alternative failure — accepting `Bash(*)`
because some subsumption rule said it was narrower — is not recoverable by reading the config.

The check lives in `capabilitiesOf`, with `allow` and `budget_share`, not in the level loop in
`resolveRole`. The level loop is override semantics; monotonic fields are resolved over the
inheritance graph because a flat list cannot tell a parent from a sibling. Siblings union,
levels narrow, exactly as `allow` does.

### The role declares commands, and Igor writes the tool spec

`commands: ["npm test:*"]` becomes `--allowed-tools "Bash(npm test:*)"`. The role names
commands; it does not name tools. Letting a role write `Edit` or `WebFetch` into the field
would make "commands" a lie and would reach past what this change is for — and `Edit` is
already granted by the permission mode, so nothing is lost.

An entry containing `)` is rejected. The CLI takes a list, so `npm test:*) Edit Bash(rm -rf *`
wraps to `Bash(npm test:*) Edit Bash(rm -rf *)` and names two more tools — the wrapper is what
keeps the field about commands, and it only holds if nothing can close it early.

## Risks

- **A role can still declare something too broad.** `commands: ["*"]` is a valid narrowing of
  an org base that declares `"*"`. The field is only as good as the org base, which is the same
  property `allow` has, and it is visible in `role explain`.
- **The measurements are from one CLI version on one platform.** Which commands `acceptEdits`
  auto-approves is a behaviour of `claude` 2.1.272, not a contract. Nothing here depends on the
  boundary staying where it is: the allowlist is what grants commands, and the mode is what
  grants edits.
