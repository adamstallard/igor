## Purpose

Where Igor's model steps load their skills from, how model calls name that directory, how the
worker's home starts each model step from Igor's template, how Igor keeps the worker's session
logs, and how Igor confirms its skills load before it works.

## ADDED Requirements

### Requirement: Skills come from one plugin directory the server names

`skills_dir`, the one plugin directory Igor's model steps SHALL load skills from, SHALL be
`/opt/igor/skills` unless `IGOR_SKILLS_DIR` in Igor's starting environment names another; a
relative one SHALL refuse the start, no other setting SHALL name it, and a lore file naming it
SHALL be refused as an unknown key. It holds `.claude-plugin/plugin.json` naming the plugin
`igor`, and its skills under `skills/` (*Each skill loads as `igor:<name>` from its own
directory*).

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

- **WHEN** `igor.config.yaml` sets `skills_dir: /tmp/x`
- **THEN** loading the configuration fails, as it does for any unknown key

### Requirement: Each skill loads as `igor:<name>` from its own directory

Each skill `<name>` SHALL be in `<skills_dir>/skills/<name>/` and SHALL load as `igor:<name>`,
the name a step SHALL use. Every path Igor names for the skill's scripts SHALL lie in that
directory.

#### Scenario: A step names a skill by its plugin name

- **WHEN** a model step directs the worker to use the skill `prose`
- **THEN** it names the skill `igor:prose`
- **AND** every path of a prose script Igor runs for that step is under
  `<skills_dir>/skills/prose/`

### Requirement: Without a skills directory, `igor run` links the installed skills its role uses

Without `skills_dir`, `igor run` SHALL assemble one in Igor's state directory, named by run id,
whose `skills/` holds a symbolic link to the resolved path of each `~/.claude/skills` entry, in
the `HOME` Igor starts with, that holds a `SKILL.md` and that the role's `skills` list names or
the list Igor's code SHALL keep of the skills it runs for every role names, and no other. Where
no entry matches, *An `igor run` with none of its role's skills installed loads no skills*
applies.

#### Scenario: run uses the skills the person installed

- **WHEN** `igor run` starts on a machine where `skills_dir` does not exist, the person's
  `~/.claude/skills` holds `prose`, `bug-hunter`, `spec-trace` and `slack-post`, each a link into
  a clone, and the role's `skills` list names `prose` and `bug-hunter`
- **THEN** each call that carries `--plugin-dir` names a directory the run assembled, whose
  `skills/` links to `prose`, `bug-hunter` and `spec-trace`, which #190 runs for every role, and
  not to `slack-post`, and they load as `igor:prose`, `igor:bug-hunter` and `igor:spec-trace`
- **AND** the run says as it starts that it loaded the skills in `~/.claude/skills`
- **AND** the startup check runs against that directory
- **AND** the directory is gone once the run ends

### Requirement: An `igor run` says it loaded the person's skills and removes what it assembled

An `igor run` that assembles its plugin directory SHALL treat it as `skills_dir` under every rule
of this capability that names `skills_dir`, SHALL say as it starts that it loaded the person's
skills, naming `~/.claude/skills`, and SHALL remove the assembled directory when it ends.

#### Scenario: A run that assembled its skills says so and cleans up

- **WHEN** `igor run` starts without `skills_dir`, assembles its plugin directory from the
  person's `~/.claude/skills`, and later ends
- **THEN** it says as it starts that it loaded the skills in `~/.claude/skills`
- **AND** the directory it assembled is gone

### Requirement: An `igor run` with none of its role's skills installed loads no skills

Where `skills_dir` does not exist and `~/.claude/skills` holds no entry the role's `skills` list
names or Igor's own code runs, as when `~/.claude/skills` is missing, `igor run` SHALL load no skills:
no call SHALL carry `--plugin-dir`, it SHALL make neither the startup check nor the refusals made
before its call (*Igor refuses a skills directory that is empty or holds more than skills*), and
it SHALL say at start the skills were not loaded, naming `skills_dir` and `~/.claude/skills`.

#### Scenario: run loads no skills where neither is installed

- **WHEN** `igor run` starts on a machine where neither `skills_dir` nor a skill the role uses is
  installed: `skills_dir` does not exist, and the person's `~/.claude/skills` holds no skill, or
  holds `slack-post` only and the role lists only `prose`
- **THEN** it says as it starts that the skills were not loaded, naming both paths
- **AND** no call it makes carries `--plugin-dir`, and it makes no startup check

### Requirement: Every model call names the plugin directory

Every `claude -p` Igor spawns SHALL carry `--plugin-dir <skills_dir>`, except the usage read
(`runUsage`), which SHALL NOT, and the calls of an `igor run` that loads no skills. No call SHALL
pass `--bare`. The worker invokes an `igor:<name>` skill through the Skill tool when its task calls
for it. Wherever `skills_dir` exists, all its skills load for every role, whatever the role's
`skills` list (#153); under `igor run` without it, that list and the skills Igor's code runs
decide what loads.

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

Before each model step in the worker's home, never between a step's calls, Igor SHALL replace
`~/.claude` and `~/.claude.json` with a fresh copy of a template in its installation, keeping
nothing, a stored login included, and reset nothing else there. A model step is one `claude -p`
session; those in the home are each worker run and #153's later steps, never triage or the
startup check.

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

#### Scenario: The rest of the home persists

- **WHEN** a task leaves `~/.gitconfig` and a file under `~/.cache` in the worker's home
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
- **THEN** the write is refused
- **AND** #175's start check confirms that the user cannot write it

#### Scenario: The template holds empty settings and a finished onboarding

- **WHEN** Igor resets the worker's home
- **THEN** `~/.claude/settings.json` holds `{}`, and `~/.claude` holds no skill and no
  `CLAUDE.md`
- **AND** `~/.claude.json` holds `{"hasCompletedOnboarding": true}`

### Requirement: Under `igor run`, a login the reset cannot reach is left alone

Under `igor run`, Igor SHALL neither hide nor refuse a login kept where setting `HOME` does not
move it, as in the macOS Keychain.

#### Scenario: Under igor run, a stored login outside the home is neither hidden nor refused

- **WHEN** `igor run` starts a call in the worker's home with `IGOR_RUN_TOKEN` in its
  environment, and the developer's own login is stored outside the home, such as in the macOS
  Keychain
- **THEN** Igor starts the call without refusing it and without hiding that login from it

### Requirement: The worker's home is its worker user's own, or one per `igor run`

With a worker user (#175), the worker's home SHALL be that user's own, lasting across runs.
Without one, in same-user mode (only `igor run`, the worker running as Igor's user), each run
SHALL have its own home in Igor's state directory, used as its worker's `HOME` across its tasks
and named by the run id #179 defines in *A run by hand removes its own trees as it releases
them*. The run SHALL remove it at its end; after a crash, #179's *A run removes what a run whose
process is gone left* does.

#### Scenario: A worker user's home is its own

- **WHEN** Igor runs a worker as the worker user of role `generalist`, rank 1
- **THEN** each `claude -p` it starts for that worker's task has `HOME` set to that user's own
  home
- **AND** that home is reset before each model step of the task

#### Scenario: Each igor run has a home of its own

- **WHEN** two `igor run`s of the role `generalist` run at once
- **THEN** each `claude -p` that either run starts in the worker's home has `HOME` set to its own run's
  home under Igor's state directory, which the other run never uses
- **AND** that home is reset as a worker user's is
- **AND** each run's home is gone once that run ends

#### Scenario: A plan removes nothing

- **WHEN** a person runs `igor run generalist --plan`, and Igor's state directory holds the home
  and the plugin directory, both of which a run keeps there, of an earlier run of `generalist`
  that crashed
- **THEN** the plan removes neither

#### Scenario: The next run removes a crashed run's home and plugin directory

- **WHEN** an `igor run` of `generalist` crashes, leaving its home and the plugin directory it
  assembled, and another `igor run` of `generalist` starts
- **THEN** the new run removes both at its start, with the crashed run's trees, as #179's
  (`concurrent-instances`) *A run removes what a run whose process is gone left* has it

### Requirement: Igor kills every process the worker user owns before each reset

With a worker user, Igor SHALL kill every process that user owns before every reset, by user; a
kill of the worker's process group alone, or of the user's systemd slice, does not meet this.
#175's *A kill, a release and a sweep reach what the worker owns* makes the same kill before a
tree is released.

#### Scenario: A process that escaped its group is killed before the next reset

- **WHEN** a worker running as a worker user starts a process that calls `setsid()` and keeps
  running after the worker exits
- **THEN** Igor kills it before the next reset in that user's home, the one before #153's next
  model step in the same task

### Requirement: The worker's session log outlives the reset

Igor SHALL copy the session log of each model step in the worker's home (the worker, #153's
later steps, #189's second worker run) into Igor's state directory when the step exits, before
the next reset, readable by Igor's user alone. It SHALL redact the log as it copies it, by #217's
*Credential redaction replaces every credential the Igor knows* (*the Igor*: a running Igor
process), so the copy holds no credential Igor registered that the worker printed.

#### Scenario: The record points at a log the reset did not delete

- **WHEN** a worker exits, leaving its session log under `~/.claude/projects/`, and Igor then
  resets its home for a later call
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

### Requirement: The execution record names each session log copy where Igor wrote it

The run's record in `executions.ndjson`, on the state branch, SHALL name each session log copy at
the path where Igor wrote it, beside its step's session id. That path may no longer hold the copy:
#216 may have moved it, or Igor deleted it.

#### Scenario: The record keeps naming each copy where Igor wrote it

- **WHEN** #216 moves a flagged execution's log copies into its `flagged-questions` directory
  and refuses to move one, or Igor deletes an execution's copies once a later execution of the
  item ends
- **THEN** the run's record may name a path that no longer holds its copy
- **AND** the copy whose move #216 refused is still at the path the record names

### Requirement: Igor deletes an item's earlier session log copies when an execution of it ends

When an execution of a work item ends, flagged or not, Igor SHALL delete the session log copies
of each execution of the item that started before it, has ended or whose process has stopped,
and left no flagged hold. An execution that leaves a flagged hold, which #216 puts on its item,
SHALL count as ended only once that hold is in place, and its copies SHALL be deleted only when
#216's `work-triage` has Igor delete its files, which it does on any release of its hold.

#### Scenario: An unflagged execution's log copies last until the item's next execution ends

- **WHEN** an execution of an item ends unflagged, and a later execution of the same item ends,
  flagged or not
- **THEN** Igor deletes the first execution's log copies, and keeps the later one's

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

#### Scenario: Igor deletes no flagged execution's log copies

- **WHEN** a flagged execution of an item ends, and a later execution of the same item ends
- **THEN** the flagged execution's copies remain until #216 deletes that run's files

### Requirement: Igor deletes only the session log copies it finds in its own state directory

Igor SHALL find the session log copies it deletes by listing its own state directory, never from
the execution record, and SHALL delete only regular files, following no link. Copies in another
host's state directory stay until an execution of the item ends on that host, or for good where
it never runs there again. Igor's state directory, where it keeps its files on a host, is the one
#216's `graceful-handoff` defines in *A handoff states what was done, what remains, and who could
continue*.

#### Scenario: A link among the log copies is not followed

- **WHEN** an execution of an item ends, and in Igor's state directory an earlier execution's
  log copy has been replaced by a link to a file elsewhere
- **THEN** Igor leaves the link in place and deletes nothing it points to, since it deletes only regular files

#### Scenario: Another host's log copies stay

- **WHEN** executions of an item ended unflagged on two hosts, and a later execution of the item
  ends on one of them
- **THEN** that host deletes its own earlier copies
- **AND** the other host's copies stay until an execution of the item ends there

### Requirement: Igor reads a worker user's session log as that user, through no link

With a worker user, Igor SHALL read each session log it copies as that user, without following a
link and only where it is a regular file whose hard-link count is 1, as #175's (`worker-user`)
*The Igor reads no file on the worker's behalf through a link* has the Igor read any file the
worker wrote. A log that fails this is not copied, and the run's record says so.

#### Scenario: A session log the worker replaced with a link is not copied

- **WHEN** a worker running as a worker user replaces its session log with a link to a file only
  Igor can read
- **THEN** Igor copies nothing through the link
- **AND** the run's record says the log was not copied

### Requirement: Igor confirms its skills load before its first model call

Unless it loads no skills, Igor SHALL run the startup check, to its end, before any other model
call, recording its spend against the seat it spends: `claude -p --model haiku --tools ""
--plugin-dir <skills_dir> --setting-sources user --strict-mcp-config --output-format stream-json
--verbose`. Unless its `system/init` event arrives and its `skills` list holds `igor:<name>` for
every entry under `<skills_dir>/skills/`, Igor SHALL refuse to start with status 78, under either
command.

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event
- **THEN** Igor refuses to start, saying it could not confirm its skills load

#### Scenario: The check runs on haiku, with one seat's token

- **WHEN** Igor runs the check
- **THEN** its arguments include `--model haiku` and `--tools ""`, so the call has no tools
- **AND** it runs from an empty directory, with `HOME` set to another empty directory
- **AND** the call's environment holds one seat's token, and no other seat's token and no API
  key
- **AND** its `HOME` holds no stored login
- **AND** the spend is recorded against that seat

#### Scenario: The check's environment and prompt hold nothing else

- **WHEN** Igor runs the check
- **THEN** its environment holds only `PATH`, the network settings the host is configured with,
  `HOME` and one seat's token
- **AND** its prompt is one word, such as `ok`, on stdin, as #175's (`worker-user`) *A prompt
  reaches claude on stdin, never in its arguments* requires

#### Scenario: A call that fails after the init event is still judged on its list

- **WHEN** the check's call prints a `system/init` event listing every installed skill and then
  fails, such as on a refused token
- **THEN** the check passes on that list
- **AND** the failure is handled as that failure would be on any other call on that seat

#### Scenario: Every installed skill loads

- **WHEN** the `system/init` event lists `igor:<name>` for every skill installed under
  `skills_dir`
- **THEN** Igor starts
- **AND** it reports each skill with the commit its files come from

#### Scenario: A skill that does not load stops the start

- **WHEN** a skill is installed under `skills_dir` but `igor:<name>` is missing from the
  event's `skills` list
- **THEN** Igor refuses to start, naming the skill
- **AND** the process exits with status 78, which #82's (`stopped-scope-visible`) *A process that
  refuses to start exits with status 78* requires under `igor serve`

### Requirement: Igor reports the commit each skill's files come from

For each skill, Igor SHALL report the commit of the git clone its entry under
`<skills_dir>/skills/` resolves to. For a clone root owns, Igor SHALL read it by trusting that
clone, with git's file-system monitor off, for that one command, and SHALL NOT change the
service user's git configuration. Igor reads its own user's clone as is, and trusts no other
owner's. Igor SHALL report a commit it cannot read (no clone, or an untrusted one) as
not checked, and the check passes on the list alone.

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

### Requirement: Igor refuses a skills directory that is empty or holds more than skills

Before the startup check's call, Igor SHALL refuse to start, naming the path, and exit with
status 78 when `<skills_dir>/skills/` is missing or holds no entry, when `skills_dir` holds any
entry besides `.claude-plugin/` and `skills/`, or when `.claude-plugin/` holds anything besides
a `plugin.json` whose only keys are `name`, `version` and `description`.

#### Scenario: An empty skills directory stops the start

- **WHEN** `<skills_dir>/skills/` is missing or holds no entry
- **THEN** Igor refuses to start, naming that path, and makes no call
- **AND** the process exits with status 78

#### Scenario: A plugin directory that holds more than skills stops the start

- **WHEN** `skills_dir` holds a `hooks/` directory, or `plugin.json` holds a `hooks` key
- **THEN** Igor refuses to start, naming what it found, and makes no call
- **AND** the process exits with status 78

### Requirement: A startup check whose probe #143 refuses fails the start

Where the startup check is a seat's first probe and #143 refuses to start it because one of its
two directories, its working directory and its `HOME`, fails #143's check of a probe directory
(its owner, its write bits, a `.claude` or `CLAUDE.md` in it) or cannot be created, Igor SHALL
refuse to start, naming the directory and what is wrong with it, and exit with status 78.

#### Scenario: A probe #143 refuses stops the start

- **WHEN** the startup check is a seat's first seat probe under `igor serve`, and #143 refuses to
  start it because one of its two directories, its working directory and its `HOME`, fails #143's check
- **THEN** Igor refuses to start, naming that directory and what is wrong with it
- **AND** the process exits with status 78

### Requirement: Under `igor run`, the startup check spends the run's seat in directories it then removes

Under `igor run`, which makes no probe (#171), the startup check SHALL spend the run's implicit
local seat, made from `IGOR_RUN_TOKEN`, through the gate. Its working directory and `HOME` SHALL
be new directories under Igor's state directory, named by the run's id, not the system's
temporary directory. Igor SHALL remove both once the call ends, and an `igor run` that finds them
left by an earlier run whose process is gone SHALL remove them with that run's home and plugin
directory.

#### Scenario: The `igor run` check leaves no directories behind

- **WHEN** an `igor run` startup check's call ends
- **THEN** its working directory and its `HOME` under Igor's state directory are gone

#### Scenario: Under igor run, the check's directories are under the state directory

- **WHEN** `igor run` makes its startup check
- **THEN** the check's working directory and `HOME` are new directories under Igor's state
  directory, not under the system's temporary directory

### Requirement: Under `igor serve`, the startup check is the first probe of a seat that may be probed

Under `igor serve`, where a seat is due a probe by #143's *A seat nothing has read is probed on
the Igor server with its own token* and not held off at start, the startup check SHALL be
the first seat probe Igor makes. It spends that seat, the gate choosing none, with the check's
arguments, in the directories #143's *A seat probe runs where only the Igor can write* places and
checks, under every limit and exclusion of a probe; Igor SHALL record its `rate_limit_event` as
the seat's reading.

#### Scenario: Under igor serve, the check is a reserved seat's first probe

- **WHEN** `igor serve` starts, and its only seat keeps a reserve, a share of each usage window
  held back from Igors (#143), and has no reading
- **THEN** the check's call is that seat's probe, made with no choice by the gate
- **AND** its `rate_limit_event` is recorded as the seat's first reading, from which the gate
  then decides whether to draw on the seat

### Requirement: A startup check with no seat to probe spends the seat the gate chooses

Under `igor serve` with no seat to probe at start, because each has an unexpired reading or
#143's hourly limit or back-off holds it off, the startup check SHALL spend the seat the gate
chooses, never waiting for a held-off seat. Under either command, with no seat to probe or spend,
as when the provider refuses every seat, Igor SHALL start, make no call (#171's *A spend with no
seat behind it is not made*), and run the check before its first model call, once a probe or the
gate allows.

#### Scenario: Under igor serve, a seat with a reading is spent through the gate

- **WHEN** `igor serve` starts, and every seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses for it

#### Scenario: Under igor serve, a seat held off from probing is not waited for

- **WHEN** `igor serve` starts, one seat is due a probe but #143's hourly limit holds it off, and
  another seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses, and does not wait for the held-off seat's
  probe

#### Scenario: Under igor serve, a seat in back-off is not waited for

- **WHEN** `igor serve` starts, one seat is in #143's back-off of up to five hours after a probe that received no
  `rate_limit_event`, and
  another seat has an unexpired reading
- **THEN** the check spends the seat the gate chooses, without waiting out the back-off

#### Scenario: A single held-off seat with no reading waits

- **WHEN** `igor serve` starts with one seat, which keeps a reserve, so the gate draws on it only
  once it has a reading, has no reading, and is in #143's back-off
- **THEN** the gate has no seat to spend, and no check runs until that seat may be probed

#### Scenario: No seat to spend, no check yet

- **WHEN** Igor starts, and no seat can be probed and the gate names none, as when every seat
  is refused
- **THEN** Igor starts, makes no model call, and runs the check before its first model call once
  a probe or the gate allows one
- **AND** if that check fails, the process exits with status 78 then
