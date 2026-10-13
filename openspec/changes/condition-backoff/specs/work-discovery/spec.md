## MODIFIED Requirements

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
recurs on every item) stopped it part-way through, or the tracker gave no answer to its claim, the watermark SHALL NOT advance past that item. Passed by the
mark, the item would be marked seen and never worked, with no decision against it to justify the
loss.

Where the tracker answered the claim and refused it, the watermark SHALL advance past the item as
past one taken. Such a refusal is about the item or about what the Igor may do, such as a GitHub
App without permission to add the claim label, and a retry would be refused the same way until the
item or that permission changed. The watermark is one timestamp per source, so holding it below
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
