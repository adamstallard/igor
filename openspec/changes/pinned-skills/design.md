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
- **The base directory is the plugin's**, `<skills_dir>/skills/<name>`, not a resolved clone.
  So #153's grants under `<skills_dir>/skills` match the path the model is given. The setup does
  not say whether `canary` was a symlink, as the manager installs; if it was a plain directory,
  a link's reported path is the one point still unmeasured.
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
- **`--plugin-dir` grants no file access.** `claude --help` describes `--add-dir` as
  "Additional directories to allow tool access to"; `--plugin-dir` only loads a plugin.

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
  `~/.claude` one. On an Igor server those paths are missing or hold an unpinned copy.

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

Without `--bare`, a call also loads the service user's hooks, its `CLAUDE.md` and its home
skills (`~/.claude/skills`), and the worked repository's own `.claude` settings, skills and
`CLAUDE.md`. Namespacing keeps every `igor:<name>` skill from being replaced (measured), but the
rest still reaches the worker. A dedicated Igor server's service user has none of the first
three, and nor does the separate worker user of #175. Whether Igor should check that at start is
a question in the PR; the spec does not require it.

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

### The worker is told the pinned paths, until the skills find their own

The worker's system prompt names `<skills_dir>/skills` and tells it to use that in place of a
home-directory path from a skill's instructions (task 4.1). A shared-skills change, in progress,
makes each skill find its scripts from the directory it was loaded from. Once the pinned commit
includes it, the paragraph and its requirement are removed (task 4.3).

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
for every call keeps the two from drifting (task 2.1). `runUsage` in `src/budget.ts` carries the
flag while it exists; #143's gate two removes it.
