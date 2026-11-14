# work-claiming Specification

## Purpose
Keep an Igor from working an item someone else holds, and let any person take an item back from
an Igor at once. An Igor claims on the tracker before it starts, by setting the holder field
people read, and stands down if, after a settle interval, the tracker shows another holder has
won the item. This spec also covers stop, which anyone can issue and which releases the claim
immediately; what makes an item eligible again after a stop; releasing the claim, with a comment
on the item, when a run fails or finishes (what a handoff says is `graceful-handoff`); and a
person directing an item to an Igor by naming it in the holder field. On GitHub the holder field
is the `igor:<role>` label.
## Requirements
### Requirement: An Igor claims before it starts

Every pickup SHALL take a claim on the tracker before any work begins. An Igor MUST NOT produce
an artifact for an item it has not claimed. This rule MUST NOT be configurable.

#### Scenario: Claim precedes work

- **WHEN** triage returns proceed for an item
- **THEN** a claim is taken before the worker is invoked

#### Scenario: Unclaimed work refused

- **WHEN** a claim cannot be taken for any reason
- **THEN** no work is performed on that item

#### Scenario: Rule not overridable

- **WHEN** configuration attempts to disable claiming
- **THEN** validation fails, because claiming is the coordination mechanism the system exists to provide

### Requirement: Assignment expresses a claim; ordering resolves it

Every claiming tracker offers a native holder field; assignment here means that field. A claim
SHALL set the holder field and then SHALL post the claim message; the message names the Igor and
carries the stop instruction. Resolution SHALL rely on the storage order of writes, not on any
conditional-write primitive.

Where the holder field holds a single value, the later of two writes holds the item. Where it holds
a list, any other holder present after the settle interval means the claim is lost.

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
down if another party holds it. Standing down MUST remove whatever still names the Igor as
holder, and MUST NOT remove anything naming another party. On a single-valued holder field the
losing Igor posts a short reply saying it is handing the item back, and changes nothing else.
The settle interval does not apply to an item a person handed to the Igor.

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

- **WHEN** an Igor loses a claim on a holder field that holds a list
- **THEN** it removes its own entry and leaves every other holder in place

#### Scenario: Settle interval configurable

- **WHEN** an operator tunes the settle interval
- **THEN** the new value governs subsequent verification

### Requirement: A claim's re-read looks for stops since its cycle read the item

The re-read that verifies a claim SHALL look for a stop said since the cycle that chose the item
read it, or, for a handed-over item, since the hand-over. For an item the Igor's own search found, a
go-ahead later in the comments than the latest stop lifts that stop, and the run that follows SHALL
NOT be stopped by the stop the claim saw lifted. A handed-over item, re-read for stops though it
waits no settle interval, stays stopped despite a go-ahead, as the stop cancelled the hand-over.

#### Scenario: A stop said while the cycle worked another item

- **WHEN** a cycle chooses two items, and somebody says stop on the second while the Igor works
  the first
- **THEN** the claim on the second sees the stop, and the Igor stands down with a receipt

#### Scenario: A stop answered by a go-ahead before the claim

- **WHEN** somebody says stop on an item the Igor's search found, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the claim holds and the run is not stopped by that stop

### Requirement: Stop is unconditional and open to anyone

A stop directed at an Igor SHALL take effect at once, release the claim, and MUST NOT be gated
by identity, permission, authorization or configuration.

#### Scenario: Anyone can stop an Igor

- **WHEN** any party issues a stop for a claimed item
- **THEN** the Igor releases the claim and ceases work on it
- **AND** no permission check is performed

#### Scenario: Stop cannot be disabled

- **WHEN** configuration attempts to restrict who may stop an Igor
- **THEN** validation fails, because stop fails safe and must remain available

#### Scenario: Stop is recorded

- **WHEN** a stop is honoured
- **THEN** the record names who issued it and when

### Requirement: A stop is directed at the Igors it names, or at every Igor if it names none

A comment is a stop directed at an Igor when it opens with "stop" and names no Igor, or when it says
"stop" and names that Igor, as "stop @igor-backend" and "@igor-backend stop" do. No other comment is
a stop. A stop that names an Igor SHALL NOT stop an Igor it does not name, or take off that Igor's
holder entry. A name after "stop" that is no Igor's counts as no name, as does any name the tracker
cannot resolve. On GitHub a name is an Igor's where GitHub has a bot `<name>[bot]`.

#### Scenario: A bare stop stops every Igor on the item

- **WHEN** somebody comments "stop" on an issue two Igors are working
- **THEN** both stop

#### Scenario: A stop that names an Igor stops only that one

- **WHEN** somebody comments "stop @igor-backend, frontend will take this" on an issue that
  carries both `igor:backend` and `igor:frontend`
- **THEN** the backend Igor stops
- **AND** the frontend Igor neither stops nor loses its label

#### Scenario: A stop that names only a person stops every Igor

- **WHEN** somebody comments "Stop — @alice is taking over" on an issue two Igors are working,
  and `@alice` is a person
- **THEN** both Igors stop

### Requirement: What follows a stop is read from the tracker, not from a second command

After a stop, eligibility SHALL be determined by the tracker's state rather than by any
distinct pause or resume verb. A stop releases the claim by removing this Igor from the holder
field: its `igor:<role>` label on GitHub, or itself as delegate on Linear. What the item
shows decides what happens next, by the rules for items someone else holds and for a person
directing an Igor. A go-ahead, or the cooldown running out, lifts the stop for work the Igor's
own search found.

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

#### Scenario: No second verb exists

- **WHEN** a party wishes to pause rather than stop
- **THEN** they issue a stop
- **AND** resumption follows from tracker state, with no separate pause command defined

### Requirement: A stop cancels a hand-over

A stop cancels a hand-over. Only a new hand-over restores it: on GitHub, the label removed and added
again. Neither a go-ahead nor the cooldown's end restores it.

Where a stop is said on an item a person handed to the Igor while no run of the Igor is active on
it, the Igor SHALL, on the next cycle that sees the stop, remove itself from the holder field and
post a stop receipt. A catch-up, in the scenarios below, is the Igor bringing its own
pull request up to date.

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

### Requirement: A go-ahead lifts a stop only for the Igors it names

A go-ahead is read for whom it is meant as a stop is. A bare go-ahead lifts the stop for every Igor
on the item. A go-ahead that names Igors, as "go ahead @igor-backend", SHALL lift it only for the
Igors it names, and SHALL NOT lift it for an Igor it does not name. A name that is no Igor's counts
as no name, as in a stop. A name the tracker cannot resolve counts as an Igor's, making the go-ahead
a named one: unlike a stop, a go-ahead errs toward lifting fewer stops.

#### Scenario: A bare go-ahead lifts the stop for every Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says "go ahead"
  without naming anyone
- **THEN** the stop is lifted for both Igors

#### Scenario: A go-ahead that names an Igor lifts the stop only for that one

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "go ahead @igor-backend"
- **THEN** the stop is lifted for the backend Igor
- **AND** the frontend Igor stays stopped until the cooldown runs out or a go-ahead meant for it

#### Scenario: A go-ahead that names only a person lifts the stop for every Igor

- **WHEN** somebody says stop on an item two Igors work, and somebody then says
  "carry on, @alice approved it", and `@alice` is a person
- **THEN** the stop is lifted for both Igors

### Requirement: A go-ahead's names are read from its opening line

A go-ahead with no Igor's name straight after its phrase SHALL count later mentions on its opening
line. Wherever its names are read from, a list whose last name runs unpunctuated into words SHALL
lose that last name. A go-ahead that named an Igor before that loss still counts as named, so one
whose only Igor's name was lost lifts the stop for no Igor. Later mentions SHALL NOT be read across
a line break that follows the phrase's punctuation, as in "go ahead:", or the list's last separator.

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

### Requirement: On GitHub, a label removed by anyone but the Igor is a stop

On GitHub, when an Igor finds its `igor:<role>` label gone, it SHALL read the latest
`unlabeled` event for that label from the issue's events. If that event's actor is the Igor's
own bot account, the removal was the Igor's own release. If the actor is anyone else, the
removal is a stop by that person: the Igor SHALL halt, and its stop receipt SHALL name them.

#### Scenario: A person removing the label is a stop that names them

- **WHEN** an Igor working a GitHub issue finds its `igor:<role>` label gone, and the latest
  `unlabeled` event for that label was made by anyone other than the Igor's own bot account
- **THEN** the Igor halts as for any stop
- **AND** its stop receipt names whoever removed the label

#### Scenario: The Igor's own removal is its release

- **WHEN** an Igor finds its `igor:<role>` label gone, and the latest `unlabeled` event for that
  label was made by the Igor's own bot account
- **THEN** the removal is the Igor's own release, and it posts no stop receipt

### Requirement: A claim that cannot be kept is given back, out loud

Where a run holding a claim cannot go on, whether taking the claim or anything after it failed, the
Igor SHALL release the claim and say so on the item, never ending such a run silently holding the
claim. A finished run SHALL release its claim too, leaving its artifact and the item open; no role
setting changes that.

If the release fails too, the Igor SHALL say that, not that it released, and SHALL name the one
action that frees it: removing the Igor from the item's holder field on that surface.

#### Scenario: A finished run releases its claim

- **WHEN** a run publishes its work and finishes
- **THEN** the Igor releases its claim and leaves the artifact in place
- **AND** it does not close the item

#### Scenario: A claim that could not be announced is given back

- **WHEN** a claim is recorded and the message announcing it fails
- **THEN** the claim is released and the run is refused
- **AND** the item is not left held with nothing said

#### Scenario: A claim that could not be verified is given back and withdrawn

- **WHEN** a claim was announced and verifying it fails
- **THEN** the claim is released, the announcement is withdrawn on the item, and the run is refused

#### Scenario: A release that did not take is said so

- **WHEN** a claim cannot be kept and releasing it does not clear the holder
- **THEN** what is said names the item as still held rather than as released
- **AND** it names the action that frees it, such as removing the Igor's `igor:<role>` label on
  GitHub or its delegate on Linear

#### Scenario: A failure after the claim hands the item back

- **WHEN** a run holding a claim fails at any point after taking it
- **THEN** the claim is handed back with an explanation on the item

### Requirement: Giving a claim back never takes back a person's hand-over

Where a person put the Igor in the holder field and the run is the Igor bringing its own artifact
up to date rather than answering that hand-over, releasing the claim SHALL leave that holder entry
in place, except where a person stops the Igor: a stop removes the Igor from the holder field, and
the person hands the item over again by adding it anew. Bringing its own work up to date is not a
claim of the hand-over (*An item handed to an Igor waits for work already in flight*).

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

### Requirement: Two runs in a row that the surface failed stop a cycle

A run holding a claim that ends because a tracker or host did not answer, including a finished run
whose release went unanswered, SHALL be distinguishable from a refusal about the item itself. A
cycle meeting two such runs in a row SHALL stop instead of attempting the rest; one that met one and
then ran an item cleanly SHALL NOT be recorded as failed.

To tell the two apart, a surface asked to say or release something SHALL answer with what was
recorded, not merely that no error was raised.

#### Scenario: A cycle stops when the surface stops answering

- **WHEN** two runs in a row end because a surface did not answer
- **THEN** the cycle is recorded as failed and the remaining items are not attempted

#### Scenario: One run ending that way does not stop the cycle

- **WHEN** an item's run ends because a surface did not answer and the next item's run does not
- **THEN** the cycle continues and is not recorded as failed

#### Scenario: A refusal about the item does not stop the cycle

- **WHEN** a claim is refused because the tracker did not record it
- **THEN** the cycle continues to the remaining items

### Requirement: An organization's Igors claim on one tracker

The Igors of one organization SHALL hold claims on a single tracker. Other surfaces MAY direct
an Igor, by a mention or a chat message, or carry its work as a code host, but a claim SHALL NOT
be taken on them. A configuration whose roles take claims on more than one tracker SHALL be
refused, naming the trackers involved. Discord SHALL NOT be a claiming tracker. Claims
coordinate Igors with each other: no rule in this capability is designed to stop a person
duplicating work.

#### Scenario: Claims on one tracker

- **WHEN** every role in an organization takes its claims on Linear and produces artifacts on GitHub
- **THEN** the configuration loads
- **AND** GitHub carries branches and pull requests without holding any claim

#### Scenario: Claims on two trackers refused

- **WHEN** one role's sources claim on GitHub and another role's claim on Linear
- **THEN** validation fails
- **AND** the error names both trackers

#### Scenario: Another surface directs without claiming

- **WHEN** a person asks an Igor for work on a surface that is not the claiming tracker
- **THEN** any claim for that work is taken on the claiming tracker, not where the request was made

#### Scenario: Discord directs work and never holds a claim

- **WHEN** a person asks an Igor for work in a Discord channel
- **THEN** the Igor opens an issue on the claiming tracker and claims it there
- **AND** it posts the issue's link in the channel
- **AND** no claim is taken on Discord

#### Scenario: Discord as the claiming tracker refused

- **WHEN** a role's sources claim on Discord
- **THEN** validation fails
- **AND** the error says Discord directs work and cannot hold claims

### Requirement: On GitHub, an Igor is a GitHub App and claims with its role's label

An Igor's GitHub identity SHALL be a GitHub App; machine-user Igors are not supported. An Igor
SHALL claim a GitHub issue by adding the label `igor:<role>`, naming its role, then posting the
claim comment. That label is its holder field, exactly `igor:<role>` with no organization or
other prefix. The rules for items assigned to a person, for hand-overs and for stops apply to
it as to Linear's delegate. Any label beginning `igor:` names an Igor.

#### Scenario: App claims by label and comment

- **WHEN** an Igor claims a GitHub issue
- **THEN** the issue carries the label `igor:<role>` for that Igor's role
- **AND** the claim comment follows the label

#### Scenario: Another Igor's label after the settle interval

- **WHEN** a re-read after the settle interval finds another Igor's `igor:` label on the issue,
  which that Igor added itself
- **THEN** the Igor has lost the claim
- **AND** it removes its own label and leaves the other in place

### Requirement: An item someone else holds is not claimed

An Igor SHALL NOT claim an item whose holder field names another party. Where the tracker's
holder field is distinct from its assignee, an Igor SHALL NOT claim an item assigned to a person
unless the holder field names that Igor: the person is accountable for it, and handing it to the
Igor is their decision. Unassigned items, and items a person has handed to this Igor, are
candidates.

Linear's delegate and GitHub's `igor:` label are each distinct from the assignee.

#### Scenario: Item assigned to a person, on Linear

- **WHEN** a Linear issue is assigned to a person and has no delegate
- **THEN** no Igor claims it

#### Scenario: Item assigned to a person, on GitHub

- **WHEN** a GitHub issue is assigned to a person and carries no `igor:` label
- **THEN** no App Igor claims it

#### Scenario: Item handed to this Igor, on Linear

- **WHEN** a Linear issue is assigned to a person and delegated to an Igor
- **THEN** that Igor treats it as its candidate

#### Scenario: Item handed to this Igor, on GitHub

- **WHEN** a GitHub issue is assigned to a person and carries an App Igor's `igor:<role>` label
- **THEN** that Igor treats it as its candidate

#### Scenario: Item delegated to another agent, on Linear

- **WHEN** a Linear issue is delegated to another Igor or any other agent
- **THEN** this Igor does not claim it

#### Scenario: Item labelled for another Igor, on GitHub

- **WHEN** a GitHub issue carries another Igor's `igor:` label
- **THEN** this Igor does not claim it, even if a person has added this Igor's label too

#### Scenario: Unassigned item, on Linear

- **WHEN** a Linear issue has neither an assignee nor a delegate
- **THEN** it is a candidate, and an Igor claims it by setting itself as delegate

#### Scenario: Unassigned item, on GitHub

- **WHEN** a GitHub issue has neither an assignee nor an `igor:` label
- **THEN** it is a candidate, and an App Igor claims it by adding its `igor:<role>` label

### Requirement: A person can direct an Igor through the holder field

Where a person sets the holder field to name an Igor, the Igor SHALL treat the item as directed
to it. On the next cycle that finds the item, it SHALL post the claim message, naming itself and
carrying the stop instruction, and SHALL begin work without waiting the settle interval. A stop,
or a person removing the Igor from the holder field, SHALL halt it at any time, as for any claim.

#### Scenario: Delegated by a person

- **WHEN** a person delegates a Linear issue to an Igor
- **THEN** on its next cycle the Igor posts the claim message and starts work
- **AND** it does not wait the settle interval

#### Scenario: Labelled by a person

- **WHEN** a person adds the label `igor:<role>` to a GitHub issue
- **THEN** on its next cycle the App Igor holding that role posts the claim comment and starts work
- **AND** it does not wait the settle interval

#### Scenario: Directed work can still be stopped

- **WHEN** a person removes the Igor as delegate, removes its `igor:<role>` label, or replies stop,
  after the Igor has started
- **THEN** the Igor halts as it would for any stopped claim

### Requirement: An item handed to an Igor waits for work already in flight

Where a person hands an item to an Igor through its holder field and the item has work in
flight, such as an open pull request, the Igor SHALL NOT claim it. The next cycle that finds it
SHALL post one comment naming the work and saying the Igor takes the item up once it closes, and
SHALL NOT repeat it while the work is open. Bringing the Igor's own pull request up to date when
it no longer merges is not a claim of the hand-over, and draws no such comment.

#### Scenario: Handed over while a pull request is open

- **WHEN** a person adds `igor:frontend` to a GitHub issue that an open pull request references
- **THEN** the `frontend` Igor does not claim it
- **AND** it posts one comment naming that pull request and saying it takes the issue up once
  the pull request closes

### Requirement: A hand-over that waited for work in flight takes effect once it closes

Once the work in flight on a handed-over item closes, the hand-over SHALL direct the Igor as in
*A person can direct an Igor through the holder field*.

#### Scenario: The pull request closes

- **WHEN** the pull request closes and the `igor:frontend` label is still on the issue
- **THEN** on its next cycle the `frontend` Igor posts the claim comment and starts work
  without waiting the settle interval

### Requirement: A handed-over run that published and then failed says how to try again

Where a handed-over item's run published work and then could not finish, its handoff SHALL say
that what it published stands and that, once that work closes, handing the item over again has
the Igor try again. The handoff SHALL NOT suggest handing the item over while that work is
still open.

#### Scenario: A handed-over run published, then failed

- **WHEN** an Igor working a handed-over item opens a pull request and then cannot finish
- **THEN** its handoff says what it published stands, and that handing the item over again once
  that pull request closes has it try again

### Requirement: A person reassigns an issue by removing the holding Igor's label first

Where a person adds an App Igor's `igor:<role>` label to a GitHub issue that carries another Igor's
`igor:` label, the newly labelled Igor SHALL NOT claim it. On the next cycle finding the issue, it
SHALL post one comment saying which Igor holds it and that removing that Igor's label hands it over,
and SHALL NOT repeat it while the labels are unchanged. Once the other Igor's label is gone, the
person's label directs this Igor. Work that needs two roles takes two issues, one per role.

#### Scenario: Person labels a second Igor

- **WHEN** a person adds `igor:frontend` to a GitHub issue the `backend` Igor holds by its
  `igor:backend` label
- **THEN** the `frontend` Igor does not claim it, and posts one comment saying the `backend`
  Igor holds the issue and that removing `igor:backend` hands it over
- **AND** the `backend` Igor keeps the issue

#### Scenario: Person removes the holding Igor's label

- **WHEN** the person then removes `igor:backend`
- **THEN** the `backend` Igor halts, as for any stopped claim
- **AND** the `frontend` Igor posts the claim comment and starts work without waiting the
  settle interval

### Requirement: A label a person added is not a competing claim

A label a person added SHALL NOT make the Igor holding the issue lose its claim, even during
its settle interval. A label another Igor added while claiming is resolved by the settle
interval. The adapter SHALL tell the two apart by who added the label, read from the issue's
events.

#### Scenario: Another Igor's own label is still a race

- **WHEN** an Igor finds another Igor's `igor:` label on an issue it is claiming, and the
  issue's events show that Igor added the label itself
- **THEN** the settle interval resolves the claim

### Requirement: An issue created from chat points back to the chat

Where an Igor creates an issue because a person instructed it in chat, the issue's description
SHALL link the chat message that asked for the work, and MAY also quote it. After creating the
issue, the Igor SHALL post a message in that chat with a link to the issue. The issue is created
on the claiming tracker, and any claim on it is taken there.

#### Scenario: Instructed in chat

- **WHEN** a person in chat instructs an Igor to do work that has no issue
- **THEN** the Igor creates an issue on the claiming tracker whose description links the chat
  message
- **AND** it then posts the issue's link in the chat

### Requirement: Before making an issue from chat, an Igor looks for one that links the message

Before creating an issue from a chat message, the Igor SHALL look on the claiming tracker for
an issue that already links that message, and SHALL create none if one exists. That check, not
any record of which messages were handled, is what prevents a duplicate issue. When the check
finds such an issue, the Igor SHALL post that issue's link in the chat if the chat has no reply
with that link yet, and SHALL otherwise do nothing. How the tracker is searched for the link
belongs to the adapter.

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

