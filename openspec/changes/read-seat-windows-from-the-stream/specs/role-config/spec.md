## ADDED Requirements

### Requirement: A role's reserve is raised by inheritance and never lowered

A role file MAY declare `reserve`, a fraction from 0 to 1, both included; seat-budget's *A role
may hold back more of a seat than the seat does* says what it does. A role's reserve SHALL be
raised by inheritance and never lowered. A role MAY declare a larger reserve than the one it
inherits from its parent or from `roles/org.yaml`, and SHALL NOT declare a smaller one:
configuration declaring a child reserve below its parent's SHALL be refused, naming both values and
the role each came from. A role declaring none SHALL take its parent's.

This runs the opposite way to `budget_share`, which a child may only lower, because both inherit
toward holding a role back.

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
