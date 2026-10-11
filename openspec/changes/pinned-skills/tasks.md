## 0. Before building

- [x] 0.1 With `ANTHROPIC_API_KEY`, run `claude -p --bare --plugin-dir <dir>` against a plugin
      the manager filled (symlinks into a clone) and ask the model to use `igor:prose`. Record
      in `design.md` whether the skill runs, and which directory Claude Code reports to the
      model: the link under `<dir>/skills/` or the clone it resolves to. **If the skill does not
      run, stop: the choice of flag goes back to Adam.** If the reported directory is the
      clone, #153's grants and the paragraph in 4.1 name the clone's path instead. Done
      2026-10-11 with a seat's setup-token: in normal mode the model invokes `igor:<name>`
      through the Skill tool and the skill runs, with the plugin's base directory. Under
      `--bare` the token runs as an API key, not as a seat, so Igor never passes `--bare`. See
      `design.md`, *Measured with a model*
- [ ] 0.2 Confirm the shared-skills commit to pin carries bug-hunter's caller-commits mode
      (`caller-result.sh`) and prose's `start`, `check`, `sign`, `verify-staged` and
      `verify-post`

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
      `--plugin-dir <skills_dir>` when it is set. Use it in `claudeWorker` (`src/execute.ts`,
      the spawn at `:965`), `runClaude` (`src/triage.ts:145`) and `runUsage`
      (`src/budget.ts:235`). #143's seat probe and #153's steps use it too
- [ ] 2.2 Tests: the worker's and triage's arguments carry `--plugin-dir <skills_dir>` when it
      is set, and no `--plugin-dir` when it is not; no call's arguments include `--bare`

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
- [ ] 3.2 Report each skill and the commit its files come from (`git -C <resolved dir>
      rev-parse HEAD`), one startup line per skill:

      ```
      skill igor:<name>: <12-hex commit> (<resolved dir>)
      ```
- [ ] 3.3 Tests: each refusal above with its message; a passing check starts; the check's
      environment holds no `CLAUDE_CODE_OAUTH_TOKEN` and no `ANTHROPIC_API_KEY` even when the
      process has them, and its `HOME` is not the service user's

## 4. The worker's system prompt

- [ ] 4.1 When `skills_dir` is set, append this paragraph to the worker's system prompt. It may
      be reworded, but it must name the directory and tell the worker to use it in place of
      both home-directory paths:

      ```
      Your skills are installed under <skills_dir>/skills. Where a skill's instructions name a path under ~/.claude/skills or ~/.agents/skills, use the same path under <skills_dir>/skills instead. The copies in the home directory are not the ones you are meant to run.
      ```
- [ ] 4.2 Test: the system prompt carries the paragraph with the configured directory, and
      none of it when `skills_dir` is absent
- [ ] 4.3 When the pinned shared-skills commit includes the change that makes a skill find its
      scripts from the directory it was loaded from: if that is before 4.1 is built, skip 4.1
      and 4.2 and remove *The worker is told where its skills are* from the spec delta;
      otherwise, file an issue to remove the paragraph and the requirement when the pin moves
      past it, and tick this task with its number

## 5. Docs

- [ ] 5.1 `docs/deployment.md`, a section on skills:
      - clone shared-skills to `/opt/igor/shared-skills` and check out a commit, owned by root;
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
