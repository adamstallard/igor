## Context

The moment an Igor posts a claim, people reply to it. Having no answer means the behaviour gets
decided by accident — an agent that ignores everyone, or one that can be talked into anything.

Almost every decision below started as a cap and ended as a deletion. That is the shape of the
thing: a conversational surface invites limits, and most of the limits turn out to be proxies
for budget, which is already bounded.

## Decisions

### Safety comes from narrowing, not from detection

Role permissions merge monotonically: a level may restrict what it inherits and may never widen
it. Make a mention able only to *narrow*, and mention handling becomes structurally incapable
of escalation — a successful injection through a comment gains the speaker strictly less than
the Igor could already do.

That is stronger than trying to recognise manipulation, and it costs nothing: the action space
is already enforced at the loop rather than in the prompt.

It also settles what would otherwise be a collision. An item held by another party is a
universal skip that no configuration can disable, and the most natural request there is — "can
you look at this?" on an issue somebody holds — would be dropped silently by it. Read-only
resolves that without an exception, because reading is not taking.

### Read-only delivers the fix; it does not describe it

The worker still investigates and still works out the change. A comment carrying it *is*
delivery, and for a small change beats a draft: read in the thread where the question was
asked, reasoning beside it, no branch for anyone to close.

It needs no plumbing. The worker knows what it would change, so the answer carries it — a
prompt variant, not a diff renderer.

Past some size this inverts, so the answer describes the change and offers a draft instead of
pasting it. Where that line sits is judgement, expressed as a standing instruction rather than
a count: a number would be wrong in both directions at once, too strict for a genuinely useful
long answer and too lax for a boring short one.

### Authority is `permissions.push` on the repository

Measured against the live endpoint. The response carries three things: a coarse `permission`
string, a `user.permissions` map of `{admin, maintain, push, triage, pull}`, and
`user.role_name`.

The string reports `admin` for an admin and `write` for a maintainer, so comparing it to
`"write"` excludes the people with the most authority. `permissions.push` is true for all
three.

GitHub does support fine-grained custom repository roles, and names them in `role_name` — but
every one still resolves to those booleans, so nothing has to map a role name onto Igor's
semantics.

Per repository rather than per organization: the org is too coarse and would let someone with
read access to one repository direct work in it.

### Budget is the only limit

A count of exchanges bounds a proxy. Replies on a large repository cost more than replies on a
small one, and the fraction of cycle budget bounds the resource itself.

A count is also aimed at the wrong party. Once a stranger gets no reply, the only conversation
partner left is a colleague with write access — whose fourth question is often the useful one,
because the first three established what the Igor actually understood.

### A request is screened like a discovered candidate

Only the entry point is new. A request that skipped the universal skips, which drop closed and
held items and items with work in flight, or skipped the lane or triage, would let a person have
an Igor do what its lane forbids just by asking for it. The rule that authority to instruct never
exceeds authority over the artifact would then have a way round it.

### Two things a mention can ask for beyond an answer

**Filing an issue** stays inside the narrowing rule because it is a role action like any other.
There is no such action today — `ACTIONS` in `src/role.ts` is `comment`, `review-comment`,
`draft-pr`, `pr`, `label`, `merge`, `send` — so it needs one, and an Igor whose role does not
grant it declines. The requester could open the issue themselves, which is what makes filing it
on their behalf grant nothing.

**Acting on an answer is an exception to *speaking only*, and not to *widening*.** The narrowing
requirement has two clauses: a mention restricts the action space to what may be said, and it
never widens what the role permits. Only the first gives way. Every option was proposed by the
Igor, within its own role, before anyone replied; a reply chooses among them, which narrows the
set of things the Igor was ready to do and adds none. The monotonic-merge argument — that a
successful injection gains strictly less than the Igor could already do — therefore holds.

What would break it is reading the options back out of the artifact. A description is editable
by anyone with write access, so a question parsed from it is a question anyone could insert. The
options are read from the asking Igor's own record instead, written when it posted them. That
same record is what makes routing work: a different Igor, mentioned in the reply, matches the
choice against the asker's record and acts within its own role.

**Rejected: checkboxes in the description.** Considered for #139 and dropped. A ticked box
notifies nobody, and once an Igor publishes its claim is released, so nothing re-reads its own
pull request; REST exposes no edit fields at all, so who ticked it is only recoverable through
GraphQL's `userContentEdits`; and it parses decisions out of editable text. A comment is
attributable in REST, and a mention is what makes it visible.

### Every Igor on GitHub is a GitHub App (amended 2026-10-04)

[#156](https://github.com/adamstallard/igor/pull/156) settles that on GitHub every Igor is a
GitHub App, which claims an issue with its `igor:<role>` label and cannot be an assignee. The
scenario for filing an issue therefore says the Igor does not *claim* it, where it said it does
not assign itself: an App cannot assign itself, and the label is what a claim would be. The
scenario for a mention on a held item, task 3.3 and the proposal say the same for the same reason.

**An Igor never has authority, measured.** On 2026-10-04 the collaborator-permission endpoint on
this repository returned `permission: none` and `push: false` for two installed Apps' bot
accounts, `dependabot[bot]` and `github-actions[bot]`. So under *Authority is
`permissions.push`*, a comment from an Igor never instructs another: it cannot have an issue
filed, and it cannot answer an Igor's question. That agrees with #156's rule that an Igor's
review never counts, and needs no identity test of its own. It also means the frontend Igor
asking a backend Igor, which *Refusing bot accounts* below wanted to keep, gets no reply under
the rule as written.

**One Igor questioning another through a mention stays ruled out (decided 2026-10-04).** An App's
bot reads as having no write access (`permissions.push` false, measured above), so a mention from
an Igor gets no reply. Revisit only if someone needs it. An Igor's word acting on another Igor is what #156 rules out for reviews, and
allowing a reply but not an action would need the identity test this change avoided.

**No per-thread exchange cap (decided 2026-10-06 by Adam).** Conversation is bounded by budget,
not by a count of exchanges, and a fourth question is answered (task 5.3). A count bounds a proxy
for budget, and GitHub issue comments, where an Igor is asked things, have no thread to count
within. The runaway exchange a cap was meant to stop is the moderation question under Open, which
a count would not fix. `docs/architecture.md` §5.4 no longer lists the cap.

## Roads not taken

**A per-thread exchange cap.** Rejected twice over: it bounds a proxy for budget, and on the
surface in use it has no unit. GitHub issue comments are a flat list with no thread, no
reply-to and no grouping; review comments have threads, but the place an Igor gets asked things
is the issue.

**Refusing bot accounts.** Written, then cut. It invented a mechanism one bullet after arguing
against inventing mechanisms, and it forecloses something worth having: a frontend Igor asking
a backend Igor what an endpoint returns beats the human relay it replaces.

**Forbidding Igor-to-Igor conversation.** The stated reason was cost, which is the argument
already rejected for people. The asymmetry that is real — two agents will not get bored of each
other — is a moderation question, not a rule here.

**Declining a stranger politely.** A decline is still a reply, and a reply anybody can trigger
is a reply anybody can trigger repeatedly. Silence grants nothing and costs nothing, and the
mention remains visible to the people who can act on it.

**Answering strangers on a public repository.** That is a different product. It is also a seat
anybody can drain by asking questions.

## Open

**What bounds a runaway exchange on a surface whose moderation cannot reach a collaborator.**
Discord and Slack moderate participants directly — mute, throttle, roles. GitHub offers locking
a conversation, which does not restrain a collaborator, and blocking an account, which is
nuclear. An Igor needs write access, so it sits on the wrong side of the only lock that bites.
Budget bounds the spend; nothing bounds the noise.

**How an App Igor learns it was mentioned (raised 2026-10-04).** The mentions source queries
mentions of the Igor's own account, and on GitHub that account is now an App's bot. GitHub
search for `mentions:dependabot[bot]` and `mentions:github-actions[bot]` returned 0 results on
2026-10-04, against 3.9 million for `mentions:dependabot`. Searching by the bot's login finds
nothing, and whether a person's `@<app-slug>` reaches the App by search or notification is not
measured. Every requirement that starts from a mention depends on it. *Recommend:* before
building the mentions source, measure with a real Igor App whether a person's `@<app-slug>`
reaches it (task 8.9), and adjust *An Igor learns it was addressed by being mentioned* to what is
found.

**Problems found on 2026-11-02 by spec-check's consistency read**, which checks this change
against every spec and open change. Each is left for this change's author, because resolving any
of them would change what the change builds.

- **A held item never reaches the worker.** A mention enters triage, and triage skips an item
  another party holds before any worker runs, so the scenario *Asked for help on an item
  somebody holds* cannot happen as written. Either a mention bypasses that skip, or the scenario
  goes.
- **Speaking only, or doing work.** *A mention narrows what an Igor may do* limits every mention
  to what may be said, while *A colleague with write access directs work* has a mention get work
  done. Nothing says which mentions are requests and which are questions.
- **Routing against authorship.** In *Mentioning a different Igor routes the answer*, the
  mentioned Igor acts on a pull request it did not author, which *An answer on an artifact the
  Igor did not author* limits to an answer.
- **A stranger's mention can still bring an item to triage.** The mentions query returns it, and
  nothing puts the authority check before the source hands the item on, so an item outside the
  role's query could be worked only because a stranger mentioned it.
- **Igor-to-Igor talk.** The decision above rules out one Igor questioning another through a
  mention, yet the proposal's *Igors may talk to each other*, and this design's *Roads not
  taken*, argue for allowing it.
- **A claim before an answer that acts.** #179 records Adam's decision of 2026-10-28 that an
  answer opening an issue or acting on a chosen option goes through a claim first. This change
  says a mention claims nothing and a filed issue is not claimed.
- **A per-requester cap.** #162 plans a cap on requests per requester per period; *Budget is the
  only limit* rules out any limit but budget.
- **Declining an out-of-lane request with a route, and answering people's questions about
  lore.** The proposal states both, but no
  requirement or task builds them, and `docs/architecture.md` lists them under #162.
- **Push delivery.** The scenario *No inbound endpoint* says an Igor learns of a mention never
  by being delivered to, which forbids what `work-discovery` allows: a push over a connection the
  Igor already holds, such as a Discord bot's.
- **Capabilities changed without a delta spec.** Opening an issue needs `role-config`'s closed
  `allow` set to grow; the open change `lore-from-corrections` also modifies that requirement,
  so the two changes would have to agree on its text. The conversation fraction needs a
  role-file key, and a role file refuses any key outside its set. The requester field, the
  permission read, the mention search and issue creation need `surface-adapter`.
- **Restated rules.** *Everything ingested is data* restates `task-execution`'s rule on ingested
  content, *Conversation is bounded by budget*'s sentence on stop restates `work-claiming`'s,
  and *The question waits for its answer* restates `work-triage`'s deferral, which #216 changes
  so that a reply does not lift a flagged hold. Each could cite the rule instead.
- **Filing an issue twice.** `work-claiming` checks for an existing issue before creating one
  from a chat message; filing from a mention has no such check, and the mention matches again
  every cycle.
- **Answering a mention twice.** The Igor's reply updates the item, so the item passes the
  watermark again at the next cycle. The mention still matches the query, and nothing records
  that it was answered, so the Igor would answer it again. A stop written as a mention
  would also be read as a request.
- **Untested rules.** No scenario covers organization membership not counting, delimiting
  ingested content, or a filed issue entering discovery.
- **Undefined terms.** *Cycle budget* and where its fraction is declared; where the question
  record lives so another Igor can read it; which repository a filed issue goes to; which record
  holds the requester; and the form of a numbered question.
- **Private content and copied mentions.** A requester's words from a private repository could
  reach the state branch, the git branch where Igor keeps its records, where that branch is
  public or a filed issue, an `@` copied into a filed issue notifies the person named, and no
  requirement says what happens when the permission read fails, where `docs/architecture.md`
  says to fail closed.
- **A claim no measurement covers.** *Authority is `permissions.push`* says every custom
  repository role resolves to the permission booleans; the measurement read the endpoint's
  fields, and no custom role was tested.
- **A premise the code contradicts.** Task 1.2a assumes `dropStopped`, the loop step that drops
  stopped items, fetches comments for every candidate left after screening. It fetches only
  comments within the stop window, and stops once it has kept enough candidates, so a mention
  outside those would need a fetch of its own.
