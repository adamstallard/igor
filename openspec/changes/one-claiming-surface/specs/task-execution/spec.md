## ADDED Requirements

### Requirement: A person approves every Igor pull request

A pull request an Igor opened SHALL be reviewed and approved by a person before it merges. An
Igor SHALL NOT merge a pull request it opened, and an approval from any Igor SHALL NOT count as
that person's approval, whatever the code host's branch protection accepts.

#### Scenario: Igor does not merge its own pull request

- **WHEN** an Igor's own pull request is approved and mergeable
- **THEN** the Igor does not merge it

#### Scenario: Another Igor's approval is not enough

- **WHEN** an Igor's pull request carries an approving review from another Igor and none from a person
- **THEN** no Igor merges it
