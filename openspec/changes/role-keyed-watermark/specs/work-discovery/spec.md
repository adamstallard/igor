## ADDED Requirements

### Requirement: A watermark records how far one role has considered a source

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

The role SHALL be identified by its name, which is already its identity. It SHALL NOT be
identified by the seat it spends from, by the process running it, or by any other per-instance
identity: two processes running the same role consider the same items under the same lane, so
they are one consideration and sharing a mark between them is correct. A renamed role therefore
has no mark and begins again — the same consequence a role already has today when its query
string is edited, since the key is derived from that string as written.

A role and source pair with no mark of its own SHALL be treated as never having run, so *A first
run does not face the whole backlog* governs it and the look-back window bounds what it
considers. That is the upgrade consequence, stated rather than discovered: every source
cold-starts once, and what it costs is bounded triage of a bounded window, once per role and
source.

A mark that no configured role and source now resolves to SHALL be left where it is. A cycle
runs one role and can see only that role's sources, so it cannot tell another role's live mark
from a dead one, and a rule that removed what it could not resolve would delete the marks of
every role that was not running. Deleting a live mark costs candidates; keeping a dead one costs
bytes in a file whose entries are bounded by the configuration that wrote them. The in-force
reading that state is a cache settles which way that trade goes.

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

#### Scenario: Two processes running one role share its mark

- **WHEN** two processes run the same role against the same source
- **THEN** they read and write the same mark for it
- **AND** neither is given a mark of its own on the strength of being a separate process
