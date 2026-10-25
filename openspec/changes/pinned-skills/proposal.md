## Decisions

1. **Skills load with `--plugin-dir <skills_dir>`** (Adam, 2026-10-11). *Rejected:* `--add-dir`,
   which issue #152 chose: a same-named skill in the home directory or the worked repository
   replaced the pinned one, and it gave the worker write access to the skills (`design.md`).
2. **Igor never passes `--bare`** (Adam, 2026-10-11). Under `--bare` a seat's setup-token runs as
   an API key and emits no `rate_limit_event`. #143's budget gate reads how full a seat is from
   that event, so such a call is not read as a seat, and what it is billed against is unknown.
3. **The plugin is named `igor`** (Adam, 2026-10-11), so skills load as `igor:prose` and
   `igor:bug-hunter`.
4. **The pinned shared-skills commit is at or after `075a73a`** (Adam, 2026-10-11), where every
   skill finds its scripts from its base directory. *Rejected:* a line in the worker's system
   prompt telling it where the pinned skills' scripts are.
5. **The startup check is an ordinary call that spends a seat, separate from the startup
   self-test #144 proposes to run once per seat** (Adam, 2026-10-11; amended 2026-10-18 and
   2026-10-21). It runs once per start. Under `igor serve`, where a seat is due a probe at
   start, it is that seat's first probe (decision 28). Otherwise it spends the seat the budget
   gate chooses for it, as the rest of this decision says. That it authenticates also shows the seat's token works. The gate still chooses
   the seat of every call but two: #143's seat probe and the usage read, each of which spends
   the seat it is reading about. Where the gate names no seat at start, Igor starts, runs its
   cycles without a model call, and runs the check before its first one; if that check fails,
   the running process exits with status 78 then. Igor waits this way only where the check
   cannot be a probe, since a probe spends its seat without the gate (decision 28). *Rejected:* a call with no token, which
   printed the skill list and then failed to authenticate, at no cost. It needed an exception
   from #171's *A spend with no seat behind it is not made*, and a call with no token uses and
   rewrites a stored login where it finds one (measured 2026-10-18, `design.md`).
6. **No guard against a same-named skill, and no startup check of the service user's hooks,
   `CLAUDE.md` or home skills** (Adam, 2026-10-11). A same-named skill in the home loads under
   its own name beside `igor:<name>`; one in the worked repository does not load at all
   (decision 8, measured 2026-10-18). `docs/deployment.md` tells the operator to keep the service
   user and the worker user (#175) free of hooks, a `CLAUDE.md` and home skills (task 5.3).
7. **One plugin directory for every role.** The coordinating agent chose this on 2026-10-11, and
   Adam let it stand on 2026-10-19. *Rejected:* a plugin directory per role, which is one directory per distinct
   `skills` list among the roles (#153), each to install, pin and check.
8. **Every call excludes the worked repository's own settings, with `--setting-sources user` and
   `--strict-mcp-config`** (Adam, 2026-10-17). The settings are the repository's
   `.claude/settings.json` (permission allows and hooks), `.mcp.json`, skills and `CLAUDE.md`.
   The worker can edit that repository, and the `role-config` spec keeps the commands a worker
   may run out of it because "a worker that can edit files can edit a settings file in the
   repository it is working". Measured on 2026-10-18: the two flags keep all four out, with or
   without `--add-dir <tree>`, and the repository's local settings, `CLAUDE.local.md`, nested
   `CLAUDE.md` files, commands and agents too.
9. **The worker runs in a home that lasts, and before each model step Igor resets its `~/.claude`
   and `~/.claude.json` from a built-in template** (Adam, 2026-10-17; before each step rather
   than each `claude -p` since 2026-10-21, decision 31). With a worker user (#175),
   the home is that user's own. With none, each `igor run` has a home of its own under Igor's
   state directory, removed when the run ends (decision 23), and Igor sets `HOME` to it; that is
   #175's same-user mode, `igor run`, where the worker runs as the user Igor runs as. The template ships with Igor
   and is nearly empty (task 2.4). The reset keeps nothing of what it replaces, a stored login
   included (decision 17). Nothing else in the home is reset, so `~/.gitconfig` (with #175's
   `safe.directory`) and the files a repository's tests cache there stay. Without the reset, a
   worker steered by an item's text could plant hooks, a `CLAUDE.md` or skills for every later
   call. A file a run leaves elsewhere in the home, such as `~/.npmrc`, can steer later runs in
   that home. Adam accepted that: with a worker user, each instance has its own home (#175), so
   such a file reaches no other instance, and in same-user mode it reaches only the later tasks
   of the same run.
   *Rejected:* a fresh, empty home for every task, which loses `~/.gitconfig` and the caches a
   repository's tests need; and resetting `~/.claude` alone, which leaves `~/.claude.json` for a
   worker to write.
10. **The usage read passes no `--plugin-dir`** (Adam, 2026-10-17). It runs no skill. `igor
    serve` runs it in the budget gate, and `igor budget` runs it too, often on a person's
    machine, where `skills_dir` names a server path. #143 removes the usage read, `runUsage`
    with it, in the first change built after #171's code lands (#143's decision 37); until
    then this decision applies to it.
11. **Two facts the flag rests on were measured before anything is built** (Adam, 2026-10-17,
    task 0.3): a skill the manager installed as a link is given its path under the plugin
    directory, not the clone's, and `--plugin-dir` gives the worker no write access to the
    skills. Both held on 2026-10-18, so decision 1 stands.
12. **`skills_dir` is not configured in lore: Igor uses `/opt/igor/skills`, and `IGOR_SKILLS_DIR`
    in the server's environment overrides it** (Adam, 2026-10-17). `/opt/igor/skills` is where the
    deployment guide installs the plugin. Neither `igor.config.yaml` nor any other lore file has a
    `skills_dir` key, so a file that names one is refused by the strict unknown-key check, with
    the error any unknown key gets, not one about `skills_dir`. *Rejected:* a key in
    `igor.config.yaml`, which any pull request to the lore repository could point at another
    directory.
13. **With a worker user, Igor kills every process that user owns before every reset** (Adam,
    2026-10-17), not only at the end of a task. Whether it kills them by user or by the user's
    systemd slice is the implementer's choice (Adam, 2026-10-17). A process that left its
    process group with `setsid()` outlives a kill of the group, and could otherwise rewrite the
    home after a reset, including in the gap between the worker and the model steps of #153
    that follow it (decision 14). Under `igor serve`, #175's kill by user also runs before a
    tree's release, so no process that left its group outlives its task (decision 24). #175 measured on
    2026-10-18 that Claude Code starts each Bash command in a new session, so every command a
    worker runs has left the group: a kill of the group did not end `npm test`, and a kill of
    every process the worker user owns did. Same-user mode has no such
    guard: killing every process of the user Igor runs as would kill Igor itself and, under
    `igor run`, the person's own processes. It is a limit of same-user mode, which runs only on a
    developer's machine.
14. **#153's later model steps, the prose pass and the bug hunt, run in the worker's home, with
    the same reset before each step** (Adam, 2026-10-17; per step, decision 31). Prose's first call, which prints
    the rules and issues the token that prose's signing call later checks, is Igor's own and runs
    as the service user (Adam, 2026-10-18, on #153), so nothing of prose's is written in the
    worker's home and the reset has nothing of it to keep.
15. **The in-force scenario *No state carries between tasks* is reworded** (Adam, 2026-10-17).
    Nothing a worker writes reaches a later task, except what lies outside decision 9's reset,
    and the scenario names those exceptions. `specs/task-execution/spec.md` is a MODIFIED delta.
16. **Same-user mode is `igor run` alone** (Adam, 2026-10-17). #175 has no `igor serve --same-user`, so no served rank uses a same-user home.
    Nor does same-user mode run under the systemd unit (`deploy/igor.service`), whose
    `ProtectHome=read-only` would make a home under `~/.local/state` unwritable. Under #179,
    `igor run` is rank 0, outside the roster (the list of ranks a role's serving processes run),
    and runs beside serving ranks with no refusal and no wait (Adam, 2026-10-18). A serving rank
    never uses a run's home, so a run beside one shares no home with it.
17. **The reset keeps no stored login, because Igor never uses one** (Adam, 2026-10-18). Every
    seat has a Claude token, and every call that spends a seat authenticates with that seat's
    token, from its environment, under `igor serve` and `igor run` alike. Under `igor run` the
    seat is an implicit local seat that needs no seat file, and its token is the one in
    `IGOR_RUN_TOKEN` (Adam, 2026-10-18). #171 states both rules, in *A spend with no seat behind
    it is not made* and *`igor run` spends its own token as an implicit local seat*; this change
    applies them to the worker's home. The reset replaces `~/.claude` whole,
    `~/.claude/.credentials.json` with it. Under `igor run`, Igor neither hides nor refuses a
    login the developer keeps where setting `HOME` does not move it, such as the macOS
    Keychain; if Claude Code
    ever prefers it to the token, `run` spends the developer's own login, and that is accepted
    (Adam, 2026-10-18). Measured on 2026-10-18 (Claude Code 2.1.303): a valid token wins over a
    stored login in the home or the Keychain, and an invalid token fails rather than falling
    back to one. *Rejected:* keeping `~/.claude/.credentials.json`, so that an organization with
    no seats could run on a stored login. That leaves open where a worker user's login would
    come from, and lets a worker rewrite a login that later calls might use. An organization
    with no seats instead adds one seat, from a token of its own (#171).
18. **The startup check runs on haiku, with `--model haiku`** (Adam, 2026-10-18). With no
    `--model` it ran on sonnet, at $0.026 a start against about $0.001 on haiku (measured
    2026-10-18). The check reads only the skill list, which does not depend on the model.
19. **Six smaller choices, made by the agents that wrote this change and accepted by Adam on
    2026-10-19:** a relative `IGOR_SKILLS_DIR` refuses the start; the skills Igor expects are every
    entry under `<skills_dir>/skills/`, not a list of its own; a skill whose commit cannot be read
    is reported as not checked, and the start goes on; Igor reports each skill's commit but does
    not refuse one older than decision 4's `075a73a`; Igor trusts a skill's clone for that read
    only when root owns it, since trusting a clone turns off git's guard against running
    configuration another user controls, and for the same reason it turns git's file-system
    monitor off for that read, so the clone's configuration cannot name a program for git to
    run; and the start is refused when `skills_dir` holds anything besides
    `.claude-plugin/plugin.json` and `skills/`, so the plugin cannot add a hook, an MCP server, a
    command or an agent to every call.

20. **Where `skills_dir` does not exist, `igor serve` refuses to start, and `igor run` uses the
    skills the person installed** (Adam, 2026-10-19; the half for `igor run` amended the same
    day, answering question 10 of #153's *For Adam* list). `igor serve` refuses, naming the path, and exits with
    status 78. `/opt/igor/skills` is only the server's path. A person's machine has skills of
    its own: the shared-skills manager (`manage-skills`) installs them in the person's home, as
    one entry per skill under `~/.claude/skills`, each a link into the person's shared-skills
    clone. A run's `HOME` is the run's own home (decision 23), so Claude Code would not find
    them there. So `igor run` passes them explicitly, to every call that carries `--plugin-dir`:
    - **Where it looks:** `~/.claude/skills` in the home of the user Igor runs as, taken from
      the `HOME` Igor starts with, before it sets the worker's `HOME` to the run's home.
    - **How it passes them:** `--plugin-dir` takes a plugin directory, with
      `.claude-plugin/plugin.json` and `skills/`, which `~/.claude/skills` is not. So Igor
      assembles one for the run in its state directory, such as
      `<state directory>/plugin/<role>-<run>`: a `plugin.json` naming the plugin `igor`, and
      under `skills/` one link per entry of `~/.claude/skills` that holds a `SKILL.md` and that
      the role's `skills` list names or Igor's own code runs (decision 37), to that entry's
      resolved path. For that run, this directory is `skills_dir`: every call that
      carries `--plugin-dir` names it, the startup check checks it, and #153's check of a
      role's skill names reads it. The run removes it when it ends.
    - **Where `~/.claude/skills` holds no skill the role lists or Igor's own code runs,** whether
      it holds none at all or only other skills: the run loads no skills. No call
      carries `--plugin-dir`, no startup check is made, and the run says as it starts that the
      skills were not loaded, naming `skills_dir` and `~/.claude/skills`. Under #153, every command that runs a model step
      refuses a role that lists a skill it does not load, so such a run starts only for a role
      whose `skills` list is empty. Which skills a dry run loads is open (*Still open*).

    The run says as it starts which skills it loaded and from where. The person's skills are
    not pinned: they are at whatever commit the person's clone is at, which the manager's
    `update` moves by pulling the clone. And the worker can write them, as it can `skills_dir`
    itself in same-user mode (decision 25). Their being unpinned and writable are both limits of
    `igor run`.
    *Rejected:* refusing under `igor run` too, which would stop every development run on a
    machine without `/opt/igor/skills`; loading no skills under `igor run`, which the first
    half of this decision had, and under which #153 refuses every role whose `skills` lists
    `prose`; copying the skills into the run's `~/.claude/skills`, which the reset before every
    model step replaces, and where they would load as `prose`, not the `igor:prose` #153's steps name;
    writing a `plugin.json` into the person's install; and passing `--plugin-dir` to a
    directory that does not exist, whose handling by `claude -p` is unmeasured.
21. **Citations ahead of the archive order are accepted** (Adam, 2026-10-19). This change cites
    #171's *A spend with no seat behind it is not made*, #82's *A process that refuses to start
    exits with status 78*, #179's ranks and its sweep of a crashed run's trees, and #153's `skills` list, prose pass and bug hunt, and
    issue [#204](https://github.com/adamstallard/igor/issues/204) archives all four after this
    one. Decision 29 also cites #217's *Credential redaction replaces every credential the Igor
    knows*, but #204 archives #217 before this change, so that citation is not ahead and needs
    no acceptance. Until the four archive, the in-force text cites rules not yet in force; every cited change
    archives in the same series.
22. **In same-user mode the reset may follow a link** (Adam, 2026-10-19). The worker can make
    `~/.claude` or `~/.claude.json` a link to a file the person owns, and a reset run as the
    person may then remove or overwrite that file. `igor run` has no sandbox, and this is one of
    its limits. *Rejected:* a reset that never follows a link, which the authoring agents
    recommended.
23. **Each `igor run` has a home of its own, removed when the run ends** (Adam, 2026-10-19). The
    home is named by the run's id, such as `<state directory>/home/<role>-<run>`, under Igor's
    state directory, so two `igor run`s of one role at once share no home and neither's reset
    replaces `~/.claude` under the other's call. The run id is the one #179 gives each run, which its
    trees also carry, and the run removes its own trees and those a crashed run left (#179's
    decision 39). Within one run the home lasts across its tasks.
    *Rejected:* one home per role, which two runs of the role at once would share; and a lock
    that makes the second run refuse.
24. **A process that escaped its group is killed by #175's kill, not by one of this change's**
    (Adam, 2026-10-19). Under `igor serve`, #175's decision 27 kills every process the worker
    user owns whenever it kills a worker, once the last model step exits, after the repository's
    checks that #189 (`loop-verifies-commands`) runs as the worker user, and before a tree's
    release. So no process that left its group outlives its task, and this change adds no kill
    when a task ends.
25. **In same-user mode the worker can write the template and `skills_dir`** (Adam, 2026-10-19).
    There the worker runs as the user that owns Igor's installation and the skills a developer
    installed, and #175's start check, which confirms the worker user cannot write either, does
    not run. That is a limit of `igor run`, a developer at their own terminal.
26. **Igor copies the worker's session log into its state directory when the worker exits, and
    the execution record points at the copy** (Adam, 2026-10-19). The log lies under
    `~/.claude/projects/`, which the next reset deletes, and `projects/` cannot be kept out of
    the reset, since Claude Code's memory for a project lives there and would load into later
    calls. Decision 29 redacts the copy.
27. **Task 5.1 installs `spec-trace` with `prose` and `bug-hunter`** (Adam, 2026-10-19). #190
    (`review-evidence`) adds to each pull request a table of what the loop checked, and fills its
    *Spec scenarios* row by running
    `<skills_dir>/skills/spec-trace/scripts/spec_trace.py`, and without it that row would read
    `not checked` on every pull request.
28. **Under `igor serve`, the startup check's call is a seat's first probe** (Adam, 2026-10-21).
    Where a seat is due a probe when Igor starts, the check's call is the first seat probe Igor
    makes. #143's *A seat nothing has read is probed on the Igor server with its own token* says
    which seats are due one. Like any probe, the call spends the seat it reads, so the gate
    makes no decision for it, and its `rate_limit_event` is recorded as that seat's first
    reading. A probe's limits and exclusions, such as the hourly limit and the skip of a refused
    seat, apply to it, and it runs where #143's *A seat probe
    runs where only the Igor can write* places a probe.

    Without this, a deployment whose only seats keep a reserve, a share of each usage window
    held back from Igors (#143), and have no reading would never make a model call. #171's gate
    draws on such a seat only once a probe has read it. A probe is a model call, and the check
    runs before every other model call. So under the rule of 2026-10-18, which sent every check
    through the gate, the probe waited for the check, and the check for the gate.

    Where no seat is due a probe when Igor starts, because each has an unexpired reading, the
    check spends the seat the gate chooses, as decision 5 has it. Under `igor run`, which makes
    no probe (#171), it spends the run's implicit local seat, the one seat `igor run` makes from
    the token in `IGOR_RUN_TOKEN`, through the gate.
29. **Igor redacts the session log's copy as it copies it** (Adam, 2026-10-21), with `redact`,
    the function #217 (`redact-state-branch`) builds for its *Credential redaction replaces
    every credential the Igor knows*. A worker that runs `env` writes its seat's token into the
    log, and #171 forbids Igor writing a token to any file. *Rejected:* keeping no copy, which
    loses the record decision 26 keeps; and keeping the copy unredacted.
30. **#171's code is built before this change's** (Adam, 2026-10-21), although #204's archive
    order puts this change first. The seat-budget code this change's code meets is then #171's,
    under which every model call spends a seat's token. An organization with no seats then
    makes no model call until it adds one, and never runs on the login stored on the host, which
    today's in-force `seat-budget` allows.
31. **The reset runs before each model step, not between a step's own calls** (Adam,
    2026-10-21). A model step can make two calls: under #153's decision 40, the step that writes
    a post writes its reader goals in a first turn, and Igor then resumes that session with
    `claude -p --resume`. A reset between the two would delete the session log the resume
    reads. The kill of decision 13 runs before each reset, so it too runs per step. Adam chose
    this per-step reset of the run's home, with the session log's copy of decision 26, over
    giving each run a Claude Code configuration directory of its own (`CLAUDE_CONFIG_DIR`),
    which #216 had proposed. #216 is to cite this change for the reset.
32. **`lore-search` (#216) owns the definition of Igor's state directory** (Adam, 2026-10-21):
    `$STATE_DIRECTORY`, else `$XDG_STATE_HOME/igor`. This change cites #216's `graceful-handoff`
    requirement *A handoff states what was done, what remains, and who could continue*, which
    defines it, and names no path itself. Issue #204's archive order places #216 after this
    change, so until #216 archives, this change's spec cites a requirement not yet in
    force. Whether Adam's permission to cite ahead covers it is the question *Permission to cite
    #216 ahead*, under *Still open*.
33. **Every step's session log is copied before the next reset** (Adam, 2026-10-21, #216's
    decision 98): the worker's, those of #153's later model steps, and #189's second worker
    run's, each redacted with #217's `redact` as decision 29 has it. #216 keeps every step's log
    of a flagged execution, and an execution is known to be flagged only once it ends, so every
    step's log is copied. Decision 26 copied the worker's alone.
34. **The execution record may name a log copy that #216 could not move** (Adam, 2026-10-21,
    #216's decision 102). The record names each copy where Igor wrote it. #216 moves a flagged
    execution's copies into `flagged-questions`, and a copy whose move it refused stays at the
    path the record names.
35. **A run removes the home and plugin directory a crashed run left** (Adam, 2026-10-21,
    #179's decision 39). This concerns `igor run` alone: a worker user's home lasts across runs,
    and `/opt/igor/skills` is never removed. At its start, before its first cycle, an `igor run`
    removes three things of each earlier `igor run` of its role whose process is gone: its trees,
    its home, and the per-run plugin directory decision 20 assembles from the person's installed
    skills. #179's sweep states the rule, the home and plugin directory included, and this
    change only cites it (Adam, 2026-10-24); this change builds the removal of the home and
    plugin directory it defines (task 2.3). As #179 states the rule: each `igor run` runs as
    rank 0, the `0` in its lock file's name, and, while it runs, holds an exclusive lock
    on its own file, `<role>-0-<run id>.lock`, in the directory where trees are kept. The system
    releases the lock when the run's process ends, so a run whose lock another run can take is
    gone (#179's decision 48, which Adam confirmed on 2026-10-21). Where the new run cannot take
    an earlier run's lock, it removes nothing of that run's. `igor run --plan` removes nothing.

36. **Where no seat may be probed at start, the startup check spends the seat the gate
    chooses** (Adam, 2026-10-24). A seat due a probe may be held off by #143's hourly limit, for
    up to an hour, or by #143's back-off on that seat after a probe that received no
    `rate_limit_event`, which lasts up to five hours. Where some seat
    may be probed, the check is that seat's probe. Where none may, the check makes its call on
    the seat the budget gate chooses, the same as where no seat is due a probe at all, rather
    than wait for a held-off seat. Where the gate has no seat to spend either, as with a single
    seat that keeps a reserve, is held off and holds no reading, the check waits, as the spec's
    scenario *No seat to spend, no check yet*
    says.

37. **Where `skills_dir` does not exist, `igor run` links only the skills the role lists and
    those Igor's own code runs** (Adam, 2026-10-24). Its plugin directory holds a link for each
    of the person's installed skills that the role's `skills` list (#153) names, or that is one
    on the list of skills whose scripts Igor's own code runs, whatever the role. Igor's code holds
    that list, which today names only spec-trace, whose checker #190 runs, and a change that runs
    another skill's script for every role adds that skill to it. It links none of the rest, so a skill that acts
    with the person's own credentials, such as one that posts to chat, loads into a worker only
    where the role asks for it.
38. **An unflagged execution's session log copies last until the item's next execution ends**
    (Adam, 2026-10-24). A session log copy is the copy of a model step's Claude Code session log that
    decision 33 makes before the worker's home is reset. An
    execution is flagged where #216 puts a flagged hold on its item, and its copies go only when
    #216's `work-triage` deletes that execution's files, on any release of the hold: `igor
    release`, the command that lifts it, or an edit to the item by someone with write access.
    When any execution of an item ends, flagged or not, Igor deletes in its own state directory
    the copies of every earlier execution of the item that meets all three of these: it started
    before the one that just ended; it has ended, or its process has stopped; and it left no
    flagged hold. The second condition matters because #216 lets two executions of one item run
    at once, and an earlier one still running may yet be flagged. So an item keeps the copies of
    its latest execution, of any execution still running, and of any flagged one. Each host
    deletes only its own copies, and where the item never runs on that host again, they stay.
    #216 marks some executions flagged that stop without asking a question, and those put no
    flagged hold on their item, so under this definition their copies count as unflagged. #216
    keeps such an execution's transcript "as for any run", that is, under the same rule as any
    unflagged execution's, which this matches (Adam, 2026-10-24, confirming this change's
    reading).
39. **The `igor run` check's two directories go under Igor's state directory** (Adam,
    2026-10-24), as #216 defines it. The system's temporary directory is one other users of the
    host can write, and #143 keeps its probe's directories out of it too.

**Still open:**

- **The ambient login until #171 archives.** Until #171 archives, the in-force `seat-budget`
  lets a seat name no token and run on the login stored on the host, which decision 17 forbids;
  an organization with no seats runs its calls that way too. Under this change no call runs
  without a seat: the startup check spends a seat it probes or one the gate names (decision
  28), and every other call comes after it. This item is a note, not a question: #171's code is
  built first (decision 30), so the code never runs on the ambient login, and the item records
  only that the archived specs allow it until #171 archives.
- **Questions from the 2026-10-21 consistency reads, for Adam,** none yet answered:
  - **The check as a probe denies no tools.** #143's probe runs with no tools and on
    `TRIAGE_MODEL`; the check carries `--plugin-dir` and `--model haiku`, and whether a call
    with no tools still lists its skills in `system/init` is unmeasured. Adam chooses: the check
    keeps its own arguments as an exception to #143's minimal probe, or it denies tools once a
    measurement shows the list survives. No recommendation until that measurement.
  - **A probe #143 refuses to spawn.** Where #143's check of the probe's two directories (*A
    seat probe runs where only the Igor can write*) fails, the probe is
    recorded as errored and held off by the hourly limit and the five-hour back-off. Whether
    the check has then failed, exiting 78, or waits for the next probe, is unsaid; waiting can
    hold a one-seat deployment's first model call for five hours.
  - **Permission to cite #216 ahead.** #204 places #216 after this change, and decision 21's
    permission to cite changes that archive later names #171, #82, #179 and #153, but not #216.
    *Recommendation:* extend decision 21 to #216, as decision 32 already assumes.
- **For #153 to amend, reported** (same read): #153's `role-config` delta says a role's
  `skills` list does not decide what loads, and its scenario has `igor run` load every
  installed skill, where decision 37 has the list decide what `igor run` links. #190's
  `task-execution` delta states the same rule and needs the same amendment. Nothing here waits
  on either.
- **Findings of the 2026-10-24 consistency read, for this change's authors:**
  - Under #153 the one model step with a resumed call is the step that writes a post where no
    worker run came before it, such as a reply to a mention. *Every model step in the worker's
    home starts from Igor's template* says the steps in that home are the worker and the steps
    #153 runs after it, which leaves that step out. So its `HOME`, its reset and its log copy are
    unsaid, though this change's resume scenario and #153 both assume the reset home. To settle
    with #153.
  - *The Igor reads no file on the worker's behalf through a link* (#175) covers the worker's
    tree and outbox only, not the worker's home this change cites it for. #175 records the gap;
    either #175 widens the rule to the home, or this change states its own rule for reading
    session logs there.
  - No scenario tests the check under `igor run` spending the run's local seat, or the copy of
    #189's second worker run's log.
  - Igor's startup check refusing a plugin directory whose `skills/` is empty (*Igor confirms its
    skills load before its first model call*) is a choice no decision lists.
  - From the second read that day: the scenario *Each igor run has a home of its own* puts triage
    and the check in the run's home, which *Every model step in the worker's home starts from
    Igor's template* keeps them out of, and nothing says which `HOME` triage gets under `igor
    run`; that requirement and *The worker's session log outlives the reset* each list the steps
    that run in the worker's home, and only the second names #189's second worker run; #175 restates this change's
    reset as one before every call, which deletes the session a resume reads (#175's to fix);
    issue #152's body still states the reset and the check as they were before decisions 28 and
    31; no rule says removing a run's home and plugin directory, or writing a log copy, follows no
    link; the commit Igor reports for a skill does not prove the files on disk are that commit's,
    since the clone may hold uncommitted edits; no scenario shows Igor reading the commit of a
    clone owned by the user Igor runs as, which it trusts without `safe.directory`; and the execution record is named
    `executions.ndjson`, where the state branch keeps `executions/<day>.ndjson`.
- **Findings from the 2026-10-21 consistency reads, for this change's authors.** Each needs
  a change to this text that the authors can make without Adam; none is made yet:
  - A dry run is `igor run --plan`, so decision 20's fallback covers it. Whether `--plan`
    assembles a plugin directory is unsaid; #179 has `--plan` change nothing, so assembling one
    would break that.
  - The startup check that is a seat's first probe keeps its own arguments in the spec, though
    the first question for Adam above leaves that open; the spec should say it waits on his
    answer.
  - Decision 13's kill, by user or by the user's systemd slice: #175 measured that on Debian a
    process `sudo` starts is not in that slice, so the spec should drop the slice.
  - The execution record names a log copy's host path, which #216 may move, and which puts a
    person's home path on a state branch that may be public.
  - Decision 5 says the check "shows the seat's token works", but a check whose call lists the
    skills and then fails, as on a refused token, still passes; the claim should be narrowed.
  - #153 gives a role's `skills` list no say in what the worker is told to use, which this
    change's *Why* assumes; and decision 20 cites #153's question 10, now #153's decision 29.
  - The log copy omits #175's `lstat` and non-blocking open, so a FIFO hangs it.
  - Unmeasured facts with no task: a resumed call continues its session (#153's task 0.21);
    Claude Code keeps nothing under `HOME` outside the two reset paths; a call with no tools
    still lists its skills; a step's session is one file.
  - *Skills come from one plugin directory the server names* refuses any lore file that names
    `skills_dir`, but today only the parsers of `igor.config.yaml`, role files and budget files
    refuse unknown keys. The term *model step* is defined three ways: in *Every model call names
    the plugin directory* as one `claude -p` with its resumes, in *Every model step in the
    worker's home starts from Igor's template* as one session for a run, and in `design.md` as
    excluding triage and the check. Also: *service user* and *flagged execution* are not
    defined; rationale sits in requirement text; task 0.3 is ticked though the server's version
    was never measured; spec choices on the log copy, the check's pass and `plugin.json`'s keys
    are not among the decisions; and *Why* describes issue #152 as it was.
  - Task 1.10 of #175, built before this change, removes the usage read (`runUsage`), carrying
    out #143's decision 37, so this change's two citations for the removal, of #175 and of
    #143's decision 37, are both right. `runUsage` is then gone before this
    change is built, so decision 10, the exception for that read in *Every model call names the
    plugin directory*, its scenario, task 2.2's mention of it and *Impact*'s `src/budget.ts
    (runUsage)` all describe code that no longer exists and should go.
  - When the startup check is a seat's first probe, its spend should be recorded as a probe,
    so #143's hourly limit and back-off count it.
  - The scenario on a session log replaced by a link passes on permissions alone; a link to a
    file the worker user can read would test the rule.
  - Nobody has measured that Claude Code keeps nothing under `HOME` outside the two reset
    paths; that needs a task.
  - Under the shipped systemd unit, the run's home is under `/var/lib/igor`, not
    `~/.local/state`, so decision 16's stated reason needs rewording.
  - The session log copy's mode `0600`, and exit 78 under `igor run`, need decisions of their
    own.
- **Other findings of the 2026-10-21 consistency read, for this change's authors:** the session
  log's copy reads the log without following a link and only as a regular file with one link,
  but #175's *The Igor reads no file on the worker's behalf through a link* also has an `lstat`
  before the open, a non-blocking open and a kill before reading, which the copy lacks, so a worker that makes its log a FIFO hangs the copy; task 0.2 does not list
  bug-hunter's `mint-trailer.sh` or prose's `--message-goals-file`, which #153 calls; decision 20
  still cites question 10 of #153's *For Adam* list, which #153 has since renumbered as its
  decision 29; whether a Read grant on `skills_dir` reaches the files behind a link is left by
  each of this change and #153 to the other; under `igor run`'s fallback, #190's spec-trace row
  rests on a script the worker can write, a limit decision 20 does not name; and several
  refusals and choices lack a scenario or a decision (an extra file in `.claude-plugin/`, a
  hard-linked or FIFO log, fsmonitor off, exit 78 for a relative `IGOR_SKILLS_DIR`).
- **Findings of the 2026-10-19 consistency read, left for a later revision by this change's
  authors.** Four rules are each stated in two or three changes, which will drift apart unless one states
  it and the others cite it: that `igor run` accepts a login the developer keeps outside `HOME`
  (here and #171); that the startup check is charged through the gate (here and #171); the kill
  before a reset (here and #175); and that a role's `skills` does not decide what loads (here,
  #153 and #190). Three refusals of the startup check have no scenario: an extra file in
  `.claude-plugin/`, a `plugin.json` key other than the `hooks` key a scenario already covers,
  and any refusal under `igor run`. A skill's `SKILL.md` can
  declare `allowed-tools`, which the check does not read; no pinned skill declares one today.
  Task 0.3 is ticked but did not run on the version the server runs, which is not known. And
  decision 19 does not list the keys `plugin.json` may hold, `name`, `version` and
  `description`, though the spec fixes them, so a reviewer approving the decisions does not see
  that choice.
- **Findings of a second consistency read the same day, left for the next pass.** Adam
  answered its three questions in decisions 28, 29 and 30. The rest are for this change's
  authors to fix, except the first, whose gap decision 21 accepts. #204's rule places a change that only cites
  another change's requirement after that change, which would put this change after #171, #179
  and #82; #204's list puts it before them. The kill before a reset may go by the worker user's systemd slice here, which #175 says
  a process started through `sudo` is not in. Decision 6 rests on no skill replacing an
  `igor:<name>` skill, but the skill listing sent to the model was not read under
  `--plugin-dir`. Whether a skill's `SKILL.md` can declare hooks, which the layout check would
  not catch, is unmeasured. Two choices are in the spec but not among the decisions: a check
  whose call fails after its init event passes on that list, and the session log's copy refusing
  a link or a hard-linked file. "Model step" and "Igor's state directory" are defined after
  their first use, and four sentences of rationale sit in requirement text.

## Why

Igor's model steps run skills: #153 (`signed-publishing`) has a worker run `prose` and
`bug-hunter`. Today `claude -p` finds skills only in the service user's `~/.claude/skills`, at
whatever version was last installed there, and a same-named skill in the worked repository
runs in its place.

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides the fix: Igor loads its
skills from one pinned directory that it names on every call, holding a copy of the shared
skills changed only on purpose. The issue named the directory with `--add-dir`; decision 1
replaces it.

## What Changes

- **`skills_dir` is `/opt/igor/skills`, or `IGOR_SKILLS_DIR` from the server's environment**
  (decision 12): an absolute path to a plugin directory. It holds `.claude-plugin/plugin.json`,
  which names the plugin `igor`, and the skills under `skills/`, installed by the shared-skills
  manager. Igor adds no installer. Where it does not exist, `igor serve` refuses, and `igor run`
  builds a plugin directory for the run from the skills the person installed (decision 20).
- **Every `claude -p` Igor spawns carries `--plugin-dir <skills_dir>`**: the worker, triage, and
  every later step, never with `--bare`. The usage read is one exception (decision 10); an
  `igor run` that finds no skill the role lists or Igor's own code runs is the other (decision
  20).
  Each skill loads as `igor:<name>`, and the worker invokes it through the Skill tool. A skill
  named the same in the home directory loads under its own name beside it; one in the worked
  repository does not load (decision 8). Every skill installed under `skills_dir` loads for
  every role; a role's `skills` list (#153) decides which skills its worker is told to use and
  whose results Igor's code verifies, and, under `igor run` without `skills_dir`, which of the
  person's installed skills are linked, beside the skills Igor's own code runs (decision 37).
- **No call loads the worked repository's settings** (decision 8), **and every model step in
  the worker's home starts from a reset `~/.claude` and `~/.claude.json`** (decisions 9 and
  31). With a
  worker user, Igor kills every process that user owns before every reset (decision 13).
- **Before its first model call, Igor confirms each installed skill loads.** It reads the skill
  list from the `system/init` event of a `claude -p --model haiku` call made with an empty
  `HOME` and one seat's token. Under `igor serve`, where a seat is due a probe at start, that
  call is the seat's first probe, and its reading is the seat's first (decisions 5, 18 and
  28).
- **The pinned shared-skills commit is at or after `075a73a`** (shared-skills #19), where every
  skill finds its scripts from its base directory, `<skills_dir>/skills/<name>`.

## Capabilities

### New Capabilities

- `pinned-skills`: where Igor's skills come from, how every model call loads them, and the
  check that they load.

### Modified Capabilities

- `task-execution`: the scenario *No state carries between tasks* names what a worker's home
  keeps across tasks (decision 15).

The flags are added to calls owned by `task-execution` and `work-triage`, but the rules cover
every call, so they live in one place, `pinned-skills`.

## Impact

- `src/execute.ts` (`claudeWorker`, and the home and its reset), `src/triage.ts` (`runClaude`),
  `src/budget.ts` (`runUsage`), and `src/wiring.ts` for `skills_dir` and the startup check.
- **#153** depends on this change. #153's design writes the skills directory as `<skills>`, which
  is `<skills_dir>/skills`: Igor's code runs prose's and bug-hunter's scripts from there, and the
  worker is granted none of them (#153). Its role-config requirement refuses a role that lists
  a skill not installed under `skills_dir`, in every command that runs a model step; this change
  refuses nothing on that account. Under `igor run`'s fallback (decision 20), the installed
  skills that check reads are the person's. #153 runs no `prose start`, the call that opened prose's editing hook in a worker's session,
  and needs prose's `sign` to take `--goals-file`, as `check` already does (Adam, 2026-10-19,
  on #153). Shared-skills #27 added that option to `sign` and merged on 2026-10-21, so the
  pinned commit must be at or after that merge (task 0.2).
- **#171** (`seat-files`) archives after this change, in issue #204's order, but its code is
  built first (decision 30). Decision 17 rests on it (*Still open*, the ambient login).
- **#143** withdraws `scheduled-observation`, whose `igor observe` reads usage under a stored
  login, which decision 17 forbids. This change assumes #143 has archived. With a token in its
  environment, the usage read printed no window percentages on 2026-10-18 (`design.md`), and
  #143 removes it in the first change built after #171's code lands (#143's decision 37);
  decision 10 applies to it until then.
- **#175** (`worker-user`) archives before this change (#204): the startup check's prompt goes on
  stdin, as #175's *A prompt reaches claude on stdin, never in its arguments* requires.
- **#82** (`stopped-scope-visible`): the startup check's refusal exits with status 78, as #82's
  *A process that refuses to start exits with status 78* requires.
- **#143's seat probe**, the call that reads a seat's windows from its `rate_limit_event`, and
  **#144's startup self-test** are `claude -p` calls, so they carry the flag. The skills check
  runs once per start, not once per seat. Under `igor serve`, where a seat is due a probe, it
  is that seat's first probe (decision 28): its reading is recorded as the probe's, and #143's
  limits on probes count it.
- `docs/deployment.md` gains the install procedure: a root-owned plugin directory outside the
  service's writable paths, filled by the manager from a clone at a fixed commit.
- **#144's risk stands:** if `--bare` becomes the default for `claude -p`, Igor must opt out
  explicitly.
