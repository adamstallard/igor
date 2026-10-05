## ADDED Requirements

### Requirement: An Igor's GitHub App identity is its role's name

An Igor running a role SHALL act on GitHub as the github-app identity of the same name: the Igor
for `roles/reviewer.yaml` acts as the identity `reviewer`. No role file, base or configuration
key SHALL name an App identity, an App ID, a private key or a key path, and a role file that
sets `github_app` SHALL be refused with that reason.

The identity's credentials SHALL be read from the host, in this order: the `GITHUB_APP_*`
variables in the Igor's environment, when `GITHUB_APP_IDENTITY` names this identity; then the
identity's stored files under the github-app configuration directory. These are the sources the
`github-app` skill writes and reads, so a credential stored or checked with the skill is the one
the Igor uses.

`igor role explain` SHALL report the identity a role acts as and where its credentials were
found, or that none were.

#### Scenario: The role's name is the identity

- **WHEN** `igor serve reviewer` starts
- **THEN** it acts as the github-app identity `reviewer`

#### Scenario: A role file cannot name an App

- **WHEN** a role file, or a base it extends, sets `github_app`
- **THEN** the role is refused, and the refusal says that an Igor's App is its role's name and
  its credentials are the host's

#### Scenario: Environment credentials for another identity are not used

- **WHEN** the Igor's environment sets `GITHUB_APP_ID` with `GITHUB_APP_IDENTITY` unset or naming
  another identity
- **THEN** those variables are not this Igor's credentials
- **AND** if nothing else holds credentials for this identity, the refusal names the identity
  the variables belong to and the one this Igor acts as

#### Scenario: Explain says who the role acts as

- **WHEN** `igor role explain reviewer` runs
- **THEN** it reports the identity `reviewer` and where its credentials come from, or that none
  were found
