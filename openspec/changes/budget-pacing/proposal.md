## Why

An Igor spends as fast as it can until it hits the reserve, then stops dead.

`reserve` is a floor and nothing else: the gate asks whether there is headroom and the answer is
yes until suddenly it is not. On a weekly window that means an Igor busy on Monday and idle
until the window resets — capacity that existed all week and went unused because it was spent
in an afternoon.

The same shape wastes the other way. A seat shared with a person reserves a fixed fraction of
the *window*, so on the last day of a quiet week the Igor is still holding half of it back for
somebody who has demonstrably not wanted it.

Both are the same missing idea: nothing knows where in the cycle it is.

## What Changes

**A pace line governs; the reserve still floors.** Target usage at any moment is
`target × elapsed`, where `elapsed` is the fraction of the window gone — read exactly from the
reset time the provider already reports, not estimated. A role's share of that is its allowance
now. Ahead of the line, it waits; behind it, it proceeds.

**Being ahead defers work rather than refusing it.** A poll loop already returns in a few
minutes, so an Igor that has run ahead simply takes nothing this cycle and looks again. Nothing
new is needed to express waiting.

**Both windows, whichever binds.** Session and week each have a line, and an Igor may be
comfortable on one while ahead on the other.

**A dead band, because work is lumpy.** One item was measured at $1.19. Chasing the line
exactly means overshooting on an item and then idling; a tolerance either side avoids
oscillation that helps nobody.

**A reserve decays toward the reset, on whatever information there is.** Capacity unspent when
a window resets is lost, so holding the full fraction back to the last minute guarantees waste.
Given a recent observation of the seat, the fraction narrows by what the owner actually
consumed; given none, it narrows on elapsed time alone and less far. One rule in two information
states, so a seat nobody schedules a reading for still gets the conservative half rather than
nothing. Never early, never to nothing, and never past what the Igor could still spend before
the reset — releasing a third of a window in its final hour buys nothing if the Igor can finish
two items in it. The session reserve decays; the weekly one, whose waste happens once and costs
somebody a whole day, does not.

Explicitly out of scope:

- **Choosing the constants.** A target utilisation, a dead band, and the reserve decay's shape
  all want fitting against a seat that has run for a week. One item and one day of data is not
  that.
- **Predicting what an item will cost.** Pacing reacts to spend already recorded; estimating a
  run before it happens is a different problem and a worse one.
- **Spreading work between seats.** Pool order remains the allocation mechanism.

## Capabilities

### Modified Capabilities

- `seat-budget`: capacity is paced across the window rather than consumed on sight, and the
  reserve decays toward the reset — on the owner's observed consumption where that is current,
  on the clock alone where it is not — instead of holding a fixed fraction of the window.

## Impact

- Removes the state where an Igor is idle with capacity remaining and no reason.
- Makes a shared seat worth sharing: the person keeps a floor that reflects their actual use,
  and the Igor stops sitting on capacity nobody claimed. How much of that is recovered depends
  on whether observations of the seat are current, which `scheduled-observation` is what
  arranges; without it the clock alone recovers the conservative part.
- Adds a reason for an Igor to decline work that is not budget exhaustion, which the decision
  record has to distinguish or an operator reads "waiting" as "broken".
