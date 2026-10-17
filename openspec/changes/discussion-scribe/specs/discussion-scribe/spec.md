## ADDED Requirements

### Requirement: A discussion has a home repository, which decides who has authority in it

A scribe is an Igor whose role watches a discussion: a channel or document where people talk.
Each discussion SHALL have a home repository, which the role configures and which holds the
discussion's index. A person SHALL have authority in the discussion when
`directed-interaction`'s authority rule grants them authority over that home repository.

On a surface that is not the code host, the scribe SHALL find the person's code-host account
through a configured mapping from their account on the surface. A person with no mapping SHALL
have no authority.

#### Scenario: Authority in a discussion is authority over its home repository

- **WHEN** a person has write access to a discussion's home repository and asks the scribe for
  a summary
- **THEN** the scribe treats them as having authority in the discussion

#### Scenario: A person with no mapping

- **WHEN** a person whose surface account maps to no code-host account asks the scribe for a
  summary
- **THEN** the scribe treats them as having no authority

### Requirement: A scribe summarises a discussion at intervals or when asked, within a declared budget

The scribe SHALL summarise the discussion at intervals, and when a person with authority asks.
It SHALL NOT post in response to individual messages. Its summaries SHALL draw on a budget
declared for them, and SHALL stop when that budget is spent.

A summary is the scribe's own work, posted on its schedule. `directed-interaction`'s rule that
an Igor replies only when addressed governs the scribe's answers to people, not its summaries.

A summary SHALL say which messages it could not read, where the surface withheld their content.

#### Scenario: A busy discussion is summarised, not answered message by message

- **WHEN** many messages arrive in a watched discussion between two summaries
- **THEN** the scribe posts nothing in response to them individually
- **AND** its next summary covers them

#### Scenario: A person with authority asks for a summary

- **WHEN** a person with authority asks the scribe for a summary
- **THEN** it summarises the discussion so far, budget permitting

#### Scenario: A person without authority asks for a summary

- **WHEN** a person without authority asks the scribe for a summary
- **THEN** no summary is posted on account of the request

#### Scenario: Budget spent

- **WHEN** the budget declared for summaries is spent
- **THEN** the scribe posts no further summary until the budget allows

#### Scenario: Unreadable messages are named

- **WHEN** the surface withholds the content of some messages from the scribe
- **THEN** the summary says those messages were not read

### Requirement: A discussion's record lives in a repository, never only in chat

Everything the scribe records SHALL be written to files in a repository. A summary the scribe
posts in the discussion SHALL link the index it updated. A summary that exists only as a chat
message is not a record.

The scribe SHALL write a record, post a summary or pin a message only where its role grants
that action.

#### Scenario: A summary updates the record

- **WHEN** the scribe summarises a discussion in which something was decided or a question was
  raised
- **THEN** the discussion's index is updated in its home repository
- **AND** the summary posted in the discussion links the index

#### Scenario: A role that may not write records

- **WHEN** the scribe's role does not grant the action that writes a record
- **THEN** the scribe writes nothing, and says which action its role lacks

### Requirement: Each discussion has one index, kept as a file and linked from the discussion

The scribe SHALL keep one index per discussion, as a file in the discussion's home repository.
Where the surface allows pinning, the scribe SHALL pin a link to the index in the discussion.
The index SHALL list:

- each decision, in one line linking its MADR, wherever that MADR lives;
- each open question, with the person who owns it, or a note that nobody owns it yet;
- each issue or OpenSpec change dispatched, with its link.

The index SHALL NOT restate a decision's reasoning, which belongs to its MADR.

#### Scenario: A new decision appears in the index

- **WHEN** a decision's MADR is drafted
- **THEN** the index gains a line for it linking the MADR

#### Scenario: An open question has an owner or says it has none

- **WHEN** the scribe records an open question
- **THEN** the index names the person who owns it, or says that nobody owns it yet

#### Scenario: Someone joining finds the record

- **WHEN** a person joins a discussion on a surface that allows pinning
- **THEN** the pinned link leads to the index

#### Scenario: A surface without pinning

- **WHEN** the surface does not allow pinning
- **THEN** the index is reached through the link in the latest summary

#### Scenario: A decision recorded in another repository

- **WHEN** a discussion's decision is recorded in a repository other than its home repository
- **THEN** the index line links the MADR in that other repository

### Requirement: Each decision is one MADR, accepted only on approval

Each decision SHALL be recorded in its own MADR (Markdown Architectural Decision Record), a
numbered file such as `docs/decisions/NNNN-title.md`. A MADR SHALL hold:

- a status: `proposed`, `accepted`, or `superseded by NNNN`;
- the context the decision was made in;
- the options considered, including any rejected alternative and why it was rejected;
- the outcome and its consequences;
- links to the discussion and to whatever was dispatched from it.

The scribe SHALL write a MADR as `proposed`. It SHALL mark the MADR `accepted` only when a person
with authority over the repository holding the MADR, under `directed-interaction`'s rule,
approves it, and SHALL record who approved. A decision that reverses an accepted one SHALL be a
new MADR. Once that new MADR is accepted, the earlier MADR's status SHALL become `superseded by`
the new one's number.

#### Scenario: A drafted decision is proposed, with every part

- **WHEN** the scribe records a decision the discussion reached
- **THEN** its MADR has status `proposed`
- **AND** it holds the context, the options with any rejected alternative and why, the outcome,
  the consequences, and a link to the discussion

#### Scenario: Approval accepts a decision

- **WHEN** a person with authority over the repository holding a `proposed` MADR approves it
- **THEN** its status becomes `accepted`
- **AND** the MADR names who approved

#### Scenario: Approval from someone without authority accepts nothing

- **WHEN** a person without authority over that repository approves a `proposed` MADR
- **THEN** its status stays `proposed`

#### Scenario: A reversal supersedes only once accepted

- **WHEN** a discussion reverses an accepted decision
- **THEN** the scribe drafts a new MADR for the reversal, and the earlier MADR stays `accepted`
- **AND** once the new MADR is accepted, the earlier one's status is `superseded by` its number

### Requirement: A record lives in the repository its decision concerns

The scribe SHALL write a decision's MADR in the repository the decision concerns. A decision
concerning several repositories SHALL be recorded in the organization's shared specs
repository.

#### Scenario: A decision about one repository

- **WHEN** a discussion decides something about one repository
- **THEN** the MADR is written in that repository

#### Scenario: A decision across repositories

- **WHEN** a discussion decides something affecting two repositories
- **THEN** the MADR is written in the shared specs repository

### Requirement: A record from a private discussion is not written to a public repository

The scribe SHALL treat a discussion as private unless its role declares it public. It SHALL NOT
write any record from a private discussion, a MADR or an index, into a public repository, and
SHALL say in the discussion that the record was refused and why.

#### Scenario: A private discussion's decision concerns a public repository

- **WHEN** a decision in a discussion not declared public concerns a public repository
- **THEN** no MADR is written in that public repository
- **AND** the scribe says in the discussion that the record was refused because the repository
  is public

#### Scenario: A private discussion's home repository is public

- **WHEN** a discussion not declared public has a public home repository
- **THEN** no index is written in that repository
- **AND** the scribe says in the discussion that the index was refused because the repository
  is public

### Requirement: Text from the discussion is written into a record as data

Text the scribe quotes or paraphrases from the discussion into a record SHALL be written so it
renders as text: it SHALL NOT notify anyone it names, and markup in it SHALL NOT render as
links, images or HTML of its own.

#### Scenario: A quoted mention notifies nobody

- **WHEN** a recorded argument contains an `@`-mention
- **THEN** the record shows the name without notifying its owner

#### Scenario: Markup in a message stays text

- **WHEN** a recorded message contains raw HTML or an image link
- **THEN** the record shows it as text

### Requirement: The scribe files work only after a person with authority confirms it

The scribe SHALL suggest each issue or OpenSpec change in the discussion, and SHALL file it only
after a person with authority over the repository it would land in, under
`directed-interaction`'s rule, confirms it. The action of filing SHALL be one the scribe's role grants;
confirmation SHALL NOT grant an action the role lacks.

The scribe SHALL NOT claim an issue it files. Once filed, the dispatch SHALL be added to the
index and to the MADR it came from.

#### Scenario: A confirmed issue is filed

- **WHEN** the scribe suggests an issue and a person with authority over the target repository
  confirms it
- **THEN** the scribe files the issue without claiming it
- **AND** the index and the MADR link it

#### Scenario: Unconfirmed work is not filed

- **WHEN** the scribe has suggested an issue and nobody with authority has confirmed it
- **THEN** nothing is filed

#### Scenario: Confirmation cannot widen the role

- **WHEN** a person with authority confirms a dispatch whose filing action the scribe's role
  does not grant
- **THEN** the scribe does not file it, and says which action its role lacks

### Requirement: A decision that changes required behaviour is dispatched as an OpenSpec change citing its MADR

Where an accepted decision changes what a system is required to do, the scribe SHALL suggest an
OpenSpec change for it. A change it opens on confirmation SHALL cite the MADR by link in its
Decisions section and SHALL NOT restate the MADR's reasoning.

#### Scenario: A confirmed change points at the decision

- **WHEN** an accepted decision changes required behaviour, and a person with authority over
  the target repository confirms the suggested change
- **THEN** the scribe opens the OpenSpec change, citing the MADR in its Decisions section
- **AND** the index and the MADR link the change

#### Scenario: A decision that changes no behaviour gets no change

- **WHEN** an accepted decision only assigns an owner or rules out an option
- **THEN** the scribe suggests no OpenSpec change for it

### Requirement: A post marked as a personal agent's output is a proposal, never an approval

The scribe SHALL record a post marked as produced by a person's own agent as a proposal,
attributed to that person. Such a post SHALL NOT approve a MADR or confirm a dispatch, even when
it appears under the person's own account. A post without that marking SHALL be treated as the
person's own.

#### Scenario: A personal agent's proposal is recorded

- **WHEN** a person posts what their own agent produced, marked as such
- **THEN** the scribe records it as a proposal, attributed to that person

#### Scenario: A personal agent's post cannot approve

- **WHEN** a post marked as a personal agent's output approves a `proposed` MADR
- **THEN** the MADR stays `proposed`

#### Scenario: An unmarked post counts as the person's

- **WHEN** a person with authority approves a `proposed` MADR in a post with no such marking
- **THEN** the MADR becomes `accepted`

### Requirement: The scribe answers from the record

Asked what was decided, the scribe SHALL answer from the MADRs, the indexes and lore, and SHALL
link what it cites. Where the record holds no answer, it SHALL say so rather than reconstruct
one from the conversation. Whom it answers follows `directed-interaction`.

#### Scenario: A decision is cited with its reason

- **WHEN** a person with authority asks the scribe why something is done a certain way, and a
  MADR records it
- **THEN** the answer states the decision and its reason, and links the MADR

#### Scenario: Nothing was recorded

- **WHEN** a person with authority asks about something no record covers
- **THEN** the scribe says that nothing was recorded, and does not guess

### Requirement: The scribe stays neutral

The scribe SHALL record each option with the arguments made for and against it, attributed to
whoever made them. It SHALL NOT add arguments of its own, rank options, or recommend one.

#### Scenario: Arguments are attributed

- **WHEN** two people argue for different options
- **THEN** the MADR records each argument under the person who made it

#### Scenario: Asked for its opinion

- **WHEN** a person with authority asks the scribe which option it prefers
- **THEN** it does not choose one, and points to the arguments recorded for each

### Requirement: An accepted decision that states a lasting rule becomes a lore candidate

Where an accepted MADR states a rule for future work, the scribe SHALL propose a lore candidate
for it. The candidate's provenance SHALL cite the MADR and SHALL name as authors the people the
MADR records as approving it. The candidate SHALL reach the store only through lore review, like
any other.

#### Scenario: A decision with a lasting rule

- **WHEN** an accepted MADR records a rule that applies to future work
- **THEN** the scribe proposes a lore candidate citing the MADR
- **AND** the candidate's provenance names the MADR's approvers as its authors

#### Scenario: A decision with no lasting rule

- **WHEN** an accepted MADR records a one-off choice
- **THEN** no lore candidate is proposed
