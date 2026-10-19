## MODIFIED Requirements

### Requirement: Watermarks reduce reconsideration without governing it

Discovery SHALL record a watermark per role, rank and source, so previously seen items are not
reconsidered indefinitely. A rank is the number a process of the role runs as under
`concurrent-instances` ([#179](https://github.com/adamstallard/igor/pull/179)); a role served by
one process runs it as rank 1. A watermark is an efficiency measure only.

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

The role SHALL be identified by its name, and SHALL NOT be identified by the seat, the Claude
subscription its model calls are paid from. `work-discovery`'s *Processes saving one source
keep the lower watermark* (#179) sets out how a role's marks divide among its ranks, and how the
process running a cycle combines them into the one mark it reads for a source. A renamed role has no mark and begins again.

A role and source pair with no mark of its own SHALL be a first run, as *A first run does not
face the whole backlog* defines one, even where another role has a mark for that source. When
this rule is first deployed, no role and source has a mark of its own, so every source starts
cold once for each role.

A mark whose role and source match no configured role and source SHALL be left where it is.

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
- **THEN** the new role's cycle is a first run, bounded by the look-back window, rather than one
  that considers only items newer than the existing role's mark

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
- **THEN** it continues its own rank's mark for each source, the one it saved before the restart
- **AND** it is not given a new mark on the strength of being a new run

#### Scenario: Ranks of one role keep a mark each

- **WHEN** two ranks of one role each save a mark for the same source
- **THEN** a process of the role running a cycle reads one mark for that source, combined from
  the ranks' marks by `concurrent-instances`' rule
- **AND** neither rank's write replaces the other rank's mark

#### Scenario: A role's mark does not follow its seat

- **WHEN** a role's model calls start being paid from a different seat
- **THEN** it reads and advances the same mark for each of its sources as before
