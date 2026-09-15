# Igor

AI teammates that find their own work, claim it in the open, and draw on what the team
has already learned.

An Igor is a named teammate, and what it can do is the roles it holds — Milton might hold
both backend and frontend. What an Igor is *not* is a person: nothing durable lives inside
one. Run five processes of Milton, kill four mid-week, and nothing is lost. The roles are
versioned in git and the knowledge belongs to the team.

## Vocabulary

- **Igor** — a named teammate, identified by its own account on the surfaces it works, so a
  claim says who has your issue. Defined by the roles it holds; any distinct combination is
  a distinct Igor. Its processes are interchangeable and hold no durable state.
- **Role** — a versioned config: what to watch for, what it may claim, how to behave. Roles
  compose, and a role may narrow what it inherits but never widen it.
- **Lore** — the team's curated store of learned knowledge. Shared by every Igor,
  readable and editable by humans, versioned in git.
- **Claim** — a public announcement, in the team's own tools, that an Igor has taken a
  piece of work. Humans and other Igors can see it and act accordingly.

## How it works

Igors poll rather than wait for triggers. Each cycle:

1. **Search** — deterministic queries against whichever surfaces the role watches, through
   pluggable adapters. GitHub first, because nearly every team has it; Linear and Discord
   follow. No model involved.
2. **Triage** — free predicates over the normalized candidates first, then a model call on
   whatever survives. The cheap stage carries nearly all of the reduction.
3. **Claim** — before starting, the Igor posts to the relevant surface so humans and other
   Igors know it is working, and can back off or join in.
4. **Work** — a frontier model does the task in a disposable checkout, with the team's lore
   already in context. It edits files; the loop decides what becomes of them, so the action
   space holds even if the worker is steered.
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
`destination: .`, and **commit it** — which repositories are in scope, who reviews, and who
counts as an expert are shared decisions, and uncommitted they drift between whoever runs the
tool until an entry scores differently depending on whose machine computed it.

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
  --body "The hook handles caching, deduping, and cancellation on unmount." \
  --into ../candidates   # a candidate for review, rather than straight into the store

# --author takes several names, to cite a cluster of comments rather than one. --url and --at
# pair to each author positionally: give one per author or omit them entirely, since a partial
# list would silently attach a url to the wrong person. --at defaults to today.
igor create \
  --claim "..." --prose "..." \
  --author sarah jose \
  --url https://example.invalid/pr/1 https://example.invalid/pr/2 \
  --at 2026-03-14 2026-03-20

igor list       # entries with support and newest evidence, derived from provenance
igor validate    # reports every invalid entry, exits non-zero if any
```

`--into <dir>` writes to `<dir>/entries/`, which is where `propose --from <dir>` reads — so
the two compose without you laying the directory out yourself. Without it the entry lands in
the store, where `propose` will not take it as a candidate.

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

A deletion is permanent: the next `reconcile` writes `rejected/<id>.md` into the store, keeping
the candidate's claim and provenance so a later reader can see what was turned down, and
nothing proposes that id again while the record stands. **Delete that file to un-reject** — a
rejection is undone the same way it was made, by removing a file in a pull request.

## Roles

A role is a YAML file under `roles/` in your lore repository, and the filename is its name.
It declares `extends`, `seat`, `sources`, `lane`, `instructions`, `completion`, `allow`,
`commands`, `budget_share` and `reviewers`. Roles compose, and a role may narrow what it
inherits but never widen it — `igor role explain <name>` prints the effective merge with the
level each value came from.

```yaml
# roles/frontend.yaml
seat: pool:engineering
sources:
  - tracker: github
    repo: org/web
    query: "is:issue is:open label:ai"
allow: [draft-pr, comment, unassign]
commands:
  - "npm test:*"
  - "npx tsc --noEmit"
reviewers: [sarah]
```

`commands` is what the worker may run. Declare none and it can edit files and nothing else —
which means it cannot build, test or type-check its own change, and will tell you so in the
transcript rather than verifying. The list is read from the role and never from the repository
being worked: that repository's own settings are a file the worker can edit, and an allowlist a
worker can widen is not one.

A role may drop a command it inherits and not add one, the same rule `allow` follows. Narrowing
means an entry its parents already list, spelled the same way: whether `npm test` is narrower
than an inherited `npm *` is a question only a matcher can answer, and a role that can argue
its way to one command can argue its way to all of them.

The worker is spawned with an environment written out rather than inherited — a search path, a
home directory, the host's proxy settings, and the token of the seat it spends. No `GH_TOKEN`
and no other seat's token, because the worker has no use for either: it edits files in a
disposable clone, and claiming, commenting and publishing all happen afterwards in the loop.

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

A role's `seat` names one of these: a seat id, for an Igor that must never borrow, or a pool
id for one that may. Either may be written `pool:engineering`; the prefix reads better and is
not what decides which is looked up. Where seats are declared, every role must name one —
by omission or by typo, an Igor would otherwise spend from the first pool declared, which
nobody chose for it and which may be a person's. Both fail at load. Declare no seats at all
and budget is not enforced, and roles need not name one.

**Pool order is the allocation mechanism.** An Igor takes the first seat with headroom, so
listing dedicated seats first means personal capacity is only ever borrowed once the dedicated
seats are spent.

A role's `budget_share` is a **ceiling**, not a reservation: several roles may declare the same
one, an idle role holds nothing back, and adding an Igor requires editing no other role. Each
seat's reserve is enforced separately, so no ceiling however generous reaches a person's floor.

## What it costs, and what the numbers actually were

Measured, not estimated. Small samples — treat them as orders of magnitude.

### The funnel

Two live repositories, an `is:issue is:open` query, and a lane admitting items under a year old:

| | `BrightID/BrightID` | `cli/cli` |
|---|---|---|
| returned by the query | 159 | 1000 (GitHub's cap) |
| already had work in flight | 1 (0.6%) | 71 (7%) |
| survived an `age ≤ 365d` lane | 1 | 237 |
| **updated in the last day** | **0** | **5** |

The last row is the one that matters. **Lane predicates do nearly all the reduction** — the
free in-flight skip removes almost nothing on a quiet repository — and **the watermark does the
rest**, turning a few hundred candidates into a handful a day. Without it, a cycle re-triages
its whole backlog every time.

Paths named in issue text are rare — 14% on `cli/cli`, 1.3% on `BrightID/BrightID` — so a
`paths.under` lane is weak on a repository that discusses symptoms rather than files.

### Per item

| stage | cost | time |
|---|---|---|
| discovery | free (one GraphQL call, rate-limit cost 1 per 25 issues) | ~1s |
| reading a seat's usage | free, no tokens | ~0.4s |
| triage, per candidate | **~$0.016** | ~10s |
| execution, per item | **$0.05 – $0.37** | 11 – 60s |

Triage cost is driven by *output*, not input: each verdict emits 700–1600 tokens because the
model reasons its way there. A trivial prompt costs $0.003 and misleads by fivefold.

Execution across four real items averaged **$0.12**. The spread is not predictable from triage:

- a one-line CI version bump — **$0.05**
- a small React fix needing the worker to read around the code — **$0.37**
- **declining** a vague report, after investigating it properly — **$0.23**

That last one is worth internalising. **Refusing well is not free**, and it can cost more than
succeeding: the worker still has to clone, read, and satisfy itself there is nothing to do.
Triage had already spent $0.016 letting it through.

### Intervals

**These are still guesses.** Nothing observed so far has moved them, and saying otherwise
would be worse than admitting it:

| interval | default | what would change it |
|---|---|---|
| settle | 10s | two Igors racing; nothing has raced yet |
| cooldown | 60m | someone finding a stopped item comes back too soon, or too late |
| poll | 10m | latency mattering, or rate limits biting |
| cold-start look-back | 7d | a first run finding nothing, or too much |

## Setting up a lore repository

Any repository works; it just needs to be somewhere other than this one. Igor refuses a config
found inside its own installation, because Igor is shared and the config describes one team.

The state branch lives here too, so it has to be a repository the Igor can push to.

1. **Create and clone it.** Public or private both work. Public means the `publicStore` guard
   refuses entries whose provenance cites a private repository, which is the point of it.

2. **Copy the config and commit it.**

   ```sh
   cp path/to/igor/igor.config.example.yaml igor.config.yaml
   ```

   Set `destination: .`, list `reviewers` and `experts`. Commit it — who reviews and who counts
   as an expert are shared decisions, and uncommitted they drift between whoever runs the tool
   until an entry scores differently depending on whose machine computed it. Nothing in the
   file is secret: `token_env` names a variable rather than holding a token.

3. **Declare a seat.** Without one an Igor can triage but cannot work, and a seat without
   `token_env` reads fine and cannot pay for anything — `igor budget` says so where it applies.
   [`docs/seats.md`](docs/seats.md) is the page to send whoever's subscription it is.

4. **Write `roles/org.yaml` and one role.** The org file holds what every role inherits — the
   action space, the completion behaviour, the lane exclusions, standing instructions. A role
   names its `sources` and narrows whatever it needs to. See [Roles](#roles).

5. **Check it before running anything.**

   ```sh
   igor role explain <role>   # the effective merge, and which file each value came from
   igor budget                # every seat, read live
   igor run <role> --plan     # what it would claim, claiming nothing
   ```

`entries/` and the state branch are created when first needed; neither wants making by hand.

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

Working end to end against live repositories: discovery, triage, claiming, execution, handoff,
budget, and a loop that runs on an interval. Verified by real runs that opened real pull
requests and, more usefully, by runs that correctly declined to.

Not built: any tracker but GitHub, lore retrieval (nothing reads the lore yet), conversation
beyond `stop`, and concurrent Igors. Linear looks strictly better than GitHub for claiming —
app identities cost no seat and there is a parallel `delegate` field — but that rests on an
untested assumption about whether an app may delegate to itself.

Every interval is still a guess. See the costs section for what has actually been measured.

