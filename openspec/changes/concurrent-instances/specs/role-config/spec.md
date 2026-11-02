## MODIFIED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. Igors of different roles MAY draw on the same
seat.

Processes running the same role under the same identity are one Igor. They SHALL share the
role's identity and differ only by rank: a whole number from 1 given to each serving process
when it is started, or 0 for `igor run`. `work-claiming` says how a rank's claims pass to another
process.

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

An Igor SHALL act as the github-app identity named as its role; no role file, base or configuration
key SHALL name an App identity, App ID, private key or key path. Its credentials SHALL come only
from its environment, and only when `GITHUB_APP_IDENTITY` names this identity: `GITHUB_APP_ID` and
exactly one of `GITHUB_APP_PRIVATE_KEY_FILE` or `GITHUB_APP_PRIVATE_KEY`. It SHALL NOT need the
`github-app` skill or read its stored files, `GITHUB_APP_OWNER` or `GITHUB_APP_INSTALLATION_ID`.

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

#### Scenario: Both private key variables are refused

- **WHEN** the Igor's environment sets both `GITHUB_APP_PRIVATE_KEY_FILE` and
  `GITHUB_APP_PRIVATE_KEY` for its identity
- **THEN** it is refused, naming both variables

#### Scenario: A served Igor's credentials come from the role's environment file

- **WHEN** `igor serve reviewer-1` starts and `/etc/igor/reviewer.env` holds `GITHUB_APP_IDENTITY`,
  `GITHUB_APP_ID` and one private key variable for `reviewer`
- **THEN** it reads them into its own environment, as *The role's environment file holds
  single-quoted or plain values* says, and acts as `reviewer` with them

#### Scenario: The Igor runs without the github-app skill

- **WHEN** the Igor's environment holds its identity's credentials and the `github-app` skill is
  not installed
- **THEN** it acts as its identity

### Requirement: Timing values are configurable with stated defaults

Every interval SHALL be configurable and SHALL have a default, except the maximum poll interval, the
four derived timings, and those the scenario *Timings fixed elsewhere have no setting* lists, none
of which SHALL be configurable. The defaults are a **settle interval** of 10 seconds, a **cooldown**
of 1 hour before a stopped item returns to the pool, and a **poll interval** of 10 minutes. These
defaults SHALL be recorded as starting points to tune, not as considered values.

#### Scenario: Default applied when unset

- **WHEN** a role does not set the settle interval
- **THEN** the inherited or default value is used
- **AND** the effective value is visible via `role explain`

#### Scenario: The poll interval defaults to 10 minutes

- **WHEN** neither a role nor any role it extends sets the poll interval
- **THEN** the role polls every 10 minutes

#### Scenario: Timings fixed elsewhere have no setting

- **WHEN** a role file sets any of these timings, each fixed in code by the requirement named. #228
  (`probe-claim`) adds to `stuck-conditions` the requirement *Exactly one Igor takes a due probe,
  decided by the log after it writes*, which fixes two: the append deadline, how long an Igor waits
  for a probe row to land, and the probe settle interval, the wait before reading which probe row
  decides. This change's `stuck-conditions` fixes two more: the probe lapse, three of the maximum
  poll interval, in *A probe lapses when its Igor stops keeping it alive in the log*, and the
  keepalive append's deadline, half a poll interval, in *A prober whose keepalives fail twice in a
  row stops and voids its probe*. `work-claiming` fixes the other four: the window of one maximum
  poll interval after a process starts, in which the process counts its role as run by several
  processes; the three maximum poll intervals after which the condition for a second process on a
  rank clears; the half settle interval within which a process whose claim message failed to post
  may remove the label and post the refusal giving its claim back; and the one poll interval within
  which a claim is verified
- **THEN** the role's file under `roles/` is refused, naming the key, as for any key that file
  does not read

## ADDED Requirements

### Requirement: The skill's installation variables change nothing the Igor does

The environment file MAY carry `GITHUB_APP_OWNER` and `GITHUB_APP_INSTALLATION_ID` only so the
`github-app` skill's `check` can choose an installation when the App is installed on more than one
account; their presence or value SHALL NOT change what the Igor does.

#### Scenario: An installation variable that names another account changes nothing

- **WHEN** a role's environment file sets `GITHUB_APP_INSTALLATION_ID` to an installation on
  another account than the one covering the role's repositories
- **THEN** the Igor finds and uses the installation that covers its repositories, as without it

### Requirement: The settle interval is shorter than the poll interval

The settle interval SHALL be shorter than the poll interval. A configuration that sets it as long
or longer SHALL be refused, naming both values.

#### Scenario: A settle interval as long as the poll interval is refused

- **WHEN** a role sets its settle interval to 10 minutes and its poll interval to 10 minutes
- **THEN** the configuration is refused, naming both values

#### Scenario: A settle interval longer than the poll interval is refused

- **WHEN** a role sets its settle interval to 15 minutes and its poll interval to 10 minutes
- **THEN** the configuration is refused, naming both values

### Requirement: The maximum poll interval is 30 minutes, fixed in Igor

Igor SHALL have a *maximum poll interval* of 30 minutes, three times the default rather than
tuned, and not configurable; `work-claiming`'s *A heartbeat declares its process's poll interval* says how a process uses it.
A configuration setting a poll interval above it SHALL be refused when it loads, naming the value
and the maximum, and so SHALL `igor serve --poll` above it; a process refusing to start for either
exits with status 78.

#### Scenario: A poll interval above the maximum is refused

- **WHEN** a role sets its poll interval to 45 minutes
- **THEN** the configuration is refused, naming 45 minutes and the maximum of 30, and a process
  starting on it exits with status 78

#### Scenario: A `--poll` above the maximum is refused

- **WHEN** `igor serve` is given `--poll 45m`
- **THEN** it refuses to start, naming the 30-minute maximum
- **AND** the process exits with status 78

### Requirement: Four timings follow the poll interval and have no setting of their own

Four timings SHALL follow the role's poll interval, with no setting of their own: the probe
keepalive, appended every interval (`stuck-conditions`); the *abandonment bound*, three intervals;
the heartbeat period, half an interval; and the stand-down threshold, two intervals. Changing the
poll interval scales all four together. `work-claiming` says how each interval is measured,
including after the poll interval changes.

#### Scenario: The derived timings follow the poll interval

- **WHEN** a role sets its poll interval to 4 minutes, every process of it applies that, and a
  watching process has seen its sibling declare it
- **THEN** the abandonment bound the watching process applies to that sibling is 12 minutes; each
  process writes its heartbeat every 2 minutes and stands down after 8 minutes without writing one;
  and a process working a probe appends a keepalive every 4 minutes

#### Scenario: A derived timing has no setting

- **WHEN** a role file sets the abandonment bound, the heartbeat period, the stand-down threshold
  or the probe keepalive interval
- **THEN** the role's file under `roles/` is refused, naming the key, as for any key that file
  does not read

#### Scenario: A watcher with no declaration counts the abandonment bound in the maximum

- **WHEN** a watching process holds no poll interval its sibling declared, as after a restart or
  a loss of the state branch
- **THEN** the abandonment bound it applies to that sibling is three of the maximum poll
  interval, 90 minutes

### Requirement: The roster declares the ranks each role may run

The top-level key `roster` of `igor.config.yaml` SHALL map a role's name to the list of ranks that
role may run, each a whole number from 1. A role the roster does not name SHALL run rank 1 only.
The configuration SHALL be refused, naming the entry, where an entry names a role with no role
file, or lists no rank, one rank twice, or a rank that is not a whole number from 1. `igor serve`
SHALL refuse to start on a rank the roster does not declare for its role, naming the ranks it
declares.

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

#### Scenario: A role with an empty rank list is refused

- **WHEN** the roster names a role with `[]`
- **THEN** the configuration is refused, naming that role's entry

### Requirement: A process is named by its role and rank

Every process `igor serve` runs SHALL be named `<role>-<rank>`, the rank always written as the
name's last dash-separated part: a whole number from 1 in decimal with no leading zero. Its systemd
instance SHALL be `igor@<role>-<rank>`, which starts `igor serve <role>-<rank>`. `igor serve` SHALL
refuse any other name, saying it must have the form `<role>-<rank>`. The role's GitHub App identity
SHALL be the same for every rank: no rank has an App of its own.

#### Scenario: Every rank acts as the role's App

- **WHEN** `igor serve generalist-1` and `igor serve generalist-2` run
- **THEN** both act on GitHub as the `generalist` App

#### Scenario: A rank's systemd instance carries its name

- **WHEN** rank 2 of the `generalist` role runs under systemd
- **THEN** its instance is `igor@generalist-2`, and it starts `igor serve generalist-2`

#### Scenario: A role whose name has a dash

- **WHEN** the roster lists `front-end: [1, 2]` and `igor serve front-end-2` starts
- **THEN** it runs as rank 2 of the `front-end` role

#### Scenario: A name without its rank is refused

- **WHEN** `igor serve generalist` starts
- **THEN** it refuses to start, saying the name must have the form `<role>-<rank>`, such as `generalist-1`

#### Scenario: A rank with a leading zero is refused

- **WHEN** `igor serve generalist-02` starts
- **THEN** it refuses to start, saying the name must have the form `<role>-<rank>`

### Requirement: A role's name is lowercase and fits its worker users' names

A role's name SHALL match `[a-z][a-z0-9-]*`, and `igor-worker-<role>-<rank>`, the worker user of
each rank the role may run, SHALL fit Linux's 32-character limit on a user name. Loading the
configuration SHALL refuse any other role name, naming the role.

#### Scenario: A role name outside the allowed characters is refused

- **WHEN** the role file `roles/Front.End.yaml` is loaded
- **THEN** loading the configuration fails, naming `Front.End`

#### Scenario: A role name too long for its worker users is refused

- **WHEN** the roster lists `infrastructure-maintenance: [1, 2]`
- **THEN** loading the configuration fails, naming the role, since
  `igor-worker-infrastructure-maintenance-2` is longer than 32 characters

### Requirement: The role's environment file holds single-quoted or plain values

Where `/etc/igor/<role>.env` exists, `igor serve` SHALL read it itself, with no shell, before
anything reads its credentials. Each line SHALL be blank, a `#` comment, or `KEY=value`, with a key
of letters, digits and `_`. A value SHALL be single-quoted — from `'` to the next `'`, the last
character on its line, standing for everything between as written — or plain: one or more letters,
digits or `_ . / : @ -`. `igor serve` SHALL refuse to start on any other line, naming only its line
number.

#### Scenario: A double-quoted value is refused

- **WHEN** `/etc/igor/backend.env` holds the line `GITHUB_APP_ID="123"`
- **THEN** `igor serve backend-1` refuses to start, naming that line's number
- **AND** the refusal prints nothing of the line

#### Scenario: An unquoted value with other characters is refused

- **WHEN** `/etc/igor/backend.env` holds the line `TOKEN=ab$cd`
- **THEN** `igor serve backend-1` refuses to start, naming that line's number and printing
  nothing of the line

#### Scenario: A line after a stray quote is refused without printing it

- **WHEN** `/etc/igor/backend.env` holds a single-quoted private key with a stray `'` inside it,
  so that a later line of the key, such as `AbCd12==`, is read as a line of its own
- **THEN** `igor serve backend-1` refuses to start on the first line that does not parse,
  naming its number and printing nothing of the line

#### Scenario: Single-quoted and plain values start

- **WHEN** every value in `/etc/igor/backend.env` is in single quotes, or plain, as
  `GITHUB_APP_PRIVATE_KEY_FILE=/etc/igor/backend.pem`
- **THEN** the check passes

#### Scenario: A private key across several lines is read whole

- **WHEN** `/etc/igor/backend.env` holds `GITHUB_APP_PRIVATE_KEY='` on one line, the key's lines
  after it, and a closing `'` at the end of the last
- **THEN** `igor serve backend-1` reads the whole key, line breaks included

#### Scenario: An empty value is refused

- **WHEN** `/etc/igor/backend.env` holds the line `TOKEN=`
- **THEN** `igor serve backend-1` refuses to start, naming that line's number

#### Scenario: A quote that never closes is refused

- **WHEN** `/etc/igor/backend.env` holds `TOKEN='abc` and no later `'`
- **THEN** `igor serve backend-1` refuses to start, naming the number of the line with the
  opening quote and printing nothing of it

#### Scenario: A single-quoted value is taken as written

- **WHEN** `/etc/igor/backend.env` holds the line `TOKEN='ab$cd'`
- **THEN** `igor serve backend-1` reads the value `ab$cd`, with nothing expanded

#### Scenario: Comments and blank lines are skipped

- **WHEN** the environment file holds a blank line and a line starting with `#` among its values
- **THEN** `igor serve` starts, reading only the `KEY=value` lines

### Requirement: The role's environment file is looked for only in `/etc/igor/`

Before it builds the path `/etc/igor/<role>.env`, `igor serve` SHALL check that the role name is
one `role-config` accepts, so that the path names a file in `/etc/igor/`.

#### Scenario: A role name that leaves `/etc/igor/` is refused before any file is read

- **WHEN** `igor serve ../x-1` is started
- **THEN** it refuses to start, saying the name must have the form `<role>-<rank>`, and reads no file outside
  `/etc/igor/`

### Requirement: The role's environment file overrides the environment `igor serve` started with

A key `/etc/igor/<role>.env` sets SHALL take the place of the same key in the environment that
`igor serve` started with.

#### Scenario: The file's value takes the place of the environment's

- **WHEN** `igor serve backend-1` starts with `GITHUB_APP_ID=1` in its environment, and
  `/etc/igor/backend.env` holds `GITHUB_APP_ID=2`
- **THEN** it uses `2`

### Requirement: Explaining a role reports its identity and any missing credential

`igor role explain` SHALL report which identity a role acts as and whether its environment holds
that identity's credentials, naming each variable that is missing.

#### Scenario: Explain names a missing credential variable

- **WHEN** `igor role explain reviewer` runs with `GITHUB_APP_IDENTITY=reviewer` and a private key
  variable in its environment, and no `GITHUB_APP_ID`
- **THEN** it reports the identity `reviewer`, says its credentials are incomplete, and names
  `GITHUB_APP_ID` as missing
