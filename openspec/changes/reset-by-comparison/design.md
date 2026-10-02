## How this change stands against decisions made after review

Two findings came after both gates of this change passed. Neither blocks merging, and neither
changed a task or the code. One added a case to a requirement, described below.

### Terms

- **Live path:** the hour a seat returns, worked out from a fresh reading of the seat
  (`claude -p '/usage'` today).
- **Derived path:** the same hour, worked out from what Igor recorded, for a seat it can't read
  live (`derivedReset`).
- **Reserve line** (decided 2026-09-28 in
  [`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built),
  specified on [#143](https://github.com/adamstallard/igor/pull/143), not built): Igor starts work
  on a seat only while its latest reading of each window is below `1 − r × remaining`, where
  `remaining = (resetsAt − now) ÷ window length` and `r` is the larger of the seat's and the role's
  reserve. It replaces the dollar bound `(1 − reserve) × capacity` for every seat.
- **Crossing:** the moment the rising line passes a reading. A reading `u` below 100% is under the
  line again once `remaining < (1 − u) ÷ r`.

### What holds on this branch today

- The live path decides a window is shut with `hasHeadroom(seatStatus(…))` against the reserve,
  and states each shut window's `resetsAt`. When both windows are shut, it states the later of the
  two, compared as instants. The derived path already did this.
- A seat that holds only a `setup-token` can't be read live: `/usage` gives that credential a cost
  summary with no percentages, so the seat is `SeatUnmeasurableError` and takes the derived path.
  For a fleet seat, then, this fix changes nothing in practice. It matters for a seat with an
  interactive login.
- Whether a window is shut is Igor's judgement against the reserve. Nothing here keys on the
  provider's `status` field (`allowed_warning`, `surpassedThreshold`).

### Decided (Adam, 2026-09-28): a handoff states the crossing, marked approximate

Under the reserve line, a window read below 100% reopens at its crossing, which comes at or
before its reset. At `r` 0.3, a window read at 85% reopens halfway through. Only a reading of 100%,
which is a refusal, waits for the reset.

So a handoff for a window the line has shut states the crossing, marked approximate, not the
reset:

- **The crossing can be early, never late.** It is computed from a reading that is only a lower
  bound until its reset, because the owner may have spent since, and from a window length that
  stays built in until a probe measures it. It is therefore not an hour a stated reset fixes.
- **The reset would be exact, but late by up to a whole window.** At `r` 0.3 and a reading of 85%,
  it reports the seat back at the end of the week when it is back halfway through. This change
  exists so that a handoff doesn't promise a return the seat won't keep. An early hour shown as
  exact breaks that, and an hour days late doesn't serve it either.
- **The crossing depends on the role**, because each role's line uses its own `r`. A handoff is
  written for one role and uses that role's `r`. Where the seat's and the role's reserves are both
  0, the line is 100% throughout, and only a refusal shuts a window.

In the spec, *An hour is marked approximate where a stated reset does not fix it* now names the
crossing as a marked case and says the crossing is the hour stated. A scenario pins both.

### When #143's gate two lands

- **The crossing case is built there, not here.** No code on this branch reaches it until then.
  This branch's code and tests stay as they are, and its gate two stays passed.
- **"Shut" will mean at or above the line.** The `live` candidate builder in `budgetGate` will
  state the crossing for a window shut below 100%. The ordering this change adds, the later of two
  compared as instants, carries over unchanged.
- **The live and derived paths become one comparison:** a reading against a line. The rationale's
  wording about two paths then describes how the code used to be. It isn't normative, so it is left
  as it is.
- ***A seat shut in both windows returns on the later of the two* still holds.** It is written
  about the seat's returns, "however the figure was arrived at". What changes is each window's
  return, not the rule. Its scenarios use exhausted windows, which are 100% readings and still
  return at their resets.

### Readings from the worker's stream

Measured 2026-09-27 (`docs/architecture.md` §6.3.3): a worker run under a `setup-token`, with
`claude -p … --output-format stream-json --verbose` as workers already run, emits a
`rate_limit_event`. It carries both windows, each with a `utilization` from 0 to 1 and a
`resetsAt` in epoch seconds. `src/execute.ts` discards it today, and #143 specifies reading it.

- **The requirement covers a stream reading with no amendment**, because it applies "however the
  figure was arrived at". #143 should satisfy it, not restate it.
- **Which window is later doesn't change.** The comparison is on instants, and a stream `resetsAt`
  is already one.
- **A stream `resetsAt` is a reset the provider stated**, so an hour taken from it, or the later of
  two, is not marked approximate.
- ***A return that cannot be placed is not ordered against* rarely applies to the stream.** It
  exists because `/usage` returns phrases such as `"next Friday morning"` that resolve to no
  instant, and an epoch `resetsAt` always resolves. It applies to a stream reading only where a
  window is missing from the event altogether. Whether that happens on a seat below every warning
  threshold is unchecked: the only capture so far was taken past 75% of the week.
- **Whether derivation becomes a fallback** for seats with no recent reading is #143's decision.
  `derivedReset` is unchanged here, and it agrees with the live path either way.

Nothing on this branch relies on the stream.
