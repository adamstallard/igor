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
- **The unit of work is an issue, wherever it lives.** Not a GitHub Issue — Linear, ClickUp
  and Jira hold issues too, and all of them have a real assignee field, so preferring the
  native claim primitive holds across trackers rather than being a GitHub quirk.
- **A surface plays one or both of two roles**, which GitHub combines and Linear does not:
  a **tracker** (search, claim, verify, report) and a **code host** (produce a reversible
  artifact, and link it back to the item). The linkage convention varies — Linear reads
  branch names, GitHub Issues reads `Closes #123` — and is exactly the part that would
  otherwise be hardcoded. The interface separates the roles even though only GitHub ships
  here.
- **Igors poll rather than wait.** A long-running process runs the role's queries on an
  interval, watermarking per source so items are not reconsidered forever. The query is the
  tracker's own — `label:ai`, a ClickUp tag, a Linear filter — passed through verbatim rather
  than translated through a filter language Igor invents. Igor defines no canonical label;
  teams already have conventions and theirs fit better.
- **State is a cache, and correctness never depends on it.** The tracker is the source of
  truth for what is claimed, so an Igor that loses its watermarks re-examines old items,
  finds them assigned or closed, and skips. That costs tokens, never a duplicate claim.
- **State lives on an orphan branch of the destination**, along with execution transcripts.
  Machine output gets a machine venue on every surface — its own channel in chat, its own
  branch in git — so `main` stays purely human-meaningful while state still survives a fresh
  clone and stays inspectable.
- **Completion behaviour is policy, not a rule.** What an Igor does when it believes work is
  finished — unassign, close, assign onward, request review — is org config with a safe
  default of unassign-and-leave-the-artifact. Some orgs will want Igors that review each
  other and mark one another's work complete, and the tool should not preclude that.
- **Policy is the org-level layer of role config**, not a new artifact: same shape, wider
  scope, and a role may narrow it but never loosen it. Claiming before starting,
  unconditional stop, and treating ingested content as data are not policy — they are the
  properties config must not be able to weaken.
- **Three-stage triage.** A deliberately loose query in the tracker's own language fetches
  broadly. **Predicates over normalized candidate fields** then decide lane precisely and for
  free — `labels includes AI`, `labels excludes Human` — which is where an org's own
  conventions live, versioned in the role config. Only the residue reaches an LLM call. The
  same predicate evaluator serves lore firing, so there is one implementation.
- **The adapter's normalization contract is real**: labels, title, body, author, state, age,
  linked paths, url. Predicates are only as portable across trackers as that shape is
  consistent.
- **Claim or skip.** Triage produces a binary outcome. There is no confidence score and no
  shadow mode — not deferred, dropped. What gets skipped is still recorded, because a
  record of what an Igor passed on is useful regardless.
- **Claims are verified, not assumed.** Where a tracker has a native assignment primitive,
  use it and prefer a conditional write. Where it has only messages, post, wait a settle
  interval, re-read, and stand down if someone claimed first.
- **Stop ships here, minimally.** An Igor polling every few minutes beats a human who has not
  opened their notifications, so first-claim-wins favours Igors systematically. That is not a
  race a human can win, so what matters is the override — and the change that introduces the
  asymmetry has to ship it. Stop is immediate, unconditional and open to anyone; the item
  then returns to the pool after a cooldown unless a human assigned themselves. The
  conversational layer around it is `directed-interaction`.
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
- **Talking to an Igor** (`directed-interaction`) — beyond the minimal stop above. People
  will reply to claims, but that cannot be tested before claims exist.
- **Shadow mode and confidence scoring — dropped, not deferred.** Every justification for
  shadow failed on inspection (§5.3): risk is already capped by reversible-only, courtesy by
  visible claims and open stop, calibration is triage's job, and the learning signal assumed
  a human would *replace* the draft when in practice they iterate on it, so the diff it
  depended on mostly does not exist. Confidence drove nothing but shadow, so it goes too.
  The cases that seemed to need shadow are handled by scope: an item where a claim would
  itself be disruptive belongs outside the role's query.
- **Fleet supervision.** One Igor at a time. Concurrent Igors follow once claim behaviour is
  proven against humans alone.
- **The local recognizer, condition vectors, SAE-legible conditions.** Triage is an LLM call.
  Activation-keyed recognition requires moving recognition off a closed API.
- **Ongoing lore consolidation from live episodes.** This change produces episodes; folding
  them back into lore is a follow-on.

## Capabilities

### New Capabilities

- `role-config`: What a role is — search queries, lane predicates, standing instructions,
  claim templates, completion behaviour — where it lives, how it is validated and loaded, and
  the org-level policy layer roles inherit and may narrow but not loosen.
- `surface-adapter`: The adapter interface — search, claim, verify, report, identity — plus
  the declaration of whether a surface offers native assignment or only message-based
  convention, and the GitHub implementation.
- `work-discovery`: Running role queries on an interval, watermarking per source, and
  normalizing results into a common candidate shape.
- `work-triage`: Deciding in-lane and worth-doing, recording the reason for each decision,
  and recording what was skipped.
- `work-claiming`: Taking a claim before starting, verifying against races, standing down on
  loss, and honouring an unconditional stop from anyone — with the item returning to the pool
  after a cooldown unless a human has assigned themselves.
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
- Produces the first episodes: claims, outcomes, corrections, and skips. Ongoing lore
  consolidation depends on that record existing.
