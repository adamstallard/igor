## ADDED Requirements

### Requirement: A published artifact is kept mergeable

Where an artifact an Igor produced can no longer merge into its base, the Igor SHALL bring it
up to date, and SHALL do so on the artifact that exists rather than by replacing it.

A base moves while an artifact waits. Nothing else notices: the item reports work in flight,
the working tree was released when the run ended, and the worker never held a branch to begin
with — it edits files, and the loop publishes what changed. So an artifact left behind goes
stale in a state only a person can see.

Resolution happens on the existing artifact because replacing it would discard whatever review
has accumulated against it, which is a cost paid by the reviewer rather than the Igor.

#### Scenario: A base that merges cleanly costs no model

- **WHEN** an artifact's base has moved and merges without conflict
- **THEN** the artifact is brought up to date without invoking a worker

#### Scenario: A conflict is resolved, not regenerated

- **WHEN** bringing the base in conflicts
- **THEN** a worker resolves it on the existing artifact
- **AND** the artifact's history and any review on it survive

#### Scenario: An unresolvable conflict is handed off

- **WHEN** a conflict cannot be resolved within the role's action space or budget
- **THEN** the item is handed off, naming the artifact and what stands in the way

#### Scenario: Only the Igor's own artifact

- **WHEN** an artifact that cannot merge was produced by another party
- **THEN** the Igor does not act on it
