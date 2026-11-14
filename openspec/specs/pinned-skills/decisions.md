# pinned-skills: constraints, rejected alternatives and rationale

## Constraints
- **Constraint: Igor makes no startup check of the service user's hooks, `CLAUDE.md` or home skills, and no guard against a same-named skill.**
  Because: on a dedicated server the operator keeps the service user free of all three, and a same-named home skill loads under its own name beside `igor:<name>`.
  Evidence: the skill names `system/init` listed under `--plugin-dir` with a same-named skill in `HOME` (Claude Code 2.1.296, 2026-10-11), recorded in the pinned-skills change's design.md, #174
  Holds while: Igor runs on a server dedicated to it, not one shared with other users of Claude Code, and no skill is found to replace `igor:<name>` in the skill listing sent to the model.
  Paths: src/wiring.ts, docs/deployment.md
- **Constraint: In same-user mode the worker is not isolated from the person Igor runs as: it can write the template and `skills_dir`, and it can read the person's stored Claude login by its absolute path.**
  Because: in same-user mode the worker runs as the person, so it can read and write whatever the person can, and setting `HOME` only stops Claude Code from using the person's files on its own.
  Evidence: same-user mode, in which no worker user exists and the worker runs as the user Igor runs as, #175
  Holds while: only `igor run`, a developer at their own terminal, uses same-user mode.
  Paths: src/execute.ts, src/wiring.ts
- **Constraint: What a task leaves in the worker's home outside `~/.claude` and `~/.claude.json`, such as `~/.npmrc`, stays for later tasks in that home.**
  Because: each worker user's home serves one role, so such a file reaches no other role, and a same-user run's home is removed when the run ends.
  Evidence: one worker user, with a home of its own, for each role, #175
  Holds while: each worker user serves one role; #242's one worker user per slot keeps it, and a change that shares a worker user between roles ends it.
  Paths: src/execute.ts

## Rejected
- **Rejected: A line in the worker's system prompt telling it where the pinned skills' scripts are.**
  Facing: skills whose instructions pointed their scripts at the home directory, where an Igor server holds no copy or an unpinned one.
  Lost because: from shared-skills commit `075a73a` each skill names its scripts from its own base directory, so such a line would state the same paths a second time and could disagree with a skill's own instructions, https://github.com/adamstallard/shared-skills/pull/19
  Instead: the pinned commit is at or after `075a73a`.
  Paths: src/execute.ts

## Rationale
- **Rationale: Every model call names the plugin directory.**
  `--add-dir`, which issue #152 first chose, loads the skills but does not keep them pinned.
  Without `--bare`, a same-named skill in `HOME`'s `.claude/skills/` or in the working directory's
  `.claude/skills/` replaced the pinned one in the skill listing sent to the model, while
  `system/init` showed the name once, so no check could see the swap. Under the worker's
  `acceptEdits`, a write under an added directory succeeds, so a worker steered by an item could
  rewrite `prose.py`, the script Igor runs to verify that worker's signature. Under `--plugin-dir`
  each skill loads as `igor:<name>`, a linked skill is given its path under the plugin directory,
  and a worker under `acceptEdits` was refused every write there. `--bare` is ruled out because
  under it a seat's setup-token authenticates only as an API key: the call succeeds with no
  `rate_limit_event`, from which the budget gate reads how full a seat is, and the model has no
  Skill tool.
  Evidence: measurements on Claude Code 2.1.296 (2026-10-11) and 2.1.303 (2026-10-18), recorded in the pinned-skills change's design.md, #174
- **Rationale: No call loads the worked repository's settings.**
  A worker can edit the repository it works in, so that repository's settings, MCP servers,
  skills and `CLAUDE.md` are text an item can steer. Without `--setting-sources user` and
  `--strict-mcp-config`, a repository's hooks, its `.mcp.json` server (with
  `enableAllProjectMcpServers` in the user's settings), its skills, commands, agents,
  `CLAUDE.md`, `CLAUDE.local.md`, nested `CLAUDE.md` files and local settings all loaded or ran;
  with both flags, with or without `--add-dir <tree>`, none did. An empty `HOME` does not keep out
  skills above the working directory, since Claude Code loads an ancestor's `.claude/skills` as
  project skills; `--setting-sources user` keeps them out.
  Evidence: measurements on Claude Code 2.1.303 (2026-10-18), recorded in the pinned-skills change's design.md, #174
- **Rationale: Every model step in the worker's home starts from Igor's template.**
  `--setting-sources user` still loads the user's settings, skills and `CLAUDE.md` from
  `~/.claude`, and the worker writes its home, so without a reset a worker steered by an item
  could plant hooks, skills or an MCP server for every later call. The reset keeps no stored
  login: in a home reset from the template a call given only a seat's token ran as that seat, a
  valid token won over another account's stored login, and a call with no token used the stored
  login and Claude Code itself rewrote it. A kept `~/.claude/.credentials.json` would therefore be
  a login that a call in the worker's home could spend and rewrite.
  The reset runs per model step, not per call, because #153's step that writes a post resumes its
  own session with `claude -p --resume`, which reads the session log under `~/.claude/projects/`
  that a reset deletes. A fresh home for every task is turned down because it loses
  `~/.gitconfig`, where #175's start check sets `safe.directory` so the worker's git trusts its
  tree. Resetting `~/.claude` alone is turned down because a worker can write an MCP
  server into `~/.claude.json`, which loads into later calls until that file is reset too.
  Evidence: measurements on Claude Code 2.1.303 (2026-10-18), recorded in the pinned-skills change's design.md, #174
  Evidence: the step that writes a post and resumes its session, #153
  Evidence: the start check that writes `safe.directory` to the worker user's `~/.gitconfig`, #175
- **Rationale: The worker's session log outlives the reset.**
  A worker that runs `env` prints its seat's token into its session log, and Igor writes no token
  to any file, so the copy is redacted rather than kept as written.
  Evidence: the rule that Igor writes no seat token to a file, #171
- **Rationale: Igor confirms its skills load before its first model call.**
  The check reads only the skill list, which does not depend on the model: with no `--model` the
  call ran on sonnet and cost $0.0256, against about $0.0005 to $0.0015 on haiku. With
  `--tools ""` the plugin's skills were still listed in `system/init`, so denying every tool
  loses nothing. The check carries a seat's token rather than none: a call with no token prints
  `system/init` at no cost, but where a stored login exists, as in the macOS Keychain under
  `igor run`, Claude Code used that login and rewrote it.
  Evidence: measurements on Claude Code 2.1.303 (2026-10-18) and 2.1.316 (2026-10-31), recorded in the pinned-skills change's design.md, #174
- **Rationale: Igor reports the commit each skill loads from.**
  As the service user, `git rev-parse HEAD` on a root-owned clone exited 128 with `detected
  dubious ownership`, and printed the commit with `-c safe.directory=<clone root>` on the command
  line, so without that option every start on a server would report each commit as not checked.
  Trusting a clone turns off git's guard against configuration another user controls, and a
  skill's entry can link to any clone, so Igor trusts only a clone root owns. The `core.fsmonitor`
  setting can name a program for git to run, so the read turns it off even in a trusted clone.
  Evidence: measurement in Debian bookworm with git 2.39.5 (2026-10-18), recorded in the pinned-skills change's design.md, #174
  Evidence: git's documentation of `safe.directory` and `core.fsmonitor`, https://git-scm.com/docs/git-config
- **Rationale: Skills come from one plugin directory the server names.**
  A key in `igor.config.yaml` is turned down: the lore repository is shared and changed by pull
  request, so any merged pull request could point every Igor at another directory of skills.
  Evidence: role-config's Purpose, which keeps roles and their configuration in the team's lore repository, [role-config](../role-config/spec.md)
- **Rationale: Without the server's directory, igor run loads the person's skills.**
  Copying the person's skills into the run's `~/.claude/skills` is turned down: the reset before
  every model step replaces that directory, and a skill there loads under its own name, such as
  `prose`, not as the `igor:prose` a step names.
  Evidence: the skill names `system/init` listed for a skill in `HOME` and one under `--plugin-dir` (Claude Code 2.1.296, 2026-10-11), recorded in the pinned-skills change's design.md, #174
- **Rationale: The worker's home is its user's, or its run's.**
  One home per role is turned down: two runs of the role at once would share it, and one run's
  reset would replace `~/.claude` under the other's running step, deleting that step's session log
  under `~/.claude/projects/`. A Claude Code configuration directory of its own for each run
  (`CLAUDE_CONFIG_DIR`) in one shared home is turned down: runs would still share everything in
  that home outside the configuration directory, such as `~/.gitconfig`, `~/.npmrc` and the
  caches tests write.
  Evidence: the session log's place under `~/.claude/projects/`, recorded in the pinned-skills change's design.md, #174
  Evidence: lore-search's decision 91, which chooses a home per run over a per-run `CLAUDE_CONFIG_DIR`, and its decision 87, which found that runs sharing one home could read each other's session logs, #216
- **Rationale: An igor run removes what a crashed run of its role left.**
  Removing a home or plugin directory by age, as abandoned trees are removed, is turned down: one
  run can work several items in a row, so it can outlast the trees' threshold while its home is in
  use.
  Evidence: task-execution's *The abandoned-tree threshold derives from the worker's longest possible life*, [task-execution](../task-execution/spec.md)
- **Rationale: The startup check spends a seat it may probe, or else the gate's.**
  Sending every check through the gate is turned down: the gate draws on a seat that keeps a
  reserve only once the seat has a reading, a reading comes from a probe, and the probe, a model
  call, would wait for the check, so a deployment whose only seats keep a reserve would never make
  a model call. Under `igor run` the check's two directories go under the state directory, not
  the system's temporary directory, which other users of the host can write.
  Evidence: the rule that a seat with no reading is drawn on only where its line is the whole window, so a seat that keeps a reserve needs a reading first, #143
  Evidence: the seat probe's directories, kept under the state directory rather than the temporary directory, in *A seat probe runs where only the Igor can write*, #143
- **Rationale: Igor refuses a skills directory that is empty or holds more than skills.**
  A plugin's hooks, MCP servers, commands and agents load into every call that names the plugin,
  triage included, as the service user with a seat's token in its environment, so a plugin
  directory holding more than skills could run code in every call.
  Evidence: Claude Code's plugins reference, https://code.claude.com/docs/en/plugins-reference
- **Rationale: Igor deletes an item's earlier session log copies when an execution of it ends.**
  Igor finds the copies by listing its state directory, not from the execution log, because the
  log lives on the state branch, which anyone who can push to it can edit, so paths taken from it
  would let them choose which files Igor deletes.
  Evidence: GitHub's access permissions, under which anyone with write access to a repository can push to its branches, https://docs.github.com/en/get-started/learning-about-github/access-permissions-on-github
- **Rationale: Under igor run, triage runs in an empty home of its own.**
  An empty directory needs nothing reset and leaves nothing behind: a call in a home with no
  `~/.claude.json` ran, authenticating with the seat's token in its environment.
  Evidence: measurements on Claude Code 2.1.303 (2026-10-18), recorded in the pinned-skills change's design.md, #174
