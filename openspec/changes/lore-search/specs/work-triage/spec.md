## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark that discovery keeps, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome: a reply from anyone other than the Igor,
or an edit to the item itself, except as the next paragraph says. Outside that case both are required, because a handoff *invites* a reply — an item
suppressed until its title or labels change would stay silent precisely where a person supplied
the missing context in a comment.

Where the handoff is a flagged run's that stopped on a question it could not settle
(`graceful-handoff`'s *A handoff states what was done, what remains, and who could continue*),
the item is *held*, and SHALL stay held whatever else its handoff carries: a cure key
(`condition-backoff`'s key for a handoff caused by a fact about the Igor, which a question not
kept is), a question not kept, or anything else that would exempt another handoff from suppression, does
not release it. A reply SHALL NOT count as an answer. The record this requirement keeps of a held item,
its *hold record*, SHALL NOT expire, and where that record is missing or unreadable the item
SHALL stay held rather than be worked again. The Igor SHALL know a held item from its hold
record, or, where that is lost, from its file under `flagged-questions` on the host or from
the item's latest ledger row, where that row's `reason` starts `needs a person`.

A held item SHALL be released in either of two ways. The Igor's operator SHALL be able to
release it on the host with `igor release <tracker>/<repo>/<item>`, such as
`igor release github/acme/api/12`, whatever an edit's attribution shows. Releasing SHALL first
delete the item's session logs and then its question file under `flagged-questions`, by
`graceful-handoff`'s rule against following a link, so that no fallback above holds it again;
then it SHALL mark the hold record released and append a ledger row for the item whose
`reason` is `released`. Where any delete is refused, `igor release` SHALL say that it failed
and that the path is in the Igor's own log on the host, SHALL leave any file it did not yet
delete, the question file included, and SHALL mark nothing released and append no row, so the
item stays held; the operator can run it again;
every Igor process of the role, each a *rank* under #179, reads the release from the state
branch, so a rank on another host does not hold the item again from its own file or ledger
rows. An
edit to the item, a relabel or a change of holder included, by someone with write access to
the item's repository SHALL also release it, where the edit can be attributed. An edit by
anyone else, or one whose author the Igor cannot read, SHALL leave the item held. How write
access is read and who made an edit are #141's rules; until #141 lands, no edit can be
attributed, and `igor release` is the way to release a held item.

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply lifts the suppression

- **WHEN** anyone other than the Igor comments on a handed-back item
- **AND** the handoff was not a flagged run's that stopped on a question
- **THEN** it is worked again

#### Scenario: A reply does not rerun a flagged item

- **WHEN** a flagged run stopped on a question it could not settle and handed the item back
- **AND** someone other than the Igor then comments on the item, and the item is unchanged
- **THEN** it is not worked again

#### Scenario: An edit by someone with write access releases a flagged item

- **WHEN** a flagged run stopped on a question it could not settle and handed the item back
- **AND** someone with write access to the item's repository then relabels or edits the item
- **THEN** it is worked again

#### Scenario: The operator releases a held item on the host

- **WHEN** a flagged run stopped on a question and handed the item back
- **AND** the operator runs `igor release` for that item on the Igor's host
- **THEN** the item is worked again, whether or not any edit can be attributed

#### Scenario: A refused delete keeps the item held

- **WHEN** the operator runs `igor release` for a held item
- **AND** a worker running as the Igor's user has replaced one of the item's session-log
  copies with a symbolic link
- **THEN** `igor release` deletes nothing through the link, keeps the question file, and says
  that it failed and that the path is in the Igor's own log
- **AND** the hold record stays held, no `released` row is appended, and the item is not
  worked again

#### Scenario: A released item is not held again by its old ledger row

- **WHEN** the operator released a held item with `igor release`
- **AND** the item's hold record is later missing
- **THEN** the item is not held again, since its latest ledger row is `released` and its host
  file is gone
- **AND** the session logs kept beside that file are gone too

#### Scenario: A cure key does not release a held item

- **WHEN** a flagged run stopped on a question, and its handoff also carries a cure key, as when
  the question could not be kept
- **THEN** the item stays held
- **AND** it is not worked again until it is released

#### Scenario: A held item's lost record leaves it held

- **WHEN** a flagged run stopped on a question and handed the item back
- **AND** the item's hold record is later missing or unreadable, or older than the 30 days
  after which another item's record expires
- **AND** the item's file under `flagged-questions` is on the host
- **THEN** the item stays held

#### Scenario: An edit without write access leaves a flagged item held

- **WHEN** a flagged run stopped on a question it could not settle and handed the item back
- **AND** the item's author, who has no write access to its repository, then edits it
- **THEN** it is not worked again

#### Scenario: An edit lifts the suppression

- **WHEN** a handed-back item is retitled, rewritten, relabelled, or its holder changes
- **AND** the handoff was not a flagged run's that stopped on a question
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **AND** the item is not a held item a flagged run handed back
- **THEN** the item is worked again rather than the cycle failing
