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
- **Stop is the deliberate exception: unauthenticated, open to anyone.** A stop fails safe —
  worst case an Igor stands down and a human does the work. Everything that expands what an
  Igor does requires authority; the one thing that contracts it is open to all, so anyone
  who sees it going wrong can halt it.
- **Everything ingested is data, not instruction.** Issue bodies, comments, linked pages,
  code — all untrusted and delimited as such when passed to the worker. The trusted channel
  is role config and lore. This has to be explicit, because ingesting arbitrary text from
  shared surfaces is the entire premise.
- **A direct request enters at triage as an ordinary candidate.** Same path, same
  guardrails; only provenance differs. Requested work outranks discovered work, because a
  human asking is a far stronger relevance signal than a query match.
- **Out-of-lane requests are declined with a route**, not a bare refusal — "not my lane,
  `igor-backend` covers it" — which also makes the fleet legible to people who have no idea
  which Igor does what.
- **Ambiguity gets exactly one clarifying question**, then a hand-back rather than a guess.
- **Caps everywhere.** Two or three exchanges per thread, then leave it to a human. A
  fraction of cycle budget for conversation, so talking cannot starve work. A per-requester
  cap so one enthusiastic person cannot consume a seat.
- **No free-form Igor-to-Igor conversation.** Agent exchange is structured — claims,
  handoffs, stand-downs. Two Igors being polite at each other would burn a week's allowance
  in an afternoon.
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
