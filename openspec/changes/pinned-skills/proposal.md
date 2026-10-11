## Why

Igor's model steps run skills: #153 (`signed-publishing`) has a worker run `prose` and
`bug-hunter`. Today `claude -p` finds skills in the service user's `~/.claude/skills`, but
`--bare` skips that directory, and `--bare` is due to become the default for `-p` (#144). On
that day every skill would stop loading, silently.

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides the fix: Igor loads its
skills from one pinned directory that it names on every call, holding a copy of the shared
skills changed only on purpose. The issue named the directory with `--add-dir`; Adam chose
`--plugin-dir` instead on #174, after the measurement in `design.md`.

## What Changes

- **`skills_dir` in `igor.config.yaml`**: an absolute path to a plugin directory named `igor`.
  It holds `.claude-plugin/plugin.json` and the skills under `skills/`, installed by the
  shared-skills manager. Igor adds no installer.
- **Every `claude -p` Igor spawns carries `--plugin-dir <skills_dir>`**: the worker, triage, and
  every later step, with or without `--bare`. Each skill loads as `igor:<name>`. A skill named
  the same in the home directory or the worked repository loads under its own name beside it
  and cannot replace it, and the flag gives the worker no file access (measured). Every
  installed skill loads for every role; a role's `skills` list (#153) decides what its worker
  uses and what Igor verifies.
- **Before its first model call, Igor confirms each installed skill loads under `--bare`.** It
  reads the skill list from the `system/init` event of a `claude -p --bare` call that holds no
  credential. That call fails to authenticate, at no cost, after printing the event.
- **The worker is told where its skills are**, as a fallback until the shared skills find their
  scripts from the directory they were loaded from. Their instructions name home-directory
  paths today.

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
  scripts by path and its code runs `prose verify-post` and `verify-staged`.
- **#143's seat probe and #144's startup check** are `claude -p` calls, so they carry the flag.
  The skills check here uses no seat, so it neither depends on them nor duplicates them.
- `docs/deployment.md` gains the install procedure: a root-owned plugin directory outside the
  service's writable paths, filled by the manager from a clone at a fixed commit.
- **Under `--bare`, a skill runs only when a call opens with `/igor:<name>`** (task 0.1): the
  model has no Skill tool there. Igor then runs each skill as its own step. Whether Igor passes
  `--bare` at all is open, with Adam.
