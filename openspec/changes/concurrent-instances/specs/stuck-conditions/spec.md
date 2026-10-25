## ADDED Requirements

### Requirement: A probe lapses when its Igor stops keeping it alive in the log

A probe SHALL lapse by what the execution log shows, so that every Igor sharing the scope of the
condition, the recurring fault `condition-backoff` stopped that scope for, judges the lapse
alike, whatever its role. While it works a probe item, the process that took
the probe SHALL append a *keepalive* row to the log every poll interval, naming its *probe row*,
the row `probe-claim` (#228) has an Igor append to bid for a probe. A probe SHALL *lapse*, as
#228 defines it, so that the log counts its probe row as ended and the scope may probe again, once three of
`role-config`'s maximum poll interval, 90 minutes, have passed since its latest keepalive row,
or since its probe row where it has none, by the reader's clock against the time in the row.
The longest gap between two keepalives is the maximum poll interval, 30 minutes, so the bound
leaves 60 minutes, two more missed keepalives, beyond it. That margin covers the 5 minutes of clock
skew between hosts that #228 assumes, with the rest left for a slow append.
The worker's ceiling, which this change removes, and the heartbeat of the rank that took the
probe, which another role cannot see, SHALL decide nothing about the lapse (Adam, 2026-10-24).

#### Scenario: A probe kept alive does not lapse

- **WHEN** a rank works a probe item for three hours, appending a keepalive row every poll
  interval
- **THEN** no Igor in the scope reads the probe as lapsed

#### Scenario: Another role judges a dead prober's probe lapsed

- **WHEN** a rank of role `backend` took a probe on a seat it shares with role `frontend`, and
  crashed, and no keepalive row for that probe has landed for 90 minutes
- **THEN** a process of `frontend`, which cannot see `backend`'s heartbeat files, reads the probe
  as lapsed from the log alone
