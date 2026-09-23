## ADDED Requirements

### Requirement: A resolution that would undo a base change is not published

Where resolving a conflict would publish a commit that names the base as a parent, the Igor
SHALL compare what the base changed since the merge base against what the resolution publishes,
and SHALL NOT publish it where any path would be restored to the state it held before the base
changed it. The item is handed off instead, naming those paths.

The commit's tree is the merge result, so a path the resolution leaves at the artifact's own
version is not a gap in the resolution — it is a revert of the base's change to that path, which
lands the moment the artifact merges. A reverted deletion appears in review as the file still
being there and a reverted rewrite as the file being unchanged, so review cannot be relied on to
catch either.

The comparison reads outcomes, not intentions. A resolution that takes the base's side, combines
both sides, or honours a deletion the base made restores nothing and is published unremarked.
What is refused is the exact undo: the base changed a path and the published content is what
stood there before it did.

Nothing the worker says lifts the refusal. What was changed is read from the tree rather than
from the worker's account of it, and a deliberate revert is rare enough to be worth a person
deciding on.

#### Scenario: A rewrite the base made is restored

- **WHEN** a resolution would publish, for a path the base rewrote, the content that stood there
  before the base rewrote it
- **THEN** nothing is published
- **AND** the item is handed off naming that path

#### Scenario: A deletion the base made is undone

- **WHEN** a resolution would publish a path the base deleted since the merge base
- **THEN** nothing is published
- **AND** the item is handed off naming that path

#### Scenario: A resolution that keeps the base's work is published

- **WHEN** every path the base changed survives the resolution, whether taken whole or combined
  with the artifact's own change
- **THEN** the resolution is published and no handoff is posted

#### Scenario: Agreeing with the base costs no handoff

- **WHEN** the base deleted a path and the resolution deletes it too
- **THEN** the resolution is published, because nothing was restored

#### Scenario: The worker cannot authorize its own revert

- **WHEN** a worker states that a revert of a base change was intended
- **THEN** the resolution is still not published, and the handoff still names the paths

#### Scenario: The check runs before the commit, not after it

- **WHEN** a resolution is refused
- **THEN** no commit reaches the artifact's branch
- **AND** the refusal does not depend on anything the code host is asked afterwards

#### Scenario: A first artifact is unaffected

- **WHEN** an artifact is produced rather than resolved
- **THEN** no such comparison is made, because its commit names no base as a parent
