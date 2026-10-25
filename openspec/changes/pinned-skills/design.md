## Context

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides that Igor loads its skills
from one pinned directory named on every `claude -p`. The issue named the directory with
`--add-dir`. The measurements below found that `--add-dir` loads the skills but does not keep
them pinned, and Adam chose `--plugin-dir` on this change's pull request, #174 (2026-10-11).
A bare "decision <n>" below is one of the proposal's numbered decisions.

**Igor never passes `--bare`** (decided by Adam, 2026-10-11). Under `--bare` a seat's
setup-token can authenticate only as an API key, so it does not run as a seat: no
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
  token under decision 17, so the usage read, as `main` has it, reads no window. That is #143's
  to settle. #143 (`read-seat-windows-from-the-stream`) removes the read once #171
  (`seat-files`), which gives every seat a token, has its code built: the first change built
  after that removes it (#143's decision 37). Until then the proposal's decision 10 applies to
  it, and it carries no `--plugin-dir`.

**Not measured:** the real Keychain item, a real second account's stored login, and the Claude
Code version the server runs. Nor is what `claude -p` does with a plugin directory that does not
exist, so Igor never passes one (decision 20).

## Decisions

### `skills_dir` is `/opt/igor/skills`, overridden only by the server's environment

**Decided by Adam, 2026-10-17.** `skills_dir` is not a key in `igor.config.yaml` or in any other
lore file. Igor uses `/opt/igor/skills`, the path where the deployment guide installs the plugin,
and `IGOR_SKILLS_DIR` in the environment Igor starts with overrides it. The lore repository is
shared and changed by pull request, so a key there would let any merged pull request point every
Igor at another directory of skills, the same reason #175 keeps its worker user out of
`igor.config.yaml`. A lore file that names `skills_dir` is refused by the strict unknown-key
check, with no message of its own.

Two of the six smaller choices in proposal decision 19, which the authoring agents made and Adam
accepted on 2026-10-19, govern `skills_dir`. `IGOR_SKILLS_DIR` must be absolute, so it never depends on the directory Igor starts in.
Which skills Igor expects is read from the directory itself: every entry under
`<skills_dir>/skills/`.

**Where `skills_dir` does not exist (Adam, 2026-10-19),** `igor serve` refuses to start,
naming the path, and exits with status 78.

**Where `skills_dir` does not exist, `igor run` uses the skills the person installed (Adam,
2026-10-19, answering question 10 of #153's *For Adam* list; proposal, decision 20).** `/opt/igor/skills` is the server's path, but a person's machine
has skills too: the shared-skills manager installs each one in the person's home as an entry of
`~/.claude/skills`, a link into the person's shared-skills clone; a skill is an entry, a link or a
directory, whose top level holds a `SKILL.md`. The manager's own skill,
`manage-skills`, is a copied directory instead. A run's `HOME` is its own home (decision 23), so Claude Code does not find them there,
and Igor passes them explicitly:

1. Igor reads `~/.claude/skills` from the `HOME` it started with, the person's own, before it
   sets the worker's `HOME` to the run's home.
2. `--plugin-dir` takes a plugin directory, which `~/.claude/skills` is not: it has no
   `.claude-plugin/plugin.json` and no `skills/` level. So Igor assembles one for the run, in
   its state directory beside the run's home, at a path whose name holds the run's id, such as
   `<state directory>/plugin/<role>-<run>`, where the state directory is the one decision 32
   names. It holds `.claude-plugin/plugin.json`, as
   `{"name": "igor", "version": "0.0.0", "description": "the person's installed skills"}`, and
   under `skills/` one link to the entry's resolved path for each installed skill that the
   role's `skills` list names or that Igor's own code runs (proposal, decision 37). Today Igor's
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
it passes for a root-owned clone (proposal, decision 19). A skill linked into the run's
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
the person, can write them (proposal, decision 25).

*Rejected:* loading no skills under `igor run`, as this decision first had, under which #153
refuses every role whose `skills` lists `prose`; copying the skills into the run's
`~/.claude/skills`, which the reset before every model step replaces, and where a skill loads as
`prose`, not the `igor:prose` #153's steps name; writing a `plugin.json` into the person's
install; and passing `--plugin-dir` to a directory that does not exist, which no measurement
covers.

The plugin is named `igor` (decided by Adam, 2026-10-11), so skills load as `igor:prose` and
`igor:bug-hunter`. The deployment writes the one-line `plugin.json`; the startup check fails if
the name differs, because no `igor:<name>` would be listed.

### One plugin directory for every role

**The coordinating agent's choice (2026-10-11), which Adam let stand on 2026-10-19.** Every call
carries the one `--plugin-dir <skills_dir>`, so on a server every pinned skill loads for every
role. A role's `skills` list (#153) decides which skills its worker is directed to use and which
Igor verifies, not what loads. Under `igor run` without `skills_dir`, the run's own plugin
directory holds only the listed skills (proposal, decision 37), for the reason under *Where the
skills are*: the person's skills may act with their credentials. The reasoning below is for the
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

**Decided by Adam, 2026-10-11: Igor makes no startup check of the users' hooks, `CLAUDE.md` or
home skills.** `docs/deployment.md` tells the operator to keep the service user and the worker
user free of them, and why (task 5.3). Such a check is worth adding only if a shared server
becomes a supported setup.

**Decided by Adam, 2026-10-17: no call loads the worked repository's settings.** The worker
can edit the repository, so its `.claude/settings.json`, `.mcp.json`, skills and `CLAUDE.md`
are text an item can steer, the same reason the `role-config` spec keeps a worker's allowed
commands in the role file. Every call passes `--setting-sources user`, which loads the user's
settings and not the project's or local ones, and `--strict-mcp-config`, which ignores every MCP
configuration not passed with `--mcp-config`. Measured on 2026-10-18, the two keep all four out,
and the repository's local and nested files as well.

### The worker's home, and its reset before every model step

**Decided by Adam, 2026-10-17: the worker runs in a home that lasts, and Igor resets that
home's `~/.claude` and `~/.claude.json` from a built-in template before each model step.** A model step is the worker,
or one of #153's later steps; Adam set the reset per step, not per `claude -p`, on 2026-10-21
(proposal, decision 31), since one step may make two calls.
`--setting-sources user` still loads the user's settings, skills and `CLAUDE.md` from
`~/.claude`, and the worker writes its home, so without a reset a worker steered by an item's text could
plant hooks, a `CLAUDE.md`, skills or an MCP server for every later call. Task 5.3's note to the
operator cannot stop that; the reset can.

Which home:

- **With a worker user (#175):** that user's own home, `/var/lib/igor-worker-<role>-<rank>`,
  where `<rank>` numbers the instances of one role (#179).
- **Without one:** a home for each `igor run`, under Igor's state directory, the directory where
  Igor keeps its own files on the machine, named by the run's id, such as
  `<state directory>/home/<role>-<run>` (Adam, 2026-10-19), the state directory being the one
  #216 defines (proposal, decision 32). Igor sets it as the worker's
  `HOME` and removes it when the run ends. The run id is the one #179 gives each run, which the
  run's trees also carry; since the home's name holds it, two runs of one role at once share no
  home. Only `igor run` runs with no worker user, #175's same-user mode, where the worker runs as
  the user Igor runs as. The worker then never loads the `~/.claude` of the user Igor runs as,
  whether that is the service user or a person running `igor run` on their own machine.

Under `igor run`, a run that crashes leaves behind its own home and the plugin directory it
assembled from the person's skills (decision 20). A worker user's home is meant to last, so this
concerns `igor run` alone. The next `igor run` of the same role removes the crashed run's home
and plugin directory at its start, before its first cycle, in the same sweep in which #179
removes the crashed run's trees (Adam, 2026-10-21, decision 35). Each `igor run` runs at rank 0,
and holds a lock on its own file, `<role>-0-<run id>.lock`, in the directory where trees are
kept, for as long as it runs. The system releases the lock when the run's process ends, so a
lock the new run can take belongs to a run whose process is gone. Where the new run cannot take
a run's lock, it removes none of that run's trees, home or plugin directory.

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
  call later checks, is Igor's own and runs as the service user (Adam, 2026-10-18, on #153). It
  writes nothing in the worker's home, so the reset has nothing of prose's to keep.
- **Who:** with a worker user, Igor resets as that user, through #175's `sudo` spawn, since only
  that user can remove what a worker wrote. In same-user mode Igor resets as itself.
- **What it keeps: nothing it replaces** (Adam, 2026-10-18). Every seat has a token, and Igor
  never uses a stored Claude login, under `igor serve` or `igor run`, so the reset removes
  `~/.claude/.credentials.json` with the rest of `~/.claude`. A seat's token reaches `claude`
  through its environment, which the reset does not touch, and it is the only credential a call in
  the home uses (measured 2026-10-18, above). Under `igor serve` no user is logged in to Claude,
  so a stored login arises only if an operator puts one there, and a valid token wins over it.
  Under `igor run` the developer's own login may sit in the macOS Keychain, which setting `HOME`
  does not move; Igor neither hides nor refuses it, and on 2.1.303 a set token wins over it.
  Should a later version prefer the login, `run` spends it, on the developer's own machine and
  quota, which Adam accepted on 2026-10-18. A developer's login in `~/.claude/.credentials.json`
  of their own home, as on Linux, is out of the worker's reach because `HOME` is the run's home.
- **What it deletes that Igor reads:** the worker's session log, under `~/.claude/projects/`.
  `projects/` cannot be kept out of the reset, since Claude Code's memory for a project lives
  there too. So when each model step in the worker's home exits, Igor copies its log into its
  state directory, before the next reset (proposal, decision 33), and the execution record points at the copy (Adam, 2026-10-19). It redacts the copy as
  it writes it, with #217's `redact` (Adam, 2026-10-21; proposal, decision 29): a worker that
  runs `env` prints its seat's token into the log.
- **What persists:** everything else in the home: `~/.gitconfig`, where #175's start check sets
  `safe.directory` so the worker's git trusts a tree the service user owns, and the files a
  repository's tests cache in the home. A file a run leaves there, such as `~/.npmrc`, can steer
  later runs in that home. Adam accepted that; with a worker user, #175 gives each instance its
  own, so such a file reaches no other instance. In same-user mode the home is removed when the
  run ends, so such a file reaches only the later tasks of that run.

*Rejected:* a fresh, empty home for every task, which loses `~/.gitconfig` and the caches a
repository's tests need; resetting `~/.claude` alone, which leaves `~/.claude.json` for a worker
to write; and keeping `~/.claude/.credentials.json` so that an organization with no seats could
run on a stored login, which leaves open where a worker user's login comes from and lets a
worker rewrite a login that later calls might use.

**Decided by Adam, 2026-10-17: with a worker user, Igor kills every process that user owns before
every reset**, by user or by the user's systemd slice, as the implementer chooses. A process that
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
change adds no kill of its own when a task ends (Adam, 2026-10-19).

**`igor run` has no sandbox (Adam, 2026-10-19).** In same-user mode the worker runs as the user
that owns Igor's installation and the skills a developer installed, so it can write the template
and `skills_dir`, and #175's start check, which confirms a worker user cannot write the template
or `skills_dir`, does not run. The worker can also make `~/.claude` or `~/.claude.json` a link to
a file the person owns, and the reset, run as the person, may follow it and remove or overwrite
that file. All three, a writable template, a writable `skills_dir` and a reset that follows a
link, are accepted as limits of `igor run`, a developer at their own terminal.

**Same-user mode is `igor run` alone (Adam, 2026-10-17).** #175 has no `igor serve --same-user`,
so no served rank uses a run's home. Nor does same-user mode run under the systemd unit
(`deploy/igor.service`), whose `ProtectHome=read-only` would make a home under `~/.local/state`
unwritable. Under #179 `igor run` is rank 0 and runs beside serving ranks with no refusal and no
wait (Adam, 2026-10-18). A serving rank never uses a run's home, so a run beside serving
ranks shares no home with them, and two `igor run`s of one role at once each have their own.

### The startup check spends a seat

**Decided by Adam, 2026-10-18; the seat it spends under `igor serve` amended on 2026-10-21.** The startup check confirms that every pinned skill loads, by
reading the skill list from the `system/init` event of one call. Issue #152 suggests reading that
list from #144's startup self-test, which #144 proposes to run once per seat and which is not yet
specified. The check here runs once per start:
`claude -p --model haiku --plugin-dir <skills_dir>`, with the `--setting-sources user` every
call carries, from an empty directory, with an environment holding only `PATH`, the host's
network settings, a `HOME` that is another empty directory, and one seat's token. Where the
check is a seat's probe, both directories are #143's probe directories; under `igor run` they
are new directories under Igor's state directory (proposal, decision 39). Its prompt is one word, such
as `ok`, and goes on stdin, as #175 requires of every call's prompt. It is an ordinary call: it
spends that seat and is recorded like any other, and that it authenticates shows the seat's token
works. The empty `HOME` keeps the service user's home skills out of the list the check reads, and
`--setting-sources user` keeps out project skills above the working directory (measured
2026-10-18). Adam accepted keeping the check separate from #144's.

**Under `igor serve`, the check is a seat's first probe** (Adam, 2026-10-21; proposal, decision
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
with an empty `HOME`, as the paragraph above requires. The check keeps its own arguments,
`--model haiku` and `--plugin-dir`; whether #143's probe, which runs with no tools on its own
model, may differ in that way is a question for Adam in the proposal's *Still open*. Where every seat already has an unexpired reading at start, no probe is due, and the
check spends the seat the gate chooses. `igor run` makes no probe (#171), so there the check
spends the run's implicit local seat, the one seat `igor run` makes from the token in
`IGOR_RUN_TOKEN`, through the gate, from two new directories under Igor's state directory
(proposal, decision 39). Where a seat is due a probe but #143's hourly limit or back-off holds
it off, the check does not wait for it: it spends the seat the gate chooses (proposal, decision
36).

**It runs on haiku** (Adam, 2026-10-18): the skill list does not depend on the model, and
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
(proposal, decision 19).

**It refuses a plugin directory that holds more than skills** (proposal, decision 19). Before
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

Under `--add-dir` a repository's same-named skill replaced the pinned one, and Adam accepted
stopping an item whose repository ships one. Under `--plugin-dir` no skill replaces the pinned
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
  `<skills_dir>` (Adam, 2026-10-19, on #153), since bug-hunter's instructions Read files beside
  its `SKILL.md`. A skill's entry, on a server and under `igor run`'s fallback alike, is a link
  into a clone outside `<skills_dir>`; whether a Read grant on `<skills_dir>` reaches the files
  behind the link is #153's to measure.
- **Each step invokes its skills through the Skill tool**, as `igor:prose` or `igor:bug-hunter`,
  since no call passes `--bare`.
- **Hooks.** The install wires none, and the startup check refuses a plugin that could declare
  one, so prose's hook that blocks a
  session's first file write until prose's first call has run never runs in a worker.
- **Prose's first call is Igor's own** (Adam, 2026-10-18, on #153): Igor runs it as the service
  user and gives the rules and the pass token to the step in its prompt. Nothing of prose's
  lives in the worker's home, so the reset needs no exception for it.
- **The pinned commit must carry what #153 calls.** #153 needs prose's `sign` to take
  `--goals-file`, as `check` already does; shared-skills #27 added that option to `sign`, and
  merged on 2026-10-21. `prose start` still exists in shared-skills, but #153 no longer calls
  it, so the pinned commit need not carry the editing hook `prose start` opens in a session
  (Adam, 2026-10-19, on #153; task 0.2).

### With #144 (`--bare` as the default)

No call passes `--bare`, and nothing here changes how a seat authenticates. #144's risk stands:
if `--bare` becomes the default for `claude -p`, Igor must opt out explicitly, or every call
stops running as a seat.

### With #143 (`seat-from-stream`)

The seat probe is a `claude -p` and carries `--plugin-dir` like any other call. Under `igor
serve`, where a seat is due a probe, the startup check is the first probe Igor makes (proposal,
decision 28), so the check's
reading is recorded as #143 records a probe's, and #143's limits on probes count it. #143's switch of
triage to `stream-json --verbose` changes the output flags, not this one. One argument builder
for every call keeps the probe's arguments and every other call's from drifting apart (task
2.1). That builder also gives the probe
`--setting-sources user`, without which a probe run from a directory under a home that holds a
`.claude` loads that home's skills as project skills (measured 2026-10-18).

`runUsage` in `src/budget.ts` reads a seat's `/usage`. `igor serve` runs it in the budget gate
(`src/wiring.ts`), and `igor budget` runs it too. #143 withdraws `igor observe` but keeps
this read. **Decided by Adam, 2026-10-17: it carries no `--plugin-dir`.** It runs no skill, so
the flag gives it nothing. And on a person's machine, where `igor budget` runs it, `skills_dir`
names a server path that does not exist there, and what `claude -p` does with a missing plugin
directory is unmeasured. It still passes `--setting-sources user` and `--strict-mcp-config`,
like every call. Under a token, `/usage` printed no window percentages (measured 2026-10-18,
above), and #143 removes this read, `runUsage` with it, in the first change built after #171's
code lands (#143's decision 37).
