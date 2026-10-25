## 0. Before building

**Build order:** #171's (`seat-files`) code is built before this change's (proposal, decision
30), although issue #204's archive order puts this change first.

- [x] 0.1 Run `claude -p --plugin-dir <dir>` against a plugin and ask the model to use
      `igor:<name>`. Record in `design.md` whether the skill runs, and which directory Claude
      Code reports to the model. **If the skill does not run, stop: the choice of flag goes back
      to Adam.** Done 2026-10-11 with a seat's setup-token rather than an API key: in normal mode
      the model invokes `igor:<name>` through the Skill tool and the skill runs, with the
      plugin's base directory. Under `--bare` the token runs as an API key, not as a seat, so
      Igor never passes `--bare`. Whether a linked skill gets the same base directory is task
      0.3's. See `design.md`, *Measured with a model, 2026-10-11*
- [ ] 0.2 Confirm the shared-skills commit to pin carries bug-hunter's caller-commits mode
      (`caller-result.sh`), prose's `check`, `sign`, `verify-staged` and `verify-post`, and
      `--goals-file` on prose's `sign` as well as `check`. #153 needs it on `sign`, and drops
      `prose start`, the call that opened prose's editing hook in a worker's session (Adam, 2026-10-19, on #153). Shared-skills #27 added
      `--goals-file` to `sign` and merged on 2026-10-21; pin a commit at or after that merge
- [x] 0.3 Before building, measure on the Claude Code version the server runs, and record in
      `design.md`. Done 2026-10-18 on Claude Code 2.1.303. The version the server runs is not
      known, so it was not measured on, and `design.md` gives the results for 2.1.303 alone.
      Each result is in `design.md`, *Measured before building, 2026-10-18 (task 0.3)*:
      - the base directory a skill is given when its entry under `<skills_dir>/skills/` is the
        manager's link into a clone. **If it is the clone's path, stop: the choice of flag goes
        back to Adam.** It is the link's path under the plugin; the flag stands;
      - whether a worker started with `--plugin-dir <skills_dir>` under `acceptEdits` can write
        a file under `skills_dir`. **If it can, stop: the choice of flag goes back to Adam.** It
        cannot, and cannot Read there either; the flag stands;
      - whether `--setting-sources user` and `--strict-mcp-config` keep the working directory's
        `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md` out of a call, including
        with `--add-dir <its tree>`. All four stay out, with local and nested files too;
      - that the startup check's call still prints `system/init` with those two flags. It does;
        with no `--model` it ran on sonnet at about twenty times haiku's cost, so Adam pinned it
        to haiku (task 3.1);
      - that a seat's token is the only credential a call uses: in a home just reset from the
        template, beside another account's stored login in `HOME` or the Keychain, and with an
        invalid token beside a stored login. It is, in all three. `apiKeySource` reads `none`
        even when the token authenticated, not `CLAUDE_CODE_OAUTH_TOKEN` as expected; the
        `rate_limit_event` is the sign that a call ran as a seat;
      - which key in `~/.claude.json` marks onboarding done. `hasCompletedOnboarding: true`
        (task 2.4);
      - whether `git -C <clone> rev-parse HEAD` works as the service user on a root-owned clone.
        It stops on git's ownership check; `-c safe.directory=<clone root>` fixes it (task 3.2)

## 1. Where the skills are

- [ ] 1.1 `skills_dir` is `/opt/igor/skills`, or `IGOR_SKILLS_DIR` from the environment Igor
      starts with, read in `src/wiring.ts`. It does not join `CONFIG_KEYS` in `src/config.ts`, so
      a lore file naming it is refused as an unknown key. A relative `IGOR_SKILLS_DIR` refuses
      the start with this message (may be reworded):

      ```
      IGOR_SKILLS_DIR must be an absolute path: <value>
      ```
- [ ] 1.2 Tests: no `IGOR_SKILLS_DIR` gives `/opt/igor/skills`; `IGOR_SKILLS_DIR` overrides
      it; a relative one refuses the start; `skills_dir` in `igor.config.yaml` is refused as an
      unknown key
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
      to their resolved paths, every call but the usage read carries `--plugin-dir` naming it,
      the startup check runs against it, and it is gone once the run ends; `run` with neither
      prints the second fenced line above, and no call's arguments carry `--plugin-dir`

## 2. The flag on every call

- [ ] 2.1 One function that builds the arguments Igor's `claude -p` calls share: for every
      call `--setting-sources user` and `--strict-mcp-config`, and for every call but
      `runUsage` `--plugin-dir <skills_dir>`. Use it in `claudeWorker` (`src/execute.ts`),
      `runClaude` (`src/triage.ts`), `runUsage` (`src/budget.ts`) and the startup check (3.1).
      #143's seat probe and #153's steps, built in those changes, call it as well. Under `igor
      run` where `skills_dir` does not exist, it names the run's assembled directory, and where
      neither exists it gives no call `--plugin-dir` (1.3). Where #143's
      removal of the usage read (#143's decision 37) has been built, `runUsage` is gone and
      needs no change
- [ ] 2.2 Tests: the worker's and triage's arguments carry `--plugin-dir <skills_dir>`; the
      usage read's never carry it; every
      call's arguments, the startup check's included, carry `--setting-sources user` and
      `--strict-mcp-config`; no call's arguments include `--bare`
- [ ] 2.3 The worker's home: with #175's worker user, that user's own home; without one, a
      home for the `igor run`, under Igor's state directory, named by the run's id, such as
      `<state directory>/home/<role>-<run>`. It is created when the run first needs it, passed
      as the worker's `HOME`, and removed when the run ends, whether it ends normally or on an
      error Igor catches. The run's id is the one #179 gives each `igor run`, which its trees
      also carry. A run that crashes leaves its home behind. So at its start, before its first
      cycle, each `igor run` also removes the home, and the plugin directory task 1.3 assembled,
      of each earlier run of its role whose lock it can take, in the same sweep as #179's task
      4.5 removes that run's trees; it leaves those of a run whose lock it cannot take. The lock
      is #179's: each `igor run` holds it, while it runs, on its own file
      `<role>-0-<run id>.lock` in the trees' directory, rank 0 being `igor run`'s. `igor run
      --plan` removes nothing. Tests: of two earlier runs' homes and plugin directories, the one
      whose lock is free is removed and the other kept; `--plan` removes neither
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
      `claude -p --resume` of the step's session (proposal, decision 31), replace `~/.claude`
      and `~/.claude.json` with a fresh copy of the template, keeping nothing of what was
      there, `~/.claude/.credentials.json` included. Reset nothing else in the home. With a
      worker user, the reset runs as that user, through #175's `sudo` spawn. #153 wires each of
      its model steps to call this reset first, as it calls 2.1's argument builder
- [ ] 2.6 With a worker user, before every reset, kill every
      process that user owns, by user or by the user's systemd slice, whichever the
      implementer finds kills them all in the tests below (Adam left the means open). Not by
      process group: each command a worker runs starts in a session of its own, as #175's
      measurement 6.2 found. #175 is built before this change, so its `sudo` spawn exists by
      then
- [ ] 2.7 Tests: a hook, a `CLAUDE.md` and a skill a worker wrote under `~/.claude`, and an MCP
      server it wrote into `~/.claude.json`, are gone before the next worker and before a model
      step after the worker; so is a `~/.claude/.credentials.json`; `~/.gitconfig` and a file
      under `~/.cache` survive; with a worker user the reset runs as that user; in same-user mode
      `HOME` is the run's home under the state directory, two runs of one role get different
      homes, and a run's home is gone once it ends; the kill names the worker user and runs before
      every reset, including the one before #153's first step after the worker; a step's
      `claude -p --resume` runs with no reset before it and finds the step's session
- [ ] 2.8 When each model step in the worker's home exits (the worker, #153's later steps, and
      #189's second worker run), copy its session log, the file under `~/.claude/projects/` for
      its session id, into Igor's state directory before the next reset of that home (decision
      33), mode `0600`. The state directory is the one #216's `graceful-handoff` requirement
      *A handoff states what was done, what remains, and who could continue* defines (decision
      32). With a worker
      user, read it as that user through #175's spawn, opened without following a link and only
      where `fstat` shows a regular file whose hard-link count is 1. The run's record in `executions.ndjson`
      names each copy's path, where Igor wrote it, beside its step's session id, or says the log
      was not copied. Where #216 later fails to move a copy, the record's path is still right
      (decision 34). Redact the
      log as it is copied, with `redact` from #217's `src/redact.ts` (proposal, decision 29).
      Tests: each of the worker's, the bug hunt's and the prose pass's logs is copied and named in
      the record; a seat token the worker printed reads `[redacted]` in the copy; after
      the worker exits and a later call resets the home, the record names a file that still
      exists and holds the log; a log replaced by a link to a file only Igor can read is not
      copied, and the record says so
- [ ] 2.9 When any execution of a work item ends, flagged or not, delete in this host's state
      directory the session log copies of every execution of the item that started before it and
      left no #216 flagged hold, one whose process stopped before it ended included; leave a
      flagged execution's copies to #216's deletion of that run's files (proposal, decision 38).
      Tests: after an unflagged execution and then a flagged one of the same item, the first's
      copies are gone and the second's remain; after a flagged execution and then an unflagged
      one, the flagged one's copies remain; after an execution whose process was killed and then
      an unflagged one, the killed one's copies are gone

## 3. Startup check

Runs before the first model call: in `wire` (`src/wiring.ts`) when a seat can be probed or
the gate names one at start, otherwise just before the first model call, once a seat can be
probed or the gate names one. A failing
check exits 78 wherever it runs.

- [ ] 3.1 Run `claude -p --model haiku --plugin-dir <skills_dir> --setting-sources user
      --strict-mcp-config --output-format stream-json --verbose`
      with the one-word prompt `ok` on stdin (#175), from an empty directory, and an
      environment of `PATH`, the host's network settings, a `HOME` that is another empty
      directory, and one seat's token. Under `igor serve`, make it the first seat probe after
      the start, through #143's probe code, in the two directories #143 places under
      `/var/lib/igor/probes`, recording its `rate_limit_event` as that seat's reading; where no
      seat may be probed, because none is due or #143's hourly limit or back-off holds off every
      seat that is, spend the seat the budget gate chose (proposal, decision 36). Under `igor run`, spend the
      implicit local seat, with the token in `IGOR_RUN_TOKEN`, from two new directories under
      Igor's state directory (proposal, decisions 28 and 39). Let the call run to its `result` event and record its
      cost against that seat as any call's is. Where no seat can be probed and the gate names
      none, make no call, and run the check before the first model call, once a seat can be
      probed or the gate names one. Read
      the `system/init` event's `skills`. Refuse to start when
      `igor:<name>` is missing for a skill under `<skills_dir>/skills/`, or when no init event
      arrives. Each refusal exits with status 78, as #82's *A process that refuses to start
      exits with status 78* requires. Messages (may be reworded):

      ```
      skill <name> is installed in <skills_dir>/skills, but claude -p --plugin-dir <skills_dir> does not load it as igor:<name>
      ```

      ```
      claude -p --plugin-dir <skills_dir> printed no system/init event, so Igor cannot confirm its skills load
      ```

      Before the call, refuse to start, exiting 78, when `<skills_dir>/skills/` is missing or
      empty, when `skills_dir` holds an entry besides `.claude-plugin/` and `skills/`, or when
      `.claude-plugin/` holds anything but a `plugin.json` whose only keys are `name`, `version`
      and `description`. Messages (may be reworded):

      ```
      no skills are installed in <skills_dir>/skills, so Igor has no skills to load
      ```

      ```
      <skills_dir> holds <entry>, but Igor's plugin directory may hold only .claude-plugin/plugin.json and skills/
      ```
- [ ] 3.2 Report each skill and the commit its files come from, one startup line per skill.
      `<resolved dir>` is the directory the skill's entry under `<skills_dir>/skills/` resolves
      to. `<clone root>` is the nearest directory at or above `<resolved dir>`
      that holds `.git`. Where root owns `<clone root>`, the commit is
      `git -c safe.directory=<clone root> -c core.fsmonitor=false -C <resolved dir> rev-parse HEAD`.
      The clone is root-owned (5.1), and without the option git refuses it as the service user
      with `detected dubious ownership` (task 0.3). Pass both options on this command only, and
      never write them to the service user's `~/.gitconfig`. Where the user Igor runs as owns it,
      run the command without them. Where any other user owns it, run no git command and report
      the commit as not checked:

      ```
      skill igor:<name>: <12-hex commit> (<resolved dir>)
      ```

      Where the commit cannot be read, or `<resolved dir>` is not in a git clone, the line says
      so and the start goes on:

      ```
      skill igor:<name>: commit not checked (<resolved dir>): <git's error, or the clone's owner>
      ```
- [ ] 3.3 Tests: each refusal above with its message; a passing check starts; the check's
      arguments carry `--model haiku`; the commit read carries `-c safe.directory=<clone root>`
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
      task 9.5, built before this change (proposal, decision 30):

      ```
      Igor never uses a stored Claude login. Every seat has a token, and each call gets only its seat's token, in its environment; docs/seats.md, "Getting the token", shows how to create one. Before every model step in a worker's home Igor replaces ~/.claude and ~/.claude.json from its template, which deletes any login stored there, so don't log the service user or a worker user in to Claude.
      ```
