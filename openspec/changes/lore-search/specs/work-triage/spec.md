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
for the role. The hold record SHALL hold one *entry* for every state directory that may hold
files under `flagged-questions` for the item, each naming that directory's *state-directory
id* (`graceful-handoff`) and the process that last wrote the question file or moved a
session-log copy there for the item: its rank, the entry's *keeping rank*, or `igor run` and
its run id. It SHALL name no host. A rank or `igor run` that writes such a file for an item
SHALL add or update its directory's entry. Two ranks that share one state directory share one
id, and so one entry, which names whichever of them wrote there last; that process deletes the
item's files in the directory, which clears the entry for both. An entry is *cleared* once its
directory's files for the item are deleted. The Igor SHALL know a held item from its hold
record. Where that record is lost, it SHALL know one from its file under `flagged-questions`
on the host, from the item's latest ledger row where that row's `reason` starts `needs a
person`, or from a latest row whose `reason` is `release requested`, the row a release by an
edit appends, below.

A held item SHALL be released in either of two ways. The Igor's operator SHALL be able to
release it on the host with `igor release <tracker>/<repo>/<item>`, such as
`igor release github/acme/api/12`, whatever an edit's attribution shows. `igor release` SHALL
print the id of the state directory it runs against. It SHALL first delete the item's session
logs and then its question file under `flagged-questions` in that state directory, by
`graceful-handoff`'s rule against following a link, so that no fallback above, its file or ledger rows, holds it
again, and clear that directory's entry in the hold record. Whenever a process or `igor release`
clears an entry, it SHALL then read the hold record again and, where every entry is cleared
and no `released` row is yet recorded for the item, mark the hold record released and append
a ledger row whose `reason` is `released`. Any process that finds a hold record with entries,
every one cleared, and no `released` row, as after a crash between those two writes, SHALL do
the same. A record whose entries are all cleared is not one with no entry. Until every entry is cleared, `igor release` SHALL
name the ids of the state directories that still hold files. Where any delete is refused,
`igor release` SHALL say that it failed and that the path is in the Igor's own log on the
host, SHALL leave any file it did not yet delete, the question file included, and SHALL clear
nothing and append no row, so the item stays held; the operator can run it again. Where the
hold record has no entry at all, `igor release` SHALL refuse, saying the files' location is
unknown, unless the operator passes a flag gate two names, after checking their state
directories; with it, `igor release` deletes the item's files in its own state directory, if
any, and appends `released`. No release SHALL delete files in any state directory but the one
it runs against; every Igor process of the role reads the release from the state branch, so a
rank elsewhere does not hold the item again from its own file or ledger rows. An edit to the
item, a relabel or a change of holder included, by someone with write access to the item's
repository SHALL also release it, where the edit can be attributed. A rank that sees such an
edit SHALL append a ledger row for the item whose `reason` is `release requested`, unless one
is already recorded for that edit, and the item stays held. Each keeping process named in the
hold record, a rank or a still running `igor run`, on its next poll SHALL delete the item's
session logs and then its question file in its own state directory exactly as `igor release`
does and clear its entry, releasing the item as above once every entry is cleared; every
other process learns of the release from the `released` row on the state branch. Where a
delete is refused, the keeping process SHALL write the path only to its own log on the host,
leave any file it did not yet delete, and clear nothing, so the item stays held, and SHALL try
the deletes again on every later poll until they succeed. No process SHALL take over
another's release, and none SHALL delete in a state directory other than its own.

An edit by anyone without write access, or one whose author the Igor cannot read, SHALL leave
the item held.

A requested release is *stuck* in three cases. First, a keeping process's delete is refused.
Second, an uncleared entry remains whose keeping process is *gone*: a rank is gone when #179's
*A retired rank does not hold its items forever* says so, by its heartbeat, and an `igor run`
is gone once it has exited, which #179 judges the same way, by its run's heartbeat file.
Third, the hold record has no entry, so the files' location is unknown. Any process of the role that polls and finds a
requested release stuck, the keeping process for its own refused delete, since only it
learns of the refusal, and any process for the other cases, SHALL open a notice condition for the operator under a key of its own,
distinct from the one `graceful-handoff` opens for a question it could not keep, such as
`release stuck`, which gate two names; it opens, stops nothing and clears as `stuck-conditions`'
*A held item's notices open at once, stop nothing, and stay open while an item is affected*
says. The notice SHALL tell the operator to run `igor release <tracker>/<repo>/<item>` on the
host of each state directory whose entry is not cleared, naming those directories' ids, or, with no
entry, that the files' location is unknown; it SHALL name nothing else of the item. The item
stays held until every entry is cleared. How write access is read and who made an edit are
#141's rules; until #141 lands, no edit can be attributed, and `igor release` is the way to
release a held item.

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
- **AND** opens the stuck-release notice once, not once per poll, under a key distinct from the
  one for a question not kept
- **AND** appends no `released` row until the deletes succeed

#### Scenario: A release whose keeping rank is gone waits for the operator

- **WHEN** an item's release by an edit has been requested
- **AND** the rank its hold record names for state directory S is gone by its heartbeat, as #179
  judges it
- **THEN** no other process deletes the files in S or clears S's entry
- **AND** the item stays held
- **AND** the stuck-release notice tells the operator to run `igor release` for the item against
  S, naming S's id

#### Scenario: A running igor run finishes its own release

- **WHEN** `igor run` kept a held item's question in state directory D, and its hold record
  names D's id and that run
- **AND** the item's release by an edit has been requested while the run is still alive
- **THEN** on its next poll the run deletes the item's files in D and clears D's entry

#### Scenario: An igor run that has exited waits for the operator

- **WHEN** the hold record's entry for state directory D names an `igor run` that has exited
- **AND** the item's release by an edit has been requested
- **THEN** no process deletes anything in D, and the item stays held
- **AND** running `igor release` for the item against D deletes its files there and releases it

#### Scenario: Two ranks that raced in different state directories both release their files

- **WHEN** ranks with state directories S1 and S2 each kept a question file for the same held
  item, and its hold record has an entry for each
- **AND** the item's release by an edit has been requested
- **AND** only the rank with S1 has deleted its files
- **THEN** the item stays held, and no `released` row is appended
- **AND** once the rank with S2 deletes its files and finds every entry cleared, it appends the
  `released` row

#### Scenario: Two ranks sharing a state directory share one entry

- **WHEN** ranks 1 and 2 share state directory S, and rank 2 wrote the item's question file there
  after rank 1 had
- **THEN** the hold record has one entry for S, naming rank 2
- **AND** rank 2's deletes in S clear that entry

#### Scenario: igor release names the state directories still to clear

- **WHEN** a held item's hold record has entries for state directories S1 and S2
- **AND** the operator runs `igor release` for the item against S1, and its deletes succeed
- **THEN** `igor release` prints S1's id, S1's entry is cleared, the item stays held, and
  `igor release` names S2's id as still holding files

#### Scenario: A hold record with no entry stays held

- **WHEN** a held item's hold record has no entry
- **AND** its release by an edit has been requested
- **THEN** the item stays held, and the stuck-release notice says the files' location is unknown
- **AND** `igor release` for the item refuses unless the operator passes gate two's flag, and
  with it deletes any of the item's files in its own state directory and appends `released`

#### Scenario: A stuck-release notice names only the item and its directories

- **WHEN** a requested release is stuck because the keeping rank for state directory S is gone
- **THEN** the notice names the item and S's id and tells the operator to run `igor release`
  against S
- **AND** it holds nothing else of the item: no question, category, path or host name

#### Scenario: Log copies from a question that was not kept are released

- **WHEN** a flagged run's question file could not be written, but a session-log copy was moved
  under `flagged-questions` in state directory S
- **THEN** the hold record has an entry for S naming the rank that moved the copy
- **AND** a release deletes that copy in S before the item is worked again

#### Scenario: The operator releases a held item on the host

- **WHEN** a flagged run stopped on a question and handed the item back, and its hold record
  has one entry, for the operator's state directory
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
