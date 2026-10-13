## ADDED Requirements

### Requirement: A conflicted state write discards nothing

Where two processes write state concurrently and one is rejected, the rejected write SHALL be
retried, and the retry MUST NOT discard a record the other process wrote.

The conflict cannot be laid out away. Measured against a contents API that commits per file:
two concurrent writes to *different* paths on one branch are still rejected, because the
conflict is on the branch reference rather than on the file. Per-process files buy nothing, so
retrying is the only option and being correct while retrying is the whole requirement.

A cycle SHALL NOT fail because of a conflicted write. Losing a race with a sibling is ordinary
operation, and reporting it as a failure makes normal concurrency read as a defect.

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

Watermarks are a cache, so an overlap costs duplicated triage rather than duplicated work, and
the claim protocol resolves the rest. Preventing the overlap would need a coordinator, which
polling exists to avoid.

#### Scenario: Overlapping discovery

- **WHEN** two processes discover the same candidate in one cycle
- **THEN** both may triage it, and the claim protocol decides which works it

#### Scenario: Duplicated triage is visible

- **WHEN** processes overlap
- **THEN** the cost appears in the decision record rather than being hidden

### Requirement: Processes saving one source keep the lower watermark

Where several processes save the watermark of one source, each rank's latest mark for that
source SHALL count, and the mark discovery uses SHALL be the lowest of them. A rank past the
abandonment bound, which `work-claiming` defines, SHALL stop counting.

The two possible errors cost different things. A mark that is too low makes a process triage
some items again, which costs a model call per item. A mark that is too high skips items another
process has not yet taken, and those items stay skipped until the issue is updated again, such as
by a new comment. So the lower mark
wins, even though it repeats some triage.

A process that has stopped running would hold the mark down forever, re-triaging everything
after it every cycle. The abandonment bound is already how long a silent rank's claims are kept,
so it is also how long its mark is. Which mark applies when no rank counts, such as after every
process of a role has been down past the bound, is an open question in the change's design.

#### Scenario: A lagging rank holds the mark down

- **WHEN** rank 1 has saved a mark later than rank 2's for the same source, and both have
  recorded a cycle within the bound
- **THEN** discovery uses rank 2's mark

#### Scenario: A gone rank stops holding it

- **WHEN** rank 2 has recorded no cycle for three poll intervals
- **THEN** its mark no longer counts, and discovery uses the lowest mark among the ranks that do

#### Scenario: A rank's own later save replaces its earlier one

- **WHEN** one rank saves a mark for a source and later saves a later one
- **THEN** only the later one counts for that rank
