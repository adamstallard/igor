## ADDED Requirements

### Requirement: Skills come from one configured plugin directory

Igor SHALL load the skills its model steps run from one Claude Code plugin directory, named by
`skills_dir` in `igor.config.yaml`. The directory holds `.claude-plugin/plugin.json` naming the
plugin `igor`, and one entry per skill under `skills/`. A skill named `<name>` therefore has its
files under `<skills_dir>/skills/<name>/` and loads as `igor:<name>`. Every path Igor or a grant
names for that skill's scripts SHALL be under that directory, and a step that asks for the skill
by name SHALL use `igor:<name>`.

`skills_dir` SHALL be an absolute path, and a relative one SHALL be refused at load.

Where `skills_dir` is absent, Igor names no plugin directory, so no `igor:<name>` skill loads.
This capability refuses nothing because `skills_dir` is absent. A role that lists a skill is
refused by #153's `role-config` rule.

#### Scenario: An absolute directory is accepted

- **WHEN** `igor.config.yaml` sets `skills_dir: /opt/igor/skills`
- **THEN** Igor loads skills from `/opt/igor/skills/skills/`, each as `igor:<name>`

#### Scenario: A relative directory is refused

- **WHEN** `igor.config.yaml` sets `skills_dir: skills`
- **THEN** loading the configuration fails, naming `skills_dir` and saying it must be absolute

#### Scenario: A step names a skill by its plugin name

- **WHEN** a model step directs the worker to use the skill `prose`, and grants its scripts
- **THEN** it names the skill `igor:prose`
- **AND** every script path it grants is under `<skills_dir>/skills/prose/`

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>` when
`skills_dir` is set: the worker, triage, and every other model step. The usage read (`runUsage`,
which `igor budget` runs) is the one exception and SHALL NOT carry it. No call SHALL pass
`--bare`.

The worker invokes an `igor:<name>` skill itself, through the Skill tool, when its task calls
for it.

The flag loads every skill installed under `skills_dir` for every role. A role's `skills` list
(#153) does not decide what loads.

A skill with the same name as a pinned one in the home directory of the user a call runs as
loads under its own name beside `igor:<name>` and does not replace it.

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker with `skills_dir` set
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call with `skills_dir` set
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Every other model call names the directory

- **WHEN** Igor spawns any other `claude -p` with `skills_dir` set, such as #143's seat probe
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: The usage read names no plugin directory

- **WHEN** `igor budget` runs the usage read with `skills_dir` set
- **THEN** its arguments do not include `--plugin-dir`

#### Scenario: No call passes --bare

- **WHEN** Igor spawns any `claude -p`
- **THEN** its arguments do not include `--bare`

#### Scenario: No directory, no flag

- **WHEN** `skills_dir` is absent
- **THEN** no `claude -p` call carries `--plugin-dir`

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

### Requirement: Each worker run starts with an empty home directory

For each worker it spawns, Igor SHALL create a new, empty directory and pass it as the worker's
`HOME`, and SHALL remove that directory after the worker exits, whatever the run's outcome. No
two workers SHALL share one, whether they run one after another or at the same time.

Where the worker runs as a separate Unix user (#175), who creates, owns and removes this
directory is still open (proposal, *Still open*), as is whether a worker in an empty home can
authenticate as its seat (task 0.3).

#### Scenario: A later worker does not load what an earlier one wrote

- **WHEN** a worker writes a hook, a `CLAUDE.md` or a skill under `$HOME/.claude`
- **AND** Igor later spawns another worker
- **THEN** the second worker's `HOME` is a different, empty directory
- **AND** the first worker's home directory no longer exists

#### Scenario: Two workers at once get different homes

- **WHEN** two workers run at the same time
- **THEN** each has its own `HOME`, and neither is the other's

#### Scenario: The home is removed after a failed run

- **WHEN** a worker exits with an error or is killed
- **THEN** Igor removes the home directory it created for that worker

### Requirement: Igor confirms its skills load before its first model call

Where `skills_dir` is set, before it spawns its first `claude -p` that could spend a seat, Igor
SHALL run `claude -p --plugin-dir <skills_dir> --setting-sources user --strict-mcp-config
--output-format stream-json --verbose` with a
one-word prompt and stdin closed, from an empty temporary directory, with an environment holding
only `PATH` and a `HOME` that is another empty temporary directory. It SHALL read the `skills`
list of the `system/init` event and confirm that `igor:<name>` is in it for every entry under
`<skills_dir>/skills/`. With no token and no stored login, the call prints the event and then
fails to authenticate, at no cost.

Igor SHALL refuse to start when an installed skill is missing from the list, or when no
`system/init` event arrives. It SHALL report, for each skill, the commit of the git clone that
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

#### Scenario: No skills_dir, no check

- **WHEN** `skills_dir` is absent
- **THEN** Igor runs no skills check

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load

#### Scenario: The check spends no seat

- **WHEN** Igor runs the check
- **THEN** the call's environment holds no seat token and no API key
- **AND** its `HOME` holds no stored login
