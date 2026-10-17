## Context

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides that Igor loads its skills
from one pinned directory named on every `claude -p`. The issue named the directory with
`--add-dir`. The measurement below found that `--add-dir` loads the skills but does not keep
them pinned, and Adam chose `--plugin-dir` on #174 (2026-10-11).

**Igor never passes `--bare`** (decided by Adam, 2026-10-11). Under `--bare` a seat's
setup-token can authenticate only as an API key, and it then emits no `rate_limit_event`, so it
does not run as a seat (measured, below). Every call runs in normal mode, where the worker
invokes `igor:<name>` skills itself through the Skill tool.

## Measured with a model, 2026-10-11

Run by the coordinating agent: Claude Code 2.1.296, model haiku, the `claude-adam-personal`
setup-token, run from a fresh `/tmp` directory.

### Task 0.1: a plugin skill runs

A scratch plugin `igor` held one skill `canary` that replies `PLUGIN-CANARY-OK` and its base
directory. The results, verbatim:

1. **Without `--bare`:** the token authenticates through `CLAUDE_CODE_OAUTH_TOKEN`;
   `igor:canary` loads; the model calls the Skill tool with `igor:canary`, and the skill runs.
   The base directory it receives is the plugin's own skill directory (`<plugin>/skills/canary`).
2. **Under `--bare` with `CLAUDE_CODE_OAUTH_TOKEN`:** authentication fails ("OAuth session
   expired and could not be refreshed", `apiKeySource: none`). `claude --help` confirms: under
   `--bare`, "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth
   and keychain are never read)".
3. **Under `--bare` with the same setup-token supplied by `apiKeyHelper` in a `--settings`
   file:** it authenticates (`apiKeySource: apiKeyHelper`), and the model runs.
4. **Under `--bare`, the model has no Skill tool.** The default tool set is Bash, Edit and Read
   only. `igor:canary` appears in the init event's skills list, but the model can't invoke it,
   and it went searching the disk instead. `--tools "Read,Skill"` yields only `Read`: Skill
   cannot be added back.
5. **Under `--bare`, a prompt of `/igor:canary` runs the skill** (the slash form), and it
   receives the plugin's base directory.

### `--bare` does not run as a seat

`--tools ""`, prompt "Reply with OK.":

- **Normal mode,** token in `CLAUDE_CODE_OAUTH_TOKEN`: `apiKeySource: none`. A
  `rate_limit_event` arrives with status `allowed` and keys `isUsingOverage,
  overageDisabledReason, overageStatus, rateLimitType, resetsAt, status, unifiedWindows`.
- **`--bare`,** same token through `apiKeyHelper`: `apiKeySource: apiKeyHelper`. It succeeds,
  but **no `rate_limit_event` at all.** Under `--bare` the token is taken as an API key and does
  not run as a subscription seat the way normal mode does. There is no seat reading, which
  #143's reserve line depends on, and what it is billed against is unknown.

### What follows for this change

- **The worker uses its skills through the Skill tool**, in normal mode (result 1). No step has
  to open with a slash command.
- **The base directory is the plugin's**, `<skills_dir>/skills/<name>`, not a resolved clone,
  for the skill task 0.1 measured. Task 0.1's notes do not say whether `canary` was a symlink,
  which is how the manager installs a skill, so whether #153's grants under
  `<skills_dir>/skills` match the path the model is given is not yet known. Task 0.3 measures
  it before the implementation is built. If a linked skill is given the clone's path instead,
  the choice of flag goes back to Adam (decided by Adam, 2026-10-17). That replaces task 0.1's
  fallback of having #153's grants name the clone's path.
- **#144's risk stands.** If `--bare` becomes the default for `claude -p`, Igor must opt out
  explicitly.

## Measured without a credential, 2026-10-11

Claude Code 2.1.296 on macOS. Every call ran under `env -i PATH=… HOME=…`, so no credential was
present. The `system/init` event arrives before authentication, so loading could be measured
without one. Each call then ended `is_error: true`, `Not logged in · Please run /login`,
`total_cost_usd: 0`, exit 1. Skills were installed by the shared-skills manager
(`skills.py install --no-hook prose bug-hunter`, with `SHARED_SKILLS_TARGET` set) from a clone
checked out at `6d0ae49`, as absolute symlinks into the clone.

### `--plugin-dir`, the mechanism this change uses

The plugin directory held `.claude-plugin/plugin.json` (`{"name": "igor", …}`) and the
manager's links under `skills/`.

| invocation | relevant skills in `system/init` |
|---|---|
| `--bare --plugin-dir <dir>` | `igor:prose`, `igor:bug-hunter`. No home skills. |
| `--plugin-dir <dir>`, no `--bare`, with a `prose` in `HOME`'s `.claude/skills` and a repository skill in the working directory | `prose` and the repository's skill, beside `igor:prose` and `igor:bug-hunter` |

- **A plugin skill's name carries the plugin's name**, so a same-named skill elsewhere loads
  beside it and cannot replace it.
- **The plugin loads under `--bare`** and appears in the event's `plugins` list.
- **`--plugin-dir` is not documented as granting file access.** `claude --help` describes
  `--add-dir` as "Additional directories to allow tool access to", and `--plugin-dir` only as
  loading a plugin. This matters because write access to the skills is one reason `--add-dir`
  is rejected (below). It was read from the help text, not measured. Task 0.3 measures it
  before the implementation is built; if the worker can write the skills, the choice of flag goes back to Adam
  (decided by Adam, 2026-10-17).

### What holds whichever flag is used

- **`--bare` drops the home skills.** `prose` and `bug-hunter`, installed in Adam's
  `~/.claude/skills`, were missing under `--bare`.
- **A skill's scripts resolve their shared library through the manager's link.** `prose.py`
  takes its directory from `Path(__file__).resolve()`, and bug-hunter's `caller-result.sh` from
  `cd -P "$(dirname "$0")"`. Run through the links, both worked: `caller-result.sh` printed a
  full result block.
- **The manager installs without hooks.** It has `install --no-hook`. And with
  `SHARED_SKILLS_TARGET` set but `SHARED_SKILLS_HOOK_HOME` unset, it wires no hooks anyway
  (`auto_enable_hooks`).
- **The skills' own instructions point at the home directory.** Prose's `SKILL.md` defines its
  scripts directory as `~/.agents/skills/prose/scripts` or `~/.claude/skills/prose/scripts`.
  Bug-hunter's names `~/.agents/skills/bug-hunter/scripts/caller-result.sh`, then the
  `~/.claude` one. On an Igor server those paths are missing or hold an unpinned copy. That
  was at `6d0ae49`; shared-skills #19 (merged as `075a73a`) fixes it, so the pin starts there.

### Rejected: `--add-dir`

The issue's choice. Measured with a directory whose `.claude/skills/` held the skills:

| invocation | skills in `system/init` |
|---|---|
| `--bare --add-dir <dir>` | the skills from `<dir>`, including through a symlink, plus the built-in ones |
| `--bare` alone | the built-in skills only |
| `--add-dir <dir>`, no `--bare` | the home skills, the skills from `<dir>`, and the built-in ones |

It loads the skills, but it fails the issue's purpose, a pinned copy, in two ways:

1. **Without `--bare`, a skill of the same name elsewhere replaces the pinned one.** Measured
   by reading the skill listing the session sends:
   - with a same-named skill in a temporary `HOME`'s `.claude/skills/`, the home copy's
     description was sent;
   - with one in the working directory's `.claude/skills/`, the repository's copy was sent, even
     when the repository was itself passed with `--add-dir` ahead of the pinned directory.

   The `system/init` list showed the name once either way, so a check could not see it. Guards
   would have had to refuse a home copy at start and stop an item whose repository ships one.
2. **It gives the worker edit access to the skills.** Under the worker's `acceptEdits`, a write
   under an added directory succeeds (`WorkerInput.outbox`, `src/execute.ts`). A worker an item
   steers could rewrite `prose.py`, the script Igor's own code runs to verify that worker's
   signature. Igor would have had to refuse to start wherever it could write the directory.

Under `--add-dir`, commands and agents in the directory also loaded without `--bare` and not
with it, so behaviour would differ across the flip.

## Decisions

### `skills_dir` is a key in `igor.config.yaml`, absolute

Token sources already name server paths there (`token_file`), so a server path in the team's
file is not new. It must be absolute: relative to the configuration, it would land in the lore
repository, which Igor writes to. The skills Igor expects are the ones installed under
`skills/`; there is no second list to keep in step with the directory.

The plugin is named `igor` (decided by Adam, 2026-10-11), so skills load as `igor:prose` and `igor:bug-hunter`. The deployment
writes the one-line `plugin.json`; the startup check fails if the name differs, because no
`igor:<name>` would be listed.

### One plugin directory for every role

**The coordinating agent's choice (2026-10-11), not Adam's; he can overrule it.** Every call
carries the one `--plugin-dir <skills_dir>`, so every installed skill loads for every role. A
role's `skills` list (#153) decides which skills its worker is directed to use and which Igor
verifies, not what loads. A plugin directory per role would mean one directory per distinct
list to install, pin and check at start, and it would protect little: a loaded skill the role
does not list is neither directed nor granted, and #153's grants by path are per listed skill.

### What normal mode loads besides the plugin

Without `--bare`, a call also loads the hooks, `CLAUDE.md` and home skills (`~/.claude/skills`)
of the user it runs as, and, unless told not to, the worked repository's own `.claude` settings,
skills and `CLAUDE.md` (measured). Namespacing keeps every `igor:<name>` skill from being
replaced, but the rest reaches the model. A dedicated Igor server's service user has no hooks,
`CLAUDE.md` or home skills, and nor does the separate worker user of #175. Two decisions of
2026-10-17, below, keep the repository's files out of every call and reset the worker user's
`~/.claude` before each call made as that user.

**Decided by Adam, 2026-10-11: Igor makes no startup check of the users' hooks, `CLAUDE.md` or
home skills.** `docs/deployment.md` tells the operator to keep the service user and the worker
user free of them, and why (task
5.3). A check comes back only if a shared server becomes a supported setup.

**Decided by Adam, 2026-10-17: no call loads the worked repository's settings.** The worker
can edit the repository, so its `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md`
are text an item can steer, the same reason the `role-config` spec keeps a worker's allowed
commands in the role file. Every call passes `--setting-sources user`, which loads the user's
settings and not the project's or local ones, and `--strict-mcp-config`, which ignores every MCP
configuration not passed with `--mcp-config`. The help text says only that much; whether the
two also keep the repository's skills and `CLAUDE.md` out is unmeasured, and task 0.3 measures
all four.

**Decided by Adam, 2026-10-17: before each worker run, Igor resets the worker user's
`~/.claude`, and nothing else in its home.** `--setting-sources user` still loads the home
directory, and under #175 the worker user owns and writes its home, so a worker an item steers
could plant hooks, a `CLAUDE.md` or skills in `~/.claude` for every later worker. Task 5.3's
note to the operator cannot stop that; recreating `~/.claude` from a clean template before each
call can. The same decision first gave each worker a fresh, empty home, and was narrowed to
`~/.claude` the same day, because an empty home loses what later runs need:

- `~/.gitconfig`, where #175's start check sets `safe.directory` so the worker's git trusts a
  tree the service user owns;
- #153's session mark (the file `prose start` writes under `~/.local/state`, which #153's prose steps check for);
- tool caches such as `~/.cache`, and any configuration a repository's tests read from the
  home.

How the reset works:

- **Who owns the template:** the service user Igor runs as, or root. The worker user can read it and cannot write
  it, so no run can change what the next run starts from. Where it lives and what it holds are
  open (proposal, *Still open*).
- **Who performs the reset:** Igor, as the worker user, through #175's `sudo` spawn. Under #175
  only the worker user can remove what a worker wrote.
- **When:** before every `claude -p` Igor starts as the worker user. That is the worker and
  each of #153's later model steps in the worker's working tree, which under #175 also run as
  the worker user. A
  step after the worker therefore never loads what the worker wrote to `~/.claude`.
- **Authentication:** a seat's token reaches `claude` through its environment, not `~/.claude`,
  so the reset leaves it untouched (task 0.3 confirms it). A worker with no seat token runs on
  a login stored in `~/.claude`, which the reset removes. Once #171 is built, Igor refuses a seat
  file that names no token, so no seat is in that case. An organization that declares no seats
  still is, and so is a seat naming no token before #171 is built; both are open (proposal,
  *Still open*).
- **What persists, and why that is accepted:** everything outside `~/.claude`, tool caches
  included. A file a run leaves there, such as `~/.npmrc`, can steer later runs of the same
  instance. Adam accepted that risk within one instance. #175 gives each Igor instance its own
  worker user and home, so such a file reaches no other instance.

Where the worker runs as the service user Igor runs as, under #175's same-user mode, there is no
worker user to reset, and what home that worker gets is open (proposal, *Still open*). So are a
worker process that escapes #175's kill of the run's process group and rewrites `~/.claude` after the reset, and what Claude Code
reads from `~/.claude.json`, which sits outside `~/.claude`.

### The startup check is a call with no token and an empty `HOME`

The issue suggests reading the skill list from #144's startup self-test. That self-test is not
yet specified and runs once per seat. The check here runs once, with no seat: `claude -p
--plugin-dir <skills_dir>` from an empty temporary directory, with `PATH` and a `HOME` that is
another empty temporary directory. With no token in the environment and no stored login under
`HOME`, it prints `system/init` and then fails with `Not logged in`, at no cost: measured above
with an empty `HOME` (*Measured without a credential*). The empty `HOME` and working directory
also keep the service user's own skills out of the list the check reads. Adam accepted keeping
the check separate from #144's.

### No guard against a same-named skill

Adam accepted stopping an item whose repository ships a same-named skill, if that still applied
under `--plugin-dir`. It does not. The repository's `prose` loads as `prose`, beside
`igor:prose`, and replaces nothing. A step that needs the pinned skill asks for `igor:prose`, and
#153 grants its scripts by path under `<skills_dir>/skills`, so the repository's copy cannot run
its own scripts either. The same holds for a copy in the home directory.

### The pinned shared-skills commit is at or after `075a73a`

From shared-skills #19, merged as `075a73a` on 2026-10-11, every skill finds its scripts from
its base directory instead of a home-directory path. Task 0.1 measured that a plugin skill's
base directory is its path inside the plugin, `<skills_dir>/skills/<name>`. So at or after that
commit a skill runs the pinned scripts, under the path #153's grants name, and the worker needs
no instruction about where its skills are (task 4.1).

## How it composes

### With #153 (`signed-publishing`, branch `spec-signed-replies`)

- **#153 works per skill in a role's `skills` list.** A name in the list must be installed
  under `skills_dir`, or the role is refused at load; with `skills_dir` absent, any listed name
  is. This change states no second refusal.
- **`<skills>` in #153's design is `<skills_dir>/skills`.** A role that lists `prose` is granted
  `python3 <skills>/prose/scripts/prose.py check` and `… sign`, and Igor's code runs
  `prose start`, `verify-post` and `verify-staged` from the same place for it. A role that
  lists `bug-hunter` is granted `<skills>/bug-hunter/scripts/caller-result.sh` and `git add`. A
  step that names a skill names `igor:prose` or `igor:bug-hunter`.
- **A grant by path needs the model to use that path.** Task 0.1 found that a plugin skill is
  given `<skills_dir>/skills/<name>` as its base directory, the path the grants name.
- **Each step invokes its skills through the Skill tool**, as `igor:prose` or `igor:bug-hunter`,
  since no call passes `--bare`.
- **Hooks.** The install wires none, and the plugin declares none, so prose's first-write gate
  never runs in a worker. Igor's `prose start` (#153, item 1) still runs.
- **`prose start` writes its session mark** under `$XDG_STATE_HOME`, or `~/.local/state`
  without it, and the unit sets `ProtectHome=read-only`. That is for #153's task 0.5.

### With #144 (`--bare` as the default)

No call passes `--bare`, and nothing here changes how a seat authenticates. #144's risk stands:
if `--bare` becomes the default for `claude -p`, Igor must opt out explicitly, or every call
stops running as a seat.

### With #143 (`seat-from-stream`)

The seat probe is a `claude -p` and carries the flag like any other call. #143's switch of
triage to `stream-json --verbose` changes the output flags, not this one. One argument builder
for every call keeps the two from drifting (task 2.1).

`runUsage` in `src/budget.ts` reads a seat's `/usage`. #143 withdraws `igor observe` but keeps
this read. **Decided by Adam, 2026-10-17: it carries no `--plugin-dir`.** It runs no skill, so
the flag gives it nothing. And on a person's machine, where `igor budget` runs it, `skills_dir`
names a server path that does not exist there, and what `claude -p` does with a missing plugin
directory is unmeasured. It still passes `--setting-sources user` and `--strict-mcp-config`,
like every call.
