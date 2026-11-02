## ADDED Requirements

### Requirement: A probe lapses when its Igor stops keeping it alive in the log

The process working a probe item SHALL append a *keepalive* row to the log every poll interval, on
every second heartbeat firing, naming its *probe row*, its bid under `probe-claim` (#228). The
probe SHALL *lapse*, as #228 defines it, 90 minutes, three maximum poll intervals, after its latest
keepalive row, or its probe row where it has none, by the reader's clock against the row's time. A
live probe is stopped before then: within two and a half poll intervals of its last landed
keepalive.

#### Scenario: A live probe whose keepalives fail is stopped two and a half intervals on

- **WHEN** a prober's keepalive lands, and the next two, due one and two poll intervals after it,
  each have not landed half a poll interval after they were due
- **THEN** the second counts as failed two and a half poll intervals after the last landed
  keepalive, and the process stops the probe then, at most 75 minutes at the 30-minute maximum,
  before the 90 minutes after which the probe lapses

#### Scenario: A probe kept alive does not lapse

- **WHEN** a rank works a probe item for three hours, appending a keepalive row every poll
  interval
- **THEN** no Igor in the scope reads the probe as lapsed

#### Scenario: Another role judges a dead prober's probe lapsed

- **WHEN** a rank of role `backend` took a probe on a seat it shares with role `frontend`, and
  crashed, and no keepalive row for that probe has landed for 90 minutes
- **THEN** a process of `frontend`, which cannot see `backend`'s heartbeat files, reads the probe
  as lapsed from the log alone

### Requirement: A prober whose keepalives fail twice in a row stops and voids its probe

A keepalive append that has not landed within half a poll interval SHALL count as failed. Where
two in a row fail, the process SHALL stop the probe's worker, append a void row naming its probe
row, as #228 defines one, so that the stopped probe neither clears the condition nor
holds the scope, and give the claim back as `work-claiming`'s *A claim that cannot be kept is
given back, out loud* says. Where the void row cannot be written either, the probe row lapses
after the 90 minutes.

#### Scenario: A prober whose keepalives keep failing stops

- **WHEN** a process working a probe item fails at two keepalive appends in a row, while its
  heartbeat writes still succeed
- **THEN** it stops the probe's worker, appends a void row naming its probe row, and gives the
  claim back out loud, before any Igor can count the probe lapsed

### Requirement: Only the execution log decides a probe's lapse

A probe SHALL lapse by what the execution log shows, for an Igor of any role. Neither a run time limit on the probe's worker nor the heartbeat
of the rank that took the probe, which another role cannot see, SHALL decide anything about the
lapse.

#### Scenario: A worker's run time limit does not decide a lapse

- **WHEN** a probe's worker runs past a run time limit while its keepalive rows keep landing
- **THEN** no Igor in the scope reads the probe as lapsed

#### Scenario: A live heartbeat does not keep a probe from lapsing

- **WHEN** the rank that took a probe keeps writing its heartbeat, but no keepalive row for the
  probe has landed for 90 minutes
- **THEN** every Igor in the scope, of the prober's role or another, reads the probe as lapsed
