## Context

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides that Igor loads its skills
from one pinned directory named on every `claude -p`. The issue named `--add-dir`; this change
uses `--plugin-dir`, because `--add-dir` loads the skills but does not keep them pinned
(*`--add-dir`, measured*, below, and the decision record's Rationale for *Every model call names
the plugin directory*, in `openspec/specs/pinned-skills/decisions.md`). A bare "decision <n>" is
one of the numbered decisions under *Decisions*. The spec's *Purpose* defines *model step*, *state
directory*, *service user* and *same-user mode*.

A seat is a Claude subscription Igor's calls are billed to. **Igor never passes `--bare`.** Under
`--bare` a seat's setup-token authenticates only as an API key, so the call does not run as a seat
and gets no `rate_limit_event`. That event is where #143's budget gate reads how full a seat is.
Every call runs in normal mode, where the worker invokes
`igor:<name>` skills itself through the Skill tool.

## Measured with a model, 2026-10-11

Claude Code 2.1.296, model haiku, a seat's setup-token, from a fresh `/tmp` directory.

### Task 0.1: a plugin skill runs

A scratch plugin `igor` held one skill `canary` that replies `PLUGIN-CANARY-OK` and its base
directory.

1. **Without `--bare`:** the token authenticates through `CLAUDE_CODE_OAUTH_TOKEN`;
   `igor:canary` loads; the model calls the Skill tool with `igor:canary`, and the skill runs
   with the plugin's own skill directory (`<plugin>/skills/canary`) as its base directory.
2. **Under `--bare` with `CLAUDE_CODE_OAUTH_TOKEN`:** authentication fails ("OAuth session
   expired and could not be refreshed", `apiKeySource: none`). `claude --help` confirms: under
   `--bare`, "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth
   and keychain are never read)".
3. **Under `--bare` with the token supplied by `apiKeyHelper` in a `--settings` file:** it
   authenticates (`apiKeySource: apiKeyHelper`), and the model runs.
4. **Under `--bare` the model has no Skill tool.** The default tools are Bash, Edit and Read.
   `igor:canary` is in the init event's skills list, but the model cannot invoke it, and searched
   the disk instead. Passing `--tools "Read,Skill"` yields only `Read`.
5. **Under `--bare` a prompt of `/igor:canary` runs the skill**, with the plugin's base directory.

### `--bare` does not run as a seat

With no tools (`--tools ""`) and the prompt "Reply with OK.":

- **Normal mode,** token in `CLAUDE_CODE_OAUTH_TOKEN`: `apiKeySource: none`, and a
  `rate_limit_event` arrives with status `allowed` and keys `isUsingOverage,
  overageDisabledReason, overageStatus, rateLimitType, resetsAt, status, unifiedWindows`.
- **`--bare`,** token through `apiKeyHelper`: `apiKeySource: apiKeyHelper`. The call succeeds
  with **no `rate_limit_event` at all**: the token runs as an API key, not a seat. #143's budget
  gate gets no reading of how full the seat is, and what the call is billed against is unknown.

So the worker uses its skills through the Skill tool in normal mode (result 1), so no step needs a
slash command.

## Measured without a credential, 2026-10-11

Claude Code 2.1.296 on macOS. Every call ran under `env -i PATH=… HOME=…`, so no credential was
present. The `system/init` event arrives before authentication, so loading is measurable without
one; each call then ended `is_error: true`, `Not logged in · Please run /login`,
`total_cost_usd: 0`, exit 1. The shared-skills manager installed the skills
(`skills.py install --no-hook prose bug-hunter`, with `SHARED_SKILLS_TARGET` set) from a clone at
`6d0ae49`, as absolute symlinks into the clone.

### `--plugin-dir`, the mechanism this change uses

The plugin directory held `.claude-plugin/plugin.json` (`{"name": "igor", …}`) and the
manager's links under `skills/`.

| invocation | relevant skills in `system/init` |
|---|---|
| `--bare --plugin-dir <dir>` | `igor:prose`, `igor:bug-hunter`. No home skills. |
| `--plugin-dir <dir>`, no `--bare`, with a `prose` in `HOME`'s `.claude/skills` and a repository skill in the working directory | `prose` and the repository's skill, beside `igor:prose` and `igor:bug-hunter` |

- **A plugin skill's name carries the plugin's name**, so a same-named skill elsewhere loads
  under a different name, and `system/init` listed both. A step that asks for `igor:prose`
  therefore cannot be given the other copy. This is inferred from the names, not measured: the
  skill listing sent to the model was not read (task 0.6).
- **The plugin loads under `--bare`** and appears in the event's `plugins` list.

### What holds whichever flag is used

- **`--bare` drops the home skills**: `prose` and `bug-hunter`, installed in the measuring
  developer's `~/.claude/skills`, were missing.
- **A skill's scripts resolve their shared library through the manager's link.** `prose.py`
  takes its directory from `Path(__file__).resolve()`, and bug-hunter's `caller-result.sh` from
  `cd -P "$(dirname "$0")"`. Run through the links, both worked; `caller-result.sh` printed a
  full result block.
- **The manager installs without hooks**, with `install --no-hook`, and also whenever
  `SHARED_SKILLS_TARGET` is set and `SHARED_SKILLS_HOOK_HOME` unset (`auto_enable_hooks`).
- **At `6d0ae49` the skills' instructions pointed at the home directory.** Prose's `SKILL.md`
  put its scripts at `~/.agents/skills/prose/scripts` or `~/.claude/skills/prose/scripts`, and
  bug-hunter's named the same two places. On an Igor server those paths are missing or hold an
  unpinned copy, hence decision 4.

### `--add-dir`, measured

The issue's choice, which this change does not use. Measured with a directory whose
`.claude/skills/` held the skills:

| invocation | skills in `system/init` |
|---|---|
| `--bare --add-dir <dir>` | the skills from `<dir>`, including through a symlink, plus the built-in ones |
| `--bare` alone | the built-in skills only |
| `--add-dir <dir>`, no `--bare` | the home skills, the skills from `<dir>`, and the built-in ones |

It loads the skills but does not keep a pinned copy:

1. **Without `--bare`, a same-named skill elsewhere replaces the pinned one.** In the skill
   listing the session sends, a same-named skill in a temporary `HOME`'s `.claude/skills/` sent
   the home copy's description, and one in the working directory's `.claude/skills/` sent the
   repository's copy, even with the repository passed by `--add-dir` ahead of the pinned
   directory. `system/init` showed the name once either way, so no check could see the swap.
2. **It gives the worker edit access to the skills.** Under the worker's `acceptEdits` a write
   under an added directory succeeds, as the worker's outbox already relies on
   (`WorkerInput.outbox`, `src/execute.ts`). A worker steered by an item's text could rewrite
   `prose.py`, the script Igor's own code runs to verify that worker's signature.

Commands and agents in an added directory also loaded without `--bare` and not with it, so
behaviour would change if `--bare` became the default for `claude -p` (#144).

## Measured before building, 2026-10-18 (task 0.3)

Claude Code 2.1.303: the native macOS binary, and `@anthropic-ai/claude-code@2.1.303` from npm in
a `node:22-bookworm` container. Model haiku unless noted. A seat's setup-token was passed only as
`CLAUDE_CODE_OAUTH_TOKEN` under `env -i`,
with the prompt on stdin. On macOS a logging stand-in for `security` came first on `PATH`, so the
real Keychain item was never read or written. A local server set as `ANTHROPIC_BASE_URL` logged
which credential each request carried. The raw streams are not in the repository. The version
the server runs is not known; these results are for 2.1.303, and task 0.5 repeats them on the
server's version.

- **A linked skill is given its path under the plugin directory.** With `prose` and
  `bug-hunter` installed by the manager as absolute links into a shared-skills clone at
  `44d1f67` (a descendant of `075a73a`), the transcript read `Base directory for this skill:
  <skills_dir>/skills/prose`, not the link's target in the clone. A `canary` skill linked into a
  second clone gave the same. **Confirms decision 1.**
- **`--plugin-dir` grants no write access, and no Read access.** A worker started with the
  worker's flags (`--permission-mode acceptEdits --add-dir <tree>`, plus this change's) and told
  to write four files under `skills_dir` with Write, Edit and Bash `touch` was refused all four,
  and the directory was unchanged. **Confirms decision 1.** The Read tool was refused on
  `<skills_dir>/skills/prose/SKILL.md`; *How it composes* says what that means for #153.
- **`--setting-sources user` and `--strict-mcp-config` keep the repository out.** The
  repository held a `.claude/settings.json` with hooks and an `env` canary, a `.mcp.json`
  server, a skill under `.claude/skills/`, a `CLAUDE.md`, and also `CLAUDE.local.md`, a nested
  `sub/CLAUDE.md`, `.claude/settings.local.json` with a hook, a command and an agent. The user
  settings in `HOME` held `{"enableAllProjectMcpServers": true}`, so only `--strict-mcp-config`
  could keep `.mcp.json` out. Without the flags every one of them loaded or ran. With both, with
  or without `--add-dir <tree>`, none did: no hook marker, an empty MCP list, no repository
  skill, command or agent, and no `CLAUDE.md` text in the transcript. **Confirms decision 8**,
  local and nested files included.
- **An empty `HOME` does not keep out skills above the working directory.** Run from a
  directory under the developer's home, a call with an empty `HOME` and no `--setting-sources user`
  listed the developer's own skills: Claude Code walks up from the working directory and loads an
  ancestor's `.claude/skills` as project skills. `--setting-sources user` keeps them out. So in
  the startup check it is that flag, not the empty `HOME`, that keeps such skills out of the list.
- **The startup check's call prints `system/init` with `--setting-sources user` and
  `--strict-mcp-config`.** Run with those two flags but no `--model` or `--tools ""`, against
  the plugin directory above (so with the `canary` skill too), the first line was `system/init`,
  with `igor:bug-hunter`, `igor:canary` and `igor:prose` in `skills` and the `igor` plugin in
  `plugins`; a `rate_limit_event` and a successful `result` followed. Task 0.4 runs the check's
  exact command. With no `--model` the call ran on `claude-sonnet-5-5` and cost $0.0256; on haiku the
  same prompt costs about $0.0005 to $0.0015. So the check runs on haiku (decision 18).
- **`apiKeySource` reads `none` in every call**, including every call that authenticated with
  the token and got a `rate_limit_event`, against task 0.3's expectation that it would name
  `CLAUDE_CODE_OAUTH_TOKEN`. It cannot show which credential a call used; the
  `rate_limit_event`, which only a call running as a seat receives, is the reliable sign. No
  requirement reads `apiKeySource`.
- **A seat's token is the only credential a call uses.** **Confirms decision 17**, in task
  0.3's three cases:
  1. A home was planted with a login, a hook, an MCP server and a skill, then reset to the
     template (`.claude/settings.json` of `{}`, `.claude.json` of
     `{"hasCompletedOnboarding": true}`). A call there given only the token got a
     `rate_limit_event` and a successful result, on macOS and as a service user in the Linux
     container. The hook did not run, `~/.gitconfig` survived, and Claude Code wrote no
     `.credentials.json` into the home. With no token the same home failed with
     `Not logged in`, at no cost.
  2. A valid token beside another account's stored login, in `~/.claude/.credentials.json` on
     Linux or in the Keychain on macOS, spent the token's seat: the `rate_limit_event` described
     that seat, every request carried the token, and the stored login was left unchanged.
     Claude Code still queried the Keychain, and wrote nothing back.
  3. An invalid token beside a stored login failed with `401 OAuth access token is invalid`, at
     no cost, and every request carried only the invalid token. So under `igor run` on macOS a
     developer's Keychain login is not spent while a token is set, valid or not. Claude Code
     reaches the Keychain only through `security`, so the stand-in saw every Keychain request a
     real Keychain would have.

  **The runs with no token show why every call must carry one.** With no token, Claude Code used the
  stored login and rewrote it: the Keychain item on macOS, and `~/.claude/.credentials.json`
  after a failed refresh on Linux. On a person's Mac, a call with no token would refresh and
  rewrite the person's own login.
- **The onboarding key is `hasCompletedOnboarding: true`**, read from the binary, which sets it
  with `lastOnboardingVersion`. A template `~/.claude.json` of only that key ran, and so did a
  home with no `~/.claude.json`: `-p` does not need the key, and Claude Code adds its own keys to
  the file.
- **`git rev-parse HEAD` fails as the service user on a root-owned clone.** In a Debian bookworm
  container with git 2.39.5 and the shared-skills clone at `/opt/igor/shared-skills` owned by
  root, `sudo -u svc git -C <resolved skill dir> rev-parse HEAD` exited 128 with `fatal: detected
  dubious ownership in repository at '/opt/igor/shared-skills'`; with `-c safe.directory=…` on
  the command line it printed the commit. So git does not read a root-owned clone as the service
  user with no extra option, and task 3.2 passes `-c safe.directory=<clone root>` for that one
  command; the operator adds nothing to the service user's `~/.gitconfig`.
- **The usage read prints no window percentages under a token.** With a setup-token in
  `CLAUDE_CODE_OAUTH_TOKEN`, `/usage` printed only the session's local cost summary, with no
  `Current session … % used` or `Current week … % used` line, so `parseUsage` in
  `src/budget.ts` on `main` would throw `no usage figures in output`. Every call carries a token
  (decision 17), so that read would always throw. #143's decision 37 decides to remove it, #175's
  task 1.10 removes it, and #175 is built
  before this change, so this change's code meets no usage read.

**Not measured:** the real Keychain item, a real second account's stored login, the Claude Code
version the server runs, and what `claude -p` does with a plugin directory that does not exist,
so Igor never passes one (decision 20).

## Measured on 2026-10-31: the skill list survives a call with no tools

Can the startup check deny every tool, as #143's probe does, and still read its skills? Claude
Code 2.1.316 on macOS, on a developer's own login, ran one call from an empty directory, against a
throwaway plugin named `igor` holding one trivial skill, `canary`:

```
claude -p --tools "" --plugin-dir <plugin> --model haiku --output-format stream-json --verbose "Reply with OK."
```

- **The `system/init` event listed `igor:canary` in its `skills`,** and the plugin in its
  `plugins`. Its `tools` held no built-in tool, only the MCP tools of the developer's configuration;
  this call did not pass `--strict-mcp-config`, which the check passes and which leaves it no
  MCP server.
- **The model call itself was refused,** with a `rate_limit_event` of status `rejected`, since
  the login had reached its weekly limit. The init event comes before the model call, so the
  refusal does not affect the result. It is the case the spec already covers: a call that fails
  after printing the event, which Igor still judges on the event's skill list.

So denying tools does not hide the skill list, and the check denies them (decision 42).

## Decisions

1. **Skills load with `--plugin-dir <skills_dir>`.** Why, and why not `--add-dir`, is the
   decision record's Rationale for *Every model call names the plugin directory*
   (`openspec/specs/pinned-skills/decisions.md`). Both facts that choice rests on held when measured before building (task 0.3):
   a skill the manager installed as a link is given its path under the plugin directory, and
   `--plugin-dir` gives the worker no write access to the skills. *Rejected:* keeping `--add-dir`
   with guards, under which Igor would have had to refuse to start when a home copy of a pinned
   skill exists, stop every item whose repository ships a same-named skill, and refuse to start
   wherever it could write the skills directory.
2. **Igor never passes `--bare`.** The same Rationale entry gives the reason: under it a seat's
   setup-token runs as an API key, with no `rate_limit_event`.
3. **The plugin is named `igor`**, so skills load as `igor:prose` and `igor:bug-hunter`. The
   deployment writes the one-line `plugin.json`; the startup check fails if the name differs,
   because no `igor:<name>` would be listed.
4. **The pinned shared-skills commit is at or after `075a73a`**, where every skill finds its
   scripts from its base directory, **and after shared-skills #27's merge**, which gives prose's
   `sign` the `--goals-file` option #153 calls (task 0.2). A line in the worker's system prompt
   naming the scripts' paths is a Rejected entry in the decision record.
5. **The startup check is an ordinary call that spends a seat, separate from the startup
   self-test #144 proposes to run once per seat.** It runs once per start; decision 28 says which
   seat it spends. Why it carries a seat's token rather than none is the decision record's
   Rationale for *Igor confirms its skills load before its first model call*; a call with no
   token would also have needed an exception from #171's *A spend with no seat behind it is not
   made*.
6. **No guard against a same-named skill, and no startup check of the service user's hooks,
   `CLAUDE.md` or home skills.** This is a Constraint in the decision record (`openspec/specs/pinned-skills/decisions.md`), with the
   condition under which it holds. That no same-named skill replaces `igor:<name>` in the skill
   listing sent to the model is an assumption, inferred from the names, which task 0.6 measures.
   `docs/deployment.md` tells the operator to keep the service user and the worker user (#175)
   free of hooks, a `CLAUDE.md` and home skills, and why (task 5.3).
7. **One plugin directory for every role.** *Rejected:* a plugin directory per role, which is one
   directory per distinct `skills` list among the roles (#153), each to install, pin and check.
8. **Every call excludes the worked repository's own settings, with `--setting-sources user` and
   `--strict-mcp-config`.** The decision record's Rationale for *No call loads the worked
   repository's settings* gives the reason and the measurement. The `role-config` spec keeps the
   commands a worker may run out of the repository for the same reason: "a worker that can edit
   files can edit a settings file in the repository it is working". `--setting-sources user`
   loads the user's settings and not the project's or local ones; `--strict-mcp-config` ignores
   every MCP configuration not passed with `--mcp-config`.
9. **The worker runs in a home that lasts, and before each model step Igor resets its `~/.claude`
   and `~/.claude.json` from a built-in template.** When it runs is decision 31. With a worker user (#175) the home is that user's own; without one, each
   `igor run` has its own (decision 23). The template ships with Igor and is nearly empty
   (task 2.4). The reset keeps nothing of what it replaces, a stored login included
   (decision 17), and resets nothing else in the home. *The worker's home, and its reset before
   every model step* has the details; the decision record's Rationale for *Every model step in the
   worker's home starts from Igor's template* has the reasons with evidence.
10. Merged into *Measured before building*, whose last item says #175 removes the usage read.
11. Merged into decision 1.
12. **`skills_dir` is not configured in lore: Igor uses `/opt/igor/skills`, where the deployment
    guide installs the plugin, and `IGOR_SKILLS_DIR` in the server's environment overrides it.**
    No lore file has a `skills_dir` key. Once #171's code is built, which decision 30 puts first,
    the parsers that refuse unknown keys are those of `igor.config.yaml`, role files and seat files
    (#171 replaces budget files with seat files), so the spec has those three refuse `skills_dir`,
    with the error any unknown key gets. A `skills_dir` key in any other lore file has no effect: Igor
    never reads `skills_dir` from lore.
    Why not a key in `igor.config.yaml` is the decision record's Rationale for *Skills come from
    one plugin directory the server names*; #175 keeps its worker user out of that file for the
    same reason.
13. **With a worker user, Igor runs #175's kill before every reset.** #175's *A kill reaches the
    worker's whole process tree* ends every process the worker user owns, after a `sudo` check,
    and fails the run where that check is refused; #175's decision record gives why the kill is by
    user rather than by process group. This change states no kill of its own, only when #175's
    kill runs. Killing before every reset, not only at a
    task's end, also covers the gap between the worker and #153's later steps (decision 14).
    Same-user mode has no such kill, since killing every process of the user Igor runs as would
    kill Igor and, under `igor run`, the person's own processes. There a process the worker left
    running can rewrite the home after any reset, a limit of same-user mode, which runs only on a
    developer's machine. Decision 24 says why this change adds no kill at a task's end.
14. **#153's later model steps, the prose pass and the bug hunt, run in the worker's home, with the
    same reset before each step.** Prose's first call, which prints the rules and issues the
    one-use pass token that prose's signing call later checks, is Igor's own and runs as the
    service user. So nothing of prose's, that token included, is in the worker's home for the reset
    to delete, and the reset needs no exception for it.
15. **The in-force scenario *No state carries between tasks* is reworded.** Nothing a worker
    writes reaches a later task, except three kinds of file, which the scenario names: what
    decision 9's reset leaves in the home, what the user the worker runs as writes outside the
    home, and, in same-user mode, what a process the worker started that is still running writes
    in the home after a reset (decision 13). That these are the only three rests on an
    assumption task 0.7 measures: that Claude Code keeps nothing that a later call reads under
    `HOME` outside the two paths the reset replaces. `specs/task-execution/spec.md` is a MODIFIED delta.
16. **Same-user mode is `igor run` alone.** #175 (`worker-user`) has no `igor serve --same-user`:
    its *serve always has a worker user, and run never does*, and its systemd unit runs
    `igor serve` with a worker user. So no served process uses
    a run's home, and an `igor run` beside a served process of its role shares no home with it.
17. **The reset keeps no stored login, because Igor never uses one.** Every seat has a Claude
    token, and every call that spends a seat authenticates with that token, from its
    environment, under `igor serve` and `igor run` alike. Under `igor run` the seat is an implicit
    local seat that needs no seat file, and its token is `IGOR_RUN_TOKEN`. This applies #171's
    *A spend with no seat behind it is not made* and *`igor run` spends its own token as an
    implicit local seat* to the worker's home. The reset replaces `~/.claude` whole,
    `~/.claude/.credentials.json` with it. Under `igor run`, the reset leaves alone a login the
    developer keeps where setting `HOME` does not move it, such as the macOS Keychain. #171's
    *A spend with no seat behind it is not made* allows a call to run while that login exists.
    *Rejected:* keeping `~/.claude/.credentials.json`, so that an organization with no seats could
    run on a stored login; the decision record's Rationale for *Every model step in the worker's
    home starts from Igor's template* gives the measurement. It would also leave open where a
    worker user's login would come from. An organization with no seats instead adds one seat, from
    a token of its own (#171).
18. **The startup check runs on haiku, with `--model haiku`.** The decision record's Rationale for
    *Igor confirms its skills load before its first model call* gives the measured costs: $0.026 a
    start on sonnet against about $0.001 on haiku.
19. **Seven smaller choices:** a relative `IGOR_SKILLS_DIR` refuses the start; the skills Igor expects are every
    skill under `<skills_dir>/skills/` (an entry holding a `SKILL.md`, as the spec's *Purpose*
    defines it), not a list of its own; a skill whose commit cannot be read
    is reported as not checked, and the start goes on; Igor reports each skill's commit but does
    not refuse one older than decision 4's `075a73a`; Igor trusts a skill's clone for that read
    only when root owns it; Igor turns git's file-system monitor off for every commit read, whoever
    owns the clone, since under `igor run` a worker can write the person's clone; and the start
    is refused when `skills_dir` holds anything besides `.claude-plugin/plugin.json` and
    `skills/`. The decision record's Rationale entries for *Igor reports the commit each skill
    loads from* and *Igor refuses a skills directory that is empty or holds more than skills* give
    the reasons for the last three: trusting only a root-owned clone, turning the file-system
    monitor off, and refusing extra entries. `plugin.json` may hold only `name`, `version` and
    `description`, the keys that describe a plugin; every other key it can hold declares something
    that loads into calls, such as hooks or MCP servers. The commit Igor reports is the clone's
    `HEAD`; it does not prove the files on disk match it, since a clone can hold uncommitted
    edits. On a server the clone is root-owned and changed only by an operator, so Igor does not
    check for edits. A skill's `SKILL.md` can declare `allowed-tools`; the check does not read it,
    because the worker's tools come from the worker's own flags, not from a skill.
20. **Where `skills_dir` does not exist, `igor serve` refuses to start, naming the path, and exits
    with status 78; `igor run` uses the skills the person installed.** `/opt/igor/skills` is only
    the server's path.
    A person's machine has skills of its own, but a run's `HOME` is the run's own home
    (decision 23), so Claude Code would not find them. So `igor run` assembles a plugin directory
    from the person's `~/.claude/skills`, linking the skills decision 37 names, and uses it as
    `skills_dir` for that run; where no installed skill qualifies, the run loads no skills. The
    steps are under *`skills_dir` is `/opt/igor/skills`, overridden only by the server's
    environment*. The person's skills are not pinned, and the worker can write them, as it can
    `skills_dir` itself in same-user mode (decision 22); both are limits of `igor run`. So under
    `igor run` the spec-trace script #190 runs is one the worker could have changed, and its
    result is only as trustworthy as the worker.
    *Rejected:* refusing under `igor run` too, which would stop every development run on a
    machine without `/opt/igor/skills`; loading no skills under `igor run`, under which #153
    refuses every role whose `skills` lists `prose`; copying the skills into the run's
    `~/.claude/skills` (the decision record's Rationale for *Without the server's directory, igor
    run loads the person's skills*); writing a `plugin.json` into the
    person's install; and passing `--plugin-dir` to a directory that does not exist, whose
    handling by `claude -p` is unmeasured.
21. **Some citations come into force after this change archives.** This change cites #171's *A
    spend with no seat behind it is not made*, #82's *A process that refuses to start exits with
    status 78*, #153's `skills` list, prose pass and bug hunt, and #216's (`lore-search`) state
    directory (decision 32). Issue [#204](https://github.com/adamstallard/igor/issues/204)
    archives all four after this one and records that these citations are accepted, so each comes
    into force when its change archives. #204 archives #217 before this change, so decision 29's
    citation of #217 is in force by the time this change archives.
22. **In same-user mode the worker is not isolated from the person Igor runs as.** This is a
    Constraint in the decision record (`openspec/specs/pinned-skills/decisions.md`): the worker
    can write the template and `skills_dir`, and it can read the person's stored login by absolute
    path. The reset is not among these limits: it follows no link, even in same-user mode
    (decision 47).
23. **Each `igor run` has a home of its own, named by its run id and removed when the run ends**,
    such as `<state directory>/home/<role>-<run>` under Igor's state directory. So two
    `igor run`s of one role at once share no home, and neither's reset replaces `~/.claude` under
    the other's call. Each run picks its own id (decision 35). Within one run the home lasts
    across its tasks. Why not one home per role is the decision record's Rationale for *The
    worker's home is its user's, or its run's*. *Rejected:* a lock that makes the second run
    refuse, which would stop a developer running a second `igor run` of the role at all.
24. **A process that escaped its group is killed by #175's kill, not by one of this change's.**
    Under `igor serve`, #175's decision 27 kills every process the worker user owns whenever it
    kills a worker: once the last model step exits, after the repository's checks that #189
    (`loop-verifies-commands`) runs as the worker user, and before a tree's release. So no escaped
    process outlives its task, and this change adds no kill of its own when a task ends.
25. Merged into decision 22.
26. **Igor copies the worker's session log into its state directory when the worker exits, and
    the execution record points at the copy.** The log lies under `~/.claude/projects/`, which
    the next reset deletes, and `projects/` is not kept out of the reset, on the assumption, which
    task 0.8 measures, that Claude Code's memory for a project lives there and would load into
    later calls. Decision 29 redacts the copy.
27. **Task 5.1 installs `spec-trace` with `prose` and `bug-hunter`.** #190 (`review-evidence`)
    adds to each pull request a table of what the loop checked, and fills its *Spec scenarios*
    row by running `<skills_dir>/skills/spec-trace/scripts/spec_trace.py`; without it that row
    would read `not checked` on every pull request.
28. **Under `igor serve`, the startup check's call is a seat's first probe.** Where a seat is due a
    probe when Igor starts, that is, no unexpired reading covers it, as #143's *A seat nothing has
    read is probed on the Igor server with its own token* says, the check's call is the first seat
    probe Igor makes. Like any probe it spends the seat it reads, so the gate makes no decision
    for it, and its `rate_limit_event` is recorded as that seat's first reading. A probe's limits
    and exclusions, such as the hourly limit and the skip of a refused seat, apply to it, and it
    runs where #143's *A seat probe runs where only the Igor can write* places a probe. Why the
    check is a probe rather than always a gated call is the decision record's Rationale for *The
    startup check spends a seat it may probe, or else the gate's*.
    Where no seat may be probed at start, the check does not wait for one; it spends the seat the
    budget gate chooses. That happens in two cases: every seat has an unexpired reading, or every
    seat due a probe is held off, by #143's hourly limit for up to an hour or by its back-off for
    up to five hours after a probe that received no `rate_limit_event`. The gate may have no seat
    to spend either. An example is a deployment with a single seat that keeps a reserve, is held
    off, and holds no reading. Then Igor still starts, runs its cycles without a model call, and runs the check before its first model
    call; if that check fails, the running process exits with status 78 then. Under `igor run`,
    which makes no probe (#171), the check spends the run's implicit local seat, the one seat
    `igor run` makes from the token in `IGOR_RUN_TOKEN`, through the gate. This change states how
    the check is charged. #171's *A spend with no seat behind it is not made* should cite it, and
    does not yet (*Open Questions*).
29. **Igor redacts the session log's copy as it copies it**, with `redact`,
    the function #217 (`redact-state-branch`) builds for its *Credential redaction replaces
    every credential the Igor knows*. Why the copy is redacted is the decision record's Rationale
    for *The worker's session log outlives the reset*. *Rejected:* keeping no copy, which loses the
    record decision 26 keeps.
30. **#171's code is built before this change's**, although #204's archive order puts this change
    first. #204's build order is #217, #113, #171, #175, #174 (this change). #171 comes first
    because this change's reset and startup check assume #171's rule that every call spends a
    seat. The seat-budget code this change's code meets is then #171's, under which every model
    call spends a seat's token. An organization with no seats then makes no model call until it
    adds one, and never runs on the login stored on the host, which today's in-force
    `seat-budget` allows.
31. **The reset runs before each model step, not between a step's own calls.** A model step can
    make two calls: under #153's decision 40, the step that writes a post writes its reader goals
    in a first turn, and Igor then resumes that session with `claude -p --resume`. A reset between
    the two would delete the session log the resume reads (the decision record's Rationale for
    *Every model step in the worker's home starts from Igor's template*). The kill of decision 13
    runs before each reset, so it too runs per step. A home per worker, reset per step, with the
    session log's copy of decision 26, is chosen over a per-run `CLAUDE_CONFIG_DIR` in one shared
    home, for the reason in the decision record's Rationale for *The worker's home is its user's,
    or its run's*.
32. **`lore-search` (#216) owns the definition of Igor's state directory**: `$STATE_DIRECTORY`,
    else `$XDG_STATE_HOME/igor`. This change names no path itself. It cites #216's `graceful-handoff` requirement *A handoff
    states what was done, what remains, and who could continue*, where the specs define the state
    directory. #204 archives #216 after this change,
    so until then this change's spec cites a requirement not yet in force, which decision 21
    accepts.
33. **Every step's session log is copied before the next reset** (#216's decision 98): the
    worker's, those of #153's later model steps, and that of the further worker run #189 starts on
    the same item, each redacted with #217's `redact` as decision 29 has it. #216 keeps every
    step's log of a flagged execution, and an execution is known to be flagged only once it ends,
    so every step's log is copied, not the worker's alone. That a step's session is one file is an
    assumption task 0.8 measures.
34. **The execution record names each log copy by its path relative to the state directory, and
    may name one that #216 could not move** (#216's decision 102). The record is on a state branch
    that may be public, and under `igor run` the state directory lies in a person's home, so an
    absolute path would put a home directory and a user name on that branch. The record names each
    copy where Igor wrote it. #216 moves a flagged execution's copies into
    `flagged-questions`, and a copy whose move it refused stays at the path the record names. The
    record is on the state branch, the git branch in the lore repository where Igor keeps its
    records, not in the state directory on Igor's host where the copies are written, so #216's
    move of a copy on the host does not rewrite the record.
35. **A run removes the run directories a crashed run left.** This concerns `igor run`
    alone: a worker user's home lasts across runs, and `/opt/igor/skills` is never removed. Each
    `igor run` picks a run id and, while it runs, holds an exclusive lock on its own file,
    `<role>-<run id>.lock`, in Igor's state directory. The system releases the lock when the
    run's process ends, so a run whose lock another run can take is gone. At its start, before
    its first cycle, an `igor run` removes the run directories, as the spec's *Purpose* lists them
    (the home, the plugin directory decision 20 assembles, and the startup check's and triage's
    directories), of each earlier run of its role whose lock it can take, and nothing of a run whose lock it cannot take. `igor run --plan`
    removes nothing. The spec states the rule in *An igor run removes what a crashed run of its
    role left*, and task 2.3 builds it. A run's trees are not among the run directories this removes: the in-force sweep, *The
    abandoned-tree threshold derives from the worker's longest possible life*, removes a tree once
    it is older than any run could last. Why a home or plugin directory is not removed by age is
    the decision record's Rationale for *An igor run removes what a crashed run of its role left*.
36. Merged into decision 28.
37. **Where `skills_dir` does not exist, `igor run` links only the skills the role lists and
    those Igor's own code runs.** Its plugin directory holds a link for each of the person's
    installed skills that the role's `skills` list (#153) names, or that is on the list of skills
    whose scripts Igor's own code runs, whatever the role. Igor's code holds that list, which
    today names only spec-trace, whose checker #190 runs; a change that runs another skill's
    script for every role adds that skill to it. It links none of the rest, so a skill that acts
    with the person's own credentials, such as one that posts to chat, loads into a worker only
    where the role asks for it. On a server, by contrast, `/opt/igor/skills` holds only the pinned
    shared skills, which act with no one's credentials. For that run the assembled directory is
    `skills_dir`, and every rule naming `skills_dir` applies to it unchanged: none requires a
    skill to be at a particular commit (decision 4's pin is on the server's clone), so an
    unpinned directory needs no exception from any of them.
38. **An unflagged execution's session log copies last until the item's next execution ends.**
    A session log copy is the copy of a model step's Claude Code session log that decision 33
    makes before the worker's home is reset. An execution is flagged, in this decision's sense,
    where #216 puts a flagged hold on its item, and its copies go only when #216's `work-triage`
    deletes that execution's files, on any release of the hold: the command `igor release`, or an
    edit to the item by someone with write access. When any execution of an item ends, flagged or
    not, Igor deletes in its own state directory the copies of every earlier execution of the item
    that meets all three of these: it started before the one that just ended; it has ended, or its
    process has stopped; and it left no flagged hold. The second condition matters because #216
    lets two executions of one item run at once, and an earlier one still running may yet be
    flagged. So an item keeps the copies of its latest execution, of any execution still running,
    and of any flagged one. Each host deletes only its own copies, and where the item never runs
    on that host again, they stay. #216 also calls flagged some executions that stop without
    asking a question; those put no flagged hold on their item, so in this decision's sense they
    are unflagged. #216 keeps such an execution's transcript "as for any run", the same rule as any
    unflagged execution's, which this matches.
39. **The `igor run` check's two directories, its working directory and its `HOME`, go under
    Igor's state directory, and are removed after the call.** Why not the system's temporary
    directory is in the decision record's Rationale for *The startup check spends a seat it may
    probe, or else the gate's*. A crashed run's are removed with its other run directories
    (decision 35).
40. **A flagged execution's hold is in place before the execution counts as ended** (settled by
    the TLA+ model in `model/`). Decision 38 spares an execution that left a flagged hold, so
    Igor must see the hold at the moment another execution's end looks for it. If an execution
    could count as ended before #216 had put its hold, an end in between would delete the copies
    of an execution about to be flagged. The model finds exactly that with this rule off
    (`model/negative/NoHoldAtEnd.cfg`), and with it on, finds no deletion of a flagged
    execution's copies.
41. **A startup check whose probe #143 refuses fails the start, in place of #143's retry.**
    Where the startup check is a seat's first probe and #143's *Every directory above a seat probe
    is checked before it is spawned* refuses one of the probe's two directories, its working
    directory and its `HOME` (its owner, its write bits, or a `.claude` or `CLAUDE.md` in it, or it
    cannot be created), Igor refuses to start, naming the directory and what is wrong with it, and
    exits with status 78. For that probe this replaces #143's rule, which records a refused probe
    as one that errored and retries it after the hourly limit and back-off; the spec states the
    exception in *A refused startup probe stops the start*. A refused probe is refused again until a person fixes the
    directory, so waiting for the next probe only delays the error, by up to five hours, #143's
    back-off. On a deployment with one seat, no other seat can make the first model call in the
    meantime.
42. **The startup check denies every tool, as #143's probe does** (settled by measurement,
    *Measured on 2026-10-31*): with `--tools ""` the plugin's skills are still listed in
    `system/init`, so the check loses nothing. That call ran on a login rather than a seat token,
    and without `--setting-sources user` and `--strict-mcp-config`; task 0.4, still open, runs the
    check's exact command on a seat token (*Open Questions*). If the list then does not arrive, Igor refuses to start, as for
    any missing skill, and this decision is revisited. The check is #143's minimal probe plus only
    what the check needs: `--plugin-dir`; `--setting-sources user` and `--strict-mcp-config`,
    which keep the call to that plugin; and `--model haiku` (decision 18).
43. **Igor finds the copies to delete in its own state directory, never from the execution
    record, and deletes without following a link.** Why not the execution record is the decision
    record's Rationale for *Igor deletes an item's earlier session log copies when an execution of
    it ends*. Under `igor run` a worker of the same user can write the state directory, so a
    planted link could redirect a delete.
44. Merged into decision 39.
45. **Worker guarantees are stated as properties any worker must meet, and the local mechanism as
    how a local host meets them.** Issue
    [#244](https://github.com/adamstallard/igor/issues/244) records a planned direction, which
    this change does not decide: workers that run as cloud Claude Code sessions, with `igor serve`
    coordinating them. It also records a check
    of Claude Code's documentation on 2026-11-13: a cloud session has no status, completion signal
    or stop API, so Igor could neither learn that such a worker finished nor end it, and no cloud
    mechanism can be specified. *The worker's home is its
    user's, or its run's* gives each worker a home of its own, and its text states the property. *Nothing a step left running survives into the next reset* has Igor end what a step started.
    Requirements scoped to a local host name the mechanisms: the worker user's home, `igor run`'s
    per-run home, and the kill of every process the worker user owns. How a worker with no stop
    API would meet *Nothing a step left running survives into the next reset* is an open question.
46. **Under `igor run`, triage runs with a new, empty `HOME` for each call.** Triage may not run in
    the worker's home, and the `HOME` Igor starts with under `igor run` is the person's own,
    whose hooks and `CLAUDE.md` would load into every triage call. The decision record's Rationale
    for *Under igor run, triage runs in an empty home of its own* says why an empty directory
    serves. Under `igor serve` triage runs as the service user in its home, which the
    operator keeps free of hooks, a `CLAUDE.md` and skills (decision 6).
47. **No reset, no removal of a run's directories, and no write of a log copy follows a link.** A
    worker can leave links in its home, including in place of `~/.claude` or `~/.claude.json`, and under `igor run` a worker of the same user can write the
    state directory, so a reset or removal that followed a link, or a copy written through a
    planted link, could delete or overwrite a file the person owns. Removing a link instead of its target,
    and creating each copy as a new file, closes both. This is the same rule decision 43 applies
    to deleting copies.

### `skills_dir` is `/opt/igor/skills`, overridden only by the server's environment

Two of decision 19's choices govern `skills_dir`: `IGOR_SKILLS_DIR` must be absolute, so it never
depends on the directory Igor starts in, and the skills Igor expects are every entry under
`<skills_dir>/skills/`.

**Where `skills_dir` does not exist, `igor run` assembles one from the skills the person
installed** (decision 20). The shared-skills manager (`manage-skills`) installs each skill in the
person's home as an entry of `~/.claude/skills`, a link into the person's shared-skills clone; the
manager's own skill, `manage-skills`, is a copied directory instead. A skill is as the spec's
*Purpose* defines it: an entry holding a `SKILL.md`.

1. Igor reads `~/.claude/skills` from the `HOME` it started with, the person's own, before it
   sets the worker's `HOME` to the run's home.
2. `--plugin-dir` needs a directory with `.claude-plugin/plugin.json` and a `skills/` level,
   which `~/.claude/skills` lacks. So Igor builds one in its state directory (decision 32),
   beside the run's home and named by the run's id, such as `<state directory>/plugin/<role>-<run>`.
   It holds `.claude-plugin/plugin.json`, as
   `{"name": "igor", "version": "0.0.0", "description": "the person's installed skills"}`, and
   under `skills/` one link for each installed skill that the role's `skills` list names or that
   Igor's own code runs (decision 37; today only spec-trace). Each link goes to the entry's
   resolved path, so it points straight at a directory, never through a chain of links as the
   manager's own links do.
3. For the run, that directory is `skills_dir`: every call that carries `--plugin-dir` names it,
   each skill loads as `igor:<name>`, the startup check runs against it, including its refusal of
   a directory holding anything but `.claude-plugin/plugin.json` and `skills/`, and #153's check
   of a role's skill names reads it.
4. The run removes the directory when it ends, with its home.

As the run starts, before the startup check, it prints a line saying it loaded the person's
skills, naming `~/.claude/skills`. The check reports each skill's commit as it does on a server.
The person's clone is owned by the user Igor runs as, so Igor reads its commit without the
`-c safe.directory` option it passes for a root-owned clone, though with the file-system monitor
off, as on every commit read (decision 19). A linked skill whose
entry is a copied directory in no clone, as `manage-skills` is, has its commit reported as not
checked; `manage-skills` is linked only where a role lists it.

**Where `~/.claude/skills` is missing or holds no skill the role lists or Igor's own code runs,**
no directory is built and the run loads no skills: no call carries `--plugin-dir`, no startup
check is made, and the run says so as it starts, naming `skills_dir` and `~/.claude/skills`. #153
refuses a role that lists a skill not installed, in every command that runs a model step, a dry
run included, so such a run starts only for a role whose `skills` list is empty. A dry run,
`igor run --plan`, assembles and removes its own directory as any run does. Decision 35's rule
that `--plan` removes nothing covers only what earlier runs left.

The fallback's skills are at whatever commit the person's clone is at, which the manager's
`update` moves by pulling the clone; that and the worker's write access to them are decision 20's
limits.

### One plugin directory for every role

Decision 7. On a server every call carries the one plugin directory, so every pinned skill loads for every
role. A role's `skills` list (#153) decides which skills' steps Igor runs and which checks Igor's
code makes on what it publishes, not what loads; under `igor run`'s fallback it also decides what is linked
(decision 37). A plugin directory per role would mean one directory per distinct list to install,
pin and check at start, and would protect little: a loaded skill the role does not list is
neither directed nor run by Igor's code, which #153 does per listed skill. The worker can still
invoke such a skill through the Skill tool, but that only runs the pinned, root-owned skill's own
instructions, which no item can change, and Igor verifies nothing from it.

### What normal mode loads besides the plugin

Without `--bare`, a call also loads the hooks, `CLAUDE.md` and home skills (`~/.claude/skills`) of
the user it runs as, and, unless told not to, the worked repository's own `.claude` settings,
skills and `CLAUDE.md` (measured). Namespacing keeps every `igor:<name>` skill from being
replaced, but the rest reaches the model. On a dedicated Igor server the service user has no
hooks, `CLAUDE.md` or home skills, as long as the operator follows task 5.3's note (decision 6).
Decision 8 keeps the repository's files out of every call, and the reset below keeps what a
worker writes in its `~/.claude` out of later calls.

### The worker's home, and its reset before every model step

The model steps that run in the worker's home are the worker and #153's later steps, the prose
pass and the bug hunt; triage and the startup check are model steps too, but run elsewhere (the
spec's *Purpose* defines *model step*). `--setting-sources user` still loads the user's settings, skills and `CLAUDE.md` from `~/.claude`,
and the worker writes its home, so without a reset a worker steered by an item's text could plant
hooks, a `CLAUDE.md`, skills or an MCP server for every later call. Task 5.3's note to the
operator cannot stop that; the reset can.

Which home:

- **With a worker user (#175):** that user's own home, `/var/lib/igor-worker-<role>`.
- **Without one:** the run's own home (decision 23), under Igor's state directory, the directory
  where Igor keeps its own files on the machine (decision 32). Igor sets it as the worker's
  `HOME`. Only `igor run` runs with no worker user, #175's same-user mode, where the worker runs
  as the user Igor runs as (decision 16). The worker then never loads the `~/.claude` of the user
  Igor runs as, whether that is the service user or a person running `igor run` on their own
  machine. A crashed run's home and assembled plugin directory are removed by the next
  `igor run` of its role (decision 35).

What the template holds. It ships with Igor, in its installation, which #175's start check
confirms the worker user cannot write:

- `settings.json` holding `{}`: no hooks and no MCP servers. Igor passes everything a call needs
  as flags, and the 2026-10-18 measurement ran on this file;
- no skills and no `CLAUDE.md`, since skills come from `--plugin-dir`;
- `~/.claude.json` holding `{"hasCompletedOnboarding": true}`: onboarding marked done, no MCP
  servers.

How the reset works:

- **When:** before every model step Igor starts in the worker's home, and never between the calls
  of one step (decision 31). #153's step that writes a post first writes, in one call, the goals
  of the post's reader, which prose's first call needs. Igor then runs prose's first call itself,
  and resumes the step's session with `claude -p --resume` to write the post. The resume reads the
  session log the first call left, so a reset between the two would leave it nothing to resume.
- **Who:** with a worker user, Igor resets as that user, through #175's `sudo` spawn, since only
  that user can remove what a worker wrote, after killing that user's processes (decision 13). In
  same-user mode Igor resets as itself. Either way the reset follows no link (decision 47).
- **What it keeps:** nothing it replaces, `~/.claude/.credentials.json` included (decision 17).
  A seat's token reaches `claude` through its environment, which the reset does not touch, and it
  is the only credential a call in the home uses (measured 2026-10-18). Under `igor serve` no user
  is logged in to Claude, so a stored login arises only if an operator puts one there, and a valid
  token wins over it. On Linux a developer's login is stored in `~/.claude/.credentials.json` in
  their own home. Under `igor run`, `HOME` is the run's home, so Claude Code does not find that
  file. The worker still runs as the developer, though, so it can read the file by its absolute
  path, a limit of `igor run` (decision 22).
- **What it deletes that Igor reads:** each step's session log, under `~/.claude/projects/`. Igor
  copies it into its state directory as the step exits, before the next reset, redacted, and the
  execution record points at the copy (decisions 26, 29, 33).
- **What persists:** everything else in the home: `~/.gitconfig`, where #175's start check sets
  `safe.directory` so the worker's git trusts a tree the service user owns, and the files a
  repository's tests cache in the home. That such a file, like `~/.npmrc`, can steer later tasks
  in that home is a Constraint in the decision record, with the condition under which it holds.

Resetting `~/.claude` alone, a fresh, empty home for every task, and keeping a stored login are
turned down in the decision record's Rationale for *Every model step in the worker's home starts
from Igor's template*.

### The startup check spends a seat

The startup check confirms that every pinned skill loads, by reading the skill list from the
`system/init` event of one call. Issue #152 suggests reading that list from #144's startup
self-test, which #144 proposes to run once per seat and has not specified; this check runs once
per start and is kept separate (decision 5).

The call is `claude -p --model haiku --tools "" --plugin-dir <skills_dir>` (decisions 18, 42), with
the `--setting-sources user` and `--strict-mcp-config` every call carries (decision 8), from an empty
directory, with an environment holding only `PATH`, the host's network settings, a `HOME` that is
another empty directory, and one seat's token. Its prompt is one word, such as `ok`, on stdin, as
#175 requires of every call's prompt. It is recorded like any other call, and that it
authenticates shows the seat's token works. The empty `HOME` keeps the service user's home skills
out of the list the check reads; `--setting-sources user` keeps out project skills above the
working directory.

**Where it runs and which seat it spends.** Under `igor serve`, where a seat may be probed, the
check is that seat's first probe (decision 28). It then runs from the working directory and the
`HOME` that #143 creates under `/var/lib/igor/probes` and checks for every probe; both are empty,
as the call requires. If #143 refuses to start the probe over one of those directories, the check
fails the start (decision 41). Where no seat is due a probe, or every due seat is held off, the
check spends the seat the gate chooses (decision 28). Under `igor run` it spends the run's
implicit local seat through the gate, from two new directories under Igor's state directory
(decision 39).

**It reads the event's `skills`, not its `tools`.** The worker's tools come from the worker's own
flags, not the check's, so a `Skill` entry in the check's `tools` would say nothing about the
worker; and the Skill tool was missing only under `--bare` (2026-10-11), which no call passes.

**A missing event is a refusal only where the provider answered.** Where no `system/init` event
arrives and the model provider did answer, the skills cannot be confirmed, and Igor refuses with
status 78. Where the provider did not answer, Igor exits with status 1, so a supervisor restarts
it once the outage passes. #82's *A process that refuses to start exits with status 78* states
that exception: a start check that fails because an outside service did not answer is not a
refusal, and exits 1. The event arrived before authentication in every call measured
(*Measured without a credential*), so a provider outage is expected to leave the event in place
and the check judged on its list. The exit-1 case is a call that prints no event and ends on a
connection failure, which no measurement has produced; the rule covers it should it occur.

**It reports each skill's commit, as the service user.** The commit is read with `git -c
safe.directory=<clone root> -C <resolved dir> rev-parse HEAD`, where the clone root is the
nearest directory at or above the skill's resolved directory that holds `.git`. The clone is
root-owned (task 5.1), and without that option git refuses to read it as the service user (the
decision record's Rationale for *Igor reports the commit each skill loads from*). The option applies to that one command, so the service user's
`~/.gitconfig` trusts nothing. Igor trusts only a clone root owns, and passes
`-c core.fsmonitor=false` on every commit read (decision 19). A clone the service user owns needs no trust; one any other user owns is reported
as not checked, with no git command run in it. Igor reports the commit and does not refuse one
older than `075a73a`.

**It refuses a plugin directory that holds more than skills** (decision 19). Before the call,
Igor refuses to start when `<skills_dir>/skills/` is missing or holds no skill, so a check with nothing to
check never passes, and when `skills_dir` holds anything but `.claude-plugin/plugin.json` and
`skills/`, or `plugin.json` holds a key besides `name`, `version` and `description`.

### No guard against a same-named skill

Under `--plugin-dir` no skill is expected to replace the pinned one (decision 6), an assumption
task 0.6 measures. The repository's `prose` does not load at all, and a home copy loads as `prose`
beside `igor:prose`, so unlike under `--add-dir` there is no single name for one skill to take
over. A step that needs the pinned skill asks for
`igor:prose`, and Igor's code runs the pinned skill's scripts by path under `<skills_dir>/skills`,
so a home copy's scripts never run.

### The pinned shared-skills commit is at or after `075a73a`

Shared-skills #19, merged as `075a73a` on 2026-10-11, makes every skill find its scripts from its
base directory instead of a home-directory path. A plugin skill's base directory is its path
inside the plugin, `<skills_dir>/skills/<name>`, including when the manager installed it as a
link (measured 2026-10-11 and 2026-10-18). So at or after that commit a skill runs the pinned
scripts, under the path #153's code uses, and the worker needs no instruction about where its
skills are (task 4.1).

### Session log copies when executions overlap: the TLA+ model

Under decision 38 an execution's end deletes earlier executions' copies, and #216 lets two
executions of one item run at once, so whether an end can delete a copy Igor must keep depends on
how the executions interleave. `model/LogCopies.tla` checks it with TLC, the TLA+ model checker,
and CI runs it (`.github/workflows/tla-pinned-skills.yml`).

The model holds one item's executions, numbered in the order they start. Each runs on one host,
makes its copies while it runs, and then ends, flagged or not, or stops because its Igor process
stopped. #216 may release a flagged hold at any time, which deletes that execution's files. When
an execution ends, Igor deletes on its host the copies decision 38 names. The model checks four
invariants. Each proves scenarios of *Igor deletes an item's earlier session log copies when an
execution of it ends*, named in the model above the invariant and below in parentheses:

- `NoCopyDeletedWhileRunning`: no execution's copies are deleted while it runs (*A running
  execution's log copies stay*).
- `FlaggedCopiesWaitForRelease`: only #216's release deletes a flagged execution's copies (*Igor
  deletes no flagged execution's log copies*).
- `LatestCopiesKept`: Igor never deletes the copies of the latest execution to start on a host
  (*An unflagged execution's log copies last until the item's next execution ends*).
- `NoStaleCopies`: an unflagged execution that ended or stopped keeps no copies once a
  later-started execution on its host has ended after it (the same scenario, and *A crashed
  execution's log copies go when the next execution ends*).

Each rule decisions 38 and 40 rely on is a boolean constant in the model, TRUE as specified.
Each file in `model/negative/` sets one to FALSE, and TLC must find the violation it names:

| Rule turned off | File | Violation |
| --- | --- | --- |
| an end deletes only executions that started before it | `NoStartedBefore.cfg` | `LatestCopiesKept` |
| an end deletes only executions that ended or stopped | `NoFinishedOnly.cfg` | `NoCopyDeletedWhileRunning` |
| a stopped process's execution counts as finished | `NoStoppedCounts.cfg` | `NoStaleCopies` |
| an end deletes no execution that left a flagged hold | `NoFlagCheck.cfg` | `FlaggedCopiesWaitForRelease` |
| a flagged hold is in place when its execution ends | `NoHoldAtEnd.cfg` | `FlaggedCopiesWaitForRelease` |

The last rule is decision 40, which the model showed the spec needed.

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

Each item names its owner. "This change" means this change's authors.

- **Whether the skill list arrives under the check's exact command on a seat token** (this change,
  task 0.4). Decision 42's measurement used a login and lacked two of the check's flags.
- **How a worker with no stop API would meet *Nothing a step left running survives into the next
  reset*** (the change that adds cloud workers). A cloud Claude Code session documents none, so
  this change specifies only the local mechanism.
- **Homes for several workers of one role at once** (#242, `one-process-per-role`, once #175 has
  merged). #242 runs worker slot `k` of a role as its own worker user. *The worker's home is its
  user's, or its run's* forbids a home that another worker running at the same time uses, and
  *Which home*, in *The worker's home, and its reset before every model step* above, names only
  `/var/lib/igor-worker-<role>`, the home of #242's first slot. Under `igor run`, each run has one home
  (decision 23), so a change that lets one run work several items at once needs a home per
  worker (that change).
- **The ambient login in the specs in force until #171 archives** (#171). Nothing about it is
  undecided; it is listed so a reader of the specs in force (`openspec/specs/`) knows they allow
  it. The in-force
  `seat-budget` lets a seat name no token and run on the login stored on the host, which
  decision 17 forbids. #171's code is built first (decision 30), and under this change no call
  runs without a seat, since the startup check spends a seat it probes or one the gate names
  (decision 28) and every other call comes after it.
- **#153's `role-config` delta and #190's `task-execution` delta** (#153, #190). #153's delta says a role's `skills` list
  does not decide what loads, and its scenario has `igor run` load every installed skill, where
  decision 37 has the list decide what `igor run` links; #190's `task-execution` delta states the
  same rule. Both should cite this change's *Every model call names the plugin directory*, which
  states that under `igor serve` every installed skill loads for every role, rather than restate
  it. #153 should drop its note that this change assumes a role's `skills` list directs the worker;
  this change does not say so. Under #153, the step that writes a post where no worker ran first, such
  as a reply to a mention, has a resumed call; which home it runs in is #153's to say, and this
  change's reset applies wherever that is the worker's home.
- **What the execution log names for a moved log copy** (#216). #216's proposal says the record
  names a flagged copy's moved path, where decision 34 keeps the path where Igor wrote the copy.
- **Two rules that delete a stopped run's files** (#216). A run whose process stopped before #216 put a hold on its item left
  no hold, so it counts as unflagged: decision 38 deletes its copies at the item's next execution
  end, and #216's own rule deletes its files at the next cycle. (Decision 40 concerns an execution
  whose Igor is still running and ends flagged.) Two rules then delete the same run's files, and
  #216 and this change are to decide which cites the other.
- **The execution log's file path and name** (#216, #217). #216 and #217 put the log at `executions/<yyyy-mm-dd>.ndjson`, where the code on `main` writes `executions.ndjson`;
  this change uses the in-force name, the execution log on the state branch (`seat-budget`), and
  no path. #216 and #217 call it the execution ledger.
- **#171's citation of how the startup check is charged** (#171). This change states it, in *The
  startup check spends a seat it may probe, or else the gate's*; #171's *A spend with no seat
  behind it is not made* cites *Igor confirms its skills load before its first model call* for the
  probe case, and should cite *The startup check spends a seat it may probe, or else the gate's*
  instead.
- **#143's citation of the startup probe's exception** (#143). Where the startup check is a seat's
  first probe and #143 refuses one of its directories, this change's *A refused startup probe
  stops the start* applies in place of #143's recording and retry; #143's *Every directory above a
  seat probe is checked before it is spawned* should cite it.
- **Whether a kill by the worker user's systemd slice reaches a process `sudo` started** (#175,
  task 6.15). It is unmeasured. This change requires the kill by user, which reaches every process
  the user owns whatever its control group, so its rule does not wait on the answer.
- **Whether #153's Read grant on `skills_dir` reaches the files behind a link** (#153). A skill's
  entry is a link into a clone outside `skills_dir`; #153 measures it.
- **Issue #152's body** (this change's authors, an edit to the issue, not to this text). It states
  the reset and the check as they were before decisions 28 and 31.

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
  (#153). A step that names a skill names `igor:prose` or `igor:bug-hunter`.
- **The model is given the path Igor's code uses.** A plugin skill is given
  `<skills_dir>/skills/<name>` as its base directory, including for a linked skill (measured
  2026-10-18).
- **The model cannot Read a skill's files.** `--plugin-dir` grants no Read access (measured
  2026-10-18), so a skill whose instructions tell the model to Read a file in its own directory
  meets a permission refusal unless #153 grants that path. #153 grants every model step Read on
  `<skills_dir>`, since bug-hunter's instructions Read files beside its `SKILL.md`. A skill's
  entry, on a server and under `igor run`'s fallback alike, is a link into a clone outside
  `<skills_dir>`, so whether that grant reaches the files behind the link is #153's to measure.
- **Each step invokes its skills through the Skill tool**, as `igor:prose` or `igor:bug-hunter`,
  since no call passes `--bare`.
- **Hooks.** The install wires none, and the startup check refuses a plugin that could declare
  one, so prose's hook that blocks a session's first file write until prose's first call has run
  never runs in a worker.
- **Prose's first call is Igor's own**: Igor runs it as the service user and gives the rules and
  the pass token to the step in its prompt, so the reset needs no exception for it (decision 14).
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

The seat probe is a `claude -p` and carries `--plugin-dir` like any other call. Under
`igor serve` the startup check can be a seat's first probe, which #143 records and limits like any
probe (decision 28). #143's switch of triage to `stream-json --verbose` changes the output flags,
not `--plugin-dir`. One argument builder for every call keeps the probe's arguments and every other
call's from drifting apart (task 2.1). That builder also gives the probe
`--setting-sources user`, which keeps out skills above its working directory (measured
2026-10-18, above).

The usage read, `runUsage` in `src/budget.ts`, is gone before this change is built (*Measured
before building* says who removes it), so this change's code meets none.
