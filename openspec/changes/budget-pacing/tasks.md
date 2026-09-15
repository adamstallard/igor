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

- [ ] 4.1 Narrow the reserve only late in a window and only where the owner is behind their own
      pace; never to nothing
- [ ] 4.2 Tests for each boundary, including an owner who does everything on the last day

## 5. Constants

- [ ] 5.1 Target utilisation, tolerance and decay threshold are configurable, with defaults
      marked provisional in the code until a seat has run a full week
- [ ] 5.2 Record what the defaults were reasoned from, since nothing has measured them
