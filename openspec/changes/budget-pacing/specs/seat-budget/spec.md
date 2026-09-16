## ADDED Requirements

### Requirement: Capacity is paced across the window, not consumed on sight

An Igor SHALL compare recorded spend against a pace line — the share of the window it should
have consumed by now — and SHALL decline work while it is ahead of that line.

Without it, an Igor spends at whatever rate work arrives and stops at the reserve, so a busy
Monday leaves nothing for the rest of the week. Capacity existed and went unused because it was
taken all at once.

How far into the window it is SHALL be read from the reset time the provider reports rather
than assumed, and a window whose reset cannot be read SHALL NOT be paced, because an invented
position is worse than none.

Where a seat has more than one window, the pace line of each applies and the tighter governs.

#### Scenario: Ahead of pace, work waits

- **WHEN** a role's recorded spend exceeds its share of the pace line
- **THEN** it takes no new work this cycle

#### Scenario: Behind pace, work proceeds

- **WHEN** a role's recorded spend is below its share of the pace line
- **THEN** work proceeds as normal

#### Scenario: A window that binds

- **WHEN** a seat is comfortable against one window's pace and ahead against another's
- **THEN** the one it is ahead of governs

#### Scenario: A position that cannot be read is not guessed

- **WHEN** a window reports no reset time
- **THEN** that window contributes no pace line

### Requirement: Waiting on pace is distinguishable from having nothing to do

An Igor declining work because it is ahead of pace SHALL record that as the reason, distinctly
from an exhausted budget and from an empty queue.

The three look identical from outside — an Igor doing nothing — and they call for opposite
responses. Exhausted means find more capacity; ahead of pace means it is working as intended;
nothing to do means the lane is wrong.

#### Scenario: The record says which

- **WHEN** a cycle takes no work because the role is ahead of pace
- **THEN** the decision record names pacing rather than exhaustion

### Requirement: Pacing tolerates a margin

An Igor SHALL NOT react to a deviation from the pace line smaller than a configured tolerance.

Work is lumpy: a single item costs what it costs, and an Igor that corrects after every one
oscillates between overshooting and idling without spending any less.

#### Scenario: A small overshoot is not acted on

- **WHEN** recorded spend exceeds the pace line by less than the tolerance
- **THEN** work proceeds

### Requirement: A reserve decays toward the reset, on the clock or on the owner's consumption

The reserved fraction of a window SHALL narrow as that window's reset approaches. Where a recent
observation of the seat exists, it SHALL narrow by what the owner has actually consumed; where
none does, it SHALL narrow on elapsed time alone and SHALL narrow less far for it. It SHALL NOT
narrow early in a window, and SHALL NOT narrow to nothing.

These are one rule in two information states, not two mechanisms. Capacity unspent when a window
resets is lost whatever the reason, so holding the full fraction to the last minute guarantees
waste; the clock is free, exact and always available, and is therefore the floor of the
behaviour. An observation replaces the assumption clock decay has to make — that the owner might
still want all of it — with what the owner did. Specifying one rule rather than two means a seat
whose owner never schedules a reading still gets the conservative half, instead of there being a
cliff between a calibrated seat and an uncalibrated one.

The owner's consumption is not read directly and need not be. It is
`percentUsed − (Igor's recorded spend ÷ capacity)` — the observed fullness of the window, less
the part Igor is accountable for — and every term is recorded.

The two windows have opposite risk profiles, so the session reserve SHALL decay and the weekly
one SHALL decay no further, if at all. A session window turns over several times a day: its
waste recurs, and relaxing too far costs a wait until the next reset. A weekly window turns over
once: its waste is a single event, and relaxing too far costs somebody the day they had planned
to work.

Relaxing the bound on Igor lowers what remains to the owner. That is arithmetic and not an edge
case, which is why a floor beneath the floor SHALL survive however late the window is and
however quiet the owner has been.

What relaxing recovers is bounded by throughput, not by the relaxed figure, so the bound SHALL
NOT be relaxed past `min(relaxed budget, throughput × time remaining)`. Throughput is measured
from recorded cost per completed item, which `executions/` already holds, and is not a constant
to be chosen. Releasing 30% of a window in its final hour buys nothing if that is ten items'
worth and the Igor can finish two.
Decay that ignores this trades the owner's floor for capacity nobody was going to use.

No curve, rate or threshold is fixed here. They want fitting against recorded observations, as
the dead band does, and a constant chosen before there is data to choose it from is a guess
carrying a number's authority.

#### Scenario: A quiet owner late in the window

- **WHEN** a window is nearly over and its owner has consumed little of their reserve
- **THEN** the Igor may use part of it

#### Scenario: Early in the window, the reserve is whole

- **WHEN** a window has recently reset
- **THEN** the full reserve is held back regardless of the owner's usage so far

#### Scenario: Something is always kept

- **WHEN** an owner has used none of their reserve and the window is almost over
- **THEN** some of it remains unavailable to the Igor

#### Scenario: Without an observation the clock still decays the reserve

- **WHEN** a session window is near its reset and no recent observation of the seat exists
- **THEN** the reserve narrows on elapsed time alone
- **AND** it narrows less far than it would against an observation showing the owner idle

#### Scenario: The weekly reserve is not traded for the same gain

- **WHEN** both windows are near their resets and the owner is equally quiet against each
- **THEN** the session reserve narrows further than the weekly one

#### Scenario: Relaxation beyond reach is not granted

- **WHEN** decay would release more budget than the Igor could spend before the reset
- **THEN** the bound is relaxed only as far as remains reachable
- **AND** the rest stays with the owner
