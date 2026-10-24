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

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL record a per-source watermark so previously seen items are not reconsidered
indefinitely. A watermark is an efficiency measure only.

A cycle that decided nothing SHALL NOT advance the watermark. Where discovery ran to show
somebody what a cycle would decide, nothing was decided and nothing is settled, so the items it
examined remain exactly as unexamined as before it ran.

The watermark advances on a cycle that acted, even past the items triage decided to skip,
because deciding not to act on an item is still having considered it, and reconsidering it every
cycle would cost the model call again for the same answer. A preview decided nothing, so it has no
such reason. What it costs to hold the mark back is a later cycle paying for the same triage call,
which is the efficiency this requirement already declines to treat as governing. What advancing
costs is the items themselves: marked seen, never rediscovered, never worked.

A cycle has not acted on an item triage chose to work until it takes that item. Where a cycle does
not take one, because its budget ran out, a condition (a fault in the Igor's own configuration that
recurs on every item) stopped it part-way through, the tracker gave no answer to its claim, or its
process stood down for missed heartbeats (`work-claiming`'s *A retired rank does not hold its
items forever*, `concurrent-instances`, #179), the watermark SHALL NOT advance past that item. Passed by the mark, the item would be marked seen and 
never worked, with no decision against it to justify the loss.

Where the tracker answered the claim and refused it, the watermark SHALL advance past the item as
past one taken. Such a refusal is about the item or about what the Igor may do, such as a GitHub
App without permission to add the claim label, and a retry would be refused the same way until the
item or that permission changed. The watermark a cycle uses is one timestamp per source, so holding it below
the item would also triage every item updated after it again, each cycle, while the refusal
lasted. This accepts that the item, once passed, is reconsidered only after somebody edits or
comments on it.

#### Scenario: Seen items not re-triaged

- **WHEN** discovery runs twice with no intervening tracker activity
- **THEN** the second run performs no triage calls

#### Scenario: New items picked up

- **WHEN** an item is created after the last watermark
- **THEN** it appears in the next discovery run

#### Scenario: A preview leaves the mark where it found it

- **WHEN** a cycle runs to show what it would claim, and claims nothing
- **THEN** the stored watermark is unchanged
- **AND** a later cycle that acts still finds every item the preview examined

#### Scenario: An item chosen and never taken is seen again

- **WHEN** a cycle decides to work two items and stops after the first, because its budget ran
  out or a condition stopped its scope
- **THEN** the next cycle reconsiders the second

#### Scenario: An item whose claim got no answer is seen again

- **WHEN** a cycle decides to work an item and its claim fails because the tracker gave no answer,
  such as a server error or a request that never arrived, so nothing is posted on the item
- **THEN** the next cycle reconsiders that item

#### Scenario: An item whose claim the tracker refused is passed

- **WHEN** a cycle decides to work an item and the tracker answers its claim with a refusal: it
  rejects the request, or accepts it and the claim is not on the item when read back
- **THEN** the watermark advances past that item as past one the cycle took

#### Scenario: A cycle cut short by a stand-down holds its mark back

- **WHEN** a cycle decides to work two items, takes the first, and its process then stands down
  for missed heartbeats before attempting the second
- **THEN** the mark it appends is below the second item, and the next cycle reconsiders it

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
cycle whose process crashes first appends none. A cycle that stops early, a cycle whose process stood down
included, holds its mark back as *Watermarks reduce reconsideration without governing it*
(`condition-backoff`, #101, as this change modifies it) says.

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

- **WHEN** the deciding process's own rank has saved no mark for a source, and every rank that
  did is gone
- **THEN** discovery uses the lowest of those ranks' latest marks, not a cold start

#### Scenario: The fallback stops at the cold start's look-back

- **WHEN** no rank counts, and the lowest of every rank's latest mark is earlier than the
  look-back a source with no watermark gets
- **THEN** discovery uses the look-back

#### Scenario: A crash before the claims loses no item

- **WHEN** a process crashes after triage and before it has attempted every candidate
- **THEN** its cycle has appended no mark, and the items it meant to take are still above the
  mark discovery uses

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
