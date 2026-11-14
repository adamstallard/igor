## Why

`lore-store` says the store keeps its entries "under a configurable path (default
`lore/entries/`)". There is no such default and there never has been. `src/config.ts` refuses to
invent one, in the error it throws when the key is absent:

> `destination is required — lore belongs to the operating team, so there is no sensible default`

The clause is unchanged from `openspec/changes/archive/2026-09-13-lore-store/`, the first
archived change — written when the store was conceived as a `lore/` folder inside something,
before `destination` existed as a resolved absolute path with no default.

Correcting the default is not enough, because the wording that replaces it still permits the
store to sit in a subdirectory of a repository that is mostly something else. **A store below the
root of its repository is refused, not supported.** That is a narrowing: the in-force text
permitted the nested layout and in fact recommended it.

### Nesting fails on ownership

`config.ts` already states the principle, in the error above: *lore belongs to the operating
team*. A store nested inside a project repository belongs to the project instead, in five ways
that are not fixable from inside Igor.

- **Access follows the host repository.** Who may propose an entry becomes who may push to that
  project. A team with three repositories has one privileged repository whose contributors can
  add lore and two whose contributors cannot.
- **Visibility follows the host repository.** `publicStore` defaults to `isPublic(destination)`,
  so nesting in a public product repository silently makes the store public — and the provenance
  guard then refuses entries citing private repositories. The team learns this by having an entry
  rejected.
- **Lifecycle follows the host repository.** Archive, transfer or split the project and the
  team's lore goes with it, along with the `igor-state` orphan branch.
- **Scope breaks.** An entry declaring `scope: global` says it is *not* about one project. The
  README already names the failure: splitting by project "would fragment the `global` entries
  across repositories and leave anything spanning two with nowhere to live." A nested store is a
  per-project store by construction.
- **The automation cannot work cleanly.** `templates/reconcile-on-merge.yml` triggers on every
  push to the default branch with no file-diff gate, and the template explains why one is
  impossible: "a merge whose only content is a reviewer's deletion adds no entry file, and a gate
  on changed files skips exactly the merge that has a rejection to record." A nested store
  therefore means a reconcile job on every merge of a product repository, needing
  `contents: write` and the Actions actor on that repository's branch-protection bypass list.

### The narrowing costs nothing that is in use

The claim worth checking before narrowing is that no store is nested today. What the code shows
is stronger than a survey of operators: the two halves of Igor have disagreed about where the
store is **since the commit that introduced them**, and no failure ever surfaced it.
`855b74a` (2026-09-13, *Add propose and reconcile*) commits an entry to
`` `${ENTRIES_DIR}/${entry.id}.md` `` — a GitHub-API tree path, always relative to the repository
root — while the same `ENTRIES_DIR` is joined onto `destination` in `src/store.ts`. On
`origin/main` today the same disagreement stands at four sites, in `propose.ts` and
`reconcile.ts`. A nested store would have committed its entries somewhere the id gate never
reads, so a second proposal of the same claim would have overwritten the first. It was found by
reading, not by a report — which is only possible if nothing nested is running.

### The alternative was rejected on the costs, not on effort

Supporting nesting properly is a known, bounded piece of work:
[#107](https://github.com/adamstallard/igor/pull/107) implemented the API-side prefix and
[#108](https://github.com/adamstallard/igor/issues/108) recorded what remained in the workflow
template. Both are closed in favour of this change, and not because they were hard — #107 was
finished and green. They are closed because the layout they support is one no team should choose,
for the five reasons above, and every later feature would have to keep carrying a prefix through
the API side for it.

#108 is not postponed by this change, it is **dissolved**. `for dir in entries rejected` from the
repository root is the bug only while the store might be somewhere else; once the store is always
at the root, that line is correct as written and there is nothing left to fix.

## What Changes

**Two modified `lore-store` requirements.**

**"Entry files are markdown with frontmatter, named by id".** The store is at the **root** of its repository, under
the configured `destination`, which is required and has no default. Beneath the destination, one
markdown file per entry in `entries/`, named by the entry's `id` plus `.md`, so an entry is
locatable from a supersession pointer or a provenance reference. Both existing scenarios are kept
and the requirement's name is unchanged; the first now names the path the code produces,
`<destination>/entries/<id>.md`.

**A new scenario for the refusal.** A `destination` resolving below the root of a repository is
refused at config load, naming the path within the repository and why the root is the only place
a store may be.

**"The lore destination is configured and bounded".** Its opening clause reads *"the repository
and path entries are written to"*, which presupposes a path component inside a repository. Under
the new rule there is none: the destination is the root. The clause now says *"the repository
entries are written to, at whose root the store sits"*, keeping what the sentence is for — the
destination is read independently of anything else Igor is pointed at, so knowledge derived from
one repository can be stored in another. All three of its scenarios are carried unchanged and its
name is unchanged. Without this, the capability would hold two requirements that disagree about
whether a store has a path inside its repository, which is the drift this change opened by
complaining about.

**The implementation is a second gate on this branch**, not part of this change's spec push. One
check at config load, against `git rev-parse --show-prefix`. See `tasks.md`.

## Capabilities

### Modified Capabilities

- `lore-store`: the store is at its repository's root, under the required `destination`, and a
  destination below the root is refused at config load. This **narrows** the capability — the
  in-force text permitted a nested store and named `lore/entries/` as the default. "The lore
  destination is configured and bounded" is reworded in the same breath, so that no requirement
  is left describing a destination with a path inside its repository.

## Impact

- The spec, the README and `config.ts` agree on where a store lives: its own repository, at the
  root, one per team.
- A misconfiguration that would have quietly given the store a project's access, visibility and
  lifecycle now fails at config load with a message that says why.
- Nothing in use is broken: the nested layout has never worked on the GitHub-API side, so
  refusing it removes no working configuration.
- No code in this change. The config-load check lands separately on this branch.
