# work-discovery Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: Nothing may require inbound reachability

Discovery SHALL run each configured source's query on a configurable interval. The system MUST
NOT require a public endpoint, webhook receiver, or per-surface relay.

Polling is how that constraint is met for a tracker, not a preference in itself. A surface the
Igor already holds an outbound connection to may push instead — a bot handed every message on
a socket it opened requires no inbound reachability and gains nothing from being asked again.

#### Scenario: Sources polled on the interval

- **WHEN** a role declares two sources and the interval elapses
- **THEN** each source's query is executed
- **AND** results from all sources are normalized into one candidate set

#### Scenario: No inbound endpoint required

- **WHEN** an Igor runs behind a firewall with no inbound network access
- **THEN** discovery still functions

### Requirement: Queries are dispatched to the tracker unmodified

Discovery SHALL send each source's configured query verbatim to that tracker, and SHALL treat
it as deliberately loose — narrowing is the job of later stages, not of the query.

#### Scenario: Query sent as written

- **WHEN** a source's query is executed
- **THEN** the tracker receives exactly the configured string

#### Scenario: Loose query narrowed downstream

- **WHEN** a query returns candidates outside the role's lane
- **THEN** discovery still returns them
- **AND** they are excluded by lane predicates rather than by changing the query

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL record a per-source watermark so previously seen items are not reconsidered
indefinitely. A watermark is an efficiency measure only.

A cycle that decided nothing SHALL NOT advance the watermark. Where discovery ran to show
somebody what a cycle would decide, nothing was decided and nothing is settled, so the items it
examined remain exactly as unexamined as before it ran.

The watermark advances on a cycle that acted even over the items it skipped, because deciding not
to act on an item is still having considered it, and reconsidering it every cycle would cost the
model call again for the same answer. That reasoning is what a preview lacks. What it costs to
hold the mark back is a later cycle paying for the same triage call — which is the efficiency this
requirement already declines to treat as governing. What advancing costs is the items themselves:
marked seen, never rediscovered, never worked.

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

### Requirement: The cycle repeats without supervision

Igor SHALL provide a process that runs the cycle on the configured interval until stopped. A
single cycle invoked by hand is the unit that process repeats, not a substitute for it.

#### Scenario: Cycles repeat on the interval

- **WHEN** the process is started for a role
- **THEN** it runs a cycle, waits the role's poll interval, and runs another

#### Scenario: A failing cycle does not end the process

- **WHEN** a cycle fails
- **THEN** the failure is reported and the next cycle still runs

#### Scenario: Shutdown finishes the item in hand

- **WHEN** the process is asked to stop while working an item
- **THEN** it completes or hands off that item before exiting
- **AND** it begins no further item

#### Scenario: Budget is re-checked between items

- **WHEN** several items are claimed in one cycle and capacity runs out partway
- **THEN** the remaining items are not started
- **AND** the reason is reported

### Requirement: A first run does not face the whole backlog

A source with no watermark SHALL consider only items updated within a bounded look-back window,
and SHALL set its watermark from that run. It MUST NOT triage a repository's entire open
history because it has not run before.

Without the bound, an Igor pointed at an established repository wakes up facing every open
item at once — a cost spike, and an Igor appearing to lay claim to years of open work in its
first minute. Handing it the backlog stays something a person does deliberately.

A run that decided nothing does not count as that first run and sets no watermark. What stops the
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

### Requirement: Timestamps are compared as instants

Watermark comparison SHALL be by instant, never by lexical ordering of the timestamp string,
because surfaces differ in whether they render sub-second precision.

#### Scenario: Equivalent timestamps spelled differently

- **WHEN** a watermark and an item carry the same instant written with and without milliseconds
- **THEN** the item is not considered fresh

### Requirement: A failing source does not cost the others their cycle

Sources SHALL be polled independently. A source that errors SHALL be reported, and its
watermark SHALL be left unchanged so nothing is skipped as a result of the failure.

#### Scenario: One tracker unreachable

- **WHEN** one of two sources fails and the other succeeds
- **THEN** the successful source is triaged normally
- **AND** the failing source's watermark is unchanged

### Requirement: State is a cache and correctness never depends on it

The tracker SHALL be the source of truth for what is claimed. Losing discovery state MUST NOT
produce a duplicate claim; it MUST cost only redundant API calls and triage.

#### Scenario: State lost entirely

- **WHEN** all discovery state is deleted and the loop runs
- **THEN** previously handled items are re-examined
- **AND** each is found assigned, closed, or already worked and is skipped
- **AND** no duplicate claim is made

#### Scenario: Correctness not delegated to the cache

- **WHEN** the watermark and the tracker disagree about an item's status
- **THEN** the tracker's status governs

### Requirement: State lives on an orphan branch of the destination

Discovery state and execution transcripts SHALL be written to an orphan branch of the
destination repository, sharing no history with its default branch. They MUST NOT be written to
the default branch.

#### Scenario: State written off the main line

- **WHEN** state is persisted
- **THEN** it is committed to the state branch
- **AND** the default branch's history is unchanged

#### Scenario: State survives a fresh clone

- **WHEN** the loop starts from a machine that has never run it before
- **THEN** prior state is available from the branch

#### Scenario: State inspectable without checkout

- **WHEN** a person wants to see why an item was skipped
- **THEN** the state file is readable from the branch without checking it out

