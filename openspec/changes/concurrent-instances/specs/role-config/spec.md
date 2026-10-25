## MODIFIED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. A person reading a
claim sees which role took the item, and hands work to a role by naming it. Igors of different
roles MAY draw on the same seat, since a seat is capacity and not an identity.

Processes running the same role under the same identity are one Igor. They SHALL share the
role's identity and differ only by rank: a whole number from 1 given to each serving process
when it is started, or 0 for `igor run`. How a rank's claims pass to another process is
`work-claiming`'s, in *A process recovers the claims of its own predecessor*, *A retired rank
does not hold its items forever* and *A run by hand runs as rank 0*.

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

### Requirement: An Igor's GitHub App identity is its role's name

An Igor running a role SHALL act on GitHub as the github-app identity of the same name: the Igor
for `roles/reviewer.yaml` acts as the identity `reviewer`. No role file, base or configuration
key SHALL name an App identity, an App ID, a private key or a key path.

The identity's credentials SHALL be read only from the Igor's environment, and only when
`GITHUB_APP_IDENTITY` names this identity: `GITHUB_APP_ID`, with exactly one of
`GITHUB_APP_PRIVATE_KEY_FILE` or `GITHUB_APP_PRIVATE_KEY`. An environment that sets both key
variables SHALL be refused, naming both. On a server these variables come from the role's
environment file, `/etc/igor/<role>.env`, which `igor serve` reads into its own environment as
*The role's environment file holds single-quoted or plain values* says; when a person runs an
Igor themselves, from their shell. The Igor SHALL have no other source: it SHALL NOT read the files the `github-app` skill
stores under its configuration directory, even when the environment is incomplete.

These names are the `github-app` skill's environment contract, so the skill's `check` works
against the same environment file. The Igor SHALL NOT depend on the skill being installed.

The Igor SHALL NOT read `GITHUB_APP_OWNER` or `GITHUB_APP_INSTALLATION_ID`: it finds its
installation by asking GitHub which one covers its repositories. They are the skill's. The
environment file MAY carry them only so the skill's `check` can choose an installation when the
App is installed on more than one account, and their presence or value SHALL NOT change what the
Igor does.

`igor role explain` SHALL report the identity a role acts as and whether its environment holds
that identity's credentials, naming any variable that is missing.

#### Scenario: The role's name is the identity

- **WHEN** `igor serve reviewer-1` starts
- **THEN** it acts as the github-app identity `reviewer`

#### Scenario: Credentials come only from the environment

- **WHEN** `igor serve reviewer-1` starts with no `GITHUB_APP_*` variables in its environment, and
  `~/.config/github-app/reviewer.json` and `reviewer.pem` exist
- **THEN** it does not read those files
- **AND** it refuses to start, naming the missing variables

#### Scenario: The skill's installation variables are ignored

- **WHEN** the environment sets `GITHUB_APP_OWNER` or `GITHUB_APP_INSTALLATION_ID`, naming an
  account or installation other than the one covering the role's repositories
- **THEN** the Igor finds its installation from the repositories, as it does without them

#### Scenario: Environment credentials for another identity are not used

- **WHEN** the Igor's environment sets `GITHUB_APP_ID` with `GITHUB_APP_IDENTITY` unset or naming
  another identity
- **THEN** those variables are not this Igor's credentials
- **AND** the refusal names the identity the variables belong to and the one this Igor acts as

#### Scenario: Explain says who the role acts as

- **WHEN** `igor role explain reviewer` runs
- **THEN** it reports the identity `reviewer` and whether its environment holds that identity's
  credentials, naming any missing variable

### Requirement: Timing values are configurable with stated defaults

Every interval SHALL be configurable and SHALL have a default, since an unstated default is a
value someone guesses differently each time. The exceptions are the maximum poll interval, the
three derived timings below, and two timings of #228 (`probe-claim`) that its `stuck-conditions`
requirement *Exactly one Igor takes a due probe, decided by the log after it writes* fixes in
code: the append deadline, how long an Igor waits for a probe row to land, and the probe settle
interval it waits before reading who decides. The defaults are: a **settle interval** of 10 seconds before a claim
is verified, and a **cooldown** of 1 hour before a stopped item returns to the pool. The **poll
interval** SHALL be configurable too, with a default of 10 minutes.

The settle interval SHALL be shorter than the poll interval. A configuration that sets it as long
or longer is refused, naming both values.

Igor SHALL have a *maximum poll interval* of 30 minutes, three times the default, fixed in Igor
and not configurable, so that every process of a role assumes the same maximum (Adam,
2026-10-24). It is derived from the default rather than tuned. A configuration that sets a poll
interval above it SHALL be refused when it loads, naming the value and the maximum, and so SHALL
`igor serve`'s `--poll` option given a value above it; a process refusing to start for either
exits with status 78.
`work-claiming`'s *A heartbeat declares its process's poll interval* says how a process uses the
maximum.

These defaults, unlike the maximum, are starting points to tune against observation, not derived values, and SHALL be
recorded as such rather than presented as considered.

Three timings are the exception: each SHALL follow the role's poll interval, with no setting of
its own: the *abandonment bound*, three intervals, each measured as `work-claiming`'s *A
heartbeat declares its process's poll interval* says, so up to three of the maximum after a
restart or a lost state branch; the heartbeat period, half an interval; and
the stand-down threshold, two intervals. `work-claiming` states the rule each belongs to.
Changing the poll interval scales all three together. Where a process's poll interval has changed
since it started, `work-claiming`'s *A heartbeat declares its process's poll interval* says which
interval each counts in.

#### Scenario: Default applied when unset

- **WHEN** a role does not set the settle interval
- **THEN** the inherited or default value is used
- **AND** the effective value is visible via `role explain`

#### Scenario: The poll interval defaults to 10 minutes

- **WHEN** neither a role nor any role it extends sets the poll interval
- **THEN** the role polls every 10 minutes

#### Scenario: The derived timings follow the poll interval

- **WHEN** a role sets its poll interval to 4 minutes
- **THEN** its abandonment bound is 12 minutes, it writes its heartbeat every 2 minutes, and it
  stands down after 8 minutes without writing one

#### Scenario: A poll interval above the maximum is refused

- **WHEN** a role sets its poll interval to 45 minutes
- **THEN** the configuration is refused, naming 45 minutes and the maximum of 30, and a process
  starting on it exits with status 78

#### Scenario: A settle interval as long as the poll interval is refused

- **WHEN** a role sets its settle interval to 10 minutes and its poll interval to 10 minutes
- **THEN** the configuration is refused, naming both values

#### Scenario: A derived timing has no setting

- **WHEN** a role file sets the abandonment bound, the heartbeat period or the stand-down threshold
- **THEN** the role's file under `roles/` is refused, naming the key, as for any key that file
  does not read

## ADDED Requirements

### Requirement: The roster declares the ranks each role may run

`igor.config.yaml` SHALL declare the roster under the top-level key `roster`: a map from a role's
name to the list of ranks that role may run, each a whole number from 1, such as:

```yaml
roster:
  generalist: [1, 2, 3]
  reviewer: [1]
```

A role the roster does not name SHALL run rank 1 only, as though the roster declared `[1]` for it. The configuration SHALL be refused, naming
the entry, when the roster names a role with no role file, lists a rank that is not a whole
number from 1, or lists one rank twice. An `igor serve` process whose rank the roster does not declare for its
role SHALL refuse to start, naming the ranks the roster declares.

#### Scenario: A declared rank starts

- **WHEN** the roster lists `generalist: [1, 2]` and `igor serve generalist-2` starts
- **THEN** it runs as rank 2 of the `generalist` role

#### Scenario: A rank outside the declared roster fails validation

- **WHEN** an `igor serve` process starts with a rank the configuration does not declare
- **THEN** it refuses to start, naming the ranks the roster declares for its role

#### Scenario: A role the roster does not name runs rank 1

- **WHEN** the roster does not name the `reviewer` role
- **THEN** `igor serve reviewer-1` starts as rank 1, and `igor serve reviewer-2` refuses to start

#### Scenario: A malformed roster is refused

- **WHEN** the roster lists rank `0`, lists one rank twice, or names a role with no role file
- **THEN** the configuration is refused, naming the entry

### Requirement: A process is named by its role and rank

Every process `igor serve` runs SHALL be named `<role>-<rank>`, with the rank always written: the systemd
instance is `igor@<role>-<rank>`, such as `igor@generalist-2`, and it starts
`igor serve <role>-<rank>`. The rank SHALL be the last dash-separated part of the name, so a
role's name may itself contain dashes. `igor serve` given a name whose last dash-separated part
is not a whole number from 1 written in decimal with no leading zero SHALL refuse to start,
as for `02`, saying the name is `<role>-<rank>`, so each rank has one spelling. The
role's GitHub App identity SHALL be the same for every rank: no rank has an App of its own.

A role's name SHALL match `[a-z][a-z0-9-]*`: a lowercase letter, then lowercase letters, digits
and dashes. For every rank the role may run, `igor-worker-<role>-<rank>`, the name of that rank's
worker user under `task-execution`, SHALL be at most 32 characters, Linux's limit on a user name.
Loading the configuration SHALL refuse any other role name, naming the role.

#### Scenario: Every rank acts as the role's App

- **WHEN** `igor serve generalist-1` and `igor serve generalist-2` run
- **THEN** both act on GitHub as the `generalist` App

#### Scenario: A role whose name has a dash

- **WHEN** the roster lists `front-end: [1, 2]` and `igor serve front-end-2` starts
- **THEN** it runs as rank 2 of the `front-end` role

#### Scenario: A name without its rank is refused

- **WHEN** `igor serve generalist` starts
- **THEN** it refuses to start, saying the name is `<role>-<rank>`, such as `generalist-1`

#### Scenario: A rank with a leading zero is refused

- **WHEN** `igor serve generalist-02` starts
- **THEN** it refuses to start, saying the name is `<role>-<rank>`

#### Scenario: A role name outside the allowed characters is refused

- **WHEN** the role file `roles/Front.End.yaml` is loaded
- **THEN** loading the configuration fails, naming `Front.End`

#### Scenario: A role name too long for its worker users is refused

- **WHEN** the roster lists `infrastructure-maintenance: [1, 2]`
- **THEN** loading the configuration fails, naming the role, since
  `igor-worker-infrastructure-maintenance-2` is longer than 32 characters

### Requirement: The role's environment file holds single-quoted or plain values

Where `/etc/igor/<role>.env` exists, `igor serve` SHALL read it itself, before anything reads
the credentials it holds; no shell reads it. Each line SHALL be blank, a comment starting with
`#`, or `KEY=value`, where the key is made of letters, digits and `_`, and the value is
single-quoted or plain. A value is single-quoted when it starts with `'` and ends at the next
`'`, with nothing after that quote on its line, and stands for everything between the two as
written; it may span lines, as a private key does, and cannot itself hold a single quote. A quote
the file never closes is refused. A value is plain when every character in it is a
letter, a digit, or one of `_ . / : @ -`. `igor serve` SHALL refuse to start on any other line,
naming the line and its key, and never the value. A plain value SHALL hold at least one
character. Before it builds the path, `igor serve` SHALL check that the role name is one
`role-config` accepts, so that the path names a file in `/etc/igor/`. A key the file sets SHALL take the place of
the same key in the environment `igor serve` started with.

#### Scenario: A double-quoted value is refused

- **WHEN** `/etc/igor/backend.env` holds the line `GITHUB_APP_ID="123"`
- **THEN** `igor serve backend-1` refuses to start, naming that line and `GITHUB_APP_ID`
- **AND** the refusal does not print the value

#### Scenario: An unquoted value with other characters is refused

- **WHEN** `/etc/igor/backend.env` holds the line `TOKEN=ab$cd`
- **THEN** `igor serve backend-1` refuses to start, naming that line and `TOKEN`, and not the value

#### Scenario: Single-quoted and plain values start

- **WHEN** every value in `/etc/igor/backend.env` is in single quotes, or plain, as
  `GITHUB_APP_PRIVATE_KEY_FILE=/etc/igor/backend.pem`
- **THEN** the check passes

#### Scenario: A private key across several lines is read whole

- **WHEN** `/etc/igor/backend.env` holds `GITHUB_APP_PRIVATE_KEY='` on one line, the key's lines
  after it, and a closing `'` at the end of the last
- **THEN** `igor serve backend-1` reads the whole key, line breaks included

#### Scenario: A quote that never closes is refused

- **WHEN** `/etc/igor/backend.env` holds `TOKEN='abc` and no later `'`
- **THEN** `igor serve backend-1` refuses to start, naming that line and `TOKEN`, and not the value

#### Scenario: The file's value takes the place of the environment's

- **WHEN** `igor serve backend-1` starts with `GITHUB_APP_ID=1` in its environment, and
  `/etc/igor/backend.env` holds `GITHUB_APP_ID=2`
- **THEN** it uses `2`

#### Scenario: A single-quoted value is taken as written

- **WHEN** `/etc/igor/backend.env` holds the line `TOKEN='ab$cd'`
- **THEN** `igor serve backend-1` reads the value `ab$cd`, with nothing expanded
