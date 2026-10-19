## Decisions

1. **Skills load with `--plugin-dir <skills_dir>`** (Adam, 2026-10-11). *Rejected:* `--add-dir`,
   which issue #152 chose: a same-named skill in the home directory or the worked repository
   replaced the pinned one, and it gave the worker write access to the skills (`design.md`).
2. **Igor never passes `--bare`** (Adam, 2026-10-11). Under `--bare` a seat's setup-token runs as
   an API key and emits no `rate_limit_event`. #143's budget gate reads how full a seat is from
   that event, so such a call is not read as a seat, and what it is billed against is unknown.
3. **The plugin is named `igor`** (Adam, 2026-10-11), so skills load as `igor:prose` and
   `igor:bug-hunter`.
4. **The pinned shared-skills commit is at or after `075a73a`** (Adam, 2026-10-11), where every
   skill finds its scripts from its base directory. *Rejected:* a line in the worker's system
   prompt telling it where the pinned skills' scripts are.
5. **The startup check is an ordinary call that spends a seat through the budget gate,
   separate from the startup self-test #144 proposes to run once per seat** (Adam, 2026-10-11;
   amended 2026-10-18). It runs once per start, on the seat the gate chose for Igor's first
   model call. That it authenticates also shows the seat's token works. The gate still chooses
   the seat of every call but two: #143's seat probe and the usage read, each of which spends
   the seat it is reading about. Where the gate names no seat at start, Igor starts, runs its
   cycles without a model call, and runs the check before its first one; if that check fails,
   the running process exits with status 78 then. *Rejected:* a call with no token, which
   printed the skill list and then failed to authenticate, at no cost. It needed an exception
   from #171's *A spend with no seat behind it is not made*, and a call with no token uses and
   rewrites a stored login where it finds one (measured 2026-10-18, `design.md`).
6. **No guard against a same-named skill, and no startup check of the service user's hooks,
   `CLAUDE.md` or home skills** (Adam, 2026-10-11). A same-named skill in the home loads under
   its own name beside `igor:<name>`; one in the worked repository does not load at all
   (decision 8, measured 2026-10-18). `docs/deployment.md` tells the operator to keep the service
   user and the worker user (#175) free of hooks, a `CLAUDE.md` and home skills (task 5.3).
7. **One plugin directory for every role.** The coordinating agent chose this on 2026-10-11, for
   Adam to overrule. *Rejected:* a plugin directory per role, which is one directory per distinct
   `skills` list among the roles (#153), each to install, pin and check.
8. **Every call excludes the worked repository's own settings, with `--setting-sources user` and
   `--strict-mcp-config`** (Adam, 2026-10-17). The settings are the repository's
   `.claude/settings.json` (permission allows and hooks), `.mcp.json`, skills and `CLAUDE.md`.
   The worker can edit that repository, and the `role-config` spec keeps the commands a worker
   may run out of it because "a worker that can edit files can edit a settings file in the
   repository it is working". Measured on 2026-10-18: the two flags keep all four out, with or
   without `--add-dir <tree>`, and the repository's local settings, `CLAUDE.local.md`, nested
   `CLAUDE.md` files, commands and agents too.
9. **The worker runs in a home that lasts, and before each `claude -p` Igor resets its `~/.claude`
   and `~/.claude.json` from a built-in template** (Adam, 2026-10-17). With a worker user (#175),
   the home is that user's own. With none, Igor keeps one home per role under its state directory,
   such as `~/.local/state/igor/home/<role>`, and sets `HOME` to it; that is #175's same-user
   mode, `igor run`, where the worker runs as the user Igor runs as. The template ships with Igor
   and is nearly empty (task 2.4). The reset keeps nothing of what it replaces, a stored login
   included (decision 17). Nothing else in the home is reset, so `~/.gitconfig` (with #175's
   `safe.directory`) and the files a repository's tests cache there stay. Without the reset, a
   worker steered by an item's text could plant hooks, a `CLAUDE.md` or skills for every later
   call. A file a run leaves elsewhere in the home, such as `~/.npmrc`, can steer later runs in
   that home. Adam accepted that: with a worker user, each instance has its own home (#175), so
   such a file reaches no other instance, while in same-user mode it can reach other roles.
   *Rejected:* a fresh, empty home per run, which loses `~/.gitconfig` and the caches a
   repository's tests need; and resetting `~/.claude` alone, which leaves `~/.claude.json` for a
   worker to write.
10. **The usage read passes no `--plugin-dir`** (Adam, 2026-10-17). It runs no skill. `igor
    serve` runs it in the budget gate, and `igor budget` runs it too, often on a person's
    machine, where `skills_dir` names a server path.
11. **Two facts the flag rests on were measured before anything is built** (Adam, 2026-10-17,
    task 0.3): a skill the manager installed as a link is given its path under the plugin
    directory, not the clone's, and `--plugin-dir` gives the worker no write access to the
    skills. Both held on 2026-10-18, so decision 1 stands.
12. **`skills_dir` is not configured in lore: Igor uses `/opt/igor/skills`, and `IGOR_SKILLS_DIR`
    in the server's environment overrides it** (Adam, 2026-10-17). `/opt/igor/skills` is where the
    deployment guide installs the plugin. Neither `igor.config.yaml` nor any other lore file has a
    `skills_dir` key, so a file that names one is refused by the strict unknown-key check, with
    the error any unknown key gets, not one about `skills_dir`. *Rejected:* a key in
    `igor.config.yaml`, which any pull request to the lore repository could point at another
    directory.
13. **With a worker user, Igor kills every process that user owns before every reset** (Adam,
    2026-10-17), not only at the end of a task. Whether it kills them by user or by the user's
    systemd slice is the implementer's choice (Adam, 2026-10-17). A process that left its
    process group with `setsid()` outlives a kill of the group, and could otherwise rewrite the
    home after a reset, including in the gap between the worker and the model steps of #153
    that follow it (decision 14). #175 measured on
    2026-10-18 that Claude Code starts each Bash command in a new session, so every command a
    worker runs has left the group: a kill of the group did not end `npm test`, and a kill of
    every process the worker user owns did. Same-user mode has no such
    guard: killing every process of the user Igor runs as would kill Igor itself and, under
    `igor run`, the person's own processes. It is a limit of same-user mode, which runs only on a
    developer's machine.
14. **#153's later model steps, the prose pass and the bug hunt, run in the worker's home, with
    the same reset before each `claude -p`** (Adam, 2026-10-17). Prose's first call, which prints
    the rules and issues the token that prose's signing call later checks, is Igor's own and runs
    as the service user (Adam, 2026-10-18, on #153), so nothing of prose's is written in the
    worker's home and the reset has nothing of it to keep.
15. **The in-force scenario *No state carries between tasks* is reworded** (Adam, 2026-10-17).
    Nothing a worker writes reaches a later task, except what lies outside decision 9's reset,
    and the scenario names those exceptions. `specs/task-execution/spec.md` is a MODIFIED delta.
16. **Same-user mode is `igor run` alone, so one home per role is enough** (Adam, 2026-10-17).
    Under #179 a role runs as several processes, each numbered by its rank, and the home need not
    be per rank. #175 has no `igor serve --same-user`, so no served rank uses a same-user home.
    Nor does same-user mode run under the systemd unit (`deploy/igor.service`), whose
    `ProtectHome=read-only` would make a home under `~/.local/state` unwritable. Under #179,
    `igor run` is rank 0, outside the roster (the list of ranks a role's serving processes run),
    and runs beside serving ranks with no refusal and no wait (Adam, 2026-10-18). A serving rank
    never uses the per-role home, so a run beside one shares no home with it.
17. **The reset keeps no stored login, because Igor never uses one** (Adam, 2026-10-18). Every
    seat has a Claude token, and every call that spends a seat authenticates with that seat's
    token, from its environment, under `igor serve` and `igor run` alike. Under `igor run` the
    seat is an implicit local seat that needs no seat file, and its token is the one in
    `IGOR_RUN_TOKEN` (Adam, 2026-10-18). #171 states both rules, in *A spend with no seat behind
    it is not made* and *`igor run` spends its own token as an implicit local seat*; this change
    applies them to the worker's home. The reset replaces `~/.claude` whole,
    `~/.claude/.credentials.json` with it. Under `igor run`, Igor neither hides nor refuses a
    login the developer keeps where setting `HOME` does not move it, such as the macOS
    Keychain; if Claude Code
    ever prefers it to the token, `run` spends the developer's own login, and that is accepted
    (Adam, 2026-10-18). Measured on 2026-10-18 (Claude Code 2.1.303): a valid token wins over a
    stored login in the home or the Keychain, and an invalid token fails rather than falling
    back to one. *Rejected:* keeping `~/.claude/.credentials.json`, so that an organization with
    no seats could run on a stored login. That leaves open where a worker user's login would
    come from, and lets a worker rewrite a login that later calls might use. An organization
    with no seats instead adds one seat, from a token of its own (#171).
18. **The startup check runs on haiku, with `--model haiku`** (Adam, 2026-10-18). With no
    `--model` it ran on sonnet, at $0.026 a start against about $0.001 on haiku (measured
    2026-10-18). The check reads only the skill list, which does not depend on the model.
19. **Six smaller choices, made by the agents that wrote this change, for Adam to accept or
    overrule:** a relative `IGOR_SKILLS_DIR` refuses the start; the skills Igor expects are every
    entry under `<skills_dir>/skills/`, not a list of its own; a skill whose commit cannot be read
    is reported as not checked, and the start goes on; Igor reports each skill's commit but does
    not refuse one older than decision 4's `075a73a`; Igor trusts a skill's clone for that read
    only when root owns it, since trusting a clone turns off git's guard against running
    configuration another user controls, and turns git's file-system monitor off for that read;
    and the start is refused when `skills_dir` holds anything but `plugin.json` and `skills/`, so
    the plugin cannot add a hook, an MCP server, a command or an agent to every call.

**Still open:**

- **Where `/opt/igor/skills` does not exist**, as on a developer's machine running `igor run`,
  what Igor does is not decided: pass `--plugin-dir` anyway, pass none, or refuse to start. The
  requirement as written refuses to start, under `igor serve` and `igor run` alike, since a
  check with no skill to check must not pass. What `claude -p` does with a plugin directory that
  does not exist is unmeasured.
  *Recommendation:* `igor serve` refuses to start, naming the path; `igor run` passes none and
  says the skills were not loaded.
- **Citations ahead of the archive order.** This change cites #171's *A spend with no seat
  behind it is not made*, #82's *A process that refuses to start exits with status 78*, #179's
  ranks, and #153's `skills` list, prose pass and bug hunt, but issue
  [#204](https://github.com/adamstallard/igor/issues/204) archives all four after this one, so
  until they archive the in-force text cites rules not yet in force. The choice is to
  accept that window, reorder #204, or word the citations by change rather than by requirement.
  *Recommendation:* accept the window, since every cited change archives in the same series.
- **The ambient login until #171 archives.** Until #171 archives, the in-force `seat-budget`
  lets a seat name no token and run on the login stored on the host, which decision 17 forbids;
  an organization with no seats runs its calls that way too. Under this change no call runs
  without a seat: the startup check waits for one the gate names, and every other call comes
  after it. Nothing is asked of Adam: what is built follows decision 17, and the item stays open
  only until #171 archives.
- **A reset that follows a link.** In same-user mode the worker can make `~/.claude` or
  `~/.claude.json` a link to a file the person owns, and a reset run as the person that follows
  it would remove or overwrite that file. *Recommendation:* the reset removes and creates
  without following links.
- **Two `igor run`s of one role at once** share the role's home, and one's reset can replace
  `~/.claude` under the other's running call. Both are rank 0, and #179 has no rule for two
  processes at one rank. *Recommendation:* the second `igor run` of a role refuses while another
  holds a lock on that role's home, naming the role.
- **A process that escaped its group outlives its task.** Igor kills every process the worker
  user owns before each reset, so an escaped process runs, holding its seat's token, until the
  next call in that home. *Recommendation:* also kill them when a task ends; it is the same kill,
  and it shortens how long an escaped process holds the token.
- **The template and `skills_dir` in same-user mode.** There the worker runs as the user that owns
  Igor's installation and the skills a developer installed, so it can write the template and the
  scripts #153's verification runs, and #175's start check, which confirms the worker user cannot
  write the template, does not run. *Recommendation:* accept both as limits of same-user mode,
  which is a developer at their own terminal.
- **The worker's session log does not survive the reset.** The execution record's `session`
  points at the worker's log under `~/.claude/projects/`, and the next reset in that home
  deletes it. Keeping `projects/` out of the reset is not an answer, since Claude Code's memory
  for a project lives there and loads into later calls. *Recommendation:* Igor copies the log
  into its state directory when the worker exits, before the next reset, and the record points
  at the copy.
- **spec-trace is not installed.** Task 5.1 installs `prose` and `bug-hunter` only, and #190,
  which shows on a pull request what the loop checked, fills its *Spec scenarios* row by running
  `<skills_dir>/skills/spec-trace/scripts/spec_trace.py`, so on a deployment that follows 5.1 that
  row reads `not checked` on every pull request. *Recommendation:* add `spec-trace` to 5.1's
  install command.

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
  (decision 12): an absolute path to a plugin directory. It holds `.claude-plugin/plugin.json`,
  which names the plugin `igor`, and the skills under `skills/`, installed by the shared-skills
  manager. Igor adds no installer.
- **Every `claude -p` Igor spawns carries `--plugin-dir <skills_dir>`**: the worker, triage, and
  every later step, never with `--bare`. The usage read is the one exception (decision 10).
  Each skill loads as `igor:<name>`, and the worker invokes it through the Skill tool. A skill
  named the same in the home directory loads under its own name beside it; one in the worked
  repository does not load (decision 8). Every installed skill loads for every role; a role's
  `skills` list (#153) decides which skills its worker is told to use and whose results Igor's
  code verifies.
- **No call loads the worked repository's settings** (decision 8), **and every call in the
  worker's home starts from a reset `~/.claude` and `~/.claude.json`** (decision 9). With a
  worker user, Igor kills every process that user owns before every reset (decision 13).
- **Before its first model call, Igor confirms each installed skill loads.** It reads the skill
  list from the `system/init` event of a `claude -p --model haiku` call made with an empty
  `HOME` and the token of the seat the budget gate chose, spent like any other call (decisions 5
  and 18).
- **The pinned shared-skills commit is at or after `075a73a`** (shared-skills #19), where every
  skill finds its scripts from its base directory, `<skills_dir>/skills/<name>`.

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
- **#153** depends on this change. #153's design writes the skills directory as `<skills>`, which
  is `<skills_dir>/skills`: Igor's code runs prose's and bug-hunter's scripts from there, and the
  worker is granted none of them (#153). Its role-config
  requirement refuses a role that lists a skill not installed under `skills_dir`; this change
  refuses nothing on that account. #153 needs prose to take `--goals-file` for `sign`, and for
  `start` if #153 keeps Igor's `prose start` (#153's task list), so the pinned commit must carry
  that too (task 0.2).
- **#171** (`seat-files`) archives after this change, in issue #204's order. Decision 17 rests
  on it (*Still open*, the ambient login).
- **#143** withdraws `scheduled-observation`, whose `igor observe` reads usage under a stored
  login, which decision 17 forbids. This change assumes #143 has archived. With a token in its
  environment, the usage read printed no window percentages on 2026-10-18 (`design.md`); what
  replaces it is #143's to settle, and decision 10 applies to whatever usage read remains.
- **#175** (`worker-user`) archives before this change (#204): the startup check's prompt goes on
  stdin, as #175's *A prompt reaches claude on stdin, never in its arguments* requires.
- **#82** (`stopped-scope-visible`): the startup check's refusal exits with status 78, as #82's
  *A process that refuses to start exits with status 78* requires.
- **#143's seat probe**, the call that reads a seat's windows from its `rate_limit_event`, and
  **#144's startup self-test** are `claude -p` calls, so they carry the flag. The skills check
  here differs from both: it reads no usage, and runs once per start, not once per seat.
- `docs/deployment.md` gains the install procedure: a root-owned plugin directory outside the
  service's writable paths, filled by the manager from a clone at a fixed commit.
- **#144's risk stands:** if `--bare` becomes the default for `claude -p`, Igor must opt out
  explicitly.
