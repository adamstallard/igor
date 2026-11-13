## Context

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides that Igor loads its skills
from one pinned directory named on every `claude -p`. The issue named the directory with
`--add-dir`. The measurements below found that `--add-dir` loads the skills but does not keep
them pinned, so this change uses `--plugin-dir`.
A bare "decision <n>" is one of the numbered decisions under *Decisions*, below.

**Igor never passes `--bare`.** Under `--bare` the setup-token of a seat, a Claude subscription
Igor's calls are billed to, can authenticate only as an API key, so it does not run as a seat: no
`rate_limit_event` arrives (measured, below). Every call runs in normal mode, where the worker
invokes `igor:<name>` skills itself through the Skill tool.

## Measured with a model, 2026-10-11

Run by the coordinating agent: Claude Code 2.1.296, model haiku, the `claude-adam-personal`
setup-token, run from a fresh `/tmp` directory.

### Task 0.1: a plugin skill runs

A scratch plugin `igor` held one skill `canary` that replies `PLUGIN-CANARY-OK` and its base
directory. The results:

1. **Without `--bare`:** the token authenticates through `CLAUDE_CODE_OAUTH_TOKEN`;
   `igor:canary` loads; the model calls the Skill tool with `igor:canary`, and the skill runs.
   The base directory it receives is the plugin's own skill directory (`<plugin>/skills/canary`).
2. **Under `--bare` with `CLAUDE_CODE_OAUTH_TOKEN`:** authentication fails ("OAuth session
   expired and could not be refreshed", `apiKeySource: none`). `claude --help` confirms: under
   `--bare`, "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth
   and keychain are never read)".
3. **Under `--bare` with the same setup-token supplied by `apiKeyHelper` in a `--settings`
   file:** it authenticates (`apiKeySource: apiKeyHelper`), and the model runs.
4. **Under `--bare`, the model has no Skill tool.** The default tool set is Bash, Edit and Read
   only. `igor:canary` appears in the init event's skills list, but the model can't invoke it,
   and it went searching the disk instead. `--tools "Read,Skill"` yields only `Read`: Skill
   cannot be added back.
5. **Under `--bare`, a prompt of `/igor:canary` runs the skill** (the slash form), and it
   receives the plugin's base directory.

### `--bare` does not run as a seat

`--tools ""`, prompt "Reply with OK.":

- **Normal mode,** token in `CLAUDE_CODE_OAUTH_TOKEN`: `apiKeySource: none`. A
  `rate_limit_event` arrives with status `allowed` and keys `isUsingOverage,
  overageDisabledReason, overageStatus, rateLimitType, resetsAt, status, unifiedWindows`.
- **`--bare`,** same token through `apiKeyHelper`: `apiKeySource: apiKeyHelper`. It succeeds,
  but **no `rate_limit_event` at all.** Under `--bare` the token is taken as an API key and does
  not run as a subscription seat the way normal mode does. There is no seat reading, which
  #143's reserve line depends on, and what it is billed against is unknown.

So the worker uses its skills through the Skill tool, in normal mode (result 1), and no step has
to open with a slash command. #144's risk stands: if `--bare` becomes the default for
`claude -p`, Igor must opt out explicitly.

## Measured without a credential, 2026-10-11

Claude Code 2.1.296 on macOS. Every call ran under `env -i PATH=… HOME=…`, so no credential was
present. The `system/init` event arrives before authentication, so loading could be measured
without one. Each call then ended `is_error: true`, `Not logged in · Please run /login`,
`total_cost_usd: 0`, exit 1. Skills were installed by the shared-skills manager
(`skills.py install --no-hook prose bug-hunter`, with `SHARED_SKILLS_TARGET` set) from a clone
checked out at `6d0ae49`, as absolute symlinks into the clone.

### `--plugin-dir`, the mechanism this change uses

The plugin directory held `.claude-plugin/plugin.json` (`{"name": "igor", …}`) and the
manager's links under `skills/`.

| invocation | relevant skills in `system/init` |
|---|---|
| `--bare --plugin-dir <dir>` | `igor:prose`, `igor:bug-hunter`. No home skills. |
| `--plugin-dir <dir>`, no `--bare`, with a `prose` in `HOME`'s `.claude/skills` and a repository skill in the working directory | `prose` and the repository's skill, beside `igor:prose` and `igor:bug-hunter` |

- **A plugin skill's name carries the plugin's name**, so a same-named skill elsewhere loads
  under a different name. The `system/init` list showed both names. No two skills then share
  a name, so a step that asks for `igor:prose` cannot be given the other copy; that follows
  from the names, and the skill listing sent to the model was not read.
- **The plugin loads under `--bare`** and appears in the event's `plugins` list.

### What holds whichever flag is used

- **`--bare` drops the home skills.** `prose` and `bug-hunter`, installed in Adam's
  `~/.claude/skills`, were missing under `--bare`.
- **A skill's scripts resolve their shared library through the manager's link.** `prose.py`
  takes its directory from `Path(__file__).resolve()`, and bug-hunter's `caller-result.sh` from
  `cd -P "$(dirname "$0")"`. Run through the links, both worked: `caller-result.sh` printed a
  full result block.
- **The manager installs without hooks.** It has `install --no-hook`. And with
  `SHARED_SKILLS_TARGET` set but `SHARED_SKILLS_HOOK_HOME` unset, it wires no hooks anyway
  (`auto_enable_hooks`).
- **The skills' own instructions pointed at the home directory at `6d0ae49`.** Prose's
  `SKILL.md` defined its scripts directory as `~/.agents/skills/prose/scripts` or
  `~/.claude/skills/prose/scripts`, and bug-hunter's named the same two places. On an Igor
  server those paths are missing or hold an unpinned copy. Shared-skills #19 (merged as
  `075a73a`) makes every skill find its scripts from its base directory, so the pinned commit
  must be at or after `075a73a`.

### Rejected: `--add-dir`

The issue's choice. Measured with a directory whose `.claude/skills/` held the skills:

| invocation | skills in `system/init` |
|---|---|
| `--bare --add-dir <dir>` | the skills from `<dir>`, including through a symlink, plus the built-in ones |
| `--bare` alone | the built-in skills only |
| `--add-dir <dir>`, no `--bare` | the home skills, the skills from `<dir>`, and the built-in ones |

It loads the skills, but it fails the issue's purpose, a pinned copy, in two ways:

1. **Without `--bare`, a skill of the same name elsewhere replaces the pinned one.** Measured
   by reading the skill listing the session sends:
   - with a same-named skill in a temporary `HOME`'s `.claude/skills/`, the home copy's
     description was sent;
   - with one in the working directory's `.claude/skills/`, the repository's copy was sent, even
     when the repository was itself passed with `--add-dir` ahead of the pinned directory.

   The `system/init` list showed the name once either way, so a check could not see it. Guards
   would have had to refuse a home copy at start and stop an item whose repository ships one.
2. **It gives the worker edit access to the skills.** Under the worker's `acceptEdits`, a write
   under an added directory succeeds; the worker already writes its outbox that way
   (`WorkerInput.outbox`, `src/execute.ts`). A worker steered by an item's text could rewrite
   `prose.py`, the script Igor's own code runs to verify that worker's signature. Igor would have
   had to refuse to start wherever it could write the directory.

Under `--add-dir`, commands and agents in the directory also loaded without `--bare` and not
with it, so behaviour would change if `--bare` became the default for `claude -p` (#144).

## Measured before building, 2026-10-18 (task 0.3)

Claude Code 2.1.303: the native macOS binary, and `@anthropic-ai/claude-code@2.1.303` from npm in
a `node:22-bookworm` container. Model haiku unless noted. The seat token was the
`claude-adam-personal` setup-token, passed only as `CLAUDE_CODE_OAUTH_TOKEN` under `env -i`, with
the prompt on stdin. On macOS a logging stand-in for `security` came first on `PATH`, so the
real Keychain item was never read or written. A local server set as `ANTHROPIC_BASE_URL` logged
which credential each request carried. The raw streams are not in the repository; what they
showed is below. The version the server runs is not known; these results are for 2.1.303.

Each line says what was measured and what it showed.

- **A linked skill is given its path under the plugin directory.** With `prose` and
  `bug-hunter` installed by the manager as absolute links into a shared-skills clone at
  `44d1f67` (a descendant of `075a73a`), the session transcript read `Base directory for this
  skill: <skills_dir>/skills/prose`, not the link's target in the clone. A `canary` skill
  linked into a second clone gave the same. **Confirms decisions 1 and 11:** the path the model is
  given is the one under `<skills_dir>/skills` that #153's code uses.
- **`--plugin-dir` grants no write access.** A worker started with the worker's flags
  (`--permission-mode acceptEdits --add-dir <tree>`, plus this change's) was told to write four
  files under `skills_dir` with Write, Edit and Bash `touch`. All four were refused, and the
  directory was unchanged. **Confirms decisions 1 and 11.** It grants no Read access either: the
  Read tool was refused on `<skills_dir>/skills/prose/SKILL.md`. *How it composes* notes what that
  means for #153.
- **`--setting-sources user` and `--strict-mcp-config` keep the repository out.** The
  repository held a `.claude/settings.json` with hooks and an `env` canary, a `.mcp.json`
  server, a skill under `.claude/skills/`, a `CLAUDE.md`, and also `CLAUDE.local.md`, a nested
  `sub/CLAUDE.md`, `.claude/settings.local.json` with a hook, a command and an agent. The user
  settings in `HOME` held `{"enableAllProjectMcpServers": true}`, so only `--strict-mcp-config`
  could keep `.mcp.json` out. Without the flags every one of them loaded or ran. With both
  flags, with or without `--add-dir <tree>`, none did: no hook marker, an empty MCP list, no
  repository skill, command or agent, and no `CLAUDE.md` text in the transcript. **Confirms
  decision 8**, and covers the local and nested files too.
- **An empty `HOME` does not keep out skills above the working directory.** Run from a
  directory under `/Users/adam`, a call with an empty `HOME` and no `--setting-sources user`
  listed Adam's own skills: Claude Code walks up from the working directory and loads an
  ancestor's `.claude/skills` as project skills. `--setting-sources user` keeps them out. So in
  the startup check it is that flag, not the empty `HOME` alone, that keeps such skills out of
  the list the check reads.
- **The startup check's call prints `system/init` with the two flags.** Run exactly as task 3.1
  says, the first line was `system/init`, with `igor:bug-hunter`, `igor:canary` and `igor:prose`
  in `skills` and the `igor` plugin in `plugins`. A `rate_limit_event` and a successful `result`
  followed. **Confirms that it does.** With no `--model`, the call ran on `claude-sonnet-5-5` and
  cost $0.0256; on haiku the same prompt costs about $0.0005 to $0.0015. **Adam pinned the check
  to haiku (2026-10-18, decision 18).**
- **`apiKeySource` reads `none` in every call**, including every call that authenticated with
  the token and got a `rate_limit_event`. **Contradicts task 0.3's expectation** that it would
  name `CLAUDE_CODE_OAUTH_TOKEN`. `apiKeySource` cannot show which credential a call used; the
  `rate_limit_event`, which only a call running as a seat receives, is the reliable sign. No
  requirement reads `apiKeySource`, and no decision changes.
- **A seat's token is the only credential a call uses.** **Confirms decision 17**, in the three
  cases task 0.3 names:
  1. A login, a hook, an MCP server and a skill were planted in a home, which was then reset
     to the template (`.claude/settings.json` of `{}`, `.claude.json` of
     `{"hasCompletedOnboarding": true}`). A call in that home, given only the token, got a
     `rate_limit_event` and a successful result, on macOS and as a
     service user in the Linux container. The planted hook did not run, `~/.gitconfig`
     survived, and Claude Code wrote no `.credentials.json` into the home. The same home with no
     token failed with `Not logged in`, at no cost.
  2. A valid token beside another account's stored login, in `~/.claude/.credentials.json` on
     Linux or in the Keychain on macOS, spent the token's seat: the `rate_limit_event` described
     that seat, every request carried the token, and the stored login was left unchanged.
     Claude Code still queried the Keychain, and wrote nothing back.
  3. An invalid token beside a stored login failed with `401 OAuth access token is invalid`, at
     no cost, and every request carried only the invalid token. Under `igor run` on macOS, a
     developer's Keychain login is therefore not spent while a token is set, valid or not. Claude
     Code reaches the Keychain only through `security`, so the stand-in saw every Keychain
     request a real Keychain would have.

  **The controls show why every call must carry a token.** With no token, Claude Code used the
  stored login, and rewrote it: on macOS it wrote the Keychain item, and on Linux it rewrote
  `~/.claude/.credentials.json` after a failed refresh. On a person's Mac, a call with no token
  would refresh and rewrite the person's own login.
- **The onboarding key is `hasCompletedOnboarding: true`**, read from the binary, which sets it
  with `lastOnboardingVersion`. A template `~/.claude.json` of only that key ran, and so did a
  home with no `~/.claude.json` at all: `-p` does not need the key. Claude Code then adds its own
  keys to the file. **Confirms the key's name.** The template carries it, as decided (task
  2.4), though `-p` runs without it.
- **`git rev-parse HEAD` fails as the service user on a root-owned clone.** In a Debian bookworm
  container with git 2.39.5, the shared-skills clone at `/opt/igor/shared-skills` owned by root,
  `sudo -u svc git -C <resolved skill dir> rev-parse HEAD` exited 128 with `fatal: detected
  dubious ownership in repository at '/opt/igor/shared-skills'`. With `-c safe.directory=…` on
  the command line it printed the commit. **Contradicts the case task 3.2 assumed:** as
  specified, every start on a deployment that follows task 5.1 would report each skill's commit
  as not checked. Task 3.2 now passes `-c safe.directory=<clone root>` for that one command, so
  the operator adds nothing to the service user's `~/.gitconfig`. No decision changes.
- **The usage read prints no window percentages under a token.** With a setup-token in
  `CLAUDE_CODE_OAUTH_TOKEN`, `/usage` printed only the session's local cost summary, with no
  `Current session … % used` or `Current week … % used` line, so `parseUsage` in
  `src/budget.ts` on `main` would throw `no usage figures in output`. Every call carries a
  token under decision 17, so the usage read, as `main` has it, reads no window. That is #143's to settle: under #143's decision 37, the first change built after #171 (`seat-files`), which gives every seat a token, removes the read. Until then decision 10 applies to
  it, and it carries no `--plugin-dir`.

**Not measured:** the real Keychain item, a real second account's stored login, and the Claude
Code version the server runs. Nor is what `claude -p` does with a plugin directory that does not
exist, so Igor never passes one (decision 20).

## Measured on 2026-10-31: the skill list survives a call with no tools

The question was whether the startup check can deny every tool, as #143's probe does, and still
read its skills. Claude Code 2.1.316 on macOS, on Adam's normal login, ran one call from an
empty directory, against a throwaway plugin named `igor` that holds one trivial skill, `canary`:

```
claude -p --tools "" --plugin-dir <plugin> --model haiku --output-format stream-json --verbose "Reply with OK."
```

- **The `system/init` event listed `igor:canary` in its `skills`,** and the plugin in its
  `plugins`. Its `tools` held no built-in tool, only the MCP tools of Adam's own configuration.
  The check also passes `--strict-mcp-config`, which loads no MCP server the command line does
  not name, so it has none; this call did not pass that flag.
- **The model call itself was refused,** with a `rate_limit_event` whose status was `rejected`,
  since Adam's login had reached its weekly limit. The init event comes before the model call,
  so the refusal does not affect the result. The call is the case the spec already covers: one
  that fails after printing the event, which Igor still judges on its list.

So denying tools does not hide the skill list, and the check denies them (decision 42).

## Decisions

1. **Skills load with `--plugin-dir <skills_dir>`**. *Rejected:* `--add-dir`,
   which issue #152 chose: a same-named skill in the home directory or the worked repository
   replaced the pinned one, and it gave the worker write access to the skills.
2. **Igor never passes `--bare`**. Under `--bare` a seat's setup-token runs as
   an API key and emits no `rate_limit_event`. #143's budget gate reads how full a seat is from
   that event, so such a call is not read as a seat, and what it is billed against is unknown.
3. **The plugin is named `igor`**, so skills load as `igor:prose` and
   `igor:bug-hunter`.
4. **The pinned shared-skills commit is at or after `075a73a`**, where every
   skill finds its scripts from its base directory. *Rejected:* a line in the worker's system
   prompt telling it where the pinned skills' scripts are.
5. **The startup check is an ordinary call that spends a seat, separate from the startup self-test
   #144 proposes to run once per seat**. It runs once per start. Under `igor serve`, where a seat
   is due a probe at start, it is that seat's first probe (decision 28). Otherwise it spends the
   seat the budget gate chooses for it, as the rest of this decision says.  The gate still chooses
   the seat of every call but two: #143's seat probe and the usage read, each of which spends the
   seat it is reading about. Where the gate names no seat at start and no seat may be probed (a
   probe spends its seat without the gate, decision 28), Igor starts, runs its cycles without a
   model call, and runs the check before its first one; if that check fails, the running process
   exits with status 78 then. *Rejected:* a call with no token, which printed the skill list and
   then failed to authenticate, at no cost. It needed an exception from #171's *A spend with no
   seat behind it is not made*, and a call with no token uses and rewrites a stored login where it
   finds one (measured 2026-10-18, `design.md`).
6. **No guard against a same-named skill, and no startup check of the service user's hooks,
   `CLAUDE.md` or home skills**. A same-named skill in the home loads under
   its own name beside `igor:<name>`; one in the worked repository does not load at all
   (decision 8, measured 2026-10-18). `docs/deployment.md` tells the operator to keep the service
   user and the worker user (#175) free of hooks, a `CLAUDE.md` and home skills (task 5.3).
7. **One plugin directory for every role.** *Rejected:* a plugin directory per role, which is one
   directory per distinct `skills` list among the roles (#153), each to install, pin and check.
8. **Every call excludes the worked repository's own settings, with `--setting-sources user` and
   `--strict-mcp-config`**. The settings are the repository's
   `.claude/settings.json` (permission allows and hooks), `.mcp.json`, skills and `CLAUDE.md`.
   The worker can edit that repository, and the `role-config` spec keeps the commands a worker
   may run out of it because "a worker that can edit files can edit a settings file in the
   repository it is working". Measured on 2026-10-18: the two flags keep all four out, with or
   without `--add-dir <tree>`, and the repository's local settings, `CLAUDE.local.md`, nested
   `CLAUDE.md` files, commands and agents too.
9. **The worker runs in a home that lasts, and before each model step Igor resets its `~/.claude`
   and `~/.claude.json` from a built-in template** (before each step rather
   than each `claude -p` since 2026-10-21, decision 31). With a worker user (#175),
   the home is that user's own. With none, each `igor run` has a home of its own under Igor's
   state directory, removed when the run ends (decision 23), and Igor sets `HOME` to it; that is
   #175's same-user mode, `igor run`, where the worker runs as the user Igor runs as. The template ships with Igor
   and is nearly empty (task 2.4). The reset keeps nothing of what it replaces, a stored login
   included (decision 17). Nothing else in the home is reset, so `~/.gitconfig` (with #175's
   `safe.directory`) and the files a repository's tests cache there stay. Without the reset, a
   worker steered by an item's text could plant hooks, a `CLAUDE.md` or skills for every later
   call. A file a run leaves elsewhere in the home, such as `~/.npmrc`, can steer later runs in
   that home. That is accepted: with a worker user, each role has its own home (#175), so
   such a file reaches no other role, and in same-user mode it reaches only the later tasks
   of the same run.
   *Rejected:* a fresh, empty home for every task, which loses `~/.gitconfig` and the caches a
   repository's tests need; and resetting `~/.claude` alone, which leaves `~/.claude.json` for a
   worker to write.
10. **The usage read passes no `--plugin-dir`**. It runs no skill. `igor serve` runs it in the
    budget gate, and `igor budget` runs it too, often on a person's machine, where `skills_dir`
    names a server path. #143's decision 37 removes the usage read, `runUsage` with it, in the
    first change built after #171's code lands, which #175's task 1.10 carries. This decision
    applies only where this change is built before that removal; after it, the decision has no call
    to cover (Open Questions).
11. **Two facts the flag rests on were measured before anything is built** (task 0.3): a skill the
    manager installed as a link is given its path under the plugin directory, not the clone's, and
    `--plugin-dir` gives the worker no write access to the skills. Both held on 2026-10-18, so
    decision 1 stands.
12. **`skills_dir` is not configured in lore: Igor uses `/opt/igor/skills`, and `IGOR_SKILLS_DIR`
    in the server's environment overrides it**. `/opt/igor/skills` is where the
    deployment guide installs the plugin. Neither `igor.config.yaml` nor any other lore file has a
    `skills_dir` key, so a file that names one is refused by the strict unknown-key check, with
    the error any unknown key gets, not one about `skills_dir`. *Rejected:* a key in
    `igor.config.yaml`, which any pull request to the lore repository could point at another
    directory.
13. **With a worker user, Igor kills every process that user owns before every reset**, not only at
    the end of a task. Adam left killing them by user or by the user's systemd slice to the
    implementer (2026-10-17); #175 has since measured that on Debian a process `sudo` starts is not
    in that slice, so there only killing by user kills them all; the spec still allows either,
    and whether to drop the slice is in Open Questions. A process that left its process group with
    `setsid()` outlives a kill of the group, and could otherwise rewrite the home after a reset,
    including in the gap between the worker and the model steps of #153 that follow it (decision
    14). Under `igor serve`, #175's kill by user also runs before a tree's release, so no process
    that left its group outlives its task (decision 24). #175 measured on 2026-10-18 that Claude
    Code starts each Bash command in a new session, so every command a worker runs has left the
    group: a kill of the group did not end `npm test`, and a kill of every process the worker user
    owns did. Same-user mode has no such guard: killing every process of the user Igor runs as
    would kill Igor itself and, under `igor run`, the person's own processes. It is a limit of
    same-user mode, which runs only on a developer's machine.
14. **#153's later model steps, the prose pass and the bug hunt, run in the worker's home, with the
    same reset before each step** (per step, decision 31). Prose's first call, which prints the
    rules and issues the one-use pass token that prose's signing call later checks, is Igor's own
    and runs as the service user, so nothing of prose's is written in the worker's home and the
    reset has nothing of it to keep.
15. **The in-force scenario *No state carries between tasks* is reworded**.
    Nothing a worker writes reaches a later task, except three kinds of file, which the scenario
    names: what decision 9's reset leaves in the home, what the user the worker runs as writes
    outside the home, and, in same-user mode, what a process that left the worker's process
    group writes in the home after a reset. `specs/task-execution/spec.md` is a MODIFIED delta.
16. **Same-user mode is `igor run` alone**. #175 has no `igor serve --same-user`, so no served
    process uses a same-user home. Nor does same-user mode run under the systemd unit
    (`deploy/igor.service`), which runs `igor serve` with a worker user. An `igor run` may run
    beside a served process of its role, and a served process never uses a run's home, so the two
    share no home.
17. **The reset keeps no stored login, because Igor never uses one**. Every
    seat has a Claude token, and every call that spends a seat authenticates with that seat's
    token, from its environment, under `igor serve` and `igor run` alike. Under `igor run` the
    seat is an implicit local seat that needs no seat file, and its token is the one in
    `IGOR_RUN_TOKEN`. #171 states both rules, in *A spend with no seat behind
    it is not made* and *`igor run` spends its own token as an implicit local seat*; this change
    applies them to the worker's home. The reset replaces `~/.claude` whole,
    `~/.claude/.credentials.json` with it. Under `igor run`, Igor neither hides nor refuses a
    login the developer keeps where setting `HOME` does not move it, such as the macOS
    Keychain; if Claude Code
    ever prefers it to the token, `run` spends the developer's own login, and that is accepted
. Measured on 2026-10-18 (Claude Code 2.1.303): a valid token wins over a
    stored login in the home or the Keychain, and an invalid token fails rather than falling
    back to one. *Rejected:* keeping `~/.claude/.credentials.json`, so that an organization with
    no seats could run on a stored login. That leaves open where a worker user's login would
    come from, and lets a worker rewrite a login that later calls might use. An organization
    with no seats instead adds one seat, from a token of its own (#171).
18. **The startup check runs on haiku, with `--model haiku`**. With no
    `--model` it ran on sonnet, at $0.026 a start against about $0.001 on haiku (measured
    2026-10-18). The check reads only the skill list, which does not depend on the model.
19. **Six smaller choices, made by the agents that wrote this change and accepted by Adam on
    2026-10-19:** a relative `IGOR_SKILLS_DIR` refuses the start; the skills Igor expects are every
    entry under `<skills_dir>/skills/`, not a list of its own; a skill whose commit cannot be read
    is reported as not checked, and the start goes on; Igor reports each skill's commit but does
    not refuse one older than decision 4's `075a73a`; Igor trusts a skill's clone for that read only when root owns it, and turns git's file-system monitor off for that read (trusting a clone turns off git's guard against configuration another user controls, and the monitor setting could name a program for git to run); and the start is refused when `skills_dir` holds anything besides
    `.claude-plugin/plugin.json` and `skills/`, so the plugin cannot add a hook, an MCP server, a
    command or an agent to every call.

20. **Where `skills_dir` does not exist, `igor serve` refuses to start, and `igor run` uses the
    skills the person installed** (the half for `igor run` answers question 10 of #153's *For Adam*
    list). `igor serve` refuses, naming the path, and exits with status 78. `/opt/igor/skills` is
    only the server's path. A person's machine has skills of its own: the shared-skills manager
    (`manage-skills`) installs them in the person's home, as one entry per skill under
    `~/.claude/skills`, each a link into the person's shared-skills clone. A run's `HOME` is the
    run's own home (decision 23), so Claude Code would not find them there. So `igor run` passes
    them explicitly, to every call that carries `--plugin-dir`:
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
      whose `skills` list is empty. Which skills a dry run loads is open (*Open Questions*).

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
21. **Citations ahead of the archive order are accepted**. This change cites #171's *A spend with
    no seat behind it is not made*, #82's *A process that refuses to start exits with status 78*,
    and #153's `skills` list, prose pass and bug hunt, and issue
    [#204](https://github.com/adamstallard/igor/issues/204) archives all three after this one.
    Decision 29 also cites #217's *Credential redaction replaces every credential the Igor knows*,
    but #204 archives #217 before this change, so that citation is not ahead and needs no
    acceptance. Until the three archive, the in-force text cites rules not yet in force; every
    cited change archives later in #204's order, so each citation comes into force when that change
    archives. On 2026-10-31 Adam extended this permission to a fourth change, #216 (`lore-search`),
    which #204 also archives after this change and which decision 32 cites.
22. **In same-user mode the reset may follow a link**. The worker can make
    `~/.claude` or `~/.claude.json` a link to a file the person owns, and a reset run as the
    person may then remove or overwrite that file. `igor run` has no sandbox, and this is one of
    its limits. *Rejected:* a reset that never follows a link, which the authoring agents
    recommended.
23. **Each `igor run` has a home of its own, removed when the run ends**. The
    home is named by the run's id, such as `<state directory>/home/<role>-<run>`, under Igor's
    state directory, so two `igor run`s of one role at once share no home and neither's reset
    replaces `~/.claude` under the other's call. Each run picks its own id (decision 35). Within one
    run the home lasts across its tasks.
    *Rejected:* one home per role, which two runs of the role at once would share; and a lock
    that makes the second run refuse.
24. **A process that escaped its group is killed by #175's kill, not by one of this change's**
. Under `igor serve`, #175's decision 27 kills every process the worker
    user owns whenever it kills a worker, once the last model step exits, after the repository's
    checks that #189 (`loop-verifies-commands`) runs as the worker user, and before a tree's
    release. So no process that left its group outlives its task, and this change adds no kill
    when a task ends.
25. **In same-user mode the worker can write the template and `skills_dir`**.
    There the worker runs as the user that owns Igor's installation and the skills a developer
    installed, and #175's start check, which confirms the worker user cannot write either, does
    not run. That is a limit of `igor run`, a developer at their own terminal.
26. **Igor copies the worker's session log into its state directory when the worker exits, and
    the execution record points at the copy**. The log lies under
    `~/.claude/projects/`, which the next reset deletes, and `projects/` cannot be kept out of
    the reset, since Claude Code's memory for a project lives there and would load into later
    calls. Decision 29 redacts the copy.
27. **Task 5.1 installs `spec-trace` with `prose` and `bug-hunter`**. #190
    (`review-evidence`) adds to each pull request a table of what the loop checked, and fills its
    *Spec scenarios* row by running
    `<skills_dir>/skills/spec-trace/scripts/spec_trace.py`, and without it that row would read
    `not checked` on every pull request.
28. **Under `igor serve`, the startup check's call is a seat's first probe**.
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
    runs before every other model call. So under the rule of 2026-10-18, which sent every check through the gate, nothing could start: the gate needed a reading, a reading needed a probe, and the probe, a model call, waited for the check.

    Where no seat is due a probe when Igor starts, because each has an unexpired reading, the
    check spends the seat the gate chooses, as decision 5 has it. Under `igor run`, which makes
    no probe (#171), it spends the run's implicit local seat, the one seat `igor run` makes from
    the token in `IGOR_RUN_TOKEN`, through the gate.
29. **Igor redacts the session log's copy as it copies it**, with `redact`,
    the function #217 (`redact-state-branch`) builds for its *Credential redaction replaces
    every credential the Igor knows*. A worker that runs `env` writes its seat's token into the
    log, and #171 forbids Igor writing a token to any file. *Rejected:* keeping no copy, which
    loses the record decision 26 keeps; and keeping the copy unredacted.
30. **#171's code is built before this change's**, although #204's archive
    order puts this change first. The seat-budget code this change's code meets is then #171's,
    under which every model call spends a seat's token. An organization with no seats then
    makes no model call until it adds one, and never runs on the login stored on the host, which
    today's in-force `seat-budget` allows.
31. **The reset runs before each model step, not between a step's own calls**. A model step can
    make two calls: under #153's decision 40, the step that writes a post writes its reader goals
    in a first turn, and Igor then resumes that session with `claude -p --resume`. A reset between
    the two would delete the session log the resume reads. The kill of decision 13 runs before each
    reset, so it too runs per step. This per-step reset of the run's home, with the session log's
    copy of decision 26, is chosen over giving each run a Claude Code configuration directory of
    its own (`CLAUDE_CONFIG_DIR`), which #216 had proposed. #216 is to cite this change for the
    reset.
32. **`lore-search` (#216) owns the definition of Igor's state directory**: `$STATE_DIRECTORY`,
    else `$XDG_STATE_HOME/igor`. This change cites #216's `graceful-handoff` requirement *A handoff
    states what was done, what remains, and who could continue*, which is the requirement where the
    specs define the state directory, and names no path itself. Issue #204's archive order places
    #216 after this change, so until #216 archives, this change's spec cites a requirement not yet
    in force. Decision 21's permission to cite ahead covers it, as Adam extended it on 2026-10-31.
33. **Every step's session log is copied before the next reset** (#216's decision 98): the
    worker's, those of #153's later model steps, and that of the further worker run #189 starts on
    the same item, each redacted with #217's `redact` as decision 29 has it. #216 keeps every
    step's log of a flagged execution, and an execution is known to be flagged only once it ends,
    so every step's log is copied. Decision 26 copied the worker's alone.
34. **The execution record may name a log copy that #216 could not move** (#216's decision 102).
    The record names each copy where Igor wrote it. #216 moves a flagged execution's copies into
    `flagged-questions`, and a copy whose move it refused stays at the path the record names. The
    record is on the state branch, the git branch in the lore repository where Igor keeps its
    records, not in the state directory on Igor's host, where the copies are written, so #216's
    move of a copy on the host does not rewrite it.
35. **A run removes the home and plugin directory a crashed run left**.
    This concerns `igor run` alone: a worker user's home lasts across runs, and
    `/opt/igor/skills` is never removed. Each `igor run` picks a run id and, while it runs, holds
    an exclusive lock on its own file, `<role>-<run id>.lock`, in Igor's state directory. The
    system releases the lock when the run's process ends, so a run whose lock another run can
    take is gone. At its start, before its first cycle, an `igor run` removes the home, the
    per-run plugin directory decision 20 assembles and the startup check's two directories
    (decision 44) of each earlier run of its role whose lock it can take, and nothing of a run
    whose lock it cannot take. `igor run --plan` removes nothing. The spec states the rule in
    *An igor run removes what a crashed run of its role left*, and task 2.3 builds it. A run's
    trees are not in it: the in-force sweep, *The abandoned-tree threshold derives from the
    worker's longest possible life*, removes a tree once it is older than any run could last.
    *Rejected:* removing a home or plugin directory by age, as trees are, since one run can work
    several items in a row and so outlast that threshold while its home is in use.

36. **Where no seat may be probed at start, the startup check spends the seat the gate
    chooses**. A seat due a probe may be held off by #143's hourly limit, for
    up to an hour, or by #143's back-off on that seat after a probe that received no
    `rate_limit_event`, which lasts up to five hours. Where some seat
    may be probed, the check is that seat's probe. Where none may, the check makes its call on
    the seat the budget gate chooses, the same as where no seat is due a probe at all, rather
    than wait for a held-off seat. Where the gate has no seat to spend either, as with a single
    seat that keeps a reserve, is held off and holds no reading, the check waits, as the spec's
    scenario *No seat to spend, no check yet*
    says.

37. **Where `skills_dir` does not exist, `igor run` links only the skills the role lists and
    those Igor's own code runs**. Its plugin directory holds a link for each
    of the person's installed skills that the role's `skills` list (#153) names, or that is one
    on the list of skills whose scripts Igor's own code runs, whatever the role. Igor's code holds
    that list, which today names only spec-trace, whose checker #190 runs, and a change that runs
    another skill's script for every role adds that skill to it. It links none of the rest, so a skill that acts
    with the person's own credentials, such as one that posts to chat, loads into a worker only
    where the role asks for it. For that run the assembled directory is `skills_dir`, and every
    rule naming `skills_dir` applies to it unchanged: none requires a skill to be at a particular
    commit (decision 4's pin is on the server's clone; no rule naming `skills_dir` states one), so an unpinned
    directory needs no exception from any of them.
38. **An unflagged execution's session log copies last until the item's next execution ends**
. A session log copy is the copy of a model step's Claude Code session log that
    decision 33 makes before the worker's home is reset. An
    execution is flagged, in the sense this decision uses, where #216 puts a flagged hold on its
    item, and its copies go only when
    #216's `work-triage` deletes that execution's files, on any release of the hold: the command `igor release`, or an edit to the item by someone with write access.
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
    unflagged execution's, which this matches.
39. **The `igor run` check's two directories go under Igor's state directory**, as #216 defines it.
    The system's temporary directory is one other users of the host can write, and #143 keeps its
    probe's directories out of it too.

40. **A flagged execution's hold is in place before the execution counts as ended** (settled by
    the TLA+ model in `model/`). Decision 38 spares an execution that left a flagged hold, so
    Igor must see the hold at the moment another execution's end looks for it. If an execution
    could count as ended before #216 had put its hold, an end in between would delete the
    copies of an execution that is about to be flagged. The model finds exactly that once this
    rule is off (`model/negative/NoHoldAtEnd.cfg`), and with it on, finds no deletion of a
    flagged execution's copies.
41. **A startup check whose probe #143 refuses fails the start** (one good option, cheap to
    reverse). Where the startup check is a seat's first probe and #143 refuses to start it,
    because one of the probe's two directories, its working directory and its `HOME`, fails #143's check (its owner, its
    write bits, or a `.claude` or `CLAUDE.md` in it) or cannot be created, the check fails: Igor
    refuses to start, naming the directory and what is wrong with it, and exits with status 78.
    A refused probe is refused again until a person fixes the directory, so waiting for the next
    probe only delays the error, by up to five hours, #143's back-off. On a deployment with one
    seat, no other seat can make the first model call in the meantime.
42. **The startup check denies every tool, as #143's probe does** (settled by measurement,
    `design.md`, *Measured on 2026-10-31*). A `claude -p` call with `--tools ""` still lists the
    plugin's skills in its `system/init` event, so the check loses nothing by denying tools.
    That call ran on a login rather than a seat token, and without `--setting-sources user` and
    `--strict-mcp-config`; task 0.4 runs the check's exact command on a seat token. If the list then does not arrive, Igor refuses to start, as for any missing skill, and this decision is revisited. Since the list did arrive, the check stays #143's minimal probe, differing only in what the check needs: `--plugin-dir`;
    `--setting-sources user` and `--strict-mcp-config`, which keep the call to that plugin; and
    `--model haiku` (decision 18).

43. **Igor finds the copies to delete in its own state directory, never from the execution
    record, and deletes without following a link** (one good option, cheap to reverse). The
    execution record lives on the state branch, which anyone who can push to it can edit, so
    taking paths from it would let them choose which files Igor deletes. Under `igor run` a
    worker of the same user can write the state directory, so a planted link could redirect a
    delete; #216 already expects this deletion to refuse links (its decision 106).
44. **The `igor run` check's two directories are removed after the call** (one good option),
    and an `igor run` that finds them left by a crashed run removes them with that run's home
    and plugin directory, as #143 does for its probe directories.

The reasoning behind the decisions follows.

### `skills_dir` is `/opt/igor/skills`, overridden only by the server's environment

`skills_dir` is not a key in `igor.config.yaml` or in any other
lore file. Igor uses `/opt/igor/skills`, the path where the deployment guide installs the plugin,
and `IGOR_SKILLS_DIR` in the environment Igor starts with overrides it. The lore repository is
shared and changed by pull request, so a key there would let any merged pull request point every
Igor at another directory of skills, the same reason #175 keeps its worker user out of
`igor.config.yaml`. A lore file that names `skills_dir` is refused by the strict unknown-key
check, with no message of its own.

Two of the six smaller choices in decision 19, which the authoring agents made and Adam
accepted on 2026-10-19, govern `skills_dir`. `IGOR_SKILLS_DIR` must be absolute, so it never depends on the directory Igor starts in.
Which skills Igor expects is read from the directory itself: every entry under
`<skills_dir>/skills/`.

**Where `skills_dir` does not exist,** `igor serve` refuses to start,
naming the path, and exits with status 78.

**Where `skills_dir` does not exist, `igor run` uses the skills the person installed (answering
question 10 of #153's *For Adam* list; decision 20).** `/opt/igor/skills` is the server's path, but
a person's machine has skills too: the shared-skills manager installs each one in the person's home
as an entry of `~/.claude/skills`, a link into the person's shared-skills clone; a skill is an
entry, a link or a directory, whose top level holds a `SKILL.md`. The manager's own skill,
`manage-skills`, is a copied directory instead. A run's `HOME` is its own home (decision 23), so
Claude Code does not find them there, and Igor passes them explicitly:

1. Igor reads `~/.claude/skills` from the `HOME` it started with, the person's own, before it
   sets the worker's `HOME` to the run's home.
2. `--plugin-dir` takes a plugin directory, which `~/.claude/skills` is not: it has no
   `.claude-plugin/plugin.json` and no `skills/` level. So Igor assembles one for the run, in
   its state directory beside the run's home, at a path whose name holds the run's id, such as
   `<state directory>/plugin/<role>-<run>`, where the state directory is the one decision 32
   names. It holds `.claude-plugin/plugin.json`, as
   `{"name": "igor", "version": "0.0.0", "description": "the person's installed skills"}`, and
   under `skills/` one link to the entry's resolved path for each installed skill that the
   role's `skills` list names or that Igor's own code runs (decision 37). Today Igor's
   code runs only spec-trace. Where no installed skill is named by the list or run by Igor's
   code, no directory is built and the run loads no skills, as where `~/.claude/skills` holds
   none. Linking only the
   listed skills keeps a skill that acts with the person's own credentials, such as one that
   posts to chat, out of a worker whose role does not ask for it; on a server, by contrast,
   `/opt/igor/skills` holds only the pinned shared skills, which act with no one's credentials. Each link then points
   straight at a directory, never through a chain of links, as the manager's own links do.
3. For the run, that directory is `skills_dir`. Every call that carries `--plugin-dir` names it,
   each skill loads as `igor:<name>`, and the startup check runs against it, including its refusal of a
   directory holding anything but `.claude-plugin/plugin.json` and `skills/`. #153's check of a role's skill names reads it too.
4. The run removes the directory when it ends, with its home.

The startup check reports each skill's commit as it does on a server. The person's clone is
owned by the user Igor runs as, so Igor reads its commit without the `-c safe.directory` option
it passes for a root-owned clone (decision 19). A skill linked into the run's
plugin directory whose entry is in no clone, such as the copied `manage-skills` directory, has
its commit reported as not checked. As the run starts, before the startup
check, it prints a line saying it loaded the person's skills, naming `~/.claude/skills`.

Where `~/.claude/skills` is missing or holds no skill the role lists or Igor's own code runs,
the run loads none: no call
carries `--plugin-dir`, no startup check is made, and the run says so as it starts, naming
`skills_dir` and `~/.claude/skills`. #153 refuses a role that lists a skill not installed, in every command that runs a model
step, a dry run included, so such a run starts only for a role whose `skills` list is empty.

Two limits of `igor run` come with the fallback. The skills are not pinned: they are at the
commit the person's clone is at, which the manager's `update` moves by pulling the clone. And the worker, running as
the person, can write them (decision 25).

*Rejected:* loading no skills under `igor run`, as this decision first had, under which #153
refuses every role whose `skills` lists `prose`; copying the skills into the run's
`~/.claude/skills`, which the reset before every model step replaces, and where a skill loads as
`prose`, not the `igor:prose` #153's steps name; writing a `plugin.json` into the person's
install; and passing `--plugin-dir` to a directory that does not exist, which no measurement
covers.

The plugin is named `igor`, so skills load as `igor:prose` and
`igor:bug-hunter`. The deployment writes the one-line `plugin.json`; the startup check fails if
the name differs, because no `igor:<name>` would be listed.

### One plugin directory for every role

**The coordinating agent's choice (2026-10-11), which Adam let stand on 2026-10-19.** Every call
carries the one `--plugin-dir <skills_dir>`, so on a server every pinned skill loads for every
role. A role's `skills` list (#153) decides which skills its worker is directed to use and which
Igor verifies, not what loads. Under `igor run` without `skills_dir`, the run's own plugin
directory holds only the listed skills (decision 37), for the reason decision 37 gives: the person's skills may act with their credentials. The reasoning below is for the
server's one directory. A plugin directory per role would mean one directory per distinct
list to install, pin and check at start, and it would protect little: a loaded skill the role
does not list is neither directed nor run by Igor's code, which #153 does per listed skill. The
worker can still invoke such a skill through the Skill tool, but that only runs the pinned,
root-owned skill's own instructions, which no item can change, and Igor verifies nothing from it.

### What normal mode loads besides the plugin

Without `--bare`, a call also loads the hooks, `CLAUDE.md` and home skills (`~/.claude/skills`) of
the user it runs as, and, unless told not to, the worked repository's own `.claude` settings,
skills and `CLAUDE.md` (measured). Namespacing keeps every `igor:<name>` skill from being
replaced, but the rest reaches the model. On a dedicated Igor server the service user has no
hooks, `CLAUDE.md` or home skills, as long as the operator follows task 5.3's note. Two decisions
of 2026-10-17, below, keep the repository's files out of every call and reset the worker's
`~/.claude` and `~/.claude.json` before each model step in its home.

**Igor makes no startup check of the users' hooks, `CLAUDE.md` or
home skills.** `docs/deployment.md` tells the operator to keep the service user and the worker
user free of them, and why (task 5.3). Such a check is worth adding only if a shared server
becomes a supported setup.

**No call loads the worked repository's settings.** The worker
can edit the repository, so its `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md`
are text an item can steer, the same reason the `role-config` spec keeps a worker's allowed
commands in the role file. Every call passes `--setting-sources user`, which loads the user's
settings and not the project's or local ones, and `--strict-mcp-config`, which ignores every MCP
configuration not passed with `--mcp-config`. Measured on 2026-10-18, the two keep all four out,
and the repository's local and nested files as well.

### The worker's home, and its reset before every model step

**The worker runs in a home that lasts, and Igor resets that
home's `~/.claude` and `~/.claude.json` from a built-in template before each model step.** A model step is the worker,
or one of #153's later steps; Adam set the reset per step, not per `claude -p`, on 2026-10-21
(decision 31), since one step may make two calls.
`--setting-sources user` still loads the user's settings, skills and `CLAUDE.md` from
`~/.claude`, and the worker writes its home, so without a reset a worker steered by an item's text could
plant hooks, a `CLAUDE.md`, skills or an MCP server for every later call. Task 5.3's note to the
operator cannot stop that; the reset can.

Which home:

- **With a worker user (#175):** that user's own home, `/var/lib/igor-worker-<role>`.
- **Without one:** a home for each `igor run`, under Igor's state directory, the directory where
  Igor keeps its own files on the machine, named by the run's id, such as
  `<state directory>/home/<role>-<run>`, the state directory being the one #216 defines (decision
  32). Igor sets it as the worker's `HOME` and removes it when the run ends. Each run picks its own
  id (decision 35); since the home's name holds it, two runs of one role at once share no home.
  Only `igor run` runs with no worker user, #175's same-user mode, where the worker runs as the
  user Igor runs as. The worker then never loads the `~/.claude` of the user Igor runs as, whether
  that is the service user or a person running `igor run` on their own machine.

Under `igor run`, a run that crashes leaves behind its own home and the plugin directory it
assembled from the person's skills (decision 20). A worker user's home is meant to last, so this
concerns `igor run` alone. The next `igor run` of the same role removes the crashed run's home
and plugin directory at its start, before its first cycle (decision 35). Each `igor run` holds a
lock on its own file, `<role>-<run id>.lock`, in Igor's state directory, for as long as it runs.
The system releases the lock when the run's process ends, so a lock the new run can take belongs
to a run whose process is gone. Where the new run cannot take a run's lock, it removes none of
that run's home or plugin directory.

What the template holds. It ships with Igor, in its installation, which #175's start check
confirms the worker user cannot write:

- `settings.json` holding `{}`: no hooks and no MCP servers. Igor passes everything a call needs
  as flags, and the 2026-10-18 measurement ran on this file;
- no skills and no `CLAUDE.md`, since skills come from `--plugin-dir`;
- `~/.claude.json` holding `{"hasCompletedOnboarding": true}`: onboarding marked done, no MCP
  servers.

How the reset works:

- **When:** before every model step Igor starts in the worker's home, and never between the
  calls of one step. The steps are the worker and #153's later model steps (the prose pass and
  the bug hunt), which run in the same home. A step can make two calls. #153's step that writes
  a post first writes, in one call, the goals of the post's reader, which prose's first call
  needs. Igor then runs prose's first call itself, and resumes the step's session with
  `claude -p --resume` to write the post. The resume reads the session log the first call left,
  so a reset between the two would leave it nothing to resume. Prose's first call, which prints the rules and issues the token that prose's signing
  call later checks, is Igor's own and runs as the service user. It
  writes nothing in the worker's home, so the reset has nothing of prose's to keep.
- **Who:** with a worker user, Igor resets as that user, through #175's `sudo` spawn, since only
  that user can remove what a worker wrote. In same-user mode Igor resets as itself.
- **What it keeps: nothing it replaces**. Every seat has a token, and Igor
  never uses a stored Claude login, under `igor serve` or `igor run`, so the reset removes
  `~/.claude/.credentials.json` with the rest of `~/.claude`. A seat's token reaches `claude`
  through its environment, which the reset does not touch, and it is the only credential a call in
  the home uses (measured 2026-10-18, above). Under `igor serve` no user is logged in to Claude,
  so a stored login arises only if an operator puts one there, and a valid token wins over it.
  Under `igor run` the developer's own login may sit in the macOS Keychain, which setting `HOME`
  does not move; Igor neither hides nor refuses it, and on 2.1.303 a set token wins over it.
  Should a later version prefer the login, `run` spends it, on the developer's own machine and
  quota, which is accepted. A developer's login in `~/.claude/.credentials.json`
  of their own home, as on Linux, is out of the worker's reach because `HOME` is the run's home.
- **What it deletes that Igor reads:** the worker's session log, under `~/.claude/projects/`.
  `projects/` cannot be kept out of the reset, since Claude Code's memory for a project lives there
  too. So when each model step in the worker's home exits, Igor copies its log into its state
  directory, before the next reset (decision 33), and the execution record points at the copy. It
  redacts the copy as it writes it, with #217's `redact` (decision 29): a worker that runs `env`
  prints its seat's token into the log.
- **What persists:** everything else in the home: `~/.gitconfig`, where #175's start check sets
  `safe.directory` so the worker's git trusts a tree the service user owns, and the files a
  repository's tests cache in the home. A file a run leaves there, such as `~/.npmrc`, can steer
  later runs in that home. That is accepted; with a worker user, #175 gives each role its own,
  so such a file reaches no other role. In same-user mode the home is removed when the
  run ends, so such a file reaches only the later tasks of that run.

*Rejected:* a fresh, empty home for every task, which loses `~/.gitconfig` and the caches a
repository's tests need; resetting `~/.claude` alone, which leaves `~/.claude.json` for a worker
to write; and keeping `~/.claude/.credentials.json` so that an organization with no seats could
run on a stored login, which leaves open where a worker user's login comes from and lets a
worker rewrite a login that later calls might use.

**With a worker user, Igor kills every process that user owns before
every reset**, by user or by the user's systemd slice, whichever kills them all. Decision 13
records #175's measurement that a kill by slice misses a process `sudo` starts. A process that
leaves its process group survives a kill of the group, and running as the worker user it could
rewrite the home after a reset. #175 measured on 2026-10-18 that every command a worker runs
leaves its group, not a rare one: Claude Code starts each Bash command in a new session, and a
kill of the group did not end `npm test`, while a kill of every process the worker user owns did.
Killing before every reset, rather than at the end of the task, also covers the gap between the
worker and #153's later steps. Same-user mode has no such kill, since killing every process of the
user Igor runs as would kill Igor and, under `igor run`, the person's own processes. There an
escaped process can rewrite the home after any reset; that is a limit of same-user mode, which
runs only on a developer's machine. Under `igor serve`, #175's kill by user also runs before a
tree's release (#175's decision 27), so an escaped process does not outlive its task, and this
change adds no kill of its own when a task ends.

**`igor run` has no sandbox.** In same-user mode the worker runs as the user
that owns Igor's installation and the skills a developer installed, so it can write the template
and `skills_dir`, and #175's start check, which confirms a worker user cannot write the template
or `skills_dir`, does not run. The worker can also make `~/.claude` or `~/.claude.json` a link to
a file the person owns, and the reset, run as the person, may follow it and remove or overwrite
that file. All three, a writable template, a writable `skills_dir` and a reset that follows a
link, are accepted as limits of `igor run`, a developer at their own terminal.

**Same-user mode is `igor run` alone.** #175 has no `igor serve --same-user`, so no served process
uses a run's home. Nor does same-user mode run under the systemd unit (`deploy/igor.service`),
which runs `igor serve` with a worker user. A served process never uses a run's home, so a run
beside one shares no home with it, and two `igor run`s of one role at once each have their own.

### The startup check spends a seat

The startup check confirms that every pinned skill loads, by
reading the skill list from the `system/init` event of one call. Issue #152 suggests reading that
list from #144's startup self-test, which #144 proposes to run once per seat and which is not yet
specified. The check here runs once per start:
`claude -p --model haiku --plugin-dir <skills_dir>`, with the `--setting-sources user` every
call carries, from an empty directory, with an environment holding only `PATH`, the host's
network settings, a `HOME` that is another empty directory, and one seat's token. Where the
check is a seat's probe, both directories are #143's probe directories; under `igor run` they
are new directories under Igor's state directory (decision 39). Its prompt is one word, such
as `ok`, and goes on stdin, as #175 requires of every call's prompt. It is an ordinary call: it
spends that seat and is recorded like any other, and that it authenticates shows the seat's token
works. The empty `HOME` keeps the service user's home skills out of the list the check reads, and
`--setting-sources user` keeps out project skills above the working directory (measured
2026-10-18). The check is kept separate from #144's.

**Under `igor serve`, the check is a seat's first probe** (decision
28). A seat's `reserve` (#143) is the share of each usage window held back from Igors, and
#171's gate draws on a seat with a reserve only once #143's probe has read how full it is. A
probe is a model call, and the check runs before every other model call, so under the
rule Adam set on 2026-10-18, under which the check always went through the gate, the probe
waited for the check while the check waited for the gate. A deployment whose only seats hold a
reserve and have no reading would then never make a model call.

A seat is due a probe when no unexpired reading covers it, as #143's *A seat nothing has read
is probed on the Igor server with its own token* says. So where a seat is due a probe when Igor
starts, the check's call is that first probe: it spends
the seat it reads, needs no choice by the gate, and its `rate_limit_event` is the seat's first
reading. It runs from the working directory and the `HOME` that #143 creates under
`/var/lib/igor/probes` and checks for every probe. Both are empty, so the check still runs
with an empty `HOME`, as the paragraph above requires. Like #143's probe it denies every
tool, with `--tools ""`, which costs it nothing: the skill list still arrives (*Measured on
2026-10-31*, above; decision 42). It adds `--plugin-dir`; `--setting-sources user`
and `--strict-mcp-config`, which keep the call to that plugin; and `--model haiku` (decision 18). Where #143 refuses to start the probe because
one of its two directories fails #143's check or cannot be created, the check fails and Igor
exits 78, naming the directory and what is wrong with it. Without decision 41 it would wait for #143's next probe of that seat, which #143's
back-off can delay by up to five hours, and that probe would be refused again until a person
fixes the directory (decision 41). Where every seat already has an unexpired reading at start, no probe is due, and the
check spends the seat the gate chooses. `igor run` makes no probe (#171), so there the check
spends the run's implicit local seat, the one seat `igor run` makes from the token in
`IGOR_RUN_TOKEN`, through the gate, from two new directories under Igor's state directory
(decision 39). Where a seat is due a probe but #143's hourly limit or back-off holds
it off, the check does not wait for it: it spends the seat the gate chooses (decision
36).

**It runs on haiku**: the skill list does not depend on the model, and
haiku costs about a twentieth of the default model's price for the same call.

The check reads the event's `skills`, not its `tools`. The worker's tools come from the worker's
own flags, not the check's, so a `Skill` entry in the check's `tools` would say nothing about
the worker; and the Skill tool was missing only under `--bare` (2026-10-11), which no call
passes.

**It reports each skill's commit, as the service user.** The commit is read with `git -c
safe.directory=<clone root> -C <resolved dir> rev-parse HEAD`, where the clone root is the
nearest directory at or above the skill's resolved directory that holds `.git`. The clone is
root-owned (task 5.1), and without that option git refuses to read it as the service user
(measured 2026-10-18). The option applies to that one command, so the service user's
`~/.gitconfig` trusts nothing. Trusting a clone turns off git's guard against
running configuration another user controls, and a skill's entry can link to any clone. So Igor
trusts only a clone root owns, and passes `-c core.fsmonitor=false` so that even that clone's
configuration starts no command. A clone the service
user owns needs no trust; one any other user owns is reported as not checked, with no git
command run in it. Igor reports the commit and does not refuse one older than `075a73a`
(decision 19).

**It refuses a plugin directory that holds more than skills** (decision 19). Before
the call, Igor refuses to start when `<skills_dir>/skills/` is missing or empty, so a check with
nothing to check never passes, and when `skills_dir` holds anything but
`.claude-plugin/plugin.json` and `skills/`, or `plugin.json` holds a key besides `name`,
`version` and `description`. A plugin's hooks, MCP servers, commands and agents would load into
every call, triage included, as the service user with a seat's token in its environment.

*Rejected:* a call with no token. Measured with an empty `HOME` (*Measured without a
credential*, above), such a call prints `system/init` and then fails with `Not logged in`, at no
cost. But it needed its own exception from #171's *A spend with no seat behind it is not made*,
and where it finds a stored login, such as the macOS Keychain under `igor run`, a call with no
token spends that login without the gate seeing it, and rewrites it (measured 2026-10-18). With
the check made as a probe or through the gate, no exception is added. The gate still chooses
the seat of every call but two kinds, each of which spends the seat it reads: #143's seat probe,
which under `igor serve` can be the check, and a usage read.

### No guard against a same-named skill

Under `--add-dir` a repository's same-named skill replaced the pinned one, and an item whose
repository ships one would have had to stop. Under `--plugin-dir` no skill replaces the pinned
one. The repository's `prose` does not load at all (decision 8, measured 2026-10-18), and a home
copy loads as `prose`, beside `igor:prose`. The `system/init` list shows both names, `prose` and
`igor:prose`, so unlike under `--add-dir` there is no single name for one skill to take over. A
step that needs the pinned skill asks for `igor:prose`, and Igor's code runs the pinned skill's
scripts by path under `<skills_dir>/skills`, so a home copy's scripts never run.

### The pinned shared-skills commit is at or after `075a73a`

From shared-skills #19, merged as `075a73a` on 2026-10-11, every skill finds its scripts from
its base directory instead of a home-directory path. A plugin skill's base directory is its path
inside the plugin, `<skills_dir>/skills/<name>`, including when the manager installed it as a
link (measured 2026-10-11 and 2026-10-18). So at or after that commit a skill runs the pinned
scripts, under the path #153's code uses, and the worker needs no instruction about where its
skills are (task 4.1).

### Session log copies when executions overlap: the TLA+ model

Decision 38 deletes an item's earlier session log copies when one of its executions ends, and
#216 lets two executions of one item run at once. Whether one execution's end can delete a copy Igor
must keep depends on how the executions interleave, so `model/LogCopies.tla` checks it with TLC, the TLA+
model checker. CI runs it (`.github/workflows/tla-pinned-skills.yml`).

The model holds one item's executions, numbered in the order they start. Each runs on one host,
makes its copies while it runs, and then ends, flagged or not, or stops because its Igor process
stopped. #216 may release a flagged hold at any time, which deletes that execution's files. When
an execution ends, Igor deletes on its host the copies decision 38 names. The model checks four
invariants. Each proves one or two of the scenarios of *Igor deletes an item's earlier session
log copies when an execution of it ends*, and the model names those scenarios above each
invariant:

- `NoCopyDeletedWhileRunning`: no execution's copies are deleted while it runs (*A running
  execution's log copies stay*).
- `FlaggedCopiesWaitForRelease`: only #216's release deletes a flagged execution's copies (*Igor
  deletes no flagged execution's log copies*).
- `LatestCopiesKept`: Igor never deletes the copies of the latest execution to start on a host
  (*An unflagged execution's log copies last until the item's next execution ends*).
- `NoStaleCopies`: an unflagged execution that ended or stopped keeps no copies once a
  later-started execution on its host has ended after it (the same scenario, and *A crashed
  execution's log copies go when the next execution ends*).

Each rule decision 38 and decision 40 rely on is a constant, TRUE as specified. Each file in
`model/negative/` turns one off, and TLC must find the violation it names:

| Rule turned off | File | Violation |
| --- | --- | --- |
| an end deletes only executions that started before it | `NoStartedBefore.cfg` | `LatestCopiesKept` |
| an end deletes only executions that ended or stopped | `NoFinishedOnly.cfg` | `NoCopyDeletedWhileRunning` |
| a stopped process's execution counts as finished | `NoStoppedCounts.cfg` | `NoStaleCopies` |
| an end deletes no execution that left a flagged hold | `NoFlagCheck.cfg` | `FlaggedCopiesWaitForRelease` |
| a flagged hold is in place when its execution ends | `NoHoldAtEnd.cfg` | `FlaggedCopiesWaitForRelease` |

The last rule was not in the spec before the model. Decision 40 adds it.

Results with `tla2tools.jar` v1.7.4, on 4 workers of a 10-core Mac, 2026-10-31:

| Configuration | Executions | Hosts | Distinct states | Depth | Time |
| --- | --- | --- | --- | --- | --- |
| `LogCopies.cfg` | 4 | 2 | 1,249,323 | 17 | 4 s |
| `LogCopiesOneHost.cfg` | 5 | 1 | 2,763,390 | 21 | 9 s |

Both pass. Each negative file finds its violation within a second on one worker. The model
leaves out what each host's deletion cannot see: another host's copies, which a host never
deletes, and #216's move of a flagged execution's copies, which changes where they are, not
whether they exist.

## Open Questions

- **Whether `igor run` ever runs more than one worker at once.** Each run has one home
  (decision 23), so two workers of one run at once would share it, and each one's reset would
  replace `~/.claude` under the other's running step, deleting its session log. This change
  assumes a run works one item at a time; a change that lets `igor run` run several workers
  needs a home per worker.
- **The ambient login until #171 archives.** Until #171 archives, the in-force `seat-budget`
  lets a seat name no token and run on the login stored on the host, which decision 17 forbids;
  an organization with no seats runs its calls that way too. Under this change no call runs
  without a seat: the startup check spends a seat it probes or one the gate names (decision
  28), and every other call comes after it. This item records a gap in the archived specs, not an undecided question: #171's code is
  built first (decision 30), so the code never runs on the ambient login, and the item records
  only that the archived specs allow it until #171 archives.
- **For #153 to amend, reported** (the 2026-10-21 consistency reads): #153's `role-config` delta says a role's
  `skills` list does not decide what loads, and its scenario has `igor run` load every
  installed skill, where decision 37 has the list decide what `igor run` links. #190's
  `task-execution` delta states the same rule and needs the same change. Nothing here waits
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
  - Igor's startup check refusing a plugin directory whose `skills/` is empty (*Igor refuses a skills directory that is empty or holds more than skills*) is a choice no
    decision lists.
  - From the second read that day: nothing says which `HOME` triage gets under `igor
    run`; #175 restates this change's
    reset as one before every call, which deletes the session a resume reads (#175's to fix);
    issue #152's body still states the reset and the check as they were before decisions 28 and
    31; no rule says removing a run's home and plugin directory, or writing a log copy, follows no
    link; the commit Igor reports for a skill does not prove the files on disk are that commit's,
    since the clone may hold uncommitted edits; no scenario shows Igor reading the commit of a
    clone owned by the user Igor runs as, which it trusts without `safe.directory`.
- **Findings from the 2026-10-21 consistency reads, for this change's authors.** Each needs
  a change to this text that the authors can make without Adam; none is made yet:
  - A dry run is `igor run --plan`, so decision 20's fallback covers it. Whether `--plan`
    assembles a plugin directory is unsaid; decision 35 has `--plan` remove nothing, and
    assembling one would leave a directory behind it.
  - The kill before a reset (decision 13): the spec and task 2.6 allow a kill by user or by the
    user's systemd slice, whichever kills them all. On #175's measurement that on Debian a
    process `sudo` starts is not in that slice, only the kill by user meets the rule, so the
    slice could be dropped. That is for this change's authors to decide. The second
    consistency read of 2026-10-19 reported the same point.
  - The execution record names a log copy's host path, which #216 may move, and which puts a
    person's home path on a state branch that may be public.
  
  - #153 gives a role's `skills` list no say in what the worker is told to use, which this
    change's *Why* assumes; and decision 20 cites #153's question 10, now #153's decision 29.
  - The log copy omits #175's `lstat` and non-blocking open, so a FIFO hangs it.
  - Unmeasured facts with no task: a resumed call continues its session (#153's task 0.21);
    Claude Code keeps nothing under `HOME` outside the two reset paths; a step's session is one file.
  - *Skills come from one plugin directory the server names* refuses any lore file that names
    `skills_dir`, but today only the parsers of `igor.config.yaml`, role files and budget files
    refuse unknown keys. The term *model step* is defined two ways: in *Every model call names the
    plugin directory* as one `claude -p` with its resumes, and in this file's section *The worker's
    home, and its reset before every model step* as the worker or one of #153's later steps, which
    leaves out triage and the startup check. *Service user* is not defined. Task 0.3's version gap
    is the 2026-10-19 item below. Spec choices on the log copy, the check's pass and `plugin.json`'s
    keys are not among the decisions; and *Why* describes issue #152 as it was.
  - Still to fix: task 1.10 of #175 removes the usage read (`runUsage`), carrying out #143's
    decision 37, so this change's two citations for the removal, of #175 and of #143's decision
    37, are both right. Where #175 is built first, `runUsage` is gone before this change is
    built, so decision 10, the exception for that read in *Every model call names the
    plugin directory*, its scenario, task 2.2's mention of it and *Impact*'s `src/budget.ts
    (runUsage)` all describe code that no longer exists and should go.
  
  - The scenario on a session log replaced by a link passes on permissions alone; a link to a
    file the worker user can read would test the rule.
  - Nobody has measured that Claude Code keeps nothing under `HOME` outside the two reset
    paths; that needs a task.
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
- **Findings of the 2026-10-19 consistency read, for this change's authors.** Four rules are each
  stated in two or three changes, which will drift apart unless one states it and the others cite
  it: that `igor run` accepts a login the developer keeps outside `HOME` (here and #171); that the
  startup check is charged through the gate (here and #171); the kill before a reset (here and
  #175); and that a role's `skills` does not decide what loads (here, #153 and #190). Three
  refusals of the startup check have no scenario: an extra file in `.claude-plugin/`, a
  `plugin.json` key other than the `hooks` key a scenario already covers, and any refusal under
  `igor run`. A skill's `SKILL.md` can declare `allowed-tools`, which the check does not read; no
  pinned skill declares one today. Task 0.3 is ticked but did not run on the version the server
  runs, which is not known; the 2026-10-21 read reported this again, and it is still open. And
  decision 19 does not list the keys `plugin.json` may hold, `name`, `version` and `description`,
  though the spec fixes them, so a reviewer approving the decisions does not see that choice.
- **Findings of the 2026-10-19 consistency read of decisions 28 to 30.** Those decisions answer
  its three questions. Its other findings follow, for this change's authors to fix, except the
  first, a gap decision 21 accepts. #204's rule places a change that only cites another
  change's requirement after that change, which would put this change after #171 and #82;
  #204's list puts it before them. The kill before a reset by the user's systemd slice is the same
  point as the 2026-10-21 item on decision 13's kill, and is recorded there. Decision 6 rests on no
  skill replacing an `igor:<name>` skill, but the skill listing sent to the model was not read under
  `--plugin-dir`. Whether a skill's `SKILL.md` can declare hooks, which the layout check would not
  catch, is unmeasured. Two choices are in the spec but not among the decisions: a check whose call
  fails after its init event passes on that list, and the session log's copy refusing a link or a
  hard-linked file. In the spec, "model step" and "Igor's state directory" are defined after their
  first use.
- **How Igor on a host knows which executions' copies it holds, their start order, and whether each
  ended or its process stopped** (from the consistency read of 2026-11-01). The TLA+ model takes
  these as shared state and proves the rule, not a mechanism. Where several Igor processes share
  one state directory, such as two `igor run`s on one machine, one judges another's executions; the
  implementation must say what it reads for each, and decision 43 already rules out the execution
  record as the source of paths.
- **Reported to #216, from the consistency read of 2026-11-01:**
  - #216's proposal says the execution record names a flagged copy's moved path, but under
    decision 34 the record keeps the path where Igor wrote the copy.
  - A run gone before #216 recorded its hold has its files deleted by #216's own rule at the next
    cycle and its copies deleted by decision 38 at the item's next execution end: one should
    cite the other.


## How it composes

### With #153 (`signed-publishing`, branch `spec-signed-replies`)

- **#153 works per skill in a role's `skills` list.** A name in the list must be installed
  under `skills_dir`, or #153 refuses to start any command that runs a model step for the role,
  a dry run included; `igor role explain` checks no name. This change states no second refusal.
  Under `igor run`'s fallback, the installed skills are those of the directory the run
  assembled from the person's install.
- **`<skills>` in #153's design is `<skills_dir>/skills`.** Igor's code runs prose's calls from
  `<skills>/prose/scripts`, and for a role that lists `bug-hunter` it runs `git add` and the
  script that mints bug-hunter's commit trailer. The worker is granted none of these scripts,
  since the model only does the prose pass, the rewrite, and Igor's code runs every script
  (#153). A step that names a skill names `igor:prose` or
  `igor:bug-hunter`.
- **The model is given the path Igor's code uses.** A plugin skill is given
  `<skills_dir>/skills/<name>` as its base directory, including for a linked skill (measured
  2026-10-18).
- **The model cannot Read a skill's files.** `--plugin-dir` grants no Read access (measured
  2026-10-18), so a skill whose instructions tell the model to Read a file in its own directory
  meets a permission refusal unless #153 grants that path. #153 grants every model step Read on
  `<skills_dir>`, since bug-hunter's instructions Read files beside
  its `SKILL.md`. A skill's entry, on a server and under `igor run`'s fallback alike, is a link
  into a clone outside `<skills_dir>`; whether a Read grant on `<skills_dir>` reaches the files
  behind the link is #153's to measure.
- **Each step invokes its skills through the Skill tool**, as `igor:prose` or `igor:bug-hunter`,
  since no call passes `--bare`.
- **Hooks.** The install wires none, and the startup check refuses a plugin that could declare
  one, so prose's hook that blocks a
  session's first file write until prose's first call has run never runs in a worker.
- **Prose's first call is Igor's own**: Igor runs it as the service
  user and gives the rules and the pass token to the step in its prompt. Nothing of prose's
  lives in the worker's home, so the reset needs no exception for it.
- **The pinned commit must carry what #153 calls.** #153 needs prose's `sign` to take
  `--goals-file`, as `check` already does; shared-skills #27 added that option to `sign`, and
  merged on 2026-10-21. `prose start` still exists in shared-skills, but #153 no longer calls
  it, so the pinned commit need not carry the editing hook `prose start` opens in a session
  (task 0.2).

### With #144 (`--bare` as the default)

No call passes `--bare`, and nothing here changes how a seat authenticates. #144's risk stands:
if `--bare` becomes the default for `claude -p`, Igor must opt out explicitly, or every call
stops running as a seat.

### With #143 (`seat-from-stream`)

The seat probe is a `claude -p` and carries `--plugin-dir` like any other call. Under `igor
serve`, where a seat is due a probe, the startup check is the first probe Igor makes (decision 28), so the check's
reading is recorded as #143 records a probe's, and #143's limits on probes count it. #143's switch of
triage to `stream-json --verbose` changes the output flags, not this one. One argument builder
for every call keeps the probe's arguments and every other call's from drifting apart (task
2.1). That builder also gives the probe
`--setting-sources user`, without which a probe run from a directory under a home that holds a
`.claude` loads that home's skills as project skills (measured 2026-10-18).

`runUsage` in `src/budget.ts` reads a seat's `/usage`. `igor serve` runs it in the budget gate
(`src/wiring.ts`), and `igor budget` runs it too. #143 withdraws `igor observe` but keeps
this read. **It carries no `--plugin-dir`.** It runs no skill, so
the flag gives it nothing. And on a person's machine, where `igor budget` runs it, `skills_dir`
names a server path that does not exist there, and what `claude -p` does with a missing plugin
directory is unmeasured. It still passes `--setting-sources user` and `--strict-mcp-config`,
like every call. Under a token, `/usage` printed no window percentages (measured 2026-10-18,
above), and #143 removes this read, `runUsage` with it, in the first change built after #171's
code lands (#143's decision 37).
