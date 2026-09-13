## Why

Work an AI could do sits unclaimed because a human has to notice it and hand it over.
Existing agent products wait to be assigned; none go looking. The gap is not capability —
it is discovery and coordination. An agent that finds its own work must also announce it,
or it collides with the humans and agents already working.

This change builds the loop end to end: one Igor, running one role, finding work itself,
claiming it where the team can see, doing it, and handing off cleanly when it cannot
continue. It is the change that proves the novel claim, and it delivers on its own.

**Depends on `lore-store`** only for the destination repository holding role definitions.
Lore itself is not consumed here — see `lore-retrieval`. An Igor with no lore still has its
role, the work item, and the codebase, which is what a competent new hire walks in with.

## What Changes

- **Roles become real objects.** A role file defines what to search for, what counts as in
  lane, standing instructions for the worker, and claim templates. Roles live in the same
  destination repository as lore, versioned and reviewed the same way.
- **Surfaces are adapters, not integrations.** An adapter provides search returning
  normalized candidates, claim, claim verification, status posting, and its own identity.
  Everything above that line is surface-agnostic. GitHub ships first because it is the one
  platform nearly every team has; Linear and Discord are follow-ons and are the reason the
  interface exists rather than a direct integration.
- **Igors poll rather than wait.** A long-running process runs the role's queries on an
  interval, watermarking per source so items are not reconsidered forever.
- **Two-stage triage.** Deterministic query matching narrows the firehose for free. Only
  survivors cost an LLM call, which decides whether the work is in lane and worth doing.
- **Claim or skip.** Triage produces a binary outcome; there is no confidence score and no
  shadow mode in this change. What gets skipped is recorded, because that record is the
  input to deciding whether shadowing is worth building.
- **Claims are verified, not assumed.** Where a surface has a native assignment primitive,
  use it and prefer a conditional write. Where it has only messages, post, wait a settle
  interval, re-read, and stand down if someone claimed first.
- **Igors produce only reversible artifacts.** Draft pull requests, comments, and proposals
  — never merges, never sends, never irreversible state changes. Blast radius is capped by
  the action space rather than by silence, which is what lets the loop deliver value from
  week one.
- **Budget exhaustion produces a handoff.** When an Igor cannot continue, it posts what it
  did, what remains, and who could pick it up. An Igor is never "busy" — it fans out
  subagents, so budget is its only reason to defer, and it says so with a reset time.

Explicitly out of scope:

- **Lore retrieval** (`lore-retrieval`). An Igor here works from its role, the item, and the
  codebase. Firing lore into context is an enhancement, not a precondition.
- **Talking to an Igor** (`directed-interaction`). People will reply to claims, but that
  cannot be tested before claims exist.
- **Shadow mode and confidence scoring.** Confidence drove exactly one decision —
  shadow-versus-claim — so cutting shadow removes the need for the score entirely. Neither
  is deferred out of timidity: a self-reported confidence from a model is badly calibrated,
  and the signal that would work is empirical, from whether past work of a given shape was
  accepted. That history only exists once this change has run.
- **Fleet supervision.** One Igor at a time. Concurrent Igors follow once claim behaviour is
  proven against humans alone.
- **The local recognizer, condition vectors, SAE-legible conditions.** Triage is an LLM call.
  Activation-keyed recognition requires moving recognition off a closed API.
- **Ongoing lore consolidation from live episodes.** This change produces episodes; folding
  them back into lore is a follow-on.

## Capabilities

### New Capabilities

- `role-config`: What a role is — search queries, lane definition, standing instructions,
  claim templates — where it lives, and how it is validated and loaded.
- `surface-adapter`: The adapter interface — search, claim, verify, report, identity — plus
  the declaration of whether a surface offers native assignment or only message-based
  convention, and the GitHub implementation.
- `work-discovery`: Running role queries on an interval, watermarking per source, and
  normalizing results into a common candidate shape.
- `work-triage`: Deciding in-lane and worth-doing, recording the reason for each decision,
  and recording what was skipped.
- `work-claiming`: Taking a claim before starting, verifying against races, and standing
  down on loss.
- `task-execution`: Invoking headless Claude with the role's standing instructions,
  constrained to reversible outputs, capturing transcript and outcome.
- `graceful-handoff`: Detecting budget exhaustion or unrecoverable failure and posting
  state-of-work, remaining steps, and suggested pickups.

### Modified Capabilities

None. `lore-store` gains firing metadata, but that belongs with the change that fires
entries (`lore-retrieval`).

## Impact

- New long-running process holding credentials for at least one surface plus a Claude
  subscription seat via `claude setup-token`.
- Writes to shared team surfaces. A misfiring Igor posts visible noise where people are
  working, so claim correctness matters more than task quality in this change.
- Consumes a seat's rolling usage allowance. Caps are not published, so headroom must be
  estimated from observed per-invocation cost rather than computed against a known limit.
- Produces the first episodes: claims, outcomes, corrections, and skips. Every later change
  — lore consolidation, confidence scoring, shadow mode — depends on that record existing.
