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

### Two things a mention can ask for beyond an answer

**Filing an issue** stays inside the narrowing rule because it is a role action like any other.
There is no such action today — `ACTIONS` in `src/role.ts` is `comment`, `review-comment`,
`draft-pr`, `pr`, `label`, `assign`, `unassign`, `close`, `merge`, `send` — so it needs one, and a
role that does not grant it declines. The requester could open the issue themselves, which is
what makes filing it on their behalf grant nothing.

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

**Whether a per-thread exchange cap stands (raised 2026-10-06).** `docs/architecture.md` §5.4
said to cap exchanges per thread at two or three. This change rejects any count (*Roads not
taken*), and task 5.3 tests that a fourth question is answered. §5.4 now lists the cap as open
under *Not built*, with [#162](https://github.com/adamstallard/igor/issues/162). *Recommend:* keep
the rejection and delete the cap from §5.4. A count bounds a proxy for budget, and GitHub issue
comments have no thread to count within. The runaway exchange it was meant to stop is the
moderation item above, which a count would not fix.

**How an App Igor learns it was mentioned (raised 2026-10-04).** The mentions source queries
mentions of the Igor's own account, and on GitHub that account is now an App's bot. GitHub
search for `mentions:dependabot[bot]` and `mentions:github-actions[bot]` returned 0 results on
2026-10-04, against 3.9 million for `mentions:dependabot`. Searching by the bot's login finds
nothing, and whether a person's `@<app-slug>` reaches the App by search or notification is not
measured. Both additions above depend on it. *Recommend:* measure it with a real Igor App before
gate two (task 8.9), and adjust the first requirement to what is found.
