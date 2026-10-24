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
it. A notice SHALL have no stored record. Like the conditions `condition-backoff` defines, which
are rebuilt from the execution log, the ledger, each process rebuilds it each cycle from what
affects it: the ledger rows and `work-triage`'s flagged-hold record entries, #179's heartbeat
files, and, on its own host, its own state directory, for absent files, and its own log, for
refused deletes. The Igor's own log on the host
SHALL list the items that keep each notice open, each time that list changes. Two conditions
are notices: the one `graceful-handoff` opens for a question the Igor could not keep, whose
item is affected while it is flagged-held, and the stuck-release one `work-triage` opens, whose item
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

## MODIFIED Requirements

### Requirement: Every open condition is readable without naming a role

Every open condition SHALL be readable from `igor conditions`, a command run with no argument, so that its reader need not know which role to ask about,
stating for each one: the cure key, the scope it stops, how many times it has recurred, what would
cure it, and when its probe is due. Some conditions clear without a probe: a read-cleared
condition clears on a passing read and keeps no recurrence count, and one on a refused GitHub
App credential clears when a token is minted again, as `surface-adapter` says. For such a
condition the listing SHALL say what clears it in place of a probe time. It SHALL show a count
only for a condition whose kind keeps one, as the requirement defining that kind says. A seat's
refused credential, unlike the App's, keeps a count and a probe; for it, the count and the probe
time SHALL be the ones `condition-backoff`'s
*Reporting tells a refused credential from an unreadable one, and clears nothing* has budget
reporting print, read from the same conditions. A notice, as *A notice opens at once, stops
nothing, and stays open while an item is affected* defines it, has no scope, count or probe:
the listing SHALL say that it stops nothing and clears when no item is affected, and SHALL name
no item, which only the Igor's log on the host names. Each notice is listed once, though every process
rebuilds it; where the ledger or the flagged-hold record it is rebuilt from cannot
be read, the listing SHALL say so.

A condition is one cure key in the execution log every Igor appends to, so a condition several
Igors met SHALL appear once, with the one count the log holds for its cure key. Where no
condition is open, the command SHALL say so, and where the execution log the conditions are
rebuilt from cannot be read, it SHALL say that instead. Reading the listing SHALL change
nothing: no condition cleared, no count reset, no cooldown shortened.

#### Scenario: A role-scoped stop is visible to somebody who did not know which role

- **WHEN** a condition stops one role of several
- **THEN** it is listed by a command that was given no role
- **AND** the listing names the cure key, the role it stops, and what would cure it

#### Scenario: One cure met by several Igors reads as one condition

- **WHEN** five Igors have met the same cure key
- **THEN** the listing shows one condition, with one count

#### Scenario: The listing says when the probe is due

- **WHEN** an open condition that clears by a probe is listed
- **THEN** the instant its next probe is due is shown

#### Scenario: A condition with no probe says what clears it

- **WHEN** a read-cleared condition is listed
- **THEN** the listing shows no probe time and no count, and says a passing read clears it

#### Scenario: A notice says it stops nothing and names no item

- **WHEN** the stuck-release notice is open for one item
- **THEN** `igor conditions` lists it with no scope, count or probe time, says it stops nothing
  and clears when no item is affected, and names no item

#### Scenario: Reading changes nothing

- **WHEN** an operator reads the listing
- **THEN** every condition is in the state it was in, with the same count and the same cooldown

#### Scenario: Nothing open reads as nothing open

- **WHEN** no condition is open
- **THEN** the listing says so
- **AND** that is distinct from a listing that could not be read
