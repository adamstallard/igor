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
9. **The worker runs in a home that lasts, and before each `claude -p` Igor resets its
   `~/.claude` and `~/.claude.json` from a built-in template** (Adam, 2026-10-17). With a worker
   user (#175), the home is that user's own. With none, Igor keeps one home per role under its
   state directory, such as `~/.local/state/igor/home/<role>`, and
   sets `HOME` to it; that is #175's same-user mode, `igor run`, where the worker runs as the
   user Igor runs as. The template ships with Igor and is nearly empty: a `settings.json` holding
   only what Igor needs, with no hooks and no MCP servers; no skills and no `CLAUDE.md`, since
   skills come from `--plugin-dir`; and a `~/.claude.json` with onboarding marked done and no MCP
   servers. The reset keeps `~/.claude/.credentials.json`, so an organization with no seats
   keeps working on the stored login. Nothing else in the home is reset, so `~/.gitconfig`
   (with #175's `safe.directory`) and the files a repository's tests cache there stay. Without
   the reset, a worker an item steers could plant hooks, a `CLAUDE.md` or skills for every later
   call. A file a run leaves elsewhere in the home, such as `~/.npmrc`, can steer later runs in
   that home. Adam accepted that: with a worker user, each instance has its own (#175), so such a
   file reaches no other instance, while in same-user mode it can reach other roles. *Rejected:*
   a fresh, empty home per run, which loses `~/.gitconfig` and the caches a repository's tests
   need; and resetting `~/.claude` alone, which left `~/.claude.json` for a worker to write.
10. **The usage read passes no `--plugin-dir`** (Adam, 2026-10-17). `igor budget` runs it on a
    person's machine, where `skills_dir` names a server path, and it runs no skill.
11. **Two facts the decisions rest on are measured before the implementation is built**
    (Adam, 2026-10-17, task 0.3): the base directory a skill is given when the manager installed it as a link into its
    clone, and that `--plugin-dir` gives the worker no write access to the skills. If a linked
    skill is given the clone's path, or the worker can write the skills, the choice of flag goes
    back to Adam.
12. **`skills_dir` is not configured in lore: Igor uses `/opt/igor/skills`, and `IGOR_SKILLS_DIR`
    in the server's environment overrides it** (Adam, 2026-10-17). `/opt/igor/skills` is where
    the deployment guide installs the plugin. Neither `igor.config.yaml` nor any other lore file
    has a `skills_dir` key, so a file that names one is refused by the strict unknown-key check,
    with no message of its own. *Rejected:* a key in `igor.config.yaml`, which any pull request
    to the lore repository could point at another directory.
13. **With a worker user, Igor kills every process that user owns before every reset** (Adam,
    2026-10-17), not only at the end of a task. Whether it kills them by user or by the user's
    systemd slice is the implementer's choice (Adam, 2026-10-17). A process that left its
    process group with `setsid()` survives #175's kill of the group, and could otherwise rewrite
    the home after a reset, including between the worker and #153's later steps. Same-user mode
    has no such guard: killing every process of the user Igor runs as would kill Igor itself
    and, under `igor run`, the person's own processes. It is a limit of same-user mode, which
    runs only on a developer's machine.
14. **#153's later model steps, the prose pass and the bug hunt, run in the worker's home, with
    the same reset before each `claude -p`** (Adam, 2026-10-17). #153's session mark is the
    file `prose start` writes, which #153's prose steps check for before they sign. `prose
    start` runs after the reset that precedes the worker's call, and the mark survives the
    resets before #153's later steps because it sits under `~/.local/state`, outside `~/.claude`
    and `~/.claude.json`.
15. **The in-force scenario *No state carries between tasks* is reworded** (Adam, 2026-10-17).
    Nothing a worker writes reaches a later task, except what lies outside decision 9's reset,
    and the scenario names those exceptions. `specs/task-execution/spec.md` is a MODIFIED delta.
16. **Same-user mode is `igor run` alone, so a home per role, rather than per rank, is enough**
    (Adam, 2026-10-17). #175 dropped `igor serve --same-user`, so no served rank uses a
    same-user home. Nor does one run under the systemd unit (`deploy/igor.service`), whose
    `ProtectHome=read-only` would make a home under `~/.local/state` unwritable. Two `igor run`s
    of one role at once would share that role's home, and one's reset could replace `~/.claude`
    under the other's running call. That is not decided separately: running `igor run` while
    another instance of its role runs is the subject of #179's open question on `igor run`
    beside a serving rank.
17. **The worker can read and overwrite the kept `~/.claude/.credentials.json`, and that is
    accepted** (Adam, 2026-10-17). With a worker user, that file is the worker user's own login,
    and the token of the seat a call spends is already in the worker's environment, so reading
    the file gives the worker nothing it lacks. In same-user mode it is the login of the user
    Igor runs as, whose files the worker can read anyway. This assumes the file holds the
    worker user's own login, which the open question on where the stored login comes from may
    change. `docs/deployment.md` says so (task 5.4).

**Still open:**

- **Where `/opt/igor/skills` does not exist**, as on a developer's machine running `igor run`,
  what Igor does is not decided: pass `--plugin-dir` anyway, pass none, or refuse to start. What
  `claude -p` does with a plugin directory that does not exist is unmeasured.
- **Where the stored login comes from.** The reset keeps `~/.claude/.credentials.json`, but a
  worker user's home, and a per-role home under the state directory, start without one. How the
  host's stored login reaches either is not decided. Decision 17 assumes the kept file is the
  worker user's own login. If the stored login reaches the home as a copy of the host's or an
  operator's login, the worker could read a credential besides its seat's, and decision 17 goes
  back to Adam.
- **Whether a seat's token in the environment takes precedence over a kept login** is not
  measured (task 0.3). Decision 17 accepts that a worker can rewrite the kept login. If the kept
  login takes precedence, a worker that rewrites it could make a seat's later calls bill a login
  it chose instead of the seat.
- **The template in same-user mode.** There the worker runs as the user that owns Igor's
  installation, so it can write the template, and #175's start check does not run. Whether
  anything protects the template there is not decided.
- **What the template's `settings.json` holds.** "Only what Igor needs" is the decision; the
  exact contents are not written yet (task 2.4).

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

- **`skills_dir` is `/opt/igor/skills`, or `IGOR_SKILLS_DIR` from the server's environment**
  (decision 12): an absolute path to a plugin directory whose `plugin.json` names the plugin
  `igor`. It holds
  `.claude-plugin/plugin.json` and the skills under `skills/`, installed by the shared-skills
  manager. Igor adds no installer.
- **Every `claude -p` Igor spawns carries `--plugin-dir <skills_dir>`**: the worker, triage, and
  every later step, never with `--bare`. The usage read is the one exception (decision 10).
  Each skill loads as `igor:<name>`, and the worker invokes it through the Skill tool. A skill
  named the same in the home directory or the worked repository loads under its own name beside
  it and cannot replace it (measured). Unlike `--add-dir`, the flag is not documented as
  granting file access, and task 0.3 measures whether it does (decision 11). Every installed
  skill loads for every role; a role's `skills` list (#153) decides what its worker
  uses and what Igor verifies.
- **No call loads the worked repository's settings** (decision 8), **and every call in the
  worker's home starts from a reset `~/.claude` and `~/.claude.json`** (decision 9). No call
  loads what a worker wrote to the repository's `.claude`, and no later call loads what an
  earlier one wrote to either. With a worker user, Igor kills every process that user owns
  before every reset (decision 13).
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

- `task-execution`: the scenario *No state carries between tasks* names what a worker's home
  keeps across tasks (decision 15).

The flags are added to calls owned by `task-execution` and `work-triage`, but the rules cover
every call, so they live in one place, `pinned-skills`.

## Impact

- `src/execute.ts` (`claudeWorker`, and the home and its reset), `src/triage.ts` (`runClaude`),
  `src/budget.ts` (`runUsage`), and `src/wiring.ts` for `skills_dir` and the startup check.
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
