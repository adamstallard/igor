## MODIFIED Requirements

### Requirement: On GitHub, every call an Igor makes acts as its App

Every GitHub request by `igor run` or `igor serve`, through `gh` or `git`, SHALL authenticate as
the Igor's App installation covering the repository; none SHALL use an ambient `GH_TOKEN` or
`GITHUB_TOKEN`, a host's `gh` login, or a git config's credential helper. Its token SHALL reach
only the calling child's environment, never the Igor's, disk or git config; a cloned tree SHALL
hold no credential. Commands taking no role, such as `budget`, `doctor` and `seat`, keep the
person's `gh` login.

#### Scenario: A gh call acts as the App

- **WHEN** an Igor discovers or claims work, comments, reads or writes labels, reads issue events,
  commits through the Git Data API, opens or merges a pull request, or reads or writes the state
  branch
- **THEN** the request authenticates as the App
- **AND** GitHub records a claim, comment, label or pull request as the App's bot account

#### Scenario: An ambient token is not used

- **WHEN** `GH_TOKEN` or `GITHUB_TOKEN` is set in the environment `igor serve` starts with
- **THEN** no request the Igor makes authenticates with it

#### Scenario: A clone acts as the App and keeps nothing

- **WHEN** a working tree is cloned or fetched for an item
- **THEN** git authenticates with the App's token for that one command
- **AND** neither the tree's git config nor any global git config holds a credential or a
  credential helper afterwards

#### Scenario: Lending a seat acts as the holder

- **WHEN** a holder runs `igor seat add bob`
- **THEN** it acts as the holder's own `gh` login

#### Scenario: A person's command is unchanged

- **WHEN** a person runs `igor propose`, `reconcile`, `init`, `promote`, `budget` or `doctor`,
  which take no role
- **THEN** it acts as that person's own `gh` login
