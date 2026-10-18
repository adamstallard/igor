## MODIFIED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. A person reading a
claim sees which role took the item, and hands work to a role by naming it. Igors of different
roles MAY draw on the same seat, since a seat is capacity and not an identity.

Processes running the same role under the same identity are one Igor. They SHALL share the
role's identity and differ only by rank, a whole number from 1 given to each process when it is
started. A process takes over at once a claim that carries its own rank, left by an earlier
process of that rank, and a claim carrying another rank only once that rank is gone: `work-claiming`'s *A process recovers the claims of its own
predecessor* and *A retired rank does not hold its items forever* say how.

#### Scenario: Two roles are two Igors

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

#### Scenario: Processes of one role differ by rank

- **WHEN** ranks 1 and 2 of the `backend` role are running, and rank 2 restarts after a crash
- **THEN** the new rank 2 takes back at once a claim its predecessor left
- **AND** rank 1 takes that claim only once rank 2 is gone

## ADDED Requirements

### Requirement: The roster declares the ranks each role may run

`igor.config.yaml` SHALL declare the roster under the top-level key `roster`: a map from a role's
name to the list of ranks that role may run, each a whole number from 1, such as:

```yaml
roster:
  generalist: [1, 2, 3]
  reviewer: [1]
```

A role the roster does not name SHALL run rank 1 only. The configuration SHALL be refused, naming
the entry, when the roster names a role with no role file, lists a rank that is not a whole
number from 1, or lists one rank twice. A process whose rank the roster does not declare for its
role SHALL refuse to start, naming the ranks the roster declares.

#### Scenario: A declared rank starts

- **WHEN** the roster lists `generalist: [1, 2]` and `igor serve generalist.2` starts
- **THEN** it runs as rank 2 of the `generalist` role

#### Scenario: A rank outside the declared roster fails validation

- **WHEN** a process starts with a rank the configuration does not declare
- **THEN** it refuses to start, naming the ranks the roster declares for its role

#### Scenario: A role the roster does not name runs rank 1

- **WHEN** the roster does not name the `reviewer` role
- **THEN** `igor serve reviewer` starts as rank 1, and `igor serve reviewer.2` refuses to start

#### Scenario: A malformed roster is refused

- **WHEN** the roster lists rank `0`, lists one rank twice, or names a role with no role file
- **THEN** the configuration is refused, naming the entry

### Requirement: A role's name has no dot

A role's name SHALL NOT contain a dot. A role file whose name does, such as
`roles/front.end.yaml`, SHALL be refused, and the refusal SHALL say that a process is named
`<role>.<rank>`, so a dot in the role would make the name ambiguous.

#### Scenario: A role name with a dot is refused

- **WHEN** a role file is named `roles/front.end.yaml`
- **THEN** validation fails, saying that a dot in a role's name conflicts with `<role>.<rank>`

### Requirement: The role's environment file holds single-quoted values

Where a process starts under the systemd unit, the unit's shell reads the role's environment
file, `/etc/igor/<role>.env`, with its dot command, so every value in it SHALL be written in
single quotes, as `KEY='value'`. When the file exists, a starting process SHALL refuse to start
if any value in it is in double quotes, naming the line and the key and never the value. This
check reads the file only for its quoting; the credentials still reach the Igor only through
its environment.

#### Scenario: A double-quoted value is refused

- **WHEN** `/etc/igor/backend.env` holds the line `GITHUB_APP_ID="123"`
- **THEN** `igor serve backend` refuses to start, naming that line and `GITHUB_APP_ID`
- **AND** the refusal does not print the value

#### Scenario: Single-quoted values start

- **WHEN** every value in `/etc/igor/backend.env` is in single quotes
- **THEN** the check passes
