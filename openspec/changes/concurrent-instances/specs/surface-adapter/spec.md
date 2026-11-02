## MODIFIED Requirements

### Requirement: An Igor that cannot act as its App does not start

`igor run` and `igor serve` SHALL verify, before discovery, that the Igor can act as its App on
every repository the role works and on the lore repository, judging its access by its installation's
permissions, never a collaborator record, and SHALL otherwise refuse to start, naming what is wrong.
A missing Workflows write SHALL NOT stop it. Where GitHub refuses the App's credentials while it
runs, the Igor SHALL take no new item, say which identity was refused, and resume once a token
mints.

#### Scenario: Missing credentials refuse the start

- **WHEN** `igor serve reviewer-1` starts with `GITHUB_APP_IDENTITY=reviewer` and no `GITHUB_APP_ID`
  in its environment
- **THEN** it refuses to start, naming the identity and `GITHUB_APP_ID` as missing, as it names
  each credential variable missing or incomplete
- **AND** it makes no request to GitHub as anyone else

#### Scenario: Two key variables refuse the start

- **WHEN** `igor serve reviewer-1` starts with both `GITHUB_APP_PRIVATE_KEY_FILE` and
  `GITHUB_APP_PRIVATE_KEY` set
- **THEN** it refuses to start, naming both variables, rather than choosing one
- **AND** it makes no request to GitHub

#### Scenario: An App not installed on a repository refuses the start

- **WHEN** the role works a repository on an account where the App is not installed, or one the
  installation does not reach, or repositories on more than one account
- **THEN** the Igor refuses to start, naming for each case what is wrong: for a repository on an
  account without the App, that repository and the App; for a repository the installation does
  not reach, that repository; and for repositories on more than one account, those accounts

#### Scenario: A missing permission refuses the start

- **WHEN** the App's installation lacks any of Contents, Issues and Pull requests read and write,
  such as Issues write, or the private key cannot sign, or GitHub refuses the App's credentials
- **THEN** the Igor refuses to start, naming each missing permission, or that the key cannot sign,
  or that GitHub refused the credentials
- **AND** wherever the installation lacks Workflows write, that alone does not refuse the start:
  it is reported at startup, and a publish that touches `.github/workflows/` without it fails,
  naming the permission

#### Scenario: An App's collaborator record is not read as its access

- **WHEN** GitHub reports the Igor's bot account with `permissions.push` false on a repository
  its installation can write
- **THEN** the Igor treats the repository as writable

#### Scenario: A credential refused mid-run stops new work and recovers

- **WHEN** GitHub stops accepting the App's credentials while the Igor serves
- **THEN** the Igor claims nothing new and says which identity was refused
- **AND** it takes work again once a token mints, without spending an item to find out
