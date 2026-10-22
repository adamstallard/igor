## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark that discovery keeps, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome: a reply from anyone other than the Igor,
or an edit to the item itself, except for a held item, below. Outside that case both are required, because a handoff *invites* a reply — an item
suppressed until its title or labels change would stay silent precisely where a person supplied
the missing context in a comment.

Suppression follows from the item having produced the outcome. Where the cause was a fact about
the Igor — a seat whose token is unset, a command its allowlist refuses, a seat whose capacity
igor has never observed — the item SHALL NOT be suppressed: it did not produce that outcome,
and nothing anyone could say on it would cure such a cause. Budget is one instance of this rule and not the whole of
it.

Written as a rule rather than an enumeration, because such causes are indistinguishable from
the item's side and identical in consequence: each recurs on the next item and every one after
until somebody changes a configuration. Suppressing on one parks a backlog behind a cure nobody
has been told to make, and every parked item then has to be answered individually to release
it. A cause arriving later has a rule to satisfy rather than a list to be added to.

Where the handoff is a flagged run's that stopped on a question it could not settle
(`graceful-handoff`'s *A handoff states what was done, what remains, and who could continue*),
the item is *held*, and SHALL stay held whatever else its handoff carries: a cure key
(`condition-backoff`'s key for a handoff caused by a fact about the Igor, which a question not
kept is), a question not kept, or anything else that would exempt another handoff from suppression, does
not release it. A reply SHALL NOT count as an answer. The record this requirement keeps of a held item,
its *hold record*, SHALL NOT expire, and where that record is missing or unreadable the item
SHALL stay held rather than be worked again. A *rank* is one of the Igor processes #179 runs
for the role. The hold record SHALL hold one *entry* for every host that may hold files under
`flagged-questions` for the item, each naming the host and the process that wrote the question
file or moved a session-log copy there: its rank, the entry's *keeping rank*, or `igor run`.
A rank or `igor run` that writes such a file for an item SHALL add its entry to the record. An
entry is *cleared* once that host's files for the item are deleted. How a host is named, and
whether an entry should name the state directory rather than the host, are open (the
proposal's Still open). The Igor SHALL know a held item from its hold record. Where that
record is lost, it SHALL know one from its file under `flagged-questions` on the host, from
the item's latest ledger row where that row's `reason` starts `needs a person`, or from a
latest row whose `reason` is `release requested`, the row a release by an edit appends,
below.

A held item SHALL be released in either of two ways. The Igor's operator SHALL be able to
release it on the host with `igor release <tracker>/<repo>/<item>`, such as
`igor release github/acme/api/12`, whatever an edit's attribution shows. Releasing SHALL first
delete the item's session logs and then its question file under `flagged-questions` on the host
it runs on, by `graceful-handoff`'s rule against following a link, so that no fallback above
holds it again, and clear that host's entry in the hold record. Whenever a rank or
`igor release` clears an entry, it SHALL then read the hold record again and, where every entry
is cleared and no `released` row is yet recorded for the item, mark the hold record released
and append a ledger row whose `reason` is `released`. Until every entry is cleared,
`igor release` SHALL say which named hosts still hold files. Where any delete
is refused, `igor release` SHALL say that it failed and that the path is in the Igor's own log
on the host, SHALL leave any file it did not yet delete, the question file included, and SHALL
clear nothing and append no row, so the item stays held; the operator can run it again. No
release SHALL delete files on any host but the one it runs on;
every Igor process of the role, each a *rank* under #179, reads the release from the state
branch, so a rank on another host does not hold the item again from its own file or ledger
rows. An
edit to the item, a relabel or a change of holder included, by someone with write access to
the item's repository SHALL also release it, where the edit can be attributed. A rank that
sees such an edit SHALL append a ledger row for the item whose `reason` is `release
requested`, unless one is already recorded for that edit, and the item stays held. Each
keeping rank named in the hold record, on its next poll, SHALL delete the item's session logs
and then its question file on its own host exactly as `igor release` does and clear its entry,
releasing the item as above once every entry is cleared; every other rank learns of the
release from the `released` row on the state branch. Where a delete is refused, the keeping rank SHALL write the path only to
its own log on the host, leave any file it did not yet delete, and clear nothing, so the item
stays held, and SHALL try the deletes again on every later poll until they succeed. No rank
SHALL take over another's release, and none SHALL delete on a host other than its own.

An edit by anyone without write access, or one whose author the Igor cannot read, SHALL leave
the item held.

A requested release is *stuck* where a keeping rank's delete is refused, or where an uncleared
entry remains that no rank can clear: its keeping rank has left #179's roster, or it names
`igor run`. Any rank that polls and finds a requested release stuck, the keeping rank for a
refused delete and otherwise any rank of the role, which reads the roster as #179 says, SHALL,
once `condition-backoff` defines conditions, open a notice condition for the operator under a
key of its own, distinct from the one `graceful-handoff` opens for a question it could not
keep, such as `release stuck`, which gate two names. It SHALL open it once for the item rather
than once per poll, reusing a condition of that key already open, and it SHALL stop no work.
The notice SHALL tell the operator to run `igor release <tracker>/<repo>/<item>` on each named
host whose entry is not cleared, and SHALL name those hosts and the item and nothing else of
it. How such a condition names more than one item, and how it clears, are open (the
proposal's Still open). The item stays held until every entry is cleared. How write
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

#### Scenario: A release by an edit deletes the item's files

- **WHEN** a held item's question file and session logs are under `flagged-questions`
- **AND** someone with write access to the item's repository edits the item, where the edit
  can be attributed
- **THEN** the Igor deletes the session logs and then the question file before the item is
  worked again

#### Scenario: The keeping rank deletes on a release another rank saw

- **WHEN** rank 1 kept a held item's question on its host
- **AND** rank 2 sees an attributable edit to the item by someone with write access
- **THEN** rank 2 appends a `release requested` row and the item stays held
- **AND** on its next poll rank 1 deletes the session logs and then the question file, marks
  the hold record released and appends a `released` row
- **AND** rank 2 learns of the release from that row

#### Scenario: A requested release is not a release

- **WHEN** an item's latest ledger row is `release requested` and its hold record is lost
- **THEN** the item stays held

#### Scenario: A refused delete keeps an edited item held

- **WHEN** someone with write access to the item's repository edits a held item, where the
  edit can be attributed
- **AND** a worker running as the Igor's user has replaced one of the item's session-log
  copies with a symbolic link
- **THEN** the Igor deletes nothing through the link and writes its path only to its own log
- **AND** the hold record stays held, no `released` row is appended, and the item is not
  worked again

#### Scenario: A refused delete on a requested release is retried and noticed once

- **WHEN** an item's release by an edit has been requested
- **AND** the keeping rank's delete of one of its files is refused on two polls in a row
- **THEN** the keeping rank tries the delete again on each poll
- **AND**, where `condition-backoff` is built, opens the stuck-release notice once, not once per
  poll, under a key distinct from the one for a question not kept
- **AND** appends no `released` row until the deletes succeed

#### Scenario: A release with a retired keeping rank waits for the operator

- **WHEN** an item's release by an edit has been requested
- **AND** the rank its hold record names on host H has left #179's roster
- **THEN** no other rank deletes the files on H or clears H's entry
- **AND** the item stays held
- **AND**, where `condition-backoff` is built, the stuck-release notice tells the operator to run
  `igor release` for the item on H

#### Scenario: A question kept by igor run waits for the operator

- **WHEN** `igor run` kept a held item's question on a developer's machine D, and its hold
  record names D and `igor run`
- **AND** the item's release by an edit has been requested
- **THEN** no rank deletes anything on D, and the item stays held
- **AND** running `igor release` for the item on D deletes its files there and releases it

#### Scenario: Two hosts that raced both release their files

- **WHEN** ranks on hosts H1 and H2 each kept a question file for the same held item, and its
  hold record names both
- **AND** the item's release by an edit has been requested
- **AND** only the rank on H1 has deleted its files
- **THEN** the item stays held, and no `released` row is appended
- **AND** once the rank on H2 deletes its files and finds every entry cleared, it appends the
  `released` row

#### Scenario: igor release names the hosts still to clear

- **WHEN** a held item's hold record names hosts H1 and H2
- **AND** the operator runs `igor release` for the item on H1, and its deletes succeed
- **THEN** H1's entry is cleared, the item stays held, and `igor release` says that H2 still
  holds files

#### Scenario: A stuck-release notice names only the item and its hosts

- **WHEN** a requested release is stuck because its keeping rank on H has left #179's roster
- **AND** `condition-backoff` is built
- **THEN** the notice names the item and H and tells the operator to run `igor release` there
- **AND** it holds nothing else of the item: no question, category or path

#### Scenario: Log copies from a question that was not kept are released

- **WHEN** a flagged run's question file could not be written, but a session-log copy was moved
  under `flagged-questions` on host H
- **THEN** the hold record names H and the rank that moved the copy
- **AND** a release deletes that copy on H before the item is worked again

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

#### Scenario: A seat that could not be read is no more a decision about the item

- **WHEN** an item was handed back because the worker could not start, the variable naming
  its seat's token unset, so igor could not read the token
- **THEN** it is not suppressed, on the same grounds: the Igor's configuration produced that
  outcome, and the next item would meet it identically

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record is missing or unreadable
- **AND** the item is not a held item a flagged run handed back
- **THEN** the item is worked again rather than the cycle failing
