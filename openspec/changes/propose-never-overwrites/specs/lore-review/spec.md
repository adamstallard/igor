## ADDED Requirements

### Requirement: An entry already in the store is never overwritten by proposing

Proposing SHALL gate candidate ids against the store as it stands on the tree the proposal is
committed onto, not against the checkout it is run from, and a candidate whose id is taken there
— by an entry or by a rejection — SHALL NOT be carried in the pull request. The two reads are one
tree at one sha, so no id can be taken between the gate and the commit.

An id SHALL be minted against that same tree as well as against the checkout, so an id that is
free locally and taken on the default branch is never handed out. Where that tree cannot be read
while minting, what could not be checked SHALL be reported and the id gated against the checkout
alone: the collision then reaches proposing, which reads the tree unconditionally.

This governs the id space and nothing else. A checkout that is behind is still behind on the
configuration committed beside the store, and on where in the repository the store is read from;
neither is addressed here, and this requirement does not make proposing from a behind checkout
correct in general.

#### Scenario: A candidate whose id is already an entry upstream

- **WHEN** a candidate's id names an entry on the default branch that the proposing checkout
  does not have
- **THEN** that candidate is not proposed
- **AND** no pull request carries a modification to that entry

#### Scenario: A candidate whose id was rejected upstream

- **WHEN** the default branch records a rejection for a candidate's id and the checkout does not
  have it
- **THEN** that candidate is not proposed, as a rejected candidate never is

#### Scenario: An id minted on a behind checkout

- **WHEN** an id is created for a claim whose slug names an entry on the default branch, and the
  checkout does not have it
- **THEN** the id handed out is not that one
- **AND** the entry is written under an id a proposal from that checkout can take

#### Scenario: The branch cannot be read while minting

- **WHEN** an id is created and the default branch cannot be read
- **THEN** what could not be checked is reported
- **AND** the id is gated against the checkout alone rather than against nothing

#### Scenario: The store is too large to read in one request

- **WHEN** the listing of a store directory comes back short of what it holds
- **THEN** proposing refuses rather than gating against part of the store
