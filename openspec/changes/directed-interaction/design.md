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
you look at this?" on an issue somebody holds — would be dropped silently by it. A mention that
gets an answer only passes that skip, because reading is not taking: the Igor answers, and
neither claims nor works the item, so the holder keeps it.

### Which mentions get work done (agents, 2026-11-02)

Decided by the agents coordinating this work, by combining requirements this change already had.
Adam lets them settle a question with only one option that fits the rest of the change, one
already answered, or one whose answer a proof backs or is cheap to reverse; such a decision
stands until he overrides it. Below, "Adam's rule" means that rule.

- A mention gets work done only from a person with write access (*A colleague with write access
  directs work*). Anyone else's mention gets no more than an answer (*A mention narrows what an
  Igor may do*), and under *A stranger's mention changes nothing* not even that.
- On an item another party holds, or an artifact the Igor did not author, every mention gets an
  answer only (*An answer on an artifact the Igor did not author is only an ordinary mention*).
- A mention that may only be answered passes triage's skip of held items, so *Asked for help on
  an item somebody holds* is answered. The `work-triage` delta modifies *An item held by another
  party is never a candidate* to say so.
- A reply to a numbered question (*An answer to a question the Igor asked may be acted on*) that
  mentions a different Igor than the one that asked is on an artifact that Igor did not author,
  so it gets an answer only (Adam's decision below).

### A different Igor mentioned in a reply answers only (Adam, 2026-11-02)

Adam chose this on 2026-11-02. His decision on
[#139](https://github.com/adamstallard/igor/issues/139) of 2026-09-27 and 2026-10-11 said that
mentioning another role's Igor in an answer routes the work to that role. Now it routes only the
question: that Igor did not author the artifact, so it answers and does no work. For that role to do the work, the person opens an
issue for it; they have write access, so they can. This keeps one Igor's word from acting on
another Igor's artifact, as #156 rules out for reviews (*Every Igor on GitHub is a GitHub App*,
below), and needs no claim on an artifact another Igor holds.

### An answer that acts takes a claim first

[#179](https://github.com/adamstallard/igor/pull/179)'s decision 62, Adam's of 2026-10-28: an
answer that opens an issue or acts on a chosen option takes a claim on the item first, as any
item does, since two of a role's processes answering would act twice. A plain reply claims
nothing; a second reply is harmless. The answer that files an issue does no work on it. The
issue enters discovery like any other, where any role whose query and lane admit it, the filing
Igor's included, may take it later.

### An answer delivers the fix; it does not describe it

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
semantics. The measurement read the endpoint's fields and tested no custom role; task 2.6
measures one before the permission read is built.

Per repository rather than per organization: the org is too coarse and would let someone with
read access to one repository direct work in it.

### Budget is the only limit

A count of exchanges bounds a proxy. Replies on a large repository cost more than replies on a
small one, and a fraction of the role's budget bounds the resource itself.

The role's budget is what its `budget_share` lets it spend from its seats in their current
window. `docs/architecture.md` spoke of a cycle's budget, but `seat-budget` defines none, so the
window is the only base a fraction can take. A role file declares the fraction as
`conversation_share`, merged monotonically like `budget_share` (agents, 2026-11-02, under Adam's
rule: one option fits, and nothing is built on it yet).

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
`draft-pr`, `pr`, `label`, `merge`, `send` — so `role-config` gains `issue`, and an Igor whose
role does not grant it declines. The requester could open the issue themselves, which is what makes filing it
on their behalf grant nothing.

**Acting on an answer is an exception to *speaking only*, and not to *widening*.** The narrowing
requirement has two clauses: a mention restricts the action space to what may be said, and it
never widens what the role permits. Only the first gives way. Every option was proposed by the
Igor, within its own role, before anyone replied; a reply chooses among them, which narrows the
set of things the Igor was ready to do and adds none. The monotonic-merge argument — that a
successful injection gains strictly less than the Igor could already do — therefore holds.

What would break it is reading the options back out of the artifact. A description is editable
by anyone with write access, so a question parsed from it is a question anyone could insert. The
options are read from the asking Igor's own record instead, written to the execution log on
the state branch when it posted them.

**Rejected: checkboxes in the description.** Considered for #139 and dropped. A ticked box
notifies nobody, and once an Igor publishes its claim is released, so nothing re-reads its own
pull request; REST exposes no edit fields at all, so who ticked it is only recoverable through
GraphQL's `userContentEdits`; and it parses decisions out of editable text. A comment is
attributable in REST, and a mention is what makes it visible.

### Every Igor on GitHub is a GitHub App (amended 2026-10-04)

[#156](https://github.com/adamstallard/igor/pull/156) settles that on GitHub every Igor is a
GitHub App, which claims an issue with its `igor:<role>` label and cannot be an assignee. So
wherever this change says an Igor claims or does not claim an item, the claim is that label.

**An Igor never has authority, measured.** On 2026-10-04 the collaborator-permission endpoint on
this repository returned `permission: none` and `push: false` for two installed Apps' bot
accounts, `dependabot[bot]` and `github-actions[bot]`. So under *Authority is
`permissions.push`*, a comment from an Igor never instructs another: it cannot have an issue
filed, and it cannot answer an Igor's question. That agrees with #156's rule that an Igor's
review never counts, and needs no identity test of its own.

**One Igor questioning another through a mention stays ruled out (decided 2026-10-04).** An App's
bot reads as having no write access (`permissions.push` false, measured above), so a mention from
an Igor gets no reply. Revisit only if someone needs it. An Igor's word acting on another Igor is what #156 rules out for reviews, and
allowing a reply but not an action would need the identity test this change avoided.

**No per-thread exchange cap (decided 2026-10-06 by Adam).** Conversation is bounded by budget,
not by a count of exchanges, and a fourth question is answered (task 5.3). A count bounds a proxy
for budget, and GitHub issue comments, where an Igor is asked things, have no thread to count
within. The runaway exchange a cap was meant to stop is the moderation question under Open, which
a count would not fix. `docs/architecture.md` §5.4 no longer lists the cap.

### How mentions are read, answered and recorded (agents, 2026-11-02)

Each settled by the agents under Adam's rule, as the one option that fits the rest of the change
or a rule already in force:

- **Authority is checked before the mentions source hands an item on.** Otherwise a stranger's
  mention would bring an item outside the role's query to triage.
- **A failed permission read is no write access.** `docs/architecture.md` §5.4 says to fail
  closed.
- **A surface may push mentions over a connection the Igor opened.** `work-discovery`'s *Nothing
  may require inbound reachability* forbids only an inbound endpoint, and a Discord bot's socket
  is not one.
- **A mention is answered once.** Every answer, including one that acts, ends with a reply from
  the role's bot account linking the mention, and that reply is what makes it answered. A
  claim only marks an answer under way: once a finished run releases it, the claim no longer
  shows anything, and without the reply an acted-on option could be acted on again. An issue
  that links the mention with no reply means the Igor stopped between filing and replying, so
  it posts only the reply, as `work-claiming` does for a chat message. A reply links the
  mention because GitHub issue comments have no reply-to, so the link is how a later cycle
  finds it. #179's decision 70 is about something else: when one of a role's processes, its
  ranks, may move its discovery watermark past a mention that another rank is to answer. It
  treats the mention as answered once a reply, a linking issue or the claim exists. This
  change's linking reply is one of those, so any mention this change counts as answered, #179
  counts as answered too.
- **An answer only is not a pickup.** `work-claiming`'s *An Igor claims before it starts* has
  every pickup claim before work begins. A plain answer produces a comment, no artifact, and
  takes no claim, as #179's decision 37 (Adam) has it; an answer that acts takes one.
- **A role without `comment` in `allow` answers nothing**, since an answer is a comment.
- **Mentions are searched only on the repositories the role works**, so a writer elsewhere, where
  the App is also installed, cannot bring an item to triage. A mention in an item's body counts,
  with the item's author as requester.
- **`conversation_share` unset leaves answering bounded only by the role's budget**, as an unset
  `budget_share` leaves a role bounded only by its seats. The execution log marks each run that
  answered a mention, so the share can be summed. Where the share is spent, the source holds its
  watermark back before the mention, so a later cycle answers it.
- **A stop wins over a request.** A comment that is a stop under `work-claiming` is read as that
  stop, even where it mentions the Igor.
- **A filed issue goes on the claiming tracker**, as `work-claiming`'s *An organization's Igors
  claim on one tracker* requires, and on GitHub in the item's repository, so a private
  repository's words stay in it.
  Before filing, the Igor looks for an issue that already links the mention, as `work-claiming`'s
  *An issue created from chat points back to the chat* does for a chat message. Every `@` it
  copies goes in a code span fenced with more backticks than any run in the copied words, so a
  backtick in them cannot end the span early and the issue notifies nobody.
- **A numbered question numbers each question and letters its options**, and a reply chooses
  with both, such as `2b`. Matching needs a form, and this one is short to type.
- **The question record, and a request's requester and words, go in the execution log on the
  state branch**, which every Igor reads, so the asker's record is there for any process of its
  role.

### Rules this change cites rather than restates

- Ingested content: `task-execution`'s *The worker receives standing instructions and the
  normalized item* delimits it as data. *A requester's words are ingested content* applies that
  rule to a mention and a reply.
- Stop: `work-claiming`'s *Stop is unconditional and open to anyone*.
- The wait after a question: `work-triage`'s *An item handed back is not re-worked until
  something answers*. The open change [#216](https://github.com/adamstallard/igor/pull/216)
  modifies it so that a reply does not lift the hold on an item handed back by a run #216 flags,
  and [#141](https://github.com/adamstallard/igor/pull/141) so that only a reply from someone
  with write access lifts a hold. A question waits as the version of that requirement in force
  says.
- A private repository's content: a requester's words reach the state branch only as an item's
  own content may, under [#220](https://github.com/adamstallard/igor/pull/220)'s guard against
  working a private repository through a public lore store, and with secrets redacted as
  [#217](https://github.com/adamstallard/igor/pull/217) redacts every state-branch write.

### Requirements another change also modifies

Whichever change archives second carries the other's text into its own copy:

- `role-config`'s *Merge semantics differ by field kind*: the open change `lore-from-corrections`
  adds `propose-lore` to `allow`; [#143](https://github.com/adamstallard/igor/pull/143) adds
  `reserve`; [#153](https://github.com/adamstallard/igor/pull/153) adds `skills`; and #153 and
  #216 exempt `igor lore-search` from `commands`. This change adds `issue` and
  `conversation_share`, and its copy already holds `propose-lore`.
- `role-config`'s *A role declares its sources, lane, behaviour, permissions, and reviewers*:
  #143, #153 and #216 each add keys to the list, and this change adds `conversation_share`.
- `work-triage`'s *An item held by another party is never a candidate*: #179 adds how a sibling
  process's item is passed over, and this change lets an answer-only mention through.

This change is not yet placed in [#204](https://github.com/adamstallard/igor/issues/204)'s
archive order, so it archives after all of them, and its copies must take in their text before
it does (task 9.1). A dry archive of every open change at its pushed head on 2026-11-02, in
#204's order and then the rest, refused this change only for that: its copies drop #179's
scenario *A sibling's item is passed over before triage*, and #216's and #153's scenarios on
`skills` and `igor lore-search`. With those three requirements removed from this change's deltas, the rest archived. A dry
archive refuses only a dropped scenario, so it cannot show a dropped key or sentence, such as
#143's `reserve`; task 9.1 checks the text.

This change compacts both `role-config` requirements under OpenSpec's 500-character limit, with
the same rules; the org base's safe default moved into a scenario.

## Roads not taken

**A per-thread exchange cap.** Rejected twice over: it bounds a proxy for budget, and on the
surface in use it has no unit. GitHub issue comments are a flat list with no thread, no
reply-to and no grouping; review comments have threads, but the place an Igor gets asked things
is the issue.

**Refusing bot accounts by an identity test.** Not needed. An App can write to the repository
through its installation, but the collaborator-permission endpoint reports its bot account as
having no write access, so *Authority is `permissions.push`* already gives an Igor's mention no reply. A test of
its own would be a second mechanism for the same outcome.

**Letting Igors question each other through mentions.** A frontend Igor asking a backend Igor
what an endpoint returns would beat the human relay it replaces. It is ruled out by the decision
of 2026-10-04 above: allowing a reply but not an action would need the identity test this change
avoids.

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

**A per-requester cap is [#162](https://github.com/adamstallard/igor/issues/162)'s.** #162 plans a cap on requests per requester per period and
modifies *Budget is the only limit* and the requirement *Conversation is bounded by budget, not
by a count of exchanges* itself, so this change leaves both as they are.

**Does a mention get an answer on an item with work in flight, or a closed one?** Only the skip of
held items lets an answer-only mention through. The skips of an item with work in flight, such
as an open pull request, and of a closed item still drop it, so "can you look at this?" on an
issue with an open pull request gets no answer. The reason for the held-item exception, that
reading is not taking, applies to both. Exempting them would modify *Items with work already in
flight are skipped*, which #179 and #150 already modify, and *A closed item is never a
candidate*. *Recommend:* exempt both for an answer only, giving this change its own copy of
*Items with work already in flight are skipped* that carries #179's and #150's text.
