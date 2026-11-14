## MODIFIED Requirements

### Requirement: A role's `allow` names only actions from a closed vocabulary

A role's `allow` SHALL list only actions from a closed set: `comment`, `review-comment`, `draft-pr`,
`pr`, `label`, `merge`, `send`, `propose-lore`. A role that lists any other word SHALL be refused at
load, naming the valid actions. `propose-lore` lets an Igor propose, as a lore candidate for review, a correction it received while working (*An Igor may propose what it was taught*). The safe default
for an org base to ship with is `[draft-pr, comment]`: everything reversible, nothing final.

#### Scenario: An action outside the vocabulary is refused

- **WHEN** a role's `allow` lists `unassign`
- **THEN** the role is refused at load, naming the valid actions
