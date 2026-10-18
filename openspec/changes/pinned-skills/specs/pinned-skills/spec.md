## ADDED Requirements

### Requirement: Skills come from one plugin directory the server names

Igor SHALL load the skills its model steps run from one Claude Code plugin directory,
`skills_dir`. `skills_dir` SHALL be `/opt/igor/skills`, unless `IGOR_SKILLS_DIR` in the
environment Igor starts with names another directory. It SHALL be read from nowhere else:
`igor.config.yaml` and the other lore files have no `skills_dir` key, and a lore file that names
one SHALL be refused as an unknown key.

The directory holds `.claude-plugin/plugin.json` naming the plugin `igor`, and one entry per
skill under `skills/`. A skill named `<name>` therefore has its files under
`<skills_dir>/skills/<name>/` and loads as `igor:<name>`. Every path Igor or a grant names for
that skill's scripts SHALL be under that directory, and a step that asks for the skill by name
SHALL use `igor:<name>`.

`IGOR_SKILLS_DIR` SHALL be an absolute path, and a relative one SHALL refuse the start.

#### Scenario: The default directory is used

- **WHEN** Igor starts with no `IGOR_SKILLS_DIR` in its environment
- **THEN** `skills_dir` is `/opt/igor/skills`, and skills load from `/opt/igor/skills/skills/`,
  each as `igor:<name>`

#### Scenario: The server's environment overrides the default

- **WHEN** Igor starts with `IGOR_SKILLS_DIR=/srv/igor-skills`
- **THEN** `skills_dir` is `/srv/igor-skills`

#### Scenario: A relative directory is refused

- **WHEN** Igor starts with `IGOR_SKILLS_DIR=skills`
- **THEN** it refuses to start, naming `IGOR_SKILLS_DIR` and saying it must be absolute

#### Scenario: A lore file cannot name the directory

- **WHEN** `igor.config.yaml` sets `skills_dir: /tmp/x`
- **THEN** loading the configuration fails, as it does for any unknown key

#### Scenario: A step names a skill by its plugin name

- **WHEN** a model step directs the worker to use the skill `prose`, and grants its scripts
- **THEN** it names the skill `igor:prose`
- **AND** every script path it grants is under `<skills_dir>/skills/prose/`

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>`: the worker,
triage, and every other model step. The usage read (`runUsage`, which the budget gate and
`igor budget` run) is the one exception and SHALL NOT carry it. No call SHALL pass
`--bare`.

The worker invokes an `igor:<name>` skill itself, through the Skill tool, when its task calls
for it.

The flag loads every skill installed under `skills_dir` for every role. A role's `skills` list
(#153) does not decide what loads.

A skill with the same name as a pinned one in the home directory of the user a call runs as
loads under its own name beside `igor:<name>` and does not replace it.

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Every other model call names the directory

- **WHEN** Igor spawns any other `claude -p`, such as #143's seat probe
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: The usage read names no plugin directory

- **WHEN** `igor budget` runs the usage read
- **THEN** its arguments do not include `--plugin-dir`

#### Scenario: No call passes --bare

- **WHEN** Igor spawns any `claude -p`
- **THEN** its arguments do not include `--bare`

### Requirement: No call loads the worked repository's settings

No `claude -p` process Igor spawns, the startup check and the usage read included, SHALL load
the worked repository's `.claude/settings.json`, `.mcp.json`, skills under `.claude/skills/` or
`CLAUDE.md`. Every such process SHALL pass `--setting-sources user` and `--strict-mcp-config`
to keep them out. If task 0.3 finds that any of the four still loads with those flags, the means
goes back to Adam, and the rule that none loads still holds.

#### Scenario: A call names only the user's settings

- **WHEN** Igor spawns any `claude -p`
- **THEN** its arguments include `--setting-sources user` and `--strict-mcp-config`

#### Scenario: A repository's own settings do not reach the worker

- **WHEN** the worked repository holds a `.claude/settings.json` with a hook, a `.mcp.json`, a
  skill under `.claude/skills/` and a `CLAUDE.md`
- **THEN** the worker's `system/init` event lists neither that skill nor that MCP server
- **AND** that hook does not run
- **AND** the worker is not given that `CLAUDE.md`

### Requirement: Every call in the worker's home starts from Igor's template

The worker's home SHALL last across runs. With a worker user (#175), it SHALL be that user's own
home. With none, under #175's same-user mode (`igor run`), Igor SHALL keep one home per role under its state
directory, such as `~/.local/state/igor/home/<role>`, and set the worker's `HOME` to it.

Before every `claude -p` Igor starts in that home, Igor SHALL replace `~/.claude` and
`~/.claude.json` with a fresh copy of a template that ships with Igor, keeping nothing of what
was there, a stored login in `~/.claude/.credentials.json` included, so that a call in that
home authenticates only with its seat's token, as #171's *A spend with no seat behind it is not
made* requires. Those calls are the worker and each model step Igor starts after it in the same
home, such as #153's prose pass and bug hunt. #153's `prose start` runs after the reset, as
#175's *The worker runs as a separate, unprivileged user* requires. The template SHALL hold:

- a `settings.json` holding only what Igor needs, with no hooks and no MCP servers;
- no skills and no `CLAUDE.md`, since skills load from `skills_dir`;
- a `~/.claude.json` with onboarding marked done and no MCP servers.

The template SHALL sit in Igor's installation. With a worker user, #175's start check confirms
that user cannot write it; in same-user mode nothing protects it, which is open in the proposal.

Nothing else in the home SHALL be reset: `~/.gitconfig`, and the files a repository's tests
cache in the home, persist across runs.

With a worker user, before every reset, Igor SHALL kill every process that user owns, either by
user or by the user's systemd slice; either way meets this requirement. In same-user mode nothing
ends a process that escaped the run's process group, and that is a stated limit of same-user
mode.

#### Scenario: A later call does not load what an earlier one wrote

- **WHEN** a worker writes a hook, a `CLAUDE.md` or a skill under `~/.claude`, and an MCP server
  into `~/.claude.json`
- **AND** no process the worker started is still running
- **AND** Igor later starts another `claude -p` in that home
- **THEN** that call's `~/.claude` and `~/.claude.json` hold only what the template holds
- **AND** the hook does not run, and neither that `CLAUDE.md`, that skill nor that MCP server
  loads

#### Scenario: A model step after the worker starts from the template

- **WHEN** a worker writes a hook under `~/.claude`
- **AND** no process the worker started is still running
- **AND** Igor then starts a model step in the worker's working tree, such as #153's prose pass
- **THEN** the step's `~/.claude` holds only what the template holds

#### Scenario: A stored login does not survive the reset

- **WHEN** the worker's home holds `~/.claude/.credentials.json` and Igor resets `~/.claude`
- **THEN** that file is gone
- **AND** the next call in that home authenticates with its seat's token, from its environment

#### Scenario: A login stored outside the home is not used

- **WHEN** Igor starts a call in the worker's home with an invalid seat token in its environment
- **AND** a login is stored where `claude` could find it outside the home, such as the macOS
  Keychain of the person running `igor run`
- **THEN** the call fails to authenticate

#### Scenario: The rest of the home persists

- **WHEN** a run leaves `~/.gitconfig` and a file under `~/.cache` in the worker's home
- **AND** Igor starts the next run in that home
- **THEN** each of those files is still there

#### Scenario: Same-user mode has a home per role

- **WHEN** Igor runs with no worker user, for the role `generalist`
- **THEN** each `claude -p` it starts in the worker's tree has `HOME` set to that role's home
  under Igor's state directory
- **AND** that home is reset as a worker user's is

#### Scenario: The worker cannot change the template

- **WHEN** a worker running as a worker user tries to write into the template Igor resets the
  home from
- **THEN** the write is refused

#### Scenario: A process that escaped its group is killed before the next reset

- **WHEN** a worker running as a worker user starts a process that calls `setsid()` and keeps
  running after the worker exits
- **THEN** Igor kills it before the next reset in that user's home: the one before #153's next
  model step in the same task, or, where the task has none, the one before the next task's
  worker

### Requirement: Igor confirms its skills load before its first model call

Before it spawns its first `claude -p` that could spend a seat, Igor
SHALL run `claude -p --plugin-dir <skills_dir> --setting-sources user --strict-mcp-config
--output-format stream-json --verbose`, from an empty temporary directory, with an environment holding
only `PATH` and a `HOME` that is another empty temporary directory. Its prompt is one word,
such as `ok`, on stdin: #175 (`worker-user`) requires every call's prompt to go there, in *A
prompt reaches claude on stdin, never in its arguments*. It SHALL read the `skills`
list of the `system/init` event and confirm that `igor:<name>` is in it for every entry under
`<skills_dir>/skills/`. With no token and no stored login, the call prints the event and then
fails to authenticate, at no cost.

Igor SHALL refuse to start when an installed skill is missing from the list, or when no
`system/init` event arrives, and the refusal exits with status 78, as #82's
(`stopped-scope-visible`) *A process that refuses to start exits with status 78* requires. It SHALL report, for each skill, the commit of the git clone that
the skill's entry under `<skills_dir>/skills/` resolves to. Where that commit cannot be read, or
the entry is not in a git clone, it SHALL report the skill's commit as not checked, and the
check still passes on the list alone.

#### Scenario: Every installed skill loads

- **WHEN** the `system/init` event lists `igor:<name>` for every skill installed under
  `skills_dir`
- **THEN** Igor starts
- **AND** it reports each skill with the commit its files come from

#### Scenario: A skill that does not load stops the start

- **WHEN** a skill is installed under `skills_dir` but `igor:<name>` is missing from the
  event's `skills` list
- **THEN** Igor refuses to start, naming the skill

#### Scenario: An unreadable commit is reported as not checked

- **WHEN** every installed skill loads, but the commit of one skill's files cannot be read
- **THEN** Igor starts
- **AND** it reports that skill's commit as not checked

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load

#### Scenario: The check spends no seat

- **WHEN** Igor runs the check
- **THEN** the call's environment holds no seat token and no API key
- **AND** its `HOME` holds no stored login
