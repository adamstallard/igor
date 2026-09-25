## MODIFIED Requirements

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
