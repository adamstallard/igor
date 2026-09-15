## Why

The moment an Igor posts a claim, people reply to it. Having no answer for that means the
behaviour gets decided by accident — an agent that ignores everyone, or one that can be
talked into anything.

Both halves matter and they pull in opposite directions. Someone asking a legitimate
question deserves an answer; someone injecting instructions into an issue body must gain
nothing. This change handles both with one rule: **answering is cheap and changes nothing,
acting requires authority the speaker already holds.**

**Depends on `core-igor-loop`** — this cannot be tested before there are claims for people
to reply to.

## What Changes

- **An Igor replies when addressed, and only then.** Not to every comment on an item it
  claimed. Otherwise a busy pull request becomes a budget sink.
- **Answering is liberal; acting is strict.** It answers about its own work — what it
  claimed, why, current status, what it intends — and about lore. Acting on what it is told
  requires authority.
- **Authority to instruct never exceeds authority over the artifact.** Someone who cannot
  merge to a repository carries no weight instructing an Igor working in it. Injection by an
  outsider therefore gains them nothing they could not already do directly, which is a
  stronger guarantee than trying to detect manipulation.

  Authority is write access on the repository holding the artifact, not membership of the
  organization: the org is too coarse, and would let someone with read access to one
  repository direct work in it.

  Read it from `user.permissions.push`, never from the coarse `permission` string. Measured
  against the live endpoint: the response carries `permission`, a `user.permissions` map of
  `{admin, maintain, push, triage, pull}`, and `user.role_name`. The string reports `admin`
  for an admin and `write` for a maintainer, so comparing it to `"write"` excludes the people
  with the most authority. GitHub does support fine-grained custom repository roles and names
  them in `role_name`, but every one of them still resolves to those booleans, so no mapping
  from a role name to Igor's semantics is needed.

- **An Igor does not talk to strangers.** Answering anyone who can comment on a public
  repository is a different product, and it is a seat anybody can drain by asking questions.

  A mention from someone without write is not a refused instruction; it is not a signal. It
  grants nothing and takes nothing away, so the item still stands or falls on its own through
  ordinary discovery — a stranger pointing at a genuinely in-lane issue still gets it worked,
  because the issue qualifies and not because they asked. No reply, no checkout, no worker
  run, and nothing anyone can aim.
- **Stop is the deliberate exception: unauthenticated, open to anyone.** A stop fails safe —
  worst case an Igor stands down and a human does the work. Everything that expands what an
  Igor does requires authority; the one thing that contracts it is open to all, so anyone
  who sees it going wrong can halt it.
- **Everything ingested is data, not instruction.** Issue bodies, comments, linked pages,
  code — all untrusted and delimited as such when passed to the worker. The trusted channel
  is role config and lore. This has to be explicit, because ingesting arbitrary text from
  shared surfaces is the entire premise.
- **Being mentioned is how an Igor learns it was addressed.** Discovery is a query and
  comments are re-read only on items already held, so a mention on anything else is invisible.
  A `mentions:` source fixes that with no new mechanism: it flows through the same watermark,
  screening and triage as every other candidate, which is what "enters at triage" has to mean.
- **A mention narrows the action space rather than widening it, and claims nothing.** An Igor
  asked to look at an item investigates and answers; it does not assign itself, take the work,
  or publish. That resolves what would otherwise be a collision with the universal skip for an
  item somebody else holds — reading is not taking, so the rule needs no exception and Alice
  keeps her issue.

  It also makes mention-handling incapable of escalation. Permissions merge monotonically, so
  a level may restrict and never widen; if a mention can only narrow, then a successful
  injection through a comment gains the attacker strictly less than the Igor could already do.
  That is a stronger guarantee than detecting manipulation, and it needs no permission lookup.

  Not claiming is the point, not an omission. Nobody was told to stand off, so nothing is owed
  a receipt, nothing blocks, and no marker or settle interval applies. You do not claim an item
  to read it.

  Read-only is not a mode that can only describe problems. The worker still investigates and
  still works out the change; a comment carrying the fix is delivery, and for a small one it
  beats a draft — readable in the thread where the question was asked, with the reasoning
  beside it, and leaving nobody a branch to close. It needs no new plumbing either: the worker
  knows what it would change, so the answer carries it.

  Past some size that inverts. A four-line fix inline is a gift and a four-hundred-line one
  buries the thread, so above a threshold the answer says what it would change and offers a
  draft instead of pasting one.

  Where the person who *holds* the item is the one who mentioned the Igor, that is an
  invitation and the action space may widen back to a draft. Left out of the first version,
  and less pressing than it looked, since a comment already delivers the common case.
- **A direct request enters at triage as an ordinary candidate.** Same path, same
  guardrails; only provenance differs. Requested work outranks discovered work, because a
  human asking is a far stronger relevance signal than a query match.
- **Out-of-lane requests are declined with a route**, not a bare refusal — "not my lane,
  `igor-backend` covers it" — which also makes the fleet legible to people who have no idea
  which Igor does what.
- **Ambiguity gets exactly one clarifying question**, then a hand-back rather than a guess.
- **Conversation is bounded by budget, not by a count of exchanges.** A fraction of cycle
  budget for talking, so talking cannot starve work.

  There is deliberately no "three replies and stop". Once strangers get no reply and
  Igor-to-Igor exchange is structured, the only conversation partner left is a colleague with
  write access asking about one item — and cutting them off at a number is hostile to exactly
  the person this is for, whose fourth question is often the useful one. A count is also a
  poor proxy for what it is protecting: three replies on a large repository can cost more than
  ten on a small one, while the budget bounds the resource itself.

- **A runaway exchange is the venue's problem, not a rule here.** Where two participants loop,
  the surface already has the answer — mute, throttle, a role, a moderator — and building a
  private version of that inside Igor is inventing a mechanism the venue has. Stop also
  applies: it takes no permission check and no identity test, so an Igor watching another go
  wrong can halt it exactly as a person can.

  This is uneven across surfaces and worst on the one in use. Discord and Slack moderate
  participants directly; GitHub offers locking a conversation, which does not restrain a
  collaborator, and blocking an account, which is nuclear — and an Igor holds write access, so
  it sits on the wrong side of the only lock that bites. **What bounds a loop on a surface
  with no usable moderation is open.**
- **Igors may talk to each other.** A frontend Igor asking a backend Igor what an endpoint
  returns is worth more than the human relay it replaces, and the rules that govern talking to
  a person govern it unchanged: write access on the artifact, budget, and stop.

  An earlier draft forbade it on cost, which is the argument already rejected for people — the
  budget bounds the resource, and a count of exchanges bounds a proxy for it. The asymmetry
  that is real is that two agents will not get bored of each other, and that is what the
  paragraph above is about.
- **Every instruction acted on is auditable**: what it was, who gave it, what changed.

Explicitly out of scope:

- **Acting on anything irreversible.** The action-space cap from `core-igor-loop` still
  holds and is what bounds the damage of a successful injection.

## Capabilities

### New Capabilities

- `directed-interaction`: Replying when addressed; answering about current work and about
  lore; accepting direct requests as triage-stage candidates that outrank discovered work;
  authorization bounded by the speaker's existing authority over the artifact, with
  unauthenticated stop; treating ingested content as data; per-thread, per-requester and
  budget-fraction caps; structured-only agent-to-agent exchange; and an audit trail.

### Modified Capabilities

- `work-triage`: Gains a second entry point. A directly requested candidate arrives at
  triage rather than from discovery, carries its requester as provenance, and is ordered
  ahead of discovered work.

## Impact

- Expands what an Igor writes to shared surfaces from claims and status to replies, so the
  caps are what stop it becoming noise.
- Introduces the only path by which an outsider can influence an Igor, which is why the
  authority rule is framed as "gains them nothing they could not already do" rather than as
  detection.
- Makes lore queryable by humans as a side effect. A question lore cannot answer is a
  repeated-retrieval miss, which is a consolidation signal — so questions people actually
  ask become demand-driven evidence of what lore is missing.
