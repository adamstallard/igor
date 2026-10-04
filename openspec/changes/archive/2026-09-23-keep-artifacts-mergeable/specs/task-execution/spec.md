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

Bringing it up to date starts with the code host: the base is merged into the artifact's branch
server-side. Where that comes out clean the cycle for the item ends there; where it conflicts,
a worker resolves it.

#### Scenario: A conflict that has cleared costs no model

- **WHEN** the base is merged into an artifact reported as no longer merging, and the merge
  comes out clean after all
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
