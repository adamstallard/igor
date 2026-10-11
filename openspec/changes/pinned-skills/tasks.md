## 0. Before building

- [ ] 0.1 With `ANTHROPIC_API_KEY`, run `claude -p --bare --add-dir <dir>` against a skill
      installed by the manager (a symlink into a clone) and ask the model to use it. Record in
      `design.md` whether the skill runs, and which directory Claude Code reports to the model:
      the link under `<dir>/.claude/skills/` or the clone it resolves to. If it is the clone,
      #153's grants and the system-prompt paragraph (5.1) name the clone's path instead
- [ ] 0.2 Confirm the shared-skills commit to pin carries bug-hunter's caller-commits mode
      (`caller-result.sh`) and prose's `start`, `check`, `sign`, `verify-staged` and
      `verify-post`

## 1. Configuration

- [ ] 1.1 `skills_dir` in `src/config.ts`: add it to `CONFIG_KEYS`, parse it as an optional
      string, and refuse a relative path at load with this message (may be reworded):

      ```
      skills_dir must be an absolute path, outside every directory Igor writes to: <value>
      ```
- [ ] 1.2 `igor.config.example.yaml`: a commented `skills_dir: /opt/igor/skills`, saying what it
      holds and pointing at `docs/deployment.md`
- [ ] 1.3 A step that needs a skill refuses to start without `skills_dir`, naming the key. #153's
      steps use this, so it is a check they call, not one this change wires into a step

## 2. The flag on every call

- [ ] 2.1 One function that builds the arguments every `claude -p` shares, including
      `--add-dir <skills_dir>` when it is set. Use it in `claudeWorker` (`src/execute.ts`,
      the spawn at `:965`), `runClaude` (`src/triage.ts:145`) and `runUsage`
      (`src/budget.ts:235`). #143's seat probe and #153's steps use it too
- [ ] 2.2 Tests: the worker's and triage's arguments carry `--add-dir <skills_dir>` when it is
      set, and no skills `--add-dir` when it is not

## 3. Startup checks

All three run in `wire` (`src/wiring.ts`), before the first model call, and only when
`skills_dir` is set.

- [ ] 3.1 Refuse to start when `skills_dir`, `<skills_dir>/.claude/skills` or any skill's
      resolved directory is writable by the current user (`access(W_OK)`). Message (may be
      reworded):

      ```
      <path> is writable by <user>, so a worker could rewrite the skills Igor runs. Make it, and the shared-skills clone its skills link to, owned by another user. See docs/deployment.md.
      ```
- [ ] 3.2 Refuse to start when a skill installed under `skills_dir` is also in
      `$HOME/.claude/skills/`. Message (may be reworded):

      ```
      skill <name> is also installed in <home>/.claude/skills, and that copy runs instead of the pinned one in <skills_dir>. Remove it.
      ```
- [ ] 3.3 Run `claude -p --bare --add-dir <skills_dir> --output-format stream-json --verbose`
      with a prompt of one word, stdin closed, and an environment of `PATH` and `HOME` only.
      Read the `system/init` event's `skills`, then stop the process. Refuse to start when an
      installed skill is missing, or when no init event arrives. Messages (may be reworded):

      ```
      skill <name> is installed in <skills_dir>/.claude/skills, but claude -p --bare --add-dir <skills_dir> does not load it
      ```

      ```
      claude -p --bare --add-dir <skills_dir> printed no system/init event, so Igor cannot confirm its skills load
      ```
- [ ] 3.4 Report each skill and the commit its files come from (`git -C <resolved dir>
      rev-parse HEAD`), as one startup line per skill:

      ```
      skill <name>: <12-hex commit> (<resolved dir>)
      ```
- [ ] 3.5 Tests: each refusal above with its message; a passing check starts; the check's
      environment holds no `CLAUDE_CODE_OAUTH_TOKEN` and no `ANTHROPIC_API_KEY` even when the
      process has them

## 4. Per item

- [ ] 4.1 Before a worker spawns, if the working tree holds `.claude/skills/<name>` for a skill
      installed under `skills_dir`, stop the item and spawn no worker. Reason (may be reworded):

      ```
      the repository ships its own .claude/skills/<name>, which would run instead of the pinned <name> skill
      ```
- [ ] 4.2 Tests: a same-named repository skill stops the item with no worker spawned; a
      repository skill with another name does not

## 5. The worker's system prompt

- [ ] 5.1 When `skills_dir` is set, append this paragraph to the worker's system prompt. It may
      be reworded, but it must name the directory and tell the worker to use it in place of
      both home-directory paths:

      ```
      Your skills are installed under <skills_dir>/.claude/skills. Where a skill's instructions name a path under ~/.claude/skills or ~/.agents/skills, use the same path under <skills_dir>/.claude/skills instead. The copies in the home directory are not the ones you are meant to run.
      ```
- [ ] 5.2 Test: the system prompt carries the paragraph with the configured directory, and
      carries none of it when `skills_dir` is absent

## 6. Docs

- [ ] 6.1 `docs/deployment.md`, a section on skills:
      - clone shared-skills to `/opt/igor/shared-skills` and check out a commit, owned by root;
      - install with
        `SHARED_SKILLS_TARGET=/opt/igor/skills/.claude/skills python3 /opt/igor/shared-skills/.agents/skills/manage-skills/scripts/skills.py install --no-hook prose bug-hunter`,
        as root;
      - set `skills_dir: /opt/igor/skills`;
      - update by checking out a new commit on purpose, then restarting. Never the manager's
        `update`, which pulls;
      - keep the skills out of the service user's `~/.claude/skills`
- [ ] 6.2 `docs/architecture.md`: a short subsection under §6 on where skills come from, the
      read-only rule, and the precedence measurement, pointing at this change's `design.md`
