## Purpose

Where Igor's model steps load their skills from, how model calls name that directory, how the
worker's home starts each model step from Igor's template, how Igor keeps the worker's session
logs, and how Igor confirms its skills load before it works.

A *model step* is one part of Igor's work done by a model: one `claude -p`, alone or with the
`claude -p --resume` calls that continue its session. The worker, #153's later steps, triage and
the startup check are each a model step; only the worker and #153's later steps run in the
worker's home. Igor's *state directory* is where Igor keeps its own files on its host, as #216's
*A handoff states what was done, what remains, and who could continue* defines it. The *service
user* is the Unix user `igor serve` runs as. In *same-user mode*, which only `igor run` uses, there
is no worker user (#175), and the worker runs as the user Igor runs as. A *local host* is a machine
on which Igor runs its workers as its own child processes: the machine `igor serve` runs on, as
#175 uses the term, and the machine of a person running `igor run`. A *skill* is an entry under a
`skills/` directory, a directory or a link to one, whose top level holds a `SKILL.md`; any other
entry there is not a skill and is ignored. A run's *run directories* are its home, the plugin
directory it assembled, and the startup check's and triage's directories.

## ADDED Requirements

### Requirement: Skills come from one plugin directory the server names

Igor's model steps SHALL load their skills from one Claude Code plugin directory, `skills_dir`:
`/opt/igor/skills`, or the path `IGOR_SKILLS_DIR` names in its starting environment, which SHALL be
absolute or refuse the start. It holds `.claude-plugin/plugin.json` naming the
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
- **AND** the process exits with status 78

#### Scenario: A lore file cannot name the directory

- **WHEN** `igor.config.yaml`, a role file or a seat file (#171) sets `skills_dir: /tmp/x`
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
  `skills/` links to `prose`, `bug-hunter` and `spec-trace` (the last because Igor's own code runs
  it for every role), and not
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

### Requirement: Every model call names the plugin directory

Every `claude -p` process Igor spawns SHALL carry `--plugin-dir <skills_dir>`, except the calls
of an `igor run` that loads no skills, and none SHALL pass `--bare`. Under `igor serve`, every
skill under `skills_dir` SHALL load for every role, whatever the role's `skills` list (#153) says.

#### Scenario: The worker names the directory

- **WHEN** Igor spawns a worker, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Triage names the directory

- **WHEN** Igor spawns a triage call, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Every other model call names the directory

- **WHEN** Igor spawns a `claude -p` that is neither the worker nor triage, such as #143's seat
  probe, the startup check, or a model step #153 runs, and `skills_dir` exists
- **THEN** its arguments include `--plugin-dir` followed by `skills_dir`

#### Scenario: Under igor serve, every installed skill loads for every role

- **WHEN** `skills_dir` holds `prose`, `bug-hunter` and `spec-trace`, and `igor serve` runs a
  worker for a role whose `skills` list names only `prose`
- **THEN** the worker's `system/init` event lists `igor:prose`, `igor:bug-hunter` and
  `igor:spec-trace`

#### Scenario: No call passes --bare

- **WHEN** Igor spawns any `claude -p`
- **THEN** its arguments do not include `--bare`

### Requirement: No call loads the worked repository's settings

No `claude -p` process Igor spawns, the startup check included, SHALL load
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

Each worker SHALL have a home of its own, which neither Igor's own process, nor a worker of another role, nor
another worker running at the same time uses, and Igor SHALL set the worker's `HOME` to it for
every call it starts in that home. Triage and the startup check SHALL NOT run in it. A local host
meets this as *A local worker's home is its worker user's, or its run's* states.

#### Scenario: A worker user's home is its own

- **WHEN** Igor runs a worker as the worker user of role `generalist`
- **THEN** each `claude -p` it starts for that worker's task has `HOME` set to that user's own
  home
- **AND** that home is reset before each model step of the task

#### Scenario: Triage and the startup check do not run in the worker's home

- **WHEN** Igor runs triage or the startup check
- **THEN** neither runs in the worker's home

#### Scenario: Each igor run has a home of its own

- **WHEN** two `igor run`s of the role `generalist` run at once
- **THEN** each `claude -p` that either run starts in the worker's home has `HOME` set to its own
  run's home, such as `<state directory>/home/<role>-<run>`, which the other run never uses
- **AND** that home is reset as a worker user's is
- **AND** each run's home is gone once that run ends

### Requirement: A local worker's home is its worker user's, or its run's

On a local host, with a worker user (#175), the worker's home SHALL be that user's own, lasting
across runs. With none, in same-user mode, which only `igor run` uses, each run SHALL have its own
home for its tasks, named by the run's id, in Igor's state directory. Igor SHALL remove a run's
home when the run ends.

#### Scenario: A worker user's home lasts across runs

- **WHEN** a worker running as the worker user of role `generalist` leaves `~/.gitconfig` in its
  home, and Igor later runs another worker of `generalist` as that user
- **THEN** the later worker's `HOME` is the same home, and `~/.gitconfig` is still there

#### Scenario: A run's home is named by its id in the state directory

- **WHEN** an `igor run` of the role `generalist` with run id `r1` starts a call in the worker's
  home
- **THEN** that call's `HOME` is a directory in Igor's state directory whose name holds `r1`;
  `<state directory>/home/generalist-r1` is one such path

### Requirement: An igor run removes what a crashed run of its role left

Each `igor run` SHALL pick a run id and, while it runs, hold an exclusive lock on its own file,
`<role>-<run id>.lock`, in Igor's state directory, which the system frees when its process ends.
Before its first cycle, an `igor run` SHALL remove the run directories of each earlier run of its
role whose lock it can take, and nothing of a run whose lock it cannot take. `igor run --plan` SHALL
remove nothing.

#### Scenario: A crashed run's home and plugin directory are removed

- **WHEN** an `igor run` of `generalist` crashes, leaving its home and the plugin directory it
  assembled, and a later `igor run` of `generalist` starts
- **THEN** the later run takes the crashed run's lock, and removes both at its start

#### Scenario: A crashed run's triage directory is removed

- **WHEN** an `igor run` of `generalist` crashes during a triage call, leaving that call's `HOME`
  in the state directory, and a later `igor run` of `generalist` starts
- **THEN** the later run removes that directory at its start, with the crashed run's home

#### Scenario: A live run's home is left alone

- **WHEN** an `igor run` of `generalist` starts while another `igor run` of `generalist` is still
  running
- **THEN** it cannot take the other run's lock, and removes nothing of that run's

#### Scenario: A plan removes nothing

- **WHEN** a person runs `igor run generalist --plan`, and Igor's state directory holds the home
  and the plugin directory, both of which a run keeps there, of an earlier run of `generalist`
  that crashed
- **THEN** the plan removes neither

### Requirement: Under igor run, triage runs in an empty home of its own

Under `igor run`, Igor SHALL run each triage call with `HOME` set to a new, empty directory in the
state directory, named with the run's id, and SHALL remove it after the call. Triage SHALL NOT
run with the `HOME` Igor started with, because the person's hooks and `CLAUDE.md` there would load
into it.

#### Scenario: Triage under igor run does not load the person's Claude Code setup

- **WHEN** the person's own `~/.claude` holds a hook and a `CLAUDE.md`, and `igor run` triages an
  item
- **THEN** the triage call's `HOME` is a new, empty directory under the state directory whose name
  holds the run's id
- **AND** the hook does not run and that `CLAUDE.md` does not load
- **AND** the directory is gone once the call ends

### Requirement: Igor follows no link when it resets, removes or copies the worker's files

Igor SHALL replace `~/.claude` and `~/.claude.json` in a reset, and remove a run's run directories,
without following any link in them, so it removes a link and never what it names. Igor SHALL write
each session log copy to a file it creates new, failing where any entry already has that path, and
SHALL follow no link in doing so.

#### Scenario: A link in a run's home is removed, not followed

- **WHEN** a worker in same-user mode leaves in the run's home a link to a file the person owns,
  and the run ends
- **THEN** the run's home is gone, and the file the link named is unchanged

#### Scenario: A link the worker made in place of ~/.claude is removed by the reset, not followed

- **WHEN** a worker in same-user mode replaces `~/.claude` with a link to a directory the person
  owns, and Igor then resets the home
- **THEN** the reset removes the link and writes a fresh `~/.claude` from the template
- **AND** the directory the link named is unchanged

#### Scenario: A link planted at a log copy's path is not written through

- **WHEN** a link to another file already sits where Igor would write a session log copy
- **THEN** Igor does not write through the link, and the file it names is unchanged
- **AND** the run's record says the log was not copied

### Requirement: Every model step in the worker's home starts from Igor's template

Before every model step in the worker's home, Igor SHALL replace `~/.claude` and `~/.claude.json`
with a fresh copy of a template in Igor's installation, which a worker user cannot write, keeping
nothing, a stored login included. Igor SHALL reset nothing else in the home, and nothing between
one step's calls. The template SHALL hold a `settings.json` of `{}`, no skills or `CLAUDE.md`, and a
`~/.claude.json` of `{"hasCompletedOnboarding": true}`.

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

- **WHEN** `igor run` starts a call, such as one in the worker's home with `IGOR_RUN_TOKEN` in its
  environment, and the developer's own login is stored where setting `HOME` does not move it,
  such as in the macOS Keychain
- **THEN** the reset leaves that login where it is, since it resets only `~/.claude` and
  `~/.claude.json`

#### Scenario: The rest of the home persists

- **WHEN** a task leaves `~/.gitconfig` and a file a repository's tests cache under `~/.cache` in
  the worker's home
- **AND** Igor starts the next task in that home
- **THEN** each of those files is still there

#### Scenario: The reset leaves exactly the template's files

- **WHEN** Igor resets the worker's home
- **THEN** `~/.claude` holds `settings.json`, whose content is `{}`, and no skill or `CLAUDE.md`
- **AND** `~/.claude.json` holds `{"hasCompletedOnboarding": true}`

#### Scenario: A step's resumed call finds its session

- **WHEN** a model step writes its reader goals in a first `claude -p`, and Igor then runs
  `claude -p --resume` for that step's session in the same home
- **THEN** Igor does not reset the home between the two calls
- **AND** the resumed call continues the first call's session

#### Scenario: The worker cannot change the template

- **WHEN** a worker running as a worker user tries to write into the template Igor resets the
  home from
- **THEN** the write is refused, as #175's start check confirms

### Requirement: Nothing a step left running survives into the next reset

Before every reset of the worker's home, unless the worker runs in same-user mode, Igor SHALL end
every process the worker's earlier model steps started, so that none writes in the home after the
reset; with a worker user, a local host does this by the kill *A worker user's processes are killed
before each reset* states. In same-user mode Igor SHALL kill nothing before a reset, because ending
every process of the user Igor runs as would end Igor and the person's own processes.

#### Scenario: A process a step left running has ended before the next reset

- **WHEN** a model step in the worker's home starts a process that keeps running after the step
  exits, and the worker does not run in same-user mode
- **AND** Igor then resets that home for its next model step
- **THEN** that process has ended before the reset begins

#### Scenario: Same-user mode does not end a process that left the worker's group

- **WHEN** an `igor run` in same-user mode runs a worker that starts a process that calls
  `setsid()` and keeps running after the worker exits
- **THEN** Igor does not kill that process before the next reset

### Requirement: A worker user's processes are killed before each reset

With a worker user, before every reset of its home, Igor SHALL run the kill of #175's *A kill
reaches the worker's whole process tree*, which ends every process the worker user owns after its
`sudo` check; this is how a local host meets *Nothing a step left running survives into the next
reset*. Where #175's `sudo` check is refused and the kill is skipped, the run SHALL fail as that
requirement says, and no reset follows.

#### Scenario: A process that escaped its group is killed before the next reset

- **WHEN** a worker running as a worker user starts a process that calls `setsid()` and keeps
  running after the worker exits
- **THEN** Igor kills it before the next reset in that user's home, the one before #153's next
  model step in the same task

### Requirement: The worker's session log outlives the reset

When a model step in the worker's home exits, Igor SHALL copy its session log from
`~/.claude/projects/` to the state directory before the next reset, redacted, readable only by
Igor's user. With a worker user, Igor SHALL read it as that user, `lstat` it, open it with no
link followed and no blocking, and copy only a regular file with one hard link. The execution
log SHALL name each copy by its path relative to the state directory, with the step's session
id, or say the log was not copied.

#### Scenario: The record points at a log the reset did not delete

- **WHEN** a worker exits and Igor then resets its home for a later call
- **THEN** a copy of the worker's session log is in Igor's state directory, readable by Igor's
  user alone
- **AND** the run's record in the execution log names that copy by its path relative to the
  state directory, so it names no home directory or user name, and the reset left the copy in place
- **AND** that record is in the execution log on the state branch, the git branch in the lore
  repository where Igor keeps its records, not in the state directory on Igor's host

#### Scenario: A resumed call continues its step

- **WHEN** #153's step that writes a post resumes, with `claude -p --resume`, the session in which
  it wrote its reader goals
- **THEN** the first call and the resumed call are one model step, so Igor copies one session log
  for them, after the resumed call exits

#### Scenario: Every step's session log is copied

- **WHEN** the worker exits, and #153's bug hunt and prose pass then run in the same home, each
  after a reset
- **THEN** the state directory holds a copy of each of the three steps' session logs
- **AND** the run's record names each copy beside its step's session id

#### Scenario: A second worker run's session log is copied

- **WHEN** Igor runs the worker a second time on the same item, as after a failed check
- **THEN** that run's session log is copied as the first run's is

#### Scenario: A token the worker printed is redacted in the copy

- **WHEN** a worker runs `env`, which prints its seat's token into the session log, and exits
- **THEN** the copy in Igor's state directory holds `[redacted]` where the log held the token,
  since Igor redacts each copy with credential redaction, as #217 defines it in *Credential
  redaction replaces every credential the Igor knows*, where *the Igor* is a running Igor process

#### Scenario: A session log the worker replaced with a link is not copied

- **WHEN** a worker running as a worker user replaces its session log with a symbolic link, or a
  hard link, to another file the worker user can read
- **THEN** Igor copies nothing through the link
- **AND** the run's record says the log was not copied

#### Scenario: A worker user's session log is read as that user

- **WHEN** a worker running as a worker user exits
- **THEN** Igor reads its session log as that user, through #175's spawn, not as Igor's own user

#### Scenario: A session log the worker replaced with a FIFO is not copied

- **WHEN** a worker running as a worker user replaces its session log with a named pipe and exits
- **THEN** Igor's copy does not wait on the pipe, and copies nothing
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
copies by listing its state directory, not the execution log, and delete only regular files.

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
--output-format stream-json --verbose`. Igor SHALL refuse to start, exiting 78, unless its
`system/init` event lists `igor:<name>` for each skill in `<skills_dir>/skills/`. Where no event
arrives because the model provider did not answer, it SHALL exit 1 instead, as #82 requires.

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

#### Scenario: Under igor run, a skill that does not load stops the run

- **WHEN** `igor run` makes its startup check against the directory it assembled, and
  `igor:<name>` is missing from the event's `skills` list for a skill linked there
- **THEN** the run refuses to start, naming the skill
- **AND** the process exits with status 78

#### Scenario: No init event stops the start

- **WHEN** the call exits without a `system/init` event, and the model provider answered it, such
  as with an error response
- **THEN** Igor refuses to start, saying it could not confirm its skills load
- **AND** the process exits with status 78

#### Scenario: A check the provider did not answer is not a refusal

- **WHEN** the call exits without a `system/init` event, and the model provider did not answer it,
  such as when Igor's host cannot reach the provider
- **THEN** Igor says it could not reach the model provider to confirm its skills load
- **AND** the process exits with status 1, not 78

#### Scenario: A call that fails after the init event is still judged on its list

- **WHEN** the check's call prints a `system/init` event listing every installed skill and then
  fails, such as on a refused token
- **THEN** the check passes on that list
- **AND** the failure is handled as it would be on any other call of the same kind: as a probe's
  failure where the check is a seat's probe, and otherwise as a gated call's

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
  working directory and its `HOME`, not under the system's temporary directory

#### Scenario: The `igor run` check leaves no directories behind

- **WHEN** an `igor run` startup check's call ends
- **THEN** its working directory and its `HOME` under Igor's state directory are gone

#### Scenario: A crashed run's check directories are removed

- **WHEN** an `igor run` finds the startup check's two directories left by an earlier run whose
  process is gone
- **THEN** it removes them with that run's home and plugin directory

### Requirement: A refused startup probe stops the start

Under `igor serve`, where the startup check is a seat's first probe and #143's *Every directory
above a seat probe is checked before it is spawned* refuses one of its two directories, Igor SHALL
refuse to start, naming the directory and what is wrong with it, and exit 78, in place of #143's
recording of that probe as errored and its retry. A retry would only meet the same refusal, since
the directory stays refused until a person fixes it.

#### Scenario: A probe #143 refuses stops the start

- **WHEN** the startup check is a seat's first seat probe under `igor serve`, and #143's *Every
  directory above a seat probe is checked before it is spawned* refuses to start it because one
  of its two directories, its working directory and its `HOME`, fails #143's check or cannot be
  created
- **THEN** Igor refuses to start, naming that directory and what is wrong with it, rather than
  wait for a later seat probe
- **AND** the process exits with status 78

### Requirement: Igor refuses a skills directory that is empty or holds more than skills

Where Igor makes a startup check, before its call, Igor SHALL refuse to start, naming the path and
exiting with status 78, when `<skills_dir>/skills/` is missing or holds no skill, when
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

#### Scenario: A manifest key other than name, version and description stops the start

- **WHEN** `plugin.json` holds an `mcpServers` key beside `name`
- **THEN** Igor refuses to start, naming `mcpServers`, and makes no call
- **AND** the process exits with status 78

#### Scenario: A manifest directory that holds more than plugin.json stops the start

- **WHEN** `<skills_dir>/.claude-plugin/` holds `hooks.json` beside `plugin.json`
- **THEN** Igor refuses to start, naming `hooks.json`, and makes no call
- **AND** the process exits with status 78

### Requirement: Igor reports the commit each skill loads from

Igor SHALL report, for each skill, the commit of the git clone its entry resolves to, with git's
file-system monitor off for every command reading it. For a clone root owns, Igor SHALL trust that
clone (`safe.directory`) for that one command, without changing the service user's git
configuration. Igor SHALL trust no clone owned by a user
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

#### Scenario: A trusted clone's commit is read with git's file-system monitor off

- **WHEN** Igor reads the commit of a root-owned clone whose configuration sets `core.fsmonitor`
  to a program
- **THEN** the command that reads it passes `-c core.fsmonitor=false`, and that program does not
  run

#### Scenario: A clone Igor's own user owns is read without trust

- **WHEN** every installed skill loads, and the clone a skill's entry resolves to is owned by the
  user Igor runs as, as under `igor run`'s fallback
- **THEN** Igor reports that skill with the clone's commit
- **AND** the command that reads it passes no `safe.directory` option, and passes
  `-c core.fsmonitor=false`

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
