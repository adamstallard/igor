## Why

The moment an Igor posts a claim, people reply to it. Having no answer for that means the
behaviour gets decided by accident — an agent that ignores everyone, or one that can be
talked into anything.

Both halves matter and they pull in opposite directions. Someone asking a legitimate
question deserves an answer; someone injecting instructions into an issue body must gain
nothing. This change handles both with one rule: **an Igor answers only people with
write access, and does nothing for them that they and its role could not already do.**

**Depends on `core-igor-loop`** — this cannot be tested before there are claims for people
to reply to.

## What Changes

- **An Igor replies when addressed, and only then.** Not to every comment on an item it
  claimed. Otherwise a busy pull request becomes a budget sink.
- **Answering is liberal; acting is strict.** To anyone with write access, it answers about its own work — what it
  claimed, why, current status, what it intends. Acting on what it is told
  requires authority.
- **Authority to instruct never exceeds authority over the artifact.** Someone without
  write access to a repository carries no weight instructing an Igor working in it. Injection by an
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
  them in `role_name`, but every one of them is assumed to resolve to those booleans (task 2.6 measures it), so no mapping
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
  comments are read only on items it returns, so a mention on any other item is invisible.
  A `mentions:` source fixes that with no new mechanism: it flows through the same watermark,
  screening and triage as every other candidate. It checks the author's write access before it
  hands an item on, so a stranger's mention cannot bring an item to triage.
- **A mention narrows the action space rather than widening it.** A mention from someone with
  write access gets work done only on an open pull request the Igor authored, or on an open issue
  that nobody else holds or is assigned to and that has no work in flight. Anywhere else it gets an answer only: the Igor
  investigates and replies, and does not claim the item, take the work, or publish. An answer
  only passes triage's skips of held, closed and in-flight items, because reading is not taking, so
  the holder keeps the item and still gets an answer.

  It also makes mention-handling incapable of escalation. Permissions merge monotonically, so
  a level may restrict and never widen; if a mention can only narrow, then a successful
  injection through a comment gains the attacker strictly less than the Igor could already do.
  That is a stronger guarantee than detecting manipulation.

  A plain answer claims nothing. A claim tells other Igors to stand off an item; with none, no
  stop receipt is owed, nothing blocks, and no claim marker or settle interval applies. An answer that acts, by opening an
  issue or acting on an option the person chose, takes a claim first, as Adam decided on #179 on
  2026-10-28 (its decision 62): two of a role's processes acting would act twice.

  An answer is not a mode that can only describe problems. The worker still investigates and
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
  person asking is a far stronger relevance signal than a query match — which is source
  ordering rather than a priority mechanism: requests are their own source, listed first.

  This composes with rank offsets without anything new. Requests are a separate list, so the
  highest rank starts at the first request; a process already working an item is not planning
  a cycle, so "unless they are busy" needs no concept of busy.
- **Out-of-lane requests are declined with a route**, not a bare refusal — "not my lane,
  `igor-backend` covers it" — is not in this change:
  [#162](https://github.com/adamstallard/igor/issues/162) builds it, and answering lore questions.
- **Ambiguity is asked about rather than guessed at, and nothing counts the questions.** A
  question costs a comment; acting on a bad guess costs a wrong pull request and somebody's
  time reading it. The bias belongs on the side of asking, and budget bounds it as it bounds
  everything else.

  This is the existing hand-back phrased as a question rather than a new path: an item the
  worker cannot act on already produces a message carrying its own account of why. The
  deferral record already supplies the waiting: a handed-back item stays quiet until what
  `work-triage` says lifts the hold, such as a reply or an edit.
- **Conversation is bounded by budget, not by a count of exchanges.** A role file declares
  `conversation_share`, the fraction of the role's budget that answering may spend, so talking
  cannot starve work.

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
  collaborator, and blocking an account, which is nuclear — and an Igor's App can write to the
  repository, so locking a conversation does not restrain it either. **What bounds a loop on a
  surface with no usable moderation is open.**
- **Igors do not question each other through mentions** (decided 2026-10-04). Every Igor posts
  as its GitHub App's bot account, and a mention from any bot account gets no answer and no
  work, whatever GitHub's permission lookup reports for it. So neither another Igor nor any
  other bot directs an Igor.
- **A requested item records who asked and what they said.** The decision log already carries
  the item, the stage, the outcome and triage's reason, and the execution record adds the seat,
  the cost, what changed and what was refused. For a discovered item that is complete, because
  the provenance is the query. For a requested one it is not: the person and their words are
  missing, and the record reads only "triage said proceed".

  A field on the record, not a second mechanism. The reason is sharper than audit in the
  abstract — it is what distinguishes a request from an injection after the fact, and "who told
  it to" is the first question anybody asks about an Igor that did something odd.

- **A person with authority can have an Igor file an issue.** Asked to track something on a pull
  request it authored, or on an issue nobody holds, an Igor opens an issue in the same repository
  carrying what was asked, where, and by whom, and does not work it. It claims the item it was asked on first,
  looks for an issue that already links the request, and neutralizes each `@` it copies so the
  issue notifies nobody. Without this, work suggested on a pull request lives only in a comment
  thread, where nothing can discover it or be scoped to it. Opening an issue is a new role
  action and must be granted like any other, so a mention still cannot widen a role.
- **An answer to a question the Igor asked may be acted on.** An Igor that posts a decision with
  numbered options — bug-hunter's open decisions on a pull request it published, per
  [#139](https://github.com/adamstallard/igor/issues/139) — takes the answer from a comment that
  mentions it. Matched against what it recorded when it asked, never read back out of the
  description, so a reply can choose among options the Igor already proposed but cannot add one.
  Mentioning a different Igor gets that Igor's answer only, since it did not author the
  artifact (Adam, 2026-11-02); for that role to do the work, the person opens an issue for it.

Explicitly out of scope:

- **What #162 builds:** declining an out-of-lane request with a route, answering people's
  questions about lore, and a cap on requests per requester.
- **Acting on anything irreversible.** The action-space cap from `core-igor-loop`, the set of
  actions a role allows, still holds and is what bounds the damage of a successful injection.

## Capabilities

### New Capabilities

- `directed-interaction`: learning it was addressed through a mentions source; replying to
  people with write access on the artifact and to no one else; a mention narrowing the action
  space; treating everything ingested as data; bounding conversation by
  budget rather than by a count; asking rather than guessing; and recording who asked.

### Modified Capabilities

- `work-triage`: gains a second entry point. A requested candidate arrives from a mention
  rather than from discovery, carries its requester, and is ordered ahead of discovered work
  by being its own source listed first. A mention that gets an answer only passes the skip of
  an item somebody else holds.
- `role-config`: `allow` gains `issue`, and a role file gains `conversation_share`.
- `surface-adapter`: an adapter finds the comments that mention the Igor, with their author as
  the requester; reads whether a party may write to a repository; and opens an issue or finds
  one linking a comment.

## Impact

- Expands what an Igor writes to shared surfaces from claims and status to replies, so the
  budget bounds what they cost. What bounds the noise on GitHub is open (`design.md`, Open).
- Introduces the only path by which an outsider can influence an Igor, which is why the
  authority rule is framed as "gains them nothing they could not already do" rather than as
  detection.
