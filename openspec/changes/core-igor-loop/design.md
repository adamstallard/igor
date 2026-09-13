## Context

Lore exists, is reviewed, and is active in a store nothing reads. This change builds the
thing that reads it — an Igor that finds work itself, claims it where people can see, does
it, and hands off cleanly. It is the change that proves the premise, and the first one that
writes to surfaces people are actually working on.

The design record is `docs/architecture.md`. This document covers only what implementing
this change requires deciding, and refers there rather than restating.

Two constraints shape everything below. **A misfiring Igor posts visible noise where people
work**, so claim correctness matters more than task quality here. And **an Igor cannot be an
escalation path**, so its authority is bounded by the person asking, never by its own
credentials.

## Goals / Non-Goals

**Goals:**

- One Igor, one role, one tracker, end to end.
- Legible to a human at every step: what it found, why it claimed, what it did, why it stopped.
- Safe by construction — reversible artifacts, bounded authority, an unconditional stop.
- An interface that admits a second tracker without rework.

**Non-Goals:**

- Lore retrieval (`lore-retrieval`), conversation (`directed-interaction`), concurrent Igors,
  the local recognizer, shadow mode, confidence scoring.
- Solving prompt injection. Bounding what a successful injection can achieve.

## Decisions

**The unit of work is an issue, and a surface plays one or two roles.** A **tracker**
(search, claim, verify, report) and a **code host** (produce an artifact, link it back).
GitHub combines them; Linear does not, which is why the interface separates them even though
only GitHub ships here (§5.0). The linkage convention — `Closes #123` versus a branch name —
is the part that would otherwise be hardcoded.

**Triage is three stages, not two** (§5.0.1). A deliberately loose native query, then
declarative predicates over normalized candidates, then an LLM call for only the residue. The
middle stage is free, deterministic, and where an org's own conventions live. It also means
the LLM sees few enough candidates that its cost is bounded by what survives predicates
rather than by what the tracker returns.

**Normalization is the contract predicates depend on.** An adapter must produce: id, url,
title, body, author, state, labels, linked paths, age, and whether work is already in flight.
Predicates are only as portable as that shape is consistent, so it is specified rather than
left to each adapter.

**Claiming is one mechanism** (§5.2): set the assignee where one exists because that is what
humans read, then rely on storage ordering plus a settle interval for correctness. A
conditional write was considered and dropped — it exists on only some trackers, so it could
not replace the ordering path, only double it.

**An Igor never wins against a human, and that is fine.** It polls faster than anyone reads
notifications, so first-claim-wins favours it structurally. The design does not try to make
that race fair; it makes the override cheap. Stop is unconditional, open to anyone, and ships
in this change rather than with the conversational layer, because this is the change that
creates the asymmetry.

**State is a cache on an orphan branch** (§5.0.2). The tracker is the source of truth for
what is claimed, so losing state costs tokens rather than correctness. It lives on a branch
rather than `main` so machine output gets a machine venue, and rather than a laptop so it
survives a fresh clone.

**Execution is headless Claude with a constrained action space.** The worker gets the role's
standing instructions, the normalized item, and the repository. It produces draft pull
requests and comments — never merges, sends, or irreversible state changes. Output constraint
is enforced by what the loop will act on, not by asking the model nicely.

**Execution is the only stage that needs a checkout, and it gets one through a seam.** Everything
else goes through the API. The tree is disposable and provisioned per task, which costs nothing
here — one Igor running one task at a time — and is what lets §6.7.2's shared object store
arrive as a swap rather than a rewrite. The spec deliberately does not say *clone* or
*worktree*: naming a shape here would bake in the clone-per-task assumption §6.7.2 exists to
warn off.

**Budget is calibrated by a human, not learned by exhaustion** (§6.3.1). Caps are
unpublished; a person runs `/usage` and submits what they see. Seats are named config entities
with an owner and a reserve, so an Igor sharing a seat leaves the human a floor it will not
touch.

**Policy is inherited config, not tool behaviour** (§6.0). Completion action, permitted
artifacts, and budget ceilings are org config that roles narrow. Three properties are not
policy: claim before starting, unconditional stop, and ingested content as data.

**Build order is a design decision, not a scheduling one.** Discovery, triage and `dry-run`
come first as one increment that claims nothing and posts nothing. It is where lane predicates
get found wrong before anything is public — and given that a real run has already contradicted
this design three times on the lore side, the milestone that produces observations without
consequences is worth reaching first.

## Risks / Trade-offs

- **A misfiring Igor is visible to colleagues** → Reach dry-run first; reversible artifacts
  only; stop open to anyone; start against a repository where noise is survivable.
- **Settle-interval claiming is probabilistic** → Accepted. Requires two Igors within seconds,
  the cost is duplicated work rather than damage, and two claims on one item is immediately
  visible. Slice 1 runs one Igor, so it barely arises.
- **Injection steers work the Igor legitimately claimed** → Unsolved by anything here. Bounded
  by the action space, review, and the audit trail. The authority model defeats escalation via
  instruction, not steering.
- **An unpublished cap means budget estimates are inherited from a human's reading** → Stale
  calibration silently governs the buffer, so `igor budget` reports calibration *age* and
  exhaustion cross-checks the number.
- **The LLM triage call is the one unbounded cost** → Predicates gate it, and skipped items are
  recorded so the ratio is observable rather than assumed. First measurement, against live
  repositories: an open-issue query returns 500 candidates on `cli/cli` and 159 on
  `BrightID/BrightID`, of which 10% and 0.6% respectively already have work in flight. So the
  free in-flight skip removes far less than hoped on a quiet repository, and lane predicates
  are carrying essentially all of the reduction. Paths named in issue text are rarer still —
  14% and 1.3% — so a `paths.under` lane will be weak on a repository that discusses symptoms
  rather than files. Priced at the dry-run milestone: **$0.016 and ~10 seconds per verdict** on
  Haiku, driven by 700–1600 output tokens of reasoning rather than by the cached preamble. A
  steady-state cycle costs cents a day; an unbounded cold start over a thousand candidates would
  cost roughly $16 and take hours, which is what the cold-start window exists to prevent.
  Execution, measured on two real items at the same milestone: **$0.05 and 11 seconds** for a
  one-line CI change, **$0.37 and 60 seconds** for a small React fix that needed the worker to
  read around the code first. A sevenfold spread on two items that both looked "small" from the
  issue text, so per-item execution cost cannot be predicted from triage — only bounded.
- **Polling wastes calls when nothing changes** → Accepted for latency that does not matter;
  watermarks reduce it and are a cache, not a correctness mechanism.

## Resolved while writing the specs

- **Triage returns a structured verdict with a reason.** The reason is what makes `dry-run`
  useful and what a human reads when a decision looks wrong; a bare boolean would make both
  impossible.
- **The action space is enforced at the loop**, by refusing to act on outputs outside it — not
  by instructing the worker. Asking a model nicely is not enforcement, and the whole point is
  that a steered worker still cannot exceed the space.
- **Partial failure hands off rather than retrying.** A silent retry loop on a claimed item is
  precisely the failure the claim protocol makes worst: humans have backed off, and nothing is
  happening or being said.
- **Spend is a trailing sum, not a per-window accumulator.** The provider's limits roll, so
  there is no boundary to detect and an implementation waiting for a reset would wait forever.
- **The handoff is composed from state, without a model call.** Reserving budget for it was
  rejected — the situation demanding a handoff is often one where no call can be made, so a
  handoff depending on the thing that just failed is not a handoff.

## Open Questions

- The three intervals (settle, cooldown, calibration staleness) have defaults but they are
  guesses, and only observation will say whether an hour is the right cooldown or wildly wrong.
- Whether `allow` needs finer grain than a verb — "may comment, but not on issues it did not
  claim" is expressible only by adding scope to each permission, which is complexity worth
  deferring until something needs it.
