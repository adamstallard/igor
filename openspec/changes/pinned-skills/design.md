## Context

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides that Igor loads its skills
from one pinned directory, passed to every `claude -p` with `--add-dir`, because `--bare` skips
skills in the home directory and is due to become the default for `-p` (#144). This design
records what a measurement showed about that mechanism, including where it contradicts the
issue, and how the change composes with #153, #144 and #143.

## Measured, 2026-10-11

Claude Code 2.1.296 on macOS. The scratch setup, under the job's temporary directory:

- a directory whose `.claude/skills/` held one plain skill, one skill linked by a relative
  symlink, a command under `.claude/commands/` and an agent under `.claude/agents/`;
- a second directory filled by the shared-skills manager (`skills.py install prose bug-hunter
  --no-hook` with `SHARED_SKILLS_TARGET` set), from a clone checked out at `6d0ae49`.

Every call ran under `env -i PATH=… HOME=…`, so no credential was present. **No API key was
available**, so no call reached a model. The `system/init` event arrives before authentication,
though, so loading could be measured without one. Each call ended `is_error: true`,
`Not logged in · Please run /login`, `total_cost_usd: 0`, exit 1.

| invocation | skills in `system/init` |
|---|---|
| `--bare --add-dir <dir>` | the two skills from `<dir>`, plus the built-in ones. No home skills. |
| `--bare` alone | the built-in skills only |
| `--add-dir <dir>`, no `--bare` | the home skills, the two from `<dir>`, and the built-in ones |
| `--bare --add-dir <manager-installed dir>` | `prose` and `bug-hunter`, through the manager's absolute symlinks |

### What the issue's design holds

- **`--bare` skips home skills, and `--add-dir` brings skills back.** `prose` and `bug-hunter`,
  installed in Adam's `~/.claude/skills`, were missing under `--bare`. Skills under the added
  directory loaded, including through a symlink. This matches the docs the issue quotes.
- **Under `--bare`, commands and agents in the added directory do not load.** Without `--bare`
  they do: `pinned-cmd` appeared in `slash_commands` and `pinned-agent` in `agents`.
- **A skill's scripts resolve their shared library through the link.** `prose.py` takes its
  directory from `Path(__file__).resolve()`, and bug-hunter's `caller-result.sh` from
  `cd -P "$(dirname "$0")"`. Run through the installed links, both worked: `caller-result.sh`
  printed a full result block.
- **The manager can install without hooks.** It has `install --no-hook`. And with
  `SHARED_SKILLS_TARGET` set but `SHARED_SKILLS_HOOK_HOME` unset, it wires no hooks anyway
  (`auto_enable_hooks`).
- **The `system/init` event lists loaded skills by name**, under `skills`. It is the first
  event, and it arrives even when the call then fails to authenticate. That is what makes the
  startup check free.

### What contradicts the issue

1. **"It works with or without `--bare`" holds for loading, but not for pinning.** Without
   `--bare`, a skill of the same name elsewhere takes precedence over the one in the added
   directory. Two cases were measured by reading the skill listing the session sends:
   - a `pinned-hello` in a temporary `HOME`'s `.claude/skills/`: the home copy's description was
     sent;
   - a `pinned-hello` in the working directory's `.claude/skills/`: the repository's copy was
     sent, also when the repository was itself passed with `--add-dir` ahead of the pinned
     directory.

   The `system/init` list shows the name once either way, so it cannot detect this. Under
   `--bare`, where a worker's own `--add-dir <cwd>` also loads the repository's skills, which
   copy wins is **not measured**: the listing is only sent once a call authenticates.
2. **The skills' own instructions point at the home directory.** Prose's `SKILL.md` defines its
   scripts directory as `~/.agents/skills/prose/scripts` or `~/.claude/skills/prose/scripts`.
   Bug-hunter's names `~/.agents/skills/bug-hunter/scripts/caller-result.sh`, then the
   `~/.claude` one. On an Igor server those paths are missing or, worse, an unpinned copy. A
   grant by path into the pinned directory, as #153 decides, would deny the command the skill
   tells the model to run.
3. **The issue's example path is writable by the service.** `deploy/igor.service` sets
   `ReadWritePaths=/srv/igor`, and `/srv/igor/skills` is under it. `--add-dir` grants tool
   access (`claude --help`: "Additional directories to allow tool access to"). Under the
   worker's `acceptEdits`, Igor measured before that a write under an added directory succeeds
   (`WorkerInput.outbox`, `src/execute.ts`). A worker an item steers could then rewrite
   `prose.py`, the script Igor's own code runs to verify that worker's signature.

### Measured, not taken: `--plugin-dir`

`claude -p --bare --plugin-dir <dir>`, with a `.claude-plugin/plugin.json` and
`skills/prose` linked to the installed skill, loaded the skill as `igor-pinned:prose`. A plugin
skill's name carries the plugin's name, so a same-named skill elsewhere cannot replace it, and
`--plugin-dir` grants no file access. The issue decided `--add-dir`, so this change follows it.
The PR raises the trade as a question.

## Decisions

### `skills_dir` is a key in `igor.config.yaml`, absolute

Token sources already name server paths there (`token_file`), so a server path in the team's
file is not new. It must be absolute: relative to the configuration, it would land in the lore
repository, which Igor writes to. The skills Igor expects are the ones installed there. There
is no second list to keep in step with the directory.

### The directory and its clone are read-only to Igor, checked at start

File ownership is the guard, because it holds against every route: a worker's Edit tool, a
Bash command it was granted, and Igor's own code. A `--disallowed-tools` rule covers only the
first. The deployment puts the directory and the shared-skills clone under `/opt/igor`, owned
by root. The unit's `ProtectSystem=strict` makes that path read-only to the service in any
case, and `ReadWritePaths=/srv/igor` does not reach it.

The check is `access(W_OK)` on `skills_dir`, on its `.claude/skills/`, and on each skill's
resolved directory. Root can write everywhere, so an Igor run as root with `skills_dir` set
refuses to start. The unit runs as `User=igor`.

### The startup check is a `--bare` call with no credential

The issue suggests reading the skill list from the `system/init` event of #144's startup
self-test. That self-test is not yet specified, it runs once per seat, and it runs without
`--bare`, because a seat token does not authenticate under `--bare`. The check here instead
runs once, with no seat, under `--bare`: the mode this change exists for. It lists exactly the
skills the added directory supplies, since `--bare` hides the home ones. Its failure to
authenticate is guaranteed, because `--bare` reads only `ANTHROPIC_API_KEY` or an
`apiKeyHelper`, and the environment holds neither.

Where #144's self-test lands later, it may read the same list from its own event. This check
does not depend on it.

### A same-named copy is refused, not ranked

Precedence is undocumented, unmeasured under `--bare`, and different without it, so Igor does
not try to arrange for the pinned copy to win. It refuses the two places a copy was measured to
win from:

- **The service user's home directory**, at start. That copy is a deployment mistake, and it
  affects every item.
- **The worked repository**, per item, before the worker spawns. The repository is the work,
  so Igor cannot remove the copy without publishing a deletion. The item stops with the reason
  instead.

Repository skills with other names are untouched. Igor's own repository ships four `openspec-*`
skills, none of which is a shared skill.

### The worker is told the pinned paths

Igor puts one paragraph in the worker's system prompt (task 5.1), naming
`<skills_dir>/.claude/skills` and telling it to use that in place of a home-directory path
from a skill's instructions. The lasting fix is upstream: a skill's instructions could take
its scripts directory from where Claude Code loaded the skill. The PR raises that as a question
for the shared-skills repository.

## How it composes

### With #153 (`signed-publishing`, branch `spec-signed-replies`)

- **`<skills>` in #153's design is `<skills_dir>/.claude/skills`.** Its grants are
  `python3 <skills>/prose/scripts/prose.py check`, `… sign`,
  `<skills>/bug-hunter/scripts/caller-result.sh` and `git add`. Its code runs `prose start`,
  `verify-post` and `verify-staged` from the same place.
- **A grant by path needs the model to use that path.** The system-prompt paragraph above makes
  it do so. Which directory Claude Code reports to the model when a skill loads, the link's or
  the resolved clone's, needs a model call to see. Task 0.1 measures it with an API key.
- **Hooks.** #153 notes that `--add-dir` loads a skill but not its hooks. This change installs
  none (`--no-hook`), so prose's first-write gate never runs in a worker. Igor's `prose start`
  (#153, item 1) still runs and costs one call.
- **Read-only directories.** `prose start` writes its session mark under `$XDG_STATE_HOME`, or
  `~/.local/state` without it, and the unit sets `ProtectHome=read-only`. That is for #153's
  task 0.5 to provide for. Nothing here writes there.

### With #144 (`--bare` as the default)

The flag works with and without `--bare`, so nothing here waits on the flip, and nothing here
changes how a seat authenticates. The pinning guards matter most before the flip, because
without `--bare` is where shadowing was measured.

### With #143 (`seat-from-stream`)

The seat probe is a `claude -p` and carries the flag like any other call, which is harmless: it
allows no tools. #143's switch of triage to `stream-json --verbose` changes the output flags,
not this one. One argument builder for every call keeps the two from drifting (task 2.1).
`runUsage` in `src/budget.ts` carries the flag while it exists; #143's gate two removes it.

## Not measured

- **Which copy wins under `--bare`** when the worked repository holds a same-named skill. The
  per-item guard stops the item either way, so the design does not depend on the answer.
- **Whether a skill runs, and which path Claude Code reports for it, under `--bare`.** That
  needs `ANTHROPIC_API_KEY`, which was not available. Task 0.1.
