## Why

A seat blocked in both its windows comes back when the later of the two reopens, but the live
path, for a seat whose usage the provider reports, named the week's hour without comparing.
Inside the last session of a week the session reopens later, so a handoff said Igor would be
back up to five hours before it was. The other path, `derivedReset`, for a seat nothing could
read, already took the later of the two.

**No requirement in force says which hour is named.** None of the 17 `seat-budget` requirements
says which window's hour a seat states when both are shut. The nearest, *Scenario: The reset time
reaches the handoff*, speaks of a single reset time. `graceful-handoff`'s *A budget handoff states
when capacity returns* requires an hour without saying which. So the behaviour is unspecified
rather than contrary to the spec, and this change adds the requirement for the code to follow.

**The preference for the week was deferred, never decided.** `capacity-from-observation`'s
design, archived at
`openspec/changes/archive/2026-09-19-capacity-from-observation/design.md:69-78`, recorded it as
*"left as it stands rather than decided in passing"*. Its argument weighs preferring the week,
early by under five hours, against naming the session unconditionally, early by up to a week.
Comparing the two hours is early by neither, and the note never weighed it. An archived design
cannot be amended, so the question can only be settled by a requirement in force.

**The defect predates `71e1014`.** At reserve `0.57` with the week 44% used, the code before
`71e1014` names the same early hour. `71e1014` made the state slightly more reachable, adding 179
(reserve, used) pairs that reach both windows shut, but did not create it.

## What Changes

**A seat shut in both windows returns on the later of the two, whichever path computed the
hours.** The requirement is about the seat, not a path: whether the hours were read from the
provider or derived from observations, the stated hour is the later one. Stating it once for the
seat keeps the two paths from diverging again.

**`resetApproximate` is raised only where no stated reset fixes the hour.** Before this change it
was raised on every seat blocked in both windows, because the week was chosen by preference and
could be early. Comparing two stated hours yields one of them, the provider's own, so it is no
longer raised for that.

The test is whether a stated reset fixes the hour. A window boundary computed from a stated reset
by the window's own cadence is exact, because a window's instances tile the timeline, so it is not
marked. An hour that no stated reset fixes is marked: a cadence ceiling standing in for a reset a
refusal never named, or an hour named while another window holding the seat named no return.
Every case keeps the marking it had, except the both-windows-shut hour, which is no longer marked.

**Ordering across seats is unchanged.** A role's seats are back when the first of them is back:
each seat states the later of its own two returns, and the handoff states the earliest of those.

Out of scope:

- **A blocked window whose return cannot be placed on a clock.** The two paths differ here too.
  The derived path takes the seat off the clock when any blocked window names no instant, while
  the live path names the week's hour, marked approximate, when the session named none. That
  difference was decided with its reason, in the archived design and at `describeWindow` in
  `src/budget.ts`: a rolling sum has no boundary, while a session that named no reset is still
  bounded by its five-hour cadence. This change leaves it alone, so the new requirement applies
  only where both returns can be placed, and says so.
- **Which seat is picked.** `chooseSeat` is unchanged. This concerns only the hour stated once no
  seat could be picked. #148 changes seat choice to the most headroom, with the soonest reset
  breaking ties, which changes which seat is picked, not which hour is stated when none is.
- **`graceful-handoff`.** It requires a budget handoff to state an hour, and this change says
  which hour, so it needs no amendment.
- **The `describeWindow` report.** It shows each window's own reset beside that window's figures,
  and states no hour for the seat as a whole.

## Capabilities

### Modified Capabilities

- `seat-budget`: a seat blocked in both windows returns on the later of the two, stated once for
  the seat rather than per path; and an hour is marked approximate where no stated reset fixes
  it, which no longer includes the both-windows case.

Both deltas are `ADDED`. The obvious `MODIFIED` target, *A seat at 100% is spent until its window
resets*, is about observations, which is the derived path's own text, so hanging this rule on it
would tie the rule to one path again. A requirement about the hour a seat states, however its
figures were reached, is what keeps the paths from diverging.

## Impact

- A handoff no longer says Igor is back before it is, in the one state where the week is not the
  later window.
- In the common case the hour is no longer marked approximate: comparing two stated hours gives
  the provider's own answer.
- `src/budget.ts`: the live block of `budgetGate` compares the two hours, and the `Gate` doc
  comment describes the comparison instead of the preference. `derivedReset` already took the
  later hour and is unchanged.
- `test/budget.test.ts`: the two tests that asserted the week preference now assert the
  comparison, and new tests cover a later week, a session whose reset phrase places nowhere, a
  read seat and a derived seat stating the same hour, the earliest hour across a pool, and a seat
  shut by one window that named no reset.
