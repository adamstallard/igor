## MODIFIED Requirements

### Requirement: Adapters declare how a claim is expressed

A tracker adapter SHALL declare whether the surface offers a native **holder field** — a field
naming who has the item — or only message-based convention. This declaration determines how a
claim is *expressed*, not how it is resolved.

Which field that is belongs to the adapter, not to the loop. GitHub's is the assignee; Linear's
is `delegate`, because an app identity there may hold the latter and not the former. Naming
"assignee" above the adapter would make one surface's vocabulary into everyone's.

An adapter declaring a holder field SHALL also declare whether it holds a **single value** or a
**list**, and whether it is distinct from the item's assignee. GitHub's assignee is a list and is
the assignee. Linear's delegate is a single value, and is distinct from the assignee, which
names the person accountable. The loop reads these declarations to resolve claims and to decide
which items it may claim, and never the field's name.

#### Scenario: Native holder field declared

- **WHEN** an adapter declares a native holder field
- **THEN** a claim sets that field
- **AND** the field's value is the signal humans read

#### Scenario: The loop does not name the field

- **WHEN** two trackers express a claim through differently-named fields
- **THEN** the loop's behaviour is identical
- **AND** nothing above the adapter refers to either field by name

#### Scenario: Single-valued and list holder fields resolve differently

- **WHEN** one adapter declares a single-valued holder field and another a list
- **THEN** on the first, the later write holds the item
- **AND** on the second, any other holder present after the settle interval means the claim is lost

#### Scenario: Message-only surface declared

- **WHEN** an adapter declares message-only convention
- **THEN** a claim is expressed as a post
- **AND** claim resolution still relies on ordering rather than on any surface-specific primitive
