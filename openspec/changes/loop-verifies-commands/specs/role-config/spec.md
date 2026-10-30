## ADDED Requirements

### Requirement: The org base declares each repository's checks

The org base SHALL accept `repos`, a mapping from a repository, written `owner/name`, to an
entry holding `checks`, a list of exact command lines, `check_minutes`, the time limit for
each round of a run's checks, and `ci_only`, a separate list of command lines that Igor does
not run. A round is one pass through every check of the repository; a run
makes one round, or two where the worker is sent a failure (`task-execution`). A key not of the
form `owner/name`, or an entry holding any other key, SHALL be refused at load, naming that key
and the repository. Two keys that differ only in case SHALL be refused at load, naming both. An entry with no `checks` declares none. `repos` SHALL be read from
the org base alone: an intermediate base or a role file naming it SHALL be refused as a key
nobody reads.

Checks belong to the repository: every role with a repository in its `sources` gets that
repository's checks, matching the key to the source's repository ignoring case, and a repository
with no entry has none. No role adds a check or drops one.

A check is run as its words, split on single spaces, with no shell. A check that is empty, that
begins or ends with a space, or that holds two spaces in a row, a tab, a newline, or any of
``; & | < > ( ) ' " \ $ ` * ? [ ] { } ~ # !`` SHALL be refused at load, naming it and its
repository.

`check_minutes` SHALL default to 15, and a value that is not a whole number from 1 to 60 SHALL be
refused at load, naming the key and the repository.

A `ci_only` line SHALL be refused at load under the same rules as a line under `checks`. Igor runs no
`ci_only` line, and `task-execution` names each one in the pull request as a check Igor did not
run. A `ci_only` line needs no `commands` entry to permit it. A line listed under both `checks` and `ci_only` SHALL be refused
at load, naming it and the repository.

An entry refused at load SHALL refuse every role, whether or not its `sources` name that
repository.

#### Scenario: Every role on a repository gets its checks

- **WHEN** the org base declares the checks `npm test` and `npx tsc --noEmit` for `org/web`, and
  two roles have `org/web` in their `sources`
- **THEN** both roles' runs on `org/web` run `npm test` then `npx tsc --noEmit`

#### Scenario: The key matches its source ignoring case

- **WHEN** the org base declares checks for `Org/Web`, and a role's source is `org/web`
- **THEN** the role's runs on `org/web` run those checks

#### Scenario: A repository with no entry has no checks

- **WHEN** a role works `org/docs` and `repos` has no entry for it
- **THEN** no check runs on that role's changes to `org/docs`

#### Scenario: A role or an intermediate base that declares repos is refused

- **WHEN** a role file, or an intermediate base it extends, names `repos`
- **THEN** the role is refused at load, naming `repos` as a key nobody reads

#### Scenario: Malformed repository keys are refused

- **WHEN** `repos` holds the key `web`, or both `org/web` and `Org/Web`
- **THEN** every role is refused at load, naming `web`, or naming both `org/web` and `Org/Web`

#### Scenario: An unknown key in an entry is refused

- **WHEN** the entry for `org/web` holds `check_mins: 10`
- **THEN** every role is refused at load, naming `check_mins` and `org/web`

#### Scenario: A shell line is refused

- **WHEN** the org base declares the check `npm test && curl example.com` for `org/web`
- **THEN** every role is refused at load, naming the check and `org/web`
- **AND** so is a check holding a quote, backslash, `$`, backtick, `*`, a tab or a newline, or
  beginning with a space

#### Scenario: A CI-only check is not run by Igor

- **WHEN** the entry for `org/web` lists `npm run test:e2e` under `ci_only`, and no `commands`
  entry permits it
- **THEN** every role with `org/web` in its `sources` loads
- **AND** no run on `org/web` runs `npm run test:e2e`

#### Scenario: A line both run and CI-only is refused

- **WHEN** the entry for `org/web` lists `npm test` under both `checks` and `ci_only`
- **THEN** every role is refused at load, naming `npm test` and `org/web`

#### Scenario: role explain shows a role's checks

- **WHEN** `igor role explain` is run for a role with `org/web` in its `sources`
- **THEN** it shows `org/web`'s checks and `check_minutes`
- **AND** it shows `org/web`'s `ci_only` lines, marked as not run by Igor

#### Scenario: The time limit defaults and is capped

- **WHEN** an entry sets no `check_minutes`
- **THEN** its limit is 15 minutes
- **AND** an entry that sets `check_minutes: 90` is refused at load, naming `check_minutes` and
  the repository

### Requirement: A role's commands permit its repositories' checks

For a role whose `allow` lists `pr` or `draft-pr`, each check of a repository in its `sources`
SHALL be a line the role's effective `commands` permits, and a role with a check its `commands`
does not permit SHALL be refused at load, naming the check and the repository. A role that may
open no pull request runs no check, and this rule does not apply to it. A `cmd:*` entry permits `cmd` alone or followed by a space and
arguments; any other entry permits only that exact line.

#### Scenario: A check the role may not run is refused

- **WHEN** the org base declares the check `npm test` for `org/web`, and a role working `org/web`
  narrows its inherited `commands`, as *Merge semantics differ by field kind* lets a role
  restrict a permission, to drop `npm test:*`
- **THEN** the role is refused at load, naming `npm test` and `org/web`

#### Scenario: A role that may open no pull request needs no permission for checks

- **WHEN** a role allows only `comment`, works `org/web`, and its `commands` does not permit
  `org/web`'s checks
- **THEN** the role loads

#### Scenario: An exact entry permits only its own line

- **WHEN** a role's `commands` holds `npm test` and its repository's check is `npm test -- --run`
- **THEN** the role is refused at load, naming `npm test -- --run`
- **AND** a role whose `commands` holds `npm test:*` and whose check is `npm test` loads

#### Scenario: A pattern permits a check line

- **WHEN** a role's `commands` holds `npm test:*` and its repository's check is
  `npm test -- --run`
- **THEN** the role loads

## MODIFIED Requirements

### Requirement: Roles inherit an org-level base of the same shape

A role SHALL inherit from the base named in `extends`, defaulting to the org-level base. A base
SHALL use the identical file shape, so intermediate bases are possible without a second
artifact type. The one exception is `repos`, which only the org base holds.

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
