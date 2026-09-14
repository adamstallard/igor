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

This is the design. Only the lore half exists today — see [Status](#status).

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

Lore is not a wiki and not a vector index over everything. It is a curated set of lessons,
each carrying the conditions under which it applies, its provenance, and how many independent
episodes support it.

Entries arrive as pull requests and only take effect once merged — **only `active` entries
fire**, so review is what puts a rule into force. They can be written by hand or mined from
what actually happened: corrections, surprises, reverts, repeated questions. Entries that
stop firing are pruned.

Store size is not the constraint; **firing volume** is. A handful of entries reach a worker
per invocation, which is independent of how many exist — so unlike an always-loaded context
file, lore pays no tax for growing.

Two indexes will be compiled from it: exact predicates over metadata (paths, labels, repos)
and learned conditions over the recognizer's internal state. Both return entries; neither
requires an Igor to think to ask. Neither is built — retrieval lands with the first Igor.

## Getting started

```sh
npm install
npm run build
```

**The config does not live here.** Igor is a shared public tool; the config describes *your
team*. Copy `igor.config.example.yaml` into the repository that holds your lore, set
`destination: .`, and **commit it** — which repositories are in scope, who reviews, who counts
as an expert and the decay half-life are shared decisions, and uncommitted they drift between
whoever runs the tool until an entry scores differently depending on whose machine computed it.

The tool refuses to start if it finds a config inside its own installation, and otherwise
searches upward from the current directory the way git does — so running it anywhere inside
your lore repository just works. `-c <path>` and `IGOR_CONFIG` override.

One caveat for a public lore repository: the `publicStore` guard rejects privately-sourced
*provenance*, but a config that merely lists private repositories in scope would publish those
names.

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

## Budgets and calibration

An Igor spends a Claude subscription seat. The provider does not publish that seat's cap in
dollars, so Igor cannot look it up — a person tells it, once, and Igor derives the rest.

### Doing it

Run `/usage` in any Claude Code session signed in as that seat. It shows a 5-hour figure and a
weekly figure. Give Igor both:

```bash
igor budget calibrate --seat igor-1 --five-hour 42 --weekly 18
```

Igor already knows what its own work has cost, so a percentage plus that spend implies a cap.
Nothing is ever learned by hitting the limit.

Add the reset times if `/usage` showed them — a handoff can then say when capacity returns
rather than reporting the Igor as simply unavailable:

```bash
igor budget calibrate --seat igor-1 --five-hour 42 --weekly 18 \
  --five-hour-resets 2026-09-14T02:00:00Z
```

### When to do it

Igor asks. `igor run` and `igor budget` print a line for any seat that is uncalibrated or whose
reading has gone stale, ending with the command to run. You should not have to remember.

Calibrate a seat once when you add it, and again when the notice appears. A reading older than
30 days is still governing when work stops, which is why the notice exists.

### What the numbers mean

```
seat            window   cap    spent  reserve headroom  calibrated
igor-1          5h       $2.58   $0.05   $0.00   $2.53  0d ago
adam            5h          ?   $0.00      ?      ?  never
```

- **cap** — derived from your reading, not measured.
- **reserve** — the fraction of a shared seat Igors will not touch, so you never sit down to
  find your capacity gone. Dedicated seats reserve nothing.
- **headroom** — cap less reserve less trailing spend.
- **`?`** — never calibrated. Igor will not use that seat: unknown headroom is not permission.

**The derived cap is deliberately low on a shared seat.** Igor's ledger counts only Igor's
spend, so your own usage pushes the percentage up without Igor seeing the cost, and the implied
cap comes out under the real one. Igor stops earlier than it strictly must, which is the
harmless direction to be wrong in.

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
