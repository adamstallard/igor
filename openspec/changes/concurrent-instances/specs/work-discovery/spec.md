## MODIFIED Requirements

### Requirement: A first run does not face the whole backlog

A source with no watermark SHALL consider only items updated within a bounded look-back window,
and SHALL set its watermark from that run. It MUST NOT triage a repository's entire open
history because it has not run before. Items carrying the role's label are the one exception: a first run
considers them whatever their update time, as *Every cycle considers the items its role's label
holds* says.

Without the bound, an Igor pointed at an established repository wakes up facing every open
item at once — a cost spike, and an Igor appearing to lay claim to years of open work in its
first minute. Handing it the backlog stays something a person does deliberately.

A run that decided nothing, such as a preview, does not count as that first run and sets no
watermark. What stops the
next run re-facing the backlog is the bound, which applies to every run with no watermark however
many previews preceded it; setting the mark only determines where a run that *acted* continues
from. So a preview of a first run leaves the next run still a first run, still bounded, and this
requirement's purpose is untouched.

#### Scenario: Established repository does not flood the first cycle

- **WHEN** a source runs for the first time against a repository with a long open history
- **THEN** only items updated within the look-back window are considered
- **AND** the watermark is set so the next run continues from there

#### Scenario: A cold start is distinguishable in the record

- **WHEN** an operator reads the record of a first run
- **THEN** it is identifiable as a cold start
- **AND** the count of items considered can be read in that context

#### Scenario: A preview of a first run leaves it a first run

- **WHEN** a source with no watermark is previewed rather than worked
- **THEN** no watermark is set
- **AND** the next cycle is still a cold start, still bounded by the look-back window, and is
  still identifiable as a cold start in the record it writes

#### Scenario: A first run still considers the role's labelled items

- **WHEN** a source runs for the first time, and an open item carrying the role's label was last
  updated before the look-back window
- **THEN** the run considers that item

## ADDED Requirements

### Requirement: A conflicted state write discards nothing

Where two processes write state concurrently and one is rejected, the rejected write SHALL be
retried, and the retry MUST NOT discard a record the other process wrote. This SHALL hold for
every state file more than one process writes.

A cycle SHALL NOT fail because of a conflicted write.

#### Scenario: Two processes advance state at once

- **WHEN** two processes write state concurrently and one is rejected
- **THEN** it retries and succeeds
- **AND** both records are present afterwards

#### Scenario: A retry does not overwrite the winner

- **WHEN** a write is retried after losing to another process
- **THEN** the record written by the other process is still present

#### Scenario: A conflict is not a failed cycle

- **WHEN** a write conflicts and the retry succeeds
- **THEN** the cycle reports no failure

### Requirement: Discovery may hand the same candidate to several processes

Where several processes run one role, discovery MAY return one candidate to more than
one of them, and that SHALL NOT be prevented by coordination.

#### Scenario: Overlapping discovery

- **WHEN** two processes discover the same candidate in one cycle
- **THEN** both may triage it, and the claim protocol decides which works it

### Requirement: Processes saving one source keep the lower watermark

Where several processes save the watermark of one source, each rank's latest mark for that
source SHALL count, for each rank of the saving process's role, and the mark discovery uses
SHALL be the lowest of them. A mark belongs to a role and a rank, never to one run or one
process start: a restarted rank's later marks replace its predecessor's. A sibling's mark
SHALL count only while the deciding process counts that rank as not gone, under the abandonment
bound that `work-claiming` defines, and only once the deciding process has seen that rank's
heartbeat change since it started. A process's own rank's mark always counts.

When no rank counts, discovery SHALL use the lowest of every rank's latest mark, but no earlier
than the look-back a source with no watermark gets.

A cycle SHALL append its mark only after it has attempted every candidate it will attempt, and a
cycle whose process crashes first appends none. A cycle that stops early holds its mark back as
*Watermarks reduce reconsideration without governing it* says. That requirement is cited as
`condition-backoff` (#101) words it; #101 archives before this change. A cycle whose process stands down SHALL hold
its mark back as that requirement holds it for a cycle whose budget ran out.

#### Scenario: A lagging rank holds the mark down

- **WHEN** rank 1 has saved a mark later than rank 2's for the same source, neither is gone,
  and the deciding process has seen both heartbeats change since it
  started
- **THEN** discovery uses rank 2's mark

#### Scenario: A gone rank stops holding it

- **WHEN** rank 2 is gone
- **THEN** its mark no longer counts, and discovery uses the lowest mark among the ranks that do

#### Scenario: A rank not yet seen alive does not hold the mark down

- **WHEN** a process restarts, and a sibling rank's latest mark is lower than every other, and
  the process has not yet seen that rank's heartbeat change
- **THEN** that rank's mark does not count

#### Scenario: Every rank gone

- **WHEN** every rank that saved a mark for a source is gone
- **THEN** discovery uses the lowest of those ranks' latest marks, not a cold start

#### Scenario: The fallback stops at the cold start's look-back

- **WHEN** no rank counts, and the lowest of every rank's latest mark is earlier than the
  look-back a source with no watermark gets
- **THEN** discovery uses the look-back

#### Scenario: A crash before the claims loses no item

- **WHEN** a process crashes after triage and before it has attempted every candidate
- **THEN** its cycle has appended no mark, and the items it meant to take are still above the
  mark discovery uses

#### Scenario: A cycle cut short holds its mark back

- **WHEN** a cycle stops attempting candidates before the last one, because its process stood
  down
- **THEN** the mark it appends is below the oldest candidate it did not attempt

#### Scenario: A rank's own later save replaces its earlier one

- **WHEN** one rank saves a mark for a source and later saves a later one
- **THEN** only the later one counts for that rank

### Requirement: Every cycle considers the items its role's label holds

Every cycle SHALL consider, besides the items updated after the mark discovery uses, every open
item that carries its role's label, whatever that item's update time.

#### Scenario: A crashed rank's claim below every mark is recovered

- **WHEN** a rank claims an item and crashes, a sibling appends a mark past the item, and the
  rank passes the abandonment bound
- **THEN** the sibling's next cycle still considers the item, and may take it over
