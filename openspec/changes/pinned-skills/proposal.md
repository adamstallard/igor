## Decisions

1. **Skills load with `--plugin-dir <skills_dir>`** (Adam, 2026-10-11). *Rejected:* `--add-dir`,
   the issue's choice: a same-named skill in the home directory or the worked repository
   replaced the pinned one, and it gave the worker write access to the skills (`design.md`).
2. **Igor never passes `--bare`** (Adam, 2026-10-11). Under `--bare` a seat's setup-token runs as
   an API key and emits no `rate_limit_event`. #143's reserve line reads a seat's fullness from
   that event, so such a call is not read as a seat, and what it is billed against is unknown.
3. **The plugin is named `igor`** (Adam, 2026-10-11), so skills load as `igor:prose` and
   `igor:bug-hunter`.
4. **The pinned shared-skills commit is at or after `075a73a`** (Adam, 2026-10-11), where every
   skill finds its scripts from its base directory. *Rejected:* a line in the worker's system
   prompt telling it where the pinned skills' scripts are.
5. **The startup check is a call with no token, separate from #144's self-test** (Adam,
   2026-10-11). It runs once, with no seat.
6. **No guard against a same-named skill, and no startup check of the service user's hooks,
   `CLAUDE.md` or home skills** (Adam, 2026-10-11). A same-named skill loads under its own name
   beside `igor:<name>` and replaces nothing. `docs/deployment.md` tells the operator to keep
   the service user and the worker user (#175) free of hooks, a `CLAUDE.md` and home skills
   (task 5.3).
7. **One plugin directory for every role.** The coordinating agent chose this on 2026-10-11, for
   Adam to overrule. *Rejected:* a plugin directory per role, which is one directory per distinct
   list to install, pin and check.
8. **Every call excludes the worked repository's own settings** (Adam, 2026-10-17): its
   `.claude/settings.json` (permission allows and hooks), `.mcp.json`, skills and `CLAUDE.md`.
   The worker can edit that repository, and the `role-config` spec keeps the commands a worker
   may run out of it because "a worker that can edit files can edit a settings file in the
   repository it is working". The means is `--setting-sources user` and `--strict-mcp-config`
   on every call, once task 0.3 confirms that those flags keep all four out; if they do not,
   the means goes back to Adam and the rule stands.
9. **Before each worker run, Igor resets the worker user's `~/.claude`, and only that** (Adam,
   2026-10-17, narrowing the same day's decision of a fresh, empty home per run). Under #175
   the worker user owns its home, so without a reset a worker an item steers could plant hooks,
   a `CLAUDE.md` or skills in `~/.claude` for every later worker. Igor recreates `~/.claude`
   from a clean template that Igor owns and the worker user cannot write, before every
   `claude -p` it starts as the worker user: the worker, and each of #153's later model steps
   in the worker's working tree. The rest of the home persists across runs, so `~/.gitconfig`
   with #175's `safe.directory` setting, #153's session mark (the file `prose start` writes under `~/.local/state`, which #153's prose steps check for), and tool caches such
   as `~/.cache` stay. A file a run leaves elsewhere in the home, such as `~/.npmrc`, can steer
   later runs of the same instance. Adam accepted that risk within one instance; #175 gives each
   Igor instance its own worker user, so such a file reaches no other instance. *Rejected:* a
   fresh, empty home per run, which lost `~/.gitconfig`, #153's session mark and the caches a
   repository's tests need.
10. **The usage read passes no `--plugin-dir`** (Adam, 2026-10-17). `igor budget` runs it on a
    person's machine, where `skills_dir` names a server path, and it runs no skill.
11. **Two facts the decisions rest on are measured before the implementation is built**
    (Adam, 2026-10-17, task 0.3): the base directory a skill is given when the manager installed it as a link into its
    clone, and that `--plugin-dir` gives the worker no write access to the skills. If a linked
    skill is given the clone's path, or the worker can write the skills, the choice of flag goes
    back to Adam.

**Still open:**

- **The home of a worker that runs as the service user Igor runs as.** Decision 9 resets the worker
  user's `~/.claude`. Under #175's same-user mode (`igor run`, and `igor serve --same-user`)
  there is no worker user, and the worker's home is the person's or the service user's own.
  Whether anything is reset there, or the worker gets another home, is not decided.
- **A worker on a stored login.** An organization that declares no seats, and, until #171 is
  built, a seat that names no token, run their workers on a Claude login stored in the home,
  not on a seat token in the environment. On Linux Claude Code keeps that login in
  `~/.claude/.credentials.json`. Decision 9's reset removes it before every run, so such a
  worker cannot authenticate as the worker user, unless the template holds a login. Whether
  that is accepted, or how such a worker authenticates, is not decided.
- **The template.** Decision 9 says Igor owns it and the worker user cannot write it. Where it
  lives, how Igor finds it, what it holds, and whether #175's start check probes that the worker
  cannot write it are not decided (task 2.3).
- **A worker process that outlives its run.** #175 accepts that a process which leaves its
  process group with `setsid()` survives #175's kill of the run's process group. It runs as the worker user, so it can rewrite
  `~/.claude` after the reset and before the next call. Whether the reset must first end every
  process of the worker user, or decision 9's guarantee is narrowed, is not decided.
- **`~/.claude.json`.** Claude Code keeps per-user and per-project state in `~/.claude.json`,
  outside `~/.claude`, so the reset leaves it and a worker can write it. Whether normal mode
  takes anything from it that steers a call, beyond the MCP servers `--strict-mcp-config`
  ignores, is unmeasured (task 0.3).

## Why

Igor's model steps run skills: #153 (`signed-publishing`) has a worker run `prose` and
`bug-hunter`. Today `claude -p` finds skills only in the service user's `~/.claude/skills`, at
whatever version was last installed there, and a same-named skill in the worked repository
runs in its place.

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides the fix: Igor loads its
skills from one pinned directory that it names on every call, holding a copy of the shared
skills changed only on purpose. The issue named the directory with `--add-dir`; decision 1
replaces it.

## What Changes

- **`skills_dir` in `igor.config.yaml`**: an absolute path to a plugin directory named `igor`.
  It holds `.claude-plugin/plugin.json` and the skills under `skills/`, installed by the
  shared-skills manager. Igor adds no installer.
- **Every `claude -p` Igor spawns carries `--plugin-dir <skills_dir>`**: the worker, triage, and
  every later step, never with `--bare`. The usage read is the one exception (decision 10).
  Each skill loads as `igor:<name>`, and the worker invokes it through the Skill tool. A skill
  named the same in the home directory or the worked repository loads under its own name beside
  it and cannot replace it (measured). Unlike `--add-dir`, the flag is not documented as
  granting file access, and task 0.3 measures whether it does (decision 11). Every installed
  skill loads for every role; a role's `skills` list (#153) decides what its worker
  uses and what Igor verifies.
- **No call loads the worked repository's settings** (decision 8), **and each run as the
  worker user starts with a clean `~/.claude`** (decision 9). No call loads what a worker wrote
  to the repository's `.claude`, and no later run loads what an earlier one wrote to its
  `~/.claude`.
- **Before its first model call, Igor confirms each installed skill loads.** It reads the skill
  list from the `system/init` event of a `claude -p` call with no token and an empty `HOME`.
  That call fails to authenticate, at no cost, after printing the event.
- **The pinned shared-skills commit is at or after `075a73a`** (shared-skills #19), where every
  skill finds its scripts from its base directory, `<skills_dir>/skills/<name>`. The manager
  installs each skill as a link into its clone, and that base directory was measured on a skill
  that may not have been a link (decision 11).

## Capabilities

### New Capabilities

- `pinned-skills`: where Igor's skills come from, how every model call loads them, and the
  check that they load.

### Modified Capabilities

None as deltas. The flags are added to calls owned by `task-execution` and `work-triage`, and
the rules cover every call, so they live in one place, `pinned-skills`.

Decision 9 does not change the home directory that `task-execution`'s *The worker is given an
explicit environment* passes: under #175 that is still the worker user's own, and only its
`~/.claude` is reset.

## Impact

- `src/config.ts`, `src/execute.ts` (`claudeWorker`), `src/triage.ts` (`runClaude`),
  `src/budget.ts` (`runUsage`), and `src/wiring.ts` for the startup check.
- **#153** depends on this change. Its `<skills>` is `<skills_dir>/skills`, where it grants its
  scripts by path and its code runs `prose verify-post` and `verify-staged`. Its role-config
  requirement refuses a role that lists a skill not installed under `skills_dir`; this change
  refuses nothing on that account.
- **#143's seat probe and #144's startup check** are `claude -p` calls, so they carry the flag.
  The skills check here uses no seat, so it neither depends on them nor duplicates them.
- `docs/deployment.md` gains the install procedure: a root-owned plugin directory outside the
  service's writable paths, filled by the manager from a clone at a fixed commit.
- **#144's risk stands:** if `--bare` becomes the default for `claude -p`, Igor must opt out
  explicitly.
