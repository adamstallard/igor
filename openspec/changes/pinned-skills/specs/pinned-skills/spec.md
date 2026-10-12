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

Where `skills_dir` is absent, Igor loads no skills. No skill is then installed, so a role whose
`skills` list names any skill is refused at load by role-config's *A role declares the skills
its worker uses* (#153); this capability adds no refusal of its own.

#### Scenario: An absolute directory is accepted

- **WHEN** `igor.config.yaml` sets `skills_dir: /opt/igor/skills`
- **THEN** Igor loads skills from `/opt/igor/skills/skills/`, each as `igor:<name>`

#### Scenario: A relative directory is refused

- **WHEN** `igor.config.yaml` sets `skills_dir: skills`
- **THEN** loading the configuration fails, naming `skills_dir` and saying it must be absolute

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>` when
`skills_dir` is set: the worker, triage, and every other model step. No call SHALL pass
`--bare` (decided by Adam, 2026-10-11): under `--bare` a seat's token runs as an API key, with
no `rate_limit_event`, so the call is not read as a seat (measured).

The worker invokes an `igor:<name>` skill itself, through the Skill tool, when its task calls
for it (measured).

The flag loads every skill installed under `skills_dir` for every role. A role's `skills` list
(#153) decides which skills its worker is directed to use and which of them Igor verifies; it
does not decide what loads.

A skill elsewhere with the same name as a pinned one, in the home directory or in the worked
repository, loads under its own name beside `igor:<name>` and does not replace it (measured).

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker with `skills_dir` set
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call with `skills_dir` set
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: No call passes --bare

- **WHEN** Igor spawns any `claude -p`
- **THEN** its arguments do not include `--bare`

#### Scenario: No directory, no flag

- **WHEN** `skills_dir` is absent
- **THEN** no `claude -p` call carries `--plugin-dir`

### Requirement: Igor confirms its skills load before its first model call

Before it spawns its first `claude -p` that could spend a seat, Igor SHALL run
`claude -p --plugin-dir <skills_dir> --output-format stream-json --verbose` from an empty
temporary directory, with an environment holding only `PATH` and a `HOME` that is another empty
temporary directory. It SHALL read the `skills` list of the `system/init` event and confirm that
`igor:<name>` is in it for every entry under `<skills_dir>/skills/`. With no token and no
stored login, the call cannot authenticate, so it costs nothing. It prints the event first,
then exits with `Not logged in` (measured).

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
- **AND** its `HOME` holds no stored login
