## MODIFIED Requirements

### Requirement: Assignment expresses a claim; ordering resolves it

A claim SHALL set the tracker's native holder field, such as GitHub's `igor:<role>` label or
Linear's delegate, and then post the claim message. Resolution SHALL rely on the storage order
of writes, not on a conditional write. Among one role's processes, the claim message first in the
surface's sequence key holds the item, counting only messages timestamped after the latest
removal of the role's label, and none from a gone rank (*A retired rank does not hold its items
forever*).

#### Scenario: Claim visible in the native field

- **WHEN** an Igor claims an item on a tracker with a holder field
- **THEN** the holder field shows the Igor
- **AND** a human reading the tracker sees the claim without knowing any convention

#### Scenario: Holder field written before the claim message

- **WHEN** an Igor claims an item on a tracker with a holder field
- **THEN** it sets the holder field first and posts the claim message, which names the Igor and
  carries the stop instruction, second
- **AND** an Igor that fails between the two writes leaves the visible claim, and posts the
  message on the next cycle

#### Scenario: Later write holds a single-valued field

- **WHEN** two Igors set a single-valued holder field on the same item within one settle interval
- **THEN** each re-reads the field, and the Igor whose write the field still shows holds the item
- **AND** the other Igor has lost the claim

#### Scenario: Another holder in a list

- **WHEN** a re-read after the settle interval finds another holder in a list-valued holder
  field, such as GitHub's `igor:` labels
- **THEN** the Igor has lost the claim

#### Scenario: No dependence on conditional writes

- **WHEN** a claim is taken on any tracker
- **THEN** correctness does not depend on a compare-and-set guarantee from that surface's API

#### Scenario: A claim message from before a release does not count

- **WHEN** an item was released, as the removal of the role's label in the item's label events
  records, and then claimed again by processes of one role
- **THEN** only claim messages posted since the release are compared

#### Scenario: A claim message in the release's second does not count

- **WHEN** an item's latest release and a claim message on it carry the same second
- **THEN** that claim message does not count, since a message counts only when its timestamp is
  later than the release's
- **AND** the process that posted it works nothing, and the item is claimed at a later cycle
- **AND** no process waits for the release's second to pass before posting

#### Scenario: Claims written in the same second still order

- **WHEN** two processes of one role claim one item and the surface reports both claim messages
  at the same timestamp
- **THEN** the surface's sequence key, never a timestamp, decides, and exactly one claim stands

### Requirement: A claim is verified after a settle interval

A claiming Igor SHALL wait a settle interval, except on a person's hand-over where one process runs
the role, then re-read the item within one poll interval of its claim message and stand down if
another party holds it. Standing down MUST NOT remove anything naming another party, and MUST remove
whatever still names the Igor as holder, except the role's label where its scenarios keep it. Past
that poll interval it SHALL NOT work the item, even where it reads its own message as holding it.

#### Scenario: Claim confirmed

- **WHEN** a re-read after the settle interval shows the Igor still holding the claim
- **THEN** work proceeds

#### Scenario: Claim lost to an earlier writer

- **WHEN** a re-read shows another party holds the item
- **THEN** the Igor stands down and performs no work
- **AND** the loss is recorded

#### Scenario: Losing Igor leaves a single-valued field alone

- **WHEN** an Igor loses a claim on a single-valued holder field, where the winner's write has
  already replaced its own
- **THEN** it does not clear or change the field
- **AND** it posts a short reply saying it is handing the item back, and changes nothing else

#### Scenario: Losing Igor removes itself from a list

- **WHEN** an Igor loses a claim to another party on a holder field that holds a list, and no
  other process of its own role shares its entry
- **THEN** it removes its own entry and leaves every other holder in place

#### Scenario: A process that loses to its own role keeps the label on the item

- **WHEN** a process loses a claim to another process of its own role
- **THEN** it leaves the holder field, such as the role's label, as it is, posts nothing and
  performs no work

#### Scenario: Several ranks and no counting claim message keep the label

- **WHEN** several processes run the role, and a process standing down finds no claim message
  counting
- **THEN** it leaves the label in place, since it cannot tell that no rank holds the item, except
  as the failed-post exception in *Only the rank holding a claim gives it back* allows

#### Scenario: A late verification works nothing

- **WHEN** a process reaches the re-read more than one poll interval after posting its claim
  message, and its own message holds the item with no other process's message counting
- **THEN** it performs no work, gives the claim back out loud, and, where a fresh read just
  before the removal still shows its own message holding the item, removes the label, as *A
  process whose claim may have failed tests who holds the item* says

#### Scenario: A late verification that finds another rank holding is silent

- **WHEN** a process reaches the re-read more than one poll interval after posting its claim
  message, and another process's claim message counts
- **THEN** it performs no work, and posts and removes nothing, as *A process whose claim may have
  failed tests who holds the item* says

#### Scenario: A late verification with no counting claim message gives the claim back out loud

- **WHEN** a process reaches the re-read more than one poll interval after posting its claim
  message, and no claim message counts, its own included
- **THEN** it performs no work, gives the claim back out loud, and leaves the label, since it
  removes the label only where its own message holds the item, and here none does

#### Scenario: A hand-over skips the settle interval except among one role's ranks

- **WHEN** a person hands an item to an Igor
- **THEN** the Igor waits no settle interval, as *A person can direct an Igor through the holder
  field* says
- **AND** where several processes run its role, the settle interval applies among them, as *A
  hand-over among one role's ranks is contested like found work* says

#### Scenario: Settle interval configurable

- **WHEN** an operator tunes the settle interval
- **THEN** the new value governs subsequent verification

#### Scenario: The re-read looks back to when the item was chosen or handed over

- **WHEN** an Igor re-reads an item it claimed
- **THEN** it looks for a stop said since the cycle that chose the item read it, or, for an item
  a person handed over, since the hand-over

#### Scenario: A stop said while the cycle worked another item

- **WHEN** a cycle chooses two items, and somebody says stop on the second while the Igor works
  the first
- **THEN** the claim on the second sees the stop, and the Igor stands down with a stop receipt,
  a reply on the item saying it stopped

#### Scenario: A stop answered by a go-ahead before the claim

- **WHEN** somebody says stop on an item the Igor's search found, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the claim holds and the run is not stopped by that stop
- **AND** this holds only where the go-ahead is later in the comments than the latest stop, as it
  would lift the stop at the next cycle

#### Scenario: A go-ahead does not lift a stop on a handed-over item

- **WHEN** somebody says stop on an item a person handed to the Igor, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the stop stands, and the Igor stands down

### Requirement: A person can direct an Igor through the holder field

Where a person sets the holder field to name an Igor, delegating on Linear or adding its
`igor:<role>` label on GitHub, the Igor SHALL treat the item as directed to it: its next cycle
that finds it SHALL post the claim message and, unless several processes run the role, start
work without a settle interval; no other Igor competes. A stop, or a person removing the Igor
from the holder field, SHALL halt it at any time.

#### Scenario: Delegated by a person

- **WHEN** a person delegates a Linear issue to an Igor
- **THEN** on its next cycle the Igor posts the claim message and starts work
- **AND** it does not wait the settle interval

#### Scenario: Labelled by a person

- **WHEN** a person adds the label `igor:<role>` to a GitHub issue
- **THEN** on its next cycle the App Igor holding that role posts the claim comment and starts work
- **AND** where one process runs the role, it does not wait the settle interval

#### Scenario: Directed work can still be stopped

- **WHEN** a person removes the Igor as delegate, removes its `igor:<role>` label, or replies stop,
  after the Igor has started
- **THEN** the Igor halts as it would for any stopped claim

#### Scenario: Several ranks share a hand-over

- **WHEN** a person adds `igor:backend` to an issue, and ranks 1 and 2 of the `backend` role are
  both free
- **THEN** they decide which works it by the contest for found work, as *A hand-over among one
  role's ranks is contested like found work* says, and only one starts work

### Requirement: A claim that cannot be kept is given back, out loud

A run that holds a claim and cannot go on SHALL release it and say so on the item, and a run that
finishes SHALL release it too, except that among one role's processes, one stood down for missed
heartbeats or finding another's claim message holding the item says nothing. Releasing after a
catch-up of its own artifact SHALL NOT remove a person's hand-over from the holder field, except
on a stop. A cycle in which two runs in a row end because a surface did not answer SHALL stop.

#### Scenario: A finished run releases its claim

- **WHEN** a run publishes its work and finishes
- **THEN** the Igor releases its claim and leaves the artifact in place
- **AND** it does not close the item
- **AND** no role setting changes this
- **AND** the item is rediscovered, and its work in flight keeps it from being claimed again

#### Scenario: A claim that could not be announced is given back

- **WHEN** one process runs the role, a claim is recorded, and the message announcing it fails
- **THEN** the claim is released and the run is refused
- **AND** the item is not left held with nothing said
- **AND** this scenario describes the holder, whom *A release that did not take is said so*
  defines

#### Scenario: A claim that could not be verified is given back and withdrawn

- **WHEN** one process runs the role, a claim was announced, and verifying it fails
- **THEN** the claim is released, the announcement is withdrawn on the item, and the run is refused
- **AND** this scenario describes the holder, whom *A release that did not take is said so*
  defines

#### Scenario: A release that did not take is said so

- **WHEN** a claim cannot be kept and releasing it does not clear the holder
- **THEN** what is said names the item as still held rather than as released
- **AND** it names the one action that frees it
- **AND** this scenario applies to a process that holds the item: a process whose claim message
  failed to post holds the item only where its test, #173's read of the item's claim messages,
  finds the message landed after all, and otherwise gives the claim back as *A process whose claim
  may have failed tests who holds the item* says

#### Scenario: A failure after the claim hands the item back

- **WHEN** a run holding a claim fails at any point after taking it
- **THEN** the claim is handed back with an explanation on the item, and the run does not end
  holding the claim in silence

#### Scenario: A cycle stops when the surface stops answering

- **WHEN** two runs in a row end because a surface did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: One run ending that way does not stop the cycle

- **WHEN** an item's run ends because a surface did not answer and the next item's run does not
- **THEN** the cycle continues and is not recorded as failed

#### Scenario: A refusal about the item does not stop the cycle

- **WHEN** a claim is refused because the tracker did not record it
- **THEN** that run's end is told apart from one a surface ended by not answering
- **AND** the cycle continues to the remaining items

#### Scenario: A write says what the surface recorded

- **WHEN** the Igor asks a surface to say or to release something
- **THEN** the answer carries what the surface recorded, not merely that no error was raised

#### Scenario: A catch-up gives its claim back and keeps a person's label

- **WHEN** an Igor brings its own pull request up to date on an issue whose `igor:<role>` label a
  person added, and the run ends other than by a stop
- **THEN** the label is still on the issue afterwards, since bringing its own artifact up to date
  is not an answer to that hand-over
- **AND** once that pull request closes, the label directs the Igor as for any hand-over

#### Scenario: A stop during a catch-up takes the label off

- **WHEN** a person stops an Igor while it brings its own pull request up to date on an issue
  whose `igor:<role>` label a person added
- **THEN** the label is removed, and the stop receipt says the Igor released the issue
- **AND** adding the label again later hands the issue over again

#### Scenario: A rank that does not hold the item gives nothing back

- **WHEN** several processes run one role, and a process that finds another process's claim
  message holding the item cannot go on with its claim
- **THEN** it removes nothing and posts nothing on the item

#### Scenario: A rank that finds no claim message holding gives the claim back out loud

- **WHEN** several processes run one role, and a process that finds no claim message holding the
  item cannot go on with its claim
- **THEN** it gives the claim back out loud, as *A process whose claim may have failed tests who
  holds the item* says, removing the label only as the failed-post exception in *Only the rank holding a
  claim gives it back* allows

#### Scenario: A process stood down for missed heartbeats says nothing

- **WHEN** several processes run one role, and a process that holds a claim stands down for
  missed heartbeats
- **THEN** it says nothing on the item, and its claim stays until a sibling counts it gone, takes
  the item over and says so, as *A retired rank does not hold its items forever* says

### Requirement: An item handed to an Igor waits for work already in flight

Where a person hands an item to an Igor through its holder field while work is in flight on it,
such as an open pull request, the Igor SHALL NOT claim it. The next cycle that finds it SHALL post
one comment naming that work and saying the Igor takes the item up once it closes, and none
again while it is open. Of several ranks, only the first available in the item's order (*Contention
is resolved before a claim, not after it*) posts it. It posts none while it catches up its own
pull request.

#### Scenario: Handed over while a pull request is open

- **WHEN** a person adds `igor:frontend` to a GitHub issue that an open pull request references
- **THEN** the `frontend` Igor does not claim it
- **AND** it posts one comment naming that pull request and saying it takes the issue up once
  the pull request closes

#### Scenario: Only one rank says it waits

- **WHEN** ranks 1 and 2 of `frontend` both find an issue a person handed over while an open pull
  request references it, and rank 2 is first in the issue's order
- **THEN** rank 2 posts the one comment, and rank 1 passes the issue over and posts nothing

#### Scenario: The pull request closes

- **WHEN** the pull request closes and the `igor:frontend` label is still on the issue
- **THEN** on its next cycle the `frontend` Igor posts the claim comment and starts work, as in *A
  person can direct an Igor through the holder field*
- **AND** where one process runs the role, it does not wait the settle interval; where several
  do, they decide which works the issue as *A hand-over among one role's ranks is contested like
  found work* says

#### Scenario: The Igor's own catch-up is not a claim of the hand-over

- **WHEN** a person hands an issue to the Igor while the Igor's own pull request on it no longer
  merges
- **THEN** the Igor brings that pull request up to date, its own work on its own artifact, and
  posts no comment saying it waits while that runs

#### Scenario: A handed-over run published, then failed

- **WHEN** an Igor's run on a handed-over item publishes work, such as a pull request, and then
  cannot finish
- **THEN** its handoff post, the comment it leaves as it stops (`graceful-handoff`), says that what
  it published stands, and that handing the item over again once that work closes has it try again
- **AND** it does not suggest handing the item over while that work is still open

### Requirement: A person reassigns an issue by removing the holding Igor's label first

Where a person adds an App Igor's `igor:<role>` label to a GitHub issue carrying another Igor's
`igor:` label, the new Igor SHALL NOT claim it, and the holder SHALL keep its claim, even while it
settles. The next cycle that finds it SHALL post one comment, once while the labels are unchanged, naming the holder and that removing its label hands the issue over. Of several ranks,
only the first available in its order posts; the rest pass it over. Work
needing two roles goes in two issues.

#### Scenario: Person labels a second Igor

- **WHEN** a person adds `igor:frontend` to a GitHub issue the `backend` Igor holds by its
  `igor:backend` label
- **THEN** the `frontend` Igor does not claim it, and posts one comment saying the `backend`
  Igor holds the issue and that removing `igor:backend` hands it over
- **AND** the `backend` Igor keeps the issue, even during its settle interval

#### Scenario: Only one rank says another Igor holds the issue

- **WHEN** ranks 1 and 2 of `frontend` both find an issue a person labelled `igor:frontend` while
  `igor:backend` holds it, and rank 1 is first in the issue's order
- **THEN** rank 1 posts the one comment, and rank 2 passes the issue over and posts nothing

#### Scenario: Person removes the holding Igor's label

- **WHEN** the person then removes `igor:backend`
- **THEN** the `backend` Igor halts, as for any stopped claim
- **AND** the `frontend` Igor posts the claim comment and starts work, as *A person can direct an
  Igor through the holder field* says
- **AND** where one process runs the role, it does not wait the settle interval; where several
  do, they decide which works the issue as *A hand-over among one role's ranks is contested like
  found work* says

#### Scenario: Another Igor's own label is still a race

- **WHEN** an Igor finds another Igor's `igor:` label on an issue it is claiming, and the
  issue's events show that Igor added the label itself
- **THEN** the settle interval resolves the claim, as in *A claim is verified after a settle
  interval*
- **AND** the adapter tells a label another Igor added from one a person added by who added it,
  read from the issue's events

### Requirement: What follows a stop is read from the tracker, not from a second command

A stop SHALL release the claim, removing the Igor from the holder field, and tracker state SHALL
decide what follows. A stop cancels a hand-over, which only a new one restores. On work the Igor's
own search found, a go-ahead or the cooldown's end lifts the stop. A go-ahead's names are read as
a stop's are, and one naming Igors SHALL lift it only for them. After a stop on a handed-over item
with no run active, the first cycle that may answer it SHALL release the claim, with a stop
receipt.

#### Scenario: A stop waits for a holder that has stopped itself

- **WHEN** a person says stop on a handed-over item, with no run active, whose holder has stood
  down or stopped on finding a second process on its rank
- **THEN** no cycle releases the claim until *A stop waits for a holder that has stood down or
  found a second process* lets one answer it

#### Scenario: A human takes the item

- **WHEN** a human assigns themselves after stopping an Igor
- **THEN** the item is not reclaimed by the Igor
- **AND** this holds whether the holder field is an `igor:` label or Linear's delegate,
  because an item assigned to a person is not claimed unless it names this Igor

#### Scenario: Nobody takes the item

- **WHEN** an item is stopped and left unassigned, with nothing in its holder field
- **THEN** it becomes eligible again after a cooldown
- **AND** it is not permanently removed from the pool

#### Scenario: Explicit go-ahead short-circuits the cooldown

- **WHEN** someone signals on the surface that work may resume
- **THEN** the item becomes eligible immediately

#### Scenario: A bare go-ahead lifts the stop for every Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says "go ahead"
  without naming anyone
- **THEN** the stop is lifted for both Igors

#### Scenario: A go-ahead that names an Igor lifts the stop only for that one

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @igor-backend"
- **THEN** the stop is lifted for the backend Igor
- **AND** the frontend Igor stays stopped until the cooldown runs out or a go-ahead meant for it

#### Scenario: A go-ahead whose name comes later on its line

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead and pick it back up, @igor-backend", with no Igor's name straight after the phrase
- **THEN** the go-ahead counts the mentions later on its opening line
- **AND** the stop is lifted for the backend Igor only

#### Scenario: A go-ahead on its own line is bare

- **WHEN** somebody says stop on an item two Igors work, and somebody then says "go ahead:" with
  "thanks @igor-backend" on the next line
- **THEN** the mention on the next line is not read, since later mentions are not read past a
  line break that the opening punctuation or a list's last separator crossed, as the `:` here
  crosses into the next line
- **AND** the stop is lifted for both Igors

#### Scenario: A go-ahead whose list runs on into the next clause

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @igor-backend, @igor-frontend keep waiting"
- **THEN** the list, which runs straight on into a word, loses its last name, whichever way the
  go-ahead's names were read: from straight after the phrase, or from later on its opening line
- **AND** the stop is lifted for the backend Igor only

#### Scenario: A go-ahead whose run-on list loses its only Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @alice, @igor-frontend keep waiting", and `@alice` is a person
- **THEN** whether the go-ahead names an Igor is read before the list loses its last name
- **AND** the stop is lifted for neither Igor

#### Scenario: A go-ahead that names only a person lifts the stop for every Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "carry on, @alice approved it", and `@alice` is a person
- **THEN** a name that is no Igor's counts as no name, as in a stop
- **AND** the stop is lifted for both Igors

#### Scenario: A go-ahead naming someone the tracker cannot resolve

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @igor-backend, @ghost", and the tracker cannot resolve `@ghost`
- **THEN** `@ghost` counts as an Igor's name, so the go-ahead names Igors
- **AND** the stop is lifted only for the Igors it names

#### Scenario: Handing the item back to the Igor is a go-ahead

- **WHEN** a person who stopped an Igor later delegates the Linear issue to it again, or adds
  its `igor:<role>` label to the GitHub issue again
- **THEN** the Igor treats the item as directed to it, without waiting the cooldown

#### Scenario: A lifted stop does not restore a hand-over

- **WHEN** a person hands an issue to an Igor, somebody stops it, and the stop is later lifted
  by a go-ahead or by the cooldown running out
- **THEN** the hand-over stays cancelled
- **AND** only removing the `igor:<role>` label and adding it again hands the issue over again

#### Scenario: A stop while nothing runs takes the label off

- **WHEN** somebody stops an Igor on an issue whose `igor:<role>` label a person added, while no
  run of that Igor is active on it
- **THEN** on its next cycle the Igor removes the label and posts a stop receipt, so that an item
  showing the Igor in its holder field is always one handed to it
- **AND** where several processes run the role, only the rank whose claim message holds the item
  answers the stop, or, where no claim message counts, the process that reaches the item, as *A
  stop on a handed-over item is answered by its holder* says; every other rank ignores it

#### Scenario: A hand-over after a stop lets the Igor's own catch-up run

- **WHEN** a person stops an Igor, then adds its `igor:<role>` label again while the Igor's own pull
  request on that issue no longer merges
- **THEN** the Igor brings that pull request up to date without waiting the cooldown

#### Scenario: A person removing the label is a stop that names them

- **WHEN** an Igor working a GitHub issue finds its `igor:<role>` label gone, and the latest
  `unlabeled` event for that label, read from the issue's events, was made by anyone other than
  the Igor's own bot account
- **THEN** the Igor halts as for any stop
- **AND** its stop receipt names whoever removed the label

#### Scenario: The Igor's own removal is its release

- **WHEN** an Igor finds its `igor:<role>` label gone, and the latest `unlabeled` event for that
  label was made by the Igor's own bot account
- **THEN** the removal is the Igor's own release, and it posts no stop receipt
- **AND** these two cases are the only ones, since an Igor that loses a race removes only its own
  label

#### Scenario: A rank's removal of the shared label does not halt another rank

- **WHEN** several processes run one role, and one rank removes the role's label as *Only the rank
  holding a claim gives it back* allows while another rank runs a worker on the item
- **THEN** the removal by the role's own bot account is a release by one of its ranks
- **AND** it does not halt the other rank's worker

#### Scenario: No second verb exists

- **WHEN** a party wishes to pause rather than stop
- **THEN** they issue a stop
- **AND** resumption follows from tracker state, with no separate pause command defined

### Requirement: An issue created from chat points back to the chat

Before creating an issue because a person instructed it in chat, an Igor SHALL search the claiming
tracker, through its adapter, for an issue linking that message, and create none if one exists. A
created issue's description SHALL link the message, and MAY quote it, and the Igor SHALL then post
the issue's link in the chat unless a reply holds it. A rank leaving a message to the rank first in
the message's order SHALL keep the read marker before that message until it is answered.

#### Scenario: Instructed in chat

- **WHEN** a person in chat instructs an Igor to do work that has no issue
- **THEN** the Igor creates an issue on the claiming tracker, where any claim on it is taken,
  whose description links the chat message
- **AND** it then posts the issue's link in the chat

#### Scenario: An issue links the message, and its link was never posted

- **WHEN** an Igor reads a chat message asking for work, an issue on the claiming tracker
  already links that message, and the chat has no reply with that issue's link, as when the Igor
  stopped between creating the issue and posting its link
- **THEN** the Igor creates no issue for it
- **AND** it posts the issue's link in the chat

#### Scenario: An issue links the message, and its link is already posted

- **WHEN** an Igor reads a chat message asking for work, an issue on the claiming tracker
  already links that message, and the chat already has a reply with that issue's link
- **THEN** the Igor creates no issue and posts nothing

#### Scenario: Lost record of handled messages

- **WHEN** an Igor's record of which chat messages it has handled is lost or out of date, and
  it reads again a message it already made an issue from
- **THEN** it finds the issue that links the message and creates no second one, since the search,
  not that record, prevents a duplicate issue

#### Scenario: Only the first rank in a message's order makes the issue

- **WHEN** several processes run the role, and a chat message asks for work
- **THEN** only the rank *A chat message becomes an issue at the first available rank in its
  order* names searches the tracker, creates the issue and posts its link

#### Scenario: The next rank answers a message the first left unanswered

- **WHEN** rank 2 passes over a chat message because rank 1 is first in its order, and rank 1 is
  counted gone or unavailable before an issue links the message or the role's bot replies to it
- **THEN** rank 2 has kept the channel's read marker before the message
- **AND** at a later cycle rank 2, now first in the message's order, reads the message again and
  answers it
- **AND** a message that already has an answer, an issue linking it or a reply to it in the chat
  from the role's bot account other than one giving only the seats' reset time, is answered by
  no rank

## ADDED Requirements

### Requirement: A chat message becomes an issue at the first available rank in its order

Where several processes run a role, only the first available rank in a chat message's order,
computed from its id as *Contention is resolved before a claim, not after it* says, SHALL make it an
issue, each rank judging availability from its own heartbeat read. With none available, the message
SHALL wait, and its first rank not gone SHALL reply in chat with the time the role's seats next
reset unless such a reply is there. That reply is not an answer. Every rank reads the channel.

#### Scenario: One rank creates the issue

- **WHEN** ranks 1 and 2 of a role both read a chat message asking for an issue, and the
  message's hash makes rank 2 its owner
- **THEN** only rank 2 creates the issue, and rank 1 creates none

#### Scenario: An unavailable owner passes the message on

- **WHEN** a chat message's hash makes rank 2 its owner, and rank 2's heartbeat shows it is not
  available, as when it has stood down, or has crashed and rank 1 now counts it gone
- **THEN** rank 1, next in the message's order, creates the issue

#### Scenario: The read marker waits for a message the first rank has not answered

- **WHEN** rank 1 reads a chat message asking for an issue, rank 2 is first in its order, and no
  issue linking the message exists yet
- **THEN** rank 1 creates no issue and leaves the channel's read marker before that message
- **AND** if rank 2 is counted gone without answering, rank 1 reads the message again and
  creates the issue

#### Scenario: A chat message with no rank available gets the reset time

- **WHEN** a chat message asks for work and no rank of the role is available
- **THEN** the rank first in the message's order answers in the chat with the time the role's
  seats next reset, or, where that rank is gone, the next rank in the order that is not gone does
- **AND** the message is still unanswered, since that reply is not an answer
- **AND** at later cycles while no rank is available, no rank replies again
- **AND** the message becomes an issue at a later cycle, once a rank is available

#### Scenario: A stale heartbeat read can open two issues

- **WHEN** a stale heartbeat read leads ranks 1 and 2 each to judge itself first for one chat
  message
- **THEN** each may open an issue from it, a rare duplicate that is accepted

### Requirement: A claim names the process that took it

A claim message SHALL carry the rank of the process that posted it, whether or not the role runs
several processes, and one that `igor run` posts SHALL also carry its run id, as `Igor-Run: <id>`.
Verification SHALL treat a claim carrying another rank, or, at rank 0, another run's id, as
another process's. The rank SHALL be given to the process when it is started, as the last part of
its name, `<role>-<rank>`, which `role-config` specifies, never discovered or counted.

#### Scenario: A sibling's claim is not the Igor's own

- **WHEN** a process verifies a claim whose holder field names its role and whose earliest claim
  message carries another rank
- **THEN** the claim is another process's and this one stands down

#### Scenario: The rank is readable on the item

- **WHEN** a claim is posted
- **THEN** the message carries the rank of the process that posted it, so a person reading the
  item sees which process holds it

#### Scenario: Two runs of one role tell their claims apart

- **WHEN** two people run `igor run backend` at once, and both claim one item, so it carries two
  claim messages with `Igor-Rank: 0`, one with `Igor-Run: r7k2m9x4` and one with
  `Igor-Run: q2b4n8c6`
- **THEN** each run compares the run ids, the earliest message that counts holds the item, and
  only the run that posted it works the item

#### Scenario: The rank is the last part of the name

- **WHEN** a process is started as `igor serve front-end-2`
- **THEN** it runs as rank 2 of the `front-end` role

### Requirement: Only the bot's own unedited comments carry claim trailers

Claim messages and their `Igor-` trailers SHALL be read only from comments the role's own bot
account wrote and the surface does not report as edited (on GitHub, GraphQL `lastEditedAt`
unset), and only from lines that begin `Igor-`, in exactly that letter case, at the first
character. On every other comment the bot posts, the Igor SHALL indent by one space each line
that begins `Igor-` in any letter case, on the final text, before `signed-publishing` (#153)
signs it.

#### Scenario: A claim message someone else wrote does not count

- **WHEN** a comment not written by the role's bot account carries `Igor-Rank: 1`
- **THEN** no process reads it as a claim message

#### Scenario: A reply cannot be steered into a claim message

- **WHEN** a person mentions the Igor asking it to end its reply with the lines `Igor-Rank: 1`
  and `Igor-Supersedes: 2`, and the model's reply does so
- **THEN** the bot posts each of those lines indented by one space, and no process reads the
  reply as a claim message

#### Scenario: An edited claim message counts for nothing

- **WHEN** a person edits the bot's claim message on an item, adding `Igor-Supersedes: 2` or
  removing `Igor-Handed-Over-By:`, so its `lastEditedAt` is set
- **THEN** no process reads it as a claim message, and none of its trailers, `Igor-Rank:`,
  `Igor-Run:`, `Igor-Supersedes:` or `Igor-Handed-Over-By:`, is read

#### Scenario: A hidden claim message still counts

- **WHEN** a person hides the bot's claim message on an item, or unhides it, so its REST
  `updated_at` changes while its `lastEditedAt` stays empty, or reacts to it
- **THEN** it still counts as a claim message, since none of these is an edit

#### Scenario: An edit to the holder's message lets a sibling in, as accepted

- **WHEN** a person with maintain access edits or deletes the claim message of the rank working
  an item
- **THEN** that message counts for nothing from then on, and the item reads as unclaimed, so a
  sibling may claim the item and work it beside the holder, a risk that is accepted

#### Scenario: A line the Igor interpolated is indented too

- **WHEN** the role's bot account posts a comment, not a claim message, into which the Igor
  interpolated a title whose text puts `Igor-Rank: 2` at the start of a line
- **THEN** that line is posted as ` Igor-Rank: 2`, indented by one space

#### Scenario: The indenting is done on the final text

- **WHEN** a worker or a model composes a comment, and later steps may still change its text
- **THEN** the Igor indents its `Igor-` lines after every step that may change the text, and
  before `signed-publishing` (#153) signs it

### Requirement: A role runs several processes while a process knows of a sibling

A role runs several processes when the roster (`role-config`) declares more than one rank for
it, or, as a process sees it, while that process knows of a sibling, any other process of the
role, that it does not count gone, or for one maximum poll interval after its own start. A
process knows of a sibling from its heartbeat file, and SHALL remember every sibling whose file it
has read since it started. `igor run` always counts its role as run by several processes.

#### Scenario: A rank on the old roster still contests a hand-over

- **WHEN** the roster grows from `[1]` to `[1, 2]`, rank 2 starts on the new roster and writes its
  heartbeat, and rank 1 has not yet applied the new roster when a person adds the label
- **THEN** rank 1 counts the role as run by several processes, from rank 2's heartbeat file, and
  contests the hand-over rather than start work without the settle interval

#### Scenario: A remembered sibling counts after a lost state branch

- **WHEN** a process has read rank 2's heartbeat file, and a lost or rolled-back state branch then
  removes that file
- **THEN** the process still counts the role as run by several processes, until it counts rank 2
  gone, which, holding no interval rank 2 declared after the loss, takes three of the maximum
  poll interval

#### Scenario: A process just started counts several processes

- **WHEN** a process has run for less than one maximum poll interval, before it can have read a
  write from every sibling, and the files it has read show no sibling
- **THEN** it counts the role as run by several processes, whatever the files show

#### Scenario: A process counts several processes in its first maximum interval

- **WHEN** rank 1, whose roster declares only rank 1, has just started and reads no sibling's
  file
- **THEN** it counts the role as run by several processes for one maximum poll interval, and
  contests a hand-over in that time

#### Scenario: A lost state branch leaves a known sibling counted

- **WHEN** rank 1, whose roster declares only rank 1, has read rank 2's heartbeat file, and the
  state branch is then lost with that file
- **THEN** rank 1 still counts the role as run by several processes until it counts rank 2 gone,
  and contests a hand-over in the meantime

### Requirement: A run by hand runs as rank 0

`igor run <role>`, with or without `--plan`, SHALL run as rank 0, outside the roster, and SHALL
NOT wait for, read or refuse on any serving rank's heartbeat before it starts. It SHALL contend as
any rank does, but take over no claim message, even its own rank's: it passes over every labelled
item with a claim message of any rank, gone or not, posted since the item's latest release,
except to answer a stop there once no claim message on it counts. `igor run --plan` SHALL change
nothing.

#### Scenario: A run beside a serving rank goes ahead

- **WHEN** `igor@backend-1` is running and a person runs `igor run backend`, which picks the run
  id `r7k2m9x4`
- **THEN** the run starts at once as rank 0, without waiting, and writes
  `heartbeats/backend-0-r7k2m9x4.json` before its first cycle

#### Scenario: A run and a serving rank contend for one item

- **WHEN** `igor run backend` and rank 1 of `backend` both claim one item
- **THEN** each verifies its claim, the earliest claim message that counts holds the item, and only
  its process works it

#### Scenario: A run does not take over a claim

- **WHEN** `igor run backend` finds a labelled item, with no stop said on it, whose earliest claim
  message carries a rank that is gone, or rank 0, another `igor run`'s
- **THEN** it passes the item over and posts nothing on it

#### Scenario: A run answers a stop on a claimed item no claim holds

- **WHEN** `igor run backend` reaches a labelled item carrying claim messages, none of which
  counts any longer, and a stop is said on it
- **THEN** it answers the stop, as any process that reaches it does under *Only the rank holding a
  claim gives it back* and *A stop on a handed-over item is answered by its holder*

#### Scenario: A run releases an unlabelled item a gone process claimed

- **WHEN** `igor run backend` finds an item with no label that carries a gone process's claim
  message
- **THEN** it releases the item before claiming it, as any process does under *A retired rank
  does not hold its items forever*

#### Scenario: A run for a role whose roster declares no rank 1

- **WHEN** the roster lists `backend: [2, 3]` and a person runs `igor run backend`
- **THEN** the run starts as rank 0

#### Scenario: A plan changes nothing

- **WHEN** a person runs `igor run backend --plan` while `igor@backend-1` is running
- **THEN** the plan runs at once, claims nothing, posts nothing, writes no heartbeat, removes no
  tree and changes nothing

### Requirement: A run by hand keeps a heartbeat file of its own

Without `--plan`, each `igor run` SHALL write its own heartbeat file,
`heartbeats/<role>-0-<run id>.json`, from a timer firing as a serving
process's does, its first write before its first cycle. Siblings judge the run's claim messages
gone by that file alone. The run SHALL remove the file as it exits, and a
serving process SHALL remove it once it counts the run gone. A claim a run leaves is taken over
by a serving rank once the run is gone, as any gone rank's is.

#### Scenario: A crashed run's claim is recovered by a serving rank

- **WHEN** an `igor run backend` with the run id `r7k2m9x4` crashes holding a claim, and rank 1
  has watched `heartbeats/backend-0-r7k2m9x4.json` fail to change for three poll intervals
- **THEN** rank 1 may take the item over, as for any gone rank's claim

#### Scenario: A crashed run's claim is recovered while another run goes on

- **WHEN** one of two `igor run backend`s crashes holding a claim, and the other keeps running
- **THEN** rank 1 takes the claim over once the crashed run's own heartbeat file has failed to
  change for three poll intervals, whatever the other run's file does

#### Scenario: A run's heartbeat file goes with it

- **WHEN** an `igor run backend` with the run id `r7k2m9x4` exits
- **THEN** it removes `heartbeats/backend-0-r7k2m9x4.json`; had it crashed instead, rank 1 would
  remove the file once it counted the run gone

### Requirement: Contention is resolved before a claim, not after it

Every item SHALL have an owner: the rank at place `h mod n` of its role's declared ranks,
ascending, with `n` their number (one for a role the roster omits) and `h` a hash of the
item's id all processes compute alike. Its order of ranks SHALL be the owner, the declared ranks
after it, ascending and wrapping, then rank 0. Its first available rank goes first, each process
judging each rank, itself too, by its own heartbeat read; a process SHALL attempt first
the candidates it goes first for.

#### Scenario: An item's owner takes it

- **WHEN** the roster declares ranks 1 to 4 for `backend`, an item's hash puts its owner at rank
  3, and rank 3 is available
- **THEN** rank 3 attempts the item first, without waiting, and ranks 4, 1 and 2 wait behind it

#### Scenario: An owner that is busy is passed to the next available rank

- **WHEN** an item's owner is rank 3 of ranks 1 to 4, rank 3's heartbeat says it is not
  available, and rank 4's says it is
- **THEN** rank 4 goes first for the item

#### Scenario: A process attempts first the items it goes first for

- **WHEN** discovery gives a process candidates it goes first for and candidates other ranks go
  first for
- **THEN** it attempts the ones it goes first for before the rest, each group in the order
  discovery gave

#### Scenario: A rank waits behind the ranks ahead of it

- **WHEN** rank 2 attempts an item that rank 1 owns, and rank 1 is available
- **THEN** rank 2 waits one settle interval for each available rank ahead of it in the item's
  order, here one, re-reads the item, finds rank 1's claim, and moves on without posting anything
- **AND** had no claim that counts been on the item, rank 2 would have claimed it

#### Scenario: A run goes after every available serving rank

- **WHEN** ranks 1 and 2 of `backend` are available and `igor run backend` attempts an item
- **THEN** the run comes last in the item's order and waits two settle intervals before claiming it

#### Scenario: Two ranks that each judge themselves first

- **WHEN** a heartbeat read half a poll interval old leads ranks 1 and 2 each to judge itself
  first for one item, and both post a claim message
- **THEN** each verifies its claim, and only the rank whose message is earliest works the item

### Requirement: A hand-over among one role's ranks is contested like found work

Where several processes run one role, its available ranks SHALL contest a hand-over to it as they
contest found work, each rank that posts verifying its claim after the settle interval; with none
available, it waits for a later cycle. A rank that takes over a handed-over item, as *A retired rank
does not hold its items forever* allows, SHALL record the hand-over in its claim message, and the
adapter SHALL read an item whose holding claim message records a hand-over as handed over by a
person.

#### Scenario: The owner takes a hand-over

- **WHEN** a person adds `igor:backend` to an issue that rank 1 owns, and ranks 1 and 2 of
  `backend` are free
- **THEN** rank 1 posts its claim message at once, and rank 2, re-reading after one settle
  interval, finds it and posts nothing
- **AND** exactly one claim message appears

#### Scenario: A busy owner does not contend

- **WHEN** a person hands over an item that rank 1 owns while rank 1's worker is running and
  rank 2 is free
- **THEN** rank 1, not available while its worker runs, does not contend, and rank 2, the next
  available rank, posts at once, verifies its claim after the settle interval, and works the item

#### Scenario: Two ranks that both post on a hand-over

- **WHEN** ranks 1 and 2 both post a claim message on a handed-over item before either sees the
  other's
- **THEN** each verifies after the settle interval, the earliest claim message that counts holds
  the item, and only its rank works it

#### Scenario: A taken-over hand-over still stands

- **WHEN** a rank takes over a handed-over item from a gone rank, removing the label and adding
  it again under *A retired rank does not hold its items forever*
- **THEN** its claim message records the hand-over, naming the person who handed the item over, as
  recorded in the holding message it took over, or, where that message records none, the person
  who added the label
- **AND** the item is still read as handed over by a person, as the person's label would be

### Requirement: A process recovers the claims of its own predecessor

A claim whose holding message, the earliest claim message that counts, carries a serving
process's own rank SHALL be treated by that process as abandoned by its predecessor, and the item
re-worked from the beginning. Rank 0 recovers nothing (*A run by hand runs as rank 0*).

Where the item has an open pull request the Igor opened, the process SHALL NOT re-work it, and
SHALL catch it up instead, as *A claim left on the Igor's open pull request is caught up* says.

#### Scenario: Restarting after a crash

- **WHEN** a process starts and finds an item claimed with its own rank
- **THEN** it takes the item and works it from the beginning

#### Scenario: A sibling does not adopt it

- **WHEN** a process finds an item held by a rank other than its own that is not gone
- **THEN** it leaves the item alone

#### Scenario: A recovered claim with a pull request open is a catch-up

- **WHEN** a process starts and finds an item claimed with its own rank, and the Igor's pull
  request for that item is open
- **THEN** it catches the item up and leaves the pull request open, and does not re-work the item

### Requirement: A claim left on the Igor's open pull request is caught up

Taking a claim its predecessor or a gone rank left, on an item with the Igor's open pull request,
a process SHALL catch the item up rather than re-work it: update the pull request where it no
longer merges (`task-execution`'s *A published artifact is kept mergeable*), then give the claim
back, leaving the pull request open. Over a gone rank's claim it SHALL NOT release the item, and
SHALL post and verify its own claim message naming the rank it supersedes, whose message no
process then counts.

#### Scenario: A gone sibling's claim on an open pull request is caught up

- **WHEN** a process finds an item whose holding claim message carries a gone rank, and the
  Igor's pull request for the item is open
- **THEN** it posts its own claim message without releasing the item, catches the item up, and
  gives the claim back
- **AND** the item is neither skipped as work in flight nor re-worked

#### Scenario: A caught-up pull request that still merges changes nothing

- **WHEN** a process carries on a claim as a catch-up, and the Igor's pull request still merges
  and carries no review to act on
- **THEN** it runs no worker and changes nothing on the item, which waits as any item with the
  Igor's pull request open does

#### Scenario: A caught-up pull request with a review to act on is resumed

- **WHEN** a process carries on a claim as a catch-up, and the Igor's pull request carries a
  review to act on
- **THEN** the holder resumes the item with a worker, as `work-triage`'s *Items with work already
  in flight are skipped* says

#### Scenario: A superseded claim does not count when its rank returns

- **WHEN** a process has taken over a gone rank's claim on an item with the Igor's pull request
  open, and the gone rank restarts
- **THEN** the gone rank's earlier claim message does not count, and the restarted rank leaves
  the item to the process that holds it

#### Scenario: A taken-over catch-up keeps a person's label

- **WHEN** a person added the role's label, and a process catches the item up over a gone rank's
  claim
- **THEN** the label is still on the item after the catch-up gives the claim back

### Requirement: A retired rank does not hold its items forever

A claim held by a rank past the abandonment bound SHALL be adoptable by any of the role's processes;
leaving the roster SHALL NOT by itself make it so. A rank is past the bound once the deciding
process has seen its heartbeat not change, by its own clock, for three poll intervals as *A
heartbeat declares its process's poll interval* measures them, counted from its own start if later.
A heartbeat changes when its file holds an id and counter other than those last read; a missing file
does not.

#### Scenario: Scaling down releases the orphan

- **WHEN** a rank is removed from the roster and it held a claim
- **THEN** another process may take that item only if the rank died before giving it up, and
  only once it has watched the rank's heartbeat fail to change for three poll intervals

#### Scenario: A rank removed from the roster is not adopted while it runs

- **WHEN** a rank is removed from the roster while its worker is running
- **THEN** no other process takes its claims while its heartbeat still changes

#### Scenario: A declared rank that stopped running

- **WHEN** a claim's rank is still declared, and a process has watched its heartbeat fail to
  change for three poll intervals
- **THEN** that process may take the item

#### Scenario: An adopted claim holds the item

- **WHEN** a process claims an item whose earlier claim message carries a rank that is gone
- **THEN** it first releases the item, removing the role's label and adding it again, and then
  posts its own claim message at once
- **AND** the earlier message falls before the latest release, and the new claim holds the item
  unless its message landed in the release's second, when the item is claimed at a later cycle

#### Scenario: An unlabelled item with a gone rank's message is released first

- **WHEN** a process takes over an item with no label that still carries the claim message of a
  gone rank, posted after a sibling gave the claim back
- **THEN** the process adds the label, removes it and adds it again, and then posts its own claim
  message at once

#### Scenario: A gone rank's message on an unlabelled item is released first

- **WHEN** rank 1, holding an item, set it down and removed the label, and rank 2, partway
  through claiming the item, posted its claim message just after; rank 2 then stood down and is
  now gone; and at a later cycle, once #173's *What lifts a set-down* has lifted the set-down,
  rank 1 claims the item again
- **THEN** rank 1 adds the label, removes it and adds it again before posting
- **AND** rank 2's message does not count when rank 2 returns

#### Scenario: An item on the Igor's own pull request is taken over without a release

- **WHEN** a process takes over, from a gone rank, an item whose open pull request the Igor
  opened
- **THEN** it takes it over without a release, as *A claim left on the Igor's open pull request
  is caught up* says

#### Scenario: A returning rank does not take back an adopted item

- **WHEN** a rank whose claim another process adopted restarts
- **THEN** its earlier claim message does not count, and it leaves the item to the process that
  holds it

#### Scenario: The bound does not shorten a run

- **WHEN** a process is working an item it holds for longer than three poll intervals
- **THEN** it keeps writing heartbeats, its rank is not gone, and no other process may take the
  item

#### Scenario: A lost state branch takes no live rank's claim

- **WHEN** the state branch is lost or reset, taking every heartbeat file with it
- **THEN** each process keeps counting, in its own memory, from the moment it last saw each
  sibling's heartbeat change
- **AND** each live rank rewrites its file within one poll interval, and no process takes a
  claim held by a live rank

#### Scenario: A rolled-back state branch takes no live rank's claim

- **WHEN** the state branch is rolled back to an old commit, putting back heartbeat files with
  counters lower than the ones already read from them
- **THEN** a file put back may read as changed, which postpones a gone verdict and never hastens
  one
- **AND** no process takes a claim held by a live rank

#### Scenario: A rank whose clock goes back is still counted

- **WHEN** a rank's clock is stepped back, or the rank restarts on a host whose clock is behind
- **THEN** each heartbeat it writes still changes its file, and no process counts it gone, since
  neither the sibling's clock nor any time in the file decides whether the file changed

#### Scenario: A crashed rank is still recovered after the branch is lost

- **WHEN** a rank's heartbeat file is missing and the rank has crashed
- **THEN** a process counts the rank gone three poll intervals after it last saw the rank's
  heartbeat change, or after its own start if that is later, and may then take the rank's claims

#### Scenario: A restart starts the clock again

- **WHEN** a process restarts
- **THEN** it counts every sibling as last seen at its own start, and as gone only once three
  poll intervals pass after that without the sibling's heartbeat changing
- **AND** the id it writes in its own file is new, so its first heartbeat changes the file
  whatever the file held before

#### Scenario: A read from before a long run is not used after it

- **WHEN** a process has worked an item for longer than three poll intervals and goes on to its
  next candidate
- **THEN** it reads the role's heartbeat files again before choosing, and counts as gone no
  sibling that kept writing heartbeats

#### Scenario: A sibling that restarted during a claim counts

- **WHEN** a sibling restarts and posts a claim message on an item after this process chose it
- **THEN** this process reads the role's heartbeat files again before verifying, and counts the
  sibling's message

#### Scenario: Every heartbeat file in one read

- **WHEN** a process reads its role's heartbeat files
- **THEN** it reads all of them, with their contents, in as few requests as the API allows, and
  judges each sibling's file changed by its blob id

### Requirement: Every process writes a heartbeat every half of its shortest interval

Every process SHALL run a timer, apart from cycle and worker, firing every half of the shortest
poll interval it has applied, that overwrites its heartbeat file on the state branch, named by role
and rank, and for `igor run` its run id; the first SHALL land before its first cycle. The file SHALL hold
a *start id* chosen at start; a counter raised each write; its host and process number; whether it
is available; its poll interval; its state-directory id, if any; and no time any process compares.

#### Scenario: A process that tripled its interval still writes every 5 minutes

- **WHEN** a process started on the 10-minute interval applies a commit that sets 30 minutes
- **THEN** it writes its heartbeat, and checks for a stand-down, every 5 minutes, half of the
  shortest interval it has applied since it started, as a process on 10 minutes does
- **AND** one failed or late write does not stand it down, since it stands down only after 20
  minutes without a heartbeat

#### Scenario: The first heartbeat comes before the first claim

- **WHEN** a process starts
- **THEN** its heartbeat lands before its first cycle chooses a candidate

#### Scenario: A heartbeat names its state directory

- **WHEN** rank 2 of `backend` writes its heartbeat, and its state directory holds the
  state-directory id `k3m9q2x7`, as `graceful-handoff`'s *A handoff states what was done, what
  remains, and who could continue* (#216) defines it
- **THEN** `heartbeats/backend-2.json` records `k3m9q2x7` beside its id, counter, availability and
  poll interval
- **AND** no claim rule reads that id, and a process whose state directory holds none writes no
  id

#### Scenario: A heartbeat names its host even on a public branch

- **WHEN** a process writes its heartbeat to a state branch that is public
- **THEN** the file still holds its host name and operating-system process number

#### Scenario: A heartbeat replaces only its own rank's

- **WHEN** two ranks of one role write heartbeats at the same time, and the state branch rejects
  one because the other moved the branch first
- **THEN** the rejected one is retried, it overwrites only its own file, and both heartbeats are
  present afterwards

### Requirement: A process is available only when it can take an item

A process is available when it is free, holding no claim; has not stood down; is not stopped as a
second process on its rank; has its heartbeat file present; is not gone; and has a seat it can spend
(#143's *A role has a seat it can spend when the gate would choose one now*). Availability decides
only which rank goes first for an item. A process SHALL read its role's heartbeat files before it
chooses a candidate, and again before it verifies a claim.

#### Scenario: A rank with no seat to spend is not available

- **WHEN** every seat that serves rank 2's role is past its reserve line
- **THEN** rank 2's heartbeat says it is not available, and an item rank 2 owns goes first to the
  next available rank

### Requirement: A second process on one rank stops taking items

At each heartbeat a process SHALL first read its rank's file. Where, between two such reads after
its first write, the counter under another start id has risen, it SHALL stop taking items and
its worker, keep its claims in silence, write itself not available, and open a condition
`instance:<role>-<rank>:duplicate` on #175's instance scope naming each writer's host and process
number, clearing it, with no probe item, once three maximum poll intervals pass in which no other
start id advanced.

#### Scenario: A second process on one rank stops both

- **WHEN** two processes on hosts `a` and `b` both serve `backend-2`, and each reads the other's
  id in the rank's file advance between two of its reads
- **THEN** each stops taking new items and stops its worker, with a condition naming host `a`
  and host `b` and both process numbers
- **AND** each appends a condition row to the execution log as it opens the condition

#### Scenario: Two writers on one host name it once

- **WHEN** both processes serving one rank run on one host
- **THEN** the condition names that host once, with both process numbers

#### Scenario: The duplicate condition clears once the other writer stops

- **WHEN** a person stops one of the two processes serving `backend-2`, and three of the maximum
  poll interval pass with no other start id advancing in the rank's file
- **THEN** the remaining process clears the condition at its first heartbeat firing after that,
  appending a condition row to the execution log, and takes items again

#### Scenario: Reads before the process's own first write decide nothing

- **WHEN** a process reads its rank's file before its own first write, and sees the counter of
  the process it replaced go up
- **THEN** it raises no condition

#### Scenario: A rolled-back branch is not a second process

- **WHEN** a rollback of the state branch restores an older copy of `backend-2`'s file, with the
  process's own id and a lower counter, or with its predecessor's id
- **THEN** the process reads a loss or rollback, as *A process detects a lost or rolled-back state
  branch from the heartbeat files* says, and raises no condition

### Requirement: A process that cannot write its heartbeat stands down

A process SHALL stand down once it has failed to write its heartbeat for two of the shortest poll
interval it has applied, as *A heartbeat declares its process's poll interval* says. It then starts
no claim and keeps its claims in silence, an exception to *A claim that cannot be kept is given
back, out loud* and to `graceful-handoff`'s rule against silence; its worker is stopped as *A
process checks for a stand-down every half of its shortest interval* says. It resumes once a
heartbeat lands.

#### Scenario: A process that cannot write its heartbeat stands down

- **WHEN** a process has failed to write its heartbeat for two poll intervals, as *A heartbeat
  declares its process's poll interval* measures them
- **THEN** it starts no claim, and its timer stops its worker at its next check, leaving the
  claim, and the run says nothing on the item
- **AND** it makes no test of the claim messages and gives nothing back
- **AND** once a heartbeat lands, it resumes

### Requirement: A process checks for a stand-down every half of its shortest interval

A process's timer SHALL check, at each heartbeat firing, every half of the shortest poll interval it
has applied since it started, whether the process has stood down, and SHALL stop a running worker at the first check
after the stand-down, without waiting for an event from it. The timer does not check for a
person's stop, which a process still sees at the claim re-read on a worker event.

#### Scenario: A silent worker is still stopped by the timer

- **WHEN** a process stands down while its worker runs a tool that produces no event for longer
  than a poll interval
- **THEN** the timer stops the worker within half the shortest poll interval the process has
  applied, counted from the stand-down, without waiting for an event

#### Scenario: A process that tripled its interval still stops its worker in time

- **WHEN** rank 1 runs on 10 minutes, rank 2 applies a commit that triples its poll interval from
  10 to 30 minutes, and every heartbeat rank 2 writes after that fails, so rank 1 has seen it
  declare only 10 minutes
- **THEN** rank 2's timer checks every 5 minutes, half of the 10 minutes it used before, so rank 2
  stands down 20 minutes after its last heartbeat and stops its worker within 25 minutes of it
- **AND** rank 1 counts rank 2 gone only 30 minutes after that heartbeat, so only one process
  works each item

### Requirement: A process reads the roster and its configuration at each cycle start

A process SHALL read the roster and configuration at each cycle start from the lore commit it
applies then. Where the roster drops its rank, it SHALL start no claim and exit as *A rank removed
from the roster exits cleanly* says. Configuration, roster included, failing a starting process's
check SHALL be refused, unless GitHub did not answer it or refused the App's credential: it keeps
the last that passed, stays running and raises #208's `lore:config:<role>` naming the failing file
and check.

#### Scenario: A process whose rank leaves the roster shuts down

- **WHEN** the roster no longer declares a running process's rank while its worker runs
- **THEN** it starts no claim, finishes the item or hands it off out loud, as `work-discovery`'s
  scenario *Shutdown finishes the item in hand* says, and then exits with status 0
- **AND** it writes heartbeats until it exits, so no sibling takes its claims unless it dies first

#### Scenario: A roster that fails a check at a cycle is refused

- **WHEN** a process reads `igor.config.yaml` at the start of a cycle, and its roster lists one
  rank twice
- **THEN** the process goes on under the last configuration that passed, roster included, and
  does not exit
- **AND** `lore:config:<role>` names `igor.config.yaml` and the failing check, and opens and
  clears as `lore-pull`'s *A lore read at each cycle start applies what passes and refuses what
  fails* (#208) says, such as on a passing read of a commit descending from the refused one
- **AND** a later read that passes takes effect

#### Scenario: A check GitHub could not answer refuses nothing

- **WHEN** a check on the configuration read at a cycle's start fails because GitHub did not
  answer, or refused the App's credential
- **THEN** the read is not refused, as `lore-pull`'s *`igor serve` starts on the newest commit
  that passes* (#208) says

#### Scenario: A roster that drops the rank is not refused

- **WHEN** a process of rank 2 reads, at the start of a cycle, a roster that no longer declares
  rank 2 and passes every other check
- **THEN** the read passes, and the process shuts down as a retired rank does

#### Scenario: Ranks on different rosters keep one worker per item

- **WHEN** rank 1 has applied a commit whose roster drops rank 2 while rank 2 still runs on the
  commit before it
- **THEN** each decides by the commit it applied, as `lore-pull`'s *Processes apply new commits
  independently* (#208) says, and no rule depends on their agreeing on the roster
- **AND** the claim and its verification still let only one process work each item

#### Scenario: A removed seat file takes effect even in a refused read

- **WHEN** a process reads its configuration at the start of a cycle, the read fails a check, and
  it finds a seat file removed
- **THEN** it goes on under the last configuration that passed, except that the removed seat is
  gone from it, as `seat-budget`'s *A removed seat file always takes effect* (#171) says, and the
  condition names the failing file and check

### Requirement: A heartbeat declares its process's poll interval

A process SHALL have stood down and stopped its worker before any sibling counts it gone. It SHALL
count a sibling gone after three of the longest of its current interval and each the sibling
declared in heartbeats seen written since the later of its start and last detected loss or rollback,
or, with none seen, of `role-config`'s maximum poll interval alone; and stand down after two of the
shortest it has used. No process SHALL wait on, ask or signal another to settle which interval
applies.

#### Scenario: A sibling that declared a longer interval is waited for

- **WHEN** rank 1 runs on a poll interval of 10 minutes, and since rank 1 started it has seen
  rank 2's heartbeat written declaring 20 minutes
- **THEN** rank 1 counts rank 2 gone only once 60 minutes have passed without rank 2's heartbeat
  changing
- **AND** a heartbeat counts as seen written when its counter changes between two of rank 1's
  reads

#### Scenario: A process on the longer interval counts in its own

- **WHEN** rank 1 runs on a poll interval of 20 minutes, and since rank 1 started it has seen
  rank 2's heartbeat written only declaring 10 minutes
- **THEN** rank 1 counts rank 2 gone only once 60 minutes have passed without rank 2's heartbeat
  changing, three of its own interval

#### Scenario: A process that has seen no declaration counts in the maximum

- **WHEN** rank 1 has just started, or has just found a sibling's file missing after the state
  branch was lost, and has not yet seen rank 2's heartbeat written
- **THEN** rank 1 counts rank 2 gone only once 90 minutes, three of the 30-minute maximum, have
  passed without rank 2's heartbeat changing

#### Scenario: A process that moved to a longer interval stands down by the shorter

- **WHEN** a process started on a poll interval of 10 minutes and has since applied a commit that
  sets 20 minutes
- **THEN** it writes its heartbeat every 5 minutes, half of the 10 it has applied, and stands
  down after 20 minutes without writing one, not 40

#### Scenario: A watcher that lost a declaration still finds the sibling stood down

- **WHEN** the lore head has moved to 20 minutes and back to 10; rank 2 started on 20 and
  applied nothing since, while rank 1 ran on 10; rank 2 stops writing heartbeats; and the state
  branch is lost and rank 1 restarts, so it has seen no declaration from rank 2
- **THEN** rank 2 stands down and its timer stops its worker after 40 minutes, before rank 1
  counts it gone after 90, so only one process works the item

#### Scenario: Ranks on different poll intervals keep one worker per item

- **WHEN** rank 1 applies a commit that doubles the poll interval while rank 2 still runs on the
  commit before it, and rank 1 then fails to write its heartbeat
- **THEN** rank 1 stands down and its timer stops its worker before rank 2 counts it gone, so
  only one process works each item

### Requirement: A process detects a lost or rolled-back state branch from the heartbeat files

A process SHALL detect a loss or rollback of the state branch when a serving rank's file it had
read is missing; when a counter, in a sibling's file or its own, is lower than the one last read
under the same start id; or when its own file holds an older copy under its predecessor's start
id, the one it found there at its start. A sibling's new start id, or its earlier one brought
back, is a restart, not a loss; a run's file that goes missing is a run that ended or was counted
gone.

#### Scenario: A missing rank file is a loss

- **WHEN** rank 2's heartbeat file, which rank 1 had read, is missing from the state branch
- **THEN** rank 1 detects a loss, and counts rank 2 in the maximum until it next sees rank 2's
  heartbeat written

#### Scenario: A counter that goes back is a rollback

- **WHEN** rank 1 reads its own file, or rank 2's, and finds a counter lower than the one it last
  read there under the same start id
- **THEN** rank 1 detects a rollback

#### Scenario: A process's own predecessor's id coming back is a rollback

- **WHEN** rank 1 reads its own file and finds an older copy under the start id that file held
  when rank 1 started
- **THEN** rank 1 detects a rollback

#### Scenario: A sibling's id changing is a restart

- **WHEN** rank 1 reads rank 2's file under a start id other than the one it last read there,
  whether new or an earlier id brought back by a rollback
- **THEN** rank 1 reads a restart of rank 2 and detects no loss
- **AND** where the id is an earlier one a rollback brought back, the rollback costs rank 1 only
  forgetting what it knew of rank 2

#### Scenario: A run's missing file is not a loss

- **WHEN** the heartbeat file of an `igor run` goes missing
- **THEN** a process reads it as a run that exited or was counted gone, and detects no loss

### Requirement: Only the rank holding a claim gives it back

Where several processes run one role, a process SHALL remove the role's label only where its own
claim message holds the item; where another's holds it, it SHALL drop out silently, removing and
posting nothing. Exceptions: a stop on an unheld item, and the *failed-post exception*: a process
whose claim message failed to post SHALL remove the label it set in this claim where no message
counts, within half a settle interval of starting to set it, by its own monotonic clock, and
never later.

#### Scenario: A claim message that failed to post leaves no label behind

- **WHEN** a process sets the role's label on an unclaimed item, its claim message fails to post,
  and no other claim message on the item counts
- **THEN** it removes the label, sending the removal within half a settle interval of having
  started to set it

#### Scenario: A failed post that is slow leaves the label

- **WHEN** a process's claim message fails to post, its test finds no claim message that counts,
  and half a settle interval has passed since it started to set the label
- **THEN** it leaves the label, and any process claims the item at a later cycle as a labelled
  item with no claim message that counts
- **AND** it leaves the label likewise wherever no claim message counts and it did not just set
  the label

#### Scenario: A rank whose claim is no longer the holding one ends its run silently

- **WHEN** a process's run ends while another rank's claim message holds the item
- **THEN** it removes nothing and posts nothing, leaving the label to that rank

#### Scenario: The holder sets an item down

- **WHEN** a failure before the worker repeats for the rank whose claim message holds the item
- **THEN** that rank removes the label and says so on the item, as `pre-worker-breaker` (#173)
  says, which also says which failures count and who posts the set-down

### Requirement: A process whose claim may have failed tests who holds the item

A process whose claim message fails to post, or whose verification read fails or is late, SHALL
read the claim messages, its *test*. Where its own holds, it makes #173's out-loud give-back, a
*withdrawal*: just before removing the label and posting, it SHALL reread heartbeat files and
claim messages, and do both only if its own still holds and no other counts. Where none counts,
it SHALL post #173's refusal, after a failed post only within the bound on removing the label.
Otherwise it is silent.

#### Scenario: A failed verification by a rank that does not hold the item removes nothing

- **WHEN** ranks 1 and 2 both claim an item, rank 1's claim message holds it, and rank 2's
  verification fails
- **THEN** rank 2's test finds rank 1's message, so rank 2 leaves the label in place and posts
  nothing, and rank 1 works the item

#### Scenario: A failed verification by the holder is given back out loud

- **WHEN** rank 2 alone has claimed an item, its verification read fails, and its test finds its
  own claim message holding the item
- **THEN** it gives the claim back out loud as #173 says, and removes the label

#### Scenario: A withdrawal takes no claim that came after its test

- **WHEN** rank 2's test finds its own claim message alone on an item, and rank 1 then posts a
  claim message before rank 2 removes the label
- **THEN** rank 1 loses at its verification, since rank 2's message is earlier and counts
- **AND** rank 2's read before the removal sees rank 1's message, and rank 2 leaves the label

#### Scenario: A failed post's refusal is posted only within the bound

- **WHEN** a process's claim message fails to post, its test finds no claim message that counts,
  and half a settle interval has passed since it started to set the label
- **THEN** it posts no refusal and leaves the label, so the item keeps the label with no claim
  message counting, and the rank that claims it at a later cycle speaks
- **AND** a refusal after a failed verification, or after a reread, is posted whenever it comes

### Requirement: A test that cannot read the claim messages is read again

Where a process's test cannot read the claim messages, it SHALL remove and post nothing, and
read them again at its next cycle's start, before choosing any candidate, or for `igor run`
before it exits; the reread decides as the test does. Where it fails too, the claim is #173's
*unreadable claim*: the process SHALL give the claim back with #173's refusal, or, at the item's
third in a row, set the item down, leaving the role's label either way.

#### Scenario: A failed test is read again at the next cycle

- **WHEN** a process's verification read fails, and so does its test
- **THEN** it removes nothing and posts nothing on that run
- **AND** at its next cycle's start it reads the claim messages again, and gives the claim back
  out loud unless another process's message counts

#### Scenario: A reread that fails again still speaks

- **WHEN** a process's test failed, and its reread at the next cycle's start fails too
- **THEN** it gives the claim back with the post a refused run makes, and leaves the label

#### Scenario: A third unreadable claim sets the item down and keeps the label

- **WHEN** a process's test and reread of an item's claim messages both fail, and two earlier
  claims on the item ended the same way, with no read of its claim messages succeeding between
- **THEN** it sets the item down with #173's set-down post, and leaves the role's label on the
  item

#### Scenario: `igor run` rereads before it exits

- **WHEN** `igor run`'s test failed after its verification read failed
- **THEN** it reads the claim messages again before it exits, and gives the claim back as the
  reread decides

#### Scenario: A pending reread comes before the next choice

- **WHEN** a process has a reread of an item's claim messages pending from the last cycle
- **THEN** it makes that reread at the start of its next cycle, before it chooses any candidate,
  so it never takes its own rank's message for its predecessor's and re-works the item

### Requirement: A stop on a handed-over item is answered by its holder

A stop said on an item a person handed over SHALL be answered only by the rank whose claim
message holds the item, which halts its run and gives the claim back as any stop does; every
other rank SHALL ignore it. Where no claim message on the item counts, because no rank has
claimed it yet or its holder is gone, the process that reaches the item SHALL answer the stop.

#### Scenario: Only the holder answers a stop on a handed-over item

- **WHEN** a person hands an issue to `backend`, rank 2's claim message holds it and its worker
  runs, and the person says stop
- **THEN** rank 1 ignores the stop, and rank 2 halts its run at its next checkpoint, removes the
  label and posts the stop receipt

#### Scenario: A stop on a hand-over nobody has claimed

- **WHEN** a person hands an issue over and says stop before any rank's claim message is on it
- **THEN** the first rank to reach the item removes the label and posts the stop receipt

### Requirement: A stop waits for a holder that has stood down or found a second process

Where an item's holder has stood down, or stopped on finding a second process on its rank, label
removal and the stop receipt SHALL wait until it resumes and answers, or the first sibling reaching
the item after counting it gone answers, an exception to *Stop is unconditional and open to anyone*.
A sibling counts a stood-down holder gone as *A heartbeat declares its process's poll interval*
says, within 90 minutes of its file's last change; with no sibling or a second process, it is
unbounded.

#### Scenario: A stop waits for a holder that has stood down

- **WHEN** rank 2's claim message holds an item, rank 2 has stood down and its timer
  has stopped its worker, and a person says stop on the item
- **THEN** no worker runs on the item, and no rank removes the label or posts the stop receipt yet
- **AND** rank 2 answers the stop once a heartbeat lands and it resumes, or else the first sibling
  to reach the item after counting rank 2 gone answers it
- **AND** rank 1, serving the same role on 10 minutes and having seen rank 2 declare 10, counts
  rank 2 gone once it has watched rank 2's file unchanged for 30 minutes; at the 30-minute
  maximum, or with no declaration seen, 90 minutes

#### Scenario: A stop waits for a lone process that has stood down

- **WHEN** rank 1 is the only process serving `backend`, its claim message holds an item, it has
  stood down and its timer has stopped its worker, and a person says stop on the item
- **THEN** the stop waits until a heartbeat lands and rank 1 resumes and answers it

#### Scenario: A stop waits for a holder stopped as a second process

- **WHEN** two processes serve `backend-2`, both have stopped on finding the other writing the
  rank's file, and a person says stop on an item `backend-2`'s claim message holds
- **THEN** no worker runs on the item, and no rank removes the label or posts the stop receipt
- **AND** no sibling counts `backend-2` gone, since its file keeps changing
- **AND** once a person ends one of the two processes and the duplicate condition clears, three of
  the maximum poll interval later, the process that remains, which holds the rank's claims,
  answers the stop

### Requirement: A rank removed from the roster exits cleanly

A process that exits because the roster no longer declares its rank SHALL log that the roster no
longer declares rank `<rank>` of `<role>`, and SHALL then exit with status 0, which the systemd
unit that `stuck-conditions`' *A process that refuses to start exits with status 78* (#82)
specifies does not restart.

#### Scenario: A retired rank's unit is inactive and is not restarted

- **WHEN** the roster no longer declares rank 2 of `backend`, and `igor@backend-2` finishes its
  item and exits
- **THEN** it exits with status 0, systemd does not restart it, since the unit restarts a process
  only on a failure, and `systemctl status igor@backend-2` shows it inactive, with the line saying
  the roster no longer declares rank 2 of `backend` in its journal

#### Scenario: Under compose, a rank is retired by removing its service

- **WHEN** a rank runs under compose, which #82 has restart every exit, and the roster drops it
- **THEN** the operator retires it by removing its service, as #82 says (`docker compose up -d
  --remove-orphans`)

#### Scenario: Starting a retired rank again is refused

- **WHEN** a person starts `igor@backend-2` again while the roster still does not declare rank 2
- **THEN** it refuses to start, naming the ranks the roster declares, and exits with status 78
- **AND** systemd shows the unit as failed and does not restart it
