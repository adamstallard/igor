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

### `skills_dir` is `/opt/igor/skills`, overridden only by the server's environment

**Decided by Adam, 2026-10-17.** `skills_dir` is not a key in `igor.config.yaml` or in any other
lore file. Igor uses `/opt/igor/skills`, the path where the deployment guide installs the plugin,
and `IGOR_SKILLS_DIR` in the environment Igor starts with overrides it. The lore repository is
shared and changed by pull request, so a key there would let any merged pull request point every
Igor at another directory of skills, the same reason #175 keeps its worker user out of
`igor.config.yaml`. A lore file that names `skills_dir` is refused by the strict unknown-key
check, with no message of its own. `IGOR_SKILLS_DIR` must be absolute, so it never depends on the
directory Igor starts in. Which skills Igor expects is read from the directory itself: every
entry under `<skills_dir>/skills/`.

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
`CLAUDE.md` or home skills. Two decisions of 2026-10-17, below, keep the repository's files out
of every call and reset the worker's `~/.claude` and `~/.claude.json` before each call in its
home.

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

**Decided by Adam, 2026-10-17: the worker runs in a home that lasts, and before each
`claude -p` there Igor resets `~/.claude` and `~/.claude.json` from a built-in template.**
`--setting-sources user` still loads the user's settings, skills and `CLAUDE.md` from
`~/.claude`, and the worker writes its home, so
without a reset a worker an item steers could plant hooks, a `CLAUDE.md`, skills or an MCP server
for every later call. Task 5.3's note to the operator cannot stop that; the reset can.

Which home:

- **With a worker user (#175):** that user's own home, `/var/lib/igor-worker-<role>-<rank>`,
  where `<rank>` numbers the instances of one role (#179).
- **Without one:** one home per role under Igor's state directory, such as `~/.local/state/igor/home/<role>`, which
  Igor sets as the worker's `HOME`. That is #175's same-user mode, `igor run`, where the worker
  runs as the user Igor runs as. The worker then never loads the `~/.claude` of the user Igor
  runs as, whether that is the service user or a person running `igor run` on their own
  machine.

What the template holds. It ships with Igor, in its installation, which #175's start check
confirms the worker user cannot write:

- a `settings.json` with only what Igor needs: no hooks, no MCP servers;
- no skills and no `CLAUDE.md`, since skills come from `--plugin-dir`;
- a `~/.claude.json` with onboarding marked done and no MCP servers.

How the reset works:

- **When:** before every `claude -p` Igor starts in the worker's home. Those calls are the
  worker and #153's later model steps (the prose pass and the bug hunt), which run in the same
  home. #153's session mark is the file `prose start` writes, which #153's prose steps check for
  before they sign. `prose start` runs after the reset that precedes the worker's call, and the
  mark sits under `~/.local/state`, outside what any later reset replaces.
- **Who:** with a worker user, Igor resets as that user, through #175's `sudo` spawn, since only
  that user can remove what a worker wrote. In same-user mode Igor resets as itself.
- **What it keeps:** `~/.claude/.credentials.json`, so an organization with no seats keeps
  working on a stored login. A seat's token reaches `claude` through its environment, which the
  reset does not touch. Task 0.3 is to confirm that a call made after the reset still
  authenticates with the token. The worker can read and overwrite the kept file, and Adam
  accepted that (2026-10-17): with a worker user it is that user's own login, and the seat's
  token is already in the worker's environment, so reading it gives nothing new. In same-user
  mode it is the login of the user Igor runs as, whose files the worker can read anyway. Both
  assume the file holds the home user's own login, which the open question on where the stored
  login comes from may change.
- **What persists:** everything else in the home: `~/.gitconfig`, where #175's start check sets
  `safe.directory` so the worker's git trusts a tree the service user owns, and the files a
  repository's tests cache in the home. A file a run leaves there, such as `~/.npmrc`, can steer
  later runs in that home. Adam accepted that; with a worker user, #175 gives each instance its
  own, so such a file reaches no other instance. In same-user mode every worker runs as one user
  and can write every role's home, so such a file can reach other roles.

The same decision first gave each worker a fresh, empty home per run, then narrowed it to a reset
of `~/.claude` alone. An empty home lost `~/.gitconfig` and the caches a repository's tests need;
`~/.claude` alone left `~/.claude.json` for a worker to write.

**Decided by Adam, 2026-10-17: with a worker user, Igor kills every process that user owns before
every reset**, by user or by the user's systemd slice, as the implementer chooses. A process
that leaves its process group
with `setsid()` survives #175's kill of the group, and running as the worker user it could
rewrite the home after a reset. Killing before every reset, rather than at the end of the task,
also covers the gap between the worker and #153's later steps. Same-user mode has no such kill,
since killing every process of the user Igor runs as would kill Igor and, under `igor run`, the
person's own processes. There an escaped process can rewrite the home after any reset; that is a
limit of same-user mode, which runs only on a developer's machine.

**Same-user mode is `igor run` alone (Adam, 2026-10-17).** #175 dropped `igor serve --same-user`,
so no served rank shares a per-role home. Nor does one run under the systemd unit
(`deploy/igor.service`), whose `ProtectHome=read-only` would make a home under `~/.local/state`
unwritable. Two `igor run`s of one role at once share the role's home, and one's reset can
replace `~/.claude` under the other's call. That is not decided separately: running `igor run`
while another instance of its role runs is the subject of #179's open question on `igor run`
beside a serving rank.

Still open (proposal): the template in same-user mode; how a stored login reaches a home that
starts without one; whether a seat's token takes precedence over a kept login; and what the template's
`settings.json` holds.

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
  under `skills_dir`, or the role is refused at load. This change states no second refusal.
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
  without it. #153's prose steps run as the worker and look for the mark in their own home. So
  `prose start` runs as the worker, after the reset, and the mark sits in the worker's own home
  (decided by Adam, 2026-10-17, on #175).

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
