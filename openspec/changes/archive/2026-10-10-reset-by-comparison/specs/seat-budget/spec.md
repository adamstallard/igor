## ADDED Requirements

### Requirement: A seat shut in both windows returns on the later of the two

Where a seat is blocked in both its session and its weekly window, and both returns can be
placed on a clock, the hour stated for that seat SHALL be the later of the two — whichever
window it belongs to, and however the figure was arrived at. A reading taken from the seat and a
figure derived from observations of it SHALL answer this question the same way.

The seat is back when the last thing holding it clears. Naming the earlier hour promises a
return the seat does not keep, and the size of the error does not matter: an hour that passes
with the Igor still held is the same false promise whether it was early by five hours or by five
days.

The rule is stated for the seat, not for a path. Two paths answer this question, one for a seat
whose usage the provider reports and one for a seat bounded by what was observed and recorded,
and both answer it about the same seat in the same handoff. A rule written into only one of them
can drift from the other, and nothing about a seat's credential bears on when its windows
reopen.

**Do not replace the comparison with a preference for the week.** The week is usually the later
of the two, so preferring it is right most of the time, but inside the last session of a week
instance the session returns later, and a preference for the week names an hour up to five hours
early there.

This governs which of a seat's own hours is stated. It does not change how seats are ordered
against each other: the seats that serve a role are back when the first of them is back, so the
earliest hour across those seats is still what a handoff states.

#### Scenario: The later hour is stated for a seat that could be read

- **WHEN** a seat's own reading reports both windows exhausted, the week returning at 5pm and
  the session at 8pm
- **THEN** the hour stated for that seat is 8pm
- **AND** the week's hour is not chosen for being the week's

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

#### Scenario: The role is still back on its earliest seat

- **WHEN** several seats that serve the role are each blocked in both windows
- **THEN** each seat answers with the later of its own two returns
- **AND** the role's stated return is the earliest of those

### Requirement: An hour is marked approximate where a stated reset does not fix it

An hour a handoff states SHALL be marked approximate where no reset the provider stated fixes
it: a cadence ceiling standing in for a reset a refusal never named, and an hour named while
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

The later of two stated hours is not marked. Comparing two returns the provider stated yields
one of them, the provider's own hour, chosen by ordering rather than substituted, and marking it
would tell a reader to doubt a figure that came from the same place as an unmarked one. A seat
blocked in both windows has a marked hour only where one of the two windows named no return,
because only then can the hour be early.

#### Scenario: A compared pair of stated hours is exact

- **WHEN** both of a seat's blocked windows name a provider-stated return and the later is taken
- **THEN** the hour stated is not marked approximate

#### Scenario: An unstated return still hedges the hour

- **WHEN** a seat is blocked in both windows and one of them names no return
- **THEN** the hour stated is marked approximate

#### Scenario: A cadence ceiling is still approximate

- **WHEN** the hour stated stands in for a reset the provider never named
- **THEN** it is marked approximate

#### Scenario: A tiled boundary is still exact

- **WHEN** the hour stated is the end of the instance a seat's spend was summed inside, tiled
  from a reset the provider stated
- **THEN** it is not marked approximate
