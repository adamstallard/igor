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
