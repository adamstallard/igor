## ADDED Requirements

### Requirement: A role sets how many workers its process runs

A role file MAY set `workers`, a whole number of at least 1: the most items the role's process
works at once. It SHALL default to 1, and the most specific level SHALL win, as for the poll
interval. Any other value SHALL be refused, naming it. `igor role explain` SHALL report the
effective value and the level it came from.

#### Scenario: Workers unset

- **WHEN** neither a role nor any base it extends sets `workers`
- **THEN** its effective `workers` is 1, reported by `igor role explain` as the default

#### Scenario: A role overrides its base

- **WHEN** the org base sets `workers: 2` and a role sets `workers: 4`
- **THEN** the role's effective `workers` is 4

#### Scenario: Zero workers refused

- **WHEN** a role sets `workers: 0`, or `workers: two`
- **THEN** the role is refused, naming the value

## MODIFIED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. A person reading a
claim sees which role took the item, and hands work to a role by naming it. Igors of different
roles MAY draw on the same seat, since a seat is capacity and not an identity.

One process serves a role at a time, and runs the role's workers (`role-process`).

#### Scenario: Two roles are two Igors

- **WHEN** an organization wants backend and frontend work done
- **THEN** it runs a `backend` Igor and a `frontend` Igor, each with its own identity
- **AND** both may reference the same seat

#### Scenario: A claim names the role

- **WHEN** an Igor claims an item
- **THEN** the identity in the holder field, or the `igor:<role>` label, names that Igor's role

#### Scenario: More processes of one role are one Igor

- **WHEN** two processes are started for the `backend` role under the `backend` identity
- **THEN** they are one Igor, and a claim made by either names the same identity
- **AND** only one of them serves the role (`role-process`)

### Requirement: Timing values are configurable with stated defaults

Every interval SHALL be configurable and SHALL have a default, since an unstated default is a
value someone guesses differently each time: a **settle interval** of 10 seconds before a claim
is verified, and a **cooldown** of 1 hour before a stopped item returns to the pool. The serving
record's timings are the exception, fixed in code for every process (`role-process`).

These are starting points to tune against observation, not derived values, and SHALL be
recorded as such rather than presented as considered.

#### Scenario: Default applied when unset

- **WHEN** a role does not set the settle interval
- **THEN** the inherited or default value is used
- **AND** the effective value is visible via `role explain`
