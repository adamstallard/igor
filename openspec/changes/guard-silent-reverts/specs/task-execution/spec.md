## ADDED Requirements

### Requirement: A base change is undone only where the resolution says so

Where resolving a conflict would publish a commit that names the base as a parent, the Igor
SHALL compare what the base changed since the merge base against what the resolution publishes,
and SHALL NOT publish it where any path would be restored to the state it held before the base
changed it — unless the resolution carries a declaration naming that path. Where an undeclared
path would be restored, nothing is published and the item is handed off naming those paths.

The commit's tree is the merge result, so a path the resolution leaves at the artifact's own
version is not a gap in the resolution — it is a revert of the base's change to that path, which
lands the moment the artifact merges. A reverted deletion appears in review as the file still
being there and a reverted rewrite as the file being unchanged, so review cannot be relied on to
catch either.

The comparison reads outcomes, not intentions. A resolution that takes the base's side, combines
both sides, or honours a deletion the base made restores nothing and needs no declaration. What
is refused undeclared is the exact undo: the base changed a path and the published content is
what stood there before it did.

**A declaration names one path and the base state it discards** — the base's content for that
path, or its absence where the base deleted it. It SHALL NOT take a blanket form: no wildcard,
no flag covering a whole resolution, nothing a role or a configuration file can set once. A
declaration whose named state is not what the base actually holds authorizes nothing, and a
declaration naming a path that would not be reverted changes nothing.

**A declared revert is still reported, wherever the refusal would have been.** Publishing it
does not make it quiet: the paths undone and the base state each one discards are named on the
published resolution and recorded with the run. The guard exists because an undone base change
is invisible to review, and a declaration converts that into a statement rather than an
exemption from it.

The declaration is carried out of the working tree and never becomes part of the artifact.

#### Scenario: A rewrite the base made is restored without a declaration

- **WHEN** a resolution would publish, for a path the base rewrote, the content that stood there
  before the base rewrote it, and no declaration names that path
- **THEN** nothing is published
- **AND** the item is handed off naming that path

#### Scenario: A deletion the base made is undone without a declaration

- **WHEN** a resolution would publish a path the base deleted since the merge base, and no
  declaration names that path
- **THEN** nothing is published
- **AND** the item is handed off naming that path

#### Scenario: A declared revert is published and said out loud

- **WHEN** a resolution restores a path the base changed and carries a declaration naming that
  path and the base state it discards
- **THEN** the resolution is published
- **AND** the path and what it undoes are named on the resolution and recorded with the run

#### Scenario: A declaration covers the path it names and nothing else

- **WHEN** a resolution restores two paths the base changed and declares one of them
- **THEN** nothing is published
- **AND** the handoff names the undeclared path

#### Scenario: A declaration that does not match what the base holds authorizes nothing

- **WHEN** a declaration names a base state for a path that is not the state the base holds
- **THEN** the revert is treated as undeclared and the item is handed off

#### Scenario: A blanket declaration is not a declaration

- **WHEN** a resolution carries a declaration that names no specific path, or a configuration
  attempts to permit reverts generally
- **THEN** it authorizes nothing, and every revert is handed off as if undeclared

#### Scenario: A resolution that keeps the base's work needs no declaration

- **WHEN** every path the base changed survives the resolution, whether taken whole or combined
  with the artifact's own change
- **THEN** the resolution is published and no handoff is posted

#### Scenario: Agreeing with the base is not a revert

- **WHEN** the base deleted a path and the resolution deletes it too
- **THEN** the resolution is published, because nothing was restored

#### Scenario: The declaration does not reach the artifact

- **WHEN** a resolution is published
- **THEN** whatever carried its declarations is not part of the published commit

#### Scenario: The check runs before the commit, not after it

- **WHEN** a resolution is refused
- **THEN** no commit reaches the artifact's branch
- **AND** the refusal does not depend on anything the code host is asked afterwards

#### Scenario: A first artifact is unaffected

- **WHEN** an artifact is produced rather than resolved
- **THEN** no such comparison is made, because its commit names no base as a parent
