## Why

A worker can read any file the Igor's service user can read
([#163](https://github.com/adamstallard/igor/issues/163)). Claude Code refuses its own Read tool
and `head` outside the tree, but a test file the worker writes in the tree runs under an allowed
`npm test` and reads whatever it likes. Measured on 2026-10-07, it printed a canary placed outside
the tree. The same route reads the per-role env file, the App's private key (#156), the seat
tokens, the age private key that decrypts seat files (#171), and, on Linux, the Igor's own
`/proc/<pid>/environ`.

A worker takes instructions from issue text, which anyone who can file an issue can write. With
the App's key they can mint installation tokens for every repository the App is installed on,
until the key is rotated.

Adam decided on 2026-10-11 that the worker runs as a separate Unix user. Of the directions in the
issue, it is the only one that doesn't depend on Claude Code enforcing anything.

## What Changes

- **The worker runs as a second Unix user**, named by `IGOR_WORKER_USER`. The Igor starts it
  through `sudo`, under a sudoers rule that lets the service user run commands as that one user
  and nobody else. The seat token reaches `claude` through its environment, never its arguments.
- **The worker gets its tree, its outbox, its seat token and its tools, and nothing else.** The
  tree and outbox are shared through the worker's group, of which the Igor is a member. The
  git directory sits beside the tree, the Igor's and read-only to the worker. `git rm` and
  `git mv` write an index copy kept in the outbox.
- **Nothing the worker writes is run or followed by the Igor.** The Igor runs git in a tree
  with hooks and fsmonitor off, reads no changed file through a symbolic link, and stops a run
  on a changed file it cannot read rather than dropping it.
- **A kill, a release and the startup sweep act as the worker user** where the worker's own
  processes and files need it.
- **Every start proves the isolation.** `run` and `serve` refuse to start, naming what is wrong,
  if the worker user is missing, privileged, or the Igor's own user, if `sudo` asks for a
  password, or if the worker can read a credential the Igor holds or write the lore checkout or
  the Igor's installation.
- **Without a worker user**, `serve` refuses to start unless passed `--same-user`, and `run`
  runs the worker as the same user with a notice. This is a recommendation, flagged for Adam.
- **Deployment:** `deploy/igor.service` gains the worker's group and home and drops
  `NoNewPrivileges`, which blocks `sudo`. A new `deploy/sudoers.example` and a section in
  `docs/deployment.md` cover creating the user. `claude` moves out of the service user's home,
  because the worker must be able to run it.

Not changed: triage and usage reads still run `claude` as the Igor, because triage allows no
tools and a usage read runs no item text. The worker's environment requirement keeps its
wording, and #156 modifies that requirement separately.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: seven requirements added. The worker runs as a separate user. It writes
  nothing the Igor runs. The Igor reads nothing through it. A kill and a release reach what the
  worker owns. The isolation is checked before any work. And the behaviour without a worker user
  is defined. No in-force requirement is modified.

## Impact

- `src/execute.ts` (`claudeWorker`, `workerEnv`'s caller, the kill), `src/worktree.ts`
  (provision, release, `changes()`), `src/sweep.ts`, `src/cli.ts` (`run`, `serve`), and a new
  module for the start-up probe.
- `deploy/igor.service`, `deploy/docker-compose.yml`, a new `deploy/sudoers.example`,
  `docs/deployment.md`, and a paragraph in `docs/architecture.md` §6.3.2.
- An operator upgrading must create the worker user, install the sudoers rule and move `claude`
  before `serve` starts again, or pass `--same-user`.
- `igor doctor` (#113) gains no check here; design.md says why.
