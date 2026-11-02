## Purpose

Let people with write access to a repository direct the Igors working in it by mentioning them.
A mention can get an answer, have an issue filed, choose among options an Igor offered in a
numbered question on an artifact it authored, or bring an item to triage; it never widens what the role permits. Content an Igor ingests from items is
data, never instruction, and conversation is bounded by budget, not by a count of replies.

## ADDED Requirements

### Requirement: An Igor learns it was addressed by being mentioned

An Igor SHALL learn that it was addressed from a source of mentions of its own account on the
repositories its `sources` name, reached as `work-discovery`'s *Nothing may require inbound
reachability* allows. A mention passes the same watermark, screening and triage as any source.
The source SHALL check the author's authority before it hands the item on, so an item outside
the role's query enters triage only by a mention from someone with authority.

#### Scenario: Mentioned on an item discovery would not return

- **WHEN** a person with write access mentions the Igor on an item outside its query
- **THEN** the item reaches triage

#### Scenario: A stranger cannot bring an item to triage

- **WHEN** someone without write access mentions the Igor on an item outside its query
- **THEN** the mentions source does not hand the item on, and it does not reach triage

#### Scenario: A mention on a repository the role does not work

- **WHEN** someone with write access mentions the Igor on a repository no source of its role names
- **THEN** the item does not reach triage

#### Scenario: No inbound endpoint

- **WHEN** an Igor is addressed
- **THEN** it learns of it by querying the surface, or over a connection the Igor itself opened,
  never through an endpoint that accepts inbound connections

### Requirement: An answered mention is not answered again, and a stop is read as a stop

Every run a mention starts SHALL end with a reply from the role's bot account linking the
mention, which makes it answered; a reply giving only when the role's seats reset does not. The Igor SHALL
NOT answer an answered mention, or one it holds a claim to act on. Where an issue links the
mention and no reply does, the Igor SHALL post that reply.

A stop or go-ahead under `work-claiming` SHALL be read as that, never as a request; a stop holds
back answers as it holds back work.

#### Scenario: A reply makes the mention answered

- **WHEN** the Igor replied to a mention, linking it, and the item comes back through the
  mentions source because the reply updated it
- **THEN** the Igor does not answer the mention again

#### Scenario: An answer that acted stays answered

- **WHEN** the Igor acted on a chosen option, posted its reply linking the mention, and released
  its claim
- **THEN** the mention still counts as answered, and the option is not acted on again

#### Scenario: A claim under way holds back a second answer

- **WHEN** the Igor holds a claim it took to act on a mention, and the mention comes back
- **THEN** it does not answer the mention again

#### Scenario: The reset time is not an answer

- **WHEN** no process of the role could answer, and the role replied with when its seats reset
- **THEN** the mention is still unanswered, and is answered once a process can

#### Scenario: Filed, but the reply was never posted

- **WHEN** an issue already links a mention and no reply from the role's bot account links it
- **THEN** the Igor files nothing and posts the reply, with the issue's link

#### Scenario: A stop that mentions the Igor

- **WHEN** someone comments "@igor-backend stop" on an item the backend Igor holds
- **THEN** the Igor stops, as for any stop
- **AND** it does not treat the comment as a request

#### Scenario: A go-ahead that mentions the Igor

- **WHEN** someone comments "go ahead @igor-backend" on an item the backend Igor was stopped on
- **THEN** the stop is lifted, as for any go-ahead, and no reply is composed for it

#### Scenario: A stop holds back answers too

- **WHEN** someone stops the Igor on an item, and a person with write access then mentions it
  there before the role's cooldown after a stop ends
- **THEN** the Igor answers once the item is eligible again, not before

### Requirement: A mention narrows what an Igor may do

A writer's mention SHALL get work done only on an open artifact the Igor authored, or an open
issue with no work in flight that no other party holds or is assigned to. Else it SHALL get only
a reply, which claims nothing, starts no work, and holds a change short enough to read rather
than describing it. A role without `comment` cannot post a reply, so it neither answers nor
acts. A mention MUST NOT widen the role. Anything beyond a reply SHALL take a claim first.

#### Scenario: Asked for help on an item somebody holds

- **WHEN** the person an item is assigned to, who has write access, mentions the Igor on it
- **THEN** the Igor investigates and answers
- **AND** it does not claim the item, and the assignee keeps it

#### Scenario: Asked for work on a closed item

- **WHEN** someone with write access asks the Igor to fix something on a closed issue
- **THEN** the Igor answers, and does not reopen or work the issue

#### Scenario: Asked to work on a pull request the Igor did not author

- **WHEN** someone with write access mentions the Igor on a person's pull request and asks it to
  change the code
- **THEN** the Igor answers, and changes nothing on the pull request

#### Scenario: A mention cannot widen the action space

- **WHEN** a mention asks for something outside the role's permissions
- **THEN** the action is refused, as it would be without the mention

#### Scenario: A role that may not comment answers nothing

- **WHEN** an Igor whose role's `allow` lacks `comment` is mentioned, even with a request that
  would act
- **THEN** it posts nothing and acts on nothing

#### Scenario: An answer that acts takes a claim first

- **WHEN** someone with write access asks the Igor to file an issue from an item nobody holds
- **THEN** the Igor claims that item before it files the issue

#### Scenario: The answer carries the change

- **WHEN** the investigation produces a change small enough to read
- **THEN** the reply contains it, rather than describing that a change exists

### Requirement: Authority to instruct is write access on the artifact

An Igor SHALL act on an instruction only from a party with write access to the repository
holding the artifact, as `surface-adapter`'s *A tracker adapter reads whether a party may write
to a repository* reports it; organization membership does not count. It SHALL ignore a mention
from anyone else, or from a bot account whatever its read says. It SHALL decline, in a reply, a
requested action the requester could not take directly, as `docs/architecture.md` §5.4 says.

#### Scenario: A colleague with write access directs work

- **WHEN** someone with write access asks the Igor to act within its lane and permissions, on
  an open issue nobody else holds or is assigned, with no work in flight
- **THEN** it acts

#### Scenario: A stranger's mention changes nothing

- **WHEN** someone without write access mentions the Igor
- **THEN** no reply is composed and no work is done on account of the mention
- **AND** the item is still eligible on its own merits

#### Scenario: Authority is read per repository

- **WHEN** a party has write access to one repository and not another
- **THEN** their authority applies only where they hold it

#### Scenario: A bot's mention is ignored

- **WHEN** a bot account mentions the Igor, such as another Igor's App or `dependabot[bot]`
- **THEN** no reply is composed and no work is done, even if its permission read shows write
  access

#### Scenario: An action beyond the requester's own reach is declined

- **WHEN** someone with write access asks for an action the role allows, and a rule on the
  repository, such as branch protection, forbids that person from taking it themselves
- **THEN** the Igor declines

#### Scenario: Organization membership is not authority

- **WHEN** a member of the repository's organization without write access to the repository
  mentions the Igor
- **THEN** the mention is treated as a stranger's

#### Scenario: A permission read that fails grants nothing

- **WHEN** the read of a mention author's permission fails
- **THEN** the mention is treated as a stranger's

### Requirement: A requester's words are ingested content

A mention's text, and a reply's, SHALL reach the worker as content ingested from a surface,
under `task-execution`'s *The worker receives standing instructions and the normalized item*.
The words SHALL grant no authority; only the requester's, read from the surface, does.

#### Scenario: A requester's words are delimited

- **WHEN** a mention from someone with write access is passed to the worker
- **THEN** its text is delimited as untrusted content, as an item's comments are

### Requirement: Conversation is bounded by budget, not by a count of exchanges

Answering mentions, acting or not, SHALL spend at most `conversation_share`, a role-file
fraction of the role's budget: what `budget_share` lets it spend from its seats in each of their
windows, the tightest limit governing. Unset, only that budget bounds it. Work a request starts is not
answering. The execution log SHALL mark each answering run. A mention left unanswered because
the share is spent SHALL be answered later. Nothing SHALL limit the number of replies.

#### Scenario: Talking cannot starve work

- **WHEN** answering would spend more than the role's `conversation_share` of its budget
- **THEN** the Igor stops answering and work continues
- **AND** the mention is not passed over, and is answered once the share allows

#### Scenario: A fourth question is answered

- **WHEN** a colleague with write access asks a fourth question on one item
- **THEN** it is answered, budget permitting

#### Scenario: An unset share leaves only the budget

- **WHEN** no role level sets `conversation_share`
- **THEN** answering is bounded only by the role's budget

#### Scenario: An answering run is marked

- **WHEN** a run answers a mention
- **THEN** its entry in the execution log marks it as answering one

### Requirement: Ambiguity is asked about rather than guessed at

Where an item cannot be acted on as written, an Igor SHALL say what it needs rather than choose
an interpretation, and the number of such questions SHALL NOT be capped. The item then waits as
`work-triage`'s *An item handed back is not re-worked until something answers* says.

#### Scenario: An item that does not say enough

- **WHEN** a worker cannot act on an item as written
- **THEN** the message on the item says what would let it proceed

#### Scenario: A second question is asked too

- **WHEN** a person's answer still leaves the item unclear
- **THEN** the Igor asks again, and nothing stops it at a count

#### Scenario: The question waits for its answer

- **WHEN** a question has been asked on an item
- **THEN** the item is held as a handed-back item is, until what lifts that hold happens

### Requirement: A requested item records who asked and what they said

Where work is done because somebody asked, the run's entry in the execution log on the state
branch SHALL name the requester and carry their words.

#### Scenario: A request is traceable to its requester

- **WHEN** an Igor acts because it was asked
- **THEN** the record names who asked and what they wrote

#### Scenario: Discovered work is unchanged

- **WHEN** an Igor acts on an item it discovered
- **THEN** the record names no requester, because the role's discovery query is the provenance

### Requirement: A person with authority can have an Igor file an issue

Asked by someone with write access, where a mention may get work done, the Igor SHALL open an
issue on the claiming tracker, on GitHub in the item's repository, carrying what was asked,
linking the mention and naming who asked, unless an issue already links that mention. No `@` it
copies SHALL notify anybody. The run that files the issue SHALL NOT work it; the issue enters
discovery like any other. A role that does not grant opening an issue SHALL NOT file one from a
mention.

#### Scenario: Asked to file an issue by someone with authority

- **WHEN** someone with write access mentions an Igor on a pull request the Igor authored and
  asks for an issue
- **THEN** the Igor opens one in that repository, naming what was asked, where, and by whom
- **AND** it does not begin the work

#### Scenario: An issue already links the mention

- **WHEN** an Igor reads a mention asking for an issue, and an issue already links it
- **THEN** the Igor files no second issue

#### Scenario: A copied mention notifies nobody

- **WHEN** the request quotes `@alice`
- **THEN** the filed issue shows the name, and Alice is not notified

#### Scenario: A backtick in the copied words does not free a mention

- **WHEN** the request's words hold a backtick before `@alice`, which would end a code span
  around them
- **THEN** the filed issue still notifies nobody

#### Scenario: A blank line in the copied words does not free a mention

- **WHEN** the request's words hold a blank line before `@alice`, which would also end a code
  span
- **THEN** the filed issue still notifies nobody

#### Scenario: A filed issue is discovered like any other

- **WHEN** a filed issue matches a role's query and lane
- **THEN** that role's Igor finds and triages it as it would any issue, whichever Igor filed it

#### Scenario: A role that may not open issues does not

- **WHEN** an Igor whose role does not grant opening issues is asked to file one
- **THEN** it declines, as it would decline any action its role does not grant

### Requirement: An answer to a question the Igor asked may be acted on

An Igor MAY ask numbered questions, options lettered, in the description of an artifact it
authored, writing each question and its options to the execution log as its question record.
Where a reply from someone with write access mentions the asker and names a question and option,
such as `2b`, the asker SHALL act on that option within its role. The choice SHALL be matched
against the question record, never against the artifact's text.

#### Scenario: The question goes in the description

- **WHEN** an Igor asks a numbered question on an artifact it authored
- **THEN** it posts the question in the artifact's description, where a reader of the artifact
  sees it, and the answer arrives as a comment, which shows who wrote it
- **AND** the execution log holds a question record with each question and its options

#### Scenario: A reply from someone without write access chooses nothing

- **WHEN** someone without write access replies to an Igor's question, choosing an option
- **THEN** nothing is acted on, since authority is checked against the reply's author

#### Scenario: An answer selects an option the Igor offered

- **WHEN** an Igor posted a numbered question with options on its own pull request, and someone
  with write access replies mentioning it and writing `2b`
- **THEN** the Igor acts on option b of question 2

#### Scenario: A reply cannot add a question

- **WHEN** a reply names a question the Igor did not post, or an option it did not offer
- **THEN** nothing happens

#### Scenario: An answer on an artifact the Igor did not author is only an ordinary mention

- **WHEN** a reply chooses an option on a pull request the Igor did not author
- **THEN** it is treated as an ordinary mention, which may only be answered

#### Scenario: Mentioning a different Igor gets an answer only

- **WHEN** a reply chooses an option but mentions a different Igor than the one that asked
- **THEN** the mentioned Igor answers only, as on any artifact it did not author
- **AND** nothing acts on the option

#### Scenario: A question edited into the description is not a question

- **WHEN** someone edits the artifact's description to add a question or an option the Igor never
  recorded, and a reply chooses it
- **THEN** nothing happens
