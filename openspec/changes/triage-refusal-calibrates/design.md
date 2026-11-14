## The reserve is a line checked against a reading; capacity bounds nothing

How a seat's reserve is checked changes what this change's requirement, *A refusal met during
triage is recorded as a full reading of the seat that refused*, has to say. The restatement
below is applied to the spec and the proposal. No scenario or task changed for it.

### The decision

A seat's reserve is a line that moves toward the reset, checked
against the seat's latest unreset reading of each window
([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
Igor may start work on a seat only while that reading is below `1 − reserve × remaining`,
where `remaining` is the fraction of the window still to run before it resets. The allowed
reading therefore rises toward 100% as the reset nears.
The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file
may also set its own reserve (§6.3.4). This
replaces the dollar bound `(1 − reserve) × capacity` as the gate. Capacity figures stay only as a
display in `igor budget`, and calibration admission is dropped. It is specified on
[#143](https://github.com/adamstallard/igor/pull/143) and not built.

### What it does to this change

**Calibration stops bounding anything.** The requirement was titled *A refusal met during triage
calibrates the seat that refused*. Its last paragraph valued the refusal because it proved the
window full "with the spend record complete behind it". That is a calibration argument: recorded
spend divided by 100% gives a capacity. Once #143 is implemented, a capacity figure gates nothing, so
the title and that clause described a job this row no longer does.

**The row's job for the gate is stronger, not weaker.** An observation at 100% is at or above
every line, so it holds the seat until the window resets. Every other reading the gate uses comes
from the `rate_limit_event` in a worker's output, which the provider does not document (see the
next section). A reserved seat with no reading is not admitted (§6.3.4), so where that event is
missing, a refusal recognised from a field the provider filled is the only way the gate gets a
reading at all.

**Decided: a refusal counts as a reading.** A refusal is a 100% observation of
its window until that window resets, and it is an input to the line. That is specified on #143,
not here. The row this change writes records one such refusal.

**No code on this branch depends on the dollar bound.** The branch is specification only.
Its implementation writes a source-`limit` observation at 100%, and that row has to be one
#143's gate reads. Whoever implements this change checks the row against #143's gate, if #143
has been implemented by then.

### Restatement, approved and applied

- Title: *A refusal met during triage is recorded as a full reading of the seat that refused.*
- The refusal's value is no longer a calibration argument. Triage is the first model call of a
  cycle, so an exhausted window is likelier to be discovered there than anywhere else. The
  refusal is worth most at that moment: it proves the window was full at a known instant, and a
  reading at 100% holds the seat out until that window resets, whether or not the stream reported
  anything. The requirement states only the last effect; the rest of this reasoning lives here.
- The proposal's *Why* and *Impact* drop the same calibration argument.
- The rest of the mechanism stands: one recogniser, a structural signal only, the fallback
  narrowing, one row per refusal, the batch stops, the untriaged come back. The requirements state
  these rules, and the reasons for them are under *Decisions* below.

The rename breaks no cross-reference: nothing on #143's branch cites it by name. The change's
directory name, `triage-refusal-calibrates`, keeps the old word. The section below quotes the
requirement under its old title.

## A seat's windows can be read from the worker's output stream

A finding overtakes part of this change's premise, and a decision follows from it: the
requirement *A refusal met during triage calibrates the seat that refused* is narrowed to a
fallback. Task 2.5 carries the fallback's condition: where a triage call's output carries a
`rate_limit_event` recorded as a reading, this change records nothing for that call. Nothing else
in the requirements or tasks changed for it.

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

### Decided: this change is the fallback

The reviewer was offered three options: proceed and restate the premise, narrow to a fallback,
or withdraw. **The choice was to narrow to a fallback.** The objection recorded against that option
earlier, that it would depend on a specification that did not exist, no longer holds:
that specification, the change `read-seat-windows-from-the-stream` on the branch
`seat-from-stream`, is open as [#143](https://github.com/adamstallard/igor/pull/143).

What the narrowing means, as now written into the requirement:

- **Where a refused triage call carries a reading of its own**, meaning a `rate_limit_event` Igor
  records, the refusal is recorded once, from that reading, under #143's *A refusal the stream
  reports is not recorded twice*. This change writes nothing for that call.
- **Where it carries none**, because the event is absent, malformed or unrecognised, this change
  records the refusal exactly as its requirement specifies. This is the path that does not depend on
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

## Decisions

### How a triage refusal is recognised and recorded

- **One recogniser.** The patterns that say what a refusal looks like are unverified against a live
  one. A second reader written for triage would be a second thing to correct when the first live
  refusal is captured, with nothing to show the two had drifted apart.
- **A provider-filled field, never the result text.** That text is model output written about an
  item, so an item about rate limits says the same words. Before a run's observation is
  written, the run's outcome has already been classified by other means; a triage call has only
  the recogniser's verdict, so a false match there goes straight into a row. Being wrong costs a
  permanent row asserting a seat was full when it was not.
- **No seat, no row.** An observation must name a seat, and a call made on a credential no seat
  names is attributable to none.

### Exactly-once comes from the loop, not from the writer

- A writer that reads the log to ask whether a seat and window are already recorded reintroduces
  the read-modify-write that append-only observations exist to avoid; two Igors sharing a state
  branch can both read before either writes. It is also unnecessary: an exhausted window refuses
  the next call too, so a stage that stops at the first refusal has one refusal to record.
- Without the stop, one exhausted window becomes one row per candidate, permanently. Nothing
  removes surplus rows from an append-only log. The capacity figure `igor budget` displays is
  recorded spend divided by the fraction it consumed, so each surplus 100% row divides the same
  spend again, and the displayed figure stays wrong after the cycle that wrote the rows.
- Stopping loses nothing: every remaining call would have been refused too. The untriaged
  candidates must come back because nothing about them produced the outcome. A source's
  watermark marks how far discovery has read, and nothing about these items will change to lift
  them past it if it is allowed to advance over them.
- Verdicts reached before the refusal stand. They were paid for and are correct, and discarding
  them would waste work a refusal gives no reason to redo.
