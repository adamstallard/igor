## MODIFIED Requirements

### Requirement: A role's `allow` names only actions from a closed vocabulary

A role's `allow` SHALL list only actions from a closed set: `comment`, `review-comment`, `draft-pr`,
`pr`, `label`, `propose-lore`. A role that lists any other word SHALL be refused at load, naming the
valid actions. `propose-lore` lets an Igor, the agent running a role, turn a correction a party with
authority made on an item it is working into a candidate lore entry, which a person reviews before
it enters the store; the requirement *An Igor may propose what it was taught* sets the rule. An org
base is advised, not required, to ship with `[draft-pr, comment]`.

#### Scenario: An action outside the vocabulary is refused

- **WHEN** a role's `allow` lists `unassign`
- **THEN** the role is refused at load, naming the valid actions
