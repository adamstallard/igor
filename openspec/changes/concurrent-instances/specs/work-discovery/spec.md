## MODIFIED Requirements

### Requirement: A first run does not face the whole backlog

A source with no watermark SHALL consider only items updated within a bounded look-back window,
and SHALL set its watermark from that run; it MUST NOT triage a repository's entire open history
because it has not run before. Items carrying the role's label are the exception, as *Every cycle
considers the items its role's label holds* says. A run that decided nothing, such as a preview,
SHALL NOT count as that first run and SHALL set no watermark.

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

Discovery SHALL keep a per-source watermark, an efficiency measure only, so seen items are not
reconsidered forever. A cycle that decided nothing SHALL NOT advance it; one that acted SHALL, even
past items triage decided to skip, but not past one triage chose to work and the cycle did not take
because its budget ran out, a condition stopped it, its claim got no answer, or its process stood
down for missed heartbeats. Where the tracker refused the claim, the watermark SHALL pass it as one
taken.

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

Where several processes save one source's watermark, discovery SHALL use the lowest latest mark of
its role's counting ranks: its own once saved, and a sibling only while the deciding process counts
it not gone, under `work-claiming`'s abandonment bound, and has seen its heartbeat change since it
started; where none counts, the lowest of every rank's latest mark, no earlier than a cold start's
look-back. A cycle SHALL append its mark only after attempting every candidate it will attempt.

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

#### Scenario: A restarted rank's marks replace its predecessor's

- **WHEN** rank 2 saves a mark for a source, crashes and restarts, and the new rank 2 saves a later
  mark
- **THEN** only the later mark counts for rank 2, since a mark belongs to a role and a rank, never
  to one run or one process start

#### Scenario: A cycle that stops early holds its mark back

- **WHEN** a cycle stops before taking an item triage chose to work, because its process stood down
  for missed heartbeats
- **THEN** the mark it appends holds back as *Watermarks reduce reconsideration without governing
  it* says

### Requirement: A passed-over rank keeps its mark before an unanswered request

A rank that passes over a request, a mention of the Igor, because another available rank is first
in the request's order, as *Every item has an owner and an order of ranks* computes from the
mention's comment id, SHALL keep its mark before that request until it has an answer: a reply from
the role's bot account or, where the answer acts, the claim that answer takes, once made. A rank
SHALL NOT answer a request that already has an answer.

#### Scenario: A mention another rank owns holds the mark back

- **WHEN** rank 1 passes over a mention because rank 2 is first in its order, and rank 2 has not
  answered it by the end of rank 1's cycle
- **THEN** rank 1's mark stays before the mention, and if rank 2 is counted gone before it answers, rank 1
  answers the mention at a later cycle

#### Scenario: The claim an acting answer takes answers the request

- **WHEN** rank 2, first in a mention's order, answers it by taking a claim, and has not yet done
  the action
- **THEN** the mention has an answer, and rank 1's mark may pass it

#### Scenario: An answered request is not answered again

- **WHEN** a rank finds a mention of the Igor that the role's bot account has already replied to
- **THEN** it does not answer it

#### Scenario: A chat message holds the read marker, not the mark

- **WHEN** a rank passes over a chat message because another available rank is first in its order
- **THEN** this requirement does not hold its mark, and `work-claiming`'s *A passed-over rank keeps
  the read marker before an unanswered chat message* applies instead

### Requirement: The next rank in a request's order answers what the first could not

If the rank first in a request's order is counted gone or unavailable before it answers, the next
rank in that order SHALL find itself first at a later cycle and answer the request.

#### Scenario: The next rank answers a mention its first rank cannot

- **WHEN** rank 1 passes over a mention because rank 2 is first in its order, and rank 2 becomes
  unavailable before answering it
- **THEN** rank 1 finds itself first at a later cycle and answers the mention

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
