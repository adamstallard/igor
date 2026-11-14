# seat-budget: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: A seat a condition has stopped reads as stopped.**
  Budget reporting already tells, on each seat's line, a credential that could not be read from one the provider refused, so a stopped seat is a third state beside them, where the operator debugging a seat already looks. A role-scoped stop does not belong there: `igor budget` reports what each seat has left, by seat, and a role's stop says nothing about capacity. A role's stop goes in `igor conditions`, whose subject is every open condition.
  Evidence: in-force `stuck-conditions`, *Reporting tells a refused credential from an unreadable one, and clears nothing*, https://github.com/adamstallard/igor/blob/b4f8ac0/openspec/specs/stuck-conditions/spec.md
  Evidence: `igor budget` is described as what each seat has left, https://github.com/adamstallard/igor/blob/b4f8ac0/src/cli.ts#L696
