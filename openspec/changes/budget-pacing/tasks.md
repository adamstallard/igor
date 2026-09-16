## 1. Knowing where in the window it is

- [ ] 1.1 Derive elapsed fraction from the reset time already reported, per window
- [ ] 1.2 A window with no reset time contributes no pace line, and says so rather than
      defaulting to a position
- [ ] 1.3 Tests, including a window that has just reset and one about to

## 2. The line

- [ ] 2.1 `paceAllowance(share, target, elapsed)` — pure, and the only place the line is computed
- [ ] 2.2 The gate compares recorded spend against it, across both windows, tighter governing
- [ ] 2.3 A tolerance either side, named and reasoned rather than picked silently
- [ ] 2.4 Tests: ahead waits, behind proceeds, tighter window governs, small overshoot ignored

## 3. Saying so

- [ ] 3.1 A decline for pacing is a distinct reason from exhaustion and from an empty queue
- [ ] 3.2 It appears in the cycle report and the decision record
- [ ] 3.3 Test that an operator can tell the three apart from the record alone

## 4. The reserve

- [ ] 4.1 Decay the reserve toward the reset: on elapsed time where there is no recent
      observation, on the owner's consumption — `percentUsed − (Igor spend ÷ capacity)` — where
      there is; never early, never to nothing, and always less far on the clock alone
- [ ] 4.2 Cap the relaxation at `min(relaxed budget, throughput × time remaining)`, so the
      owner's remainder is not lowered for capacity nobody could have spent
- [ ] 4.3 The session reserve decays; the weekly one no further, and by default not at all
- [ ] 4.4 Tests for each boundary: an owner who does everything on the last day, a window with
      no observation, a relaxation larger than the remaining throughput, and the two windows
      treated differently on the same facts

## 5. Constants

- [ ] 5.1 Target utilisation, tolerance and the reserve decay's shape are configurable, with
      defaults marked provisional in the code until a seat has run a full week
- [ ] 5.2 Record what the defaults were reasoned from, since nothing has measured them
