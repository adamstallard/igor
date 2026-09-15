## Context

Bounding the worker by silence needs the stream to say both that the worker is alive and what
it is waiting for. This records what the stream was measured to carry.

## What the stream was measured to carry

Two real tasks run through `claude -p --output-format stream-json --verbose`, the first with
each line timestamped on arrival.

- **Event types are open.** `system/init`, `rate_limit_event`, `assistant`, `user`,
  `system/thinking_tokens`, `result/success`. The second run produced types the first did not,
  so a rule that whitelists types would need revising whenever the CLI adds one: any parsed
  event counts as progress.
- **Gaps between events ran 0.02s to 2.48s**, over 33 and 14 events.
- **Each event carried exactly one content block** in every run: `thinking`, `text`,
  `tool_use:<name>` or `tool_result`. A `tool_use` block carries `id` and the matching
  `tool_result` carries the same value as `tool_use_id`, verified pairwise on three calls.

**The 2.5s figure bounds nothing.** Every tool call in both runs was a fast read. The stream is
silent for the entire duration of a tool call, because the result arrives as one event when the
tool returns. So the silence to bound is not one quantity: it is either a tool running or a
model not answering, and the stream says which.

The outstanding set is keyed by `tool_use` id rather than read off the last event's type,
because tools dispatched together return one at a time. A `tool_result` for the first while the
second still runs would otherwise drop the window to the model's while a tool is still going.
Observed live: a worker dispatched `Bash` and `Write` together and both were outstanding before
either result came back.

A resumed turn clears the set, since a turn cannot resume while a tool it dispatched is
running. **This holds only for the run's own turn.** A third run, of a subagent, showed the
`Agent` tool's first sidechain event to be a `user` event carrying a `text` block, with
`parent_tool_use_id` naming the still-outstanding `Agent` call and its own `tool_result`
arriving much later. Clearing on that would drop the longest-running tool there is, so events
carrying a `parent_tool_use_id` do not clear.

## Choosing the numbers

**No real Igor task on a real item has ever been timed.** The measurements below are of the
stream's shape, not of how long work takes, so only the model window is derived from evidence
about the thing it bounds. The tool window and the ceiling are reasoned from other bounds and
are **provisional** until a real task is measured.

**Tool window: 30 minutes — provisional.** Three times the longest a shell command may be
given, which also leaves room for a subagent or a fetch that nothing here bounds. A tool that is
genuinely hung resolves itself on its own timeout without this policing it, so the cost of being
generous is almost entirely theoretical. What is missing is the other side: nobody has measured
the longest tool call a real item actually provokes.

**Errors do not strand the set.** A tool that fails, one denied by policy and one that exceeds
its own timeout all return a `tool_result` carrying `is_error: true`; no id was left outstanding
in any of five runs. The clear-on-resumed-turn rule is a guard against a case not observed
rather than a fix for one that was.

**Model window: 5 minutes.** Measured gaps between a tool result and the next turn ran under
three seconds, so this is two orders of magnitude above the signal and still catches a hang
fast.

One assumption behind it is **unverified**. Every `rate_limit_event` observed carried
`status: "allowed"`; what the stream does once a seat is actually over its limit was never
seen. If the CLI blocks silently waiting for the window to reset, a run that hits the limit
mid-item dies here and is handed off as "produced nothing for 5m" — a diagnosis that blames a
hung model for a quota event, which is worse than the kill. If it keeps emitting
`rate_limit_event`s while it waits, the window is never reached and nothing is wrong. Measure
this against a seat at its limit before trusting the model window's diagnosis.

Killing rather than idling is still the wanted outcome either way: holding a claim for hours
waiting on a quota is worse than releasing it.

**Absolute ceiling: 6 hours — provisional, and load-bearing for two other things.** Past the
seat's five-hour rate-limit window, which the stream reports as
`rate_limit_event.rate_limit_info.rateLimitType: five_hour`. A worker alive across a whole
window and still going is not waiting on anything that will resolve, so the ceiling is reachable
only by a fault.

Keeping a ceiling at all is not only about the runaway worker. Two mechanisms have nothing else
to derive from:

- **The abandoned-tree sweep** must clear the longest a live tree can be held.
- **Stale-claim recovery.** A process posts a claim carrying its own marker, and a sibling that
  finds the marker is not its own stands down — correct while that process lives, wrong forever
  once it dies, because the marker never changes. The only thing a sibling can observe is how
  old the claim is, and a progress window bounds nothing, since it resets on every event. Drop
  the ceiling and no claim age is ever conclusive, so the item becomes permanently unclaimable.
  The alternative is a heartbeat on the claim comment, which is a mechanism nobody has asked
  for.

So the ceiling is exported as one constant naming both dependents, rather than inlined.

**Sweep threshold: the ceiling plus an hour.** A tree outlives its worker by a clone and an
artifact push, which is a fixed cost and not a share of the run, so the margin is added rather
than multiplied. This is seven hours against the old one, so abandoned debris now survives
seven times longer — accepted deliberately, because deleting a live sibling's tree corrupts its
run and the threshold has to clear the longest a tree can legitimately be held.

## What this contradicts

The stream **does not** support a mid-run spend ceiling, which was worth checking on the same
measurement. `total_cost_usd` appears only on the terminal `result` event (0.0885 and 0.1038 in
the two runs). The per-event counts are not a running total: the first run's `assistant` events
reported `output_tokens` of 2, 2, 2, 2 and 1 against the `result` event's 429.
`cache_read_input_tokens` does grow monotonically, so it tracks progress, but it does not price
a run.

Enforcing a dollar ceiling mid-run therefore needs either the CLI to emit cumulative usage per
event, or an out-of-band spend read against the seat. Issue #11 holds that decision, together
with the cost a killed run fails to record — which these windows enlarge, since the ceiling
bounds six hours of spend where the wall clock bounded fifteen minutes. Reconstructing one client-side would need
a price table plus correct cache-read, cache-write and thinking accounting, against per-event
figures that do not reconcile with the total by a factor of forty-seven.

## Consequences accepted

**A wedged worker also stops answering stops.** Mid-run claim re-reads are driven by event
arrival, so a worker producing nothing is not checking the tracker either. The silence window
is the bound on how long that lasts. The 30-second checkpoint and the silence windows are
separate mechanisms and neither replaces the other.

**The shutdown grace period no longer covers the longest item.** `deploy/` waits 15 minutes for
the loop to finish what it holds. A worker may now run longer than that, so an operator who
needs shutdown to wait for a long item has to raise it; the default bounds shutdown latency
instead.

## Known gap: a kill does not reach the worker's own subprocesses

`child.kill('SIGKILL')` signals one pid. The CLI's tool subprocesses are not in a killed
process group and survive, holding CPU and file handles with their working directory already
deleted. Observed: a grandchild spawned by a stub worker wrote its marker file 2.5 seconds
after the watchdog killed its parent.

This is not new, but the tool window makes it systematic rather than incidental: that window
exists precisely because a tool subprocess may be long, so every kill on it lands by
construction while one is running.

Not fixed here. The fix is `detached: true` plus a process-group kill, which changes signal
semantics for the whole tree — an interactive Ctrl-C would stop reaching the worker — and the
same two kill sites are the stop path. That is its own change, with its own review: issue #14.
