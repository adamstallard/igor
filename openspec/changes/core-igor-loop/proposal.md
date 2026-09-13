## Why

Work an AI could do sits unclaimed because a human has to notice it and hand it over.
Existing agent products wait to be assigned; none go looking. The gap is not capability —
it is discovery and coordination. An agent that finds its own work must also announce it,
or it collides with the humans and agents already working.

This change builds the smallest useful version: one Igor, running one role, finding work
itself, claiming it where the team can see, doing it, and handing off cleanly when it
cannot continue. It consumes the lore produced by `lore-from-reviews`, so it starts with
the team's accumulated judgment rather than learning it from scratch.

**Depends on `lore-from-reviews`** for the lore store schema and its initial contents.

## What Changes

- **Surfaces are adapters, not integrations.** An adapter provides search returning
  normalized candidates, claim, claim verification, status posting, and its own identity.
  Everything above that line is surface-agnostic. GitHub ships first because it is the one
  platform nearly every team has; Linear and Discord are follow-ons and are the reason the
  interface exists rather than a direct integration.
- **Igors poll rather than wait.** A long-running process runs the role's queries on an
  interval, watermarking per source so items are not reconsidered forever.
- **Two-stage triage.** Deterministic query matching narrows the firehose for free. Only
  survivors cost an LLM call, which decides whether the work is in lane, whether it is
  worth doing, and — separately — **how confident the Igor is that it should be the one
  doing it.**
- **Shadow is a mode, not a phase.** When triage concludes a human should own the item, the
  Igor still does the work but posts it as a suggestion rather than taking visible
  ownership. Shadowing shrinks as the Igor's confidence calibrates, instead of ending on a
  date someone picked.
- **Every pickup takes a claim; only visibility varies.** Confident work claims on the work
  surface where humans see it. Shadow work claims in a coordination channel watched by
  Igors and interested humans. One code path, one race-handling routine, two destinations —
  which is what stops two Igors silently duplicating the same shadow task.
- **Claims are verified, not assumed.** Where a surface has a native assignment primitive,
  use it and prefer a conditional write. Where it has only messages, post, wait a settle
  interval, re-read, and stand down if someone claimed first.
- **Lore fires into context before work starts.** Entries whose predicates match the item
  are injected before the worker runs, so the Igor begins with what the team already knows
  rather than querying for it.
- **Igors produce only reversible artifacts.** Draft pull requests, comments, and proposals
  — never merges, never sends, never irreversible state changes. Blast radius is capped by
  the action space rather than by silence, which is what lets the loop deliver value from
  week one.
- **Budget exhaustion produces a handoff.** When an Igor cannot continue, it posts what it
  did, what remains, and who could pick it up.

Explicitly out of scope:

- **Fleet supervision.** One Igor at a time. Concurrent Igors follow once claim behavior is
  proven.
- **The local open-weight recognizer, condition vectors, and SAE-legible conditions.** Triage
  is an LLM call and lore fires on predicates. Activation-keyed recognition is an
  optimization, and it requires moving the recognition layer off a closed API.
- **Ongoing lore consolidation from live episodes.** This change produces episodes; folding
  them back into lore is a follow-on.

## Capabilities

### New Capabilities

- `surface-adapter`: The adapter interface — search, claim, verify, report, identity — plus
  the declaration of whether a surface offers native assignment or only message-based
  convention, and the GitHub implementation.
- `work-discovery`: Running role queries on an interval, watermarking per source, and
  normalizing results into a common candidate shape.
- `work-triage`: Deciding in-lane, worth-doing, and confidence, and recording the reason for
  each decision.
- `work-claiming`: Taking a claim for every pickup, routing its visibility by confidence,
  verifying against races, and standing down on loss.
- `lore-retrieval`: Matching lore predicates against a candidate and injecting fired entries
  into the worker's context.
- `task-execution`: Invoking headless Claude with the role's standing instructions and fired
  lore, constrained to reversible outputs, capturing transcript and outcome.
- `graceful-handoff`: Detecting budget exhaustion or unrecoverable failure and posting
  state-of-work, remaining steps, and suggested pickups.

### Modified Capabilities

- `lore-store`: Entries gain firing metadata — fire count and last-fired timestamp — so
  entries that never match can be pruned and entries that always match can be promoted into
  standing role config.

## Impact

- New long-running process holding credentials for at least one surface plus a Claude
  subscription seat via `claude setup-token`.
- Writes to shared team surfaces. A misfiring Igor posts visible noise where people are
  working, so claim correctness matters more than task quality in this change.
- Consumes a seat's rolling usage allowance. Caps are not published, so headroom must be
  estimated from observed per-invocation cost rather than computed against a known limit.
- Establishes the vocabulary — Igor, role, lore, claim — that later changes build on.
