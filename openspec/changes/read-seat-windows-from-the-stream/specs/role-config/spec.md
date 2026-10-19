## ADDED Requirements

### Requirement: A role's reserve is raised by inheritance and never lowered

A role file MAY declare `reserve`, as seat-budget's *A role may hold back more of a seat than the
seat does* defines it. A role's reserve SHALL be
raised by inheritance and never lowered. A role MAY declare a larger reserve than the one it
inherits from its parent or from `roles/org.yaml`, and SHALL NOT declare a smaller one:
configuration declaring a child reserve below its parent's SHALL be refused, naming both values and
the role each came from. A role declaring none SHALL take its parent's.

This runs the opposite way to `budget_share`, which a child may only lower. Each moves in the
direction that holds a role back: a lower share, a higher reserve. A raised reserve is a restriction, so `reserve` merges as a monotonic
field of *Merge semantics differ by field kind*; that requirement's list of fields gains it at
archive (task 16.2).

#### Scenario: A child role may raise its inherited reserve

- **WHEN** `roles/org.yaml` declares a reserve of 0.2 and a role extending it declares 0.4
- **THEN** configuration is valid, and the role's reserve is 0.4

#### Scenario: A child role may not lower its inherited reserve

- **WHEN** a role's parent declares a reserve of 0.3 and the role declares 0.1
- **THEN** validation fails
- **AND** the refusal names both reserves and the role each came from

#### Scenario: A role declaring none inherits its parent's

- **WHEN** a role's parent declares a reserve of 0.3 and the role declares none
- **THEN** the role's reserve is 0.3
