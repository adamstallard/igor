# Igor

Role-instanced AI teammates that find their own work, claim it in the open, and draw on
what the team has already learned.

An Igor is not a person. It is an instance of a role. You can run five Igors on the same
role, retire one mid-week, and lose nothing — because nothing durable lives inside an
Igor. The role is versioned in git. The knowledge belongs to the team.

## Vocabulary

- **Igor** — a running instance. Interchangeable, disposable, holds no durable state.
- **Role** — a versioned config: what to watch for, what it may claim, how to behave.
  Many Igors can run the same role.
- **Lore** — the team's curated store of learned knowledge. Shared by every Igor,
  readable and editable by humans, versioned in git.
- **Claim** — a public announcement, in the team's own tools, that an Igor has taken a
  piece of work. Humans and other Igors can see it and act accordingly.

## How it works

Igors poll rather than wait for triggers. Each cycle:

1. **Search** — deterministic queries against whichever surfaces the role watches, through
   pluggable adapters. GitHub first, because nearly every team has it; Linear and Discord
   follow. No model involved.
2. **Recognize** — decide whether a candidate is in this role's lane, and which lore entries
   apply to it.
3. **Claim** — before starting, the Igor posts to the relevant surface so humans and other
   Igors know it is working, and can back off or join in.
4. **Work** — a frontier model does the task, with the fired lore already in context.
5. **Report** — status updates back to the same surfaces, including a graceful handoff if
   the Igor runs out of budget mid-task.

## Lore

Lore is not a wiki and not a vector index over everything. It is a small, curated set of
lessons, each carrying the conditions under which it applies, its provenance, and how many
independent episodes support it.

Entries arrive as pull requests and only take effect once merged — **only `active` entries
fire**, so review is what puts a rule into force. They can be written by hand or mined from
what actually happened: corrections, surprises, reverts, repeated questions. Entries that
stop firing are pruned.

Store size is not the constraint; **firing volume** is. A handful of entries reach a worker
per invocation, which is independent of how many exist — so unlike an always-loaded context
file, lore pays no tax for growing.

Two indexes are compiled from it: exact predicates over metadata (paths, labels, repos)
and learned conditions over the recognizer's internal state. Both return entries; neither
requires an Igor to think to ask.

## Getting started

The lore store is built; nothing else is yet.

```sh
npm install
cp igor.config.example.yaml igor.config.yaml   # then set a destination
npm run build
```

`destination` must resolve **outside** this repository — lore belongs to the operating team,
and the tool refuses to start otherwise.

**Where the config belongs.** It is gitignored *here*, because igor is the tool and the config
is per-installation. But it is shared team configuration — which repositories are in scope, who
the reviewers are, who counts as an expert, the decay half-life — so it should be **committed
to the lore repository**, with `destination: .`. Left uncommitted, every person configures it
separately and the values drift, and an entry scores differently depending on who ran the
command.

One caveat for a public lore repository: the `publicStore` guard rejects privately-sourced
*provenance*, but a config that merely lists private repositories in scope would publish those
names. Don't put private repositories in a public lore repo's config.

```sh
npm run lore -- create \
  --claim "Fetch data with the shared query hook rather than inside useEffect" \
  --prose "When adding or changing data fetching in a React component" \
  --author you --scope role:frontend --path 'src/**/*.tsx' \
  --body "The hook handles caching, deduping, and cancellation on unmount."

npm run lore -- list       # entries with support and recency derived from provenance
npm run lore -- validate    # reports every invalid entry, exits non-zero if any
```

An entry's id is a slug derived from its claim and then frozen, so rewording a claim later
never moves what other entries point at. Dates may be written unquoted.

## Review

Entries reach the store through pull requests, and **only `active` entries fire** — so review
is what puts an entry into force, not a formality afterwards.

```sh
npm run lore -- propose --from <dir of candidates>   # one PR per dominant author
npm run lore -- reconcile                            # promote merged, report the rest
```

In a proposal pull request: **delete** a file to reject it, **edit** one to amend it, **merge**
to accept the rest, **close without merging** to defer. You can merge your own proposal —
GitHub won't let you *approve* your own pull request, but merging is what counts as approval
here, so a single maintainer is never stuck.

## Setting up a lore repository

Any repository works; it just needs to be somewhere other than this one.

**Branch protection, once more than one person can write to it.** Enable **"require a pull
request before merging"** — it still lets an author merge their own proposal and only blocks
direct pushes to `main`. Do **not** enable **"require approvals"**: GitHub refuses to let
anyone approve their own pull request, so that setting hard-blocks a solo maintainer with no
workaround.

**Merge-triggered promotion, at the same time.** Without it, promotion depends on someone
having igor installed and remembering to run `reconcile` — so a teammate can merge lore that
then silently never fires.

```sh
npm run lore -- init-workflow
```

That writes `.github/workflows/promote-on-merge.yml` into the destination. Commit it. **If the
branch is protected, add the GitHub Actions actor to the ruleset's bypass list**, or the
workflow's own push is blocked by the same rule it exists to work around.

Neither is worth doing on a single-writer repository — both answer the same question, which is
what happens when someone other than the tool's owner merges, so add them together when that
becomes possible.

## Status

**Built:** the lore store and its review workflow — schema, validation, frozen slug ids,
provenance-derived scoring, supersession, the destination boundary, `propose`/`reconcile`,
merge-triggered promotion, and the CLI above.

**Next:** `core-igor-loop` — nothing yet consumes lore, which is where its value is. The first
Igor needs no lore at all, since a role config, the work item, and the codebase are three of
the four context channels.

**Deferred:** mining review history (`lore-from-reviews`) is specced but waiting. A spike over
one real repository turned 277 review comments into six entries worth keeping, so at that
scale hand-mining is cheaper than automating it. Revisit on a corpus where it isn't.

Design lives in [`docs/architecture.md`](docs/architecture.md); change proposals in
`openspec/changes/`.
