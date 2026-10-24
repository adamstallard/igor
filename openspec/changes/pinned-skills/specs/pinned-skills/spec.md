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

Where `skills_dir` does not exist, `igor serve` SHALL refuse to start, naming the path, and exit
with status 78.

Where `skills_dir` does not exist, `igor run` SHALL use the skills the person installed: the
entries holding a `SKILL.md` in `~/.claude/skills` of the `HOME` Igor starts with, read before
Igor sets the worker's `HOME` to the run's home. Igor SHALL assemble a plugin directory for the
run in its state directory, at a path of Igor's choosing whose name holds the run's id (for example
`<state directory>/plugin/<role>-<run>`), holding a `.claude-plugin/plugin.json` naming the plugin `igor` and, under `skills/`, one symbolic link
per such entry, to the entry's resolved path. For that run, that directory SHALL be
`skills_dir`, and every rule of this capability that names `skills_dir` applies to it; none of
them requires a skill to be at a particular commit, so none is exempt. The run
SHALL remove the directory when it ends, and SHALL say as it starts that it loaded the person's
skills, naming `~/.claude/skills`. That these skills are not pinned, and that the worker can
write them, are limits of `igor run`.

Where `skills_dir` does not exist and `~/.claude/skills` is missing or holds no such entry,
`igor run` SHALL load no skills: no call it makes SHALL carry `--plugin-dir`, it SHALL make no startup check (*Igor
confirms its skills load before its first model call*), and it SHALL say as it starts that the
skills were not loaded, naming `skills_dir` and `~/.claude/skills`.

#### Scenario: serve refuses a missing skills directory

- **WHEN** `igor serve` starts and `skills_dir` does not exist
- **THEN** it refuses to start, naming `skills_dir`
- **AND** the process exits with status 78

#### Scenario: run uses the skills the person installed

- **WHEN** `igor run` starts on a machine where `skills_dir` does not exist, and the person's
  `~/.claude/skills` holds `prose` and `bug-hunter`, each a link into their shared-skills clone
- **THEN** each call that carries `--plugin-dir` names a directory the run assembled, whose
  `skills/` links to those two skills, and they load as `igor:prose` and `igor:bug-hunter`
- **AND** the run says as it starts that it loaded the skills in `~/.claude/skills`
- **AND** the startup check runs against that directory
- **AND** the directory is gone once the run ends

#### Scenario: run loads no skills where neither is installed

- **WHEN** `igor run` starts on a machine where `skills_dir` does not exist and the person's
  `~/.claude/skills` holds no skill
- **THEN** it says as it starts that the skills were not loaded, naming both paths
- **AND** no call it makes carries `--plugin-dir`, and it makes no startup check

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

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>`, with two
exceptions. The usage read (`runUsage`, which the budget gate and `igor budget` run) only reads a
seat's usage and SHALL NOT carry it. And under `igor run` where neither `skills_dir` nor the
person's installed skills exist, no call carries it (*Skills come from one plugin directory the
server names*). Otherwise, the calls that carry it are the worker, triage, the startup check,
#143's seat probe and every other model step. A *model step* is one part of Igor's work done by
a model: one `claude -p`, alone or with the `claude -p --resume` calls that continue its session,
as #153's step that writes a post resumes the session in which it wrote its reader goals. No
call SHALL pass `--bare`.

The worker invokes an `igor:<name>` skill itself, through the Skill tool, when its task calls
for it.

The flag loads every skill installed under `skills_dir` for every role. A role's `skills` list
(#153) does not decide what loads.

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Every other model call names the directory

- **WHEN** Igor spawns a `claude -p` that is neither the worker, triage nor the usage read, such
  as #143's seat probe or the startup check, and `skills_dir` exists
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

### Requirement: Every model step in the worker's home starts from Igor's template

With a worker user (#175), the worker's home SHALL be that user's own home, and it SHALL last
across runs. With none, each `igor run` SHALL have a home of its own in Igor's state directory, the
directory where Igor keeps its own files on the machine, which `lore-search` (#216) defines in
its `graceful-handoff` requirement *A handoff states what was done, what remains, and who could
continue*. The home is named by the run's id, such as
`<state directory>/home/<role>-<run>`, where `<run>` is the run id each `igor run` picks
under #179 (`concurrent-instances`), whose *The sweep removes trees by rank, never by age* defines
it because the run's trees carry it too. Igor SHALL set the worker's `HOME` to it, and SHALL
remove it when the run ends. No two runs share a home, and within one run the home lasts across
its tasks.

Running with no worker user, so that the worker runs as the user Igor runs as, is
same-user mode; `igor run` is the one command that runs that way (#175).

An `igor run` that crashes leaves its home and the plugin directory it assembled (*Skills come
from one plugin directory the server names*). The next `igor run` of the role removes both at
its start, with the crashed run's trees. The rule, and the lock that tells a run that an earlier
run of its role is gone, are #179's (`concurrent-instances`) *The sweep removes trees by rank,
never by age*; the home and plugin directory it removes are the ones this capability defines.
`igor run --plan` SHALL remove nothing.

Before every model step Igor starts in that home, Igor SHALL replace `~/.claude` and
`~/.claude.json` with a fresh copy of a template that ships with Igor, keeping nothing of what
was there, a stored login in `~/.claude/.credentials.json` included. A model step is one
`claude -p` session Igor starts for a run; the model steps Igor starts in that home are the worker and the model steps #153 runs after it, such as the prose pass and the
bug hunt. Triage and the startup check do not run there. Igor SHALL NOT reset the home between the calls of one step, so
a `claude -p --resume` finds the session its step's first call left. Under `igor run`, Igor
SHALL neither hide nor refuse a login the
developer keeps where setting `HOME` does not move it, such as the macOS Keychain. The template
SHALL hold:

- a `settings.json` holding `{}`, so no hooks and no MCP servers;
- no skills and no `CLAUDE.md`;
- a `~/.claude.json` holding `{"hasCompletedOnboarding": true}`, so onboarding is marked done and
  no MCP server is configured.

The template SHALL sit in Igor's installation, the directory Igor's own code is installed in.
With a worker user, #175's start check confirms that user cannot write it.

`igor run` has no sandbox. In same-user mode the worker runs as the user Igor runs as, so it can
write whatever that user can: the template and `skills_dir` where that user owns them, as on a
developer's machine, and the person's installed skills always. It can also make `~/.claude` or `~/.claude.json` a link to a file the person owns,
which a reset may then follow, removing or overwriting that file. These are limits of `igor
run`, a developer at their own terminal.

Nothing else in the home SHALL be reset: `~/.gitconfig`, and the files a repository's tests
cache in the home, persist for as long as the home does.

With a worker user, before every reset, Igor SHALL kill every process that user owns, either by
user or by the user's systemd slice; either way meets this requirement, while a kill of the
worker's process group alone does not meet it, since each command a worker runs starts in a
session of its own. #175's *A kill, a release and a sweep reach what the
worker owns* makes the same kill before a tree is released, so no such process outlives its
task.

#### Scenario: A later call does not load what an earlier one wrote

- **WHEN** a worker writes a hook, a `CLAUDE.md` or a skill under `~/.claude`, and an MCP server
  into `~/.claude.json`
- **AND** no process the worker started is still running
- **AND** Igor later starts another model step in that home
- **THEN** that step's `~/.claude` and `~/.claude.json` hold only what the template holds
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

- **WHEN** a task leaves `~/.gitconfig` and a file under `~/.cache` in the worker's home
- **AND** Igor starts the next task in that home
- **THEN** each of those files is still there

#### Scenario: A worker user's home is its own

- **WHEN** Igor runs a worker as the worker user of role `generalist`, rank 1
- **THEN** each `claude -p` it starts for that worker's task has `HOME` set to that user's own
  home
- **AND** that home is reset before each model step of the task

#### Scenario: A step's resumed call finds its session

- **WHEN** a model step writes its reader goals in a first `claude -p`, and Igor then runs
  `claude -p --resume` for that step's session in the same home
- **THEN** Igor does not reset the home between the two calls
- **AND** the resumed call continues the first call's session

#### Scenario: Each igor run has a home of its own

- **WHEN** two `igor run`s of the role `generalist` run at once
- **THEN** each `claude -p` either starts has `HOME` set to its own run's home under Igor's state
  directory, which the other run never uses
- **AND** that home is reset as a worker user's is
- **AND** each run's home is gone once that run ends

#### Scenario: A plan removes nothing

- **WHEN** a person runs `igor run generalist --plan`, and Igor's state directory holds the home
  and the plugin directory, both of which a run keeps there, of an earlier run of `generalist`
  that crashed
- **THEN** the plan removes neither

#### Scenario: The worker cannot change the template

- **WHEN** a worker running as a worker user tries to write into the template Igor resets the
  home from
- **THEN** the write is refused

#### Scenario: A process that escaped its group is killed before the next reset

- **WHEN** a worker running as a worker user starts a process that calls `setsid()` and keeps
  running after the worker exits
- **THEN** Igor kills it before the next reset in that user's home, the one before #153's next
  model step in the same task

### Requirement: The worker's session log outlives the reset

When each model step Igor starts in the worker's home exits, Igor SHALL copy that step's session
log, the file Claude Code writes for the session under `~/.claude/projects/`, into Igor's state
directory, before the next reset of that home. The steps are the worker, the model steps #153
runs after it, and #189's second run of the worker after a failed check. Igor's state directory
is the one #216's `graceful-handoff` requirement *A handoff states what was done, what remains, and who could continue* defines.

Igor SHALL redact each log as it copies it, with credential redaction, as `redact-state-branch`
(#217) defines it in *Credential redaction replaces every credential the Igor knows*, where *the
Igor* is a running Igor process, so that the copy holds no credential Igor registered that the worker printed, such as its
seat's token.
Only the user Igor runs as SHALL be able to read the copy. With a worker user, Igor
SHALL read the log as that user, without following a link and only where it is a regular file
whose hard-link count is 1, as #175's (`worker-user`) requirement *The Igor reads no file on the
worker's behalf through a link* has the Igor read any file the worker wrote; a log that fails that is not copied, and the record says so.

The run's record in the execution log (`executions.ndjson` on the state branch, the git branch
in the lore repository where Igor keeps its records, not the state directory on its host) SHALL
name each copy's path, where Igor wrote it, beside the session id of its step. For a flagged execution,
#216 then moves the copies into its `flagged-questions` directory. A copy whose move #216
refused stays where Igor wrote it (#216's decision 102), so the record may name a copy that #216
could not move, and that path still holds the copy.

#### Scenario: The record points at a log the reset did not delete

- **WHEN** a worker exits and Igor then resets its home for a later call
- **THEN** a copy of the worker's session log is in Igor's state directory, readable by Igor's
  user alone
- **AND** the run's record names that copy, which the reset left in place

#### Scenario: Every step's session log is copied

- **WHEN** the worker exits, and #153's bug hunt and prose pass then run in the same home, each
  after a reset
- **THEN** the state directory holds a copy of each of the three steps' session logs
- **AND** the run's record names each copy beside its step's session id

#### Scenario: A token the worker printed is redacted in the copy

- **WHEN** a worker runs `env`, which prints its seat's token into the session log, and exits
- **THEN** the copy in Igor's state directory holds `[redacted]` where the log held the token

#### Scenario: A session log the worker replaced with a link is not copied

- **WHEN** a worker running as a worker user replaces its session log with a link to a file only
  Igor can read
- **THEN** Igor copies nothing through the link
- **AND** the run's record says the log was not copied

### Requirement: Igor confirms its skills load before its first model call

The startup check is itself a model call. Before any other model call, Igor SHALL run `claude -p --model haiku --plugin-dir
<skills_dir> --setting-sources user --strict-mcp-config --output-format stream-json --verbose`.
It runs from an empty directory, with an environment holding only `PATH`, the network settings
the host is configured with, a `HOME` that is another empty directory, and one seat's token. Its
prompt is one word, such as `ok`, on stdin, as #175's (`worker-user`) *A prompt reaches claude on
stdin, never in its arguments* requires. The call SHALL run to its end, and its spend SHALL be
recorded against that seat as any call's is.

Which seat it spends:

- **Under `igor serve`, where a seat may be probed when Igor starts,** the call SHALL be the
  first seat probe Igor makes, of a seat due a probe by #143's
  (`read-seat-windows-from-the-stream`) *A seat nothing has read is probed on the Igor server
  with its own token*. It spends that seat, as any probe does,
  so the budget gate chooses no seat for it. Igor SHALL record its `rate_limit_event` as that
  seat's reading. Every limit and exclusion of a probe applies to it, such as #143's hourly
  limit and its skip of a refused seat, but the call keeps the arguments above. Its two directories
  are the ones #143's *A seat probe runs where only the Igor can write* places and checks.
- **Under `igor serve` where no seat may be probed when Igor starts,** because each has an
  unexpired reading or #143's hourly limit or back-off holds it off, the call spends the seat the
  gate chooses for it, as for any call, and does not wait for a held-off seat (Adam,
  2026-10-24). Where the gate has no seat to spend, the call waits as the paragraph after this
  list says.
- **Under `igor run`,** which makes no probe (#171), the call spends the run's implicit local
  seat, the one seat `igor run` makes from the token in `IGOR_RUN_TOKEN` (#171), through the
  gate; its two directories are new temporary directories.

Under `igor run` where neither `skills_dir` nor the person's installed skills exist, no check is
made (*Skills come from one plugin directory the server names*); where the run assembled a
plugin directory from the person's skills, the check runs against it. Where Igor can neither
probe a seat nor spend one the gate names when it starts, as when the gate has found every seat
refused by the provider, no call
is made, as #171's *A spend with no seat behind it is not made* requires. Igor starts, and runs
the check before its first model call, once a probe or the gate allows one.

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
for a probe or the gate to allow it.

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

#### Scenario: The check runs on haiku, with one seat's token

- **WHEN** Igor runs the check
- **THEN** its arguments include `--model haiku`
- **AND** it runs from an empty directory, with `HOME` set to another empty directory
- **AND** the call's environment holds one seat's token, and no other seat's token and no API
  key
- **AND** its `HOME` holds no stored login
- **AND** the spend is recorded against that seat

#### Scenario: Under igor serve, the check is a reserved seat's first probe

- **WHEN** `igor serve` starts, and its only seat keeps a reserve, a share of each usage window
  held back from Igors (#143), and has no reading
- **THEN** the check's call is that seat's probe, made with no choice by the gate
- **AND** its `rate_limit_event` is recorded as the seat's first reading, from which the gate
  then decides whether to draw on the seat

#### Scenario: Under igor serve, a seat with a reading is spent through the gate

- **WHEN** `igor serve` starts, and every seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses for it

#### Scenario: Under igor serve, a seat held off from probing is not waited for

- **WHEN** `igor serve` starts, one seat is due a probe but #143's hourly limit holds it off, and
  another seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses, and does not wait for the held-off seat's
  probe

#### Scenario: Under igor serve, a seat in back-off is not waited for

- **WHEN** `igor serve` starts, one seat is in #143's five-hour back-off after a failed probe, and
  another seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses, without waiting out the back-off

#### Scenario: A single held-off seat with no reading waits

- **WHEN** `igor serve` starts with one seat, which has no reading and is in #143's back-off
- **THEN** the gate has no seat to spend, and no check runs until that seat may be probed

#### Scenario: No seat to spend, no check yet

- **WHEN** Igor starts, and no seat can be probed and the gate names none, as when every seat
  is refused
- **THEN** Igor starts, makes no model call, and runs the check before its first model call once
  a probe or the gate allows one
- **AND** if that check fails, the process exits with status 78 then

#### Scenario: A call that fails after the init event is still judged on its list

- **WHEN** the check's call prints a `system/init` event listing every installed skill and then
  fails, such as on a refused token
- **THEN** the check passes on that list
- **AND** the failure is handled as that failure would be on any other call on that seat
