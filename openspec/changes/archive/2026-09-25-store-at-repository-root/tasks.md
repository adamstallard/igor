## 1. The requirement

- [x] 1.1 Modify `lore-store`'s "Entry files are markdown with frontmatter, named by id" so the
      store is at the root of its repository, under the configured `destination`, required and
      with no default, keeping `entries/` beneath it, the `id` + `.md` filename, and locatability
      from a supersession pointer or provenance reference
- [x] 1.2 Carry both scenarios unchanged in name — "Entry written to disk" and "Entry located by
      id" — since a `MODIFIED` block that drops one is refused at archive; reword the first to
      `<destination>/entries/<id>.md`, which is what `store.ts` produces
- [x] 1.3 Add a scenario for the refusal: a `destination` below the root of its repository fails
      at config load, naming the path within the repository and why the root is the only place a
      store may be
- [x] 1.4 Say in the proposal that this **narrows** what was permitted, and that supporting
      nesting properly was rejected on ownership, visibility, lifecycle, scope and automation
      rather than on effort
- [x] 1.5 Reword `lore-store`'s "The lore destination is configured and bounded" so its opening
      clause no longer presupposes a path inside a repository, keeping the independence the
      sentence exists for, and carrying all three of its scenarios unchanged — otherwise the
      capability holds two requirements that disagree about whether a store has a path

## 2. The check at config load

Gate two on this branch, not part of the specification push. The whole implementation is one
check: the destination's prefix within its repository must be empty.

- [x] 2.1 Salvage `storePrefix` from `origin/store-prefix` (`src/github.ts`, the branch of the
      closed [#107](https://github.com/adamstallard/igor/pull/107) — closed PRs keep no diff, so
      read the branch). It shells `git -C <dir> rev-parse --show-prefix`, which returns the path
      from the repository root to `<dir>` with a trailing slash, and **empty at the root**
- [x] 2.2 Keep `stdout.replace(/\n$/, '')` rather than `.trim()`. `--show-prefix` emits the path
      raw and terminates it with one newline; trimming eats a **leading space** in a directory's
      name, so a destination `<repo>/ lore` yields the prefix `lore/`, which names a directory
      that is not the store. A bug hunt on #107 found this and left a regression test
- [x] 2.3 Refuse a destination that is not inside a git repository, as `storePrefix` already
      does — reading an unknown prefix as the root is the one outcome that must not happen
- [x] 2.4 Handle the bare repository: `git rev-parse --show-prefix` exits 0 with **empty output**
      in a bare repository, so the primitive alone reads a bare repo as the root. The check needs
      a second question — `--is-bare-repository`, or that the destination is inside the work tree
      — before it treats empty output as "at the root"
- [x] 2.5 Refuse a non-empty prefix at config load, in `src/config.ts`, with a `ConfigError`
      naming the prefix and stating that a nested store takes the host repository's access,
      visibility and lifecycle
- [x] 2.6 Decide where the check runs relative to `isInside(destination, igorRoot())`, which is
      the config's other destination refusal, and keep the two errors distinguishable
- [x] 2.7 Tests for: root accepted, subdirectory refused with the prefix named, a directory whose
      name begins with a space, not a repository, and a bare repository

## 3. Checks

- [x] 3.1 `openspec validate --changes --strict`
- [x] 3.2 `npm test` unchanged from the base, this being a specification-only change
- [x] 3.3 Confirm no other in-force requirement names a default store path
- [x] 3.4 `npm test`, `npm run typecheck` and `npm run build` after the config-load check
