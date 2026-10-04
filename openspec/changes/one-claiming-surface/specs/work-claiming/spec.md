## MODIFIED Requirements

### Requirement: Assignment expresses a claim; ordering resolves it

Where a tracker offers a native holder field, a claim SHALL set it, because that is the signal
humans read. Where a surface offers only messages, a claim SHALL be a post. In both cases
resolution SHALL rely on the storage order of writes, not on any conditional-write primitive.

The holder field SHALL be written before the claim message. The field is what resolution reads
and what people see; the message names the Igor and carries the stop instruction. Written in
the other order, an Igor that fails between the two writes leaves a message claiming an item
whose field shows nobody, which is a claim people miss. Written field first, a failure leaves
the visible claim, and the message follows on the next cycle.

Where the holder field holds a single value, the later of two writes holds the item: each Igor
re-reads the field, and the one it no longer names has lost. Where the field holds a list, such
as GitHub's assignees or its `igor:` labels, any other holder present after the settle interval
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

- **WHEN** a claim is taken on any surface
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

### Requirement: What follows a stop is read from the tracker, not from a second command

After a stop, eligibility SHALL be determined by the tracker's state rather than by any
distinct pause or resume verb. A stop releases the claim by removing this Igor from the holder
field: its assignee entry, its `igor:<role>` label, or itself as delegate. What the item then
shows decides what happens next, by the rules for items someone else holds and for a person
directing an Igor.

#### Scenario: A human takes the item

- **WHEN** a human assigns themselves after stopping an Igor
- **THEN** the item is not reclaimed by the Igor
- **AND** this holds whether the holder field is the assignee, an `igor:` label, or Linear's
  delegate, because an item assigned to a person is not claimed unless it names this Igor

#### Scenario: Nobody takes the item

- **WHEN** an item is stopped and left unassigned, with nothing in its holder field
- **THEN** it becomes eligible again after a cooldown
- **AND** it is not permanently removed from the pool

#### Scenario: Explicit go-ahead short-circuits the cooldown

- **WHEN** someone signals on the surface that work may resume
- **THEN** the item becomes eligible immediately

#### Scenario: Handing the item back to the Igor is a go-ahead

- **WHEN** a person who stopped an Igor later delegates the Linear issue to it again, or adds
  its `igor:<role>` label to the GitHub issue again
- **THEN** the Igor treats the item as directed to it, without waiting the cooldown

#### Scenario: No second verb exists

- **WHEN** a party wishes to pause rather than stop
- **THEN** they issue a stop
- **AND** resumption follows from tracker state, with no separate pause command defined

## ADDED Requirements

### Requirement: An organization's Igors claim on one tracker

The Igors of one organization SHALL hold claims on a single tracker. Claims exist so that Igors
do not work the same item, and an Igor cannot see a claim held on a tracker it does not read.
Other surfaces MAY direct an Igor, by a mention or a chat message, or carry its work as a code
host, but a claim SHALL NOT be taken on them. A configuration whose roles take claims on more
than one tracker SHALL be refused, naming the trackers involved.

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

### Requirement: On GitHub, an Igor acting as an App claims with its role's label

An Igor whose GitHub identity is a GitHub App SHALL claim a GitHub issue by adding the label
`igor:<role>`, naming its role, such as `igor:reviewer`, and then posting the claim comment. An
App's bot user cannot be an issue assignee, so the label is its holder field. The label carries
no organization or other prefix beyond `igor:`. An Igor whose GitHub identity is a machine user
claims by assignee.

The `igor:` label is the Igor's field and the assignee is the person's, as Linear's delegate
and assignee are. The rules that follow for items assigned to a person, for a person handing an
item to an Igor, and for what follows a stop apply to the label exactly as they apply to
Linear's delegate.

Any label beginning `igor:` names an Igor. Another Igor's `igor:` label present after the settle
interval means the claim is lost, and standing down removes only this Igor's own label.

#### Scenario: App claims by label and comment

- **WHEN** an Igor acting as a GitHub App claims an issue
- **THEN** the issue carries the label `igor:<role>` for that Igor's role
- **AND** the claim comment follows the label

#### Scenario: Another Igor's label after the settle interval

- **WHEN** a re-read after the settle interval finds another Igor's `igor:` label on the issue
- **THEN** the Igor has lost the claim
- **AND** it removes its own label and leaves the other in place

### Requirement: An item someone else holds is not claimed

An Igor SHALL NOT claim an item whose holder field names another party, unless a person has
also named this Igor there (*A person adding a second Igor's label hands the issue over*). Where the tracker's
holder field is distinct from its assignee, an Igor SHALL NOT claim an item assigned to a person
unless the holder field names that Igor: the person is accountable for it, and handing it to the
Igor is their decision. Unassigned items, and items a person has handed to this Igor, are
candidates.

Linear's delegate and GitHub's `igor:` label are each distinct from the assignee. On a tracker
whose holder field is its assignee, such as GitHub for a machine user, the two conditions
coincide, and this changes nothing.

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

- **WHEN** a GitHub issue carries another Igor's `igor:` label, and no person has added this
  Igor's label
- **THEN** this Igor does not claim it

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

### Requirement: A person adding a second Igor's label hands the issue over

Where a person adds an App Igor's `igor:<role>` label to a GitHub issue that another Igor
holds, the issue SHALL pass to the newly labelled Igor, as setting a new delegate on Linear
replaces the old one. The first Igor SHALL stop and remove only its own label. The newly
labelled Igor SHALL proceed as directed by a person, by *A person can direct an Igor through the
holder field*, although the first Igor's label may still be present. Work that needs two roles
is split into two issues, one per role.

This applies only to a label a person added. A label another Igor added while claiming is
resolved by the settle interval, as in *A claim is verified after a settle interval*. The
adapter SHALL tell the two apart by who added the label, read from the issue's events.

#### Scenario: Person labels a second Igor

- **WHEN** a person adds `igor:frontend` to a GitHub issue the `backend` Igor holds by its
  `igor:backend` label
- **THEN** the `backend` Igor stops and removes `igor:backend`, leaving `igor:frontend`
- **AND** the `frontend` Igor posts the claim comment and starts work without waiting the
  settle interval

#### Scenario: Another Igor's own label is still a race

- **WHEN** an Igor finds another Igor's `igor:` label on an issue it is claiming, and the
  issue's events show that Igor added the label itself
- **THEN** the settle interval resolves the claim, and neither Igor treats it as a hand-off

### Requirement: An issue created from chat points back to the chat

Where an Igor creates an issue because a person instructed it in chat, the issue's description
SHALL quote the relevant chat messages, link to them, or both, so that whoever reads the issue
sees where the request came from. After creating the issue, the Igor SHALL post a message in
that chat with a link to the issue. The issue is created on the claiming tracker, and any claim
on it is taken there.

#### Scenario: Instructed in chat

- **WHEN** a person in chat instructs an Igor to do work that has no issue
- **THEN** the Igor creates an issue on the claiming tracker whose description quotes or links the chat
- **AND** it then posts the issue's link in the chat
