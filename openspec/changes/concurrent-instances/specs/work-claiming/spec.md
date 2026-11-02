## MODIFIED Requirements

### Requirement: Assignment expresses a claim; ordering resolves it

A claim SHALL set the tracker's native holder field, such as GitHub's `igor:<role>` label (a
list) or Linear's delegate, and then SHALL post the claim message. Resolution SHALL rely on the
storage order of writes, not on a conditional write: on a single-valued field the later write
holds the item, and on a list-valued one any other holder after the settle interval means the
claim is lost. Among one role's processes, *One role's earliest claim message since the item's
release holds it* decides.

#### Scenario: Claim visible in the native field

- **WHEN** an Igor claims an item on a tracker with a holder field
- **THEN** the holder field shows the Igor
- **AND** a human reading the tracker sees the claim without knowing any convention

#### Scenario: Holder field written before the claim message

- **WHEN** an Igor claims an item on a tracker with a holder field
- **THEN** it sets the holder field first and posts the claim message second

#### Scenario: Later write holds a single-valued field

- **WHEN** two Igors set a single-valued holder field on the same item within one settle interval
- **THEN** the Igor whose write the field still shows holds the item
- **AND** the other Igor has lost the claim

#### Scenario: Another holder in a list

- **WHEN** a re-read after the settle interval finds another holder in a list-valued holder field
- **THEN** the Igor has lost the claim

#### Scenario: No dependence on conditional writes

- **WHEN** a claim is taken on any tracker
- **THEN** correctness does not depend on a compare-and-set guarantee from that surface's API

### Requirement: A claim is verified after a settle interval

After claiming, an Igor SHALL wait a configurable settle interval, re-read the item, and stand
down if another party holds it, removing whatever still names it as holder and nothing naming
another party; on a single-valued field it SHALL only post a short reply handing the item back.
Standing down to its own role's process SHALL leave the holder field and post nothing (*Only the
rank holding a claim gives it back*). A person's hand-over skips the interval, except among one
role's ranks.

#### Scenario: Claim confirmed

- **WHEN** a re-read after the settle interval shows the Igor still holding the claim
- **THEN** work proceeds

#### Scenario: Claim lost to an earlier writer

- **WHEN** a re-read shows another party holds the item
- **THEN** the Igor stands down and performs no work
- **AND** the loss is recorded

#### Scenario: Losing Igor leaves a single-valued field alone

- **WHEN** an Igor loses a claim on a single-valued holder field
- **THEN** it does not clear or change the field
- **AND** it posts a reply saying it is handing the item back

#### Scenario: Losing Igor removes itself from a list

- **WHEN** an Igor loses a claim to another party on a holder field that holds a list, and no
  other process of its own role shares its entry
- **THEN** it removes its own entry and leaves every other holder in place

#### Scenario: A process that loses to its own role keeps the label on the item

- **WHEN** a process loses a claim to another process of its own role
- **THEN** it leaves the role's label in place and performs no work

#### Scenario: A re-read with no counting claim message keeps the label

- **WHEN** several processes run a role, and a process's re-read finds no claim message on the
  item that counts
- **THEN** it leaves the role's label in place, except as *A failed post's label and refusal are sent
  only within half a settle interval* allows, since it cannot tell that no rank holds the item

#### Scenario: Settle interval configurable

- **WHEN** an operator tunes the settle interval
- **THEN** the new value governs subsequent verification

#### Scenario: A stop said while the cycle worked another item

- **WHEN** a cycle chooses two items, and somebody says stop on the second while the Igor works
  the first
- **THEN** the claim on the second sees the stop, and the Igor stands down with a stop receipt,
  a reply on the item saying it stopped

#### Scenario: A stop answered by a go-ahead before the claim

- **WHEN** somebody says stop on an item the Igor's search found, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the claim holds and the run is not stopped by that stop

### Requirement: A person can direct an Igor through the holder field

Where a person sets the holder field to name an Igor, the Igor SHALL treat the item as directed to
it: on the next cycle that finds it, it SHALL post the claim message, naming itself and carrying the
stop instruction, and SHALL begin work with no settle interval against other Igors. Among its ranks,
*A hand-over among one role's ranks is contested like found work* decides which works it. A stop, or
anyone removing the Igor from the holder field, SHALL halt it at any time, as for any claim.

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
- **THEN** they decide which works it by the contest for found work, and only one starts work

### Requirement: A claim that cannot be kept is given back, out loud

Where a run holding a claim cannot go on, because its claim or a later step failed, the Igor SHALL
release the claim and say so on the item; where the release fails too, it SHALL say instead that
the item is still held, naming the one action that frees it. Among a role's ranks, which rank
gives a claim back, and when in silence, *Only the rank holding a claim gives it back* and *A
stood-down process tests and rereads no claim* decide.

#### Scenario: A finished run releases its claim

- **WHEN** a run publishes its work and finishes
- **THEN** the Igor releases its claim and leaves the artifact in place
- **AND** it does not close the item

#### Scenario: A claim that could not be announced is given back

- **WHEN** one process runs the role, a claim is recorded, and the message announcing it fails
- **THEN** the claim is released and the run is refused
- **AND** the item is not left held with nothing said

#### Scenario: A claim that could not be verified is given back and withdrawn

- **WHEN** one process runs the role, a claim was announced, and verifying it fails
- **THEN** the claim is released, the announcement is withdrawn on the item, and the run is refused

#### Scenario: A release that did not take is said so

- **WHEN** a claim cannot be kept and releasing it does not clear the holder
- **THEN** what is said names the item as still held rather than as released
- **AND** it names the action that frees it

#### Scenario: A failure after the claim hands the item back

- **WHEN** a run holding a claim fails at any point after taking it
- **THEN** the claim is handed back with an explanation on the item

#### Scenario: A cycle stops when the surface stops answering

- **WHEN** two runs in a row end because a surface did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: One run ending that way does not stop the cycle

- **WHEN** an item's run ends because a surface did not answer and the next item's run does not
- **THEN** the cycle continues and is not recorded as failed

#### Scenario: A refusal about the item does not stop the cycle

- **WHEN** a claim is refused because the tracker did not record it
- **THEN** the cycle continues to the remaining items

#### Scenario: A catch-up gives its claim back and keeps a person's label

- **WHEN** an Igor brings its own pull request up to date on an issue whose `igor:<role>` label a
  person added, and the run ends other than by a stop
- **THEN** the label is still on the issue afterwards
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

#### Scenario: A rank that finds no claim message holding the item gives it back out loud

- **WHEN** several processes run one role, and a process that finds no claim message holding the
  item cannot go on with its claim
- **THEN** it gives the claim back out loud, as *A failed post or verification is tested before the
  claim is given back* and *A refusal after a failed verification or a reread is posted whenever it
  comes* say, within the bound *A failed post's label and refusal are sent only within half a settle
  interval* sets where its own claim message failed to post

#### Scenario: A rank stood down for missed heartbeats keeps its claim in silence

- **WHEN** several processes run one role, and a process holding a claim has stood down for
  missed heartbeats
- **THEN** it says nothing on the item, and its claim stays in place
- **AND** a sibling that counts it gone takes the item over and says so, as *A retired rank does
  not hold its items forever* and *Taking over a gone rank's claim releases the item first* say

### Requirement: An item handed to an Igor waits for work already in flight

Where a person hands an item to an Igor through its holder field while the item has work in
flight, such as an open pull request, the Igor SHALL NOT claim it, but SHALL post, at the next
cycle that finds it and once while the work is open, a comment naming that work and saying it
takes the item up once the work closes. Once the work closes, the hand-over directs the Igor, as
*A person can direct an Igor through the holder field* says.

#### Scenario: Handed over while a pull request is open

- **WHEN** a person adds `igor:frontend` to a GitHub issue that an open pull request references
- **THEN** the `frontend` Igor does not claim it
- **AND** it posts one comment naming that pull request and saying it takes the issue up once
  the pull request closes

#### Scenario: Only one rank says it waits

- **WHEN** ranks 1 and 2 of `frontend` both find an issue a person handed over while an open pull
  request references it, and rank 2 is first in the issue's order
- **THEN** rank 2 posts the one comment, and rank 1 posts nothing

#### Scenario: The pull request closes

- **WHEN** the pull request closes and the `igor:frontend` label is still on the issue
- **THEN** on its next cycle the `frontend` Igor posts the claim comment and starts work
- **AND** where one process runs the role, it does not wait the settle interval; where several
  do, they decide which works the issue as *A hand-over among one role's ranks is contested like
  found work* says

#### Scenario: A handed-over run published, then failed

- **WHEN** an Igor working a handed-over item opens a pull request and then cannot finish
- **THEN** its handoff says what it published stands, and that handing the item over again once
  that pull request closes has it try again

#### Scenario: The Igor's own pull request that no longer merges gets no waiting comment

- **WHEN** a person hands an issue to an Igor while the Igor's own open pull request on it no
  longer merges
- **THEN** the Igor brings that pull request up to date as its own work on its own artifact, not
  as a claim of the hand-over
- **AND** it posts no comment saying it waits while that runs

### Requirement: A person reassigns an issue by removing the holding Igor's label first

Where a person adds an App Igor's `igor:<role>` label to a GitHub issue carrying another Igor's
`igor:` label, the labelled Igor SHALL NOT claim it, but SHALL post, at the next cycle that finds it
and once while the labels are unchanged, a comment naming the holder and saying removing its label
hands the issue over. The adapter SHALL tell a person's label by who added it, in the issue's
events. A label a person added SHALL NOT cost the holder its claim, even in the holder's settle
interval.

#### Scenario: Person labels a second Igor

- **WHEN** a person adds `igor:frontend` to a GitHub issue the `backend` Igor holds by its
  `igor:backend` label
- **THEN** the `frontend` Igor does not claim it, and posts one comment saying the `backend`
  Igor holds the issue and that removing `igor:backend` hands it over
- **AND** the `backend` Igor keeps the issue

#### Scenario: Person removes the holding Igor's label

- **WHEN** the person then removes `igor:backend`
- **THEN** the `backend` Igor halts, as for any stopped claim
- **AND** the `frontend` Igor posts the claim comment and starts work
- **AND** where one process runs the role, it does not wait the settle interval; where several
  do, they decide which works the issue as *A hand-over among one role's ranks is contested like
  found work* says

#### Scenario: A person's label during the holder's settle interval costs no claim

- **WHEN** the `backend` Igor has claimed a GitHub issue and is within its settle interval, and a
  person adds `igor:frontend`, as the issue's events show
- **THEN** the `backend` Igor keeps its claim, and the `frontend` Igor does not claim the issue

#### Scenario: Another Igor's own label is still a race

- **WHEN** an Igor finds another Igor's `igor:` label on an issue it is claiming, and the
  issue's events show that Igor added the label itself
- **THEN** the settle interval resolves the claim

### Requirement: What follows a stop is read from the tracker, not from a second command

After a stop, eligibility SHALL be read from the tracker's state. A stop releases the claim by
removing the Igor from the holder field, and what the item then shows decides what follows. A
stop cancels a hand-over, which only a new hand-over restores; a go-ahead or the cooldown lifts a
stop for work the Igor's own search found. A stop on a handed-over item SHALL be answered at the
next cycle even with no run active, as *A stop on a handed-over item is answered by the rank
holding it* says.

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
  "go ahead and pick it back up, @igor-backend"
- **THEN** the stop is lifted for the backend Igor only

#### Scenario: A go-ahead on its own line is bare

- **WHEN** somebody says stop on an item two Igors work, and somebody then says "go ahead:" with
  "thanks @igor-backend" on the next line
- **THEN** the stop is lifted for both Igors

#### Scenario: A go-ahead whose list runs on into the next clause

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @igor-backend, @igor-frontend keep waiting"
- **THEN** the stop is lifted for the backend Igor only

#### Scenario: A go-ahead whose run-on list loses its only Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @alice, @igor-frontend keep waiting", and `@alice` is a person
- **THEN** the stop is lifted for neither Igor

#### Scenario: A go-ahead that names only a person lifts the stop for every Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "carry on, @alice approved it", and `@alice` is a person
- **THEN** the stop is lifted for both Igors

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
- **THEN** on its next cycle the Igor removes the label and posts a stop receipt

#### Scenario: A hand-over after a stop lets the Igor's own catch-up run

- **WHEN** a person stops an Igor, then adds its `igor:<role>` label again while the Igor's own pull
  request on that issue no longer merges
- **THEN** the Igor brings that pull request up to date without waiting the cooldown

#### Scenario: A person removing the label is a stop that names them

- **WHEN** an Igor working a GitHub issue finds its `igor:<role>` label gone, and the latest
  `unlabeled` event for that label was made by anyone other than the Igor's own bot account
- **THEN** the Igor halts as for any stop
- **AND** its stop receipt names whoever removed the label

#### Scenario: The Igor's own removal is its release

- **WHEN** an Igor finds its `igor:<role>` label gone, and the latest `unlabeled` event for that
  label was made by the Igor's own bot account
- **THEN** the removal is the Igor's own release, and it posts no stop receipt

#### Scenario: A stop on a Linear issue handed over while nothing runs

- **WHEN** somebody stops an Igor on a Linear issue a person delegated to it, while no run of
  that Igor is active on it
- **THEN** on its next cycle the Igor removes itself as delegate and posts a stop receipt

#### Scenario: No second verb exists

- **WHEN** a party wishes to pause rather than stop
- **THEN** they issue a stop
- **AND** resumption follows from tracker state, with no separate pause command defined

### Requirement: An issue created from chat points back to the chat

An issue an Igor creates because a person instructed it in chat SHALL be on the claiming tracker,
where any claim on it is taken, with a description that links the chat message and MAY quote it,
and the Igor SHALL then post its link in the chat. It SHALL first search that tracker via the
adapter for an issue already linking the message; that search, not a record of handled
messages, SHALL prevent duplicates. Finding one, it SHALL post that issue's link only where
no reply in the chat has it.

#### Scenario: Instructed in chat

- **WHEN** a person in chat instructs an Igor to do work that has no issue
- **THEN** the Igor creates an issue on the claiming tracker whose description links the chat
  message
- **AND** it then posts the issue's link in the chat

#### Scenario: An issue links the message, and its link was never posted

- **WHEN** an Igor reads a chat message asking for work, an issue on the claiming tracker
  already links that message, and the chat has no reply with that issue's link
- **THEN** the Igor creates no issue for it
- **AND** it posts the issue's link in the chat

#### Scenario: An issue links the message, and its link is already posted

- **WHEN** an Igor reads a chat message asking for work, an issue on the claiming tracker
  already links that message, and the chat already has a reply with that issue's link
- **THEN** the Igor creates no issue and posts nothing

#### Scenario: Lost record of handled messages

- **WHEN** an Igor's record of which chat messages it has handled is lost or out of date, and
  it reads again a message it already made an issue from
- **THEN** it finds the issue that links the message and creates no second one

## ADDED Requirements

### Requirement: A chat message becomes an issue at the first available rank in its order

Where several processes run a role, every rank SHALL read the channel, but only the first
available rank, by its own heartbeat read, in a chat message's order (*Every item has an owner and
an order of ranks*, from the message's id) SHALL create an issue from it. With none available, the
message SHALL wait for a later cycle, and its first rank that is not gone SHALL answer it in the
chat with the time the role's seats next reset, as a mention with no rank available is
answered.

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
  seats next reset
- **AND** the message becomes an issue at a later cycle, once a rank is available

#### Scenario: A gone first rank's reset-time reply is sent by the next rank

- **WHEN** a chat message asks for work, no rank of the role is available, and rank 2, first in
  the message's order, is gone while rank 1, next in it, is not
- **THEN** rank 1 answers in the chat with the time the role's seats next reset, though it is not
  available

#### Scenario: A stale heartbeat read can open two issues

- **WHEN** a heartbeat read that is stale leads ranks 1 and 2 each to judge itself first for one
  chat message
- **THEN** each may create an issue from it, a rare duplicate that is accepted

### Requirement: A claim names the process that took it

A claim message SHALL carry the rank of the process that posted it, as `Igor-Rank: <rank>`, whether
or not the role runs several processes, and, where an `igor run` posted it, that run's id, as
`Igor-Run: <id>`. Verification SHALL treat a claim carrying another rank, or at rank 0 another run's
id, as another process's. A process's rank SHALL be given to it when it is started, as the last part
of its name, `<role>-<rank>`, which `role-config` specifies, and never discovered or counted.

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

### Requirement: A claim message counts only as the role's bot account wrote it

Claim messages SHALL be read only from comments the role's own bot account wrote, and their
trailers only from lines that begin with `Igor-`, in exactly that letter case, at the line's
first character. A comment the surface reports as edited, on GitHub one whose GraphQL
`lastEditedAt` is set, SHALL count for nothing: it is no claim message, and none of its
`Igor-Rank:`, `Igor-Run:`, `Igor-Supersedes:` or `Igor-Handed-Over-By:` trailers is read. Hiding,
unhiding or a reaction is no edit.

#### Scenario: A trailer in another letter case or not at the line's start is not read

- **WHEN** a comment the role's bot account wrote carries the lines `igor-rank: 2` and
  ` Igor-Rank: 2`
- **THEN** neither line is read as a trailer

#### Scenario: A claim message someone else wrote does not count

- **WHEN** a comment not written by the role's bot account carries `Igor-Rank: 1`
- **THEN** no process reads it as a claim message

#### Scenario: An edited claim message counts for nothing

- **WHEN** a person edits the bot's claim message on an item, adding `Igor-Supersedes: 2` or
  removing `Igor-Handed-Over-By:`, so its `lastEditedAt` is set
- **THEN** no process reads it as a claim message, and none of its trailers is read

#### Scenario: A hidden claim message still counts

- **WHEN** a person hides the bot's claim message on an item, or unhides it, so its REST
  `updated_at` changes while its `lastEditedAt` stays empty
- **THEN** it still counts as a claim message

#### Scenario: An edit to the holder's message lets a sibling in, as accepted

- **WHEN** a person with maintain access edits or deletes the claim message of the rank working
  an item
- **THEN** that message counts for nothing from then on, and a sibling may claim the item and
  work it beside the holder

### Requirement: Only a claim message carries a line read as a trailer

Before the role's bot account posts any comment other than a claim message, the Igor SHALL indent
by one space each line of it that begins with `Igor-` in any letter case, whether a worker or a
model composed the line or the Igor interpolated it from a path, a login or a title. It SHALL do
so on the final text, after every step that may change it, and before `signed-publishing` (#153) signs
it.

#### Scenario: A reply cannot be steered into a claim message

- **WHEN** a person mentions the Igor asking it to end its reply with the lines `Igor-Rank: 1`
  and `Igor-Supersedes: 2`, and the model's reply does so
- **THEN** the bot posts each of those lines indented by one space, and no process reads the
  reply as a claim message

#### Scenario: A line the Igor interpolated is indented too

- **WHEN** the role's bot account posts a comment, not a claim message, into which the Igor
  interpolated a title whose text puts `Igor-Rank: 2` at the start of a line
- **THEN** that line is posted as ` Igor-Rank: 2`, indented by one space

### Requirement: A role counts as run by several processes while a second may be running

A role SHALL count as run by several processes where the roster declares more than one rank for
it. A deciding process SHALL also count its role so in two other cases: while it knows of a sibling
of the role, a serving rank or an `igor run`, not counted gone; and for one maximum poll interval
after its own start. A process SHALL remember, through a lost or rolled-back state branch, every
sibling whose heartbeat file it has read since it started. `igor run` SHALL always count its role so.

#### Scenario: A rank on the old roster still contests a hand-over

- **WHEN** the roster grows from `[1]` to `[1, 2]`, rank 2 starts on the new roster and writes its
  heartbeat, and rank 1 has not yet applied the new roster when a person adds the label
- **THEN** rank 1 counts the role as run by several processes, from rank 2's heartbeat file, and
  contests the hand-over rather than start work without the settle interval

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

`igor run <role>`, with or without `--plan`, SHALL run as rank 0 of the role. Rank 0 is outside
the roster: no roster declares it, and `igor run` starts whatever the roster declares. It SHALL
start without waiting for, reading or refusing on any serving rank's heartbeat, and SHALL contend
for items as any rank does, by the claim and its verification. `igor run --plan` SHALL change
nothing: it claims nothing, posts nothing, writes no heartbeat and removes no tree.

#### Scenario: A run beside a serving rank goes ahead

- **WHEN** `igor@backend-1` is running and a person runs `igor run backend`, which picks the run
  id `r7k2m9x4`
- **THEN** the run starts at once as rank 0, without waiting, and writes
  `heartbeats/backend-0-r7k2m9x4.json` before its first cycle

#### Scenario: A run and a serving rank contend for one item

- **WHEN** `igor run backend` and rank 1 of `backend` both claim one item
- **THEN** each verifies its claim, the earliest claim message that counts holds the item, and only
  its process works it

#### Scenario: A run for a role whose roster declares no rank 1

- **WHEN** the roster lists `backend: [2, 3]` and a person runs `igor run backend`
- **THEN** the run starts as rank 0

#### Scenario: A plan changes nothing

- **WHEN** a person runs `igor run backend --plan` while `igor@backend-1` is running
- **THEN** the plan runs at once, writes no heartbeat, removes no tree and changes nothing

### Requirement: A run by hand spends only the token it was started with

`igor run` SHALL spend only the token in its environment's `IGOR_RUN_TOKEN`, as #171's
(`seat-files`) *`igor run` spends its own token as an implicit local seat* says. Its trees, home and
plugin directory are its own, as `task-execution` and #174 (`pinned-skills`) say, and at its start
it SHALL remove those of earlier runs of its role whose process is gone, as `task-execution`'s *A
run removes what a run whose process is gone left* says.

#### Scenario: A run by hand draws on no seat a serving rank uses

- **WHEN** `igor@backend-1` is running on a seat file's seat, and a person runs `igor run backend`
  with `IGOR_RUN_TOKEN` set
- **THEN** every model call the run makes spends the token in `IGOR_RUN_TOKEN`, and none spends
  the seat file's token

### Requirement: A run by hand keeps a heartbeat file of its own

Without `--plan`, each `igor run` SHALL write a heartbeat file of its own,
`heartbeats/<role>-0-<run id>.json`, as a serving process writes its own, from a timer firing
every half poll interval, its first write before its first cycle. Its siblings SHALL watch that
file as any rank's, and judge the run's claim messages gone by that file alone. A run SHALL remove
the file as it exits, and a serving process SHALL remove it once it counts that run gone.

#### Scenario: A crashed run's claim is recovered while another run goes on

- **WHEN** one of two `igor run backend`s crashes holding a claim, and the other keeps running
- **THEN** rank 1 takes the claim over once the crashed run's own heartbeat file has failed to
  change for three poll intervals, whatever the other run's file does

#### Scenario: A run's heartbeat file goes with it

- **WHEN** an `igor run backend` with the run id `r7k2m9x4` exits
- **THEN** it removes `heartbeats/backend-0-r7k2m9x4.json`; had it crashed instead, rank 1 would
  remove the file once it counted the run gone

### Requirement: A run by hand takes over no claim

`igor run` SHALL take over no claim, its own rank's included: it SHALL pass over every item its
role's label is on that carries a claim message posted since its latest release, whatever rank
posted it, gone or not, though it SHALL answer a stop said on such an item once none of the item's
claim messages counts (*A stop on a handed-over item is answered by the rank holding it*). *A
process recovers the claims of its own predecessor* SHALL NOT apply to rank 0.

#### Scenario: A run does not take over a claim

- **WHEN** `igor run backend` finds a labelled item, with no stop said on it, whose earliest claim
  message carries a rank that is gone, or rank 0, another `igor run`'s
- **THEN** it passes the item over and posts nothing on it

#### Scenario: A crashed run's claim is recovered by a serving rank

- **WHEN** an `igor run backend` with the run id `r7k2m9x4` crashes holding a claim, and rank 1
  has watched `heartbeats/backend-0-r7k2m9x4.json` fail to change for three poll intervals
- **THEN** rank 1 may take the item over, as for any gone rank's claim

#### Scenario: A run releases a gone process's claim on an unlabelled item first

- **WHEN** `igor run backend` claims an item with no label that carries the claim message of a
  process that is gone
- **THEN** it releases the item before posting its claim message, as *Taking over a gone rank's
  claim releases the item first* says for any process

### Requirement: Contention is resolved before a claim, not after it

A process SHALL attempt first the items it goes first for, as the first available rank, by its
own heartbeat read, in the item's order of ranks (*Every item has an owner and an order of
ranks*), then the rest, each group in the order discovery gave. Before claiming one of the rest,
it SHALL wait one settle interval for each available rank ahead of it in that order, re-read the
item, and claim it only where no claim that counts is on it, moving on otherwise without posting
anything.

#### Scenario: A rank that goes first does not wait

- **WHEN** rank 3 is the first available rank in an item's order
- **THEN** it claims the item without waiting a settle interval

#### Scenario: A rank waits behind the ranks ahead of it

- **WHEN** rank 2 attempts an item that rank 1 owns, and rank 1 is available
- **THEN** rank 2 waits one settle interval, re-reads the item, finds rank 1's claim, and posts
  nothing

#### Scenario: A run goes after every available serving rank

- **WHEN** ranks 1 and 2 of `backend` are available and `igor run backend` attempts an item
- **THEN** the run comes last in the item's order and waits two settle intervals before claiming it

#### Scenario: Two ranks that each judge themselves first

- **WHEN** a heartbeat read half a poll interval old leads ranks 1 and 2 each to judge itself
  first for one item, and both post a claim message
- **THEN** each verifies its claim, and only the rank whose message is earliest works the item

### Requirement: Every item has an owner and an order of ranks

Each item SHALL have an owner, the rank at place `h mod n` among its role's `n` declared ranks in
ascending order, where `h` is a hash of the item's id that every process computes alike, and an
order of ranks: the owner, each declared rank after it in ascending order, wrapping round to the
lowest, then rank 0, which owns no item. The first rank in that order that is available, as *A
rank is available only when it could take an item now* defines, goes first for the item.

#### Scenario: An item's owner takes it

- **WHEN** the roster declares ranks 1 to 4 for `backend`, an item's hash puts its owner at rank
  3, and rank 3 is available
- **THEN** rank 3 attempts the item first, and ranks 4, 1 and 2 wait behind it

#### Scenario: An owner that is busy is passed to the next available rank

- **WHEN** an item's owner is rank 3 of ranks 1 to 4, rank 3's heartbeat says it is not
  available, and rank 4's says it is
- **THEN** rank 4 goes first for the item

#### Scenario: A role the roster does not name has one owner

- **WHEN** the roster does not name the `reviewer` role
- **THEN** `n` is one for its items, and rank 1 owns every one of them

### Requirement: A hand-over among one role's ranks is contested like found work

Where several processes run a role, only its available ranks SHALL contend for an item a person
hands it, by the contest of *Contention is resolved before a claim, not after it*, each verifying
its claim after the settle interval. A takeover of a handed-over item keeps it handed over, as *A
claim message taking over a hand-over records who made it* says.

#### Scenario: The owner takes a hand-over

- **WHEN** a person adds `igor:backend` to an issue that rank 1 owns, and ranks 1 and 2 of
  `backend` are free
- **THEN** rank 1 posts its claim message at once, and rank 2, re-reading after one settle
  interval, finds it and posts nothing
- **AND** exactly one claim message appears

#### Scenario: A busy owner does not contend

- **WHEN** a person hands over an item that rank 1 owns while rank 1's worker is running and
  rank 2 is free
- **THEN** rank 1 does not contend, and rank 2, the next available rank, posts at once, verifies
  its claim after the settle interval, and works the item

#### Scenario: Two ranks that both post on a hand-over

- **WHEN** ranks 1 and 2 both post a claim message on a handed-over item before either sees the
  other's
- **THEN** each verifies after the settle interval, the earliest claim message that counts holds
  the item, and only its rank works it

#### Scenario: A taken-over hand-over still stands

- **WHEN** a rank takes over a handed-over item from a gone rank, removing the label and adding
  it again
- **THEN** its claim message records the hand-over, and the item is still read as handed over
  by a person

#### Scenario: A hand-over with no rank available waits

- **WHEN** a person hands an item to `backend` while no rank of `backend` is available
- **THEN** no rank contends for it, and the item waits for a later cycle

### Requirement: A claim message taking over a hand-over records who made it

A rank that takes over a handed-over item, removing the role's label and adding it again under
*Taking over a gone rank's claim releases the item first*, SHALL record in its claim message that
the item was handed over, naming whoever the message it took over records as handing it over,
else whoever added the label. The adapter SHALL read an item whose holding claim message records a
hand-over as handed over by a person, as it reads the person's label.

#### Scenario: A takeover names the person who handed the item over

- **WHEN** a person hands an issue to `backend`, rank 2 claims it and becomes gone, and rank 1
  takes the item over, removing the label and adding it again
- **THEN** rank 1's claim message records that the person handed the item over, naming them
- **AND** the adapter reads the item as handed over by that person, though the bot account added
  the label last

### Requirement: A process recovers the claims of its own predecessor

A claim whose holding message, the earliest claim message that counts, carries a serving
process's own rank SHALL be treated by that process as abandoned by its predecessor, and the item
re-worked from the beginning. Rank 0 recovers nothing (*A run by hand takes over no claim*).

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

A process that takes a claim left by its predecessor or a gone rank on an item with the Igor's
open pull request SHALL catch the item up, not re-work it: it updates the pull request where it
no longer merges (`task-execution`'s *A published artifact is kept mergeable*) and gives the
claim back, leaving the pull request open and a person's label on. Over a gone rank's claim it
SHALL, without a release, post and verify a claim message naming that rank, whose message then
counts for no process.

#### Scenario: A gone sibling's claim on an open pull request is caught up

- **WHEN** a process finds an item whose holding claim message carries a gone rank, and the
  Igor's pull request for the item is open
- **THEN** it posts its own claim message without releasing the item, catches the item up, and
  gives the claim back
- **AND** the item is neither skipped as work in flight nor re-worked

#### Scenario: A superseded claim does not count when its rank returns

- **WHEN** a process has taken over a gone rank's claim on an item with the Igor's pull request
  open, and the gone rank restarts
- **THEN** the gone rank's earlier claim message does not count, and the restarted rank leaves
  the item to the process that holds it

#### Scenario: A taken-over catch-up keeps a person's label

- **WHEN** a person added the role's label, and a process catches the item up over a gone rank's
  claim
- **THEN** the label is still on the item after the catch-up gives the claim back

#### Scenario: A caught-up pull request that still merges runs no worker

- **WHEN** a process takes such a claim, and the Igor's pull request still merges and carries no
  review to act on
- **THEN** it runs no worker and changes nothing on the item, which waits as any item with the
  Igor's pull request open does

#### Scenario: A caught-up pull request with a review to act on is resumed

- **WHEN** a process takes such a claim, and the Igor's pull request carries a review to act on
- **THEN** the holder resumes the item with a worker, as `work-triage`'s *A held pull request runs
  a worker only for a review to act on* says

### Requirement: A retired rank does not hold its items forever

A claim held by a rank past the abandonment bound SHALL be adoptable by any process of the role.
A rank is past the bound once the deciding process has itself watched that rank's heartbeat fail
to change for three poll intervals, each as long as *A heartbeat declares its process's poll
interval* says. Removing a rank from the roster SHALL NOT by
itself make the rank's claims adoptable: a rank missing from the roster is adoptable only once
it is past the bound.

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

#### Scenario: The bound does not shorten a run

- **WHEN** a process is working an item it holds for longer than three poll intervals
- **THEN** it keeps writing heartbeats, its rank is not gone, and no other process may take the
  item

### Requirement: Every process writes its heartbeat from a timer of its own

Every process SHALL run a timer of its own, apart from its cycle and any worker, that fires every
half poll interval and overwrites the process's own heartbeat file on the state branch, named by
its role and rank, and for `igor run` its run id. Its first heartbeat SHALL land before its first
cycle.

#### Scenario: The first heartbeat comes before the first claim

- **WHEN** a process starts
- **THEN** its heartbeat lands before its first cycle chooses a candidate

#### Scenario: A heartbeat replaces only its own rank's

- **WHEN** two ranks of one role write heartbeats at the same time, and the state branch rejects
  one because the other moved the branch first
- **THEN** the rejected one is retried, it overwrites only its own file, and both heartbeats are
  present afterwards

### Requirement: A heartbeat says who wrote it and holds no time any process compares

A heartbeat SHALL hold a *start id* the process chose at its start, a counter it raises at each
write, its host name and operating-system process number, even where the state branch is public,
whether it is available, the poll interval it applies, and the *state-directory id* of its state
directory, as `graceful-handoff` (#216, `lore-search`) defines it, or none where it reads none. It SHALL hold no time
that any process compares, and no claim rule SHALL read the state-directory id.

#### Scenario: A heartbeat names its state directory

- **WHEN** rank 2 of `backend` writes its heartbeat, and its state directory holds the
  state-directory id `k3m9q2x7`
- **THEN** `heartbeats/backend-2.json` records `k3m9q2x7` beside its id, counter, availability and
  poll interval

### Requirement: A rank written by two processes stops taking work

At each heartbeat firing, before it writes, a process SHALL read its own rank's file. Where,
between two such reads after its own first write, the counter under another start id has gone
up, it SHALL count a second process serving its rank, and SHALL stop taking new items, stop its
worker, keep its claim in silence as a stand-down does, and write itself as not available, until
the condition of *A second process on a rank raises a condition* clears, and then take items
again.

#### Scenario: A second process on one rank stops both

- **WHEN** two processes on hosts `a` and `b` both serve `backend-2`, and each reads the other's
  id in the rank's file advance between two of its reads
- **THEN** each stops taking new items and stops its worker, with a condition naming host `a`
  and host `b` and both process numbers

#### Scenario: A rolled-back branch is not a second process

- **WHEN** a rollback of the state branch restores an older copy of `backend-2`'s file, with the
  process's own id and a lower counter, or with its predecessor's id
- **THEN** the process reads a loss or rollback, as *A process detects a lost or rolled-back state
  branch from the heartbeat files* says, and raises no condition

### Requirement: A second process on a rank raises a condition

A process that finds a second process on its rank SHALL open a condition, of a kind of its own,
with the cure key `instance:<role>-<rank>:duplicate` on `worker-user`'s (#175) instance scope, naming each
writer's host and process number, and SHALL append a condition row to the execution log as it
opens and as it clears. The condition only records the stop and SHALL clear with no probe item at
the first firing after three maximum poll intervals in which no other start id advanced in the
file.

#### Scenario: The duplicate condition's opening and clearing are logged

- **WHEN** a process opens the condition for a second process on `backend-2`, and later clears it
- **THEN** the execution log holds a condition row appended as it opened and another appended as
  it cleared

#### Scenario: The duplicate condition clears once the other writer stops

- **WHEN** a person stops one of the two processes serving `backend-2`, and three of the maximum
  poll interval pass with no other start id advancing in the rank's file
- **THEN** the remaining process clears the condition and takes items again

#### Scenario: Two writers on one host name it once

- **WHEN** two processes on host `a` both serve `backend-2`
- **THEN** the condition names host `a` once, with both process numbers

### Requirement: A rank is available only when it could take an item now

A process SHALL count as available while, and only while, it is free, holding no claim, not stood
down, not stopped as a second process on its rank, not gone, its heartbeat file present, and with
a seat it can spend, as `seat-budget`'s *A role has a seat it can spend when the gate would choose
one now* (#143, `read-seat-windows-from-the-stream`) defines. Availability only decides which rank
goes first for an item.

#### Scenario: A rank with no seat to spend is not available

- **WHEN** every seat that serves rank 2's role is past its reserve line
- **THEN** rank 2's heartbeat says it is not available, and an item rank 2 owns goes first to the
  next available rank

### Requirement: A rank is gone only once its heartbeat has not changed for three poll intervals

A heartbeat SHALL count only when its file holds an id and counter other than those the reading
process last read from it, never by the sibling's clock or a time in the file; a missing file does
not change. A process SHALL keep in its own memory, for each sibling, the id and counter it last
read and the moment, by its own clock, it last saw them change, and SHALL count the sibling gone
only once three poll intervals have passed since then, or since its own start if that is later.

#### Scenario: A lost state branch takes no live rank's claim

- **WHEN** the state branch is lost or reset, taking every heartbeat file with it
- **THEN** each process keeps counting from the moment it last saw each sibling's heartbeat
  change
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
- **THEN** each heartbeat it writes still changes its file, and no process counts it gone

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

### Requirement: Heartbeats are read before each claim decision

A process SHALL read its role's heartbeat files before it chooses a candidate, and again before it
verifies a claim, reading all of them, with their contents, in as few requests as the API allows,
and SHALL judge each sibling's file changed by its blob id.

#### Scenario: A read from before a long run is not used after it

- **WHEN** a process has worked an item for longer than three poll intervals and goes on to its
  next candidate
- **THEN** it reads the heartbeat files again before choosing, and counts as gone no sibling
  that kept writing heartbeats

#### Scenario: A sibling that restarted during a claim counts

- **WHEN** a sibling restarts and posts a claim message on an item after this process chose it
- **THEN** this process reads the heartbeat files again before verifying, and counts the
  sibling's message

#### Scenario: Every heartbeat file in one read

- **WHEN** a process reads its role's heartbeat files
- **THEN** it reads all of them, with their contents, in as few requests as the API allows, and
  judges each sibling's file changed by its blob id

### Requirement: Taking over a gone rank's claim releases the item first

A process taking over an item whose earlier claim message no longer counts, because that message's
rank is gone, SHALL first release the item: on an item without the role's label it adds the label;
it then removes the label and adds it again. It SHALL then post its own claim message at once. An
item with the Igor's open pull request is taken over without a release, as *A claim left on the
Igor's open pull request is caught up* says.

#### Scenario: An adopted claim holds the item

- **WHEN** a process claims an item whose earlier claim message carries a rank that is gone
- **THEN** it removes the role's label and adds it again, and posts its own claim message at
  once
- **AND** the earlier message falls before the latest release, and the new claim holds the item
  unless its message landed in the release's second, when the item is claimed at a later cycle

#### Scenario: A gone rank's message on an unlabelled item is released first

- **WHEN** rank 1 held an item, set it down and removed the role's label; rank 2, partway through
  claiming the item, posted its claim message just after that removal, so the message falls after
  the item's latest release; rank 2 then stood down and is now gone; and at a later cycle rank 1
  claims the item again
- **THEN** rank 1 adds the label, removes it and adds it again before posting
- **AND** rank 2's message, now before the item's latest release, does not count when rank 2 returns

#### Scenario: A returning rank does not take back an adopted item

- **WHEN** a rank whose claim another process adopted restarts
- **THEN** its earlier claim message does not count, and it leaves the item to the process that
  holds it

### Requirement: A process whose heartbeats fail stands down in silence

A process SHALL stand down once it has failed to write its heartbeat for two poll intervals,
measured as *A process stands down before any sibling counts it gone* says, until one lands.
Standing down, it SHALL start no claim, and its heartbeat timer SHALL stop its worker at the next
firing, without waiting for an event. It SHALL keep its claims in silence, an exception to *A
claim that cannot be kept is given back, out loud* and to `graceful-handoff`'s rule against
silence after a claim.

#### Scenario: A process that cannot write its heartbeat stands down

- **WHEN** a process has failed to write its heartbeat for two poll intervals
- **THEN** it starts no claim, and its timer stops its worker at its next firing, leaving the
  claim
- **AND** once a heartbeat lands, it resumes

#### Scenario: A silent worker is still stopped by the timer

- **WHEN** a process stands down while its worker runs a tool that produces no event for longer
  than a poll interval
- **THEN** the timer stops the worker within half a poll interval of the stand-down, without
  waiting for an event

### Requirement: A process reads the roster each cycle and retires when it leaves it

A process SHALL read the roster at each cycle's start from the lore commit it applies then
(`lore-pull`'s *Processes apply new commits independently*, #208), no rule depending on ranks
agreeing on it. A process whose rank the roster no longer declares SHALL start no claim, finish
the item in hand or hand it off out loud as on a stop request (`work-discovery`'s *Shutdown
finishes the item in hand*), and exit under *A rank removed from the roster exits cleanly*,
writing heartbeats until then.

#### Scenario: A process whose rank leaves the roster shuts down

- **WHEN** the roster no longer declares a running process's rank while its worker runs
- **THEN** it starts no claim, finishes the item or hands it off out loud, and then exits with
  status 0

#### Scenario: Ranks on different rosters keep one worker per item

- **WHEN** rank 1 has applied a commit whose roster drops rank 2 while rank 2 still runs on the
  commit before it
- **THEN** each decides by the commit it applied, and the claim and its verification still let
  only one process work each item

### Requirement: A configuration that fails a check at a cycle is refused without exiting

Where the configuration a process reads at a cycle's start fails a check a starting process makes
on it, the process SHALL go on, without exiting, under the last configuration that passed, roster
included, and SHALL raise `lore-pull`'s (#208) `lore:config:<role>` condition, shared by the role, naming
the failing file and check; a later read that passes SHALL take effect. A check that fails because
GitHub did not answer, or refused the App's credential, refuses nothing, as `lore-pull` says.

#### Scenario: A roster that fails a check at a cycle is refused

- **WHEN** a process reads `igor.config.yaml` at the start of a cycle, and its roster lists one
  rank twice
- **THEN** the process goes on under the last configuration that passed, and does not exit
- **AND** `lore:config:<role>` names `igor.config.yaml` and the failing check, until a read
  clears it as #208 says, such as a passing read of a commit descending from the refused one

#### Scenario: A check GitHub did not answer refuses nothing

- **WHEN** a check a process makes on its configuration at a cycle's start fails because GitHub
  did not answer, or refused the App's credential
- **THEN** the process does not refuse the configuration for that check

### Requirement: A dropped rank or a removed seat file is not a failed check at a cycle

Whether the roster declares the process's own rank SHALL NOT be one of the checks a cycle's read
of the configuration makes: a read whose roster drops the rank passes, and the rank retires (#208,
`lore-pull`). Where the configuration includes seat files, as under #171, a seat file the read
finds removed SHALL take effect even where the read is refused, as `seat-budget`'s *A removed seat
file always takes effect* (#171) says.

#### Scenario: A roster that drops the rank is not refused

- **WHEN** a process of rank 2 reads, at the start of a cycle, a roster that no longer declares
  rank 2 and passes every other check
- **THEN** the read passes, and the process shuts down as a retired rank does

#### Scenario: A removed seat file takes effect even in a refused read

- **WHEN** a process reads its configuration at the start of a cycle, the read fails a check, and
  it finds a seat file removed
- **THEN** it goes on under the last configuration that passed, except that the removed seat is
  gone from it, and the condition names the failing file and check

### Requirement: A heartbeat declares its process's poll interval

Each heartbeat SHALL declare the poll interval its process applies. A process SHALL measure each of
the three poll intervals after which it counts a sibling gone as the longest of its own current poll
interval and every interval that sibling declared in a heartbeat this process saw written, its
counter changing between two reads, since the later of its own start and the last loss or rollback
of the state branch it detected. With none seen, each SHALL be `role-config`'s maximum poll
interval.

#### Scenario: A sibling that declared a longer interval is waited for

- **WHEN** rank 1 runs on a poll interval of 10 minutes, and since rank 1 started it has seen
  rank 2's heartbeat written declaring 20 minutes
- **THEN** rank 1 counts rank 2 gone only once 60 minutes have passed without rank 2's heartbeat
  changing

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

### Requirement: A process detects a lost or rolled-back state branch from the heartbeat files

A process SHALL detect a loss or rollback of the state branch where a serving rank's heartbeat file
it had read is missing, where a counter in a sibling's file or its own is lower than the one it last
read under the same start id, or where its own file holds an older copy under its predecessor's
start id, found there at its start. A sibling's new start id, or an earlier one brought back, SHALL
count as a restart, and a run's missing file as its exit or its being counted gone, not as a loss.

#### Scenario: A counter that goes back is read as a loss or rollback

- **WHEN** rank 1 reads rank 2's file under the start id it last read there, with a counter lower
  than the one it last read
- **THEN** rank 1 detects a loss or rollback, and counts rank 2 in the maximum poll interval until
  it sees a heartbeat of rank 2's written

#### Scenario: A sibling's new start id is a restart, not a loss

- **WHEN** rank 1 reads rank 2's file holding a start id other than the one it last read there
- **THEN** rank 1 reads a restart of rank 2 and detects no loss or rollback

#### Scenario: A run's missing heartbeat file is not a loss

- **WHEN** the heartbeat file of an `igor run` that rank 1 had read goes missing
- **THEN** rank 1 reads the run as exited or counted gone, and detects no loss or rollback

### Requirement: A process stands down before any sibling counts it gone

A process SHALL have stood down and stopped its worker before any sibling counts it gone. It SHALL
measure each of the two poll intervals after which it stands down as the shortest poll interval it
has applied since it started, and SHALL write its heartbeat every half of its own current poll
interval. No process SHALL wait on, ask or signal another to settle which interval applies.

#### Scenario: A process that moved to a longer interval stands down by the shorter

- **WHEN** a process started on a poll interval of 10 minutes and has since applied a commit that
  sets 20 minutes
- **THEN** it writes its heartbeat every 10 minutes, and stands down after 20 minutes without
  writing one, not 40

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

### Requirement: Only the rank holding a claim gives it back

Where several processes run a role, a process SHALL remove the role's label from an item only
where its own claim message holds it, the earliest counting claim message carrying its rank,
whether it sets the item down as #173's `pre-worker-breaker` says, answers a stop or ends a run. A
process finding another process's message holding the item SHALL drop out silently, removing nothing,
posting nothing and leaving the label, an exception to *A claim that cannot be kept is given back,
out loud*.

#### Scenario: A failed verification by a rank that does not hold the item removes nothing

- **WHEN** ranks 1 and 2 both claim an item, rank 1's claim message holds it, and rank 2's
  verification fails
- **THEN** rank 2's test finds rank 1's message, so rank 2 leaves the label in place and posts
  nothing, and rank 1 works the item

#### Scenario: The holder sets an item down

- **WHEN** a failure before the worker repeats for the rank whose claim message holds the item
- **THEN** that rank removes the label and says so on the item, as `pre-worker-breaker` (#173)
  says

### Requirement: A failed post or verification is tested before the claim is given back

A process whose claim message fails to post, or whose verification read fails, SHALL read the item's
claim messages (#173's *test*) and drop out silently where another process's message counts. Where
only its own counts, it SHALL withdraw, giving the claim back out loud and removing the label.
Immediately before both, it SHALL read heartbeats and claim messages again, and withdraw only where
its own still holds and no other counts, dropping out silently where another's counts.

#### Scenario: A failed verification by the holder is given back out loud

- **WHEN** rank 2 alone has claimed an item, its verification read fails, and its test finds its
  own claim message holding the item
- **THEN** it gives the claim back out loud as #173 says, and removes the label

#### Scenario: A withdrawal takes no claim that came after its test

- **WHEN** rank 2's test finds its own claim message alone on an item, and rank 1 then posts a
  claim message before rank 2 removes the label
- **THEN** rank 1 loses at its verification, since rank 2's message is earlier and counts
- **AND** rank 2's read before the removal sees rank 1's message, and rank 2 leaves the label

#### Scenario: A failed verification with no claim counting is refused out loud

- **WHEN** a process's verification read fails, and its test finds no claim message on the item
  that counts
- **THEN** it posts `pre-worker-breaker`'s refusal, however long after the label that comes, and
  leaves the label

### Requirement: A claim whose test read fails is read again before the next choice

Where a process's test read fails too, it SHALL remove nothing and post nothing, and SHALL read the
claim messages again at its next cycle's start, before choosing any candidate, or before it exits
for `igor run`, deciding as the test does. Where that reread fails again, the claim is
`pre-worker-breaker`'s (#173) *unreadable claim*: the process SHALL post the refusal, or the set-down at
the item's third unreadable claim in a row, and SHALL leave the role's label on the item.

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
- **THEN** it makes that reread at the start of its next cycle, before it chooses any candidate

### Requirement: A failed post's label and refusal are sent only within half a settle interval

A process whose claim message failed to post, and whose test finds no claim message that counts,
SHALL post its refusal, and remove the role's label where it set it in this claim, only while less
than half a settle interval has passed, by its own monotonic clock, since it started to set the
label, an exception to *Only the rank holding a claim gives it back*. In every other case, as after
a failed verification or reread, a process whose test finds none counting SHALL leave the label.

#### Scenario: A claim message that failed to post leaves no label behind

- **WHEN** a process sets the role's label on an unclaimed item, its claim message fails to post,
  and no other claim message on the item counts
- **THEN** it removes the label, sending the removal within half a settle interval of having
  started to set it

#### Scenario: A failed post that is slow leaves the label

- **WHEN** a process's claim message fails to post, its test finds no claim message that counts,
  and half a settle interval has passed since it started to set the label
- **THEN** it leaves the label, and the item is claimed at a later cycle

#### Scenario: A failed post that is slow posts nothing

- **WHEN** a process's claim message fails to post, its test finds no claim message that counts,
  and half a settle interval has passed since it started to set the label
- **THEN** it posts no refusal, and the rank that claims the item at a later cycle speaks for it

### Requirement: A refusal after a failed verification or a reread is posted whenever it comes

Where the *test* finds no claim message counting, the process SHALL post the *refusal*. A refusal
that follows a failed verification read, or a reread under *A claim whose test read fails is read
again before the next choice*, SHALL be posted out loud however long after the label it comes. Only
the refusal after a claim message that failed to post, from its test, takes the bound of *A failed
post's label and refusal are sent only within half a settle interval*.

#### Scenario: A reread's refusal is posted however late

- **WHEN** a process's claim message failed to post and its test read failed, and at its next
  cycle's start its reread finds no claim message on the item that counts
- **THEN** it posts the refusal, though more than half a settle interval has passed since it
  started to set the label, and leaves the label

### Requirement: A stood-down process tests and rereads no claim

A process that has stood down for missed heartbeats, under *A process whose heartbeats fail stands
down in silence*, SHALL make none of the test, withdrawal, refusal or reread that *A failed post or
verification is tested before the claim is given back*, *A refusal after a failed verification or a
reread is posted whenever it comes* and *A claim whose test read fails is read again before the next
choice* require, and SHALL keep its claim in silence.

#### Scenario: A stood-down process leaves a failed verification unanswered

- **WHEN** a process's verification read fails while it has stood down for missed heartbeats
- **THEN** it reads no claim messages for its test, removes nothing and posts nothing, and keeps
  its claim in silence

### Requirement: A stop on a handed-over item is answered by the rank holding it

A stop said on an item a person handed over SHALL be answered only by the rank whose claim message
holds the item, which halts its run and gives the claim back as any stop does; every other rank
SHALL ignore it. Where no claim message on the item counts, because no rank has claimed it or its
holder is gone, the process that reaches the item SHALL answer the stop, an exception to *Only the
rank holding a claim gives it back*.

#### Scenario: Only the holder answers a stop on a handed-over item

- **WHEN** a person hands an issue to `backend`, rank 2's claim message holds it and its worker
  runs, and the person says stop
- **THEN** rank 1 ignores the stop, and rank 2 halts its run at its next checkpoint, removes the
  label and posts the stop receipt

#### Scenario: A stop on a hand-over nobody has claimed

- **WHEN** a person hands an issue over and says stop before any rank's claim message is on it
- **THEN** the first rank to reach the item removes the label and posts the stop receipt

### Requirement: A rank removed from the roster exits cleanly

A process that exits because the roster no longer declares its rank SHALL log that the roster no
longer declares rank `<rank>` of `<role>`, and SHALL then exit with status 0, which the systemd
unit of `stuck-conditions`' *A process that refuses to start exits with status 78* (#82,
`stopped-scope-visible`) does not restart. Under compose, which restarts every exit, a rank is retired by removing its service
(`docker compose up -d --remove-orphans`), as that requirement says.

#### Scenario: A retired rank's unit is inactive and is not restarted

- **WHEN** the roster no longer declares rank 2 of `backend`, and `igor@backend-2` finishes its
  item and exits
- **THEN** it exits with status 0, systemd does not restart it, and `systemctl status
  igor@backend-2` shows it inactive, with the line saying the roster no longer declares rank 2 of
  `backend` in its journal

#### Scenario: Starting a retired rank again is refused

- **WHEN** a person starts `igor@backend-2` again while the roster still does not declare rank 2
- **THEN** it refuses to start, naming the ranks the roster declares, and exits with status 78
- **AND** systemd shows the unit as failed and does not restart it

### Requirement: One role's earliest claim message since the item's release holds it

Among one role's processes the earliest claim message SHALL hold the item, ordered by the
surface's own sequence key, never by timestamp. Only messages later than the item's latest
release, the latest removal of the role's label in its label events, SHALL count, judged
by timestamp, so one in the release's second does not, though no process SHALL wait that second
out to post. Messages of gone ranks never count (*A rank is gone only once its heartbeat has not changed for
three poll intervals*).

#### Scenario: A claim message from before a release does not count

- **WHEN** an item was released and then claimed again by processes of one role
- **THEN** only claim messages posted since the release are compared

#### Scenario: A claim message in the release's second does not count

- **WHEN** an item's latest release and a claim message on it carry the same second
- **THEN** that claim message does not count
- **AND** the process that posted it works nothing, and the item is claimed at a later cycle

#### Scenario: Claims written in the same second still order

- **WHEN** two processes of one role claim one item and the surface reports both claim messages
  at the same timestamp
- **THEN** the surface's sequence key decides, and exactly one claim stands

#### Scenario: A claim in the release's second is posted without waiting

- **WHEN** a process of a role claims an item in the same second as the role's label was last
  removed from it, the item's latest release
- **THEN** it posts its claim message without waiting for that second to pass
- **AND** the message, posted in the release's second, does not count, and the item is claimed at a
  later cycle

### Requirement: A claim re-read more than one poll interval after its message works nothing

The re-read after the settle interval SHALL come within one poll interval of the claim message. A
process that reaches it later SHALL NOT work the item, even where its own message holds it, and
gives the claim back as *A failed post or verification is tested before the claim is given back* and
*A refusal after a failed verification or a reread is posted whenever it comes* say of a failed
verification, removing the label only where its own message holds the item.

#### Scenario: A late verification works nothing

- **WHEN** a process reaches the re-read more than one poll interval after posting its claim
  message, and its own message holds the item with no other process's message counting
- **THEN** it performs no work, gives the claim back out loud, and, where a fresh read just
  before the removal still shows its own message holding the item, removes the label

### Requirement: A claim's re-read sees a stop said since the item was read

The re-read after the settle interval SHALL look for a stop said since the cycle that chose the
item read it, or, for an item a person handed over, since the hand-over. For an item the Igor's
own search found, a go-ahead later in the comments than the latest stop lifts it, and the run
that follows SHALL NOT be stopped by the stop the claim saw lifted. For a handed-over item the
stop stands.

#### Scenario: A go-ahead does not lift a stop on a handed-over item at the claim

- **WHEN** a person hands an item to an Igor, and somebody says stop on it and then go ahead,
  both before the Igor's re-read
- **THEN** the stop stands, and the Igor does not work the item

### Requirement: Giving a claim back never takes back a person's hand-over

Where a person put the Igor in the holder field, as by adding its `igor:<role>` label, and the
run is the Igor bringing its own artifact up to date rather than answering that hand-over,
releasing the claim SHALL leave that holder entry in place: the catch-up is not a claim of the
hand-over (*An item handed to an Igor waits for work already in flight*). A stop is the
exception, removing the Igor from the holder field as every stop does.

#### Scenario: A catch-up on a delegated Linear issue keeps the delegation

- **WHEN** an Igor brings its own pull request up to date on a Linear issue a person delegated to
  it, and the run ends other than by a stop
- **THEN** the Igor is still the issue's delegate afterwards

### Requirement: Two runs in a row that a surface did not answer stop the cycle

A run holding a claim that cannot go on because a tracker or host did not answer SHALL be told
apart from a refusal about the item itself. After two such runs in a row, the cycle SHALL stop and
attempt none of its remaining items; a cycle that met one and then ran an item cleanly did not
fail, and SHALL NOT be recorded as failed.

#### Scenario: A tracker and then a host not answering stop the cycle

- **WHEN** one item's run ends because the tracker did not answer, and the next item's run ends
  because the host did not answer
- **THEN** the cycle stops, and its remaining items are not attempted

### Requirement: A write to a surface answers with what the surface recorded

Where the Igor asks a surface to say or to release something, the answer SHALL carry what was
recorded, not merely that no error was raised.

#### Scenario: A release answers with what the tracker recorded

- **WHEN** the Igor asks a tracker to release a claim
- **THEN** the answer carries what the tracker recorded for the holder field, not only that no
  error was raised

### Requirement: A handed-over run that published and then failed says how to have it try again

Where a handed-over item's run published work and then could not finish, its handoff post, the
comment it leaves as it stops (`graceful-handoff`), SHALL say that what it published stands and
that, once that work closes, handing the item over again has the Igor try again. The handoff
SHALL NOT suggest handing the item over again while that work is still open.

#### Scenario: The handoff after a published run does not suggest handing over while it is open

- **WHEN** an Igor working a handed-over item opens a pull request and then cannot finish
- **THEN** its handoff does not suggest handing the item over again while that pull request is
  open

### Requirement: A go-ahead lifts a stop only for the Igors it names

A go-ahead SHALL be read for whom it is meant as a stop is. One that names no Igor lifts the stop
for every Igor on the item; one that names Igors, as "go ahead @igor-backend", SHALL lift it only
for those, and SHALL NOT lift it for an Igor it does not name. A name that is no Igor's counts as
no name, as in a stop, and a name the tracker cannot resolve counts as an Igor's.

#### Scenario: A go-ahead naming a name the tracker cannot resolve lifts no other Igor's stop

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @igor-old", a name the tracker cannot resolve
- **THEN** the stop is lifted for neither Igor

### Requirement: A go-ahead's names are read from its opening line

A go-ahead with no Igor's name straight after the phrase SHALL count the mentions later on its
opening line, but SHALL NOT read them past a line break straight after the phrase's punctuation or
the list's last separator. A list of names that runs straight on into a word SHALL lose its last
name, whether the go-ahead reads the names after its phrase or later on its line. Whether it names
an Igor is read before that loss, so one whose only Igor is the name it loses lifts the stop for no
Igor.

#### Scenario: A run-on list later on the line loses its last name

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead and pick it up, @igor-backend, @igor-frontend keep waiting"
- **THEN** the stop is lifted for the backend Igor only

### Requirement: On GitHub, a label removed by anyone but the Igor's own bot account is a stop

On GitHub, an Igor that finds its `igor:<role>` label gone SHALL read the latest `unlabeled`
event for that label in the issue's events. Made by the Igor's own bot account, the removal was
its own release; made by anyone else, it is a stop by that person, and the Igor SHALL halt with a
stop receipt that names them. Among several processes of one role, a removal by the role's bot
account is a release by one of its ranks, and SHALL NOT halt a worker another rank is running.

#### Scenario: A sibling rank's release halts no running worker

- **WHEN** several processes run `backend`, and rank 2, whose worker runs on an issue, finds
  `igor:backend` gone with the latest `unlabeled` event made by the role's own bot account
- **THEN** rank 2 does not halt its worker

### Requirement: A passed-over rank keeps the read marker before an unanswered chat message

Among one role's processes, only the rank *A chat message becomes an issue at the first
available rank in its order* names SHALL search for an issue linking a chat message, create the
issue and post its link. A rank passing over the message because another is first in its order
SHALL NOT move the channel's read marker past it until it has an answer: an issue linking it, or
a reply to it in the chat from the role's bot account. No rank SHALL answer a message that
already has one.

#### Scenario: A passed-over rank holds the read marker until the message is answered

- **WHEN** rank 1 reads a chat message asking for work, rank 2 is first in its order and rank 1
  next, and the
  message has neither an issue linking it nor a reply from the role's bot account
- **THEN** rank 1 does not move the channel's read marker past the message
- **AND** if rank 2 is counted gone or unavailable before answering, rank 1 finds itself first at
  a later cycle, reads the message again and answers it

#### Scenario: A chat message the role's bot account has answered is not answered again

- **WHEN** a rank reads a chat message to which the role's bot account has already replied in
  the chat
- **THEN** the rank does not answer it again

#### Scenario: Only the first rank posts the link of an existing issue

- **WHEN** ranks 1 and 2 read a chat message whose order puts rank 2 first, an issue already
  links the message, and the chat has no reply with that issue's link
- **THEN** only rank 2 posts the link, and rank 1 posts nothing

### Requirement: Only the first available rank says another Igor holds the issue

Where several processes run the role, only the first available rank in the item's order (*Every
item has an owner and an order of ranks*) SHALL post the comment *A person reassigns an issue by
removing the holding Igor's label first* or *An item handed to an Igor waits for work already in
flight* requires, and every other rank SHALL pass the item over.

#### Scenario: Only one rank says another Igor holds the issue

- **WHEN** ranks 1 and 2 of `frontend` both find an issue a person labelled `igor:frontend` while
  `igor:backend` holds it, and rank 1 is first in the issue's order
- **THEN** rank 1 posts the one comment, and rank 2 posts nothing

### Requirement: A finished run releases its claim and leaves its work in place

A run that finishes SHALL release its claim, leaving its artifact in place and the item open. No
setting of the role SHALL change this.

#### Scenario: A finished run's pull request stays open after its release

- **WHEN** a run publishes a pull request and finishes
- **THEN** the Igor releases its claim on the item
- **AND** the pull request and the item both stay open
