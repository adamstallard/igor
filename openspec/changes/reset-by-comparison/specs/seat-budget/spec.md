## ADDED Requirements

### Requirement: A seat shut in both windows returns on the later of the two

Where a seat is blocked in both its session and its weekly window, and both returns can be
placed on a clock, the hour stated for that seat SHALL be the later of the two — whichever
window it belongs to, and however the figure was arrived at. A reading taken from the seat and a
figure derived from observations of it SHALL answer this question the same way.

The seat is back when the last thing holding it clears. Naming the earlier hour states a return
the seat does not keep, and the size of the error is not what makes it wrong: an hour that
passes with the Igor still held is the same false promise whether it was early by five hours or
by five days.

Stating it once, for the seat rather than for a path, is the point. Two paths answer this
question — one for a seat whose usage the provider reports, one for a seat bounded by what was
observed and recorded — and they answer it about the same seat in the same handoff. A rule that
holds only where it happens to be written is a rule the other path can drift away from again,
which is what happened: the derived path compared the two hours while the live path took the
week by preference, and inside the last session of a week instance — where the session's return
is the later — the live path named an hour up to five hours early.

The preference was not wrong about the common case. The week is the later of the two except
inside the last session of one. It is wrong that a policy was decided per path, because
correctness then depends on which path a seat happens to take, and nothing about a seat's
credential bears on when its windows reopen.

This governs which of a seat's own hours is stated. It does not change how seats are ordered
against each other: a pool is back when its first seat is back, so the earliest hour across
seats is still what a handoff states.

#### Scenario: The later hour is stated for a seat that could be read

- **WHEN** a seat's own reading reports both windows exhausted, the week returning at 5pm and
  the session at 8pm
- **THEN** the hour stated for that seat is 8pm
- **AND** it is not the week's hour on the grounds that it is the week's

#### Scenario: The later hour is stated for a seat that could not be read

- **WHEN** a seat with no reading is blocked in both windows by what was observed and recorded
- **THEN** the hour stated for that seat is the later of the two returns

#### Scenario: Both paths answer alike

- **WHEN** two seats are blocked in both windows with the same two return times, one judged on
  its own reading and one on derived figures
- **THEN** the same hour is stated for each

#### Scenario: A return that cannot be placed is not ordered against

- **WHEN** one of a seat's two blocked windows names no return, or names one that cannot be
  resolved to a comparable instant
- **THEN** the hour stated for that seat is not arrived at by comparing the two
- **AND** which hour is stated is decided by the rules already governing an unplaceable return,
  which this requirement does not disturb

#### Scenario: The pool is still back on its earliest seat

- **WHEN** several seats in a pool are each blocked in both windows
- **THEN** each seat answers with the later of its own two returns
- **AND** the pool's stated return is the earliest of those

### Requirement: An hour is marked approximate where a stated reset does not fix it

An hour a handoff states SHALL be marked approximate where no reset the provider stated fixes
it — a cadence ceiling standing in for a reset a refusal never named, and an hour named while
another window that is also holding the seat named no return. An hour the provider stated, and a
window boundary tiled from one along the window's own cadence, SHALL NOT be marked.

The flag says what kind of claim the hour is, and a person reads it in the sentence: a marked
hour is reported as "back around" and an unmarked one as "back at". So the line it draws has to
be one a reader can act on, and the line is whether a stated reset fixes the hour, not whether
the provider printed those exact words. A boundary reached by tiling is fixed: instances tile
the timeline, so one stated reset places every boundary before and after it by subtraction, and
an instance end computed that way is as exact as the reset it came from. A cadence ceiling is
not: nothing was stated, and the hour is a bound on how late the return can be rather than the
return.

Taking the later of two stated hours narrows what the flag covers. A comparison between two
returns the provider stated yields one of those returns — the provider's own hour, arrived at by
ordering rather than by substitution — and marking it would tell a reader to doubt a figure that
came from the same place as an unmarked one. Before this change the flag was raised on every
seat blocked in both windows, because the hour was reached by a preference and could be early.
With the comparison it can be early only where one of the two windows named no return, and that
is the case that still raises it.

#### Scenario: A compared pair of stated hours is exact

- **WHEN** both of a seat's blocked windows name a provider-stated return and the later is taken
- **THEN** the hour stated is not marked approximate

#### Scenario: An unstated return still hedges the hour

- **WHEN** a seat is blocked in both windows and one of them names no return
- **THEN** the hour stated is marked approximate

#### Scenario: A cadence ceiling is still approximate

- **WHEN** the hour stated stands in for a reset the provider never named
- **THEN** it is marked approximate, as before

#### Scenario: A tiled boundary is still exact

- **WHEN** the hour stated is the end of the instance a seat's spend was summed inside, tiled
  from a reset the provider stated
- **THEN** it is not marked approximate, as before
