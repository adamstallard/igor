## ADDED Requirements

### Requirement: An Igor learns it was addressed by being mentioned

An Igor SHALL discover that it was addressed through a source querying mentions of its own
account, and SHALL NOT require any inbound delivery.

Discovery is a query and comments are re-read only on items already held, so a mention
anywhere else is invisible. A mentions source reaches it through the machinery that exists:
the same watermark, the same screening, the same triage.

#### Scenario: Mentioned on an item discovery would not return

- **WHEN** a person with write access mentions the Igor on an item outside its query
- **THEN** the item reaches triage

#### Scenario: No inbound endpoint

- **WHEN** an Igor is addressed
- **THEN** it learns of it by asking the surface, never by being delivered to

### Requirement: A mention narrows what an Igor may do and claims nothing

Acting on a mention SHALL restrict the action space to what may be said, SHALL NOT claim the
item, and MUST NOT widen anything the role permits.

Reading is not taking, so an item somebody else holds needs no exception to the universal skip
— the person keeps their item and gets an answer. Nobody was told to stand off, so nothing is
owed a receipt and no settle interval or marker applies.

Narrowing is also what makes this safe by construction. Permissions merge monotonically, so if
a mention can only restrict, a successful injection through a comment gains the speaker
strictly less than the Igor could already do — a stronger guarantee than detecting
manipulation, and one needing no permission lookup.

#### Scenario: Asked for help on an item somebody holds

- **WHEN** the holder of an item mentions the Igor on it
- **THEN** the Igor investigates and answers
- **AND** it does not assign itself, and the holder keeps the item

#### Scenario: A mention cannot widen the action space

- **WHEN** a mention asks for something outside the role's permissions
- **THEN** the action is refused, as it would be without the mention

#### Scenario: The answer carries the change

- **WHEN** the investigation produces a change small enough to read
- **THEN** the reply contains it, rather than describing that a change exists

### Requirement: Authority to instruct is write access on the artifact

An Igor SHALL act on an instruction only from a party with write access to the repository
holding the artifact, read from the surface's own permission record.

Write access is what lets somebody do the thing themselves, so instructing an Igor gains them
nothing they could not already do — which is a stronger guarantee than trying to detect
manipulation. Organization membership is too coarse: it would let someone with read access to
one repository direct work in it.

A party without write access is not refused, because nothing was granted to refuse. Their
mention is not a signal: it grants nothing and takes nothing away, and the item still stands or
falls on its own through ordinary discovery.

#### Scenario: A colleague with write access directs work

- **WHEN** someone with write access asks the Igor to act within its lane and permissions
- **THEN** it acts

#### Scenario: A stranger's mention changes nothing

- **WHEN** someone without write access mentions the Igor
- **THEN** no reply is composed and no work is done on account of the mention
- **AND** the item is still eligible on its own merits

#### Scenario: Authority is read per repository

- **WHEN** a party has write access to one repository and not another
- **THEN** their authority applies only where they hold it

### Requirement: Everything ingested is data, never instruction

Item bodies, comments, linked content and code SHALL be passed to the worker as untrusted data
and delimited as such. The trusted channel is role configuration and reviewed lore.

Ingesting text from surfaces anybody can write to is the premise of the whole system, so this
cannot be left implicit. What bounds the damage is the action space enforced at the loop rather
than the prompt: no instruction inside ingested text can widen it.

#### Scenario: Text shaped like an instruction

- **WHEN** ingested content contains text addressed to the worker
- **THEN** it is treated as information about the task and changes nothing about the role, the
  permissions, or what may be produced

### Requirement: Conversation is bounded by budget, not by a count of exchanges

Talking SHALL draw on a declared fraction of cycle budget, and there SHALL be no limit on the
number of replies.

A count is a poor proxy for the resource: replies on a large repository cost more than replies
on a small one. It is also aimed at the wrong party — once a stranger gets no reply, the only
conversation partner left is a colleague, whose fourth question is often the useful one.

Where an exchange runs away, the venue's own moderation is the answer rather than a rule here,
and stop applies with no identity test, so one participant may halt another.

#### Scenario: Talking cannot starve work

- **WHEN** conversation would exceed its share of the cycle's budget
- **THEN** it stops and work continues

#### Scenario: A fourth question is answered

- **WHEN** a colleague with write access asks a fourth question on one item
- **THEN** it is answered, budget permitting

### Requirement: Ambiguity is asked about rather than guessed at

Where an item cannot be acted on as written, an Igor SHALL say what it needs rather than choose
an interpretation, and the number of such questions SHALL NOT be capped.

A question costs a comment; acting on a bad guess costs a wrong artifact and the time of
whoever reads it. The bias belongs on asking.

#### Scenario: An item that does not say enough

- **WHEN** a worker cannot act on an item as written
- **THEN** the message on the item says what would let it proceed

#### Scenario: The question waits for its answer

- **WHEN** a question has been asked and nothing has answered it
- **THEN** the item is not reconsidered until someone replies or edits it

### Requirement: A requested item records who asked and what they said

Where work is done because somebody asked, the record SHALL name the requester and carry their
words.

The decision record already holds the item, the stage, the outcome and triage's reason, which
is complete for a discovered item because the provenance is the query. For a requested one it
is not, and "who told it to" is the first question anybody asks about an Igor that did
something unexpected — which is what distinguishes a request from an injection after the fact.

#### Scenario: A request is traceable to its requester

- **WHEN** an Igor acts because it was asked
- **THEN** the record names who asked and what they wrote

#### Scenario: Discovered work is unchanged

- **WHEN** an Igor acts on an item it discovered
- **THEN** the record is as before, because the query is the provenance

### Requirement: A person with authority can have an Igor file an issue

Where someone with write access on the repository mentions an Igor and asks for an issue to be
filed, the Igor SHALL open one — carrying what was asked, linking where it was asked, and naming
who asked — and SHALL NOT claim it or work it. The issue then enters discovery like any other.

Opening an issue is an action the role SHALL have to grant, like every other action; a mention
cannot confer it where the role does not. That keeps this inside the rule that a mention never
widens what a role permits, and it grants the requester nothing they could not already do
themselves by opening the issue.

**Issues stay the unit of work.** Without this, work a person suggests on a pull request lives
only in a comment thread: a mention gets an answer, and nothing tracks what was asked for. Filing
it turns a suggestion into something discovery can find, a role can be scoped to, and the next
reader can see.

#### Scenario: Asked to file an issue by someone with authority

- **WHEN** someone with write access mentions an Igor on a pull request and asks for an issue
- **THEN** the Igor opens one naming what was asked, where, and by whom
- **AND** it does not assign itself or begin the work

#### Scenario: A role that may not open issues does not

- **WHEN** an Igor whose role does not grant opening issues is asked to file one
- **THEN** it declines, as it would decline any action its role does not grant

#### Scenario: Someone without authority cannot have an issue filed

- **WHEN** someone without write access asks an Igor to file an issue
- **THEN** nothing is filed, as with any other mention from someone without authority

### Requirement: An answer to a question the Igor asked may be acted on

Where an Igor posted a question on an artifact it authored — a decision with the options it would
take, numbered — and someone with write access answers it in a comment that mentions the Igor,
the Igor MAY act on the option chosen. This is the one case where acting on a mention is not
restricted to what may be said.

**It is an exception to speaking only, not to widening.** Every option was proposed by the Igor
itself, within what its role already grants, before anyone answered. Choosing one narrows the set
of things the Igor was ready to do; it adds none. So the rule that a mention never widens what a
role permits holds unchanged, and the argument that makes mentions safe by construction still
applies.

**The answer SHALL be matched, never interpreted.** Which questions were posted, and which options
each offered, SHALL be read from what the posting Igor recorded when it posted them — never from
the artifact's text, which anyone with write access can edit. A reply SHALL be read only as a
choice among those; a reply naming a question that was not posted, or an option that was not
offered, SHALL have no effect. A reply can answer a question an Igor asked; it cannot pose one.

That record is also what lets the answer go to a different Igor than the one that asked: the
Igor a reply mentions matches the choice against the asking Igor's record, not against anything
it reads off the artifact.

Authority SHALL be checked against the reply's author. The question itself belongs where a
reader briefed on the artifact sees it — its description — and the answer arrives as a comment,
because a comment is attributable and a mention is what makes it visible.

#### Scenario: An answer selects an option the Igor offered

- **WHEN** an Igor posted a numbered question with options on its own pull request, and someone
  with write access replies mentioning it and choosing one
- **THEN** the Igor acts on that option

#### Scenario: A reply cannot add a question

- **WHEN** a reply names a question the Igor did not post, or an option it did not offer
- **THEN** nothing happens

#### Scenario: An answer on an artifact the Igor did not author is only an ordinary mention

- **WHEN** a reply chooses an option on a pull request the Igor did not author
- **THEN** it is treated as an ordinary mention, which may only be answered

#### Scenario: Mentioning a different Igor routes the answer

- **WHEN** a reply answers a question but mentions a different Igor than the one that asked
- **THEN** the mentioned Igor acts on the choice, matching it against what the asking Igor
  recorded, and within what its own role grants

#### Scenario: A question edited into the description is not a question

- **WHEN** someone edits the artifact's description to add a question or an option the Igor never
  recorded, and a reply chooses it
- **THEN** nothing happens
