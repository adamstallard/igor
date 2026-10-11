## ADDED Requirements

### Requirement: Skills come from one configured plugin directory

Igor SHALL load the skills its model steps run from one Claude Code plugin directory, named by
`skills_dir` in `igor.config.yaml`. The directory SHALL hold `.claude-plugin/plugin.json` naming
the plugin `igor`, and the skills under `skills/`, one entry per skill, installed by the
shared-skills manager. A skill named `<name>` therefore has its files under
`<skills_dir>/skills/<name>/` and loads as `igor:<name>`. Every path Igor or a grant names for
that skill's scripts SHALL be under that directory, and a step that asks for the skill by name
SHALL use `igor:<name>`.

`skills_dir` SHALL be an absolute path. A relative path is refused at load, because the only
directory it could be relative to is the lore repository, which Igor writes to.

Where `skills_dir` is absent, Igor loads no skills, and a step that needs a skill SHALL refuse
to start, naming the missing key.

#### Scenario: An absolute directory is accepted

- **WHEN** `igor.config.yaml` sets `skills_dir: /opt/igor/skills`
- **THEN** Igor loads skills from `/opt/igor/skills/skills/`, each as `igor:<name>`

#### Scenario: A relative directory is refused

- **WHEN** `igor.config.yaml` sets `skills_dir: skills`
- **THEN** loading the configuration fails, naming `skills_dir` and saying it must be absolute

#### Scenario: A step that needs a skill does not run without one

- **WHEN** `skills_dir` is absent and a role runs a step that needs a skill
- **THEN** that step does not start
- **AND** the failure names `skills_dir`

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>` when
`skills_dir` is set: the worker, triage, and every other model step. The flag SHALL be passed
whether or not the call also passes `--bare`. Under `--bare`, a plugin named with
`--plugin-dir` loads its skills, and the service user's home skills do not (measured).

A skill elsewhere with the same name as a pinned one, in the home directory or in the worked
repository, loads under its own name beside `igor:<name>` and does not replace it (measured).

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker with `skills_dir` set
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call with `skills_dir` set
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: No directory, no flag

- **WHEN** `skills_dir` is absent
- **THEN** no `claude -p` call carries `--plugin-dir`

### Requirement: Igor confirms its skills load before its first model call

Before it spawns its first `claude -p` that could spend a seat, Igor SHALL run
`claude -p --bare --plugin-dir <skills_dir> --output-format stream-json --verbose` with an
environment holding only `PATH` and `HOME`. It SHALL read the `skills` list of the
`system/init` event and confirm that `igor:<name>` is in it for every entry under
`<skills_dir>/skills/`. With no credential, a `--bare` call cannot authenticate, so the call
costs nothing. It prints the event first, then exits with `Not logged in` (measured).

Igor SHALL refuse to start when an installed skill is missing from the list, or when no
`system/init` event arrives. It SHALL report the commit each skill's files come from, so a
change in what is loaded shows in the log.

#### Scenario: Every installed skill loads

- **WHEN** the `system/init` event lists `igor:<name>` for every skill installed under
  `skills_dir`
- **THEN** Igor starts
- **AND** it reports each skill with the commit its files come from

#### Scenario: A skill that does not load stops the start

- **WHEN** a skill is installed under `skills_dir` but `igor:<name>` is missing from the
  event's `skills` list
- **THEN** Igor refuses to start, naming the skill

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load

#### Scenario: The check spends no seat

- **WHEN** Igor runs the check
- **THEN** the call's environment holds no seat token and no API key

### Requirement: The worker is told where its skills are

When `skills_dir` is set, the worker's system prompt SHALL state that its skills are installed
under `<skills_dir>/skills`. Where a skill's own instructions name a path under
`~/.claude/skills` or `~/.agents/skills`, the worker SHALL use the same path under
`<skills_dir>/skills` instead. The shared skills at the pinned commit name their scripts by
home-directory paths, and on an Igor server those are not the pinned copies.

#### Scenario: The system prompt names the directory

- **WHEN** a worker is spawned with `skills_dir` set
- **THEN** its system prompt names `<skills_dir>/skills` as where its skills are
