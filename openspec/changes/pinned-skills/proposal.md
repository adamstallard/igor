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
9. **Each worker run gets a fresh, empty home directory, removed after the run** (Adam,
   2026-10-17). Under #175 the worker user owns its home, so without this a worker an item
   steers could plant hooks, a `CLAUDE.md` or skills in `~/.claude` for every later worker.
10. **The usage read passes no `--plugin-dir`** (Adam, 2026-10-17). `igor budget` runs it on a
    person's machine, where `skills_dir` names a server path, and it runs no skill.
11. **Two facts the decisions rest on are measured before the implementation is built**
    (Adam, 2026-10-17, task 0.3): the base directory a skill is given when the manager installed it as a link into its
    clone, and that `--plugin-dir` gives the worker no write access to the skills. If a linked
    skill is given the clone's path, or the worker can write the skills, the choice of flag goes
    back to Adam.

**Still open:**

- **How decision 9 fits #175 and #153.** #175 lets `sudo` set the worker's `HOME` to the worker
  user's own home, and keeps git's `safe.directory` setting in that home's `~/.gitconfig`; that
  setting is how the worker's git trusts a tree the service user owns. #153 writes prose's
  session mark into the worker's `HOME` before the worker starts. A home the service user
  creates for each run is owned by the service user, holds no `~/.gitconfig` and has no mark,
  and #175 says only the worker user can remove what the worker writes. Who creates the home, who owns and removes it, and what may be placed
  in it before the worker starts are not decided.
- **Whether #153's model steps get the worker's fresh home.** #153 runs further `claude -p`
  steps in the same tree after the worker, and under #175 they run as the worker user too.
  Whether each starts with a fresh home, shares the worker's, or uses the worker user's own home
  is not decided. A step that shares the worker's home loads whatever the worker wrote to
  `~/.claude`. Because those steps may use the worker user's own home, task 5.3's note still
  tells the operator to keep that home clean.
- **A seat with no token source, and an org with no seats.** Such a worker runs on the host's
  own Claude login, stored under `HOME`. An empty home holds none, so under decision 9 that
  worker cannot authenticate. Is that accepted, or does such a worker keep a home with the
  login?
- **A worker in an empty home authenticating as its seat** is unmeasured (task 0.3). If it
  fails, decision 9 goes back to Adam.
- **A toolchain that reads its configuration from the home directory.** With decision 9, a
  worker's build or test starts with no `~/.gitconfig`, `~/.npmrc` or tool cache. The
  `task-execution` rule *A toolchain still runs* passes a home directory for such tools, and a
  repository whose tests need a file there now fails them. Is that accepted?

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
- **No call loads the worked repository's settings** (decision 8), **and each worker starts
  with an empty home** (decision 9). No call loads what a worker wrote to the repository's
  `.claude`, and no later worker loads what an earlier one wrote to its `~/.claude`.
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

Decision 9 does narrow a `task-execution` requirement: *The worker is given an explicit
environment* passes "a home directory", and that home becomes a new one per worker. The
narrowing is stated in `pinned-skills` instead of a modified block of that requirement, because
#175 and #171 both already modify it.

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
