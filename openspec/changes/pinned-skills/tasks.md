## 0. Before building

- [x] 0.1 With `ANTHROPIC_API_KEY`, run `claude -p --bare --plugin-dir <dir>` against a plugin
      the manager filled (symlinks into a clone) and ask the model to use `igor:prose`. Record
      in `design.md` whether the skill runs, and which directory Claude Code reports to the
      model: the link under `<dir>/skills/` or the clone it resolves to. **If the skill does not
      run, stop: the choice of flag goes back to Adam.** If the reported directory is the
      clone, #153's grants name the clone's path instead. Done
      2026-10-11 with a seat's setup-token: in normal mode the model invokes `igor:<name>`
      through the Skill tool and the skill runs, with the plugin's base directory. Under
      `--bare` the token runs as an API key, not as a seat, so Igor never passes `--bare`. See
      `design.md`, *Measured with a model*
- [ ] 0.2 Confirm the shared-skills commit to pin carries bug-hunter's caller-commits mode
      (`caller-result.sh`) and prose's `start`, `check`, `sign`, `verify-staged` and
      `verify-post`
- [ ] 0.3 Before building, measure on the Claude Code version the server runs, and record in
      `design.md`:
      - the base directory a skill is given when its entry under `<skills_dir>/skills/` is the
        manager's link into a clone, not a plain directory. **If it is the clone's path, stop:
        the choice of flag goes back to Adam.** This replaces 0.1's fallback of naming the
        clone's path in #153's grants;
      - whether a worker started with `--plugin-dir <skills_dir>` under `acceptEdits` can write
        a file under `skills_dir`. **If it can, stop: the choice of flag goes back to Adam;**
      - whether `--setting-sources user` and `--strict-mcp-config` keep the working directory's
        `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md` out of a call, including
        when the worker is also passed `--add-dir <its tree>` as it is today. If any of the
        four still loads, the means of excluding it goes back to Adam;
      - that the startup check's call still prints `system/init` before it fails to log in
        with those two flags added;
      - that a worker whose `~/.claude` and `~/.claude.json` were just reset from the template,
        with `~/.claude/.credentials.json` kept, still authenticates as its seat: with the
        seat's token from its environment it receives a `rate_limit_event`, and the init event's
        `apiKeySource` names the token, and that with a deliberately invalid token in the
        environment the call fails rather than falling back to the kept login;
      - which key in `~/.claude.json` marks onboarding done, so that a call made from the
        template's copy starts without onboarding;
      - whether `git -C <clone> rev-parse HEAD` works as the service user on a root-owned clone,
        or stops on git's ownership check

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

## 2. The flag on every call

- [ ] 2.1 One function that builds the arguments every `claude -p` shares, including
      `--plugin-dir <skills_dir>` when it is set. Use it in `claudeWorker` (`src/execute.ts`),
      `runClaude` (`src/triage.ts`) and `runUsage` (`src/budget.ts`). Every call gets
      `--setting-sources user` and `--strict-mcp-config`; every call but `runUsage` gets
      `--plugin-dir <skills_dir>`. #143's seat probe and #153's steps, built in those changes, call it as
      well
- [ ] 2.2 Tests: the worker's and triage's arguments carry `--plugin-dir <skills_dir>`; the
      usage read's never carry it; every
      call's arguments, the startup check's included, carry `--setting-sources user` and
      `--strict-mcp-config`; no call's arguments include `--bare`
- [ ] 2.3 The worker's home: with #175's worker user, that user's own home; without one, a
      home per role under Igor's state directory, such as `~/.local/state/igor/home/<role>`,
      created when first needed and passed as the worker's `HOME`
- [ ] 2.4 The template, shipped in Igor's installation: a `settings.json` holding only what Igor
      needs, with no hooks and no MCP servers, its contents written verbatim into this task
      before it is built; no skills and no `CLAUDE.md`; and a
      `.claude.json` with onboarding marked done, by the key task 0.3 finds, and no MCP servers
- [ ] 2.5 Before every `claude -p` Igor starts in the worker's home (`claudeWorker` in
      `src/execute.ts`), replace `~/.claude` and `~/.claude.json` with a fresh copy of the
      template, keeping `~/.claude/.credentials.json`. Reset nothing else in the home. With a
      worker user, the reset runs as that user, through #175's `sudo` spawn. Each of #153's model
      steps calls the same reset first, built in #153, as it calls 2.1's argument builder, and
      #153's `prose start` runs after that reset, not with one of its own
- [ ] 2.6 With a worker user, before every reset, kill every
      process that user owns, by user or by the user's systemd slice, whichever the
      implementer finds works (Adam left the means open). Build it once #175's
      `sudo` spawn exists
- [ ] 2.7 Tests: a hook, a `CLAUDE.md` and a skill a worker wrote under `~/.claude`, and an MCP
      server it wrote into `~/.claude.json`, are gone before the next worker and before a model
      step after the worker; `~/.claude/.credentials.json`, `~/.gitconfig` and a file under
      `~/.cache` survive; with a worker user the reset runs as that user; in same-user mode
      `HOME` is the role's home under the state directory; the kill names the worker user and
      runs before every reset, including the one before #153's first step after the worker

## 3. Startup check

Runs in `wire` (`src/wiring.ts`), before the first model call.

- [ ] 3.1 Run `claude -p --plugin-dir <skills_dir> --setting-sources user --strict-mcp-config
      --output-format stream-json --verbose`
      with a one-word prompt, stdin closed, from an empty temporary directory, and an
      environment of `PATH` and a `HOME` that is another empty temporary directory. Read
      the `system/init` event's `skills`, then stop the process. Refuse to start when
      `igor:<name>` is missing for a skill under `<skills_dir>/skills/`, or when no init event
      arrives. Messages (may be reworded):

      ```
      skill <name> is installed in <skills_dir>/skills, but claude -p --plugin-dir <skills_dir> does not load it as igor:<name>
      ```

      ```
      claude -p --plugin-dir <skills_dir> printed no system/init event, so Igor cannot confirm its skills load
      ```
- [ ] 3.2 Report each skill and the commit its files come from, one startup line per skill.
      `<resolved dir>` is the directory the skill's entry under `<skills_dir>/skills/` resolves
      to, and the commit is `git -C <resolved dir> rev-parse HEAD`:

      ```
      skill igor:<name>: <12-hex commit> (<resolved dir>)
      ```

      Where the commit cannot be read, or `<resolved dir>` is not in a git clone, the line says
      so and the start goes on:

      ```
      skill igor:<name>: commit not checked (<resolved dir>): <git's error>
      ```
- [ ] 3.3 Tests: each refusal above with its message; a passing check starts; an unreadable
      commit starts with the not-checked line; the check's
      environment holds no `CLAUDE_CODE_OAUTH_TOKEN` and no `ANTHROPIC_API_KEY` even when the
      process has them, and its `HOME` is not the service user's

## 4. The pinned shared-skills commit

- [ ] 4.1 The pinned shared-skills commit is at or after `075a73a` (shared-skills #19), where
      every skill finds its scripts from its base directory. `docs/deployment.md` (5.1) says so

## 5. Docs

- [ ] 5.1 `docs/deployment.md`, a section on skills:
      - clone shared-skills to `/opt/igor/shared-skills` and check out a commit at or after
        `075a73a`, owned by root;
      - write `/opt/igor/skills/.claude-plugin/plugin.json` as
        `{"name": "igor", "version": "0.0.0", "description": "Igor's pinned skills"}`;
      - install with
        `SHARED_SKILLS_TARGET=/opt/igor/skills/skills python3 /opt/igor/shared-skills/.agents/skills/manage-skills/scripts/skills.py install --no-hook prose bug-hunter`,
        as root;
      - that Igor finds the plugin there with no setting, and that `IGOR_SKILLS_DIR` in the
        unit's environment points it elsewhere;
      - update by checking out a new commit on purpose, then restarting. Never the manager's
        `update`, which pulls
- [ ] 5.2 `docs/architecture.md`: a short subsection under §6 on where skills come from and why
      `--plugin-dir`, pointing at this change's `design.md`
- [ ] 5.3 `docs/deployment.md`, in the skills section from 5.1, this note. It may be reworded, but it must
      name both users, the three things, and the reason:

      ```
      Keep the service user and the worker user free of Claude Code hooks, a CLAUDE.md, and skills in ~/.claude/skills. Igor runs claude -p in normal mode, which loads all three into every call, so anything there reaches every worker and every model step.
      ```
- [ ] 5.4 `docs/deployment.md`, in the same section, this note (decision 17). It may be
      reworded, but it must say that the worker can read and overwrite the file, and why that
      is accepted. If the open question on where the stored login comes from puts anyone
      else's login in that file, this note goes back to Adam before it ships:

      ```
      A worker can read and overwrite ~/.claude/.credentials.json in its home, which Igor keeps when it resets ~/.claude. With a worker user, that file is the worker user's own login, and the token of the seat a worker spends is already in its environment, so reading the file gives a worker nothing it does not already have. Under igor run, it is your own login, whose files the worker can read anyway.
      ```
