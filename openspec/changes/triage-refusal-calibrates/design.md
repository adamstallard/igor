## Since review: a seat token's windows can be read from the worker's stream (2026-09-27)

This note was added after gate one and before gate two. It changes no requirement and no task.
It records a finding that overtakes part of this change's premise, and it flags one decision for
the reviewer, below.

### The finding

`docs/architecture.md` §6.3.3 on `main`, measured 2026-09-27: a worker run under a `setup-token`
credential, `claude -p … --output-format stream-json --verbose`, emits a `rate_limit_event`
carrying both windows. Each window has a `utilization` from 0 to 1 and a `resetsAt` in epoch
seconds. The event also has a `status` of `allowed`, `allowed_warning` or `rejected`. It is read
with the seat's own credential and nobody has to be signed in. Workers already run with these
flags. `src/execute.ts` keeps only the terminal `result` event and discards this one. Reading it
is being specified separately, on the branch `seat-from-stream`; this note does not duplicate
that work.

### What it overtakes

This change rests on a claim, stated in two places, that no longer holds as written:

- The requirement *A refusal met during triage calibrates the seat that refused*: "This is the
  only way a seat bought for a fleet is ever calibrated. Every other route to an observation needs
  a person signed in on the seat to take a reading, and nobody signs in as a dedicated seat."
- The proposal's *Why*: on a fleet seat a refusal "is not one calibration route among several —
  it is the only one there is."

§6.3.3 contradicts both. Every worker run is a reading of its own seat, taken with that seat's
credential and with no one signed in. The reading covers the whole seat, owner's use included,
and it arrives on ordinary runs, not only once a window is exhausted. So a refusal is no longer
the only route to calibrating a fleet seat.

### What survives

**A structural refusal is still the one route correctness can rest on.** The stream is
undocumented, and §6.3 keeps anything read from it as an optimisation, never a correctness
dependency. The event's `rejected` shape has not been captured by Igor (#57). Whether an event
arrives on a seat below every threshold has not been checked either, since the only capture was
taken past 75% of the week. A refusal recognised from a field the provider filled is exactly what
this change specifies, and it does not depend on any of that. The requirement's mechanism (one
recogniser, a structural signal only, one row per refusal, the batch stops, the untriaged come
back) is untouched by the finding.

**Triage, as it invokes `claude` today, does not see the event.** `runClaude` in `src/triage.ts`
passes `--output-format json`, with no `stream-json` and no `--verbose`. It gets one terminal
envelope and no event lines. So "every run now carries a reading" is true of worker runs and not
of triage calls. Whether the single `json` envelope repeats a `rate_limit_info` field, as a
worker's terminal `result` event does, has not been measured. `parseEnvelope` drops everything
but `result`, `costUsd` and `isError` either way. Task 1.1 would admit `rate_limit_info`.

**What the premise means for triage's position in the cycle.** The proposal argues that triage,
as the first model call of a cycle, is where an exhausted window is likeliest to be discovered.
That is still true of the order of calls. But once the gate reads the stream from earlier worker
runs, a seat nearing exhaustion can be known before triage spends on it, so the case this change
covers (the gate named a seat and was wrong) should become rarer. It does not go away: a seat
whose last worker run was long ago, or whose owner spent it since, still reaches triage with a
stale figure.

### Decision for the reviewer

**① Does gate two proceed as specified, with the overtaken rationale restated?** Recommended:
yes. The requirement's normative clauses still hold. What is false is the justification that a
refusal is the *only* calibration route. If the reviewer agrees, gate two restates that sentence
in the requirement and the proposal's *Why* as "the route that does not depend on undocumented
output". Nothing is rewritten here: the requirement text was reviewed at gate one, and changing
its premise is the reviewer's call.

The alternatives, for completeness:

- **Narrow this change to a fallback** for seats with no stream reading. That makes this change
  depend on a specification that does not exist yet.
- **Withdraw it in favour of `seat-from-stream`.** That makes a documented-behaviour path depend
  on an undocumented one, which is what §6.3 rules out.

### Questions for `seat-from-stream`, not for this change

- **Should triage switch to `stream-json --verbose`** so each triage call is itself a reading?
  That would change `runClaude` and `parseEnvelope`. It is a question about reading the stream,
  so it belongs to that branch.
- **Could `rateLimitType` replace `limitWindow`'s guess?** A captured `rejected` event naming
  `rateLimitType` would say which window refused, where `limitWindow` guesses it from the
  distance to the reset. It bears on task 5.1 too. If a refusal arrived while `unifiedWindows`
  showed both all-model windows below 1, that would suggest a per-model cap, which is the case
  5.1 cannot tell apart today. Neither can be settled until a `rejected` event is captured (#57),
  and the event carries no per-model windows.
