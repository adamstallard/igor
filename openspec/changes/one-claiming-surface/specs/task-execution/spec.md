## ADDED Requirements

### Requirement: A person approves every Igor pull request

A pull request an Igor opened SHALL be reviewed and approved by a person before it merges. An
Igor SHALL NOT merge a pull request it opened, and an approval from any Igor SHALL NOT count as
that person's approval, whatever the code host's branch protection accepts. A role's `merge`
permission covers merging a pull request a person has approved; it never covers the approval.

#### Scenario: Igor does not merge its own pull request

- **WHEN** a role allows `merge` and the Igor's own pull request is approved and mergeable
- **THEN** the Igor does not merge it

#### Scenario: Another Igor's approval is not enough

- **WHEN** an Igor's pull request carries an approving review from another Igor and none from a person
- **THEN** no Igor merges it

#### Scenario: A person's approval permits the merge

- **WHEN** a person approves another author's pull request and an Igor's role allows `merge`
- **THEN** that Igor may merge it
