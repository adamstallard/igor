## Why

`lore-store` says the store keeps its entries "under a configurable path (default
`lore/entries/`)". There is no such default and there never has been. `src/config.ts` refuses to
invent one, in the error it throws when the key is absent:

> `destination is required — lore belongs to the operating team, so there is no sensible default`

The clause is unchanged from `openspec/changes/archive/2026-09-13-lore-store/`, the first
archived change — written when the store was conceived as a `lore/` folder inside something,
before `destination` existed as a resolved absolute path with no default. Nothing broke, because
`store.ts` has honoured `destination` all along.

**The stated default is not a harmless leftover: it recommends the nested layout.** A store at
`lore/` inside a project repository is a store owned by that project, and the README tells
operators the opposite — `destination: .`, one store per team, a repository of its own. Two
documents in this repository disagree about what normal looks like.

**Nesting is a bad idea on its own merits**, which is the reason to correct the spec rather than
to make the nested layout work:

- Ownership follows the host repository. Who may propose an entry becomes who may push to that
  project.
- `publicStore` defaults to the host repository's visibility, so a public product repository
  silently makes the store public and the provenance guard starts refusing entries citing
  private repositories.
- Archiving or transferring the project takes the team's lore and its `igor-state` branch with
  it.
- Most of all, an entry declaring `scope: global` says it is not about one project. The README
  already names the failure: splitting the store by project "would fragment the `global` entries
  across repositories and leave anything spanning two with nowhere to live." A nested store is a
  per-project store by construction.

The nested layout's automated half is also still broken —
[#108](https://github.com/adamstallard/igor/issues/108): `templates/reconcile-on-merge.yml`
stages `for dir in entries rejected` from the repository root, and `init-workflow` writes the
workflow under the store where Actions never reads it. That is filed and is not addressed here.

## What Changes

**One modified `lore-store` requirement.** The store lives under the configured `destination`,
which is required and has no default. Everything else the requirement says is kept: one markdown
file per entry, in `entries/` beneath the destination, named by the entry's `id` plus `.md`, so
an entry is locatable from a supersession pointer or a provenance reference. Both scenarios are
kept; the first now names the path the code actually produces,
`<destination>/entries/<id>.md`.

**This does not forbid a nested destination.** `store.ts` reads and writes wherever
`destination` resolves, and [#107](https://github.com/adamstallard/igor/pull/107) is in review
to make the GitHub-API side honour it too
([#92](https://github.com/adamstallard/igor/issues/92)). The change removes a recommendation, not
a capability.

No code changes. This is a specification correction.

## Capabilities

### Modified Capabilities

- `lore-store`: the entry directory is located under the required `destination` rather than
  under a default path, matching `src/config.ts`, which refuses to have one.

## Impact

- The spec and the README agree on where a store lives.
- Nobody reads a recommendation to nest the store inside a project repository, which is the
  layout whose consequences the proposal lists and whose automation is broken (#108).
- No behaviour changes and no code is touched.
