## MODIFIED Requirements

### Requirement: An Igor that cannot act as its App does not start

`igor run` and `igor serve` SHALL verify, before discovery, that the Igor can act as its App on
every repository the role works and on the lore repository, and SHALL refuse to start otherwise,
naming the reason:

- missing or incomplete credential variables in its environment, naming each missing variable;
- both `GITHUB_APP_PRIVATE_KEY_FILE` and `GITHUB_APP_PRIVATE_KEY` set, naming both;
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

- **WHEN** `igor serve reviewer-1` starts with `GITHUB_APP_IDENTITY=reviewer` and no `GITHUB_APP_ID`
  in its environment
- **THEN** it refuses to start, naming the identity and `GITHUB_APP_ID` as missing
- **AND** it makes no request to GitHub as anyone else

#### Scenario: Two key variables refuse the start

- **WHEN** `igor serve reviewer-1` starts with both `GITHUB_APP_PRIVATE_KEY_FILE` and
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
