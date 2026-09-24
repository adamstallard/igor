## Context

The requirement is one sentence: a `destination` resolving below the root of its repository is
refused **when the configuration is loaded**. The *what* left nothing to design. The *how* did,
because the only way to know where a directory sits inside its repository is to ask git, and
`src/config.ts` had no subprocess in it and a `loadConfig` that is synchronous throughout. The
requirement therefore forces a choice the requirement itself does not imply, and this file
records which one and why.

## Decisions

### The check runs in `loadConfig`, after `resolveConfig` returns

`resolveConfig` is the pure parser: it takes a parsed mapping and a directory and answers from
paths alone. `loadConfig` is the loader: it finds the file, reads it, and hands the result to
`resolveConfig`. The refusal belongs to the loader.

**This is where the plan was measured wrong and the measurement won.** The expectation going in
was that `loadConfig` was the only interesting caller, since `test/store.test.ts` calls it twice
and both expect a throw before the destination is ever resolved. What the callers actually show
is the reverse: `resolveConfig` is called from three test files against directories that are not
git repositories and in one case do not exist at all —

- `test/store.test.ts:221`, `{ destination: '../knowledge' }` from `/tmp/team/config`, asserting
  only that the path resolves;
- `test/config.test.ts`, three times, `destination: '.'` against a bare `tempDir`;
- `test/documented-config.test.ts`, once per documented YAML block, same pattern.

Putting a git question in `resolveConfig` would have broken all of them and made every parse of
a documented config block create a repository first. That is a large cost paid by the parser's
own contract — it stops being answerable from paths alone — to catch a case no internal caller
reaches, since `src/config.ts:132` is the only call to `resolveConfig` inside `src/`.

**The known gap.** `resolveConfig` is exported from `src/index.ts`, so a library caller that
builds a `Config` through it rather than through `loadConfig` skips the refusal. That is
accepted: the spec asks for the refusal at configuration load, the tool itself always loads, and
a caller assembling a `Config` by hand can already set `destination` to anything at all.

**Ordering against the other destination refusal** (`tasks.md` 2.6) falls out of the placement.
`isInside(destination, igorRoot())` stays in `resolveConfig` and therefore runs first: a
destination inside the Igor installation is reported as that, not as a prefix within Igor's own
repository, which is what it would become if the git question were asked first. The two errors
are distinguishable by their opening clause — *"resolves inside the Igor installation"* against
*"sits at `<prefix>` within its repository"*.

### `execFileSync`, not an async `loadConfig`

`storePrefix` on `origin/store-prefix` is `async`, over the promisified `execFile` that
`src/github.ts` uses. Making `loadConfig` async to match was the alternative, and it was
rejected on blast radius rather than on taste:

- 13 call sites in `src/cli.ts` would each need an `await`. They are inside `parseAsync` action
  handlers, so this would have worked — the ripple is real but not a correctness trap.
- `loadConfig` is exported from `src/index.ts`. Returning a promise is a breaking change to the
  package's public API, made for one `git rev-parse`.
- `loadConfig` is synchronous by construction — `findConfig`, `existsSync`, `readFileSync`. One
  `await` in it would make it the only async thing in the file and force every caller to be
  async for a call that takes milliseconds and that nothing else can usefully overlap with.

`execFileSync` keeps the signature. It is `config.ts`'s first subprocess and the codebase's
first synchronous one — `src/gh.ts` uses `spawn`, `src/github.ts` promisified `execFile` — so it
is worth naming rather than letting it arrive unremarked.

**The cost, stated plainly.** Every command that loads a config now shells out to git once,
including `validate` and the other commands that never touched git before. Two consequences:

- A destination that is not a git checkout now fails at load, where before it only failed when
  something reached for the remote. That is the requirement, not a side effect.
- `git` becomes a load-time dependency of every command. It was already a runtime dependency of
  every command that reaches GitHub, and Igor's whole store is a git repository, so this widens
  an existing requirement rather than adding one.

### One `rev-parse`, three questions

`--show-prefix` is empty at a repository's root — and also in a **bare** repository, and also
anywhere inside a **gitdir**. Two of those three are not places a store can be, so the prefix on
its own cannot decide. `rev-parse` answers multiple flags in the order given, one line each, so
the extra questions cost no extra subprocess. Measured on git 2.54.0, with
`--is-bare-repository --is-inside-work-tree --show-prefix`:

| destination | bare | in work tree | prefix | verdict |
| --- | --- | --- | --- | --- |
| repository root | `false` | `true` | *(empty)* | accepted |
| `<root>/ lore` | `false` | `true` | `` ` lore/` `` | refused, named |
| linked worktree root (`git worktree add`) | `false` | `true` | *(empty)* | accepted |
| submodule's working directory | `false` | `true` | *(empty)* | accepted — see below |
| bare repository | `true` | `false` | *(empty)* | refused |
| `<root>/.git`, `<root>/.git/refs` | `false` | `false` | *(empty)* | refused |
| `<root>/.git/modules/<sub>` | `false` | `false` | *(empty)* | refused |
| not a repository, or a path git cannot enter | — | — | — | exit 128, refused |

A bare repository is refused for having no work tree: the store is files on disk, and there is
nowhere in a bare repository for them to be. A gitdir is refused because git ignores everything
under one, so a store there could never be committed at all — and `--is-inside-work-tree` rather
than `--is-inside-git-dir` is what catches it, because a submodule's gitdir sets `core.worktree`
and so reports `--is-inside-git-dir false` while still being no place for files.

**`-C <dir>` is the whole question, so the redirecting environment variables are removed from the
child.** `GIT_DIR`, `GIT_WORK_TREE` and `GIT_COMMON_DIR` each make git answer about a different
repository than the one `dir` is in, and a nested destination then reports an empty prefix and is
accepted. git exports `GIT_DIR` to `filter-branch` and `submodule foreach`, and a person can
export it in a shell. `GIT_CEILING_DIRECTORIES` and `GIT_DISCOVERY_ACROSS_FILESYSTEM` are left
alone deliberately: they only bound the search upward from `dir`, so they can cause a refusal and
never an acceptance.

**A failure that produced no exit code is not the destination's fault — and one that never
reached a spawn is.** `execFileSync` sets `status` to `null` when the child ran and produced no
exit code (git absent from `PATH`, not executable, killed by a signal) and leaves it `undefined`
when the call threw before spawning at all, which is what a destination containing a NUL byte
does. The first says *git could not be run*, matching what `src/gh.ts` already says of `gh`; the
second is the destination being a string git cannot be handed, and falls through to the message
below, which names the destination. Widening the first branch to cover `undefined` as well —
which an earlier draft did — tells somebody to check their `PATH` when their `destination` is
malformed.

**Exit 128 carries git's own line.** It covers "not a git repository", a path git cannot change
into, a permission failure, and **dubious ownership** — which is a valid store at its own root
that git declines to read, on a bind mount, a network share, a CI container, or a checkout owned
by another user. Telling that user "not inside a git repository" is false, and the one command
that fixes it (`git config --global --add safe.directory …`) is in git's stderr and nowhere else.
So stderr is captured rather than discarded and quoted in the `ConfigError`, which is also what
`src/gh.ts` already does with `gh`'s stderr. The message says what is true in every case — git
could not say where the destination sits — and lets git say why.

**An answer that does not parse is refused, not defaulted.** Three questions must come back as at
least three lines. An earlier draft returned `''` for a missing prefix line, which reads an
unparseable answer as "at the root" — the one outcome `tasks.md` 2.3 says must not happen.

### The prefix is the last field, taken raw

`stdout.replace(/\n$/, '')`, `split('\n')`, and the prefix is **everything after the fixed
answers** — `lines.slice(2).join('\n')`, not `lines[2]`. git emits the path raw, and a directory
name may legally begin with a space or contain a newline. Trim it and `" lore/"` becomes
`"lore/"`, naming a directory that is not the store. Take one line of it and a directory named
`"\nlead"` yields an empty prefix, so a nested store is **accepted as a root** — silent
acceptance rather than a wrong name, which is the worse of the two.

**What the measurement contradicted.** `tasks.md` 2.2 says the guard is `stdout.replace(/\n$/,
'')` rather than `.trim()` on the whole output, and carries a regression test from
[#107](https://github.com/adamstallard/igor/pull/107) as proof. That was true on #107, where
`rev-parse --show-prefix` was asked alone and its output was a single line. It is **not** true
here: adding `--is-bare-repository` in front makes the output multi-line, so the leading space
sits after a newline where `String.trim()` cannot reach it, and the carried-over test went green
under exactly the mutation it was carried over to catch. Measured: with `out.trim()` substituted,
the whole of `test/store.test.ts` passed.

The plan was right about the danger and wrong about which line guards it. What guards it now is
the parse itself: three fixed answers are required, so `out.trim()` at a root yields two lines
and the config is refused rather than accepted. Both mutations — `out.trim()` and a `.trim()` on
the prefix field — are now red.

## What was salvaged, and what was not

`origin/store-prefix` — the branch of the closed #107 — carried `storePrefix` in `src/github.ts`
as an exported async helper, because its job there was to prepend the prefix to every GitHub API
tree path. That job is dissolved by this change: once the store is always at the root, the tree
paths in `propose.ts` and `reconcile.ts` are correct as written.

So what is salvaged is the primitive and the two findings around it — the newline handling and
the refusal outside a repository — not the helper's home or its signature. It lands as a private
synchronous function in `src/config.ts`, the only place that now asks the question, plus the
bare-repository question that #107 never needed to ask because it was translating paths rather
than deciding whether a directory was a root.

## Accepted, with the reasoning written down

**A submodule's working directory is accepted.** It reports `--is-inside-work-tree true` with an
empty prefix, which is literally correct: a submodule is a repository of its own, with its own
remote and its own history. But it sits physically inside the host's working tree, so one of the
error message's own reasons — *archiving or transferring the project takes the team's lore with
it* — applies to a destination the check lets through. Left accepted, because refusing it would
mean deciding that a repository is not a repository when something else contains its directory,
and because the ownership argument that matters most (access follows the host) does not hold: a
submodule has its own remote and its own permissions. Recorded rather than silently allowed.

**`resolveConfig` is not covered.** Stated above, repeated here because it is the other thing a
reader will want to find in one place: the refusal is in `loadConfig`, so the exported
`resolveConfig` does not make it.

## What the bug hunt changed, and what it left

Three iterations, seven findings, all reproduced, all put past a separate refuter, all fixed and
mutation-checked. Four of them are already argued above, because they are why the code has the
shape it has: the gitdir refusal, the environment scrub, the prefix parse, and git's own line on
exit 128. Three more are worth recording here because they are about the *change*, not the
mechanism.

**The salvaged regression test stopped guarding what it was salvaged for.** Recorded above under
the parse. The general shape is worth keeping: a test carried across a change that alters the
*shape* of what it observes can keep passing while guarding nothing, and only mutation shows it.

**A fix can be a regression.** The "git could not be run" branch was added in the second
iteration and made the NUL-byte destination worse than before it existed — the single branch it
replaced at least named the destination. The third iteration caught it. That is the reason the
iteration that fixes something is never the last one.

**Left accepted, with the reasoning written down** (as well as the submodule, above):

- **A destination inside a repository whose `core.worktree` points at a subdirectory is
  accepted.** git genuinely makes that directory the top of the work tree, so `--show-prefix` is
  empty and the answer is correct; it is the same mechanism as the submodule.
- **`core.bare = true` on a repository that has a work tree** reports the bare message for a
  nested path. A repository git itself refuses most operations in.
- **Nothing pins `stdio: ['ignore', 'pipe', 'pipe']`.** Dropping it would leave git's fatal line
  printed twice — once by the child on the inherited descriptor, once inside the `ConfigError`.
  The code is right; the only assertion that would catch a change needs to observe the test
  process's own file descriptor 2, which this suite has no way to do in process, so it is
  reported rather than tested.
