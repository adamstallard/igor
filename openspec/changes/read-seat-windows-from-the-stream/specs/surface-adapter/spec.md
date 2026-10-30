## MODIFIED Requirements

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

Commands that take no role (`propose`, `reconcile`, `init`, `promote`, `budget`) are a person's,
and keep the person's own `gh` login.

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
- **THEN** it acts as that person's own `gh` login
