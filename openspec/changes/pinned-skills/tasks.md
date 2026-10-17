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
- [ ] 0.3 Measure, on the Claude Code version the server runs, and record in `design.md`:
      - the base directory a skill is given when its entry under `<skills_dir>/skills/` is the
        manager's link into a clone, not a plain directory. If it is the clone's path, #153's
        grants name the clone's path instead;
      - whether `--setting-sources user` and `--strict-mcp-config` keep the working directory's
        `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md` out of a call (for the open
        question on the worked repository's settings);
      - what `claude -p` does when `--plugin-dir` names a directory that does not exist;
      - whether `git -C <clone> rev-parse HEAD` works as the service user on a root-owned clone,
        or stops on git's ownership check;
      - whether a worker started with `--plugin-dir <skills_dir>` under `acceptEdits` can write
        a file under `skills_dir`. If it can, the choice of flag goes back to Adam

## 1. Configuration

- [ ] 1.1 `skills_dir` in `src/config.ts`: add it to `CONFIG_KEYS`, parse it as an optional
      string, and refuse a relative path at load with this message (may be reworded):

      ```
      skills_dir must be an absolute path: <value>
      ```
- [ ] 1.2 `igor.config.example.yaml`: a commented `skills_dir: /opt/igor/skills`, saying it is
      the `igor` plugin directory and pointing at `docs/deployment.md`

## 2. The flag on every call

- [ ] 2.1 One function that builds the arguments every `claude -p` shares, including
      `--plugin-dir <skills_dir>` when it is set. Use it in `claudeWorker` (`src/execute.ts`),
      `runClaude` (`src/triage.ts`) and `runUsage` (`src/budget.ts`); the usage read is built
      as specified unless Adam exempts it (proposal, *Still open*). #143's seat probe and #153's
      steps, built in those changes, call it as well
- [ ] 2.2 Tests: the worker's, triage's and the usage read's arguments carry
      `--plugin-dir <skills_dir>` when it is set, and no `--plugin-dir` when it is not; no
      call's arguments include `--bare`

## 3. Startup check

Runs in `wire` (`src/wiring.ts`), before the first model call, only when `skills_dir` is set.

- [ ] 3.1 Run `claude -p --plugin-dir <skills_dir> --output-format stream-json --verbose`
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
      commit starts with the not-checked line; no check runs without `skills_dir`; the check's
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
      - set `skills_dir: /opt/igor/skills`;
      - update by checking out a new commit on purpose, then restarting. Never the manager's
        `update`, which pulls
- [ ] 5.2 `docs/architecture.md`: a short subsection under §6 on where skills come from and why
      `--plugin-dir`, pointing at this change's `design.md`
- [ ] 5.3 `docs/deployment.md`, in the skills section from 5.1, this note. It may be reworded, but it must
      name both users, the three things, and the reason:

      ```
      Keep the service user and the worker user free of Claude Code hooks, a CLAUDE.md, and skills in ~/.claude/skills. Igor runs claude -p in normal mode, which loads all three into every call, so anything there reaches every worker and every model step.
      ```
