# Design notes

## The numerator stops at the reading, not at the reset

The requirement says the numerator is "the spend recorded for that seat within the instance the
observation belongs to — bounded by the observation's reset time and the window's cadence". Read
literally that is the whole instance, and the whole instance is wrong: `percentUsed` is a snapshot
at the observation's `at`, so every dollar recorded after it was divided by a fraction it did not
consume.

Measured on the implementation before it was narrowed, with a reading at 2% taken just after a
reset and a reserve of 0.5:

    Igor spends $10 more  -> capacity $550    headroom $275
    Igor spends $50 more  -> capacity $2,550  headroom $1,275
    Igor spends $200 more -> capacity $10,050 headroom $5,025

The stop condition `spend ≥ (1 − reserve) × capacity` reduces to `percentUsed ≥ 100 × (1 − reserve)`
once capacity is recomputed this way: the spend cancels, and any observation below that threshold
leaves the seat unbounded for the rest of the instance. A reserve of 0.2 makes every reading below
80% a licence to spend without limit. That inverts "the quotient is lower than the seat's true
capacity … the error is deliberate and is in the safe direction", and it undoes "a limit error
lowers the estimate that permitted it" — a refusal-derived figure rose again as soon as another
Igor's in-flight run was appended.

So the numerator is bounded by `min(reset, at)`. The sentence's contrast clause is "and **not**
spend over all recorded history", which is choosing *which instance* rather than legislating a
cutoff inside one, and narrowing the interval changes no case the requirement's own scenarios
describe.

Two consequences worth keeping:

- `SpendRecord.at` is a completion time, so a run straddling the reading is excluded whole. That
  understates the numerator, which understates capacity, which tightens the bound — the blessed
  direction.
- An observation whose `at` precedes its own instance derives nothing. `resolveReset` promises a
  reset at or after the reading, never one within a window of it.

## A declared capacity is one figure for two windows

`Seat.capacity` is a single scalar, as the requirement and task 3.5 describe it, but every
consumer of a capacity figure is per-window: the bound is `(1 − reserve) × capacity` *within a
window*, and reporting is "per seat and per window". A figure meant for the weekly window used as
the session capacity over-estimates by roughly the ratio of the cadences, 168:5 — the unsafe
direction.

Nothing reads the figure yet, so this costs nothing today. It becomes reachable with the gate
(task 4.1), and reshaping the field is cheapest before that depends on it. Left as it stands here
rather than amended in passing: the shape is the requirement's, and amending a requirement is not
this issue's to do.

## The reset a handoff states belongs to whatever is blocking

Two things hold a window shut and they expire on different clocks. A refusal expires at its own
`resetsAt`; a sum that has reached `(1 − reserve) × capacity` clears when the instance it was
summed inside rolls over. Reporting the later of the two unconditionally, from the figures
`boundsForSeats` hands over, is wrong and was tried. In the ordinary case the capacity comes
from the very row that shut the seat, so the two coincide; where they diverge it is because the
capacity came from an older observation whose instance has been tiled forward past the live
refusal, and the handoff then named an hour three and a half hours after the seat was released.

The later of the two is right only where the arithmetic is itself blocking. So the comparison
belongs in `derivedWindow`, the one place that knows which of them is holding the seat, and not
in the figures handed to it. Where the capacity is declared rather than observed there is no
boundary to tile from at all, and the answer is that the return is unknown rather than the
refusal's hour — a rolling window's sum clears at a moment nothing here can name, and an
invented position in a window is worse than none.

A seat whose usage could be read answers in the provider's own words, which are phrases rather
than instants. Ordering two of them needs `resolveReset`, and `capacity.ts` imports from
`budget.ts`, so the live path prefers the week where both windows are shut rather than
comparing. The week is the later of the two except inside the last session of one, so that
preference is early by under five hours where naming the session is early by up to a week.

## A refusal that named no reset still expires, which §1 does not allow for

§1 says an observation whose reset cannot be resolved "SHALL contribute neither an expiry nor a
capacity derivation, because a position in a window that has been invented is worse than none".
`spentFor` gives such a row an expiry anyway: one window length after the refusal. §2 is
implemented in knowing tension with that sentence, and the sentence has not been amended.

The reason for the deviation is that the two halves of §1's rule are not alike. A capacity
derivation needs to know *where* the instance sits, and a reset that did not resolve says
nothing about that — inventing one moves the boundary and every figure taken against it. An
expiry only needs to know how long the fact stays relevant, and the cadence bounds that without
placing anything: a window resets at most one length after any moment inside it, so the seat is
held for at least as long as it is really shut. The error is in the direction that cannot
overrun anybody's floor, where a row that never expired would be a seat nobody could use again.

That is an argument for amending §1's second clause rather than for ignoring it, and it is not
settled. A refusal with no resolved reset is the common case until the envelope is captured and
`resolveReset` is wired in, so this is the rule most of the record runs on today, not an edge.
