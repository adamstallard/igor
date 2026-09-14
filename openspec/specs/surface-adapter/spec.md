# surface-adapter Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: A surface plays a tracker role, a code-host role, or both

The adapter interface SHALL separate two roles a surface may play: a **tracker**, where work is
discovered, claimed, verified and reported on; and a **code host**, where an artifact is
produced and linked back to the item. A single surface MAY implement both.

#### Scenario: One surface implementing both roles

- **WHEN** GitHub is configured as both tracker and code host
- **THEN** discovery, claiming and artifact production all use that adapter
- **AND** nothing above the adapter layer depends on both roles being the same surface

#### Scenario: Roles played by different surfaces

- **WHEN** a tracker holds the item and a separate code host holds the artifact
- **THEN** the item is claimed on the tracker and the artifact produced on the code host
- **AND** the artifact is linked back using the tracker's own convention

### Requirement: Linkage between artifact and item is adapter-supplied

Each adapter SHALL supply the convention linking an artifact to its item, because that
convention varies by tracker. The loop MUST NOT hardcode any linkage form.

#### Scenario: Linkage convention differs by tracker

- **WHEN** one tracker links by a reference in the artifact body and another links by branch name
- **THEN** each adapter applies its own convention
- **AND** the loop's behaviour is identical in both cases

### Requirement: Adapters normalize candidates to a specified shape

A tracker adapter SHALL return candidates carrying: `id`, `url`, `title`, `body`, `author`,
`state`, `labels`, linked `paths`, `age`, and whether work is already **in flight**. This shape
is normative rather than per-adapter, because lane predicates are only as portable as it is
consistent.

#### Scenario: Normalized candidate returned

- **WHEN** an adapter returns a candidate from a search
- **THEN** every field of the normalized shape is present
- **AND** a predicate written against those fields evaluates without adapter-specific handling

#### Scenario: Predicates portable across adapters

- **WHEN** the same lane is evaluated against candidates from two different trackers
- **THEN** the predicate logic is identical
- **AND** no tracker-specific branch is required to evaluate it

### Requirement: Adapters declare how a claim is expressed

A tracker adapter SHALL declare whether the surface offers a native **holder field** — a field
naming who has the item — or only message-based convention. This declaration determines how a
claim is *expressed*, not how it is resolved.

Which field that is belongs to the adapter, not to the loop. GitHub's is the assignee; Linear's
is `delegate`, because an app identity there may hold the latter and not the former. Naming
"assignee" above the adapter would make one surface's vocabulary into everyone's.

#### Scenario: Native holder field declared

- **WHEN** an adapter declares a native holder field
- **THEN** a claim sets that field
- **AND** the field's value is the signal humans read

#### Scenario: The loop does not name the field

- **WHEN** two trackers express a claim through differently-named fields
- **THEN** the loop's behaviour is identical
- **AND** nothing above the adapter refers to either field by name

#### Scenario: Message-only surface declared

- **WHEN** an adapter declares message-only convention
- **THEN** a claim is expressed as a post
- **AND** claim resolution still relies on ordering rather than on any surface-specific primitive

### Requirement: Claim verification also reports a stop

A tracker adapter's claim verification SHALL return one of **held**, **lost**, or **stopped**,
so that a stop directed at an Igor has a defined path in. Stop was pulled forward from the
conversational layer, and an obligation to honour it is unimplementable without an input.

Detection reuses the re-read the Igor already performs, rather than adding an operation. It
follows that **"immediately" means on detection and without further condition** — not
instantaneously. Long-running execution SHALL therefore re-check at checkpoints rather than
only once per cycle, since a cycle interval is far longer than someone watching an Igor go
wrong will tolerate.

#### Scenario: Verification reports a held claim

- **WHEN** the Igor still holds the claim and no stop is present
- **THEN** verification returns held

#### Scenario: Verification reports a stop

- **WHEN** a stop has been issued against a claimed item
- **THEN** verification returns stopped
- **AND** it does so without any permission check

#### Scenario: Stop is detected during long execution

- **WHEN** execution runs longer than one checkpoint interval
- **THEN** the stop is detected at a checkpoint rather than at the end of the task

### Requirement: Adapters report work already in flight

Work-in-flight is a field of the normalized candidate, and this operation is what populates
it. It is not a second, separately-queried fact — one source, so triage and any other reader
cannot disagree about it.

A tracker adapter SHALL answer whether a given item already has work in flight, using whatever
signal that surface provides.

#### Scenario: In-flight work detected

- **WHEN** an item already has a linked artifact open against it
- **THEN** the adapter reports work in flight for that item

#### Scenario: Detection differs while the answer does not

- **WHEN** one adapter detects in-flight work by linked pull request and another by linked branch
- **THEN** both report the same normalized fact
- **AND** the loop's response is identical

### Requirement: A GitHub adapter ships with this change

A GitHub adapter SHALL implement both the tracker and code-host roles: searching issues,
claiming by assignment, verifying a claim, reporting status, producing a draft pull request,
and linking it to the item.

#### Scenario: GitHub adapter satisfies the interface

- **WHEN** the GitHub adapter is used as the only configured surface
- **THEN** discovery, claiming, verification, reporting, artifact production and linkage all
  succeed through it

