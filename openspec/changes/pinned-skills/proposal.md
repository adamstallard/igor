## Why

Igor's model steps are about to run skills: #153 (`signed-publishing`) has a worker run `prose`
and `bug-hunter`. Today `claude -p` finds skills in the service user's `~/.claude/skills`, but
`--bare` skips that directory, and `--bare` is due to become the default for `-p` (#144). On
that day every skill would stop loading, silently.

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides the fix. Igor loads its
skills from one directory it names with `--add-dir`, which `--bare` still reads skills from.
That directory holds a pinned copy of the shared skills, changed only on purpose.

## What Changes

- **`skills_dir` in `igor.config.yaml`**: an absolute path whose `.claude/skills/` holds the
  installed skills. The shared-skills manager installs them there; Igor adds no installer.
- **Every `claude -p` Igor spawns carries `--add-dir <skills_dir>`**: the worker, triage, and
  every later step, with or without `--bare`.
- **Igor refuses to start where it could change its own skills**, that is, where the
  directory, or a skill's files, are writable by the user Igor runs as. `--add-dir` grants a
  worker edit access to everything under the directory.
- **Before its first model call, Igor confirms each installed skill loads under `--bare`.** It
  reads the skill list from the `system/init` event of a `claude -p --bare` call that holds no
  credential. That call fails to authenticate, at no cost, after printing the event.
- **A pinned skill cannot be replaced by a copy with the same name.** Without `--bare`, a
  same-named skill in the home directory or in the worked repository takes precedence
  (measured). Igor refuses to start on the first, and stops the item on the second.
- **The worker is told where its skills are.** The skills' own instructions name paths in the
  home directory, which are not the pinned copies.

## Capabilities

### New Capabilities

- `pinned-skills`: where Igor's skills come from, how every model call loads them, and the
  checks that the pinned copies are the ones that run.

### Modified Capabilities

None. The flag is added to calls owned by `task-execution` and `work-triage`, but neither
capability's requirements change. The rule covers every call, so it lives in one place.

## Impact

- `src/config.ts`, `src/execute.ts` (`claudeWorker`), `src/triage.ts` (`runClaude`),
  `src/budget.ts` (`runUsage`), and `src/wiring.ts` for the startup checks.
- **#153** depends on this change. It grants its scripts by path under
  `<skills_dir>/.claude/skills`, and its code runs `prose verify-post` and `verify-staged` from
  there.
- **#143's seat probe and #144's startup check** are `claude -p` calls, so they carry the flag.
  The skills check here uses no seat, so it neither depends on them nor duplicates them.
- `docs/deployment.md` gains the install procedure: a root-owned directory outside the
  service's writable paths, filled by the manager from a clone at a fixed commit.
