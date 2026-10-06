## ADDED Requirements

### Requirement: On GitHub, every call an Igor makes acts as its App

Every request to GitHub made by `igor run` or `igor serve`, through `gh` or `git`, SHALL
authenticate as the installation of the Igor's App that covers the repository. That covers
discovery, claiming, comments, label reads and writes, issue events, the Git Data API commits
that publish work, pull requests, merges, the state branch, and cloning and fetching a working
tree. No such request SHALL use an ambient `GH_TOKEN` or `GITHUB_TOKEN`, a host's `gh` login, or
a credential helper from a git config file.

A token SHALL reach only the process making the call: it is set in that child's environment and
nowhere else. It SHALL NOT be written to the Igor's own environment, to disk, or to any git
config, and a working tree SHALL hold no credential after it is cloned.

Commands that take no role (`propose`, `reconcile`, `init`, `promote`, `observe`, `budget`) are
a person's, and keep the person's own `gh` login.

#### Scenario: A gh call acts as the App

- **WHEN** an Igor claims, comments, labels or opens a pull request
- **THEN** GitHub records the action as the App's bot account

#### Scenario: An ambient token is not used

- **WHEN** `GH_TOKEN` or `GITHUB_TOKEN` is set in the environment `igor serve` starts with
- **THEN** no request the Igor makes authenticates with it

#### Scenario: A clone acts as the App and keeps nothing

- **WHEN** a working tree is cloned or fetched for an item
- **THEN** git authenticates with the App's token for that one command
- **AND** neither the tree's git config nor any global git config holds a credential or a
  credential helper afterwards

#### Scenario: A person's command is unchanged

- **WHEN** a person runs `igor propose`
- **THEN** it acts as that person's `gh` login, as before

### Requirement: An App token is minted on demand and used only in the first half of its life

The Igor SHALL mint installation tokens itself from the App ID and private key, and hold each in
memory only. It SHALL mint a new token once less than half of the current one's life remains,
and SHALL NOT start a call with a token past that point. Each process mints its own.

#### Scenario: A long-running Igor never uses an expired token

- **WHEN** an Igor has served for longer than a token's life
- **THEN** every call it makes uses a token with at least half of its life left

#### Scenario: Calls reuse a fresh token

- **WHEN** many calls run within the first half of one token's life
- **THEN** they share that token rather than each minting another

### Requirement: An Igor knows its own bot account

At startup, before discovery, an Igor SHALL read its App's bot login, `<slug>[bot]`, and that
account's numeric user id from GitHub, and hold both for the life of the process. Every
comparison of an actor or author with the Igor itself SHALL use them: who added or removed a
label, who wrote a claim comment, who opened a pull request. Where a read reports the actor's
numeric id, the comparison SHALL use the id.

The Igor SHALL NOT read its identity from `GET /user`, which describes a user and not an App.

#### Scenario: The identity is the App's bot

- **WHEN** an Igor acting as the App `acme-reviewer` starts
- **THEN** its identity is `acme-reviewer[bot]` with that account's numeric id

#### Scenario: Its own label removal is recognised by id

- **WHEN** the latest `unlabeled` event for the Igor's label has an actor whose id is the
  Igor's own
- **THEN** the Igor reads the removal as its own release, not a stop

#### Scenario: A read that spells the login differently still matches

- **WHEN** one GitHub read reports the Igor's account as `acme-reviewer[bot]` and another as
  `acme-reviewer`
- **THEN** both are recognised as the Igor itself

### Requirement: An Igor that cannot act as its App does not start

`igor run` and `igor serve` SHALL verify, before discovery, that the Igor can act as its App on
every repository the role works and on the lore repository, and SHALL refuse to start otherwise,
naming the reason:

- missing or incomplete credential variables in its environment, naming each missing variable;
- a private key that cannot sign;
- GitHub refusing the App's credentials;
- the App not installed on the account holding a repository, naming the repository;
- a repository the installation does not reach, naming it;
- repositories on more than one account, naming the accounts;
- a missing permission, naming each: Contents, Issues and Pull requests read and write.

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
