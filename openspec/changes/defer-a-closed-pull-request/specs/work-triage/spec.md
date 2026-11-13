## ADDED Requirements

### Requirement: A pull request closed without merging defers its item, and asks why

Where an Igor's own pull request for an item is closed without being merged, the Igor SHALL NOT
work that item again until someone with write access answers, and SHALL say on the item that it
has stopped — asking what the close meant.

A closed pull request is not work in flight, and must not be: counting it would skip every item
an Igor ever attempted. So nothing screens the item, and the next cycle claims it again and runs
the worker — then fails to publish, because the branch the closed pull request left behind has
the same name the new one needs, or would re-propose what the reviewer had just closed.

**A close is ambiguous.** The approach was wrong; not now; the reviewer will do it themselves; it
was superseded. It is not a rejection — closing the item is how to say no, and that already takes
it out of discovery — and it is no reason to try again with nothing new. It is an ambiguity, and
an Igor asks about ambiguity rather than guessing.

The question is the handoff, and the deferral record does the waiting: the item stays set down
until someone with write access replies or edits it, which is what lifts any deferral.

#### Scenario: A closed pull request is not retried unanswered

- **WHEN** an Igor's pull request for an item was closed without merging, and nobody with write
  access has said anything on the item since
- **THEN** the item is not worked again

#### Scenario: The Igor asks what the close meant, once

- **WHEN** an Igor first finds that its pull request for an item was closed without merging
- **THEN** it says on the item that it has stopped, and asks whether to try another approach or
  leave it
- **AND** it does not ask again while the item stays deferred

#### Scenario: An answer from someone with write access restarts it

- **WHEN** someone with write access replies on the item, or edits it
- **THEN** it may be worked again

#### Scenario: A reply from someone without write access does not

- **WHEN** someone without write access replies to the question
- **THEN** the item stays deferred

#### Scenario: A merged pull request is not a close

- **WHEN** an Igor's pull request for an item was merged
- **THEN** none of this applies

#### Scenario: Only the Igor's own pull request

- **WHEN** a pull request for the item was opened by somebody else and closed without merging
- **THEN** none of this applies, because the Igor proposed nothing that was closed

#### Scenario: Closing the item is still how to say no

- **WHEN** the item itself is closed
- **THEN** it leaves discovery, and nothing is asked

## MODIFIED Requirements

### Requirement: An item handed back is not re-worked until something answers

Where an Igor has handed an item back rather than producing something, that outcome SHALL be
recorded, and the item SHALL NOT be worked again while nothing has answered it.

An Igor's own handoff comment updates the item, which moves its timestamp past the watermark (the
point up to which discovery has already considered a source's items), so the item looks fresh next
cycle. Nothing else stops it: the claim was released, no pull request exists, the role's lane (the
items it is configured to take) still admits it, and the triage model gives the same verdict on the
same text. Without this rule the Igor re-claims and re-works it every poll interval, at full worker
cost, forever.

An answer is a reply from someone with write access to the repository, or an edit to the item
that such a person made. Either one is enough. Replies must count, because a handoff *invites* a
reply: an item that stayed suppressed until its title or labels changed would never be worked
again in exactly the case where a person supplied the missing context in a comment.

**Authority is write access**, read as `permissions.push`, the same test the open
`directed-interaction` change applies to whose instruction an Igor acts on. A reply from someone
without it is not an answer. On a public repository anyone can comment, so without this anyone
could restart work an Igor had set down, including by replying to a question the Igor itself asked.

**An edit counts only where a writer made it.** Igor notices an edit by a change in the item's
fingerprint, a digest of its title, body, labels and assignee, and that says the item changed
but not who changed it. An issue's own author may edit it without write access. Who edited SHALL
be established from a record that names the editor, never inferred from the change. For a body
edit that is GraphQL's `userContentEdits`, since REST records no editor. How a retitle, relabel
or assignee change is attributed is an open question in this change's proposal.

Suppression follows from the item having produced the outcome. Where the cause was a fact about the
Igor, such as a seat (the account a worker runs on) whose token is unset, a command its allowlist
refuses, or a seat whose usage allowance has never been read, the item SHALL NOT be suppressed: the
item did not produce that outcome, and nothing anyone could say on it would cure such a cause.
Running out of budget is one instance of this rule, not the whole of it.

The rule is stated generally rather than as a list of causes, because such causes look the same
from the item's side and have the same consequence: each recurs on the next item and every one
after, until somebody changes a configuration. Suppressing on any of them parks a backlog behind
a cure nobody has been told to make, and every parked item then has to be answered individually
to release it. A cause added later has a rule to satisfy rather than a list to be added to.

#### Scenario: A handed-back item does not return unanswered

- **WHEN** an item was handed back and nothing has been said on it since, and the item itself
  is unchanged
- **THEN** it is not worked again

#### Scenario: The Igor's own handoff does not make an item fresh

- **WHEN** the only activity since the handoff is the Igor's own message
- **THEN** that alone does not make the item workable again

#### Scenario: A reply lifts the suppression

- **WHEN** someone with write access to the repository comments on a handed-back item
- **THEN** it is worked again

#### Scenario: A reply from someone without write access does not

- **WHEN** someone without write access comments on a handed-back item, and nothing else changed
- **THEN** it is not worked again

#### Scenario: An edit lifts the suppression

- **WHEN** someone with write access retitles, rewrites or relabels a handed-back item, or changes
  its assignee
- **THEN** it is worked again, whether or not anyone commented

#### Scenario: An edit by someone without write access does not

- **WHEN** the only change to a handed-back item is an edit by someone without write access, such
  as its own author rewriting it
- **THEN** it is not worked again

#### Scenario: Running out of budget is not a decision about the item

- **WHEN** an item was handed back because the budget was exhausted
- **THEN** it is not suppressed, because nothing about the item produced that outcome

#### Scenario: A seat that could not be read is no more a decision about the item

- **WHEN** an item was handed back because the worker could not start, since its seat's token
  was unset
- **THEN** it is not suppressed, on the same grounds: the Igor's configuration produced that
  outcome, and the next item would meet it identically

#### Scenario: The record is a cache, not a source of truth

- **WHEN** the record of a handed-back item is missing or unreadable
- **THEN** the item is worked again rather than the cycle failing
