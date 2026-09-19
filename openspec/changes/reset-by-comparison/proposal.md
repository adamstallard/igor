## Why

Two paths pick the hour a handoff states, and they pick it differently.

`derivedWindow` — the path for a seat nothing could read — compares a seat's two blocked windows
and takes the later. The live path — the one for a seat whose usage the provider reports — takes
the week, by preference, without comparing. They disagree inside the last session of a week
instance, where the session's return is the later of the two. There the live path names an hour
up to five hours early, and a handoff says Igor is back before it is.

**It is pre-existing, and that was verified rather than assumed.** At reserve `0.57` with the
week at 44% used — an exact figure, no float residue — `HEAD` before `71e1014` returns the same
too-early hour with `resetApproximate: true`. `71e1014` widened the trigger set by the 179
(reserve, used) pairs it brought into the both-windows-shut state: marginally more reachable
than it was, not newly reachable.

**Nothing in force settles it, which is why this is a proposal and not a bug fix.** All 17
in-force `seat-budget` requirements were read after `capacity-from-observation` archived in
`f79e648`. None of them says which window's hour is named when both are shut — no "later of", no
"by preference". The nearest text is `Scenario: The reset time reaches the handoff` — "the reset
time recorded with the observation is what the handoff states" — which is singular and silent on
two. `graceful-handoff`'s "A budget handoff states when capacity returns" requires an hour and
says nothing about which. So the behaviour is underspecified rather than contradicted, and the
fix is to add the specificity before changing the code to match it.

**The deferral was never argued against on its merits.** The preference was recorded in
`capacity-from-observation`'s design, now archived at
`openspec/changes/archive/2026-09-19-capacity-from-observation/design.md:69-78`:

> Where both of its windows are shut the live path takes the week by preference rather than by
> comparing the two hours. The week is the later of the two except inside the last session of
> one, so that preference is early by under five hours where naming the session is early by up
> to a week. It is a policy and not a limit on what can be ordered — `resolveReset` would place
> both — and it is **left as it stands rather than decided in passing**.

Read what that argues. "Early by under five hours where naming the session is early by up to a
week" is an argument against **naming the session unconditionally**. It is not an argument
against **comparing**, which is early by nothing. The note says so itself — "a policy and not a
limit on what can be ordered" — and then declines to decide. Comparing beats both of the options
it weighed, and it was never the one weighed against them.

Two things are true now that were not when it was deferred. `derivedReset` already takes the
later, so the preference is no longer one consistent policy but one of two paths behaving
differently, with nothing in the record giving a reason for the difference. And the archive is
history: the note cannot be amended in place, so the policy it deferred has to be settled in
force or not at all.

## What Changes

**A seat shut in both windows returns on the later of the two, on both paths.** The requirement
is written about the seat, not about a path: however the two hours were arrived at — read from
the provider, or derived from observations and record — the seat's stated hour is the later of
them. The defect is not that one path is wrong; it is that the question has two answers, and a
rule that lives in one path is a rule the other can drift away from again.

**`resetApproximate` narrows, and its meaning is stated.** Today the flag means "not a return
the provider stated", and it is raised on every seat blocked in both windows because the week
was reached by preference and could be early. With the comparison, a pair of stated hours yields
one of those stated hours — the provider's own, arrived at by ordering rather than substitution
— so the flag is not raised for it. What it still covers is a cadence ceiling standing in for a
reset a refusal never named, and a blocked window whose return is unknown but bounded by its own
length. The flag keeps its meaning and loses one case; the handoff stops hedging an hour it does
not need to hedge.

**Ordering across seats is untouched.** A pool is back when its first seat is back. Each seat
answers with the later of its own two returns, and the earliest of those is still what the
handoff states.

Explicitly out of scope:

- **A blocked window whose return cannot be placed on a clock.** The two paths also differ here:
  the derived path takes a seat off the clock entirely where any blocked window names no
  instant, and the live path names the week's hour, hedged, where the session named none.
  That divergence *is* argued — a rolling sum has no boundary at all, where a session that named
  no reset is bounded by its five-hour cadence — in the archived design and in the comment at
  `src/budget.ts`'s `describeWindow`, which calls it deliberate. Overturning a reasoned decision
  the issue never raises, inside a change about a decision that was never reasoned, would hand
  back a spec that looks settled on a point nobody settled. The added requirement therefore
  applies only where both returns can be placed, and says so.
- **Anything about which seat a pool picks.** `chooseSeat` is untouched. This is only about the
  hour stated once no seat could be picked.
- **`graceful-handoff`.** "A budget handoff states when capacity returns" is the consumer of
  this rule, not a participant in it, and needs no amendment: it requires an hour, and this says
  which one.
- **The `describeWindow` report.** Per-window reporting shows each window's own reset beside its
  own figures. There is no comparison to make there and no hour standing for the seat as a
  whole.

## Capabilities

### Modified Capabilities

- `seat-budget`: a seat blocked in both windows returns on the later of the two, stated once for
  the seat rather than per path; and `resetApproximate` means "not a return the provider stated"
  with the both-windows case no longer among them.

Both deltas are `ADDED`. The tempting `MODIFIED` target is "A seat at 100% is spent until its
window resets", but that requirement is scoped to observations — it is the derived path's own
text, and hanging the rule off it would re-entrench exactly the split being removed. A
requirement about the hour a seat states, independent of how the figure was reached, is what
makes the divergence hard to reintroduce.

## Impact

- Removes a handoff that says Igor is back before it is, in the one state where the week is not
  the later window.
- Removes a hedge from the hour in the common case: two stated hours compared is the provider's
  own answer, and reads as one.
- Implementation lands in `src/budget.ts`, in the `live` block of `budgetGate` and the `Gate`
  doc comment that documents the preference. `derivedReset` already behaves as required and is
  expected not to change.
- One test pins the behaviour being changed and must change with it —
  `test/budget.test.ts:1617`. A second, at `test/budget.test.ts:1722`, keeps its assertions but
  justifies itself by a policy that stops existing.
