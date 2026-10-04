## MODIFIED Requirements

### Requirement: Adapters declare how a claim is expressed

A tracker adapter SHALL declare whether the surface offers a native **holder field** — a field
naming who has the item — or only message-based convention. This declaration determines how a
claim is *expressed*, not how it is resolved.

Which field that is belongs to the adapter, not to the loop. Linear's is `delegate`, because an
app identity there may hold the latter and not the former. GitHub's depends on the Igor's
identity: the assignee for a machine user, and the `igor:<role>` label for a GitHub App, whose
bot user cannot be an assignee. Naming "assignee" above the adapter would make one surface's
vocabulary into everyone's.

An adapter declaring a holder field SHALL also declare whether it holds a **single value** or a
**list**, and whether it is distinct from the item's assignee. GitHub's assignee is a list and is
the assignee. GitHub's `igor:` labels are a list, and are distinct from the assignee. Linear's
delegate is a single value, and is distinct from the assignee. Where the two are distinct, the
holder field names the Igor and the assignee names the person accountable. The loop reads these
declarations to resolve claims and to decide which items it may claim, and never the field's
name.

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

#### Scenario: A holder field distinct from the assignee

- **WHEN** an adapter declares its holder field distinct from the assignee, as GitHub's `igor:`
  labels and Linear's delegate are
- **THEN** the loop does not claim an item assigned to a person unless the holder field names
  this Igor

#### Scenario: Message-only surface declared

- **WHEN** an adapter declares message-only convention
- **THEN** a claim is expressed as a post
- **AND** claim resolution still relies on ordering rather than on any surface-specific primitive

### Requirement: A GitHub adapter ships with this change

A GitHub adapter SHALL implement both the tracker and code-host roles: searching issues,
claiming, verifying a claim, reporting status, producing a draft pull request, and linking it to
the item. It SHALL claim by assignment when the Igor acts as a machine user, and by the
`igor:<role>` label when the Igor acts as a GitHub App.

#### Scenario: GitHub adapter satisfies the interface

- **WHEN** the GitHub adapter is used as the only configured surface
- **THEN** discovery, claiming, verification, reporting, artifact production and linkage all
  succeed through it

#### Scenario: Claim follows the identity

- **WHEN** the GitHub adapter claims for an Igor acting as a GitHub App
- **THEN** it adds the Igor's `igor:<role>` label and does not attempt assignment
