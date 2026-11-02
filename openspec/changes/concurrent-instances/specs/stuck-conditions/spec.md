## ADDED Requirements

### Requirement: A probe lapses when its Igor stops keeping it alive in the log

A probe SHALL *lapse* (#228's `probe-claim`) by the execution log alone: 90 minutes, three maximum poll intervals, after its latest
*keepalive* row, or its probe row where it has none, by the reader's clock against the row's
time. The process working the probe SHALL append a keepalive row naming its probe row every poll
interval, at every second heartbeat firing. Neither a run time limit nor the prober's heartbeat
SHALL decide the lapse.

#### Scenario: A probe kept alive does not lapse

- **WHEN** a rank works a probe item for three hours, appending a keepalive row every poll
  interval
- **THEN** no Igor in the scope reads the probe as lapsed

#### Scenario: Another role judges a dead prober's probe lapsed

- **WHEN** a rank of role `backend` took a probe on a seat it shares with role `frontend`, and
  crashed, and no keepalive row for that probe has landed for 90 minutes
- **THEN** a process of `frontend`, which cannot see `backend`'s heartbeat files, reads the probe
  as lapsed from the log alone

### Requirement: A prober whose keepalives fail twice in a row stops

A keepalive append that has not landed within half a poll interval SHALL count as failed. Where two
in a row fail, the process SHALL stop the probe's worker, append a void row naming its probe row, as
#228 defines one, and give the claim back out loud, as `work-claiming`'s *A claim that cannot be
kept is given back, out loud* says. Where the void row cannot be written either, the probe row
lapses 90 minutes after its latest keepalive row, or after its own time where it has none.

#### Scenario: A prober whose keepalives keep failing stops

- **WHEN** a process working a probe item fails at two keepalive appends in a row, while its
  heartbeat writes still succeed
- **THEN** it stops the probe's worker, appends a void row naming its probe row, and gives the
  claim back out loud, before any Igor can count the probe lapsed
