## MODIFIED Requirements

### Requirement: An Igor knows its own bot account

At startup, before discovery, an Igor SHALL read its App's bot login, `<slug>[bot]`, and that
account's numeric user id from GitHub, and hold both for the life of the process. Every
comparison of an actor or author with the Igor itself SHALL use them: who added or removed a
label, who wrote a claim comment, who opened a pull request. Where a read reports the actor's
numeric id, the comparison SHALL use the id.

The Igor SHALL NOT read its identity from `GET /user`, which describes a user and not an App.

#### Scenario: The identity is the App's bot

- **WHEN** an Igor acting as the App `igor-acme-reviewer` starts
- **THEN** its identity is `igor-acme-reviewer[bot]` with that account's numeric id

#### Scenario: Its own label removal is recognised by id

- **WHEN** the latest `unlabeled` event for the Igor's label has an actor whose id is the
  Igor's own
- **THEN** the Igor reads the removal as its own release, not a stop

#### Scenario: A read that spells the login differently still matches

- **WHEN** one GitHub read reports the Igor's account as `igor-acme-reviewer[bot]` and another
  as `igor-acme-reviewer`
- **THEN** both are recognised as the Igor itself

### Requirement: An Igor that cannot act as its App does not start

`igor run` and `igor serve` SHALL verify, before discovery, that the Igor can act as its App on
every repository the role works, on the lore repository, which holds its configuration, and,
where the configuration key `destination` names a repository other than the lore repository, on
that destination repository, and SHALL refuse to start otherwise,
naming the reason:

- missing or incomplete credential variables in its environment, naming each missing variable;
- both `GITHUB_APP_PRIVATE_KEY_FILE` and `GITHUB_APP_PRIVATE_KEY` set, naming both;
- a private key that cannot sign;
- GitHub refusing the App's credentials;
- the App not installed on the account holding a repository, naming the repository;
- a repository the installation does not reach, naming it;
- repositories on more than one account, naming the accounts;
- a missing permission, naming each: Contents, Issues and Pull requests read and write;
- an App whose slug, the `<slug>` of its bot login `<slug>[bot]`, does not start with `igor-`,
  naming the slug.

The `igor-` prefix is how shared-skills #25's inquisitor tells an Igor's App from a person's
relay App: it never counts an App with that prefix as posting a person's answers.

The Igor's access SHALL be read from its installation's permissions, never from a collaborator
record, which reports an App's bot account as having no write access.

A missing Workflows write permission SHALL NOT stop the Igor. It is reported at startup, and a
publish that touches `.github/workflows/` without it SHALL fail naming the permission.

Where GitHub refuses the App's credentials while the Igor runs, the Igor SHALL take no new item
and SHALL say which identity was refused. It SHALL resume once a token mints again, without
waiting for an item to probe it.

#### Scenario: Missing credentials refuse the start

- **WHEN** `igor serve reviewer` starts with `GITHUB_APP_IDENTITY=reviewer` and no `GITHUB_APP_ID`
  in its environment
- **THEN** it refuses to start, naming the identity and `GITHUB_APP_ID` as missing
- **AND** it makes no request to GitHub as anyone else

#### Scenario: Two key variables refuse the start

- **WHEN** `igor serve reviewer` starts with both `GITHUB_APP_PRIVATE_KEY_FILE` and
  `GITHUB_APP_PRIVATE_KEY` set
- **THEN** it refuses to start, naming both variables, rather than choosing one
- **AND** it makes no request to GitHub

#### Scenario: An App not installed on a repository refuses the start

- **WHEN** the role works a repository on an account where the App is not installed
- **THEN** the Igor refuses to start, naming the repository and the App

#### Scenario: A missing permission refuses the start

- **WHEN** the App's installation lacks Issues write
- **THEN** the Igor refuses to start, naming Issues write as missing

#### Scenario: An App's collaborator record is not read as its access

- **WHEN** GitHub reports the Igor's bot account with `permissions.push` false on a repository
  its installation can write
- **THEN** the Igor treats the repository as writable

#### Scenario: A credential refused mid-run stops new work and recovers

- **WHEN** GitHub stops accepting the App's credentials while the Igor serves
- **THEN** the Igor claims nothing new and says which identity was refused
- **AND** it takes work again once a token mints, without spending an item to find out

#### Scenario: An App whose slug lacks the igor- prefix refuses the start

- **WHEN** an Igor's App has the slug `acme-reviewer`
- **THEN** the Igor refuses to start, naming `acme-reviewer` and the `igor-` prefix it lacks
- **AND** it claims nothing and posts nothing

#### Scenario: An App whose slug starts with igor- passes the check

- **WHEN** an Igor's App has the slug `igor-reviewer`, and every other check passes
- **THEN** the Igor starts
