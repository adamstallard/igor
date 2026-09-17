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
