## Purpose

Where Igor's model steps load their skills from, how model calls name that directory, how the
worker's home starts each model step from Igor's template, how Igor keeps the worker's session
logs, and how Igor confirms its skills load before it works.

## ADDED Requirements

### Requirement: Skills come from one plugin directory the server names

Igor's model steps SHALL load their skills from one Claude Code plugin directory, `skills_dir`:
`/opt/igor/skills`, or the path `IGOR_SKILLS_DIR` names in its starting environment, which SHALL be
absolute or refuse the start. Nothing else sets it. It holds `.claude-plugin/plugin.json` naming the
plugin `igor`, and each skill in `skills/<name>/`. Igor SHALL call each skill `igor:<name>`, and
give its scripts paths in its `skills/<name>/`. Without `skills_dir`, `igor serve` SHALL refuse to
start.

#### Scenario: serve refuses a missing skills directory

- **WHEN** `igor serve` starts and `skills_dir` does not exist
- **THEN** it refuses to start, naming `skills_dir`
- **AND** the process exits with status 78

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

- **WHEN** `igor.config.yaml`, or any other lore file, sets `skills_dir: /tmp/x`
- **THEN** loading it fails, as it does for any unknown key

#### Scenario: A step names a skill by its plugin name

- **WHEN** a model step directs the worker to use the skill `prose`
- **THEN** it names the skill `igor:prose`
- **AND** every path of a prose script Igor runs for that step is under
  `<skills_dir>/skills/prose/`

### Requirement: Without the server's directory, igor run loads the person's skills

Without `skills_dir`, where `~/.claude/skills` in the starting `HOME` holds an entry that has a
`SKILL.md` and that the role's `skills` list (#153) names or whose script Igor's code runs for every
role, `igor run` SHALL use as `skills_dir` a plugin directory it assembles in the state directory,
named with the run's id, and SHALL remove it when it ends. Its `skills/` links each such entry, by
symbolic link to the resolved path, and no other. Where it holds no such entry, it SHALL load no
skills.

#### Scenario: run uses the skills the person installed

- **WHEN** `igor run` starts on a machine where `skills_dir` does not exist, the person's
  `~/.claude/skills` holds `prose`, `bug-hunter`, `spec-trace` and `slack-post`, each a link into
  a clone, and the role's `skills` list names `prose` and `bug-hunter`
- **THEN** each call that carries `--plugin-dir` names a directory the run assembled, whose name
  holds the run's id, such as `<state directory>/plugin/<role>-<run>`, which holds a
  `.claude-plugin/plugin.json` naming the plugin `igor`, as any `skills_dir` does, and whose
  `skills/` links to `prose`, `bug-hunter` and `spec-trace`, which #190 runs for every role, and not
  to `slack-post`, and they load as `igor:prose`, `igor:bug-hunter` and `igor:spec-trace`
- **AND** the run says as it starts that it loaded the skills in `~/.claude/skills`
- **AND** the startup check runs against that directory
- **AND** the directory is gone once the run ends

#### Scenario: run loads no skills where neither is installed

- **WHEN** `igor run` starts on a machine where `skills_dir` does not exist, and the person's
  `~/.claude/skills` is missing or holds no skill, or holds `slack-post` only and the role lists
  only `prose`
- **THEN** it says as it starts that the skills were not loaded, naming `skills_dir` and
  `~/.claude/skills`
- **AND** no call it makes carries `--plugin-dir`, and it makes no startup check
- **AND** where the role lists `prose`, #153 then refuses to start the run, as it refuses any
  role that lists a skill not loaded

#### Scenario: A skill Igor's code runs for every role is on a list in its code

- **WHEN** a later change to Igor's code makes it run another skill's script for every role
- **THEN** that change also adds the skill to the list of such skills held in Igor's code, which
  until then names only `spec-trace`
- **AND** `igor run` then links that skill as it links `spec-trace`

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>`, except the usage
read (`runUsage`) and the calls of an `igor run` that loads no skills, and none SHALL pass
`--bare`. A *model step* is one part of Igor's work done by a model: one `claude -p`, alone or
with the `claude -p --resume` calls that continue its session. Under `igor serve` the flag loads
every skill under `skills_dir` for every role, whatever the role's `skills` list (#153) says.

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Every other model call names the directory

- **WHEN** Igor spawns a `claude -p` that is neither the worker, triage nor the usage read, such
  as #143's seat probe, the startup check, or a model step #153 runs, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: A resumed call continues its step

- **WHEN** #153's step that writes a post resumes, with `claude -p --resume`, the session in which
  it wrote its reader goals
- **THEN** the first call and the resumed call are one model step

#### Scenario: The worker invokes its skills itself

- **WHEN** a worker's task calls for an `igor:<name>` skill
- **THEN** the worker invokes it itself, through the Skill tool

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

### Requirement: The worker's home is its user's, or its run's

With a worker user (#175), the worker's home SHALL be that user's own, lasting across runs. With
none, in same-user mode, which only `igor run` uses, each run SHALL have its own home for its tasks,
named by the run id each `igor run` picks under #179's *The sweep removes trees by rank, never by
age*, in Igor's state directory as #216's *A handoff states what was done, what remains, and who
could continue* defines it. Igor SHALL set the worker's `HOME` to it and remove it when the run
ends.

#### Scenario: A worker user's home is its own

- **WHEN** Igor runs a worker as the worker user of role `generalist`, rank 1
- **THEN** each `claude -p` it starts for that worker's task has `HOME` set to that user's own
  home
- **AND** that home is reset before each model step of the task

#### Scenario: Each igor run has a home of its own

- **WHEN** two `igor run`s of the role `generalist` run at once
- **THEN** each `claude -p` that either run starts in the worker's home has `HOME` set to its own
  run's home, such as `<state directory>/home/<role>-<run>`, which the other run never uses,
  where the state directory is where Igor keeps its files on each host
- **AND** that home is reset as a worker user's is
- **AND** each run's home is gone once that run ends

#### Scenario: A crashed run's home and plugin directory are removed

- **WHEN** an `igor run` of `generalist` crashes, leaving its home and the plugin directory it
  assembled, and a later `igor run` of `generalist` starts
- **THEN** the later run removes both at its start, with the crashed run's trees, under #179's
  *The sweep removes trees by rank, never by age*

#### Scenario: A plan removes nothing

- **WHEN** a person runs `igor run generalist --plan`, and Igor's state directory holds the home
  and the plugin directory, both of which a run keeps there, of an earlier run of `generalist`
  that crashed
- **THEN** the plan removes neither, as #179's sweep rule has it: `igor run --plan` removes
  nothing

### Requirement: Every model step in the worker's home starts from Igor's template

Before every model step Igor starts in the worker's home (the worker, and the steps #153 runs after
it), Igor SHALL replace `~/.claude` and `~/.claude.json` with a fresh copy of a template in Igor's
installation, keeping nothing, a stored login included, and SHALL NOT reset anything else in the
home, or reset it between one step's calls. The template SHALL hold a `settings.json` of `{}`, no
skills or `CLAUDE.md`, and a `~/.claude.json` of `{"hasCompletedOnboarding": true}`.

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

#### Scenario: Triage and the startup check do not run in the worker's home

- **WHEN** Igor runs triage or the startup check
- **THEN** neither runs in the worker's home

#### Scenario: A stored login does not survive the reset

- **WHEN** the worker's home holds `~/.claude/.credentials.json` and Igor resets `~/.claude`
- **THEN** that file is gone
- **AND** the next call in that home authenticates with its seat's token, from its environment

#### Scenario: Under igor run, a stored login outside the home is neither hidden nor refused

- **WHEN** `igor run` starts a call, such as one in the worker's home with `IGOR_RUN_TOKEN` in its
  environment, and the developer's own login is stored where setting `HOME` does not move it,
  such as in the macOS Keychain
- **THEN** Igor starts the call without refusing it and without hiding that login from it

#### Scenario: The rest of the home persists

- **WHEN** a task leaves `~/.gitconfig` and a file a repository's tests cache under `~/.cache` in
  the worker's home
- **AND** Igor starts the next task in that home
- **THEN** each of those files is still there

#### Scenario: A step's resumed call finds its session

- **WHEN** a model step writes its reader goals in a first `claude -p`, and Igor then runs
  `claude -p --resume` for that step's session in the same home
- **THEN** Igor does not reset the home between the two calls
- **AND** the resumed call continues the first call's session

#### Scenario: The worker cannot change the template

- **WHEN** a worker running as a worker user tries to write into the template Igor resets the
  home from
- **THEN** the write is refused, as #175's start check confirms

### Requirement: A worker user's processes are killed before each reset

With a worker user, before every reset of its home, Igor SHALL kill every process that user owns, by
user or by the user's systemd slice, whichever kills them all. A kill of the worker's process group
alone does not meet this, since each command a worker runs starts in a session of its own.

#### Scenario: A process that escaped its group is killed before the next reset

- **WHEN** a worker running as a worker user starts a process that calls `setsid()` and keeps
  running after the worker exits
- **THEN** Igor kills it before the next reset in that user's home, the one before #153's next
  model step in the same task

### Requirement: The worker's session log outlives the reset

When a model step in the worker's home exits, Igor SHALL copy its session log, in
`~/.claude/projects/`, to the state directory before the next reset, redacted and readable only by
Igor's user. With a worker user, it SHALL copy only a regular file with one hard link, reading it as
that user without following a link, as #175 requires Igor to read any file the worker wrote. The
run's record SHALL name each copy beside its step's session id, and say a log failing this was not
copied.

#### Scenario: The record points at a log the reset did not delete

- **WHEN** a worker exits and Igor then resets its home for a later call
- **THEN** a copy of the worker's session log is in Igor's state directory, readable by Igor's
  user alone
- **AND** the run's record, `executions.ndjson`, names that copy, which the reset left in place
- **AND** that record is in the execution log on the state branch, the git branch in the lore
  repository where Igor keeps its records, not in the state directory on Igor's host

#### Scenario: Every step's session log is copied

- **WHEN** the worker exits, and #153's bug hunt and prose pass then run in the same home, each
  after a reset
- **THEN** the state directory holds a copy of each of the three steps' session logs
- **AND** the run's record names each copy beside its step's session id

#### Scenario: A second worker run's session log is copied

- **WHEN** #189 runs the worker a second time after a failed check
- **THEN** that run's session log is copied as the first run's is

#### Scenario: A token the worker printed is redacted in the copy

- **WHEN** a worker runs `env`, which prints its seat's token into the session log, and exits
- **THEN** the copy in Igor's state directory holds `[redacted]` where the log held the token,
  since Igor redacts each copy with credential redaction, as #217 defines it in *Credential
  redaction replaces every credential the Igor knows*, where *the Igor* is a running Igor process

#### Scenario: A session log the worker replaced with a link is not copied

- **WHEN** a worker running as a worker user replaces its session log with a link, or a hard
  link, to a file only Igor can read
- **THEN** Igor copies nothing through the link, as #175's *The Igor reads no file on the
  worker's behalf through a link* has it read any file the worker wrote
- **AND** the run's record says the log was not copied

#### Scenario: A flagged execution's moved copy stays named

- **WHEN** #216 moves a flagged execution's copies into its `flagged-questions` directory, and
  refuses to move one of them
- **THEN** the record still names each copy, moved or not, at the path where Igor wrote it, so
  for a copy #216 moved that path no longer holds the copy
- **AND** that path still holds the copy #216 did not move

### Requirement: Igor deletes an item's earlier session log copies when an execution of it ends

When an execution of an item ends, Igor SHALL delete the log copies of each execution of it started
earlier that has ended or whose process stopped, and either way left no flagged hold. A *flagged*
execution, one whose item #216 puts a flagged hold on, SHALL count as ended only once the hold is in
place, and its copies SHALL go only when #216's `work-triage` has them deleted. Igor SHALL find
copies by listing its state directory, not the record, and delete only regular files, following no
link.

#### Scenario: An unflagged execution's log copies last until the item's next execution ends

- **WHEN** an execution of an item ends unflagged, and a later execution of the same item ends,
  flagged or not
- **THEN** Igor deletes the first execution's log copies, and keeps the later one's
- **AND** the record may then name a copy Igor has deleted

#### Scenario: A run #216 flags that asks no question counts as unflagged

- **WHEN** #216 marks an execution as flagged in its own sense, the execution stops without asking
  a question, so #216 puts no flagged hold on its item, and a later execution of the item on the
  same host ends
- **THEN** Igor deletes the first execution's log copies, as for any unflagged execution

#### Scenario: A running execution's log copies stay

- **WHEN** two executions of one item run at once on one host, and the later one ends first
- **THEN** Igor keeps the earlier execution's log copies, since it is still running

#### Scenario: A crashed execution's log copies go when the next execution ends

- **WHEN** an execution of an item never ends because its Igor process stopped, and a later
  execution of the same item on the same host ends
- **THEN** Igor deletes the stopped execution's log copies, and those of any unflagged execution
  before it

#### Scenario: A flagged execution's hold is in place when it counts as ended

- **WHEN** an execution of an item stops working, flagged, and a later execution of the same
  item on the same host ends before #216 has put the flagged hold
- **THEN** the flagged execution does not yet count as ended, so the later end keeps its copies

#### Scenario: A link among the log copies is not followed

- **WHEN** an execution of an item ends, and in Igor's state directory an earlier execution's
  log copy has been replaced by a link to a file elsewhere
- **THEN** Igor leaves the link in place and deletes nothing it points to, since it deletes only
  regular files

#### Scenario: Igor deletes no flagged execution's log copies

- **WHEN** a flagged execution of an item ends, and a later execution of the same item ends
- **THEN** the flagged execution's copies remain until #216 deletes the flagged execution's
  files, which it does on any release of its hold, by `igor release` or by an edit to the item
  from someone with write access

#### Scenario: Another host's copies stay until the item ends there

- **WHEN** an execution of an item ends on one host, and earlier executions of the item left
  copies in another host's state directory
- **THEN** those copies stay until an execution of the item ends on that host, and stay for good
  where the item never runs there again

### Requirement: Igor confirms its skills load before its first model call

Unless an `igor run` loads no skills, Igor's first model call SHALL be a startup check: `claude -p
--model haiku --tools "" --plugin-dir <skills_dir> --setting-sources user --strict-mcp-config
--output-format stream-json --verbose`, under `igor serve` a seat's first probe where *The startup
check spends a seat it may probe, or else the gate's* says. Igor SHALL refuse to start, exiting
78, unless its `system/init` event lists `igor:<name>` for each entry in `<skills_dir>/skills/`.

#### Scenario: Every installed skill loads

- **WHEN** the `system/init` event lists `igor:<name>` for every skill installed under
  `skills_dir`
- **THEN** Igor starts
- **AND** it reports each skill with the commit its files come from, or as not checked where
  *Igor reports the commit each skill loads from* says so

#### Scenario: A skill that does not load stops the start

- **WHEN** a skill is installed under `skills_dir` but `igor:<name>` is missing from the
  event's `skills` list
- **THEN** Igor refuses to start, naming the skill
- **AND** the process exits with status 78

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load
- **AND** the process exits with status 78

#### Scenario: A call that fails after the init event is still judged on its list

- **WHEN** the check's call prints a `system/init` event listing every installed skill and then
  fails, such as on a refused token
- **THEN** the check passes on that list
- **AND** the failure is handled as that failure would be on any other call on that seat

#### Scenario: The check runs on haiku, with one seat's token

- **WHEN** Igor runs the check
- **THEN** its arguments include `--model haiku` and `--tools ""`, so the call has no tools
- **AND** it runs from an empty directory, with `HOME` set to another empty directory
- **AND** the call's environment holds only `PATH`, the network settings the host is configured
  with, that `HOME` and one seat's token, so no other seat's token and no API key
- **AND** its `HOME` holds no stored login
- **AND** its prompt is one word, such as `ok`, on stdin, as #175's *A prompt reaches claude on
  stdin, never in its arguments* requires
- **AND** the call runs to its end
- **AND** the spend is recorded against that seat, as any call's is

### Requirement: The startup check spends a seat it may probe, or else the gate's

Under `igor serve` the startup check's call SHALL be the first probe of a seat due one under #143's
*A seat nothing has read is probed on the Igor server with its own token* and not held off by #143's
hourly limit or back-off, or else spend the seat the budget gate chooses. Under `igor run` it SHALL
spend the run's local seat, running in two new directories under Igor's state directory, removed
after the call. With no seat to spend, Igor SHALL start, and check once a probe or the gate allows.

#### Scenario: Under igor serve, the check is a reserved seat's first probe

- **WHEN** `igor serve` starts, and its only seat keeps a reserve, a share of each usage window
  held back from Igors (#143), and has no reading
- **THEN** the check's call is that seat's probe, made with no choice by the gate
- **AND** its `rate_limit_event` is recorded as the seat's first reading, from which the gate
  then decides whether to draw on the seat

#### Scenario: The check's probe is recorded and limited as any probe is

- **WHEN** the startup check's call under `igor serve` is a seat's probe
- **THEN** Igor records its `rate_limit_event` as that seat's reading
- **AND** every limit and exclusion of a probe applies to it, such as #143's hourly limit and its
  skip of a refused seat
- **AND** its working directory and `HOME` are the two directories #143's *A seat probe runs where
  only the Igor can write* places and checks

#### Scenario: A probe #143 refuses stops the start

- **WHEN** the startup check is a seat's first seat probe under `igor serve`, and #143's *A seat
  probe runs where only the Igor can write* refuses to start it because one of its two
  directories, its working directory and its `HOME`, fails #143's check or cannot be created
- **THEN** Igor refuses to start, naming that directory and what is wrong with it, rather than
  wait for a later seat probe
- **AND** the process exits with status 78

#### Scenario: Under igor serve, a seat with a reading is spent through the gate

- **WHEN** `igor serve` starts, and every seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses for it

#### Scenario: Under igor serve, a seat held off from probing is not waited for

- **WHEN** `igor serve` starts, one seat is due a probe but #143's hourly limit holds it off, and
  another seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses, and does not wait for the held-off seat's
  probe

#### Scenario: Under igor serve, a seat in back-off is not waited for

- **WHEN** `igor serve` starts, one seat is in #143's back-off of up to five hours after a probe
  that received no `rate_limit_event`, and another seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses, without waiting out the back-off

#### Scenario: A single held-off seat with no reading waits

- **WHEN** `igor serve` starts with one seat, and that seat keeps a reserve, has no reading, and
  is in #143's back-off
- **THEN** the gate has no seat to spend, since it draws on a seat that keeps a reserve only once
  the seat has a reading
- **AND** no check runs until that seat may be probed

#### Scenario: No seat to spend, no check yet

- **WHEN** Igor starts, and no seat can be probed and the gate names none, as when every seat
  is refused by the provider
- **THEN** Igor starts, makes no model call, as #171's *A spend with no seat behind it is not
  made* requires, and runs the check before its first model call once a probe or the gate allows
  one
- **AND** if that check fails, the process exits with status 78 then

#### Scenario: Under igor run, the check spends the run's local seat

- **WHEN** `igor run`, which makes no seat probe (#171), makes its startup check
- **THEN** the check spends, through the gate, the run's implicit local seat, the one seat
  `igor run` makes from the token in `IGOR_RUN_TOKEN` (#171)

#### Scenario: Under igor run, the check's directories are under the state directory

- **WHEN** `igor run` makes its startup check
- **THEN** the check's call runs with two new directories under Igor's state directory as its
  working directory and its `HOME`, not under the system's temporary directory, which other users
  of the host can write

#### Scenario: The `igor run` check leaves no directories behind

- **WHEN** an `igor run` startup check's call ends
- **THEN** its working directory and its `HOME` under Igor's state directory are gone

#### Scenario: A crashed run's check directories are removed

- **WHEN** an `igor run` finds the startup check's two directories left by an earlier run whose
  process is gone
- **THEN** it removes them with that run's home and plugin directory

### Requirement: Igor refuses a skills directory that is empty or holds more than skills

Where Igor makes a startup check, before its call, Igor SHALL refuse to start, naming the path and
exiting with status 78, when `<skills_dir>/skills/` is missing or holds no entry, when
`skills_dir` holds any entry besides `.claude-plugin/` and `skills/`, when `.claude-plugin/` holds
anything besides `plugin.json`, or when `plugin.json` holds any key besides `name`, `version` and
`description`.

#### Scenario: An empty skills directory stops the start

- **WHEN** `<skills_dir>/skills/` is missing or holds no entry
- **THEN** Igor refuses to start, naming that path, and makes no call
- **AND** the process exits with status 78

#### Scenario: A plugin directory that holds more than skills stops the start

- **WHEN** `skills_dir` holds a `hooks/` directory, or `plugin.json` holds a `hooks` key
- **THEN** Igor refuses to start, naming what it found, and makes no call
- **AND** the process exits with status 78

### Requirement: Igor reports the commit each skill loads from

Igor SHALL report, for each skill, the commit of the git clone its entry under
`<skills_dir>/skills/` resolves to. For a clone root owns, Igor SHALL trust that clone
(`safe.directory`), with git's file-system monitor off, for the one command reading the commit,
without changing the service user's git configuration. Igor SHALL trust no clone owned by a user
other than root or itself. Where the commit cannot be read so, Igor SHALL report it as not checked,
and the check passes on the list alone.

#### Scenario: Each skill is reported with its commit

- **WHEN** every installed skill loads, and each skill's entry resolves into a git clone Igor
  trusts
- **THEN** Igor reports each skill with the commit its files come from

#### Scenario: A root-owned clone's commit is read

- **WHEN** every installed skill loads, and the clone a skill's entry resolves to is owned by
  root while Igor runs as its service user
- **THEN** Igor reports that skill with the clone's commit
- **AND** the command that reads it names the clone in git's `safe.directory`, without which git
  refuses to work in a clone another user owns
- **AND** the service user's `~/.gitconfig` is unchanged

#### Scenario: A clone another user owns is not trusted

- **WHEN** every installed skill loads, and the clone a skill's entry resolves to is owned by a
  user who is neither root nor the user Igor runs as
- **THEN** Igor starts
- **AND** it reports that skill's commit as not checked, having run no git command in that clone

#### Scenario: An unreadable commit is reported as not checked

- **WHEN** every installed skill loads, but the commit of one skill's files cannot be read, or
  its entry is not in a git clone
- **THEN** Igor starts
- **AND** it reports that skill's commit as not checked
