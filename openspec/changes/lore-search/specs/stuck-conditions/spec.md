## ADDED Requirements

### Requirement: A notice opens at once, stops nothing, and stays open while an item is affected

A *notice* is a kind of condition of its own. `condition-backoff`'s *A condition that recurs
stops the affected scope from taking new work*, *Conditions are counted, not graded*, *A
condition's scope is its cure's scope* and *A condition clears by not recurring, and a probe is
what observes that* do not apply to it, and #171's read-cleared condition, a condition that
opens on a failing read and clears on a passing one, stays as #171 writes it. A notice SHALL
open on its first occurrence and SHALL stop no scope, and its recurrence SHALL NOT count toward
stopping one. It carries no *discriminator*, the value `condition-backoff` lets a new
occurrence use to close an open one, so an occurrence for one item never closes one open for
another. It SHALL stay open while any item it was opened
for is still affected, and clear only when none is; no probe item and no cooldown SHALL clear
it. Its record on the state branch SHALL hold only its key. The Igor's own log on the host
SHALL list the items that keep each notice open, each time that list changes. Two conditions
are notices: the one `graceful-handoff` opens for a question the Igor could not keep, whose
item is affected while it is held, and the stuck-release one `work-triage` opens, whose item
is affected while its requested release is stuck.

#### Scenario: A notice opens on its first occurrence

- **WHEN** the Igor cannot write a flagged run's question file for the first time
- **THEN** the condition for a question not kept opens at once

#### Scenario: A notice stops no scope however often it recurs

- **WHEN** the delete for a requested release by the rank on the item's state directory is
  refused on many cycles
- **THEN** the stuck-release condition stays open and the role goes on taking new items

#### Scenario: Repeated questions not kept do not stop the role

- **WHEN** the Igor cannot write the question file for several flagged runs in a row
- **THEN** the condition for a question not kept stays open
- **AND** the role goes on taking new items

#### Scenario: A probe does not clear a notice

- **WHEN** the stuck-release condition is open for one item
- **AND** the role works another item that does not meet it, as a probe item would for another
  condition, that is, one whose run neither fails to keep a question nor leaves a release stuck
- **THEN** the condition stays open

#### Scenario: A notice clears when no item is affected

- **WHEN** the stuck-release condition is open for two items
- **AND** one of them is released
- **THEN** the condition stays open, and the Igor's log lists the other
- **AND** once the other is released too, the condition clears
