## ADDED Requirements

### Requirement: An entry already in the store is never overwritten by proposing

Proposing SHALL gate candidate ids against the store as it stands on the tree it commits onto —
the default branch, at the sha the proposal is built on — rather than against the checkout it is
run from, and a candidate whose id is taken there, by an entry or by a rejection, SHALL NOT be
carried in the pull request. The gate and the commit SHALL read that one sha, so nothing can take
an id between them.

Minting an id SHALL gate against the store as it stands on that branch, read when the id is made,
as well as against the checkout. An id free in the checkout and taken on the branch is therefore
never handed out; an id taken after it was minted is not minting's to rule out, and proposing
refuses it. Where the branch cannot be read while minting, what could not be checked SHALL be
reported and the id gated against the checkout alone — the collision then reaches proposing,
which reads the branch unconditionally.

Where the id moves because the branch holds the name the claim derives, minting SHALL say so, and
SHALL say whether that name is held by an entry or by a rejection. Nothing downstream catches the
case behind it: an id that moved is free on that branch, so a second entry making a claim already
there — or one review has already turned down — is proposed like any other. Minting SHALL stay
silent where the checkout already holds that name in the same kind, the entry or the rejection
being in front of the person already, and SHALL speak where the kinds differ: a name the checkout
holds as an entry and the branch as a rejection is the case worth stopping for.

This governs the id space and nothing else. A checkout that is behind is still behind on the
configuration committed beside the store, and on where in the repository the store is read from;
neither is addressed here, and this requirement does not make proposing from a behind checkout
correct in general.

#### Scenario: A candidate whose id is already an entry on the default branch

- **WHEN** a candidate's id names an entry on the default branch that the proposing checkout
  does not have
- **THEN** that candidate is not proposed
- **AND** no pull request carries a modification to that entry

#### Scenario: A candidate whose id the default branch records as rejected

- **WHEN** the default branch records a rejection for a candidate's id and the checkout does not
  have it
- **THEN** that candidate is not proposed, as a rejected candidate never is

#### Scenario: An id minted on a behind checkout

- **WHEN** an id is created for a claim whose slug names an entry on the default branch, and the
  checkout does not have it
- **THEN** the id handed out is not that one
- **AND** the entry is written under an id that was free on that branch when it was read
- **AND** it is reported that an entry on that branch holds the name the claim derives, since the
  draft may be a second entry for a claim already made there

#### Scenario: A minted id whose name the default branch records as rejected

- **WHEN** an id is created for a claim whose slug names a rejection on the default branch, and
  the checkout does not have it
- **THEN** the id handed out is not that one
- **AND** it is reported that the name is rejected there and that such a claim is not proposed
  again, which proposing cannot refuse under the id that was handed out

#### Scenario: A name the checkout already holds in the same kind

- **WHEN** an id is created for a claim whose slug names an entry the checkout has, whether or
  not the default branch has it as well
- **THEN** the id handed out is not that one
- **AND** nothing is reported about the default branch, that entry being in front of the person
  already

#### Scenario: A name the checkout holds as an entry and the default branch as a rejection

- **WHEN** an id is created for a claim whose slug names an entry the checkout has and a
  rejection on the default branch
- **THEN** it is reported as a rejection, which is what the checkout cannot show

#### Scenario: The branch cannot be read while minting

- **WHEN** an id is created and the default branch cannot be read
- **THEN** what could not be checked is reported
- **AND** the id is gated against the checkout alone rather than against nothing

#### Scenario: The store is too large to read in one request

- **WHEN** the listing of a store directory comes back short of what it holds
- **THEN** proposing refuses rather than gating against part of the store
