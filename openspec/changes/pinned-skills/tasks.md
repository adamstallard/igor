## 0. Before building

**Build order:** #171's (`seat-files`) code is built before this change's (design.md, decision
30), although issue #204's archive order puts this change first.

- [x] 0.1 Run `claude -p --plugin-dir <dir>` against a plugin and ask the model to use
      `igor:<name>`. Record in `design.md` whether the skill runs, and which directory Claude
      Code reports to the model. **If the skill does not run, stop: the choice of flag is
      revisited.** Done 2026-10-11 with a seat's setup-token rather than an API key: in normal mode
      the model invokes `igor:<name>` through the Skill tool and the skill runs, with the
      plugin's base directory. Under `--bare` the token runs as an API key, not as a seat, so
      Igor never passes `--bare`. Whether a linked skill gets the same base directory is task
      0.3's. See `design.md`, *Measured with a model, 2026-10-11*
- [ ] 0.2 Confirm the shared-skills commit to pin carries bug-hunter's caller-commits mode
      (`caller-result.sh`) and its `mint-trailer.sh`, prose's `check`, `sign`, `verify-staged` and
      `verify-post`, prose's `--message-goals-file`, and `--goals-file` on prose's `sign` as well
      as `check`. #153 needs it on `sign`, and drops
      `prose start`, the call that opened prose's editing hook in a worker's session. Shared-skills
      #27 added `--goals-file` to `sign` and merged on 2026-10-21; pin a commit at or after that
      merge
- [x] 0.3 Before building, measure on Claude Code 2.1.303, and record in `design.md`. Done
      2026-10-18; task 0.5 repeats it on the version the server runs. Each result is in
      `design.md`, *Measured before building, 2026-10-18 (task 0.3)*:
      - the base directory a skill is given when its entry under `<skills_dir>/skills/` is the
        manager's link into a clone. **If it is the clone's path, stop: the choice of flag is
        revisited.** It is the link's path under the plugin; the flag stands;
      - whether a worker started with `--plugin-dir <skills_dir>` under `acceptEdits` can write
        a file under `skills_dir`. **If it can, stop: the choice of flag is revisited.** It
        cannot, and cannot Read there either; the flag stands;
      - whether `--setting-sources user` and `--strict-mcp-config` keep the working directory's
        `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md` out of a call, including
        with `--add-dir <its tree>`. All four stay out, with local and nested files too;
      - that the startup check's call still prints `system/init` with those two flags. It does;
        with no `--model` it ran on sonnet at about twenty times haiku's cost, so the check runs
        on haiku (task 3.1);
      - that a seat's token is the only credential a call uses: in a home just reset from the
        template, beside another account's stored login in `HOME` or the Keychain, and with an
        invalid token beside a stored login. It is, in all three. `apiKeySource` reads `none`
        even when the token authenticated, not `CLAUDE_CODE_OAUTH_TOKEN` as expected; the
        `rate_limit_event` is the sign that a call ran as a seat;
      - which key in `~/.claude.json` marks onboarding done. `hasCompletedOnboarding: true`
        (task 2.4);
      - whether `git -C <clone> rev-parse HEAD` works as the service user on a root-owned clone.
        It stops on git's ownership check; `-c safe.directory=<clone root>` fixes it (task 3.2)

- [ ] 0.4 Run the startup check's exact command from task 3.1, `--tools ""` included, on a seat's
      setup-token under `env -i`, from an empty directory with an empty `HOME`, against a plugin
      with one skill, and record in design.md whether the `system/init` event lists the skill.
      Decision 42 rests on a call made on a login, without `--setting-sources user` and `--strict-mcp-config`. If the event does not list the skill, stop: revisit decision 42 before building task 3.1
- [ ] 0.5 Once the Claude Code version the server runs is known, repeat each measurement of task
      0.3 on it, and record in `design.md` any result that differs from 2.1.303's. Where one of
      task 0.3's stop conditions then holds, stop as that task says
- [ ] 0.6 With `--plugin-dir <skills_dir>` holding `prose`, and a different `prose` in `HOME`'s
      `.claude/skills/`, run a call with the flags every call carries, read the skill listing
      Claude Code sends the model (for example through a local server set as
      `ANTHROPIC_BASE_URL`), and record in `design.md` whether `igor:prose` carries the pinned
      skill's description. In the same run, record whether a skill's `SKILL.md` can declare hooks
      that load. If another copy's text reaches `igor:prose`, or a `SKILL.md` hook loads, stop:
      decision 6 is revisited
- [ ] 0.7 Run a worker in a home just reset from the template, and list every file Claude Code
      writes under `HOME` outside `~/.claude` and `~/.claude.json`; record the list in
      `design.md`. If one of those files is read by a later call, stop: the reset's two paths are
      revisited
- [ ] 0.8 Run a model step that resumes its session with `claude -p --resume`, and a worker that
      starts a subagent, and record in `design.md` every file each session writes under
      `~/.claude/projects/`. If a step's session is more than one file, task 2.8 copies each of
      them. In the same runs, record whether Claude Code keeps a project's memory under
      `~/.claude/projects/` and loads it into a later call in that project; if it does not,
      decision 26's reason for resetting `projects/` is revisited

## 1. Where the skills are

- [ ] 1.1 `skills_dir` is `/opt/igor/skills`, or `IGOR_SKILLS_DIR` from the environment Igor
      starts with, read in `src/wiring.ts`. It does not join `CONFIG_KEYS` in `src/config.ts`, so
      a lore file naming it is refused as an unknown key. A relative `IGOR_SKILLS_DIR` refuses
      the start with this message (may be reworded):

      ```
      IGOR_SKILLS_DIR must be an absolute path: <value>
      ```
- [ ] 1.2 Tests: no `IGOR_SKILLS_DIR` gives `/opt/igor/skills`; `IGOR_SKILLS_DIR` overrides
      it; a relative one refuses the start; `skills_dir` in `igor.config.yaml`, a role file or a
      seat file (#171) is refused as an unknown key
- [ ] 1.3 Where `skills_dir` does not exist, `igor serve` refuses to start, exiting 78. `igor
      run` instead reads the entries holding a `SKILL.md` in `~/.claude/skills` of the `HOME` it
      started with, before it sets the worker's `HOME`, and assembles a plugin directory for the
      run in its state directory, such as `<state directory>/plugin/<role>-<run>`: a
      `.claude-plugin/plugin.json` of
      `{"name": "igor", "version": "0.0.0", "description": "the person's installed skills"}`,
      and under `skills/` one symbolic link, to its resolved path, per entry the role's `skills`
      list (#153) names or that Igor's own code runs, and none for any other entry (proposal,
      decision 37). The skills Igor's own code runs are a list in Igor's code, holding only
      spec-trace. Test: with `spec-trace` installed and not
      listed, it is linked; with `slack-post` installed and not listed, it is not. That directory is the
      run's `skills_dir` for every rule here, and the run removes it when it ends, on an error
      too. It prints this as it starts, where `<configured path>` is `/opt/igor/skills` or the
      path `IGOR_SKILLS_DIR` names, not the assembled directory (may be reworded):

      ```
      ! <configured path> does not exist, so this run loads the skills installed in ~/.claude/skills
      ```

      Where `~/.claude/skills` is missing or holds no such entry, the run passes no
      `--plugin-dir`, makes no startup check, and prints this as it starts (the line may be
      reworded, keeping what it says):

      ```
      ! neither <configured path> nor ~/.claude/skills holds a skill this role uses, so this run loads no skills
      ```

      Tests: `serve` refuses with that path named and exits 78; `run` with a person's
      `~/.claude/skills` holding two linked skills the role lists assembles a directory whose `skills/` links
      to their resolved paths, every call carries `--plugin-dir` naming it,
      the startup check runs against it, and it is gone once the run ends; `run` with neither
      prints the second fenced line above, and no call's arguments carry `--plugin-dir`

## 2. The flag on every call

- [ ] 2.1 One function that builds the arguments Igor's `claude -p` calls share: for every
      call `--setting-sources user`, `--strict-mcp-config` and `--plugin-dir <skills_dir>`. Use
      it in `claudeWorker` (`src/execute.ts`), `runClaude` (`src/triage.ts`) and the startup
      check (3.1). #143's seat probe and #153's steps, built in those changes, call it as well.
      Under `igor run` where `skills_dir` does not exist, it names the run's assembled directory,
      and where neither exists it gives no call `--plugin-dir` (1.3)
- [ ] 2.2 Tests: the worker's and triage's arguments carry `--plugin-dir <skills_dir>`; every
      call's arguments, the startup check's included, carry `--setting-sources user` and
      `--strict-mcp-config`; no call's arguments include `--bare`; under `igor serve`, a worker of
      a role whose `skills` list names one of three installed skills gets all three listed in its
      `system/init` event
- [ ] 2.3 The worker's home: with #175's worker user, that user's own home; without one, a
      home for the `igor run`, under Igor's state directory, named by the run's id, such as
      `<state directory>/home/<role>-<run>`. It is created when the run first needs it, passed
      as the worker's `HOME`, and removed when the run ends, whether it ends normally or on an
      error Igor catches. A run that crashes leaves its home behind, so each `igor run` picks a
      run id and, while it runs, holds an exclusive lock on its own file, `<role>-<run id>.lock`,
      in Igor's state directory. At its start, before its first cycle, it removes the run
      directories (the home, the plugin directory task 1.3 assembled, and the startup check's and
      task 2.10's triage directories) of each earlier run of its role whose lock it can take, and
      the lock file with them; it leaves those of a run whose lock it cannot take. `igor run
      --plan` removes nothing. Tests: of two earlier runs' run directories, triage directories
      included, the ones whose lock is free are removed and the others kept; `--plan` removes
      none
- [ ] 2.4 The template, shipped in Igor's installation, holding exactly these two files (not to
      be reworded), and no skills and no `CLAUDE.md`. Task 0.3's measurements of a home just reset from the template ran on them:

      `.claude/settings.json`:

      ```json
      {}
      ```

      `.claude.json`:

      ```json
      {"hasCompletedOnboarding": true}
      ```
- [ ] 2.5 Build the reset here, in `claudeWorker` (`src/execute.ts`): before every model step
      Igor starts in the worker's home, and never between the calls of one step, such as a
      `claude -p --resume` of the step's session (design.md, decision 31), replace `~/.claude`
      and `~/.claude.json` with a fresh copy of the template, keeping nothing of what was
      there, `~/.claude/.credentials.json` included. Reset nothing else in the home. With a
      worker user, the reset runs as that user, through #175's `sudo` spawn. #153 wires each of
      its model steps to call this reset first, as it calls 2.1's argument builder
- [ ] 2.6 With a worker user, before every reset, run the kill #175 builds for *A kill reaches
      the worker's whole process tree*: its `sudo -n -u <worker user> true` check, then the kill of
      every process the worker user owns. Where #175 skips the kill, fail the run as it does, and
      do not reset. #175 is built before this change, so its kill exists by then. In same-user
      mode, kill nothing before a reset
- [ ] 2.7 Tests: a hook, a `CLAUDE.md` and a skill a worker wrote under `~/.claude`, and an MCP
      server it wrote into `~/.claude.json`, are gone before the next worker and before a model
      step after the worker; so is a `~/.claude/.credentials.json`; `~/.gitconfig` and a file
      under `~/.cache` survive; with a worker user the reset runs as that user; in same-user mode
      `HOME` is the run's home under the state directory, two runs of one role get different
      homes, and a run's home is gone once it ends; the kill names the worker user and runs before
      every reset, including the one before #153's first step after the worker; a step's
      `claude -p --resume` runs with no reset before it and finds the step's session
- [ ] 2.8 When each model step in the worker's home exits (the worker, #153's later steps, and
      a second worker run on the same item), copy its session log, the file under `~/.claude/projects/` for
      its session id, into Igor's state directory before the next reset of that home (decision
      33), mode `0600`. The state directory is the one #216's `graceful-handoff` requirement
      *A handoff states what was done, what remains, and who could continue* defines (decision
      32). With a worker
      user, read it as that user through #175's spawn: `lstat` it first, open it with `O_NOFOLLOW`
      and `O_NONBLOCK`, and copy only where `fstat` on the open file shows a regular file whose
      hard-link count is 1. The run's record in the execution log names each copy by its path
      relative to the state directory, where Igor wrote it, beside its step's session id, or says
      the log was not copied. Where #216 later fails to move a copy, the record's path is still right
      (decision 34). Redact the
      log as it is copied, with `redact` from #217's `src/redact.ts` (design.md, decision 29).
      Tests: each of the worker's, the bug hunt's and the prose pass's logs is copied and named in
      the record; a seat token the worker printed reads `[redacted]` in the copy; after
      the worker exits and a later call resets the home, the record names a file that still
      exists and holds the log, and the record's path holds no home directory or user name; a log
      replaced by a symbolic or hard link to another file the worker user can read is not
      copied, and the record says so; a log replaced by a named pipe is not copied, the copy does
      not wait on it, and the record says so
- [ ] 2.9 When any execution of a work item ends, flagged or not, delete in this host's state
      directory the session log copies of every execution of the item that started before it,
      has ended or whose process has stopped, and left no #216 flagged hold, so never one still
      running; leave a flagged execution's copies to #216's deletion of that execution's files
      (design.md, decision 38). Find the copies by listing this host's state directory, never
      from the execution record, and delete each without following a link and only where it is a
      regular file (decision 43). Record an execution as ended only after #216 has put any flagged
      hold it leaves (decision 40), a rule the TLA+ model in `model/` shows is needed.
      Tests: after an unflagged execution and then a flagged one of the same item, the first's
      copies are gone and the second's remain; after a flagged execution and then an unflagged
      one, the flagged one's copies remain; after an execution whose process was killed and then
      an unflagged one, the killed one's copies are gone; with an earlier execution still
      running when a later one ends, the earlier one's copies remain; with a later execution
      ending after a flagged one stops working and before its hold is recorded, which the test
      arranges by holding back #216's hold write, the flagged one's copies remain; a link put in
      place of an earlier execution's copy is not followed.
      How a host knows which executions of an item left copies in its state directory, their
      start order, and whether each ended or its process stopped is this task's to choose: keep,
      beside each execution's copies in the state directory, a file naming its item, its start
      time, the Igor process running it (its process id and that process's start time), and
      whether it ended; judge an execution's process stopped when no live process matches both.
      This works under `igor serve`, which has no run lock, as under `igor run`. The TLA+ model proves the deletion rule over these per-execution facts (item, start order,
      ended or stopped) whatever the
      mechanism, so only the rule above binds the choice
- [ ] 2.10 Under `igor run`, run each triage call with `HOME` set to a new, empty directory under
      the state directory, named with the run's id, such as `<state directory>/triage/<role>-<run>-<n>`,
      and remove it once the call ends; task 2.3's start-of-run removal also removes those a
      crashed run left. Tests: with a hook and a `CLAUDE.md` in the person's `~/.claude`, a
      triage call under `igor run` runs with the new directory as `HOME`, the hook does not run,
      and the directory is gone after the call
- [ ] 2.11 Replace `~/.claude` and `~/.claude.json` in each reset, and remove every run
      directory (the home, the assembled plugin directory, the startup check's and triage's
      directories), without following a link in them: a link is removed, never its target. Write
      each session
      log copy with `O_CREAT | O_EXCL | O_NOFOLLOW`, recording the log as not copied where that
      open fails. Tests: a link in a run's home to a file outside it is removed and its target is
      unchanged; in same-user mode, a `~/.claude` replaced by a link to the person's directory is
      removed by the reset, which writes a fresh one, and the directory is unchanged; a link already at a copy's path is not written through, and the record says the
      log was not copied

## 3. Startup check

Runs before the first model call: in `wire` (`src/wiring.ts`) when a seat can be probed or
the gate names one at start, otherwise just before the first model call, once a seat can be
probed or the gate names one. A failing
check exits 78 wherever it runs.

- [ ] 3.1 Run `claude -p --model haiku --tools "" --plugin-dir <skills_dir> --setting-sources user
      --strict-mcp-config --output-format stream-json --verbose`
      with the one-word prompt `ok` on stdin (#175), from an empty directory, and an
      environment of `PATH`, the host's network settings, a `HOME` that is another empty
      directory, and one seat's token. Under `igor serve`, make it the first seat probe after
      the start, through #143's probe code, in the two directories #143 places under
      `/var/lib/igor/probes`, recording its `rate_limit_event` as that seat's reading (design.md, decision 42: like #143's probe,
      it denies every tool). Where #143 refuses to start that probe because one of its directories
      fails #143's check or cannot be created, refuse to start, exiting 78, naming the directory
      and what is wrong with it (design.md, decision 41). Under `igor run`, remove the check's two
      directories once its call ends, and have the next `igor run` remove those of a run whose
      process is gone (decision 39). Message (may be reworded):

      ```
      the startup check is the first probe of seat <seat>, and #143 refused to start it because <dir> <what is wrong>; fix the directory and start Igor again
      ```

      Where no
      seat may be probed, because none is due or #143's hourly limit or back-off holds off every
      seat that is due, spend the seat the budget gate chose (design.md, decision 28). Under `igor run`, spend the
      implicit local seat, with the token in `IGOR_RUN_TOKEN`, from two new directories under
      Igor's state directory (design.md, decisions 28 and 39). Let the call run to its `result` event and record its
      cost against that seat as any call's is. Where no seat can be probed and the gate names
      none, make no call, and run the check before the first model call, once a seat can be
      probed or the gate names one. Read
      the `system/init` event's `skills`. Refuse to start when
      `igor:<name>` is missing for a skill under `<skills_dir>/skills/`, or when no init event
      arrives though the model provider answered. Each refusal exits with status 78. Where no
      init event arrives and the provider did not answer, that is, the stream holds no
      `rate_limit_event`, no model reply and no error the provider returned, and the call ended on
      a connection failure, exit with status 1 instead. Both follow #82's *A process that refuses
      to start exits with status 78*. Messages (may be reworded):

      ```
      skill <name> is installed in <skills_dir>/skills, but claude -p --plugin-dir <skills_dir> does not load it as igor:<name>
      ```

      ```
      claude -p --plugin-dir <skills_dir> printed no system/init event, so Igor cannot confirm its skills load
      ```

      ```
      the model provider did not answer the startup check, so Igor cannot confirm its skills load yet
      ```

      Before the call, refuse to start, exiting 78, when `<skills_dir>/skills/` is missing or
      holds no skill (an entry whose top level holds a `SKILL.md`; any other entry is ignored), when `skills_dir` holds an entry besides `.claude-plugin/` and `skills/`, or when
      `.claude-plugin/` holds anything but a `plugin.json` whose only keys are `name`, `version`
      and `description`. Messages (may be reworded):

      ```
      no skills are installed in <skills_dir>/skills, so Igor has no skills to load
      ```

      ```
      <skills_dir> holds <entry>, but Igor's plugin directory may hold only .claude-plugin/plugin.json and skills/
      ```

      ```
      <skills_dir>/.claude-plugin holds <entry>, but it may hold only plugin.json
      ```
- [ ] 3.2 Report each skill and the commit its files come from, one startup line per skill.
      `<resolved dir>` is the directory the skill's entry under `<skills_dir>/skills/` resolves
      to. `<clone root>` is the nearest directory at or above `<resolved dir>`
      that holds `.git`. Every commit read passes `-c core.fsmonitor=false`. Where root owns
      `<clone root>`, the commit is
      `git -c safe.directory=<clone root> -c core.fsmonitor=false -C <resolved dir> rev-parse HEAD`.
      The clone is root-owned (5.1), and without the `safe.directory` option git refuses it as the
      service user with `detected dubious ownership` (task 0.3). Pass both options on this command
      only, and never write them to the service user's `~/.gitconfig`. Where the user Igor runs as
      owns it, run `git -c core.fsmonitor=false -C <resolved dir> rev-parse HEAD`, with no
      `safe.directory`. Where any other user owns it, run no git command and report
      the commit as not checked:

      ```
      skill igor:<name>: <12-hex commit> (<resolved dir>)
      ```

      Where the commit cannot be read, or `<resolved dir>` is not in a git clone, the line says
      so and the start goes on:

      ```
      skill igor:<name>: commit not checked (<resolved dir>): <git's error, or the clone's owner>
      ```
- [ ] 3.3 Tests: each refusal above with its message, a `hooks.json` in `.claude-plugin/` and an
      `mcpServers` key in `plugin.json` among them; under `igor run`, a linked skill missing from
      the event refuses with 78; a relative `IGOR_SKILLS_DIR` exits 78; a clone owned by the user
      Igor runs as is read with no `safe.directory` option; a check whose call ends on a connection failure with no init event exits 1, not 78; a
      passing check starts; the check's
      arguments carry `--model haiku` and `--tools ""`; a startup check whose probe #143 refuses
      for a directory other users can write exits 78 naming that directory; the commit read carries `-c safe.directory=<clone root>`
      and `-c core.fsmonitor=false` for a root-owned clone; a clone another user owns runs no
      git command and reports not checked; a missing or empty `skills/`, and a `hooks/` in
      `skills_dir`, each refuse the start before any call; the check runs from an empty
      directory with an empty `HOME`; an unreadable commit starts with the not-checked
      line; the check's
      environment holds one seat's token and no other seat's, and no `ANTHROPIC_API_KEY`
      even when the process has one; its `HOME` is not the service user's; its spend is recorded
      against that seat; under `igor serve` with one reserved seat and no reading, the check is
      that seat's probe and its reading is recorded; with every seat read, it spends the seat
      the gate chose; with a seat due a probe but held off by the hourly limit or back-off,
      and another seat read, it spends the seat the gate chose; under `igor run` its working
      directory and `HOME` lie under the state directory; and with no seat to probe or spend it
      is not made

## 4. The pinned shared-skills commit

- [ ] 4.1 Choose the shared-skills commit the deployment pins: at or after `075a73a`
      (shared-skills #19), where every skill finds its scripts from its base directory, and
      carrying everything 0.2 lists. 5.1 tells the operator to check out that commit

## 5. Docs

- [ ] 5.1 `docs/deployment.md`, a section on skills:
      - clone shared-skills to `/opt/igor/shared-skills` and check out the commit 4.1 chose,
        owned by root. Igor reads its commit as the service user with a
        `safe.directory` option on that one command (3.2), so the operator adds no
        `safe.directory` entry for it;
      - write `/opt/igor/skills/.claude-plugin/plugin.json` as
        `{"name": "igor", "version": "0.0.0", "description": "Igor's pinned skills"}`;
      - install with
        `SHARED_SKILLS_TARGET=/opt/igor/skills/skills python3 /opt/igor/shared-skills/.agents/skills/manage-skills/scripts/skills.py install --no-hook prose bug-hunter spec-trace`,
        as root;
      - that Igor finds the plugin there with no setting, and that `IGOR_SKILLS_DIR` in the
        unit's environment points it elsewhere;
      - update by checking out a new commit on purpose, then restarting. Never the manager's
        `update`, which pulls
- [ ] 5.2 `docs/architecture.md`: a short subsection under §6 on where skills come from and why
      `--plugin-dir`, pointing at this change's `design.md`
- [ ] 5.3 `docs/deployment.md`, in the skills section from 5.1, this note. It may be reworded, but it must
      name the three things, why they reach the service user's calls, and why they do not reach
      a worker:

      ```
      Keep the service user free of Claude Code hooks, a CLAUDE.md, and skills in ~/.claude/skills. Igor runs claude -p without --bare, which loads all three into every call, and the service user's home is not reset, so anything there reaches every triage call. A worker user's ~/.claude is replaced from Igor's template before every model step, so what is there never reaches a worker.
      ```
- [ ] 5.4 `docs/deployment.md`, in the same section, this note (decision 17). It may be
      reworded, but it must say that Igor uses no stored login, that the reset deletes one, and
      where a person creates a token. The section it points at, "Getting the token", is #171's
      task 9.5, built before this change (design.md, decision 30):

      ```
      Igor never uses a stored Claude login. Every seat has a token, and each call gets only its seat's token, in its environment; docs/seats.md, "Getting the token", shows how to create one. Before every model step in a worker's home Igor replaces ~/.claude and ~/.claude.json from its template, which deletes any login stored there, so don't log the service user or a worker user in to Claude.
      ```
- [ ] 5.5 When this change is archived, move `model/` to `openspec/specs/pinned-skills/model/` and
      point `.github/workflows/tla-pinned-skills.yml`'s paths and working directory there, so
      TLC keeps running once the change's directory moves under `archive/`
