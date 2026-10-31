## ADDED Requirements

### Requirement: A probe lapses when its Igor stops keeping it alive in the log

A probe SHALL lapse by what the execution log shows, so that every Igor sharing the scope of the
condition, the recurring fault `condition-backoff` stopped that scope for, judges the lapse
alike, whatever its role. While it works a probe item, the process that took
the probe SHALL append a *keepalive* row to the log every poll interval, at every second firing
of the timer that writes its heartbeat every half interval, naming its *probe row*,
the row `probe-claim` (#228) has an Igor append to bid for a probe. A probe SHALL *lapse*, as
#228 defines it, so that the log counts its probe row as ended and the scope may probe again, once three of
`role-config`'s maximum poll interval, 90 minutes, have passed since its latest keepalive row,
or since its probe row where it has none, by the reader's clock against the time in the row.
A keepalive append that has not landed within half a poll interval counts as failed, so it is
known as failed before the next is due. Where two keepalive appends in a row fail, the process SHALL stop the probe's worker, append a void row
naming its probe row, as #228 defines one, so that the stopped probe neither clears the
condition nor holds the scope, and give the claim back out loud, as `work-claiming`'s *A claim
that cannot be kept is given back, out loud* says. After its last keepalive landed, a
live probe is stopped within two and a half poll intervals, at most 75 minutes at the 30-minute
maximum that `role-config` sets; the 90-minute bound leaves 15 minutes beyond that, which covers the 5 minutes of clock skew between hosts that #228 assumes. Where the
void row cannot be written either, the probe row lapses after the 90 minutes (decision 61).
Neither a run time limit on the worker nor the heartbeat of the rank that took the probe, which
another role cannot see, SHALL decide anything about the lapse (Adam, 2026-10-24).

#### Scenario: A probe kept alive does not lapse

- **WHEN** a rank works a probe item for three hours, appending a keepalive row every poll
  interval
- **THEN** no Igor in the scope reads the probe as lapsed

#### Scenario: A prober whose keepalives keep failing stops

- **WHEN** a process working a probe item fails at two keepalive appends in a row, while its
  heartbeat writes still succeed
- **THEN** it stops the probe's worker, appends a void row naming its probe row, and gives the
  claim back out loud, before any Igor can count the probe lapsed

#### Scenario: Another role judges a dead prober's probe lapsed

- **WHEN** a rank of role `backend` took a probe on a seat it shares with role `frontend`, and
  crashed, and no keepalive row for that probe has landed for 90 minutes
- **THEN** a process of `frontend`, which cannot see `backend`'s heartbeat files, reads the probe
  as lapsed from the log alone
