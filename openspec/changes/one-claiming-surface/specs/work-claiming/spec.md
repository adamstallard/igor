## MODIFIED Requirements

### Requirement: Assignment expresses a claim; ordering resolves it

Every claiming tracker offers a native holder field, such as GitHub's `igor:<role>` label and
Linear's delegate. A claim SHALL set the holder field, because that is the signal humans
read, and SHALL post the claim message. Resolution SHALL rely on the storage order of writes,
not on any conditional-write primitive.

The holder field SHALL be written before the claim message. The field is what resolution reads
and what people see; the message names the Igor and carries the stop instruction. Written in
the other order, an Igor that fails between the two writes leaves a message claiming an item
whose field shows nobody, which is a claim people miss. Written field first, a failure leaves
the visible claim, and the message follows on the next cycle.

Where the holder field holds a single value, the later of two writes holds the item: each Igor
re-reads the field, and the one it no longer names has lost. Where the field holds a list, such
as GitHub's `igor:` labels, any other holder present after the settle interval
means the claim is lost, because a list keeps every write rather than replacing one.

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
losing Igor's write has already been replaced by the winner's, so clearing the field would
remove the winner's claim; the losing Igor posts a short reply saying it is handing the item
back, and changes nothing else.

The settle interval does not apply where a person handed the item to the Igor; see *A person
can direct an Igor through the holder field*.

The re-read SHALL look for a stop said since the cycle that chose the item read it, or, for an
item a person handed over, since the hand-over. A cycle works its items one after another, so a
stop said on one while it works another comes after the cycle read it and before the claim;
looking only back to the claim would miss it.
For an item the Igor's own search found, a go-ahead later in the comments than the latest stop
lifts it, as it would at the next cycle, and the run that follows SHALL NOT be stopped by the stop
the claim saw lifted. For a handed-over item the stop stands.

#### Scenario: Claim confirmed

- **WHEN** a re-read after the settle interval shows the Igor still holding the claim
- **THEN** work proceeds

#### Scenario: Claim lost to another party

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

#### Scenario: A stop said while the cycle worked another item

- **WHEN** a cycle chooses two items, and somebody says stop on the second while the Igor works
  the first
- **THEN** the claim on the second sees the stop, and the Igor stands down with a receipt

#### Scenario: A stop answered by a go-ahead before the claim

- **WHEN** somebody says stop on an item the Igor's search found, and somebody says go ahead
  after it, both before the Igor claims it
- **THEN** the claim holds and the run is not stopped by that stop

### Requirement: Stop is unconditional and open to anyone

A stop directed at an Igor SHALL take effect immediately, release the claim, and require no
authorization. Stop MUST NOT be gated by identity, permission, or configuration.

A stop is directed at an Igor when it opens a comment with "stop" and names no Igor, or names that
Igor: "stop @igor-backend" or "@igor-backend stop". A bare "stop" stops every Igor on the item. A
stop that names other Igors SHALL NOT stop an Igor it does not name, and SHALL NOT take that
Igor's holder entry off: "stop @igor-backend" is meant for the backend Igor, and stopping the
frontend Igor too would take back a hand-over nobody asked to take back.

A name after "stop" that is no Igor's counts as no name, so "Stop — @alice is taking over" stops
every Igor on the item. On GitHub every Igor is a GitHub App, so a name is an Igor's where GitHub
has a bot account `<name>[bot]`. A name the tracker cannot resolve counts as no name, because
stopping too many Igors is the safer error.

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
field: its `igor:<role>` label on GitHub, or itself as delegate on Linear. What the item then
shows decides what happens next, by the rules for items someone else holds and for a person
directing an Igor.

A stop cancels a hand-over. Only a new hand-over restores it: on GitHub, the label removed and
added again. A go-ahead, or the cooldown running out, lifts the stop for work found by the
Igor's own search, and never restores a hand-over the stop cancelled.

A go-ahead is read for whom it is meant as a stop is. A bare go-ahead lifts the stop for every
Igor on the item. A go-ahead that names Igors, as "go ahead @igor-backend", SHALL lift it only for
the Igors it names, and SHALL NOT lift it for an Igor it does not name. A name that is no Igor's
counts as no name, as in a stop, so "carry on, @alice approved it" lifts the stop for every Igor.

Where the names are unclear, a go-ahead errs the other way from a stop, because lifting a stop by
mistake costs more than leaving one in place. A go-ahead with no Igor's name straight after the
phrase SHALL count the mentions later on its opening line, and a list of names that runs straight
on into a word SHALL lose its last name, whichever of the two the go-ahead reads. Whether a go-ahead names an Igor is read before that loss,
so one whose only Igor is the name it loses lifts the stop for no Igor. A name the tracker cannot
resolve counts as an Igor's.

Where a stop is said on an item a person handed to the Igor while no run of the Igor is active
on it, the Igor SHALL, on the next cycle that sees the stop, remove itself from the holder field
and post a stop receipt, so that an item showing the Igor in its holder field is always one
handed to it.

On GitHub, when an Igor finds its `igor:<role>` label gone, it SHALL read the latest
`unlabeled` event for that label from the issue's events. If that event's actor is the Igor's
own bot account, the removal was the Igor's own release. If the actor is anyone else, the
removal is a stop by that person: the Igor SHALL halt, and its stop receipt SHALL name them.
These two cases are exhaustive, because an Igor that loses a race removes only its own label,
never another Igor's.

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

#### Scenario: No second verb exists

- **WHEN** a party wishes to pause rather than stop
- **THEN** they issue a stop
- **AND** resumption follows from tracker state, with no separate pause command defined

### Requirement: A claim that cannot be kept is given back, out loud

`work-claiming` says how a claim is taken, verified, stood down from and stopped. It says nothing
about the run that takes one and then cannot continue, and that silence is the gap: an Igor that
throws while holding a claim leaves the item held, other people told to stand off, and no
explanation.

Where a run holds a claim and cannot go on — the claim could not be finished, or anything after it
failed — the Igor SHALL release the claim and say so on the item. It SHALL NOT end such a run
holding the claim in silence.

A run that finishes SHALL release its claim too, leaving its artifact in place and the item open,
so the item is rediscovered and the work in flight keeps it from being claimed again. No role
setting changes this.

**Giving the claim back never takes back a person's hand-over.** Where a person put the Igor in
the holder field, as by adding its `igor:<role>` label, and the run is the Igor bringing its own
artifact up to date rather than answering that hand-over, releasing the claim SHALL leave that
holder entry in place, except where a person stops the Igor: a stop removes the Igor from the
holder field, as every stop does, and the person hands the item over again by adding it anew. Bringing its own work up to date is not a claim of the hand-over (*An item
handed to an Igor waits for work already in flight*), and removing the person's entry would spend
a hand-over the Igor has not answered.

**Where the release does not succeed either**, the Igor SHALL say that instead of saying it
released. The item still carries the Igor's name, so a message asserting release would be false
where somebody is looking; what is said SHALL name the item as still held and SHALL name the one
action that frees it.

**A failure of the surface is not a failure of the item.** Where a run ends this way because a
tracker or host did not answer, that SHALL be distinguishable from a refusal about the item
itself, and a cycle meeting **two in a row** SHALL stop rather than attempting the remaining
items. Nothing about the item produced the outcome, so every remaining item would reach the same
one — and doing so speaks on each of them, at a volume that is itself a cause of the failure.

Two, not one, because the run cannot tell the two causes apart: `produce` fails inside the worker
call for a branch the item already owns, while a tracker that does not answer the release that
ends a finished run fails outside it, so neither the error nor how far the run got separates them. How many items they
affect does — an outage fails every item and a bad item fails one — so the count is the
distinction. A cycle that met one and then ran an item cleanly did not fail, and SHALL NOT be
recorded as failed.

**A write says what the surface recorded.** Where the Igor asks a surface to say or to release
something, the answer SHALL carry what was recorded, not merely that no error was raised. A raised
error cannot separate *this did not happen* from *this happened and the answer was lost*, and a
caller that must tell them apart cannot do it from a thrown error alone.

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

## ADDED Requirements

### Requirement: An organization's Igors claim on one tracker

The Igors of one organization SHALL hold claims on a single tracker. Claims exist so that Igors
do not work the same item, and an Igor cannot see a claim held on a tracker it does not read.
Other surfaces MAY direct an Igor, by a mention or a chat message, or carry its work as a code
host, but a claim SHALL NOT be taken on them. A configuration whose roles take claims on more
than one tracker SHALL be refused, naming the trackers involved.

Discord SHALL NOT be a claiming tracker. It has no holder field, so a claim there would be a
bare message with nothing to verify. Discord directs work: a request there becomes an issue on
the claiming tracker, and the issue's link is posted back in the channel.

Claims coordinate Igors with each other, not with people. An Igor holds an item briefly, a
person takes over an Igor that stalls, and a person duplicating work is acceptable. No rule in
this capability is designed to prevent duplicate human work.

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

An Igor's GitHub identity SHALL be a GitHub App. Machine-user Igors are not supported. An Igor
SHALL claim a GitHub issue by adding the label `igor:<role>`, naming its role, such as
`igor:reviewer`, and then posting the claim comment. An App's bot user cannot be an issue
assignee, so the label is its holder field. The label carries no organization or other prefix
beyond `igor:`.

The `igor:` label is the Igor's field and the assignee is the person's, as Linear's delegate
and assignee are. The rules that follow for items assigned to a person, for a person handing an
item to an Igor, and for what follows a stop apply to the label exactly as they apply to
Linear's delegate.

Any label beginning `igor:` names an Igor. Another Igor's `igor:` label that the other Igor added
itself, present after the settle interval, means the claim is lost, and standing down removes
only this Igor's own label. A label a person added is not a competing claim (*A person
reassigns an issue by removing the holding Igor's label first*).

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
carrying the stop instruction, and SHALL begin work without waiting the settle interval. No
other Igor competes for an item that names a holder, and the person has already chosen. A stop,
or a person removing the Igor from the holder field, SHALL halt it at any time, as for any claim.

On Linear a person directs an Igor by delegating to it. On GitHub a person directs an App Igor
by adding its `igor:<role>` label.

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

Where a person hands an item to an Igor through its holder field, and the item already has work
in flight, such as an open pull request, the Igor SHALL NOT claim it. On the next cycle that
finds the item, it SHALL post one comment naming the work in flight and saying it takes the item
up once that work closes, and SHALL NOT post it again while that work is open. Once the work
closes, the hand-over directs the Igor as in *A person can direct an Igor through the holder
field*. Claiming would duplicate work already in review, which no hand-over overrides, and
saying nothing would leave the person who asked with no sign the Igor saw the request.

Where the work in flight is the Igor's own pull request and it no longer merges, bringing it up
to date is the Igor's own work on its own artifact, not a claim of the hand-over, and the item
gets no such comment while that runs.

Where a handed-over item's run published work and then could not finish, its handoff SHALL say
that what it published stands and that, once that work closes, handing the item over again has
the Igor try again. Handing it over while the work is still open changes nothing, so the
handoff SHALL NOT suggest it.

#### Scenario: Handed over while a pull request is open

- **WHEN** a person adds `igor:frontend` to a GitHub issue that an open pull request references
- **THEN** the `frontend` Igor does not claim it
- **AND** it posts one comment naming that pull request and saying it takes the issue up once
  the pull request closes

#### Scenario: The pull request closes

- **WHEN** the pull request closes and the `igor:frontend` label is still on the issue
- **THEN** on its next cycle the `frontend` Igor posts the claim comment and starts work
  without waiting the settle interval

#### Scenario: A handed-over run published, then failed

- **WHEN** an Igor working a handed-over item opens a pull request and then cannot finish
- **THEN** its handoff says what it published stands, and that handing the item over again once
  that pull request closes has it try again

### Requirement: A person reassigns an issue by removing the holding Igor's label first

Where a person adds an App Igor's `igor:<role>` label to a GitHub issue that carries another
Igor's `igor:` label, the newly labelled Igor SHALL NOT claim it. On the next cycle that finds
the issue, it SHALL post one comment saying which Igor holds the issue and that removing that
Igor's label hands the issue over. It SHALL NOT post the comment again while the issue's labels
are unchanged. Once the other Igor's label is gone, the person's label directs this Igor, by *A
person can direct an Igor through the holder field*. This matches Linear, where a person
replaces a delegate rather than adding a second. Work that needs two roles is split into two
issues, one per role.

A label a person added SHALL NOT make the Igor holding the issue lose its claim, even during
its settle interval. A label another Igor added while claiming is resolved by the settle
interval, as in *A claim is verified after a settle interval*. The adapter SHALL tell the two
apart by who added the label, read from the issue's events.

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

#### Scenario: Another Igor's own label is still a race

- **WHEN** an Igor finds another Igor's `igor:` label on an issue it is claiming, and the
  issue's events show that Igor added the label itself
- **THEN** the settle interval resolves the claim

### Requirement: An issue created from chat points back to the chat

Where an Igor creates an issue because a person instructed it in chat, the issue's description
SHALL link the chat message that asked for the work, and MAY also quote it, so that whoever
reads the issue sees where the request came from. After creating the issue, the Igor SHALL post
a message in that chat with a link to the issue. The issue is created on the claiming tracker,
and any claim on it is taken there.

Before creating an issue from a chat message, the Igor SHALL look on the claiming tracker for
an issue that already links that message, and SHALL create none if one exists. This check, not
any record of which messages were handled, is what prevents a duplicate issue: such a record
only saves work, and losing it costs API calls, never a second issue. How the tracker is
searched for the link belongs to the adapter.

When the check finds such an issue, the Igor SHALL post that issue's link in the chat if the
chat has no reply with that link yet, and SHALL otherwise do nothing. So an Igor that stopped
between creating the issue and posting its link posts the link on its next read of the
message, and reading the message again never posts the link twice.

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
