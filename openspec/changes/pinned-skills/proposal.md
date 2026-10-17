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

**Still open:**

- **The worked repository's own settings.** Normal mode also loads the worked repository's
  `.claude/settings.json` (its permission allows and hooks), its `.mcp.json`, its skills and its
  `CLAUDE.md`. The worker can edit that repository. The `role-config` spec puts the commands a
  worker may run in the role file, not the repository, because "a worker that can edit files can
  edit a settings file in the repository it is working". Decision 6 covers the two users, not
  the repository. Should every call exclude the
  repository's settings (for example `--setting-sources user` and `--strict-mcp-config`, which
  task 0.3 would measure), or is this accepted?
- **The worker's own `~/.claude`.** Under #175 the worker user owns and writes its home, so a
  worker an item steers can plant hooks, a `CLAUDE.md` or skills there for every later worker.
  Task 5.3's note cannot keep that home clean. Should the worker's `~/.claude` be unwritable to
  it, or replaced for each run?
- **`--plugin-dir` on a person's machine.** `igor budget` runs `runUsage` on a person's machine
  with the team's `igor.config.yaml`, whose `skills_dir` names a server path. As specified, the
  usage read carries the flag. Should a usage read, which runs no skill, be exempt? What `claude` does with a missing plugin directory
  is unmeasured (task 0.3).
- **Two facts the decisions rest on are unmeasured** (task 0.3). The manager installs each skill
  as a link into its clone, and #153's grants assume the model is given the link's path as the
  skill's base directory; task 0.1's canary may have been a plain directory. And `--plugin-dir`
  is assumed to give the worker no write access to the skills, from the help text alone.

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
  every later step, never with `--bare`. Each skill loads as `igor:<name>`, and the worker
  invokes it through the Skill tool. A skill named
  the same in the home directory or the worked repository loads under its own name beside it
  and cannot replace it (measured). Unlike `--add-dir`, the flag is not documented as granting
  file access, and task 0.3 measures whether it does. Every
  installed skill loads for every role; a role's `skills` list (#153) decides what its worker
  uses and what Igor verifies.
- **Before its first model call, Igor confirms each installed skill loads.** It reads the skill
  list from the `system/init` event of a `claude -p` call with no token and an empty `HOME`.
  That call fails to authenticate, at no cost, after printing the event.
- **The pinned shared-skills commit is at or after `075a73a`** (shared-skills #19), where every
  skill finds its scripts from its base directory, `<skills_dir>/skills/<name>`. The manager
  installs each skill as a link into its clone, and that base directory was measured on a skill
  that may not have been a link (task 0.3).

## Capabilities

### New Capabilities

- `pinned-skills`: where Igor's skills come from, how every model call loads them, and the
  check that they load.

### Modified Capabilities

None. The flag is added to calls owned by `task-execution` and `work-triage`, but neither
capability's requirements change. The rule covers every call, so it lives in one place.

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
