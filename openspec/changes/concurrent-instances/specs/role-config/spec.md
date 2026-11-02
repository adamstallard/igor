## MODIFIED Requirements

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. Igors of different roles MAY draw on the same
seat. Processes running the same role under the same identity are one Igor: they SHALL share the
role's identity and differ only by rank, a whole number from 1 given to each serving process when
it is started, or 0 for `igor run`. `work-claiming` says how a rank's claims pass to another
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

An Igor running a role SHALL act on GitHub as the github-app identity named for its role; no role
file, base or configuration key SHALL name an App identity, App ID, private key or key path. It
SHALL read its credentials only from its environment, and only when
`GITHUB_APP_IDENTITY` names it: `GITHUB_APP_ID`, with exactly one of
`GITHUB_APP_PRIVATE_KEY_FILE` or `GITHUB_APP_PRIVATE_KEY`. It SHALL NOT read the `github-app`
skill's stored files, `GITHUB_APP_OWNER` or `GITHUB_APP_INSTALLATION_ID`.

#### Scenario: The role's name is the identity

- **WHEN** `igor serve reviewer-1` starts, for the role file `roles/reviewer.yaml`
- **THEN** it acts as the github-app identity `reviewer`

#### Scenario: Credentials come only from the environment

- **WHEN** `igor serve reviewer-1` starts with no `GITHUB_APP_*` variables in its environment, and
  `~/.config/github-app/reviewer.json` and `reviewer.pem` exist
- **THEN** it does not read those files, nor anything else the `github-app` skill stores
- **AND** it refuses to start, naming the missing variables
- **AND** it behaves the same whether or not the `github-app` skill is installed

#### Scenario: The skill's installation variables are ignored

- **WHEN** the environment sets `GITHUB_APP_OWNER` or `GITHUB_APP_INSTALLATION_ID`, naming an
  account or installation other than the one covering the role's repositories
- **THEN** the Igor finds its installation from the repositories, as it does without them
- **AND** the environment file may still carry them, for the `github-app` skill's `check` to
  choose an installation when the App is installed on more than one account

#### Scenario: Environment credentials for another identity are not used

- **WHEN** the Igor's environment sets `GITHUB_APP_ID` with `GITHUB_APP_IDENTITY` unset or naming
  another identity
- **THEN** those variables are not this Igor's credentials
- **AND** the refusal names the identity the variables belong to and the one this Igor acts as

#### Scenario: Explain says who the role acts as

- **WHEN** `igor role explain reviewer` runs
- **THEN** it reports the identity `reviewer` and whether its environment holds that identity's
  credentials, naming any missing variable


#### Scenario: An Igor does not depend on the github-app skill

- **WHEN** an Igor starts, with or without the `github-app` skill installed on its host
- **THEN** it reads its App credentials as this requirement says either way, and nothing it does
  needs the skill

### Requirement: Timing values are configurable with stated defaults

Every interval SHALL be configurable and have a default, except the maximum poll interval, the
five timings that follow the poll interval, and exactly those the scenario *A timing another
requirement fixes has no setting* lists. The defaults are a 10-second settle interval before a
claim is verified, a 1-hour cooldown before a stopped item returns to the pool, and a 10-minute
poll interval. These defaults SHALL be recorded as starting points to tune against observation,
not as considered values.

#### Scenario: Default applied when unset

- **WHEN** a role does not set the settle interval
- **THEN** the inherited or default value is used
- **AND** the effective value is visible via `role explain`

#### Scenario: The poll interval defaults to 10 minutes

- **WHEN** neither a role nor any role it extends sets the poll interval
- **THEN** the role polls every 10 minutes

#### Scenario: A settle interval as long as the poll interval is refused

- **WHEN** a role sets its settle interval to 10 minutes and its poll interval to 10 minutes, or
  any settle interval not shorter than its poll interval
- **THEN** the configuration is refused, naming both values

#### Scenario: A timing another requirement fixes has no setting

- **WHEN** a role file sets any timing other requirements fix, which are these and no others:
  #228's probe append deadline or probe settle interval;
  `stuck-conditions`' probe lapse or keepalive append deadline; or `work-claiming`'s window of
  one maximum poll interval after a process starts, in which it counts its role as run by several
  processes, its three maximum poll intervals after which the condition for a second process on a
  rank clears, its half settle interval within which a process whose claim message failed to
  post may remove the label and post #173's refusal giving its claim back, or its one poll
  interval within which a claim is verified
- **THEN** the role's file under `roles/` is refused, naming the key: these timings have no
  setting, so the file does not read the key, and the in-force *A role file refuses a key nobody
  reads* refuses it; this scenario adds no check of its own

## ADDED Requirements

### Requirement: Igor fixes its maximum poll interval and the timings derived from it

Igor SHALL fix, with no setting, a *maximum poll interval* of 30 minutes, and five timings.
Under `work-claiming`: the heartbeat period and the stand-down check, 0.5 times, and the
stand-down threshold, 2 times, the shortest interval a process has applied; and the *abandonment
bound*, 3 of the longest interval a watcher counts by. Under `stuck-conditions`: the probe
keepalive, 1 of that shortest interval. A poll interval above the maximum SHALL be refused,
naming it and the maximum.

#### Scenario: The derived timings follow the poll interval

- **WHEN** a role sets its poll interval to 4 minutes, every process of it applies that, and a
  watching process has seen its sibling declare it
- **THEN** its abandonment bound is 12 minutes, it writes its heartbeat every 2 minutes, it
  stands down after 8 minutes without writing one, its timer checks for a stand-down every 2
  minutes, and a process working a probe appends a keepalive every 4 minutes

#### Scenario: A poll interval above the maximum is refused

- **WHEN** a role sets its poll interval to 45 minutes
- **THEN** the configuration is refused, naming 45 minutes and the maximum of 30, and a process
  starting on it exits with status 78

#### Scenario: A derived timing has no setting

- **WHEN** a role file sets the abandonment bound, the heartbeat period, the stand-down threshold,
  the stand-down check or the probe keepalive interval
- **THEN** the role's file under `roles/` is refused, naming the key, as for any key that file
  does not read

#### Scenario: A `--poll` above the maximum is refused

- **WHEN** `igor serve` is given `--poll 45m`
- **THEN** it refuses to start, naming the 30-minute maximum
- **AND** the process exits with status 78



### Requirement: The roster declares the ranks each role may run

`igor.config.yaml` SHALL declare, under the top-level key `roster`, a map from a role's name to
the ranks it may run. A role the roster does not name SHALL run rank 1 only. The configuration
SHALL be refused, naming the entry, when the roster names a role with no role file, lists a rank
that is not a whole number from 1, lists one rank twice, or lists no rank. An `igor serve`
process of a rank the roster does not declare for its role SHALL refuse to start, naming the
declared ranks.

#### Scenario: A declared rank starts

- **WHEN** `igor.config.yaml` holds the roster below, and `igor serve generalist-2` starts

  ```yaml
  roster:
    generalist: [1, 2]
    reviewer: [1]
  ```
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

Every `igor serve` process SHALL be named `<role>-<rank>`, the rank always written. The rank is
the name's last dash-separated part; where that is not a whole number from 1 in decimal with no
leading zero, `igor serve` SHALL refuse to start, saying the name must have the form
`<role>-<rank>`. Loading the configuration SHALL refuse, naming it, a role whose name does not
match `[a-z][a-z0-9-]*`, or whose worker user `igor-worker-<role>-<rank>` would pass 32
characters for a rank it may run.

#### Scenario: Every rank acts as the role's App

- **WHEN** ranks 1 and 2 of the `generalist` role run under systemd
- **THEN** their instances are `igor@generalist-1` and `igor@generalist-2`, which start
  `igor serve generalist-1` and `igor serve generalist-2`, as every process's instance is
  `igor@<role>-<rank>`, starting `igor serve <role>-<rank>`
- **AND** both act on GitHub as the `generalist` App, and neither has an App of its own

#### Scenario: A role whose name has a dash

- **WHEN** the roster lists `front-end: [1, 2]` and `igor serve front-end-2` starts
- **THEN** it runs as rank 2 of the `front-end` role

#### Scenario: A name without its rank is refused

- **WHEN** `igor serve generalist` starts
- **THEN** it refuses to start, saying the name must have the form `<role>-<rank>`, such as `generalist-1`

#### Scenario: A rank with a leading zero is refused

- **WHEN** `igor serve generalist-02` starts
- **THEN** it refuses to start, saying the name must have the form `<role>-<rank>`

#### Scenario: A role name outside the allowed characters is refused

- **WHEN** the role file `roles/Front.End.yaml` is loaded
- **THEN** loading the configuration fails, naming `Front.End`

#### Scenario: A role name too long for its worker users is refused

- **WHEN** the roster lists `infrastructure-maintenance: [1, 2]`
- **THEN** loading the configuration fails, naming the role, since
  `igor-worker-infrastructure-maintenance-2` is longer than 32 characters


### Requirement: The role's environment file holds single-quoted or plain values

Where `/etc/igor/<role>.env` exists, `igor serve` SHALL read it itself, with no shell, before
anything reads its credentials, and before building its path SHALL check the role name is one
`role-config` accepts. Each line SHALL be blank, a `#` comment, or `KEY=value`, the key of
letters, digits and `_`, the value single-quoted, `'` to the next `'`, which must end its line,
or plain, one or more letters, digits or `_ . / : @ -`. Otherwise it SHALL refuse to start,
naming only the line's number.

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

#### Scenario: A role name that leaves `/etc/igor/` is refused before any file is read

- **WHEN** `igor serve ../x-1` is started
- **THEN** it refuses to start, saying the name must have the form `<role>-<rank>`, and reads no file outside
  `/etc/igor/`

#### Scenario: A quote that never closes is refused

- **WHEN** `/etc/igor/backend.env` holds `TOKEN='abc` and no later `'`
- **THEN** `igor serve backend-1` refuses to start, naming the number of the line with the
  opening quote and printing nothing of it

#### Scenario: The file's value takes the place of the environment's

- **WHEN** `igor serve backend-1` starts with `GITHUB_APP_ID=1` in its environment, and
  `/etc/igor/backend.env` holds `GITHUB_APP_ID=2`
- **THEN** it uses `2`, as it does for every key the file sets

#### Scenario: A single-quoted value is taken as written

- **WHEN** `/etc/igor/backend.env` holds the line `TOKEN='ab$cd'`
- **THEN** `igor serve backend-1` reads the value `ab$cd`, with nothing expanded

#### Scenario: Comments and blank lines are skipped

- **WHEN** the environment file holds a blank line and a line starting with `#` among its values
- **THEN** `igor serve` starts, reading only the `KEY=value` lines


