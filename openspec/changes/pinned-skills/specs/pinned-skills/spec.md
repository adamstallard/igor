## ADDED Requirements

### Requirement: Skills come from one configured directory

Igor SHALL load the skills its model steps run from one directory, named by `skills_dir` in
`igor.config.yaml`. The skills SHALL be installed under that directory's `.claude/skills/`, one
entry per skill, by the shared-skills manager. A skill named `<name>` therefore has its files
under `<skills_dir>/.claude/skills/<name>/`, and every path Igor or a grant names for that
skill's scripts SHALL be under that directory.

`skills_dir` SHALL be an absolute path. A relative path is refused at load, because the only
directory it could be relative to is the lore repository, which Igor writes to.

Where `skills_dir` is absent, Igor passes no skills directory, and a step that needs a skill
SHALL refuse to start, naming the missing key.

#### Scenario: An absolute directory is accepted

- **WHEN** `igor.config.yaml` sets `skills_dir: /opt/igor/skills`
- **THEN** Igor loads skills from `/opt/igor/skills/.claude/skills/`

#### Scenario: A relative directory is refused

- **WHEN** `igor.config.yaml` sets `skills_dir: skills`
- **THEN** loading the configuration fails, naming `skills_dir` and saying it must be absolute

#### Scenario: A step that needs a skill does not run without one

- **WHEN** `skills_dir` is absent and a role runs a step that needs a skill
- **THEN** that step does not start
- **AND** the failure names `skills_dir`

### Requirement: Every model call names the skills directory

Every `claude -p` process Igor spawns SHALL carry `--add-dir <skills_dir>` when `skills_dir` is
set: the worker, triage, and every other model step. The flag SHALL be passed whether or not
the call also passes `--bare`. Under `--bare`, a directory named with `--add-dir` is the only
place skills are loaded from besides the ones built into Claude Code (measured).

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker with `skills_dir` set
- **THEN** its arguments include `--add-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call with `skills_dir` set
- **THEN** its arguments include `--add-dir` followed by `skills_dir`

#### Scenario: No directory, no flag

- **WHEN** `skills_dir` is absent
- **THEN** no `claude -p` call carries an `--add-dir` for skills

### Requirement: Igor cannot change the skills it runs

Igor SHALL refuse to start when the user it runs as can write to `skills_dir`, to its
`.claude/skills/` directory, or to the real directory any installed skill resolves to through
its link. `--add-dir` gives a worker edit access to everything under the directory. A worker
able to edit there could rewrite the scripts that Igor's own code runs to verify what that
worker signed.

#### Scenario: A writable skills directory is refused

- **WHEN** the user Igor runs as can write to `skills_dir`
- **THEN** Igor refuses to start, naming the path and saying who should own it

#### Scenario: A writable clone behind a link is refused

- **WHEN** `skills_dir` is read-only, but a skill links into a shared-skills clone that the
  user Igor runs as can write to
- **THEN** Igor refuses to start, naming the clone's path

### Requirement: Igor confirms its skills load before its first model call

Before it spawns its first `claude -p` that could spend a seat, Igor SHALL run
`claude -p --bare --add-dir <skills_dir> --output-format stream-json --verbose` with an
environment holding only `PATH` and `HOME`. It SHALL read the `skills` list of the
`system/init` event and confirm that every entry under `<skills_dir>/.claude/skills/` is in it.
With no credential, a `--bare` call cannot authenticate, so the call costs nothing. It prints
the event first, then exits with `Not logged in` (measured).

Igor SHALL refuse to start when an installed skill is missing from the list, or when no
`system/init` event arrives. It SHALL report the commit each skill's files come from, so a
change in what is loaded shows in the log.

#### Scenario: Every installed skill loads

- **WHEN** the `system/init` event lists every skill installed under `skills_dir`
- **THEN** Igor starts
- **AND** it reports each skill with the commit its files come from

#### Scenario: A skill that does not load stops the start

- **WHEN** a skill is installed under `skills_dir` but missing from the event's `skills` list
- **THEN** Igor refuses to start, naming the skill

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load

#### Scenario: The check spends no seat

- **WHEN** Igor runs the check
- **THEN** the call's environment holds no seat token and no API key

### Requirement: A pinned skill is not replaced by a copy with the same name

Without `--bare`, a skill in the home directory's `.claude/skills/`, or in the working
directory's `.claude/skills/`, takes precedence over a skill of the same name loaded through
`--add-dir` (measured). Either copy would run in place of the pinned one, without an error.

Igor SHALL refuse to start when a skill installed under `skills_dir` is also present, by name,
in the home directory's `.claude/skills/` of the user it runs as.

Before it spawns a worker, Igor SHALL check the working tree. If the tree holds
`.claude/skills/<name>` for a skill installed under `skills_dir`, the item SHALL stop with that
reason, and no worker is spawned.

#### Scenario: A home copy stops the start

- **WHEN** `prose` is installed under `skills_dir` and also under `~/.claude/skills/` of the user
  Igor runs as
- **THEN** Igor refuses to start, naming the home copy

#### Scenario: A repository's copy stops the item

- **WHEN** the repository being worked holds `.claude/skills/prose` and `prose` is installed
  under `skills_dir`
- **THEN** no worker is spawned for the item
- **AND** the item stops, naming the repository's copy

#### Scenario: A repository's other skills are left alone

- **WHEN** the repository holds `.claude/skills/<name>` for a name not installed under
  `skills_dir`
- **THEN** the worker is spawned as usual

### Requirement: The worker is told where its skills are

When `skills_dir` is set, the worker's system prompt SHALL state that its skills are installed
under `<skills_dir>/.claude/skills`. Where a skill's own instructions name a path under
`~/.claude/skills` or `~/.agents/skills`, the worker SHALL use the same path under
`<skills_dir>/.claude/skills` instead. The shared skills name home-directory paths for their
scripts, and on an Igor server those are not the pinned copies.

#### Scenario: The system prompt names the directory

- **WHEN** a worker is spawned with `skills_dir` set
- **THEN** its system prompt names `<skills_dir>/.claude/skills` as where its skills are
