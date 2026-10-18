## MODIFIED Requirements

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL record a watermark per role and source so previously seen items are not
reconsidered indefinitely. A watermark is an efficiency measure only.

A cycle that decided nothing SHALL NOT advance the watermark. Where discovery ran to show
somebody what a cycle would decide, nothing was decided and nothing is settled, so the items it
examined remain exactly as unexamined as before it ran.

The watermark advances on a cycle that acted even over the items it skipped, because deciding not
to act on an item is still having considered it, and reconsidering it every cycle would cost the
model call again for the same answer. That reasoning is what a preview lacks. What it costs to
hold the mark back is a later cycle paying for the same triage call — which is the efficiency this
requirement already declines to treat as governing. What advancing costs is the items themselves:
marked seen, never rediscovered, never worked.

A watermark SHALL be scoped to the role whose consideration it records as well as to the source
it bounds. Where two roles poll the same source, each SHALL have a mark of its own, and an item
one role passed over SHALL still be fresh to the other.

The mark's meaning is *how far this role has considered this source*, and a different role has
considered nothing. A mark shared across roles answers a question nobody asked: the lane is
applied after discovery, so a narrow role's rejection is what advances the mark, and the item it
rejected drops out of every other role's pool without any of them having seen it. Nothing about
the item produced that outcome and nothing about it will change to lift it — the item was not
edited and nobody replied to it — so the loss is permanent rather than a deferral. **The
colliding configuration is the obvious one:** the natural way to add a second role is the same
repository and the same query with a narrower lane, which is exactly the shape that shares a key
today.

The role SHALL be identified by its name, which is already its identity, and SHALL NOT be
identified by the seat, the Claude subscription its model calls are paid from. A mark SHALL NOT be kept per run, one start of a process: a process that restarts reads and
advances the mark of its role, or of its rank where the role runs as several. Where a role runs as several ranks, the numbered
processes of one role that `concurrent-instances` ([#179](https://github.com/adamstallard/igor/pull/179))
defines, each rank MAY keep its own mark for a source. Discovery SHALL then combine the ranks'
marks into the role's one mark for that source, by the rule of `work-discovery`'s *Processes
saving one source keep the lower watermark*, which that change adds. One mark per role,
rank and source is the finest division this requirement allows. A renamed role has no mark and
begins again, the same consequence a role already has when its query string is edited, since the
key is derived from that string as written.

A role and source pair with no mark of its own SHALL consider only items updated within the
look-back window, as a source with no watermark does, even where another role has a mark for that
source. Where the role runs as several ranks, the combining rule above decides what a rank with
no mark of its own reads. When this rule is first deployed, no role and source has a mark of its
own: every source
cold-starts once, and what it costs is bounded triage of a bounded window, once per role and
source.

A mark that no configured role and source now resolves to SHALL be left where it is. A cycle
runs one role and can see only that role's sources, so it cannot tell another role's live mark
from a dead one, and a rule that removed what it could not resolve would delete the marks of
every role that was not running. Deleting a live mark costs candidates; keeping a dead one costs
bytes in a file whose entries are bounded by the configuration that wrote them. The in-force
reading that state is a cache settles which way that trade goes.

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

#### Scenario: One role's lane rejection does not hide the item from another

- **WHEN** two roles poll the same source and differ only by lane, and the narrower role's lane
  rejects an item
- **THEN** the other role still finds that item fresh on its next cycle
- **AND** nothing about the item has to change for it to be found

#### Scenario: A role added later does not inherit what it never considered

- **WHEN** a second role is configured against a source an existing role has been polling
- **THEN** the new role considers items within the look-back window rather than only items newer
  than the existing role's mark

#### Scenario: Every source cold-starts once on the upgrade

- **WHEN** a destination whose stored marks predate this rule runs its next cycle
- **THEN** each role and source is treated as a first run, bounded by the look-back window
- **AND** it is identifiable as a cold start in the record it writes

#### Scenario: An unreachable mark is left alone

- **WHEN** a cycle writes state to a destination holding marks that no source of the role it is
  running resolves to
- **THEN** those marks are still present afterwards
- **AND** no mark belonging to another role is removed or overwritten

#### Scenario: A renamed role starts again, and only it

- **WHEN** a role is renamed and its sources are unchanged
- **THEN** it is a first run for that role, bounded by the look-back window
- **AND** the marks of every other role polling those sources are unaffected

#### Scenario: A restarted process continues its mark

- **WHEN** a process running a role restarts
- **THEN** it reads and advances its role's mark for each source, as before the restart
- **AND** it is not given a new mark on the strength of being a new run

#### Scenario: Ranks of one role keep a mark each

- **WHEN** two ranks of one role each keep a mark for the same source
- **THEN** discovery for the role reads one mark for that source, combined from the ranks' marks
  by `concurrent-instances`' rule
- **AND** neither rank's write replaces the other rank's mark

#### Scenario: A role's mark does not follow its seat

- **WHEN** a role's model calls start being paid from a different seat
- **THEN** it reads and advances the same mark for each of its sources as before
