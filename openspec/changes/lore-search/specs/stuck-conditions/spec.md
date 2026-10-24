## ADDED Requirements

### Requirement: A held item's notices open at once, stop nothing, and stay open while an item is affected

Two conditions are exceptions to *A condition that recurs stops the affected scope from taking
new work*, *A condition clears by not recurring, and a probe is what observes that*, *A
condition's scope is its cure's scope* and *Conditions are counted, not graded*: the
condition `graceful-handoff` opens for a question the Igor could not keep, and the
stuck-release condition `work-triage` opens. Each SHALL open on its first occurrence. Neither
SHALL stop any scope, and neither's recurrence SHALL count toward stopping one. Each SHALL stay
open while any item it was opened for is still affected, and clear only when none is: for the
first, a held item whose question was not kept, until it is released; for the second, an item whose requested
release is still stuck. No probe item and no cooldown SHALL clear either. Neither carries a discriminator, so an
occurrence for one item never closes the occurrence open for another; each is acted on by its
kind, not by a count, and scopes nothing. The Igor's own log on
the host SHALL list the items that keep each open, each time that list changes, since the
condition's record holds only its key.

#### Scenario: A held item's notice opens on its first occurrence

- **WHEN** the Igor cannot write a flagged run's question file for the first time
- **THEN** the condition for a question not kept opens at once

#### Scenario: A held item's notice stops no scope however often it recurs

- **WHEN** a keeping rank's delete for a requested release is refused on many polls
- **THEN** the stuck-release condition stays open and the role goes on taking new items

#### Scenario: Repeated questions not kept do not stop the role

- **WHEN** the Igor cannot write the question file for several flagged runs in a row
- **THEN** the condition for a question not kept stays open
- **AND** the role goes on taking new items

#### Scenario: A probe does not clear a held item's notice

- **WHEN** the stuck-release condition is open for one item
- **AND** the role works another item that does not meet it, that is, whose run neither fails
  to keep a question nor leaves a release stuck
- **THEN** the condition stays open

#### Scenario: A held item's notice clears when no item is affected

- **WHEN** the stuck-release condition is open for two items
- **AND** one of them is released
- **THEN** the condition stays open, and the Igor's log lists the other
- **AND** once the other is released too, the condition clears
