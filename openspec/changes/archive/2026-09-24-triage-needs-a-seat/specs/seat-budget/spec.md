## ADDED Requirements

### Requirement: A spend with no seat behind it does not happen

Where seats are declared, every model call Igor makes on its own behalf SHALL be charged to the
seat the gate chose for the role, and SHALL be made with that seat's credential where the seat
names one. Where the gate names no seat, the call SHALL NOT be made, and no ambient credential
SHALL be substituted for the seat the gate did not name. Where an organization declares no
seats, budget is not enforced and this requirement places no condition on anything.

The condition is whether the gate named a seat, not whether a credential was found. A seat
naming none of the three token mechanisms is already unaffected by the rule that governs them —
it runs on whatever login is ambient — and it is still a seat the gate chose, still bounded by
its reserve, still named in the record as having paid. What has no seat behind it is a call the
gate refused to choose one for.

This is the spending-side counterpart of the reading rule already in force: a seat naming a
token that is not available is reported unreadable and no other credential is used in its place.
The same principle governs spending — a seat the gate did not name cannot be charged, and a
credential no seat names cannot be attributed — but it was written only of readings, so the one
spend in the cycle that does not go through a worker reached an ambient fallback with no seat
behind it and nothing in the record naming what paid.

Attributing that spend instead of refusing it was considered and rejected. A record saying an
unnamed login paid is honest about a call that should not have been made, leaves the ceiling
unenforced, and does nothing at all on a host where no ambient login exists: there the call
fails with a message about not being logged in, which describes a machine whose credentials are
configured correctly and whose seats are simply held.

The exemption for an organization with no seats is not an oversight to be tightened later. A
deployment that declares no seats has asked for no ceiling and made no promise about which
credential pays, and the fallback is what it runs on.

#### Scenario: No seat, no spend

- **WHEN** the gate names no seat for a role, because every seat is spent or the pool cannot be
  used
- **THEN** no model call is made on that role's behalf
- **AND** no credential is substituted for the seat's

#### Scenario: A spend nothing can attribute is refused rather than recorded as ambient

- **WHEN** a call could only be made on a credential no seat names
- **THEN** it is refused
- **AND** it is not made and recorded against the ambient login instead

#### Scenario: An unenforced budget is untouched

- **WHEN** an organization declares no seats
- **THEN** calls run on whatever login is ambient, as they did before
- **AND** nothing is refused for want of a seat

#### Scenario: A call that runs names the seat that paid

- **WHEN** the gate names a seat and the call is made
- **THEN** the call uses that seat's credential where the seat names one
- **AND** the record names that seat as having paid, whether or not it named a token

#### Scenario: A seat naming no token is still a seat

- **WHEN** the gate chooses a seat that names none of the token mechanisms
- **THEN** the call is made, on the ambient login, as that configuration already permits
- **AND** the seat is recorded as having paid
