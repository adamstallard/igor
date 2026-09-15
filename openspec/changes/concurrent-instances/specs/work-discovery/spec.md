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

Where several processes run behind one account, discovery MAY return one candidate to more than
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
