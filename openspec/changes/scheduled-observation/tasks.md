## 1. The command

- [ ] 1.1 `igor observe` — take one reading, append an observation per window it reports, exit
      non-zero if it could not read
- [ ] 1.2 Reuse `parseUsage` and the observation record `capacity-from-observation` defines;
      define no shape and no log of its own
- [ ] 1.3 A reading that yields no figures records nothing, and never carries a previous figure
      forward
- [ ] 1.4 Tests: one reading appends one row per window, a second appends rather than replaces,
      a failed reading writes nothing

## 2. Refusing a credential that cannot answer

- [ ] 2.1 Detect the seat-credential case — no subscription resolved, a per-invocation cost
      summary in place of window figures — and refuse with that reason
- [ ] 2.2 The refusal is distinct from a parse failure and from a missing credential
- [ ] 2.3 Tests for all three, so the message an operator sees names the actual condition

## 3. The schedule

- [ ] 3.1 Half-hourly, against a five-hour session window; the reading is free, so freshness is
      the only term
- [ ] 3.2 A gap between observations is not an error anywhere and is never interpolated
- [ ] 3.3 Failures go to a log and a non-zero exit, not to a notification on the lender's machine
- [ ] 3.4 Tests: a long gap raises nothing, a waking machine records one reading and not the
      missed ones

## 4. Measuring the window

- [ ] 4.1 Derive a window's length from the difference between two observed reset instants;
      depends on `capacity-from-observation` task 1.2 resolving the reset phrase
- [ ] 4.2 Until two differing resets exist a built-in length stands, reported as a built-in;
      a window length supplied in configuration is rejected
- [ ] 4.3 The derived length is what supplies the cadence `capacity-from-observation` task 3.1
      bounds its numerator with, so capacity from a first observation still derives
- [ ] 4.4 Tests: five hours from the two measured resets, a first observation still derives
      capacity, the measured length supersedes the built-in, a changed spacing changes it

## 5. Publishing what was read

- [ ] 5.1 Append through the existing path; a publish that fails for want of write access fails
      the command and names that access
- [ ] 5.2 A publish failure is reported as a publish failure, not as a failed reading
- [ ] 5.3 Test both, since the two failures have different remedies and different owners

## 6. Installing it

- [ ] 6.1 launchd LaunchAgent, user crontab and `systemd --user` timer, each a single paste,
      each with a one-line removal — see `design.md`
- [ ] 6.2 Verify each on the platform it targets, including that the job finds `claude` without
      a shell profile and does not inherit a seat token from one
- [ ] 6.3 Verify the wake behaviour on each: one catch-up run after a suspend, not one per
      missed interval

## 7. Saying how fresh a figure is

- [ ] 7.1 The age of the newest observation is what surfaces a stopped job, through the budget
      report `capacity-from-observation` task 5.1 already specifies
- [ ] 7.2 Test that a seat whose observations have stopped is distinguishable from one never
      observed

## 8. What this unlocks

- [ ] 8.1 `budget-pacing`'s reserve decay gains its observation-informed state; the requirement
      stays there and nothing here restates it
- [ ] 8.2 Issue for a deposit path that does not require push access to the lore repository,
      since that access is what excludes a lender outside the team
- [ ] 8.3 Issue for the staleness threshold, to be fitted with the other constants once a week
      of observations exists
