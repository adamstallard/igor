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

### Requirement: A reserve protects projected need, not a fixed fraction

Late in a window, where the seat's owner is measurably behind their own pace, the reserved
fraction MAY narrow. It SHALL NOT narrow early in a window, and SHALL NOT narrow to nothing.

A fixed fraction of the window is the wrong quantity. On the last day of a quiet week it holds
back capacity for somebody who has not wanted it, which is the waste this is meant to prevent
— and holding it early, or entirely, is what protects somebody who does all their work on the
last day.

#### Scenario: A quiet owner late in the window

- **WHEN** a window is nearly over and its owner has consumed little of their reserve
- **THEN** the Igor may use part of it

#### Scenario: Early in the window, the reserve is whole

- **WHEN** a window has recently reset
- **THEN** the full reserve is held back regardless of the owner's usage so far

#### Scenario: Something is always kept

- **WHEN** an owner has used none of their reserve and the window is almost over
- **THEN** some of it remains unavailable to the Igor
