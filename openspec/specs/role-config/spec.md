# role-config Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: A role is a file whose name is its identity

A role SHALL be a YAML file under the destination's `roles/` directory, and its name SHALL be
the filename without extension. A role file MUST NOT carry a redundant `name` field.

#### Scenario: Role located by filename

- **WHEN** a role file exists at `roles/frontend.yaml`
- **THEN** the role is named `frontend`
- **AND** it is loadable by that name without scanning file contents

#### Scenario: Redundant name field rejected

- **WHEN** a role file declares a `name` field
- **THEN** validation fails, because the filename already carries identity

### Requirement: Tracker queries pass through verbatim

A source's query SHALL be sent to the tracker unmodified. The system MUST NOT define a
canonical label, and MUST NOT translate a query between tracker syntaxes.

#### Scenario: Native syntax preserved

- **WHEN** a source declares a GitHub query of `is:issue is:open label:ai`
- **THEN** that exact string is sent to GitHub
- **AND** no rewriting or normalization is applied to it

#### Scenario: No canonical label imposed

- **WHEN** an organization marks eligible work with its own existing convention
- **THEN** that convention is expressible entirely through the query and lane
- **AND** no additional label is required for the system's benefit

### Requirement: Lane is declarative, never an expression language

`lane` SHALL be declarative constraints over normalized candidate fields — such as `labels`
with `includes` and `excludes`, `paths` with `under`, and `age` with `max_days`. It MUST NOT
support operators, boolean composition, or any syntax requiring a parser.

#### Scenario: Declarative constraints evaluated

- **WHEN** a lane declares `labels.includes: [ai]` and `labels.excludes: [Human]`
- **THEN** a candidate labelled `ai` and not `Human` matches
- **AND** a candidate labelled both does not match

#### Scenario: Expression syntax rejected

- **WHEN** a lane field contains an operator expression rather than declarative constraints
- **THEN** validation fails, because a role wanting boolean logic should be split instead

### Requirement: Roles inherit an org-level base of the same shape

A role SHALL inherit from the base named in `extends`, defaulting to the org-level base. A base
SHALL use the identical file shape, so intermediate bases are possible without a second
artifact type.

`extends` SHALL name at most one base. A role naming two or more SHALL be refused, naming the
bases and saying how to build a role that spans several areas: give it its own lane and its own
`allow` and `commands`, and share what roles have in common through an intermediate base.

A role with two bases would take whatever both allow, so a change to either base would change
what it may do without its own file or its single line of ancestors changing, and nobody
reviewing that change would see the role it widened. Two bases would also have to be reconciled
on every field where the last level wins, such as `poll_minutes`. With one base, a role's own file
and its ancestors say all it may do.

#### Scenario: Org base inherited

- **WHEN** a role extends the org base and declares no poll interval of its own
- **THEN** the org base's poll interval applies

#### Scenario: Intermediate base composed

- **WHEN** a role extends a base that itself extends the org base
- **THEN** values resolve through the whole chain

#### Scenario: Two bases refused

- **WHEN** a role declares `extends: [backend, frontend]`
- **THEN** the role is refused, naming both bases
- **AND** the refusal says to give a role spanning both areas its own lane and permissions,
  extending a shared base

#### Scenario: A role spanning two areas through one base

- **WHEN** `fullstack` extends `engineering`, which extends the org base, and declares a lane
  covering both the frontend and backend paths, with its own `allow` and `commands`
- **THEN** the role loads
- **AND** a later change to a `frontend` role extending `engineering` does not change what
  `fullstack` may do

### Requirement: Merge semantics differ by field kind

Inheritance SHALL apply three merge semantics, selected per field:

The `allow` vocabulary is a **closed set**, so a typo fails validation rather than silently
granting nothing: `comment`, `review-comment`, `draft-pr`, `pr`, `label`, `merge`, `send`. A role
that lists any other word is refused at load, naming the valid actions. The safe default an org
base should ship with is `[draft-pr, comment]` — everything reversible, nothing final.

- **Monotonic** for permission-shaped fields (`allow`, `commands`, `budget_share`,
  repositories and surfaces in reach): a role MAY restrict what it inherits and MUST NOT
  widen it.
- **Override** for settings (`seat`, poll interval, settle interval, cooldown): the most specific
  level wins.
- **Append** for `instructions` and `lane`: levels accumulate, with lane constraints conjoined.

#### Scenario: Role narrows a permission

- **WHEN** the org base allows `[draft-pr, comment]` and a role allows `[comment]`
- **THEN** the role's effective allow list is `[comment]`

#### Scenario: Role attempting to widen a permission is rejected

- **WHEN** the org base allows `[comment]` and a role allows `[draft-pr, comment]`
- **THEN** validation fails, because widening an inherited permission is self-escalation

#### Scenario: Role attempting to widen its commands is rejected

- **WHEN** the org base permits the command `npm test` and a role also declares `npm install`
- **THEN** validation fails, for the reason widening `allow` fails: a role that can grant
  itself a command can grant itself every command

#### Scenario: An action outside the vocabulary is refused

- **WHEN** a role's `allow` lists `unassign`
- **THEN** the role is refused at load, naming the valid actions

#### Scenario: Setting overridden

- **WHEN** the org base sets `poll_minutes: 10` and a role sets `poll_minutes: 2`
- **THEN** the role's effective poll interval is 2 minutes

#### Scenario: Instructions accumulate

- **WHEN** both the org base and a role declare `instructions`
- **THEN** both texts apply to the worker

#### Scenario: Org lane exclusion is inescapable

- **WHEN** the org base excludes label `Human` and a role declares its own lane
- **THEN** the effective lane still excludes `Human`
- **AND** no role-level declaration can remove it, because lane constraints are conjoined

### Requirement: The effective configuration of a role is explainable

The system SHALL provide a command reporting a role's effective merged configuration,
annotating each value with the level it came from.

#### Scenario: Effective config reported with provenance

- **WHEN** a role inheriting from an org base is explained
- **THEN** every effective value is shown
- **AND** each is annotated with whether it came from the role, a base, or a default

### Requirement: A role can be dry-run without acting

The system SHALL provide a command that runs discovery and triage for a role over recent items
and reports what it *would* have claimed and why. A dry run MUST NOT claim, post, or write to
any surface.

#### Scenario: Dry run reports decisions without acting

- **WHEN** a role is dry-run against a tracker
- **THEN** each candidate considered is reported with its triage outcome and reason
- **AND** no claim, comment, or assignment is made on any surface

#### Scenario: Dry run surfaces a mis-scoped lane

- **WHEN** a lane predicate is wrong such that out-of-scope items would be claimed
- **THEN** those items appear in the dry run output
- **AND** the mistake is visible before anything is posted publicly

### Requirement: Timing values are configurable with stated defaults

Every interval SHALL be configurable and SHALL have a default, since an unstated default is a
value someone guesses differently each time: a **settle interval** of 10 seconds before a claim
is verified, and a **cooldown** of 1 hour before a stopped item returns to the pool.

These are starting points to tune against observation, not derived values, and SHALL be
recorded as such rather than presented as considered.

#### Scenario: Default applied when unset

- **WHEN** a role does not set the settle interval
- **THEN** the inherited or default value is used
- **AND** the effective value is visible via `role explain`

### Requirement: A role file refuses a key nobody reads

A role file SHALL refuse a key outside the set it declares, naming the offending key and the
accepted ones. The refusal SHALL apply wherever a role file is read — the role asked for, the
org base it inherits, and a parent read only for what it contributes — and SHALL extend to the
nested mappings: `lane`, its `labels`, `paths` and `age`, and each `sources` entry.

A role already refuses an action inside `allow` that it does not recognise, on the grounds that
a typo must fail rather than silently grant nothing. The keys around it had no such rule, so
the same typo one line higher granted nothing just as quietly.

Inside `lane` it is not a setting that fails to take but a constraint that disappears. A
misspelt `excludes` leaves a lane that admits everything its author meant to keep out, and a
lane is where `Human` and `wontfix` are kept away from an Igor.

#### Scenario: An unreadable key on a role is named

- **WHEN** a role file names a key the parser does not read
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: The org base is held to the same rule

- **WHEN** the org base names an unreadable key
- **THEN** every role inheriting it is refused, rather than each quietly losing whatever it was
  meant to set

#### Scenario: A lane constraint nobody reads is refused

- **WHEN** a lane names `exclude` in place of `excludes`, or any other key the parser does not
  read
- **THEN** it is refused, rather than producing a lane missing that constraint

### Requirement: An Igor's GitHub App identity is its role's name

An Igor running a role SHALL act on GitHub as the github-app identity of the same name: the Igor
for `roles/reviewer.yaml` acts as the identity `reviewer`. No role file, base or configuration
key SHALL name an App identity, an App ID, a private key or a key path.

The identity's credentials SHALL be read only from the Igor's environment, and only when
`GITHUB_APP_IDENTITY` names this identity: `GITHUB_APP_ID`, with exactly one of
`GITHUB_APP_PRIVATE_KEY_FILE` or `GITHUB_APP_PRIVATE_KEY`. An environment that sets both key
variables SHALL be refused, naming both. On a server these variables come from the role's
environment file, `/etc/igor/<role>.env`; when a person runs an Igor themselves, from their
shell. The Igor SHALL have no other source: it SHALL NOT read the files the `github-app` skill
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

- **WHEN** `igor serve reviewer` starts
- **THEN** it acts as the github-app identity `reviewer`

#### Scenario: Credentials come only from the environment

- **WHEN** `igor serve reviewer` starts with no `GITHUB_APP_*` variables in its environment, and
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

### Requirement: A role declares its sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `allow`,
`commands`, `budget_share`, and `reviewers`. Each `sources` entry MUST name a
`tracker` and carry that tracker's own query verbatim. Entries failing validation SHALL be
rejected rather than loaded.

`commands` names the shell commands a worker may run, and is the only thing that lets one
run anything at all. It is declared on the role and nowhere else: a worker that can edit
files can edit a settings file in the repository it is working, so an allowlist read from
there is one the worker can widen for itself.

#### Scenario: Well-formed role accepted

- **WHEN** a role declares a tracker source, a lane, standing instructions, an allow list, and
  reviewers
- **THEN** validation passes and the role loads

#### Scenario: Declared commands bound what the worker may run

- **WHEN** a role declares `commands` and an item is executed
- **THEN** the worker may run those commands and nothing else

#### Scenario: Source without a tracker rejected

- **WHEN** a `sources` entry omits `tracker`
- **THEN** validation fails, because a query cannot be dispatched without knowing who executes it

### Requirement: An Igor holds exactly one role

An Igor SHALL hold exactly one role, and its identity on every surface SHALL be that role: a
GitHub App on GitHub, and an app user on Linear. A person reading a
claim sees which role took the item, and hands work to a role by naming it. Igors of different
roles MAY draw on the same seat, since a seat is capacity and not an identity.

Processes running the same role under the same identity are one Igor and are interchangeable.

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

