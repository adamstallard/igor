## MODIFIED Requirements

### Requirement: An Igor that cannot act as its App does not start

`igor run` and `igor serve` SHALL verify, before discovery, that the Igor can act as its App on each
repository the role works and the lore repository, with the access *An Igor's access is its
installation's permissions* requires, and refuse to start otherwise, naming the reason and each
variable, repository, account or permission at fault. A credential refused once the Igor runs is
handled as *A credential GitHub refuses mid-run stops new work until a token mints* says.

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

#### Scenario: A key that cannot sign refuses the start

- **WHEN** the Igor's private key cannot sign a token
- **THEN** it refuses to start, saying the key cannot sign

#### Scenario: Credentials GitHub refuses at startup refuse the start

- **WHEN** GitHub refuses the App's credentials as the Igor starts
- **THEN** it refuses to start, saying GitHub refused the App's credentials

#### Scenario: A repository the installation does not reach refuses the start

- **WHEN** the App is installed on the account holding a repository the role works, but the
  installation does not reach that repository
- **THEN** the Igor refuses to start, naming the repository

#### Scenario: Repositories on more than one account refuse the start

- **WHEN** the role's repositories and the lore repository are on more than one account
- **THEN** the Igor refuses to start, naming the accounts

#### Scenario: A missing Workflows permission does not stop the Igor

- **WHEN** the App's installation lacks Workflows write
- **THEN** the Igor starts and reports the missing permission at startup
- **AND** a publish that touches `.github/workflows/` fails, naming the permission

#### Scenario: A credential refused mid-run stops new work and recovers

- **WHEN** GitHub stops accepting the App's credentials while the Igor serves
- **THEN** the Igor claims nothing new and says which identity was refused
- **AND** it takes work again once a token mints, without spending an item to find out

## ADDED Requirements

### Requirement: A credential GitHub refuses mid-run stops new work until a token mints

An Igor whose App credentials GitHub refuses mid-run SHALL take no new item, SHALL name the
refused identity, and SHALL resume taking items once a token mints again, with no item sent to
probe it.

#### Scenario: A refused credential holds new items until a token mints

- **WHEN** GitHub refuses the App's credentials mid-run, and a later attempt mints a token while
  no item is waiting
- **THEN** the Igor takes no new item while the credentials are refused, and says which identity
  was refused
- **AND** it takes new items again once the token mints, without waiting for an item to probe
  the credentials

### Requirement: An Igor's access is its installation's permissions

The Igor SHALL take its access from its App installation's permissions, never from a collaborator
record, and SHALL need Contents, Issues and Pull requests read and write. A missing Workflows write
permission SHALL NOT stop it: the Igor SHALL report it at startup, and a publish that touches
`.github/workflows/` without it SHALL fail, naming the permission.

#### Scenario: A publish touching a workflow fails naming Workflows write

- **WHEN** the App's installation lacks Workflows write, and a publish changes
  `.github/workflows/ci.yml`
- **THEN** the publish fails, naming Workflows write
- **AND** the Igor reported the missing permission when it started
