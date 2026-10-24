## 1. Reading the log

- [ ] 1.1 Give every probe row an identifier unique to it, and have a void row carry the
      identifier of the row it ends
- [ ] 1.2 In `probeRunning`, the probe row that holds the scope is the oldest probe row for the
      key, newer than the last occurrence, that has not ended or lapsed, in storage order. Read it
      as a partition's line order, earlier days first, which matches the order the store accepted
      the rows except at midnight (`design.md`, *The settle interval, and its one gap*). This
      replaces the walk that answers from the newest probe row
- [ ] 1.3 A void row ends only the probe row whose identifier it carries; a run row ends every
      earlier probe row naming its item, as now
- [ ] 1.4 Expose, beside `conditionOf`, which probe row holds the scope, so the caller can tell
      whether it is its own

## 2. Taking the probe

- [ ] 2.1 After appending its probe rows, the caller waits the probe settle interval, reads the log
      again, and takes the item only where the row holding the scope is its own for every key it
      probed
- [ ] 2.2 Give `appendRecord` an append deadline that bounds the whole append, retries included
      where #179's retry has landed, and set the probe settle interval above it
- [ ] 2.3 The read in 2.1 reads every partition fresh, bypassing `readLog`'s cache of past days
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

- [ ] 4.1 If #179's task 4.9 has landed when this is built, make a probe row whose rank is gone
      count as lapsed in 1.2's rule. If it has not, this build keeps `SWEEP_AFTER_MS`, and #179's
      task 4.9 must keep 1.2's rule when it changes the lapse
- [ ] 4.2 Measure how long an append to the state branch takes, retries included, to choose the
      append deadline, and record the figure in `design.md`
