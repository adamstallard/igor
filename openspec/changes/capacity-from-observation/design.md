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

That preference is not a reading, so it sets `resetApproximate` — which therefore means "not a
return the provider stated" rather than "the latest it can still be shut". The flag now covers
a figure that can be late and one that can be early, and `composeHandoff` says "back around"
instead of "back by", which claimed a side the flag no longer promises.

**Across seats the cycle blocks the same comparison, and preferring the derived instant was
tried and reverted.** A seat shut until Friday does answer for a pool-mate back within the
hour, which is wrong; but the fix cannot be a precedence rule. `Temporal.Instant.from` throws
on every phrase the provider prints, so "prefer the comparable instant" resolves in production
to "the derived figure always wins" — the same one-directional error pointed the other way,
and one that reads as an ordering to whoever next touches it. Measured on the mirror input, a
readable seat shut until Friday alongside a pool-mate back in an hour and the reverse: each
rule states a return the pool does not keep on exactly the inputs the other gets right.

So the reading answers where there is one, as before. Ordering the two needs the phrase
resolved, which needs `resolveReset` out of `capacity.ts` and into a module both files import.
That is a larger change than a precedence rule and it is not taken here.

**A shut *week* the reading named no reset for takes its seat out of the answer.** Falling
through to the session's reset states the hour one window opens while the week still holds the
seat, which is early by up to a week. A shut session with no reset is not the same case: the
week is answered for first, and its stated hour is either the later of the two or under a
session-length early — the error the week preference already carries, hedged the same way — so
the seat keeps answering.

The derived path drops a seat on *any* blocked window with no instant, which reads like the
same rule and is not. There a missing figure is a rolling bound with no boundary, so nothing
bounds the return at all; here a shut session is bounded by its cadence whether the provider
named an hour or not.

## Where the instance sits is the provider's news, not the spend log's

`capacityFor` answers how big the window is by walking the observations newest-first and taking
the first that divides. Tiling the current instance from *that* row's reset made the boundary a
function of the spend log, because which row divides depends on where spend happens to have
landed. Two readings of the same fixture, differing only by one dollar recorded 95 minutes
earlier:

    records $10 at 08:45              -> stated return 18:40
    records $10 at 08:45, $1 at 13:00 -> stated return 15:00

The dollar is not evidence about where the window sits. It made a newer refusal divisible, the
newer refusal's reset became the anchor, and the tiling moved with it — so recording more spend
released the seat 3h40m earlier. A bound that spending relaxes is not a bound.

So the anchor is separated from the magnitude: `resetAnchor` returns the reset from the most
recent observation that resolved one, whatever that observation measured, and `capacityFor`
keeps answering only for the size. A row that divides supplies a quantity; a row with a resolved
reset supplies a position, and the newest position is the least stale news about it.

Two things this deliberately does not do:

- **A declared figure still gets a rolling window, even where an anchor exists.** Tiling it
  would be better arithmetic and it overturns the recorded reason above — a declared figure is
  for a seat never observed at all — so it is a decision rather than a correction, and it is
  left alone here.
- **More spend can still release a seat, by two paths that leave the boundary where it is.** A
  newer, lower reading becomes divisible once something is spent inside its span, and
  newest-wins then raises the capacity estimate. And the first divisible row flips the basis
  from declared to observed, which swaps the rolling window for a tiled one starting later,
  counting less of the same spend. Both reproduce with this change reverted, and both are the
  design as written: the estimate self-correcting, and an observed boundary beating a rolling
  approximation of one. What is fixed here is the third path, where the spend moved the
  *boundary* — and only that one was ever a fault.

## An unresolved reset expires on the cadence, because both other readings strand something

§1 asks an observation whose reset cannot be resolved to place no boundary and yield no
derivation, and to stop bearing on the present one window length after it was taken. The
cadence expiry is there because the two simpler rules both fail, in opposite directions:

- **A row that never expires** holds the window shut forever. Nothing sweeps the log, so the
  refusal is still saying "spent" a month later and the seat is one nobody can use again.
- **A row that counts for nothing** leaves the common case unfixed. A refusal records no cost
  on the run it refused, so there is nothing in the instance to divide, no capacity figure, and
  no arithmetic to stop the seat — which is then chosen, told it is uncalibrated, and refused
  again.

What makes the middle answer available is that a position and a duration are not the same
thing to know. Placing an instance needs the reset itself; bounding how long the fact stays
relevant needs only the cadence, and a window resets at most one length after any moment inside
it. The seat is held for at least as long as it is really shut, which is the direction that
cannot overrun anybody's floor.

A refusal with no resolved reset is the common case until the envelope is captured and
`resolveReset` is wired in, so this is the rule most of the record runs on today, not an edge.
