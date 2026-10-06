## ADDED Requirements

### Requirement: An Igor's GitHub App identity is its role's name

An Igor running a role SHALL act on GitHub as the github-app identity of the same name: the Igor
for `roles/reviewer.yaml` acts as the identity `reviewer`. No role file, base or configuration
key SHALL name an App identity, an App ID, a private key or a key path, and a role file that
sets `github_app` SHALL be refused with that reason.

The identity's credentials SHALL be read only from the Igor's environment, and only when
`GITHUB_APP_IDENTITY` names this identity: `GITHUB_APP_ID`, with one of
`GITHUB_APP_PRIVATE_KEY_FILE` or `GITHUB_APP_PRIVATE_KEY`. `GITHUB_APP_OWNER` and
`GITHUB_APP_INSTALLATION_ID` MAY also be set. On a server these variables come from the role's
environment file, `/etc/igor/<role>.env`; when a person runs an Igor themselves, from their
shell. The Igor SHALL have no other source: it SHALL NOT read the files the `github-app` skill
stores under its configuration directory, even when the environment is incomplete.

These names are the `github-app` skill's environment contract, so the skill's `check` works
against the same environment file. The Igor SHALL NOT depend on the skill being installed.

`igor role explain` SHALL report the identity a role acts as and whether its environment holds
that identity's credentials, naming any variable that is missing.

#### Scenario: The role's name is the identity

- **WHEN** `igor serve reviewer` starts
- **THEN** it acts as the github-app identity `reviewer`

#### Scenario: A role file cannot name an App

- **WHEN** a role file, or a base it extends, sets `github_app`
- **THEN** the role is refused, and the refusal says that an Igor's App is its role's name and
  its credentials are in its environment

#### Scenario: Credentials come only from the environment

- **WHEN** `igor serve reviewer` starts with no `GITHUB_APP_*` variables in its environment, and
  `~/.config/github-app/reviewer.json` and `reviewer.pem` exist
- **THEN** it does not read those files
- **AND** it refuses to start, naming the missing variables

#### Scenario: Environment credentials for another identity are not used

- **WHEN** the Igor's environment sets `GITHUB_APP_ID` with `GITHUB_APP_IDENTITY` unset or naming
  another identity
- **THEN** those variables are not this Igor's credentials
- **AND** the refusal names the identity the variables belong to and the one this Igor acts as

#### Scenario: Explain says who the role acts as

- **WHEN** `igor role explain reviewer` runs
- **THEN** it reports the identity `reviewer` and whether its environment holds that identity's
  credentials, naming any missing variable
