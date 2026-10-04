## MODIFIED Requirements

### Requirement: Roles inherit an org-level base of the same shape

A role SHALL inherit from the base named in `extends`, defaulting to the org-level base. A base
SHALL use the identical file shape, so intermediate bases are possible without a second
artifact type.

`extends` SHALL name at most one base. A role naming two or more SHALL be refused, naming the
bases and saying that an Igor holds one role. A role that extends two sibling roles makes one
Igor do two jobs, which is what *An Igor holds exactly one role* rules out.

#### Scenario: Org base inherited

- **WHEN** a role extends the org base and declares no completion action of its own
- **THEN** the org base's completion action applies

#### Scenario: Intermediate base composed

- **WHEN** a role extends a base that itself extends the org base
- **THEN** values resolve through the whole chain

#### Scenario: Two bases refused

- **WHEN** a role declares `extends: [backend, frontend]`
- **THEN** the role is refused, naming both bases
- **AND** the refusal says that an Igor doing both jobs is two Igors

## ADDED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. A person reading a
claim sees which role took the item, and hands work to a role by naming it. An Igor that does
two jobs is two Igors, each with its own identity. They MAY draw on the same seat, since a seat
is capacity and not an identity.

Processes running the same role under the same identity are one Igor and are interchangeable.

#### Scenario: Two jobs are two Igors

- **WHEN** an organization wants backend and frontend work done
- **THEN** it runs a `backend` Igor and a `frontend` Igor, each with its own identity
- **AND** both may reference the same seat

#### Scenario: A claim names the role

- **WHEN** an Igor claims an item
- **THEN** the identity in the holder field, or the `igor:<role>` label, names that Igor's role

#### Scenario: More processes of one role are one Igor

- **WHEN** three processes run the `backend` role under the `backend` identity
- **THEN** they are one Igor
- **AND** a claim made by any of them names the same identity
