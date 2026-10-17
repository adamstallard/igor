## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome, from someone with the authority to change
it: a reply from someone with write access to the repository, or an edit one of them made. Both
are required, because a handoff *invites* a reply — an item suppressed until its title or labels
change would stay silent precisely where a person supplied the missing context in a comment.

**Authority is write access**, read as `permissions.push` — the same rule `directed-interaction`
uses to decide whose word an Igor acts on, and the access an approving review needs before it
counts toward a merge. A reply from someone without it is not an answer. On a public repository
anyone can comment, so without this anyone could restart work an Igor had set down, including by
replying to a question the Igor itself asked.

**An edit counts only where a writer made it.** The item's fingerprint says that it changed, not
who changed it, and an issue's own author may edit it without write access. Who edited SHALL be
established from the item's edit history rather than inferred from the change: REST records no
editor, and GraphQL's `userContentEdits` does.

Suppression follows from the item having produced the outcome. Where the cause was a fact about
the Igor — a seat whose token is unset, a command its allowlist refuses, a capacity never
observed — the item SHALL NOT be suppressed: it did not produce that outcome, and nothing
anyone could say on it would cure one. Budget is one instance of this rule and not the whole of
it.

Written as a rule rather than an enumeration, because such causes are indistinguishable from
the item's side and identical in consequence: each recurs on the next item and every one after
until somebody changes a configuration. Suppressing on one parks a backlog behind a cure nobody
has been told to make, and every parked item then has to be answered individually to release
it. A cause arriving later has a rule to satisfy rather than a list to be added to.

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply from someone with write access lifts the suppression

- **WHEN** someone with write access to the repository comments on a handed-back item
- **THEN** it is worked again

#### Scenario: A reply from someone without write access does not

- **WHEN** someone without write access comments on a handed-back item, and nothing else changed
- **THEN** it is not worked again

#### Scenario: An edit by someone with write access lifts the suppression

- **WHEN** someone with write access retitles, rewrites or relabels a handed-back item, or changes
  its holder
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: An edit by someone without write access does not

- **WHEN** the only change to a handed-back item is an edit by someone without write access, such
  as its own author rewriting it
- **THEN** it is not worked again

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: A seat that could not be read is no more a decision about the item

- **WHEN** an item was handed back because the worker could not start, its seat's token unset
- **THEN** it is not suppressed, on the same grounds: the Igor's configuration produced that
  outcome, and the next item would meet it identically

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing
