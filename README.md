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

## Installing

Igor is not on npm yet, so it is built from a clone and linked onto your path:

```bash
git clone https://github.com/adamstallard/igor.git
cd igor
npm install
npm run build
npm link          # puts `igor` on your PATH
```

`npm unlink -g igor` removes it. Without linking, `npm run igor -- <command>` from the clone
does the same thing and needs no build.

Every command below assumes `igor` is on your path.

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
igor create \
  --claim "Fetch data with the shared query hook rather than inside useEffect" \
  --prose "When adding or changing data fetching in a React component" \
  --author you --scope role:frontend --path 'src/**/*.tsx' \
  --body "The hook handles caching, deduping, and cancellation on unmount."

igor list       # entries with support and recency derived from provenance
igor validate    # reports every invalid entry, exits non-zero if any
```

An entry's id is a slug derived from its claim and then frozen, so rewording a claim later
never moves what other entries point at. Dates may be written unquoted.

## Review

Entries reach the store through pull requests, and **only `active` entries fire** — so review
is what puts an entry into force, not a formality afterwards.

```sh
igor propose --from <dir of candidates>   # one PR per dominant author
igor reconcile                            # promote merged, report the rest
```

In a proposal pull request: **delete** a file to reject it, **edit** one to amend it, **merge**
to accept the rest, **close without merging** to defer. You can merge your own proposal —
GitHub won't let you *approve* your own pull request, but merging is what counts as approval
here, so a single maintainer is never stuck.

## Budgets

An Igor spends a Claude subscription seat. It asks that seat how much is left, through that
seat's own token, whenever the answer matters — so there is nothing to submit, nothing to keep
up to date, and no way to read one seat and charge another.

```
$ igor budget
seat             window    used  reserve  headroom  resets
igor-1           session    17%       0%       83%  Sep 13 at 8pm (America/Los_Angeles)
igor-1           week       12%       0%       88%  Sep 18 at 4pm (America/Los_Angeles)
                 wk:Fable    0%
adam             session    17%      50%       33%  Sep 13 at 8pm (America/Los_Angeles)

pool engineering: igor-1 has 83% of the session left
```

- **used** — how much of that window is gone, read live.
- **reserve** — the share of a seat Igors will not touch, so you never sit down to find your
  capacity spent. Dedicated seats reserve nothing.
- **headroom** — what is left after the reserve. A seat is usable only when **both** windows
  have some: the session limit bites first, the weekly one bites longest.
- **wk:** rows — per-model weekly limits. Igor does not enforce these, and shows them so that a
  fleet concentrated on one model does not exhaust a limit nothing reported.

### Configuring seats

```yaml
budget:
  seats:
    - {id: igor-1, dedicated: true, token_env: IGOR_SEAT_1}
    - {id: adam, owner: adam@example.com, reserve: 0.5, token_env: IGOR_SEAT_ADAM}
  pools:
    - {id: engineering, seats: [igor-1, adam]}
```

`token_env` names the environment variable holding that seat's token, from
`claude setup-token` run while signed in as it. A seat naming a variable that is not set is
reported unreadable and skipped — Igor will not fall back to whatever login happens to be
around, because reading one seat and spending another is the mistake worth making impossible.

**Pool order is the allocation mechanism.** An Igor takes the first seat with headroom, so
listing dedicated seats first means personal capacity is only ever borrowed once the dedicated
seats are spent.

A role's `budget_share` is a **ceiling**, not a reservation: several roles may declare the same
one, an idle role holds nothing back, and adding an Igor requires editing no other role. Each
seat's reserve is enforced separately, so no ceiling however generous reaches a person's floor.

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
igor init-workflow
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
