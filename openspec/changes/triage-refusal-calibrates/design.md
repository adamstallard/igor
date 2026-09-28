## Since review: the reserve is a line checked against a reading, and nothing calibrates (2026-09-28)

Added 2026-09-28, after gate one and before gate two. It changes no requirement, scenario or task.
It records a decision that makes part of the requirement's wording wrong, proposes a restatement,
and leaves the restatement for Adam to accept or reject.

### The decision

Adam decided on 2026-09-28 that a seat's reserve is a line that moves toward the reset, checked
against the seat's latest unreset reading of each window
([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
Igor may start work on a seat only while that reading is below `1 − reserve × remaining`. This
replaces the dollar bound `(1 − reserve) × capacity` as the gate. Capacity figures stay only as a
display in `igor budget`, and calibration admission is dropped. It is specified on
[#143](https://github.com/adamstallard/igor/pull/143) and not built.

### What it does to this change

**Calibration stops bounding anything.** The requirement is titled *A refusal met during triage
calibrates the seat that refused*. Its last paragraph values the refusal because it proves the
window full "with the spend record complete behind it", and that is a calibration argument:
recorded spend divided by 100% gives a capacity. After #143's gate two, a capacity figure gates
nothing. So the title and that clause describe a job this row no longer does.

**The row's job for the gate is stronger, not weaker.** An observation at 100% is at or above
every line, so if the gate counts it as a reading, it holds the seat until the window resets. It is
also the one input to the gate that does not come from the undocumented stream. Under the line, a
missing event means no seat is admitted (§6.3.4 *Consequences not yet settled*), and a structural
refusal is the one route that survives that.

**Whether it counts as a reading is not yet specified.** #143's gate reads "the latest unreset
reading", and nothing on that branch yet says whether a source-`limit` observation is one. That
question belongs to #143, not to this change, and it has been put to Adam as one.

**No code on this branch depends on the dollar bound.** The branch is specification only.
Gate two writes a source-`limit` observation at 100%, and that row has to be one #143's gate
reads. If #143's gate two has landed by then, check this against it.

### Proposed restatement (for Adam; not applied)

- Title: *A refusal met during triage is recorded as a full reading of the seat that refused.*
- Last paragraph: "Triage is the first model call of a cycle, so an exhausted window is likelier to
  be discovered there than anywhere else. The refusal is worth most at that moment: it proves the
  window was full at a known instant, and a reading at 100% holds the seat out until that window
  resets, whether or not the stream reported anything."
- Everything else stands as written: one recogniser, a structural signal only, the fallback
  narrowing, one row per refusal, the batch stops, the untriaged come back.

Renaming the requirement breaks no cross-reference: nothing on #143's branch cites it by name.
The change's directory name, `triage-refusal-calibrates`, would keep the old word either way.

## Since review: a seat token's windows can be read from the worker's stream (2026-09-27)

This note was added after gate one and before gate two. It records a finding that overtakes part of this change's premise, and the decision Adam made
because of it: the requirement *A refusal met during triage calibrates the seat that refused* is
narrowed to a fallback, and task 2.5 is added. Nothing else in the requirements or tasks changed.

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

### Decided: this change is the fallback (Adam, 2026-09-27)

The reviewer was offered three options: proceed and restate the premise, narrow to a fallback,
or withdraw. **Adam chose to narrow to a fallback.** The objection recorded against that option
earlier, that it would depend on a specification that did not exist, no longer holds:
`read-seat-windows-from-the-stream` is open as
[#143](https://github.com/adamstallard/igor/pull/143).

What the narrowing means, as now written into the requirement:

- **Where a refused triage call carries a reading of its own**, meaning a `rate_limit_event` Igor
  records, the refusal is recorded once, from that reading, under #143's *A refusal the stream
  reports is not recorded twice*. This change writes nothing for that call.
- **Where it carries none**, because the event is absent, malformed or unrecognised, this change
  records the refusal exactly as gate one specified. This is the path that does not depend on
  undocumented output.
- **Today that means every triage refusal**, because triage runs `--output-format json` and
  receives no events. The narrowing does no work until triage reads the stream, and whether
  triage should is #143's question, not this change's.

This also settles #143's flagged question of who owns a triage reading. #143 owns a triage call's
*reading*, if triage ever produces one. This change owns a triage *refusal* that arrived without
a reading. The mechanism is unchanged: one recogniser, a structural signal only, one row per
refusal, the batch stops, and the untriaged candidates come back.

**Order of landing.** The requirement names #143's rule by title. If this change lands first,
there is no reading to defer to, and the condition "the call carried no reading" is always true.
So neither change has to wait for the other.

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
