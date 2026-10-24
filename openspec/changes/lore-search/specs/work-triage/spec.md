## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment moves the item's timestamp past the watermark that discovery keeps, so the item looks
fresh next cycle. Nothing else stops it: the claim was released, no pull request exists, the
lane still admits it and the model gives the same verdict on the same text. The Igor re-claims
and re-works it every poll interval, at full worker cost, forever.

An answer is anything that could change the outcome: a reply from anyone other than the Igor,
or an edit to the item itself, except for a flagged-held item, below. Outside that case both count as answers, because a handoff *invites* a reply — an item
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
the item is *flagged-held*, and SHALL stay flagged-held whatever else its handoff carries: a cure key
(`condition-backoff`'s key for a handoff caused by a fact about the Igor), whether it comes
from a question not kept or anything else, that would exempt another handoff from suppression, does
not release it. A reply SHALL NOT count as an answer.

Each flagged run that stops on a question it could not settle starts a *flagged hold* of its own,
identified by its own `needs a person` ledger row, whether or not its question was kept; a
later flagged hold of the same item is independent of an earlier one. The item is flagged-held while any of
its flagged holds is open, and while a live run keeping its question is *part-way*, having added its flagged hold's entry,
below, but not yet appended its `needs a person` row; while part-way, the run's claim on the item
keeps it from being worked. A
*rank* is one of the Igor processes #179 runs for the role. The record this requirement keeps
of the item's flagged holds, its *flagged-hold record*, SHALL NOT expire, and where that record is missing or
unreadable the item SHALL stay flagged-held rather than be worked again. A lost record alone is rebuilt from
the ledger, below; but the ledger is on the state branch too, so where the state branch itself
is lost or reset, every flagged hold it recorded is
released, a limit the proposal's decision 147 accepts. The flagged-hold record SHALL hold
one *entry* for each flagged hold, naming the *state-directory id* (`graceful-handoff`) of the
directory the run keeps its files in, the random name of its question file, which also
prefixes the name of each of its session-log copies (`graceful-handoff`), and the process:
its rank, or `igor run` with the id #179 gives that process, which is not the
id `lore-firing` gives a run of an item (the proposal's Still open item on #179's run id). It SHALL name no host. A run SHALL add its flagged hold's
entry before it writes any file under `flagged-questions`. Its `needs a person` row SHALL name
the same state-directory id and question file name, both opaque, so that nothing about the
host leaks; where the record has lost the run's entry by the time it appends the row, the run
SHALL add the entry again first. A run with no readable state-directory id writes no file and
adds no entry; its row reads `needs a person, question not kept` and names no id. Such a
flagged hold opens the notice for a question not kept (`graceful-handoff`) and, with no entry to
clear, is also a mismatch, below, which the operator releases with `igor release`. The Igor SHALL know a flagged-held item from the ledger: from a
`needs a person` row with no `released` row naming the same flagged hold. Where the flagged-hold record is
lost, any process SHALL rebuild it in full from those rows, an open entry for each flagged hold whose
`needs a person` row has no `released` row and names a state-directory id, naming the id and
file name the row names, keeping any entry written since the loss.

A flagged-held item SHALL be released in either of two ways. The Igor's operator SHALL be able to
release it on the host with `igor release <tracker>/<repo>/<item>`, such as
`igor release github/acme/api/12`, whatever an edit's attribution shows. An edit to the
item, a relabel or a change of holder included, by someone with write access to the item's
repository SHALL also release it, where the edit can be attributed: a process of the role
that sees such an edit, a rank or an `igor run`, SHALL append a ledger row for the item whose
`reason` is `release requested`, unless one is already recorded for that edit. That row covers
the flagged holds whose `needs a person` rows came before it; a later flagged hold needs a later edit or
`igor release`. The item stays flagged-held until each of its flagged holds is released. An edit by anyone without write access, or
one whose author the Igor cannot read, SHALL leave the item flagged-held.

Each flagged hold is released on its own, by deleting its files and clearing its entry. Its entry SHALL be cleared
only once its flagged hold's `needs a person` row exists, so its run has written all its files, or
once that run is gone, when the cleanup below for a run gone part-way applies instead; and, but for the two cases below, only by deleting the question file the entry names. A
process clears an entry only after it has itself deleted the flagged hold's session logs and then the
named question file, by `graceful-handoff`'s rule against following a link. A name that is
not a single path component of the random form the Igor writes, whose length and alphabet
gate two names, is refused, as a refused
delete.
Where the named file is absent, no process clears a flagged hold's entry: only the operator's flag,
below, does, so a copied state directory, finding nothing, can never release a flagged hold. That
includes an entry whose process deleted the named file and then crashed, retired or exited
before clearing it; the mismatch notice, below, and that flag are the way out. A flagged hold whose
`needs a person` row says its question was not kept named no question file; its entry is
cleared by deleting its session-log copies. After clearing
an entry, the process SHALL read the flagged-hold record again and, where the entry is cleared and no
`released` row names its flagged hold, append a ledger row whose `reason` is `released`, naming that
flagged hold. Any process that finds a cleared entry with no `released` row for its flagged hold, as after a
crash between those two writes, SHALL do the same. A flagged hold is released once that row exists,
and the item is released once each of its flagged holds is.

A run that is gone, by #179's heartbeat, before it appends its `needs a person` row leaves an
entry, and perhaps files, that no ledger row counts as a flagged hold, so no release covers them. Any
live process whose state directory has that entry's id, a rank at the start of each cycle or an
`igor run` at its start, SHALL delete that run's files in its own directory, its session logs
and then any question file, by the same rule against following a link, and clear the entry,
with no release requested. Where the run's named question file is absent, as when the run was
gone before writing it, the entry is cleared once its session logs are deleted; this and a
flagged hold whose question was not kept are the two entries an absent named file does not keep
open. No `released` row is appended for it, since no flagged hold began.

Once a release covering a flagged hold has been requested, any live process whose state directory
has that flagged hold's id, a rank at the start of each cycle or an `igor run` at its start, SHALL act for
that flagged hold in its own directory, deleting its files and clearing its entry as above; every other process learns of the release from the
`released` rows on the state branch. `igor release` SHALL print the id of the state directory
it runs against and act for each of the item's flagged holds whose entry names that id the same way.
Where a delete is refused, `igor release` SHALL say that it failed and that the path is in the
Igor's own log on the host, and a process SHALL write the path only to its own log on the
host; each of `igor release` and the process leaves any file it did not yet delete, clears nothing and appends no row, so the
flagged hold stays open, and a process tries the delete again on every later cycle until it
succeeds. Until each flagged hold is released,
`igor release` SHALL name the ids of the state directories whose entries remain. With a flag
gate two names, which the operator passes after checking that no state directory with that id
still holds the flagged hold's files, `igor release` SHALL clear an entry whose named file is absent,
deleting nothing, and SHALL append the `released` row of a flagged hold that has no entry. With
another flag gate two names, `igor release` SHALL delete the item's files in its own state
directory that no open entry names, by the same rule against following a link; the operator
passes it after reading any question file among those files.

`igor release` SHALL also release in a batch, with flags gate two names, but only flagged holds
that leave no question file to read. A batch *by cause*, the cause being a question file that is
absent, acts only on entries naming the id of the state directory it runs against, the one
directory whose files it can see, and releases those whose named question file is absent there
and none of whose session-log copies remain; since copying a live state directory is
unsupported (`graceful-handoff`), a file absent there is taken as absent everywhere. A flagged hold whose log copies remain is left to `igor release` naming its
item. A batch *by id* names the id of a state
directory no live process answers for, the second stuck case below, which the operator
states no longer exists by passing that flag with its id; it releases every entry naming that id. A batch clears such entries,
appends their `released` rows and deletes nothing. A flagged hold whose question file
still exists SHALL be released only by `igor release` naming its item, after the operator has
read that file. No process and no `igor release` SHALL delete in a state directory other
than its own.

A requested release is *stuck* for a flagged hold in two cases. First, a delete is refused.
Second, its entry is uncleared and no live process answers for its state directory: every rank
and `igor run` that #179's heartbeat files show with that id is *gone*, as #179's *A retired
rank does not hold its items forever* judges by the heartbeat, which records the process's
state-directory id. Any process of the role that finds a flagged hold stuck, the process
whose delete was refused for the first case and any process for the second, SHALL open a
notice under a key of its own, distinct from the one `graceful-handoff` opens for a question
it could not keep, such as `release stuck`, which gate two names; `stuck-conditions`' *A
notice opens at once, stops nothing, and stays open while an item is affected* says how it is
rebuilt and cleared. The Igor's own log on the host SHALL name each stuck item and the ids of
the state directories involved, and tell the operator to run `igor release
<tracker>/<repo>/<item>` on the host whose state directory has each id; the notice puts
nothing of the item on any branch.

Any *mismatch* between the flagged-hold record and the ledger, on the state branch, and the
files under `flagged-questions` on a host SHALL open a notice under a key of its own, distinct from the other
two, such as `hold mismatch`, which gate two names, and the operator resolves it with `igor
release`. Each live process, a rank at the start of each cycle or an `igor run` at its start,
SHALL compare the record with its own state directory, and any process SHALL compare the
record with the ledger. A mismatch is any of these:
- an open entry naming the directory's id, whose flagged hold has its `needs a person` row, and
  whose named question file is absent there, other than a flagged hold whose question was not
  kept, which is cleared by deleting its session-log copies; this includes a crash between
  deleting the named file and clearing the entry, a rebuilt record that reopens a cleared
  entry, and a copy taken before a question file was written;
- a file under `flagged-questions` in the directory, a question file or a session-log copy,
  whose `<name>` no open entry names, as after a copy
  taken after a question file was written released its flagged hold, after a lost record
  dropped a part-way run's entry, or after a process #179 judged gone went on writing;
- a `needs a person` row with no `released` row and no entry, as for a run with no readable
  state-directory id.
A mismatch that lasts only while a live process finishes a release it began, between deleting a
named file and clearing its entry, may open the notice for that cycle; it closes once the entry is cleared. The Igor's own log
on the host SHALL name each item, the state-directory id and which of these it found, and the
notice puts nothing of the item on any branch. How write access is read and who
made an edit are #141's rules; until #141 lands, no edit can be attributed, and `igor release`
is the way to release a flagged-held item.

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
- **AND** someone with write access to the item's repository then relabels or edits the item,
  where the edit can be attributed
- **THEN** it is worked again

#### Scenario: A release by an edit deletes the item's files

- **WHEN** a flagged-held item's question file and session logs are under `flagged-questions`
- **AND** someone with write access to the item's repository edits the item, where the edit
  can be attributed
- **THEN** the Igor deletes the session logs and then the question file before the item is
  worked again

#### Scenario: A process on the directory deletes on a release another rank saw

- **WHEN** rank 1 kept a flagged-held item's question in its state directory
- **AND** rank 2, on another state directory, sees an attributable edit to the item by someone
  with write access
- **THEN** rank 2 appends a `release requested` row and the item stays flagged-held
- **AND** at the start of its next cycle rank 1 deletes the session logs and then the question
  file, clears the flagged hold's entry and appends a `released` row naming the flagged hold
- **AND** rank 2 learns of the release from that row

#### Scenario: A requested release is not a release

- **WHEN** an item's latest ledger row is `release requested` and its flagged-hold record is lost
- **THEN** the item stays flagged-held, since a `needs a person` row has no `released` row naming its
  flagged hold

#### Scenario: A refused delete keeps an edited item flagged-held

- **WHEN** someone with write access to the item's repository edits a flagged-held item, where the
  edit can be attributed
- **AND** a worker running as the Igor's user has replaced one of the item's session-log
  copies with a symbolic link
- **THEN** the Igor deletes nothing through the link and writes its path only to its own log
- **AND** the flagged hold's entry stays open, no `released` row is appended, and the item is not
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
- **THEN** no other process deletes the files in S or clears the entry naming S's id
- **AND** the item stays flagged-held
- **AND** the stuck-release notice tells the operator to run `igor release` for the item against
  S, naming S's id in its text and the Igor's log, not on the state branch

#### Scenario: A directory-mate finishes the release of a gone rank

- **WHEN** ranks 1 and 2 share state directory S, rank 2 wrote the item's files there, and rank
  2 is gone
- **AND** the item's release by an edit has been requested
- **THEN** rank 1, at the start of its next cycle, deletes the files in S and clears the entry naming S's id

#### Scenario: The next igor run on a directory finishes its release

- **WHEN** an `igor run` that has exited kept a flagged-held item's files in state directory D
- **AND** the item's release by an edit has been requested
- **AND** a later `igor run` starts with state directory D
- **THEN** at its start it deletes the item's files in D and clears the entry naming D's id

#### Scenario: igor release drops an entry whose named file is gone

- **WHEN** a flagged hold's entry names a question file that no state directory with its id holds, as
  after the id file was lost and the directory took a new id
- **AND** the item's release by an edit has been requested
- **THEN** no process clears that entry, and the stuck-release notice opens, since no live
  process answers for the old id
- **AND** a process on the directory with the new id opens the mismatch notice for the files
  there that no open entry names
- **AND** with gate two's flag, after the operator has checked that no state directory still holds
  the named file, `igor release` clears that entry without deleting anything

#### Scenario: Two flagged holds of one item are released one at a time

- **WHEN** runs with state directories S1 and S2 each kept a flagged hold of the same item
- **AND** the item's release by an edit has been requested
- **AND** only the rank with S1 has deleted its flagged hold's files
- **THEN** S1's flagged hold has its `released` row and S2's has none, and the item stays flagged-held
- **AND** once the rank with S2 deletes its flagged hold's named file and clears its entry, it appends
  the `released` row for that flagged hold, and the item is released

#### Scenario: Two flagged holds on a shared state directory have an entry each

- **WHEN** ranks 1 and 2 share state directory S, and each kept a flagged hold of the item there
- **THEN** the flagged-hold record has an entry for each flagged hold, each naming S's id and its own question
  file
- **AND** either rank in S can clear either entry by deleting the file it names

#### Scenario: A keep adds its entry before writing a file

- **WHEN** a flagged run keeps its question in state directory S
- **THEN** the flagged-hold record has its flagged hold's entry before any of its files is written in S

#### Scenario: A run whose entry a lost record dropped adds it again

- **WHEN** a flagged run in state directory S added its flagged hold's entry and wrote its files
- **AND** the flagged-hold record is then lost and rebuilt without that entry
- **THEN** the run adds its entry again before it appends its `needs a person` row

#### Scenario: A missed released row is appended by any process

- **WHEN** a process cleared a flagged hold's entry and stopped before appending its `released`
  row
- **THEN** the next process that finds the cleared entry with no `released` row appends it

#### Scenario: A question file name not of the random form is refused

- **WHEN** a flagged hold's entry names a question file whose name is not one path component of
  the random form
- **AND** a release of the item has been requested
- **THEN** no file is deleted, the entry stays open, and the delete counts as refused

#### Scenario: A crash after deleting the named file leaves the entry to the operator

- **WHEN** a process deleted a flagged hold's named file and then crashed before clearing its
  entry
- **THEN** no process clears the entry, the mismatch notice opens, and with gate two's flag
  `igor release` clears it

#### Scenario: An entry is not cleared while its run is part-way

- **WHEN** a flagged run in state directory S has added its flagged hold's entry but not yet appended
  its `needs a person` row
- **AND** a release of the item is requested before that row is appended
- **THEN** that request does not cover the flagged hold the run starts when it appends its row,
  and no process clears its entry
  while the run is live

#### Scenario: A run gone part-way leaves nothing behind

- **WHEN** rank 1 in state directory S added a flagged hold's entry and wrote its session-log copy, and
  then retired before appending its `needs a person` row
- **AND** that rank is gone by #179's heartbeat, and rank 2 still uses S
- **AND** no release of the item has been requested
- **THEN** at the start of its next cycle rank 2 deletes the session-log copy and clears the
  entry
- **AND** no `released` row is appended

#### Scenario: A copied state directory that finds nothing releases nothing

- **WHEN** state directory S is copied before a flagged hold's question file is written in S, so the copy
  has S's id but not the file
- **AND** a release of the item has been requested
- **THEN** a process on the copy finds no named file and clears nothing

#### Scenario: A file no entry names opens the mismatch notice

- **WHEN** state directory S holds a session-log copy or question file under `flagged-questions`
  that no open entry names, as after a copy of S released its flagged hold
- **THEN** a process on S opens the mismatch notice, its log naming the item, S's id and that
  it found files no entry names, and nothing of the item on any branch
- **AND** after reading any question file among them, the operator deletes those files with
  `igor release` and gate two's flag

#### Scenario: A flagged hold with no entry opens the mismatch notice

- **WHEN** a flagged run with no readable state-directory id appends `needs a person, question
  not kept`, so its flagged hold has no entry
- **THEN** any process, comparing the record with the ledger, opens the mismatch notice
- **AND** `igor release` with gate two's flag appends that flagged hold's `released` row

#### Scenario: A batch release leaves out a flagged hold whose question file exists

- **WHEN** no live process answers for state directory S, which the operator states no longer
  exists, and entries naming S's id remain for two flagged holds
- **AND** state directory T holds the question file of a third flagged hold
- **THEN** a batch `igor release` by S's id clears the two entries and appends their `released`
  rows, deleting nothing
- **AND** no batch releases the third flagged hold; only `igor release` naming its item does

#### Scenario: A batch by cause leaves out a hold whose log copies remain

- **WHEN** two entries naming state directory T's id have question files absent from T
- **AND** a session-log copy of the first remains in T
- **THEN** a batch `igor release` by cause, run against T, releases only the second
- **AND** the first is released only by `igor release` naming its item

#### Scenario: A batch by cause acts only on its own directory

- **WHEN** entries naming state directory T's id include one whose question file is absent from
  T and one whose question file is present
- **AND** an entry naming another directory's id has a question file that is absent there
- **THEN** a batch `igor release` by cause, run against T, releases only the first

#### Scenario: A later flagged hold of the same item is independent

- **WHEN** a flagged hold of an item was released
- **AND** a later flagged run keeps a new flagged hold of the item
- **THEN** the item is flagged-held by the new flagged hold, whose `needs a person` row has no `released` row
  naming it, whatever the earlier flagged hold's rows say

#### Scenario: igor release names the state directories still to clear

- **WHEN** a flagged-held item has flagged holds with entries naming state directories S1 and S2
- **AND** the operator runs `igor release` for the item against S1, and its deletes succeed
- **THEN** `igor release` prints S1's id, S1's flagged hold is released, the item stays flagged-held, and
  `igor release` names S2's id as still holding files

#### Scenario: A lost flagged-hold record is rebuilt from the ledger

- **WHEN** two flagged holds of an item are open and the flagged-hold record is lost
- **THEN** a process rebuilds it with an open entry for each flagged hold whose `needs a person` row has
  no `released` row, from the state-directory id each row names
- **AND** the item stays flagged-held throughout

#### Scenario: A stuck-release notice keeps item names off the state branch

- **WHEN** a requested release is stuck because no live process answers for state directory S
- **THEN** the Igor's log lines for the notice name the item and S's id and tell the operator to run `igor release` against S, and hold nothing else of the item: no
  question, category, path or host name

#### Scenario: Log copies from a question that was not kept are released

- **WHEN** a flagged run's question file could not be written, but a session-log copy was moved
  under `flagged-questions` in state directory S
- **THEN** the flagged-hold record has an entry for its flagged hold naming S's id, and its ledger row reads
  `needs a person, question not kept`
- **AND** a release deletes that session-log copy in S and so clears the entry, since no question
  file was written

#### Scenario: The operator releases a flagged-held item on the host

- **WHEN** a flagged run stopped on a question and handed the item back, and its flagged-hold record
  has one entry, for the operator's state directory
- **AND** the operator runs `igor release` for that item on the Igor's host
- **THEN** the item is worked again, whether or not any edit can be attributed

#### Scenario: A refused delete keeps the item flagged-held

- **WHEN** the operator runs `igor release` for a flagged-held item
- **AND** a worker running as the Igor's user has replaced one of the item's session-log
  copies with a symbolic link
- **THEN** `igor release` deletes nothing through the link, keeps the question file, and says
  that it failed and that the path is in the Igor's own log
- **AND** the flagged hold's entry stays open, no `released` row is appended, and the item is not
  worked again

#### Scenario: A released item is not flagged-held again by its old ledger row

- **WHEN** the operator released each flagged hold of an item with `igor release`
- **AND** the item's flagged-hold record is later missing
- **THEN** the item is not flagged-held again, since each `needs a person` row has a `released` row
  naming its flagged hold, and the question files the entries named are gone
- **AND** the session logs kept beside them are gone too

#### Scenario: A cure key does not release a flagged-held item

- **WHEN** a flagged run stopped on a question, and its handoff also carries a cure key, as when
  the question could not be kept
- **THEN** the item stays flagged-held
- **AND** it is not worked again until it is released

#### Scenario: A flagged-held item's lost record leaves it flagged-held

- **WHEN** a flagged run stopped on a question and handed the item back
- **AND** the item's flagged-hold record is later missing or unreadable, or older than the 30 days
  after which another item's record expires
- **THEN** the item stays flagged-held, since its `needs a person` row has no `released` row naming its
  flagged hold

#### Scenario: An edit without write access leaves an item flagged-held

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
- **AND** the item is not a flagged-held item a flagged run handed back
- **THEN** the item is worked again rather than the cycle failing
