## ADDED Requirements

### Requirement: Skills come from one plugin directory the server names

Igor SHALL load the skills its model steps run from one Claude Code plugin directory,
`skills_dir`. `skills_dir` SHALL be `/opt/igor/skills`, unless `IGOR_SKILLS_DIR` in the
environment Igor starts with names another directory. It SHALL be read from nowhere else:
`igor.config.yaml` and the other lore files have no `skills_dir` key, and a lore file that names
one SHALL be refused as an unknown key.

The directory holds `.claude-plugin/plugin.json` naming the plugin `igor`, and one entry per
skill under `skills/`. A skill named `<name>` therefore has its files under
`<skills_dir>/skills/<name>/` and loads as `igor:<name>`. Every path Igor names for that skill's
scripts SHALL be under that directory, and a step that asks for the skill by name
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

- **WHEN** a model step directs the worker to use the skill `prose`
- **THEN** it names the skill `igor:prose`
- **AND** every path of a prose script Igor runs for that step is under
  `<skills_dir>/skills/prose/`

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>`, with one exception:
the usage read (`runUsage`, which the budget gate and `igor budget` run), which only reads a
seat's usage and SHALL NOT carry it. The calls that carry it are the worker, triage and every
other model step, as this spec calls each call in which a model does Igor's work. No call SHALL
pass `--bare`.

The worker invokes an `igor:<name>` skill itself, through the Skill tool, when its task calls
for it.

The flag loads every skill installed under `skills_dir` for every role. A role's `skills` list
(#153) does not decide what loads.

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Every other model call names the directory

- **WHEN** Igor spawns a `claude -p` that is neither the worker, triage nor the usage read, such
  as #143's seat probe or the startup check
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: The usage read names no plugin directory

- **WHEN** the budget gate under `igor serve`, or `igor budget`, runs the usage read
- **THEN** its arguments do not include `--plugin-dir`

#### Scenario: No call passes --bare

- **WHEN** Igor spawns any `claude -p`
- **THEN** its arguments do not include `--bare`

### Requirement: No call loads the worked repository's settings

No `claude -p` process Igor spawns, the startup check and the usage read included, SHALL load
the worked repository's `.claude/settings.json`, `.mcp.json`, skills under `.claude/skills/` or
`CLAUDE.md`. Every such process SHALL pass `--setting-sources user` and `--strict-mcp-config`
to keep them out.

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
home. With none, Igor SHALL keep one home per role in its state directory, the directory where
Igor keeps its own files on the machine, such as `~/.local/state/igor/home/<role>`, and set the
worker's `HOME` to it. Running with no worker user, so that the worker runs as the user Igor runs
as, is same-user mode; `igor run` is the one command that runs that way (#175).

Before every `claude -p` Igor starts in that home, Igor SHALL replace `~/.claude` and
`~/.claude.json` with a fresh copy of a template that ships with Igor, keeping nothing of what
was there, a stored login in `~/.claude/.credentials.json` included. The calls Igor starts in
that home are the worker and each model step Igor starts after it in the same home, such as
#153's prose pass and bug hunt. Under `igor run`, Igor SHALL neither hide nor refuse a login the
developer keeps where setting `HOME` does not move it, such as the macOS Keychain. The template
SHALL hold:

- a `settings.json` holding `{}`, so no hooks and no MCP servers;
- no skills and no `CLAUDE.md`;
- a `~/.claude.json` holding `{"hasCompletedOnboarding": true}`, so onboarding is marked done and
  no MCP server is configured.

The template SHALL sit in Igor's installation, the directory Igor's own code is installed in.
With a worker user, #175's start check confirms that user cannot write it.

Nothing else in the home SHALL be reset: `~/.gitconfig`, and the files a repository's tests
cache in the home, persist across runs.

With a worker user, before every reset, Igor SHALL kill every process that user owns, either by
user or by the user's systemd slice; either way meets this requirement, and a kill of the
worker's process group alone does not.

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
- **AND** Igor then starts a model step in the worker's home, such as #153's prose pass
- **THEN** the step's `~/.claude` holds only what the template holds

#### Scenario: A stored login does not survive the reset

- **WHEN** the worker's home holds `~/.claude/.credentials.json` and Igor resets `~/.claude`
- **THEN** that file is gone
- **AND** the next call in that home authenticates with its seat's token, from its environment

#### Scenario: Under igor run, a stored login outside the home is neither hidden nor refused

- **WHEN** `igor run` starts a call in the worker's home with `IGOR_RUN_TOKEN` in its
  environment, and the developer's own login is stored outside the home, such as in the macOS
  Keychain
- **THEN** Igor starts the call without refusing it and without hiding that login from it

#### Scenario: The rest of the home persists

- **WHEN** a run leaves `~/.gitconfig` and a file under `~/.cache` in the worker's home
- **AND** Igor starts the next run in that home
- **THEN** each of those files is still there

#### Scenario: A worker user's home is its own

- **WHEN** Igor runs a worker as the worker user of role `generalist`, rank 1
- **THEN** each `claude -p` it starts for that worker's task has `HOME` set to that user's own
  home
- **AND** that home is reset before each of those calls

#### Scenario: Same-user mode has a home per role

- **WHEN** Igor runs with no worker user, for the role `generalist`
- **THEN** each `claude -p` it starts for that worker's task has `HOME` set to that role's home
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

Before its first other model call, Igor SHALL run `claude -p --model haiku --plugin-dir
<skills_dir> --setting-sources user --strict-mcp-config --output-format stream-json --verbose`.
It runs from an empty temporary directory, with an environment holding only `PATH`, the network
settings the host is configured with, a `HOME` that is another empty temporary directory, and
the token of the seat the budget gate chose for Igor's first model call (under `igor run`, the
token in `IGOR_RUN_TOKEN`). Its prompt is one
word, such as `ok`, on stdin, as #175's (`worker-user`) *A prompt reaches claude on stdin, never
in its arguments* requires. The call SHALL be an ordinary spend on that seat, run to its end and
recorded as any other call is.

Where the gate names no seat when Igor starts, no call is made, as #171's *A spend with no seat
behind it is not made* requires. Igor starts, and runs the check before its first model call
once the gate names a seat.

Igor SHALL read the `skills` list of the `system/init` event and confirm that `igor:<name>` is in
it for every entry under `<skills_dir>/skills/`. A call that fails after printing the event
SHALL still be judged on that list, and its failure is handled as that failure would be on any
other call on that seat.

Igor SHALL refuse to start, naming the path, when `<skills_dir>/skills/` is missing or holds no
entry, when `skills_dir` holds any entry besides `.claude-plugin/` and `skills/`, or when
`.claude-plugin/` holds anything besides a `plugin.json` whose only keys are `name`, `version`
and `description`. These checks run before the call, and each refusal exits with status 78.

Igor SHALL refuse to start when an installed skill is missing from the list, or when no
`system/init` event arrives. That holds whenever the check runs, including a check that waited
for the gate to name a seat.

Every refusal in this requirement exits with status 78, under `igor serve` as #82's
(`stopped-scope-visible`) *A process that refuses to start exits with status 78* requires, and
under `igor run` too.

For each skill, Igor SHALL report the commit of the git clone that the skill's entry under
`<skills_dir>/skills/` resolves to. Where the clone is owned by root, Igor SHALL read that commit
by trusting that clone, with git's own file-system monitor turned off, for the one command that
reads it, and SHALL NOT change the service user's git configuration to do so. A clone owned by any
user but root or the user Igor runs as is not trusted. Where the commit cannot be read, the entry
is not in a git clone, or the clone is not trusted, Igor SHALL report the skill's commit as not
checked, and the check still passes on the list alone.

#### Scenario: Every installed skill loads

- **WHEN** the `system/init` event lists `igor:<name>` for every skill installed under
  `skills_dir`
- **THEN** Igor starts
- **AND** it reports each skill with the commit its files come from

#### Scenario: A skill that does not load stops the start

- **WHEN** a skill is installed under `skills_dir` but `igor:<name>` is missing from the
  event's `skills` list
- **THEN** Igor refuses to start, naming the skill
- **AND** the process exits with status 78

#### Scenario: A root-owned clone's commit is read

- **WHEN** every installed skill loads, and the clone a skill's entry resolves to is owned by
  root while Igor runs as its service user
- **THEN** Igor reports that skill with the clone's commit
- **AND** the service user's `~/.gitconfig` is unchanged

#### Scenario: A clone another user owns is not trusted

- **WHEN** every installed skill loads, and the clone a skill's entry resolves to is owned by a
  user who is neither root nor the user Igor runs as
- **THEN** Igor starts
- **AND** it reports that skill's commit as not checked, having run no git command in that clone

#### Scenario: An unreadable commit is reported as not checked

- **WHEN** every installed skill loads, but the commit of one skill's files cannot be read
- **THEN** Igor starts
- **AND** it reports that skill's commit as not checked

#### Scenario: An empty skills directory stops the start

- **WHEN** `<skills_dir>/skills/` is missing or holds no entry
- **THEN** Igor refuses to start, naming that path, and makes no call
- **AND** the process exits with status 78

#### Scenario: A plugin directory that holds more than skills stops the start

- **WHEN** `skills_dir` holds a `hooks/` directory, or `plugin.json` holds a `hooks` key
- **THEN** Igor refuses to start, naming what it found, and makes no call
- **AND** the process exits with status 78

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load

#### Scenario: The check spends the seat the gate chose, on haiku

- **WHEN** Igor runs the check
- **THEN** its arguments include `--model haiku`
- **AND** it runs from an empty temporary directory, with `HOME` set to another empty
  temporary directory
- **AND** the call's environment holds the token of the seat the budget gate chose, and no
  other seat's token and no API key
- **AND** its `HOME` holds no stored login
- **AND** the spend is recorded against that seat

#### Scenario: No seat, no check yet

- **WHEN** the budget gate names no seat for the role when Igor starts
- **THEN** Igor starts, makes no model call, and runs the check before its first model call once
  the gate names a seat
- **AND** if that check fails, the process exits with status 78 then

#### Scenario: A call that fails after the init event is still judged on its list

- **WHEN** the check's call prints a `system/init` event listing every installed skill and then
  fails, such as on a refused token
- **THEN** the check passes on that list
- **AND** the failure is handled as that failure would be on any other call on that seat
