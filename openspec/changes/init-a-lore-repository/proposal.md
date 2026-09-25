## Why

Setting up a lore repository is six steps and **one of them is a command**. The five that are
not include every security decision. From the README's
[Setting up a lore repository](../../../README.md#setting-up-a-lore-repository):

1. Create and clone a repository — manual.
2. `cp path/to/igor/igor.config.example.yaml igor.config.yaml`, set `destination: .`, list
   `reviewers` and `experts`, commit — manual, and it needs you to find your clone of Igor.
3. **"Write `roles/org.yaml` and one role"** — from nothing.
4. Branch protection: enable *require a pull request*, do **not** enable *require approvals* —
   manual, in the GitHub UI.
5. `igor init-workflow` — the one command, and it writes one file.
6. Add the Actions actor to the ruleset's bypass list — manual, in the GitHub UI.

**Step 3 is the worst of them.** `roles/org.yaml` holds `commands` — what a worker may execute
with a seat's credential in its environment. It is the most consequential file in the setup and
it is the one with no template. `templates/` ships exactly one file,
`reconcile-on-merge.yml`; `igor.config.example.yaml` documents `commands` without supplying a
role file; and the README's only YAML example is a *role*, not the org file.

So the natural move is to copy the role example, whose `commands` is two lines — `npm test:*`
and `npx tsc --noEmit` — with no git in it at all. That is how an operator ends up with an Igor
that cannot delete or rename a file and nothing saying why: `allowedTools` is built from
`role.commands` and nothing else (`src/execute.ts`), and no file tool deletes.

**The shipped default is a security decision made once on everyone's behalf**, which is why it
is written as a requirement and reviewed as text before it is code.

**And the layout is now required rather than merely conventional.**
[#111](https://github.com/adamstallard/igor/pull/111) refuses a `destination` resolving below
its repository's root. A command that writes `igor.config.yaml` with `destination: .` therefore
has to write it *at the root* — anywhere else and the scaffolder's own output is a config the
loader refuses.

## What Changes

**`igor init`**, run inside an existing repository the way `git init` and `npm init` are. Two
added `lore-store` requirements.

**What it writes**, at the root of the enclosing repository:

- `igor.config.yaml` from the shipped example, `destination: .` already set, `reviewers` and
  `experts` present as commented placeholders;
- `roles/org.yaml` from a new `templates/org.yaml`, carrying a real `commands` list, `allow`,
  `completion` and the lane exclusions;
- one role stub whose `sources` is commented, because nobody can guess the query;
- the reconciliation workflow, at the path `init-workflow` writes today. That command is
  **retired**: `init --force workflow` replaces that piece alone.

`templates/` is already in `package.json`'s `files`, so a new template ships on npm with no
other change, and the workflow writer already reads from `join(igorRoot(), 'templates', …)`.

**The default `commands` list, and why each entry.** What a worker's own tools cannot do:

- `git rm:*`, `git mv:*` — the only way to remove or rename a tracked file. `git mv` stages
  both sides, so `changes()` reads a rename rather than an unrelated add and delete.
- `git log:*`, `git show:*`, `git blame:*` — why the code is as it is. In a project whose whole
  culture is recorded reasoning, a worker that cannot read history works blind.

Deliberately **excluded**, stated in the requirement rather than left to taste: `rm:*`
(unscoped — it can leave the repository, which `git rm` cannot); `git commit:*` and
`git push:*` (the design is *worker edits, Igor publishes*; a worker that can push routes
around the unnameable-name refusal, the conflict-marker check and the revert guard); `node:*`,
bare `npx:*`, `curl`, `sh`, `bash` (the worker's environment holds the seat's token). `cat`,
`grep` and `find` are redundant rather than dangerous: `commands` governs Bash alone, and the
worker keeps Read, Edit, Write, Grep and Glob regardless.

**`git rm:*` and `git mv:*` are only useful once a removal survives publication.** Before
[#88](https://github.com/adamstallard/igor/pull/88), a worker could produce a deletion and the
publish path dropped it — the work done, the seat spent, and nothing in the artifact saying a
file was meant to go. So the requirement makes those two entries conditional: active where a
removal reaches the artifact, and otherwise shipped commented with a note naming what unlocks
them. **#88 has merged and archived, so the condition is met and they ship live.** The
conditional wording stays because it is what kept the requirement correct across that landing.
`design.md` argues the fork.

**Three things it must not do**, all requirement-level:

- **It must not create the repository.** That is `gh repo create`; a scaffolding command that
  makes repositories is a different and more dangerous tool. It refuses inside a clone of Igor
  for the same reason the loader does: a config resolving inside the installation is refused
  whether or not a file is there, so writing one there scaffolds a repository that cannot load
  its own configuration.
- **It must not change branch protection or the ruleset bypass list.** Those are outward-facing
  repository settings, and a command whose job is writing files must not mutate who may push to
  `main`. It prints what remains; checking it belongs with
  [#110](https://github.com/adamstallard/igor/issues/110).
- **It must not overwrite.** Each existing file is skipped and named, the rest are still
  written, and the run succeeds — so re-running after adding a role is safe. `--force <target…>`
  overwrites exactly what it names and nothing else, and refuses when given no target.

**And it says what it cannot do.** `reviewers`, `experts`, the seat with its token source, and
a role's `sources` query are things only the operator knows. `init` gets them from *write three
files from nothing* to *fill in four values in files that already exist and explain
themselves* — worth stating plainly rather than implying one command produces a runnable Igor.

## Capabilities

### Added Capabilities

None. Both requirements are added to `lore-store`.

### Modified Capabilities

- `lore-store`: two added requirements — one for what `igor init` writes into a repository,
  including the shipped org role's default action space; one for what it leaves alone, namely
  the repository's existence, its protection settings, and any file already there.

**Why `lore-store` and not `role-config`.** The test is whose requirements in force would have
to be reworded because `init` exists. Every `role-config` requirement reads identically either
way — "a role is a file whose name is its identity", "a role declares sources, lane,
behaviour, permissions, and reviewers", the merge semantics: `init` writes role files, it does
not change what a role *is* or how one is read. `lore-store` is where the surface `init` makes
operational already lives: *Configuration belongs to the team's repository, not the tool's*
(the file `init` writes and where it belongs), *The lore destination is configured and bounded*
(the `destination: .` it sets), and *Entries can be created, validated, and listed from a CLI*
(the shape of an Igor command over the store). Nothing in either spec mentions `init-workflow`
today — it shipped under `lore-store`'s tasks alone — so the argument rests on the config
requirements rather than on a sibling.

## Impact

- An operator goes from three files written from nothing to four values filled into files that
  exist and explain themselves. Steps 2, 3 and 5 of the README's six collapse into one command;
  1, 4 and 6 stay manual, because none of them is a file to write.
- The action space every worker starts with becomes a reviewed default instead of whatever an
  operator copied out of a role example. An Igor set up this way can remove and rename files
  and read history, and still cannot commit, push, or run an interpreter with the seat's token
  in its environment.
- **`init-workflow` is retired**, replaced by `init --force workflow`. Nothing else existing
  changes behaviour, and no config that loads today stops loading. Retiring it costs nothing
  now and would cost something later: Igor is unpublished, so the only store that predates
  `init` is the one this repository's author runs, and re-running `init` there writes what is
  missing and names what is not.
- Documentation follows in this change's tasks: the README's setup section collapses, its
  **Roles** section gains the org file it has never shown, and `architecture.md` §5.0.3 points
  at the shipped template from the paragraph that already explains `commands`.
