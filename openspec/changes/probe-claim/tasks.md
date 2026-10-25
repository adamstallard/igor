## 1. Reading the log

- [ ] 1.1 Give every probe row an identifier unique to it, and have a void row carry the
      identifier of the row it ends
- [ ] 1.2 In `probeRunning`, the probe row that holds the scope is the oldest probe row for the
      key, newer than the last occurrence, that has not ended or lapsed, in storage order. Read it
      as a partition's line order, earlier days first, which matches the order the store accepted
      the rows except at midnight (`design.md`, *The settle interval, and its one gap*). This
      replaces the walk that answers from the newest probe row
- [ ] 1.2a The lapse 1.2 uses is the one the code on `main` has when this is built. Where #179's
      task 4.9 has landed, a probe row lapses once 90 minutes pass after its latest keepalive
      row, or after the probe row itself where it has none; otherwise it lapses after
      `SWEEP_AFTER_MS`, as now. Tests for whichever rule is on `main`: under the keepalive rule, a
      row whose keepalives stopped 91 minutes ago, or that never had one and is 91 minutes old,
      has lapsed, and a row with a keepalive 89 minutes old has not; under `SWEEP_AFTER_MS`, a row
      older than it has lapsed and a younger one has not
- [ ] 1.3 A void row ends only the probe row whose identifier it carries; a run row ends every
      earlier probe row naming its item, as now
- [ ] 1.4 Expose, beside `conditionOf`, which probe row holds the scope, so the caller can tell
      whether it is its own

## 2. Taking the probe

- [ ] 2.1 After appending its probe row, the caller waits the probe settle interval, reads the log
      again, and goes on only where the row holding the scope is its own. An item that would probe
      several keys bids for them one at a time, in key order, appending the next key's row only
      once the previous one decides, and is taken only where its row decides for every key; change
      `probe` in `src/wiring.ts`, which appends every key's row at once (proposal, decision 5)
- [ ] 2.2 Give a probe row's append, and no other append, a deadline that bounds the whole
      append, retries included where #179's retry has landed, and set the probe settle interval
      to the longer of twice that deadline and the deadline plus 5 minutes (proposal, decision 9).
      Do task 4.1, the measurement of an append to the state branch (the git branch the log is
      written to), before this one, since the deadline is set from it
- [ ] 2.3 The read in 2.1 reads every partition from yesterday on fresh, by the reader's clock and
      a later day's included, bypassing `readLog`'s cache of past days, which may still serve
      earlier days; where any partition's read fails,
      it fails as a whole, rather than return a shorter log that looks whole, and the caller
      voids its rows
- [ ] 2.4 Every path that appended a probe row and takes no item appends a void row naming it: a
      row that does not decide, a row that decides for one key and not another, a read that
      fails, and a lost claim. The code already voids on a lost claim
- [ ] 2.5 A probe-row append that throws or passes its deadline takes no item, and appends a void
      row naming the row it tried to write
- [ ] 2.6 Apply 2.1 to 2.5 at every caller: both loops in `src/serve.ts`, and the claim, catch-up
      and cycle paths in `src/cli.ts`

## 3. Tests

- [ ] 3.1 Write the test #226 describes under candidate 4, two Igors racing for one probe, which
      bug-hunter wrote and deleted; check it fails on `main`, then make it pass
- [ ] 3.2 One test per scenario in the `stuck-conditions` delta

## 4. Coordination and measurement

- [ ] 4.1 Measure how long an append to the state branch takes, retries included, to choose the
      append deadline, and record the figure in `design.md`
- [ ] 4.2 Measure whether a read through GitHub's contents API returns every write another client
      has landed, which the probe settle interval assumes; where it does not, report it to Adam
      before 2.1 ships
- [ ] 4.3 Once 4.1 sets the append deadline, check that each lapse bound, `SWEEP_AFTER_MS` and
      #179's 90 minutes after the latest keepalive, still exceeds by 5 minutes the longest a
      live Igor's probe row can go before the run row that ends it or its first keepalive,
      counting one probe settle interval per key and `work-claiming`'s settle interval for the
      claim; report to Adam where one does not
