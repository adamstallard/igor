## MODIFIED Requirements

### Requirement: A first run does not face the whole backlog

A source with no watermark SHALL consider only items updated within a bounded look-back window,
and items carrying the role's label, as *Every cycle considers the items its role's label holds*
says, and SHALL set its watermark from that run. It MUST NOT triage a repository's entire open
history because it has not run before. A run that decided nothing, such as a preview, does not
count as that first run and sets no watermark.

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

Discovery SHALL record a per-source watermark, an efficiency measure only, so seen items are not
reconsidered forever. A cycle that decided nothing SHALL NOT advance it. A cycle that acted
advances it, past skipped items too, but SHALL NOT advance it past an item triage chose
to work and the cycle did not take, as its budget ran out, a condition stopped it, its claim
got no answer, or its process stood down for missed heartbeats. A claim the tracker refused
SHALL pass the item as taken.

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

Where several processes save one source's watermark, discovery SHALL use the lowest latest mark
among its role's ranks that count, or, when none counts, the lowest of all ranks' latest marks
raised to a cold start's look-back if earlier. A process's own rank always counts; a sibling counts
only while not gone, as `work-claiming` bounds it, and once the process has seen its
heartbeat change since it started. A cycle SHALL append its mark only after attempting every
candidate it will attempt.

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

- **WHEN** one rank saves a mark for a source and later saves a later one, even from a later
  process start of that rank
- **THEN** only the later one counts for that rank, since a mark belongs to a role and a rank,
  never to one run or one process start

### Requirement: A rank holds its mark before a mention another rank answers

A rank that passes over a mention, because another available rank is first in its order,
SHALL keep its mark before the mention until it has an answer: a reply from the role's bot
account, unless the reply gives only the seats' reset time, or, for an answer that acts, the claim
it takes, once made. The order starts from the rank the mention's comment id hashes to, as
*Contention is resolved before a claim, not after it* computes an item's. A rank SHALL NOT answer
an answered mention.

#### Scenario: A mention another rank owns holds the mark back

- **WHEN** rank 1 passes over a mention because rank 2 is first in its order, and rank 2 has not
  answered it by the end of rank 1's cycle
- **THEN** rank 1's mark stays before the mention, so the mention and every item updated after it
  are read again at its next cycle
- **AND** if rank 2 is counted gone or unavailable before it answers, rank 1 finds itself first
  in the mention's order and answers the mention at a later cycle

#### Scenario: The next rank answers a mention its first rank did not

- **WHEN** the rank first in a mention's order is counted gone or unavailable before it answers
- **THEN** the next rank in that order finds itself first at a later cycle and answers the mention

#### Scenario: A mention's answering claim counts once made

- **WHEN** rank 2 answers a mention by acting on it, and has made the claim that action takes but
  not finished the action
- **THEN** the mention counts as answered, and rank 1's mark may pass it

#### Scenario: The reset time does not answer a mention

- **WHEN** no rank of the role is available, and the rank first in a mention's order has replied
  with the time the role's seats next reset
- **THEN** no rank counts that reply as the mention's answer, so the reply lets no mark pass the
  mention that this requirement holds before it

#### Scenario: A chat message is not a mention here

- **WHEN** a rank passes over a chat message another rank is first for
- **THEN** the Discord read marker's own rule governs it, not this one

### Requirement: Every cycle considers the items its role's label holds

Every cycle SHALL consider, besides the items updated after the mark discovery uses, every open
item that carries its role's label, whatever that item's update time, except an item
`pre-worker-breaker` (#173) has set down, which SHALL be passed over before claiming, though it
carries the label, until #173's *What lifts a set-down* lifts it.

#### Scenario: A set-down item is passed over though labelled

- **WHEN** #173 has set an item down and the role's label is still on it
- **THEN** no rank claims it until #173's *What lifts a set-down* lifts the set-down

#### Scenario: A crashed rank's claim below every mark is recovered

- **WHEN** a rank claims an item and crashes, a sibling appends a mark past the item, and the
  rank passes the abandonment bound
- **THEN** the sibling's next cycle still considers the item, and may take it over
