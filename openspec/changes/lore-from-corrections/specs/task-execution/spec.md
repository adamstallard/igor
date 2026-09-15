## ADDED Requirements

### Requirement: An Igor may propose what it was taught

Where a role permits it, an Igor corrected while working SHALL be able to propose a lore
candidate, and that candidate SHALL take the ordinary review path rather than entering the store.

The richest source of lore an organization has is somebody correcting an agent, and it is the
only source the agent itself witnesses. An Igor that learns something and has no way to say so
loses it, and the same correction is made again next week.

Proposing is safe by construction rather than by trust. A candidate is `provisional` until a
person merges it, so an Igor can only ask; nothing it proposes reaches a worker unreviewed. A
candidate rejected once is never proposed again, so a bad suggestion costs one review rather
than a recurring one.

#### Scenario: A correction becomes a candidate

- **WHEN** a party with authority corrects an Igor on an item it is working
- **AND** the role permits proposing
- **THEN** a candidate entry may be proposed for review

#### Scenario: Nothing reaches the store unreviewed

- **WHEN** an Igor proposes a candidate
- **THEN** it is `provisional` and no worker receives it until a person merges it

#### Scenario: A role that does not permit it proposes nothing

- **WHEN** a role's allow list omits the action
- **THEN** no candidate is produced, and the refusal is recorded like any other

#### Scenario: A rejected candidate is not proposed again

- **WHEN** a candidate an Igor proposed was rejected
- **THEN** it is not proposed again

### Requirement: A proposed candidate is attributed to the person who taught it

A candidate an Igor proposes SHALL carry the correcting party as its provenance author, not the
Igor.

They asserted the lesson; the Igor only noticed. Attribution decides who reviews it, because
candidates are grouped by dominant author — so naming the person routes it back to the one who
can confirm they meant it, and naming the Igor would route it to an account that cannot.

It also keeps support honest: an entry's weight comes from how many independent people assert
it, and an Igor is not an independent assertion.

#### Scenario: The corrector is the author

- **WHEN** an Igor proposes a candidate from a correction
- **THEN** its provenance names the person who corrected it

#### Scenario: Review is routed to them

- **WHEN** that candidate is proposed
- **THEN** it is grouped for review by that person, as any hand-authored candidate would be

### Requirement: Proposing is rare by default

An Igor SHALL NOT propose a candidate for every correction it receives.

Human attention is what the review gate exists to spend carefully, and an Igor that proposes on
every correction converts a useful signal into a queue nobody reads — which costs more than
the lore is worth and ends with the gate being ignored.

What makes a correction worth proposing is that it recurs, or that it contradicts something the
store already says. A single remark is a hypothesis.

#### Scenario: A one-off correction is not proposed

- **WHEN** an Igor is corrected once on something nothing else corroborates
- **THEN** no candidate is proposed

#### Scenario: A correction contradicting the store is proposed

- **WHEN** a correction contradicts an active entry
- **THEN** a candidate is proposed, because the store is wrong either way

#### Scenario: Corroboration raises support rather than duplicating

- **WHEN** a correction restates a rule the store already holds
- **THEN** the existing entry gains provenance rather than a second entry being proposed
