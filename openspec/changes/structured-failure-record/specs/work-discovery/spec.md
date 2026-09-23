## ADDED Requirements

### Requirement: A recorded failure carries what a reader who was not there can act on

Where a cycle records a failure to the state branch, the entry SHALL carry — separately readable
from the sentence a person reads — whatever machine-readable identity the fault arrived with, such
as an error code, a response status or an exit status, and the origin of the fault, being where it
was raised and the descriptions wrapped around it on the way out. A fault that arrived with no such
identity SHALL still be recorded with its origin, and SHALL NOT be given an invented one.

The measure is that the entry holds no less than printing the caught fault to a console would have.
Igor is built to run where there is no console. When it fails there the record is the only artifact
that survives, and it is read hours later by somebody who was not present and has nobody to ask.
`triage: fetch failed` is close to unactionable, and it is unactionable permanently: the object it
was derived from was discarded at the one moment it could still have been inspected.

Structure is what makes it actionable rather than merely longer. A trace flattened into the same
prose is a bigger sentence — nothing in it can be matched, counted or compared across entries
without a person reading each one, which is the work the record exists to spare them.

A fault SHALL reach the record with its origin intact. Where it is re-thrown or re-described on the
way, the original SHALL be carried along rather than replaced by a description of it, because the
record can hold only what reached it, and a wrap that keeps the prose and drops the object decides
on the reader's behalf what they will be allowed to know.

The entry SHALL still yield the single line a live reader gets. The structured parts are for the
record and the sentence is for whoever is watching a run; widening one MUST NOT cost the other.

Where an entry is bounded, the identity and the origin SHALL survive the bound and the fuller trace
SHALL be what is shortened, so that bounding costs detail rather than costing the reader the two
things they act on.

#### Scenario: A fault carrying a code

- **WHEN** a cycle records a failure whose fault carried a machine-readable identity
- **THEN** that identity is readable from the entry on its own
- **AND** reading it does not require parsing the sentence

#### Scenario: A fault carrying no code

- **WHEN** a cycle records a failure whose fault carried no machine-readable identity
- **THEN** the entry is still recorded, with the origin of the fault
- **AND** no identity is invented for it

#### Scenario: A fault wrapped before it was recorded

- **WHEN** a fault is re-thrown or re-described between where it was raised and where it is recorded
- **THEN** the entry names where it was raised, not only the outermost description
- **AND** the identity the original carried is readable from the entry

#### Scenario: A live reader still gets a sentence

- **WHEN** a cycle's failures are shown to somebody watching the run
- **THEN** each one renders as a single line

#### Scenario: A bounded entry keeps the two things a reader acts on

- **WHEN** an entry is shortened to stay within whatever bound the record applies
- **THEN** the identity and the origin are still present
- **AND** what was shortened is the fuller trace
