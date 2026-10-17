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
