## Since review: a window the reserve line shuts can reopen before its reset (2026-09-28)

Added 2026-09-28, after both gates were discharged. It records a decision made after review and
what it does to this change. Adam settled the one question it raised the same day, and that answer
is applied to the spec (see the end of this note). No task or code changed, and it does not block
merging.

### The decision

Adam decided on 2026-09-28 that a seat's reserve is a line that moves toward the reset, checked
against the seat's latest unreset reading of each window
([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
Igor may start work on a seat only while that reading is below `1 − reserve × remaining`, where
`remaining = (resetsAt − now) ÷ window length`. This replaces the dollar bound
`(1 − reserve) × capacity` as the gate, for every seat. It is specified on
[#143](https://github.com/adamstallard/igor/pull/143) and not built.

### What it does to this change

**A window's return is no longer always its reset.** The line rises as the window runs down. A
reading `u` below 100% is under the line again once `remaining < (1 − u) ÷ reserve`. At reserve
0.3, a window read at 85% is shut until halfway through it, not until `resetsAt`. Only a reading of
100%, a refusal, waits for the reset. So where a window is shut by the line, the return is the
instant the line crosses the reading, and that instant is at or before the reset.

**The crossing depends on the role.** Also decided 2026-09-28: a role may declare its own
`reserve`, and the line for that role on a seat uses `r = max(seat reserve, role reserve)`. So one
seat can be open to one role and shut to another at the same moment, and its crossing comes at a
different hour for each. A handoff is written for one role, so it would use that role's `r`. With
`reserve` 0 for both the seat and the role, the line is 100% throughout, and only a refusal shuts a
window.

**The later-of-two rule survives.** *A seat shut in both windows returns on the later of the two*
is written about the seat's returns, "however the figure was arrived at", and the seat is still
back only when the last thing holding it clears. What changes is what each window's return is.
Its scenarios speak of exhausted windows, which are 100% readings and still return at their
resets, so none of them is wrong.

**The two paths become one.** The rationale describes a live path for a seat the provider reports
on and a derived path for a seat bounded by recorded dollars. Under #143's gate two, both are the
same comparison: a reading against a line. The prose becomes history. It is not normative, and
this note leaves it as it is. The 2026-09-27 note below says "shut" is decided by `hasHeadroom`
against the reserve. That is true of the code on this branch and becomes the line after #143's gate
two.

**A crossing is not an hour a stated reset fixes.** *An hour is marked approximate where a stated
reset does not fix it* draws its line at a stated reset. A crossing is computed from a stated
reset, but also from a reading that is only a lower bound until its reset (the owner may have
spent since), and from a window length that stays built in until a probe measures it. It can only
be early, never late. The requirement now names this case (below).

**Code on this branch that gate two of #143 will rework.** The `live` candidate builder in
`budgetGate` decides "shut" with `hasHeadroom(seatStatus(…))` against the reserve and states each
shut window's `resetsAt`. Once #143's gate two lands, "shut" means at or above the line, and the
return of a window shut below 100% is the crossing. That is #143's work, not a reason to hold
this change. The ordering this change adds (later of two, compared as instants) carries over
unchanged.

### Decided (Adam, 2026-09-28): the crossing, marked approximate

**A handoff for a window the line has shut states the crossing, marked approximate, not the
reset.** The crossing is the earliest the seat can be back, and the first probe after it reads the
seat again. The reset would be a stated hour and never early, but late by up to the whole window:
at reserve 0.3 a seat read at 85% is back halfway through a week and would be reported as back at
the end of it. The purpose of this change is that a handoff not promise a return the seat does not
keep. That rules out an hour that is too early presented as exact, and it does not argue for an
hour that is late by days.

Applied to *An hour is marked approximate where a stated reset does not fix it*: the crossing is
one more marked case, the requirement states that the crossing is the hour named, and a scenario
pins both. The crossing is computed by #143's gate, so no code on this branch reaches this case
until #143's gate two lands. The implementation belongs there. This branch's own code and tests are
unchanged, and its gate two stays discharged.

## Since review: a seat token's windows can be read from the worker's stream (2026-09-27)

This note was added after both gates were discharged. It changes no requirement, no task and no
code, and it flags no decision. It records how this change stands against a finding made after it
was reviewed, so a reader of the change does not have to work that out again.

### The finding

`docs/architecture.md` §6.3.3 on `main`, measured 2026-09-27: a worker run under a `setup-token`
credential — `claude -p … --output-format stream-json --verbose`, which workers already use —
emits a `rate_limit_event` carrying both windows, each with a `utilization` from 0 to 1 and a
`resetsAt` in epoch seconds. Nobody has to be signed in. `src/execute.ts` keeps only the terminal
`result` event today and discards this one. Reading it is being specified separately, on the
branch `seat-from-stream`; this note does not duplicate that work.

### What it means for this change

**The live path this change edits does not read a seat token today.** Its readings come from
`claude -p '/usage'`, and a `setup-token` credential gets a cost summary with no percentages from
that, so such a seat is `SeatUnmeasurableError` and is judged on the derived path. For a fleet
seat, then, the path that reached this change's rule in practice was `derivedReset`, which
already took the later of the two. The fix still matters for any seat with an interactive login.

**The requirement already covers a reading from the stream, with no amendment.** *A seat shut in
both windows returns on the later of the two* is written about the seat, "whichever window it
belongs to, and however the figure was arrived at". A third source of figures is bound by it as
the two existing paths are. Whatever `seat-from-stream` specifies should satisfy this
requirement, not restate it. The rationale prose says "two paths"; once the stream feeds the gate
that reads as three. The prose is not normative, so this note leaves it as it is.

**Which window is "later" does not change.** The comparison is made on instants, and a stream
`resetsAt` is an instant already. Nothing about the source changes which hour is the later one.

**The case Adam settled does not arise from a stream reading.** *A return that cannot be placed
is not ordered against* exists because `/usage` returns provider phrases, and some of them
(`"next Friday morning"`) resolve to no instant. An epoch-seconds `resetsAt` always places. The
settled behaviour still governs readings from `/usage`. It governs a stream reading only where a
window is missing from the event altogether, and whether that happens on a seat below every
threshold has not been checked: the only capture so far was taken past 75% of the week.

**`resetApproximate` keeps its line.** A stream `resetsAt` is a reset the provider stated, so
under *An hour is marked approximate where a stated reset does not fix it* an hour taken from it,
or the later of two of them, is not marked.

**"Shut" is still Igor's judgement, not the provider's.** The event's `status`
(`allowed_warning`, with `surpassedThreshold`) reports the provider's thresholds. Whether a window
is shut here is decided against the seat's reserve by `hasHeadroom`, and nothing in this change
should be read as keying on the provider's status.

**Whether derivation becomes a fallback is not decided here.** Once a seat token can be read
from its own runs, `derivedWindow` and `derivedReset` may only be needed for a seat with no recent
reading. That is for `seat-from-stream` to decide. This change leaves `derivedReset` unchanged,
and it answers the same way as the live path whichever of them ends up as the fallback.

The stream is undocumented. Per §6.3 it is an optimisation and never a correctness dependency.
Nothing here relies on it.
