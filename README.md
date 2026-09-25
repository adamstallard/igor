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

An Igor does not forget a pull request once it has opened one. The base moves while the
artifact waits, and an artifact that stopped merging is the Igor's own unfinished work rather
than somebody else's work in review — so each cycle it asks the code host to merge the base
into its own artifacts that no longer merge. That is one request, and where the merge is clean
the Igor says nothing: the merge commit on the branch is the record, and a catch-up nobody had
to think about is not news. Where it conflicts, a worker resolves the files on the branch that
exists, so the pull request keeps its history and whatever review has accumulated on it. A
conflict it cannot resolve is handed back once, naming the artifact, and then left quiet until
somebody answers. It never touches a conflicting pull request somebody else opened.

[`docs/architecture.md`](docs/architecture.md) is the long form: why team memory rather than
per-agent memory, how recognition is meant to work, and what was considered and rejected.

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

What follows gets one Igor running on your own machine, on your own Claude subscription —
enough to watch it work and decide whether you want it. A fleet working for a team belongs on
a server, which is the better long-term arrangement and a different document:
[`docs/deployment.md`](docs/deployment.md). Nothing here is wasted when you move, because the
configuration is the same and only where the credentials live changes.

Igor is not on npm yet, so it is built from a clone and linked onto your path:

```bash
git clone https://github.com/adamstallard/igor.git
cd igor
npm install
npm run build
npm link          # puts `igor` on your PATH
```

`npm unlink -g igor-lore` removes it — npm knows the package by its name, not by the command
it installs. Without linking, `npm run igor -- <command>` from the clone does the same thing
and needs no build.

Every command below assumes `igor` is on your path, and that you are running it inside the
lore repository it works from. Igor finds its configuration by walking up from the working
directory, so a command run anywhere else reports no config rather than guessing at one.

## Setting up a lore repository

Any repository works; it just needs to be somewhere other than this one. Igor refuses a config
found inside its own installation, because Igor is shared and the config describes one team.

The state branch lives here too, so it has to be a repository the Igor can push to.

1. **Create and clone it.** Call it `lore` where the namespace already says whose it is, and
   `<team>-lore` otherwise. Nothing in Igor reads the name; the convention is for people.

   One per team or organization rather than per project. A project is something an entry
   declares — `scope: project:web` — so splitting the store by project would fragment the
   `global` entries across repositories and leave anything spanning two with nowhere to live.

   Public or private both work. Public means the `publicStore` guard refuses entries whose
   provenance cites a private repository, which is the point of it.

2. **Run `igor init` inside it**, the way you would `git init`.

   ```sh
   igor init
   ```

   It writes four files at the root of the repository you are standing in: `igor.config.yaml`
   with `destination: .`; `roles/org.yaml`, the action space every role inherits and the one
   file nobody should be writing from nothing; a `roles/maintenance.yaml` stub; and
   `.github/workflows/reconcile-on-merge.yml`. A file already there is named and left exactly
   as it is while the rest are still written, so running it again after adding a role is safe
   and adds only what is missing.

   Then fill in what only you know, which it names on the way out: `reviewers`, `experts` and
   a seat in `igor.config.yaml`, and `sources` in the role. Commit the lot — who reviews, who
   counts as an expert and whose subscription pays are shared decisions, and uncommitted they
   drift between whoever runs the tool until an entry scores differently depending on whose
   machine computed it. Nothing in the file is secret: `token_env` names a variable rather
   than holding a token.

   **The workflow is what makes promotion not depend on remembering.** Without it, promotion
   waits for someone with Igor installed to run `reconcile`, so a teammate can merge lore that
   then silently never fires. The job runs the same `reconcile` you would run locally, so it
   promotes what merged and records what a reviewer deleted — run `reconcile` yourself on a
   store without the workflow, or to read the report of proposals that have gone quiet.
   Exactly one job may promote lore on push: two of them race on the same commit and disagree
   about what a reviewer deleted, so delete any other workflow in `.github/workflows` that
   promotes or reconciles lore. Where a later Igor ships a new version of that file,
   `igor init --force workflow` replaces it and touches nothing else you have written.

3. **Branch protection, from the first commit.** Enable **"require a pull request before
   merging"** — it still lets an author merge their own proposal and only blocks direct pushes
   to `main`. Do **not** enable **"require approvals"**: GitHub refuses to let anyone approve
   their own pull request, so that setting hard-blocks a solo maintainer with no workaround.

   This is not a courtesy between collaborators, and a single-writer store needs it too.
   Promotion works by reconciling pull requests, so **an entry committed straight to `main`
   has nothing to promote it**: it stays `provisional`, and only `active` entries fire.
   Nothing reports it. You find out when lore you wrote never shows up in a prompt. For one
   already on `main` that way, `igor promote --by <you>` sets it active in place and records
   you as having approved it — a repair, run by hand.

4. **Add the GitHub Actions actor to the ruleset's bypass list**, if the default branch is
   protected — or the reconciliation workflow's own push is blocked by the same rule it exists
   to work around.

`entries/` and the state branch are created when first needed; neither wants making by hand.
`igor init` does not touch repository settings, which is why steps 3 and 4 are yours: a
command whose job is writing files must not decide who may push to `main`.

None of this needs a credential — authoring lore, proposing it and reviewing it work on a clone
and a `git` push. Credentials are what [Running an Igor](#running-an-igor) adds.

## Running an Igor

A lore repository needs no credentials. An Igor needs two, and neither belongs in the
repository.

1. **Give the Igor an account of its own.** A claim only says who has your issue if the Igor
   is somebody — run one as yourself and every claim says *you* took the work. So: a machine
   account per Igor, with write access to the repositories it works, and not a GitHub App —
   an App's bot user cannot be an issue assignee, so claiming degrades to a comment.
   [`docs/machine-accounts.md`](docs/machine-accounts.md) has the steps and the traps, both of
   which fail by being accepted and silently dropped rather than by erroring.

2. **Declare a seat and set its token.** A seat is a Claude subscription — trying this out,
   it is yours. In `igor.config.yaml`:

   ```yaml igor:config
   budget:
     seats:
       - id: me
         owner: yourhandle
         reserve: 0.5
         token_command: security find-generic-password -a "$USER" -s igor-seat-me -w
   ```

   Then `seat: me` on the role. Once any seat is declared every role must name one, and a role
   that does not fails at load rather than defaulting to a seat nobody chose for it. `reserve:
   0.5` keeps half your window for you. [Budgets](#budgets) covers pools and shares.

   A seat names *where* its token is, never the token itself, which is why the config stays
   safe to commit. `token_command` runs something and takes its stdout, `token_env` names a
   variable, `token_file` a path — never more than one. Igor reads whichever it names at the
   moment it runs and keeps nothing, so being signed in to `claude` yourself is not enough on
   its own.

   ```sh
   claude setup-token                                            # approve in the browser
   security add-generic-password -a "$USER" -s igor-seat-me -w   # prompts twice, echoes neither
   ```

   That is the whole setup: the config above reads that entry when it needs it. `secret-tool`,
   `pass` and `op read` substitute for `security` where there is no macOS keychain.

   `token_env` is the alternative, and on a laptop it costs a shell function to put the value
   somewhere igor can see — which is why `token_command` is the one to reach for here. Under a
   service `token_env` earns its place, because the unit supplies the variable. Exporting the
   token from a profile is the obvious thing and the wrong one either way: it puts a year-long
   credential in the environment of every process you start, a package manager's install
   scripts included. [Keeping the token out of your
   shells](docs/deployment.md#keeping-the-token-out-of-your-shells) has that comparison and the
   fallback for a machine with no secret store at all.

   **Do not set `CLAUDE_CODE_OAUTH_TOKEN` yourself.** That is the variable `claude` reads, so
   it authenticates everything igor spawns rather than the one seat you meant — including
   `igor observe`, which has to use your own login precisely because a seat token cannot report
   a window. Name the token in the config and let igor decide what sees it.

   A token placed in a service's environment stays there for the unit's whole lifetime, so
   `igor serve` under launchd or systemd wants more than a laptop does: an `EnvironmentFile=`
   supplying `token_env`, or — better, where systemd is available — `token_file` naming what
   `LoadCredential=` decrypts, which never touches an environment at all.
   [`deployment.md`](docs/deployment.md#adding-a-seat-somebody-has-given-you) has that, the
   naming convention for several seats, and why not `~/.zshrc` directly. Where the
   subscription is somebody else's, [`docs/seats.md`](docs/seats.md) is the page to send them.

3. **Check it.**

   ```sh
   igor role explain <role>   # the effective merge, and which file each value came from
   igor budget                # every seat, and what state each one is in
   igor run <role> --plan     # what it would claim, claiming nothing
   ```

   That run claims nothing, posts nothing, and writes nothing: the discovery watermark stays
   where it was, so looking at the backlog does not consume it. It is not free: triage is a
   model call, measured around four cents for a nine-candidate cycle.

4. **Leave it running.** Everything above is a command you run once; finding your own work is
   a loop.

   ```sh
   igor serve <role>    # poll on the role's interval until stopped
   ```

   From a terminal that lasts as long as the terminal does — enough to watch it work, not
   enough to rely on. [`docs/deployment.md`](docs/deployment.md) is the rest: systemd, Docker
   and launchd, what the host needs on its path, where credentials go, and what the failures
   look like.

## Creating an entry

`-c <path>` and `IGOR_CONFIG` override where the config is looked for.

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
to accept the rest, **close without merging** to defer. Merging is what counts as approval
here, so a single maintainer is never stuck reviewing their own proposal.

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

`roles/org.yaml` is the base every other role inherits without saying so, and it is where the
action space is decided for the whole team. `igor init` writes it with the git entries filled
in and your own build and test commands left commented, because a role may only narrow what it
inherits: a command named on a role and nowhere above it is refused rather than granted.

```yaml igor:role
# roles/org.yaml
allow: [draft-pr, comment, unassign]
completion: unassign
commands:
  - "git rm:*"                        # the only way to remove or rename a tracked file
  - "git mv:*"                        # stages both sides, so the change reads as a rename
  - "git log:*"                       # why the code is as it is
  - "git show:*"
  - "git blame:*"
  - "npm test:*"                      # yours, and here rather than on the role below
  - "npx tsc --noEmit"
lane:
  labels:
    excludes: [Human, wontfix]        # nothing below can drop an exclusion
instructions: |
  Leave the working directory as the change you would open yourself.
```

A role beside it names where to look and narrows the rest:

```yaml igor:role
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

The list is also stated in the worker's system prompt, so it knows what it may run instead of
discovering it by being refused. Patterns it cannot state plainly are shown as written.

A role may drop a command it inherits and not add one, the same rule `allow` follows. Narrowing
means an entry its parents already list, spelled the same way: whether `npm test` is narrower
than an inherited `npm *` is a question only a matcher can answer, and a role that can argue
its way to one command can argue its way to all of them.

The worker is spawned with an environment written out rather than inherited — a search path, a
home directory, the host's proxy settings, and the token of the seat it spends. No `GH_TOKEN`
and no other seat's token, because the worker has no use for either: it edits files in a
disposable clone, and claiming, commenting and publishing all happen afterwards in the loop.

**Point a role only at work that is text.** A file the worker changed is read back out of the
tree as UTF-8 and published as UTF-8, and a byte that is not valid UTF-8 is substituted rather
than rejected — so a PNG, an archive or anything else git treats as binary is published
corrupted instead of dropped, and nothing in the diff says so. Nothing refuses it, because no
role can reach a binary today; a role that could — one whose work produces images, or checks
fixtures in — is what would make that refusal worth building.
[`docs/architecture.md`](docs/architecture.md) §6.7.3 has the rest.

## Budgets

An Igor spends a Claude subscription seat. Where that seat's own token yields a reading it is
asked how much is left, whenever the answer matters. Where it does not — a `claude setup-token`
credential resolves no subscription, so the provider reports no windows against it — the seat is
bounded instead by observations recorded of it and spend recorded against it. Either way there
is nothing to submit, nothing to keep up to date, and no way to read one seat and charge
another.

```
$ igor budget
seat             window        used  reserve  headroom  resets
fleet-1          session        17%       0%       83%  Sep 13 at 8pm (America/Los_Angeles)  read live
fleet-1          week           12%       0%       88%  Sep 18 at 4pm (America/Los_Angeles)  read live
                 wk:Fable        0%
adam             session      $1.20      50%     $8.80  2026-09-19T09:19:00.000Z  within its bound — $8.80 left of $10.00; $20.00 capacity observed, from 6% used at 2026-09-19T04:28:55.803Z (usage)
adam             week             —      50%         —  2026-09-25T22:59:00.000Z  no capacity figure — the week has never been observed, and none is declared. Passed over while a 50% reserve stands against it: run `igor observe adam` on the owner's machine, or declare a capacity_estimate
                 !  seat "adam" carries no subscription, so no window is reported against it. The rows above are derived, not read.

pool engineering: fleet-1 has 83% of the session left
```

- **used** — how much of that window is gone. A seat the provider reports windows for is read
  live, in percent; a seat it does not is measured in dollars of Igor spend instead.
- **reserve** — the share of a seat Igors will not touch, so you never sit down to find your
  capacity spent. Dedicated seats reserve nothing.
- **headroom** — what is left after the reserve. A seat is usable only when **both** windows
  have some: the session limit bites first, the weekly one bites longest.
- **wk:** rows — per-model weekly limits. Igor does not enforce these, and shows them so that a
  fleet concentrated on one model does not exhaust a limit nothing reported.
- **the tail of each row** — what state that window is in, and what the figure rests on. A
  credential that cannot be read, a window nobody has observed, a window observed and still
  unbounded, a bound with room in it, a bound reached, and a window the provider refused are
  six different things, fixed by different people: one is a token, one is `igor observe` on the
  owner's machine, one is a declared `capacity_estimate`, and one is waiting. A derived figure carries
  the observation it came from and when that observation was taken, because headroom derived
  from a limit error an hour ago and headroom derived from a month-old reading are not the same
  claim.

### Configuring seats

```yaml igor:config
budget:
  seats:
    - {id: fleet-1, dedicated: true, token_env: IGOR_SEAT_FLEET_1}
    - {id: adam, owner: adam@example.com, reserve: 0.5, token_env: IGOR_SEAT_ADAM}
  pools:
    - {id: engineering, seats: [fleet-1, adam]}
```

A seat is a Claude subscription, not an Igor: several Igors draw on one through a pool and one
may draw on several. `token_env` names the environment variable holding that seat's token —
the name, never the value, so the config is safe to commit. `token_file` (a path) and
`token_command` (something to run and take stdout) name a token the same indirect way; a seat
may set exactly one of the three. Obtaining a token and installing it is
[`docs/deployment.md`](docs/deployment.md#adding-a-seat-somebody-has-given-you), and
[`docs/seats.md`](docs/seats.md) is the page to send whoever's subscription it is.

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

## Status

Working end to end against live repositories: discovery, triage, claiming, execution, handoff,
budget, lore fired into the worker's context per item, and a loop that runs on an interval.
Verified by real runs that opened real pull requests and, more usefully, by runs that
correctly declined to.

Not built: any tracker but GitHub, conversation beyond `stop`, and concurrent Igors. Linear
looks strictly better than GitHub for claiming — app identities cost no seat and there is a
parallel `delegate` field — but that rests on an untested assumption about whether an app may
delegate to itself.

Every interval is still a guess. See the costs section for what has actually been measured.

