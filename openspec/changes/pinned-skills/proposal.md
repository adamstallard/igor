## Why

Igor's model steps run skills: #153 (`signed-publishing`) has a worker run `prose` and
`bug-hunter`. Today `claude -p` finds skills only in the service user's `~/.claude/skills`, at
whatever version was last installed there, and a same-named skill in the worked repository
runs in its place.

Issue [#152](https://github.com/adamstallard/igor/issues/152) decides the fix: Igor loads its
skills from one pinned directory that it names on every call, holding a copy of the shared
skills changed only on purpose. The issue named the directory with `--add-dir`; decision 1
replaces it with `--plugin-dir`. Decisions are numbered in `design.md`'s *Decisions*.

## What Changes

- **`skills_dir` is `/opt/igor/skills`, or `IGOR_SKILLS_DIR` from the server's environment**
  (decision 12): an absolute path to a plugin directory. It holds `.claude-plugin/plugin.json`,
  which names the plugin `igor`, and the skills under `skills/`, installed by the shared-skills
  manager. Igor adds no installer. Where it does not exist, `igor serve` refuses, and `igor run`
  builds a plugin directory for the run from the skills the person installed (decision 20).
- **Every `claude -p` Igor spawns carries `--plugin-dir <skills_dir>`**: the worker, triage, and
  every later step, never with `--bare`. The usage read is one exception (decision 10); an
  `igor run` that finds no skill the role lists or Igor's own code runs is the other (decision
  20).
  Each skill loads as `igor:<name>`, and the worker invokes it through the Skill tool. A skill
  named the same in the home directory loads under its own name beside it; one in the worked
  repository does not load (decision 8). Every skill installed under `skills_dir` loads for
  every role; a role's `skills` list (#153) decides which skills its worker is told to use and
  whose results Igor's code verifies, and, under `igor run` without `skills_dir`, which of the
  person's installed skills are linked, beside the skills Igor's own code runs (decision 37).
- **No call loads the worked repository's settings** (decision 8), **and every model step in
  the worker's home starts from a reset `~/.claude` and `~/.claude.json`** (decisions 9 and
  31). With a
  worker user, Igor kills every process that user owns before every reset (decision 13).
- **Before its first model call, Igor confirms each installed skill loads.** It reads the skill
  list from the `system/init` event of a `claude -p --model haiku` call made with an empty
  `HOME` and one seat's token. Under `igor serve`, where a seat is due a probe at start, that
  call is the seat's first probe, and its reading is the seat's first (decisions 5, 18 and
  28).
- **The pinned shared-skills commit is at or after `075a73a`** (shared-skills #19), where every
  skill finds its scripts from its base directory, `<skills_dir>/skills/<name>`.

## Capabilities

### New Capabilities

- `pinned-skills`: where Igor's skills come from, how every model call loads them, and the
  check that they load.

### Modified Capabilities

- `task-execution`: the requirement *Execution obtains a disposable working tree through one
  seam* and its scenario *No state carries between tasks* name the three kinds of file a worker
  writes that can reach a later task: what the reset leaves in its home, what the user it runs as
  writes outside the home, and, in same-user mode, what a process that left its process group
  writes in the home after a reset (decision 15).

The flags are added to calls owned by `task-execution` and `work-triage`, but the rules cover
every call, so they live in one place, `pinned-skills`.

## Impact

- `src/execute.ts` (`claudeWorker`, and the home and its reset), `src/triage.ts` (`runClaude`),
  `src/budget.ts` (`runUsage`), and `src/wiring.ts` for `skills_dir` and the startup check.
- **#153** depends on this change. #153's design writes the skills directory as `<skills>`, which
  is `<skills_dir>/skills`: Igor's code runs prose's and bug-hunter's scripts from there, and the
  worker is granted none of them (#153). Its role-config requirement refuses a role that lists
  a skill not installed under `skills_dir`, in every command that runs a model step; this change
  refuses nothing on that account. Under `igor run`'s fallback (decision 20), the installed
  skills that check reads are the person's. #153 runs no `prose start`, the call that opened prose's editing hook in a worker's session,
  and needs prose's `sign` to take `--goals-file`, as `check` already does (Adam, 2026-10-19,
  on #153). Shared-skills #27 added that option to `sign` and merged on 2026-10-21, so the
  pinned commit must be at or after that merge (task 0.2).
- **#171** (`seat-files`) archives after this change, in issue #204's order, but its code is
  built first (decision 30). Decision 17 rests on it (design.md's *Open Questions*, the ambient login).
- **#143** withdraws `scheduled-observation`, whose `igor observe` reads usage under a stored
  login, which decision 17 forbids. This change assumes #143 has archived. With a token in its
  environment, the usage read printed no window percentages on 2026-10-18 (`design.md`), and
  #143 removes it in the first change built after #171's code lands (#143's decision 37);
  decision 10 applies to it until then.
- **#175** (`worker-user`) archives before this change (#204): the startup check's prompt goes on
  stdin, as #175's *A prompt reaches claude on stdin, never in its arguments* requires.
- **#82** (`stopped-scope-visible`): the startup check's refusal exits with status 78, as #82's
  *A process that refuses to start exits with status 78* requires.
- **#143's seat probe**, the call that reads a seat's windows from its `rate_limit_event`, and
  **#144's startup self-test** are `claude -p` calls, so they carry the flag. The skills check
  runs once per start, not once per seat. Under `igor serve`, where a seat is due a probe, it
  is that seat's first probe (decision 28): its reading is recorded as the probe's, and #143's
  limits on probes count it.
- `docs/deployment.md` gains the install procedure: a root-owned plugin directory outside the
  service's writable paths, filled by the manager from a clone at a fixed commit.
- **#144's risk stands:** if `--bare` becomes the default for `claude -p`, Igor must opt out
  explicitly.
