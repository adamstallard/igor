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
