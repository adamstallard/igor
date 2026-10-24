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
not release it. A reply SHALL NOT count as an answer.

Each flagged run that stops on a question it could not settle starts a *hold* of its own,
identified by its own `needs a person` ledger row, whether or not its question was kept; a
later hold of the same item is independent of an earlier one. The item is held while any of
its holds is open, and while a live run that keeps one is part-way, since that run still holds
the item's claim. A
*rank* is one of the Igor processes #179 runs for the role. The record this requirement keeps
of the item's holds, its *hold record*, SHALL NOT expire, and where that record is missing or
unreadable the item SHALL stay held rather than be worked again. The hold record SHALL hold
one *entry* for each hold, naming the *state-directory id* (`graceful-handoff`) of the
directory the run keeps its files in, the random name of its question file, and the process:
its rank, or `igor run` with that run's id. It SHALL name no host. A run SHALL add its hold's
entry before it writes any file under `flagged-questions`. Its `needs a person` row SHALL name
the same state-directory id and question file name, both opaque, so that nothing about the
host leaks; where the record has lost the run's entry by the time it appends the row, the run
SHALL add the entry again first. A run with no readable state-directory id writes no file and
adds no entry; its row reads `needs a person, question not kept` and names no id, and with
nothing to delete its hold is released by the first release that covers it. The Igor SHALL know a held item from the ledger: from a
`needs a person` row with no `released` row naming the same hold. Where the hold record is
lost, any process SHALL rebuild it in full from those rows, an open entry for each hold whose
`needs a person` row has no `released` row, naming the id and file name the row names,
keeping any entry written since the loss.

A held item SHALL be released in either of two ways. The Igor's operator SHALL be able to
release it on the host with `igor release <tracker>/<repo>/<item>`, such as
`igor release github/acme/api/12`, whatever an edit's attribution shows. An edit to the
item, a relabel or a change of holder included, by someone with write access to the item's
repository SHALL also release it, where the edit can be attributed: a process of the role
that sees such an edit, a rank or an `igor run`, SHALL append a ledger row for the item whose
`reason` is `release requested`, unless one is already recorded for that edit. That row covers
the holds whose `needs a person` rows came before it; a later hold needs a later edit or
`igor release`. The item stays held until each of its holds is released. An edit by anyone without write access, or
one whose author the Igor cannot read, SHALL leave the item held.

A hold is released one entry at a time, by deleting its files. Its entry SHALL be cleared
only once its hold's `needs a person` row exists, so its run has written all its files, or
once that run is gone, as below; and only by deleting the question file the entry names. A
process clears an entry only after it has itself deleted the hold's session logs and then the
named question file, by `graceful-handoff`'s rule against following a link. A name that is
not a single path component of the random form the Igor writes is refused, as a refused
delete.
Where the named file is absent, no process clears the entry: only the operator's flag, below,
does, so a copied state directory, finding nothing, can never release a hold. A hold whose
`needs a person` row says its question was not kept named no question file; its entry is
cleared by deleting its session-log copies. After clearing
an entry, the process SHALL read the hold record again and, where the entry is cleared and no
`released` row names its hold, append a ledger row whose `reason` is `released`, naming that
hold. Any process that finds a cleared entry with no `released` row for its hold, as after a
crash between those two writes, SHALL do the same. A hold is released once that row exists,
and the item is released once each of its holds is.

Once a release covering a hold has been requested, any live process whose state directory
has that hold's id, a rank at the start of each cycle or an `igor run` at its start, SHALL act for
that hold this way in its own directory; every other process learns of the release from the
`released` rows on the state branch. `igor release` SHALL print the id of the state directory
it runs against and act for each of the item's holds whose entry names that id the same way.
Where a delete is refused, `igor release` SHALL say that it failed and that the path is in the
Igor's own log on the host, and a process SHALL write the path only to its own log on the
host; `igor release` and the process each leave any file it did not yet delete, clears nothing and appends no row, so the
hold stays open, and a process tries again on every later cycle. Until each hold is released,
`igor release` SHALL name the ids of the state directories whose entries remain. With a flag
gate two names, which the operator passes after checking that no state directory with that id
still holds the hold's files, `igor release` SHALL clear an entry whose named file is absent,
deleting nothing. No process and no `igor release` SHALL delete in a state directory other
than its own.

A requested release is *stuck* for a hold in three cases. First, a delete is refused. Second,
its entry is uncleared and no live process answers for its state directory: every rank and
`igor run` that #179's heartbeat files show with that id is *gone*, as #179's *A retired rank
does not hold its items forever* judges by the heartbeat, which records the process's
state-directory id. Where the heartbeat files name no state-directory id, as before #179
records one, no process judges a hold stuck this way. Third, its entry is uncleared and its named file is absent, so only the
operator's flag can clear it. Any process of the role that finds a hold stuck, the process
whose delete was refused for the first case and any process for the others, SHALL open a
notice under a key of its own, distinct from the one `graceful-handoff` opens for a question
it could not keep, such as `release stuck`, which gate two names; `stuck-conditions`' *A
notice opens at once, stops nothing, and stays open while an item is affected* says how it is
rebuilt and cleared. The Igor's own log on the host SHALL name each stuck item and the ids of
the state directories involved, and tell the operator to run `igor release
<tracker>/<repo>/<item>` on the host whose state directory has each id; the notice puts
nothing of the item on any branch. How write access is read and who
made an edit are #141's rules; until #141 lands, no edit can be attributed, and `igor release`
is the way to release a held item.

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

#### Scenario: A process on the directory deletes on a release another rank saw

- **WHEN** rank 1 kept a held item's question in its state directory
- **AND** rank 2, on another state directory, sees an attributable edit to the item by someone
  with write access
- **THEN** rank 2 appends a `release requested` row and the item stays held
- **AND** at the start of its next cycle rank 1 deletes the session logs and then the question
  file, clears the hold's entry and appends a `released` row naming the hold
- **AND** rank 2 learns of the release from that row

#### Scenario: A requested release is not a release

- **WHEN** an item's latest ledger row is `release requested` and its hold record is lost
- **THEN** the item stays held, since a `needs a person` row has no `released` row naming its
  hold

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
- **AND** the delete of one of its files by the rank on its state directory is refused on two
  cycles in a row
- **THEN** that rank tries the delete again on each cycle
- **AND** opens the stuck-release notice once, not once per cycle, under a key distinct from the
  one for a question not kept
- **AND** appends no `released` row until the deletes succeed

#### Scenario: A release whose directory's ranks are all gone waits for the operator

- **WHEN** an item's release by an edit has been requested
- **AND** every rank on state directory S is gone by its heartbeat, as #179 judges it, and no
  `igor run` there is running
- **THEN** no other process deletes the files in S or clears S's entry
- **AND** the item stays held
- **AND** the stuck-release notice tells the operator to run `igor release` for the item against
  S, naming S's id in its text and the Igor's log, not on the state branch

#### Scenario: A directory-mate finishes the release of a gone rank

- **WHEN** ranks 1 and 2 share state directory S, rank 2 wrote the item's files there, and rank
  2 is gone
- **AND** the item's release by an edit has been requested
- **THEN** rank 1, at the start of its next cycle, deletes the files in S and clears S's entry

#### Scenario: The next igor run on a directory finishes its release

- **WHEN** an `igor run` that has exited kept a held item's files in state directory D
- **AND** the item's release by an edit has been requested
- **AND** a later `igor run` starts with state directory D
- **THEN** at its start it deletes the item's files in D and clears D's entry

#### Scenario: igor release drops an entry whose named file is gone

- **WHEN** a hold's entry names a question file that no state directory with its id holds, as
  after the id file was lost and the directory took a new id
- **AND** the item's release by an edit has been requested
- **THEN** no process clears that entry, and the notice names its id
- **AND** with gate two's flag, after the operator has checked that no state directory still holds
  the named file, `igor release` clears that entry without deleting anything

#### Scenario: Two holds of one item are released one at a time

- **WHEN** runs with state directories S1 and S2 each kept a hold of the same item
- **AND** the item's release by an edit has been requested
- **AND** only the rank with S1 has deleted its hold's files
- **THEN** S1's hold has its `released` row and S2's has none, and the item stays held
- **AND** once the rank with S2 deletes its hold's named file and clears its entry, it appends
  the `released` row for that hold, and the item is released

#### Scenario: Two holds on a shared state directory have an entry each

- **WHEN** ranks 1 and 2 share state directory S, and each kept a hold of the item there
- **THEN** the hold record has an entry for each hold, each naming S's id and its own question
  file
- **AND** either rank in S can clear either entry by deleting the file it names

#### Scenario: A keep adds its entry before writing a file

- **WHEN** a flagged run keeps its question in state directory S
- **THEN** the hold record has its hold's entry before any of its files is written in S

#### Scenario: An entry is not cleared while its run is part-way

- **WHEN** a flagged run in state directory S has added its hold's entry but not yet appended
  its `needs a person` row
- **AND** a release of the item has been requested
- **THEN** no process clears that entry until the row exists, or until that run is gone

#### Scenario: A copied state directory that finds nothing releases nothing

- **WHEN** state directory S is copied before a hold's question file is written in S, so the copy
  has S's id but not the file
- **AND** a release of the item has been requested
- **THEN** a process on the copy finds no named file and clears nothing

#### Scenario: A later hold of the same item is independent

- **WHEN** a hold of an item was released
- **AND** a later flagged run keeps a new hold of the item
- **THEN** the item is held by the new hold, whose `needs a person` row has no `released` row
  naming it, whatever the earlier hold's rows say

#### Scenario: igor release names the state directories still to clear

- **WHEN** a held item has holds with entries naming state directories S1 and S2
- **AND** the operator runs `igor release` for the item against S1, and its deletes succeed
- **THEN** `igor release` prints S1's id, S1's hold is released, the item stays held, and
  `igor release` names S2's id as still holding files

#### Scenario: A lost hold record is rebuilt from the ledger

- **WHEN** two holds of an item are open and the hold record is lost
- **THEN** a process rebuilds it with an open entry for each hold whose `needs a person` row has
  no `released` row, from the state-directory id each row names
- **AND** the item stays held throughout

#### Scenario: A stuck-release notice keeps item names off the state branch

- **WHEN** a requested release is stuck because no live process answers for state directory S
- **THEN** nothing about the notice is written to the state branch: each process rebuilds it
  each cycle
- **AND** the Igor's log lines for the notice name the item and S's id and tell the operator to run `igor release` against S, and hold nothing else of the item: no
  question, category, path or host name

#### Scenario: Log copies from a question that was not kept are released

- **WHEN** a flagged run's question file could not be written, but a session-log copy was moved
  under `flagged-questions` in state directory S
- **THEN** the hold record has an entry for its hold naming S's id, and its ledger row reads
  `needs a person, question not kept`
- **AND** a release deletes that session-log copy in S and so clears the entry, since no question
  file was written

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

- **WHEN** the operator released each hold of an item with `igor release`
- **AND** the item's hold record is later missing
- **THEN** the item is not held again, since each `needs a person` row has a `released` row
  naming its hold, and the question files the entries named are gone
- **AND** the session logs kept beside them are gone too

#### Scenario: A cure key does not release a held item

- **WHEN** a flagged run stopped on a question, and its handoff also carries a cure key, as when
  the question could not be kept
- **THEN** the item stays held
- **AND** it is not worked again until it is released

#### Scenario: A held item's lost record leaves it held

- **WHEN** a flagged run stopped on a question and handed the item back
- **AND** the item's hold record is later missing or unreadable, or older than the 30 days
  after which another item's record expires
- **THEN** the item stays held, since its `needs a person` row has no `released` row naming its
  hold

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
