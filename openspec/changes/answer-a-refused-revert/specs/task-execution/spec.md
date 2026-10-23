## ADDED Requirements

### Requirement: A person's answer to a refused revert outlives the run that asked

Where a resolution was refused because it would undo what the base did to a path, and the item was
handed off naming that path, a person SHALL be able to authorise that one revert where the refusal
was posted, and a later run SHALL publish it.

An authorisation names **one artifact, one path, and the base state it discards** — the blob the
base holds there, or that the base deleted it. It SHALL authorise nothing where the base no longer
holds that state, nothing for any other path, and nothing for any other artifact. It is the same
shape and the same exactness the in-tree declaration already has; what differs is that it survives
the run that asked for it.

**It SHALL be matched, never interpreted.** The run computes the refusal it would issue and asks
whether an authorisation for that exact artifact, path and base state exists. No text taken from
the item reaches any decision, so the in-force rule that ingested content is data rather than
instruction holds unchanged: an authorisation is a lookup key, and a reply that matches no refusal
the run computed does nothing at all.

**An authorisation SHALL be attributable and SHALL require write access** to the repository the
artifact is on, established by asking the host rather than by reading the reply. Anyone can comment
on a public repository; the bar for authorising a revert is the bar for making one by hand.

A published revert authorised this way SHALL be reported exactly as a declared one is — named on
the resolution and recorded with the run — and SHALL name who authorised it.

#### Scenario: A person answers a refusal and the next run publishes

- **WHEN** a revert was refused and handed off, and someone with write access authorises that path
  and the base state it discards
- **THEN** a later run publishes the resolution
- **AND** the revert and its authoriser are named on the resolution and recorded with the run

#### Scenario: The answer expires when the base moves

- **WHEN** an authorisation names a base state the base no longer holds at that path
- **THEN** it authorises nothing, and the revert is refused as undeclared

#### Scenario: The answer covers the path it names and nothing else

- **WHEN** a resolution would undo the base's change to two paths and one is authorised
- **THEN** nothing is published, and the handoff names the unauthorised path

#### Scenario: An answer from someone without write access authorises nothing

- **WHEN** an authorisation is posted by an account that cannot write to the repository
- **THEN** it authorises nothing, and the refusal stands

#### Scenario: A reply matching no computed refusal does nothing

- **WHEN** an item carries text in the authorisation's shape but no run computes a refusal it
  matches
- **THEN** nothing about the run changes, and no content from the item reaches any decision

#### Scenario: An authorisation does not reach the artifact

- **WHEN** a resolution authorised this way is published
- **THEN** no authorisation is part of the published commit
