## Why

Work that an AI could do sits unclaimed in Slack, ClickUp, and GitHub because a human has
to notice it and hand it over. Existing agent products wait to be assigned; none of them
go looking. The gap is not capability — it is discovery and coordination: an agent that
finds its own work must also announce it, or it collides with the humans and agents
already working.

This change builds the smallest thing that closes that gap: one Igor, running one role,
finding work on its own, claiming it where the team can see, doing it, and reporting back
even when it runs out of budget mid-task.

## What Changes

- **Roles become versioned artifacts.** A role is a file in git defining search queries,
  lane boundaries, claim behavior, and standing instructions. Igors are instances of a
  role and hold no durable state of their own.
- **Igors poll rather than wait.** A long-running process executes search queries against
  Slack, ClickUp, and GitHub on an interval, tracking a per-source watermark so the same
  item is not reconsidered forever.
- **Two-stage triage.** Deterministic query matching narrows the firehose for free; only
  surviving candidates cost an LLM call to judge whether the work is in-lane and worth
  doing.
- **Claims are public and checked.** Before starting, an Igor posts to the surface where
  the work lives. It then re-reads after a settle delay and stands down if someone else —
  human or Igor — claimed it first.
- **Work runs through headless Claude** authenticated with a long-lived subscription
  token, so an Igor consumes a seat rather than API credits.
- **Budget exhaustion produces a handoff, not silence.** When an Igor can no longer
  continue, it posts what it did, what remains, and who could pick it up.

Explicitly out of scope for this change:

- Lore (the team knowledge store) and the consolidation pass that fills it. Lore needs
  real episodes to learn from, and this change produces the first ones.
- The local open-weight recognizer, condition vectors, and SAE-legible conditions. Triage
  here is an LLM call; replacing it with activation-keyed recognition is a later
  optimization.
- Fleet supervision. This change runs one Igor at a time. Multiple concurrent Igors are a
  follow-on once claim behavior is proven against humans alone.

## Capabilities

### New Capabilities

- `role-config`: How a role is defined, versioned, validated, and loaded — search queries,
  lane description, claim templates, standing instructions.
- `work-discovery`: Polling Slack, ClickUp, and GitHub on an interval; watermarking so
  seen items are not reprocessed; normalizing results into a common candidate shape.
- `work-triage`: Deciding whether a candidate is in this role's lane and worth acting on,
  and recording the reason for the decision.
- `work-claiming`: Posting a visible claim to the originating surface, verifying after a
  settle delay that no one claimed first, and standing down on loss.
- `task-execution`: Invoking headless Claude against a claimed item with the role's
  standing instructions, and capturing the transcript and outcome.
- `graceful-handoff`: Detecting budget exhaustion or unrecoverable failure, then posting
  state-of-work, remaining steps, and suggested pickups to the originating surface.

### Modified Capabilities

None — this is the first change in the project.

## Impact

- New long-running process with credentials for Slack, ClickUp, GitHub, and a Claude
  subscription seat via `claude setup-token`.
- Writes to shared team surfaces. A misfiring Igor posts visible noise into channels and
  tickets people actually read, so claim correctness matters more than task quality in
  this change.
- Consumes a Claude seat's rolling usage allowance. Usage caps are not published, so
  budget headroom must be estimated from observed per-invocation cost rather than computed.
- Establishes the vocabulary (Igor, role, lore, claim) that later changes build on.
