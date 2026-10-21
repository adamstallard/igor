## MODIFIED Requirements

### Requirement: Lore reaches the worker unbidden

Active, in-scope entries that *Status and scope are exact filters, always applied* lets fire
SHALL be injected into the worker's context before it runs, whenever they fit the firing budget
(*Exceeding the budget is reported, never silently resolved*). The worker MUST NOT be required
to request them.

Every worker SHALL be offered igor's search over the lore store, `igor lore-search` (*An Igor
runs its worker's lore searches*). A *search* here is a lookup over the
store made to find lore or an answer for an agent. An agent works *during an Igor's run* when it
works for an Igor, under that Igor's role: for example a worker on an item, or an agent running
a skill such as shared-skills' inquisitor, which an Igor runs before asking a person a question.
A search such an agent makes is a *search during a run*.

An entry's scope *covers* a role when firing's scope rule, from *Status and scope are exact
filters, always applied*, admits the entry for that role: its scope is `global`, `role:` naming
that role, or `project:` naming a repository that role works.

A search during a run SHALL apply that rule for the run's role. It MUST NOT return an entry
whose scope does not cover that role, nor give any count or mention of one.

A search may also find the question and miss files on the destination repository's `questions`
branch, as the inquisitor's first filter does; *An Igor publishes the citations its worker
reports* defines that repository and branch. A *question file*, which shared-skills #25 calls a
*log file*, logs a question an agent asked or decided for itself, and a *miss file* logs a
question a person said should have been settled without asking them, both in the format #25
sets. The scope of a file on a destination repository's
`questions` branch covers every role whose Igor uses that destination repository, whichever repository
its `repository` key names.

A search during a run SHALL present only `active` entries as lore. It MAY also return an
in-scope `provisional` or `deprecated` entry, and SHALL label each one with its status, as not
lore. It SHALL label each question file it returns as the inquisitor's first filter (filter 1
in shared-skills #25) labels it. A question file whose frontmatter holds no `authority` key
holds no answer, and is labelled as unanswered. One that holds an answer is labelled as #25's
*Only an answer with authority stops a question* labels it: as an answer only when it passes
every check of that requirement, and otherwise as input, which does not settle the question,
with the label #25 gives it, such as unconfirmed. A check
that cannot be run counts as failed. Among that requirement's checks is #25's rule that, during an
Igor's run, a file whose `repository` key names a repository other than the item's is input,
never an answer. A miss
file, which #25's format tells apart from a question file, is labelled as a miss. Neither kind
of file is labelled as lore.

A search's results SHALL come back to the agent as search output, delimited as data, as
`task-execution` delimits a work item's text. They MUST NOT be placed in the trusted channel
that carries injected lore (*Injected lore is trusted; the work item is not*).

A check that compares a candidate entry against the store, to avoid proposing a duplicate, is
curation and not a search. It MAY compare against `provisional` entries, and against
candidates a reviewer has already rejected. During an Igor's run, it MUST NOT compare against an
entry or a rejected candidate whose scope does not cover the run's role, and a rejection that
records no scope counts as outside it. A rejection *records a scope* when its file holds the
rejected candidate's `scope`. Checking that a candidate's id is free is not
such a check: *An entry already in the store is never overwritten by proposing* governs it.

A search's results MUST NOT be recorded as firings.

#### Scenario: Entries present without being requested

- **WHEN** a worker begins an item and matching entries exist
- **THEN** those entries are already in its context
- **AND** it issued no query to obtain them

#### Scenario: Injection does not wait on a search

- **WHEN** a worker is offered a search over the store and never uses it
- **AND** the active, in-scope entries fit the firing budget
- **THEN** those entries are in its context all the same

#### Scenario: A search never shows an out-of-scope entry

- **WHEN** a search during a run matches an entry scoped to another role, or to a project the
  run's role does not work
- **THEN** that entry is not returned
- **AND** the results give no count or mention of it

#### Scenario: A search shows a questions-branch file from any repository

- **WHEN** a search during a run matches a question file on the Igor's destination repository's
  `questions` branch whose `repository` key names a repository the run's role does not work
- **AND** the file's `asked_from` key names the repository of the item the run works
- **AND** the repository of the item the run works is no more visible than the repository the
  `repository` key names
- **THEN** that file is returned, delimited as data
- **AND** it is labelled as input or as unanswered, as the inquisitor's first filter labels
  it, and never as an answer or as lore

#### Scenario: A search labels in-scope entries that are not active

- **WHEN** a search during a run matches an in-scope `provisional` entry, an in-scope
  `deprecated` entry and an in-scope `active` entry
- **THEN** only the `active` entry is presented as lore
- **AND** each of the other two that is returned is labelled with its status, as not lore

#### Scenario: Search results never arrive as injected lore

- **WHEN** a search during a run returns entries
- **THEN** they reach the agent as search output
- **AND** none is placed in the channel that carries injected lore

#### Scenario: A search hit is not a firing

- **WHEN** a search during a run returns an entry
- **THEN** no firing is recorded for that entry

#### Scenario: A duplicate check is curation, not a search

- **WHEN** an Igor compares a candidate entry against the store during its run, to avoid
  proposing a duplicate
- **THEN** it may compare against `provisional` entries and rejected candidates
- **AND** it compares against no entry or rejected candidate whose scope does not cover that
  Igor's role, nor against a rejection that records no scope

### Requirement: Status and scope are exact filters, always applied

Only entries whose status is `active` SHALL fire. Only entries whose scope covers the running
role SHALL fire. Both filters are exact and MUST NOT be delegated to any inexact mechanism.

An entry whose scope is `project:` SHALL NOT fire into a run when the repository of the item
the run works is more visible than the repository the scope names, where private is less
visible than internal and internal less than public. The repository a `project:` scope names
is the repository the running role works whose short name, the part after the `/`, is the
name the scope gives. Where two repositories the role works share that name, it is the more
private of them. The Igor reads both visibilities from GitHub when it injects. A repository the scope
names whose visibility it cannot read counts as private, and an item's repository whose
visibility it cannot read counts as public. An entry this filter keeps out counts as out of
scope for firing: it neither fires nor counts toward the firing budget, and *The whole in-scope
store is injected while it fits* does not count it. The filter is not part of the scope rule by
which a scope *covers* a role.

These are review state and visibility, not relevance. A wrong relevance judgment costs a
worker some attention; a wrong visibility judgment shows one team's material to another.

#### Scenario: Provisional entries do not fire

- **WHEN** an entry is `provisional`
- **THEN** it does not reach the worker, however well it matches
- **AND** review therefore determines what an Igor knows

#### Scenario: Out-of-scope entries do not fire

- **WHEN** an entry is scoped to a project the running role does not cover
- **THEN** it does not reach the worker

#### Scenario: Deprecated entries do not fire

- **WHEN** an entry is `deprecated`
- **THEN** it does not reach the worker

#### Scenario: A project entry about a more private repository does not fire

- **WHEN** a run works an item in public repository Y
- **AND** an `active` entry is scoped `project:` naming private repository X, one of the
  running role's sources
- **THEN** the entry is not injected into the worker
- **AND** it does not count toward the firing budget

#### Scenario: An unreadable visibility keeps a project entry from firing

- **WHEN** a run works an item in a public repository, and the Igor cannot read the visibility
  of the repository an `active` entry's `project:` scope names
- **THEN** that entry does not fire into the run

#### Scenario: An unreadable item visibility keeps a private project entry from firing

- **WHEN** the Igor cannot read the visibility of the repository a run's item is in
- **AND** an `active` entry's `project:` scope names a private repository the role works
- **THEN** that entry does not fire into the run

#### Scenario: A project scope names the more private of two sources with its name

- **WHEN** the running role's sources include a private and a public repository that share the
  short name `api`
- **AND** a run works an item in a public repository
- **THEN** an `active` entry scoped `project:api` does not fire into that run

## ADDED Requirements

### Requirement: An Igor publishes the citations its worker reports

A *citation* is an agent's record that a lore entry answered a question, so that no person was
asked. A *run* is one execution of an item, with every worker run it starts, as `task-execution`'s
*Transcripts and outcomes are captured to the state branch* defines it. The *destination repository* is the repository the configuration key `destination` names, from which the run's lore store is read. The `questions` branch, the state branch and shared-skills #25's relay files are in it too. A question
has a *category* when shared-skills #25's inquisitor gives it one: `vulnerability`, `secret`
or `personal`.

During an Igor's run, the worker SHALL report each citation it makes, by the cited entry's id
and nothing else, and the Igor reads only that id from a report. The worker SHALL NOT report a
citation for a question with a category. When the Igor runs the inquisitor skill itself, with
no worker, each citation that run makes SHALL be handled as a worker's report is below, and
none SHALL be made for a question with a category.

When the run publishes an artifact, or ends in the Igor's handoff comment on the item
(*graceful-handoff*), the Igor SHALL push the run's citations to the destination repository's
`questions` branch. A run that publishes neither SHALL push no citations, and nor SHALL a run
that `task-execution`'s *Transcripts and outcomes are captured to the state branch* treats as
having met a question with a category. The worker holds no
credential for the destination repository (*The worker is given an explicit environment holding no
credential but its seat's*), and the role's `allow` list does not govern the push (*Only
reversible artifacts are produced*).

The Igor SHALL push a citation only when its id names an entry that is `active`, with a scope
that covers the run's role, in the lore store as the run read it. The Igor SHALL refuse any
other citation, and a refused citation writes nothing to the destination repository.

The `questions` branch is an orphan branch of the destination repository, separate from the state
branch where the Igor records its runs. The Igor SHALL create it, as an orphan, where it is
missing. Each citation SHALL be written to it in the format that shared-skills #25's
requirement
[*A citation file has one format*](https://github.com/adamstallard/shared-skills/blob/spec/inquisitor/openspec/changes/inquisitor/specs/inquisitor/spec.md)
sets for a citation an Igor pushes from a run. That format has a `run` key, whose value is the
*run's id*: a random identifier the Igor mints for the run. The *run's record* is the run's row
in the execution ledger, `executions/<yyyy-mm-dd>.ndjson` on the state branch, which has one row per run. The Igor records the run's id there,
with the run's item, time and outcome. Where a push is rejected because the branch moved, the
Igor SHALL retry it on the branch's new tip, at most three times; a citation still not pushed
after the third retry counts as failed to push.

Under `igor run`, which reads the lore store as it finds it, the Igor SHALL fetch only the destination
repository's `questions` branch, and only when it pushes a run's citations or questions-branch
files, to check what the branch holds and retry on its new tip. It SHALL apply nothing it
fetches to the lore checkout: its default branch and working tree stay as they were.

A citation SHALL go to no place more visible than the repository the question concerns, where
private is less visible than internal and internal less than public. During a run, the
repository the question concerns is the repository of the item the run works; the Igor never
takes it from the worker's output. A destination repository whose visibility the Igor cannot read
counts as public, and a repository the question concerns whose visibility it cannot read counts
as private. The Igor SHALL read the visibility of the item's repository when it pushes. A citation that
this rule withholds is not pushed.

The Igor SHALL learn the destination repository's visibility by asking GitHub for its exact
visibility, `private`, `internal` or `public`, at each push to the `questions` branch, one
call per push, and the citation rule above SHALL use that push's answer. The `publicStore`
setting SHALL NOT decide it. When GitHub's answer cannot be read, the destination repository counts
as public.

The Igor SHALL record, in the run's record on the state branch, how many of the run's
citations it did not push, by reason: refused, withheld by the visibility rule, failed to push,
the run published neither an artifact nor a handoff, or the run counts as having met a
question with a category. A citation is counted once, under the first of these reasons that
applies, in this order: the run met a question with a category, the run published neither,
refused, withheld, failed to push. These counts SHALL NOT repeat a
refused citation's id or any other text the worker wrote, and SHALL NOT say why a citation was
refused.

#### Scenario: A worker's citation is published by its Igor

- **WHEN** a worker reports that an `active` entry in the run's role's scope answered a
  question
- **AND** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the run does not count as having met a question with a category
- **AND** the destination repository is no more visible than the repository of the item the run works
- **THEN** the Igor pushes a citation of that entry to the destination repository's `questions` branch
- **AND** the worker held no credential for the destination repository

#### Scenario: A worker's report of a citation holds only the entry's id

- **WHEN** a worker reports a citation
- **THEN** the report holds the cited entry's id and nothing else: no category, for example
- **AND** the Igor reads only that id from it

#### Scenario: A worker reports no citation for a question with a category

- **WHEN** an `active` entry in the run's role's scope answers a worker's question that has a
  category
- **THEN** the worker reports no citation for it

#### Scenario: A citation from the Igor's own inquisitor run is pushed under the same rules

- **WHEN** the Igor runs the inquisitor skill itself, with no worker, and an `active` entry in its
  role's scope answers a question with no category
- **AND** the run ends in the Igor's handoff comment on the item
- **AND** the destination repository is no more visible than the repository of the item the run works
- **THEN** the Igor pushes a citation of that entry to the destination repository's `questions` branch

#### Scenario: The Igor's own inquisitor run makes no citation for a question with a category

- **WHEN** the Igor runs the inquisitor skill itself and an entry answers a question with a category
- **THEN** the Igor makes and pushes no citation for that question

#### Scenario: A run that publishes nothing pushes no citations

- **WHEN** a worker reports a citation
- **AND** the run publishes no artifact and does not end in the Igor's handoff comment
- **THEN** the Igor pushes no citation for that run
- **AND** the run's record counts that citation as from a run that published neither

#### Scenario: A flagged run pushes no citations

- **WHEN** a worker reports a citation
- **AND** the run counts as having met a question with a category, because its worker reported
  the flag or because the provider refused it before its worker completed its report
- **AND** the run ends in the Igor's handoff comment on the item
- **THEN** the Igor pushes no citation for that run
- **AND** the run's record counts the citation as from a run that met such a question

#### Scenario: A citation takes the one citation-file format, with the run's id

- **WHEN** the Igor writes a citation to the `questions` branch
- **THEN** the file's path, its keys, and its commit's message, author, committer and date are
  those shared-skills #25's *A citation file has one format* sets for a citation an Igor pushes
  from a run
- **AND** its `run` is the run's id

#### Scenario: A citation is checked against the store as the run read it

- **WHEN** a worker cites an entry that was `active` and in the run's role's scope when the run
  read the store
- **AND** that entry is deprecated or rescoped on the destination repository before the Igor pushes
- **THEN** the Igor still pushes the citation, if the run's other rules allow it

#### Scenario: A citation's run can be found from its run id

- **WHEN** a review reads a citation's run id
- **THEN** the run's row in the execution ledger on the state branch holds the same id, with
  the run's item, time and outcome

#### Scenario: A missing questions branch is created as an orphan

- **WHEN** the Igor pushes a citation and the destination repository has no `questions` branch
- **THEN** it creates the branch with no history shared with any other branch

#### Scenario: A push that loses a race is retried

- **WHEN** the Igor's push of a citation is rejected because the `questions` branch moved
- **AND** it has retried that push fewer than three times
- **THEN** it pushes the citation again on the branch's new tip

#### Scenario: A push that keeps losing the race is counted as failed

- **WHEN** the Igor's third retry of a citation's push is rejected because the `questions`
  branch moved
- **THEN** it does not retry again
- **AND** the run's record counts one citation that could not be pushed

#### Scenario: A citation of an entry that cannot be cited is refused

- **WHEN** a worker reports a citation of an id that names no `active` entry whose scope covers
  the run's role
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused citation, without repeating its id or saying why

#### Scenario: A citation is not pushed somewhere more visible than its question

- **WHEN** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the repository of the item the run works is private and the destination repository is
  internal or public, or the item's repository is internal and the destination repository is public
- **THEN** the Igor does not push the citation
- **AND** the run's record counts one withheld citation

#### Scenario: The worker cannot choose the repository a question concerns

- **WHEN** a worker's output names a repository that a cited question concerns
- **THEN** the Igor ignores that name and judges visibility by the repository of the item the
  run works

#### Scenario: An unreadable visibility counts against pushing

- **WHEN** the Igor cannot read the destination repository's visibility, or the visibility of the
  repository of the item the run works, when it pushes
- **THEN** it treats the destination repository as public and the item's repository as private

#### Scenario: The item's repository's visibility is read at push time

- **WHEN** the repository of the item the run works was public when the Igor started, and is
  private when the Igor pushes the run's citations
- **AND** the destination repository is internal
- **THEN** the Igor withholds the citations

#### Scenario: The destination repository's visibility comes from GitHub, not publicStore

- **WHEN** the team's configuration sets `publicStore: false`
- **AND** GitHub reports the destination repository as `internal` when the Igor pushes
- **AND** the repository of the item the run works is private
- **THEN** the Igor withholds the run's citations
- **AND** the run's record counts each as withheld

#### Scenario: The destination repository's visibility is read at each push

- **WHEN** GitHub reported the destination repository as `private` when the Igor started
- **AND** the destination repository has since been made public
- **AND** the repository of the item the run works is private
- **THEN** the Igor asks GitHub again when it pushes the run's citations, and withholds them
- **AND** the run's record counts each as withheld

#### Scenario: A citation with two reasons is counted once, under the first

- **WHEN** a worker reports a citation of an id that names no `active` entry in the run's role's
  scope
- **AND** the run publishes no artifact and does not end in the Igor's handoff comment
- **THEN** the run's record counts that citation once, as from a run that published neither,
  and not as refused

#### Scenario: Under igor run, the Igor fetches the questions branch only to push

- **WHEN** a run under `igor run` publishes an artifact
- **AND** its worker reported a citation the Igor may push
- **THEN** the Igor fetches the destination repository's `questions` branch, and nothing else from the
  destination repository, and pushes the citation
- **AND** the lore checkout's default branch and working tree are unchanged

#### Scenario: Under igor run, a run with nothing to push fetches nothing

- **WHEN** a run under `igor run` ends with no citation or questions-branch file to push
- **THEN** the Igor fetches nothing from the destination repository

#### Scenario: A citation that cannot be pushed is counted

- **WHEN** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the Igor cannot push a citation to the `questions` branch
- **THEN** the run's record counts one citation that could not be pushed

### Requirement: An Igor publishes the questions-branch files its worker reports

A *questions-branch file* is a file that shared-skills #25's inquisitor puts on the destination
repository's `questions` branch: a log file for a question about an organization or a project,
including one that records an agent's own choice with `authority: agent`, or a miss file.

During an Igor's run, the worker SHALL report each questions-branch file it writes, on the
channel it reports citations on, and SHALL NOT push it. The worker SHALL report no such file
for a question with a category. When the Igor runs the inquisitor skill itself, with no worker,
each questions-branch file that run writes SHALL be handled as a worker's report is below.

The Igor SHALL push a run's questions-branch files to the destination repository's `questions` branch
only when the run publishes an artifact or ends in the Igor's handoff comment on the item, as
for the run's citations. It SHALL push none from a run that `task-execution`'s *Transcripts and
outcomes are captured to the state branch* treats as having met a question with a category.
The role's `allow` list does not govern the push (*Only reversible artifacts are produced*).

The Igor SHALL push a questions-branch file only when:
- it takes the format of shared-skills #25's
  [*A log file and a miss file have one format*](https://github.com/adamstallard/shared-skills/blob/spec/inquisitor/openspec/changes/inquisitor/specs/inquisitor/spec.md),
  with a readable `repository` key: one naming a repository as `owner/repo`, which the Igor
  checks before it looks up that repository's visibility;
- credential redaction, as #217's
  [*Credential redaction replaces every credential the Igor knows*](https://github.com/adamstallard/igor/blob/fix-213/openspec/changes/redact-state-branch/specs/task-execution/spec.md)
  defines it, would replace nothing in it;
- it is an unanswered log file, a log file holding `authority: agent` and `answered_by: agent`,
  a miss file, or a log file holding `authority: decision` or `input`, whose `answered_by` is
  not `agent`, that answers a question the Igor asked, as below;
- it holds no `asked_from` key, which only the Igor writes;
- no file is already at its path on the `questions` branch;
- the destination repository is no more visible than the repository of the item the run works, nor
  than the repository its `repository` key names. The visibility order, the rule for an
  unreadable visibility, and the reading of the destination repository's visibility at each push are
  those *An Igor publishes the citations its worker reports* sets, and the Igor reads the other
  two repositories' visibility when it pushes too.

These conditions hold whichever repository a file's `repository` key names, including one the
run's role does not work. The Igor SHALL refuse any questions-branch file that does not meet
every condition above, and a refused file writes nothing to the destination repository.

Once a file passes the checks above, and before it pushes the file, the Igor SHALL set the
file's `asked_from` key to the repository of the item the run works, as `owner/repo`.

A *handback comment* is the Igor's handoff comment on the item (*graceful-handoff*) when it
asks a question the run could not settle. A flagged run, as `task-execution` defines it, posts none: its handoff asks nothing,
as *graceful-handoff*'s *A handoff states what was done, what remains, and who could continue*
says, so the Igor records no handback question for it. When the Igor posts one, it SHALL record, on the
state branch under that item, each question it posted there as a hash, the question reduced
and hashed as shared-skills #25 reduces and hashes a question, with the handback comment's id
and the time the Igor posted it. The record SHALL hold no text of the question. The record,
never the comment's current text, says which questions the Igor asked. A log file holding
`authority: decision` or `input` *answers a question the Igor asked* when its `answer_link` is
a comment on the item the run works, and the text under its `## Question`, reduced and hashed
the same way, gives a hash the record holds for a handback comment the Igor posted on the item
before the answering comment.

The Igor SHALL NOT trust the `authority` a worker's log file holds. Before it pushes a log
file holding `authority: decision` or `input`, the Igor SHALL first write under the file's
`## Answer` the text of the comment its `answer_link` points to, word for word, a leading
`User says: ` included, with each line break written as one space so that it fits on one line
as #25's format requires, in place of the answer line the worker wrote. It SHALL write the whole
comment, even when it holds several sentences or quotes the question first, and even while
#25's format still says one sentence (the proposal's Still open, for #25). The worker's answer line only identifies which comment holds the answer,
and the Igor SHALL NOT record it as anyone's answer. The Igor SHALL then set the file's
`authority` itself, on the file as rewritten, by the checks of #25's *Only an answer with
authority stops a question* that prove a questions-branch `decision` file's writer through its
`answer_link` and confirm that its `answered_by` has write access to what the question
concerns. Where the `answer_link` is a comment by a person's relay App, the Igor SHALL first set
the file's `answered_by` to that person, whatever the worker wrote. It sets `decision` when
every one of those checks passes, and `input` when one fails or cannot be run. The credential
condition above SHALL then be checked again on the file as it will be pushed, and a file that
fails it is refused. Which comments count as a
person's relayed answer is #25's rule (its decision 216), and so is which relay file counts: a
person's relay file is `relays/<login>.yaml` in the destination repository, counted only when its last
change came from that person (its decision 225). This requirement does not restate those
rules. For those checks the Igor SHALL read #25's relay files from the destination repository's
default branch as its checkout last fetched it, never from the checkout's working tree, and
SHALL make each GitHub read as the installation of its App that covers the repository that
read is from, as
*An Igor runs its worker's lore searches* has its search do. A log file holding an answer is pushed
as a new file, beside the unanswered log file of the same question, which stays as it is. The Igor SHALL create the `questions` branch where it is missing, commit each file with the
message #25 sets for a commit to that branch and with no trailer, and fetch the branch and
retry a push that lost a race, as *An Igor publishes the citations its worker reports* does for
a citation. The run's
record SHALL count the run's questions-branch files that the Igor did not push, by the reasons
that same requirement counts citations by, each under the first that applies in the order
that requirement sets. These counts SHALL NOT repeat any text the worker wrote.

#### Scenario: A worker's question file is published by its Igor

- **WHEN** a worker reports a log file for a question about a project
- **AND** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the run does not count as having met a question with a category
- **AND** the file passes the format, credential and path rules
- **AND** the destination repository is no more visible than the item's repository, and no more
  visible than the repository the file's `repository` key names
- **THEN** the Igor pushes the file to the destination repository's `questions` branch
- **AND** the worker pushed nothing to the destination repository

#### Scenario: A worker's own choice and a miss are published the same way

- **WHEN** a worker reports a log file holding `authority: agent` and `answered_by: agent`,
  and a miss file
- **AND** each passes the rules a question file does
- **THEN** the Igor pushes both to the destination repository's `questions` branch

#### Scenario: A run that publishes nothing pushes no questions-branch files

- **WHEN** a worker reports a questions-branch file
- **AND** the run publishes no artifact and does not end in the Igor's handoff comment
- **THEN** the Igor pushes no questions-branch file for that run
- **AND** the run's record counts the file as from a run that published neither

#### Scenario: A flagged run pushes no questions-branch files

- **WHEN** a worker reports a questions-branch file
- **AND** the run counts as having met a question with a category, because its worker reported
  the flag or because the provider refused it before its worker completed its report
- **THEN** the Igor pushes no questions-branch file for that run
- **AND** the run's record counts each one it held as from a run that met such a question

#### Scenario: A questions-branch file about a repository the role does not work is pushed

- **WHEN** a worker reports a log file whose `repository` key names a repository the run's role
  does not work
- **AND** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the run does not count as having met a question with a category
- **AND** the file passes the format, credential and path rules
- **AND** the destination repository is no more visible than the item's repository, and no more
  visible than the one that key names
- **THEN** the Igor pushes the file to the destination repository's `questions` branch

#### Scenario: A questions-branch file with no readable repository is refused

- **WHEN** a worker reports a questions-branch file that has no readable `repository` key
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file, without repeating its text

#### Scenario: A questions-branch file is not pushed somewhere more visible than its question

- **WHEN** the run publishes an artifact or ends in the Igor's handoff comment on the item
- **AND** the destination repository is more visible than the repository of the item the run works,
  or than the repository the file's `repository` key names
- **THEN** the Igor does not push the file
- **AND** the run's record counts one withheld file

#### Scenario: A worker's log file with an answer from its item is pushed as a new file

- **WHEN** an item handed back with a question is worked again after a person answered it
- **AND** the worker reports a log file holding `authority: decision`, whose `answer_link` is
  that person's comment on the item, and whose question is one the Igor's record holds for
  its handback comment
- **AND** the file passes the other rules
- **THEN** the Igor pushes it at a new path on the `questions` branch
- **AND** the unanswered log file of the same question is unchanged

#### Scenario: A worker's log file claiming a person's answer from elsewhere is refused

- **WHEN** a worker reports a log file holding an `authority` of `decision` or `input` whose
  `answer_link` is missing or is not a comment on the item the run works, or a log file whose
  `answered_by` is `agent` but whose `authority` is not
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: An answer paired with a question the Igor did not ask is refused

- **WHEN** a worker reports a log file holding `authority: decision`, whose `answer_link` is a
  comment on the item the run works
- **AND** its question is not one the Igor's record holds for a handback comment it posted on
  the item before the answering comment
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: A question edited into the handback comment is not one the Igor asked

- **WHEN** someone edits the Igor's handback comment on the item to hold a question the Igor
  did not post
- **AND** a worker reports a log file holding `authority: decision` for that question, whose
  `answer_link` is a comment on the item
- **THEN** the Igor pushes nothing for it, since its record does not hold that question
- **AND** the run's record counts one refused file

#### Scenario: A worker's answer line cannot invert a person's answer

- **WHEN** a worker reports a log file holding `authority: decision`, for a question the Igor
  asked, whose answer line is "merge it."
- **AND** its `answer_link` is a comment on the item, by a person with write access, that
  reads "Do not merge it."
- **AND** the file passes the other rules
- **THEN** the pushed file's answer reads "Do not merge it."
- **AND** "merge it." is recorded nowhere as that person's answer

#### Scenario: A long answer is recorded whole

- **WHEN** a worker reports a log file holding `authority: decision`, for a question the Igor
  asked, whose answer line is "Yes."
- **AND** its `answer_link` is a comment, by a person with write access, that quotes the
  question and then answers it in three sentences, the first of them "Yes."
- **AND** the file passes the other rules
- **THEN** the pushed file's answer holds the whole comment, the quoted question and all three
  sentences

#### Scenario: A credential in the linked comment keeps the file off the branch

- **WHEN** a worker reports a log file holding `authority: decision`, for a question the Igor
  asked, that passes every rule
- **AND** the comment its `answer_link` points to holds a credential #217's redaction would
  replace
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: A flagged run records no handback question

- **WHEN** a flagged run stops on a question it could not settle
- **THEN** the state branch gains no handback question for the item

#### Scenario: The record of handback questions holds hashes, never text

- **WHEN** the Igor posts a handback comment on an item, asking a question
- **THEN** the state branch holds, under that item, the question's hash, reduced and hashed as
  #25 reduces and hashes a question, with the comment's id and the time it was posted
- **AND** it holds no text of the question

#### Scenario: The Igor records where a questions-branch file came from

- **WHEN** a worker on an item in repository A reports a log file whose `repository` key names
  repository B, and which holds no `asked_from` key
- **AND** the Igor pushes the file
- **THEN** the pushed file's `asked_from` names A

#### Scenario: A worker's file already holding asked_from is refused

- **WHEN** a worker reports a questions-branch file that holds an `asked_from` key
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: The Igor sets decision for an answer a person's relay App posted

- **WHEN** a worker reports a log file holding `authority: input` and `answered_by: alice`, for
  a question the Igor asked, whose `answer_link` is a comment on the item starting
  `User says: ` that holds the file's answer
- **AND** the comment was posted by the App `alice-relay`, which #25's rule counts as
  `alice`'s GitHub relay App from her relay file on the Igor's checkout of the destination
  repository's default branch
- **AND** the question concerns the organization the destination repository serves, and `alice` has
  write access to the destination repository, which #25 counts as write access to that organization
- **AND** GitHub reports which App wrote the comment, as #25's task 0.21 checks
- **AND** the file passes the other rules
- **THEN** the Igor pushes the file holding `authority: decision`

#### Scenario: The Igor sets answered_by for an answer a person's relay App posted

- **WHEN** a worker reports a log file holding `answered_by: bob`, for a question the Igor
  asked, whose `answer_link` is a comment on the item starting `User says: ` that holds the
  file's answer
- **AND** the comment was posted by the App `alice-relay`, which #25's rule counts as `alice`'s
  GitHub relay App
- **AND** GitHub reports which App wrote the comment, as #25's task 0.21 checks
- **AND** the file passes the other rules
- **THEN** the Igor pushes the file holding `answered_by: alice`, with the `authority` #25's
  checks give for `alice`

#### Scenario: A relay file written into the checkout's working tree is not read

- **WHEN** a worker under `igor run` writes a relay file listing an App of its choosing into
  the lore checkout's working tree
- **AND** a log file it reports answers a question the Igor asked through a `User says: `
  comment by that App
- **THEN** the Igor reads the relay files only from the default branch as the checkout last
  fetched it, and does not count that App as anyone's relay App

#### Scenario: The Igor sets input for an answer an Igor's App posted

- **WHEN** a worker reports a log file holding `authority: decision`, for a question the Igor
  asked, whose `answer_link` is a comment on the item starting `User says: ` that holds the
  file's answer
- **AND** the comment was posted by an Igor's App, whatever any relay file lists
- **AND** the file passes the other rules
- **THEN** the Igor pushes the file holding `authority: input`

#### Scenario: A worker's file never replaces one on the branch

- **WHEN** a worker reports a questions-branch file at a path the `questions` branch already
  holds
- **THEN** the Igor pushes nothing for it, and the file on the branch is unchanged
- **AND** the run's record counts one refused file

#### Scenario: A questions-branch file not in #25's format is refused

- **WHEN** a worker reports a questions-branch file whose path or keys break #25's format, such
  as one holding a `conditions` key
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: A questions-branch file holding a credential is refused

- **WHEN** a worker reports a questions-branch file in which credential redaction would replace
  something, such as a GitHub access token
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: A questions-branch file holding the seat token is refused

- **WHEN** a worker reports a questions-branch file that quotes its seat's token
- **THEN** the Igor pushes nothing for it
- **AND** the run's record counts one refused file

#### Scenario: A worker reports no questions-branch file for a question with a category

- **WHEN** a worker's question has a category
- **THEN** the worker reports no questions-branch file for it

#### Scenario: A questions-branch file is committed as a citation is

- **WHEN** the Igor pushes a questions-branch file and the destination repository has no `questions`
  branch
- **THEN** it creates the branch as an orphan, and commits the file with the message #25 sets
  for a commit to that branch, with no trailer
- **AND** a push rejected because the branch moved is retried at most three times, then
  counted as failed to push

#### Scenario: The Igor's own inquisitor run pushes its questions-branch files under the same rules

- **WHEN** the Igor runs the inquisitor skill itself, with no worker, and that run writes a log
  file for a question about a project the role works
- **AND** the run ends in the Igor's handoff comment on the item
- **AND** the destination repository is no more visible than either the item's repository or
  the repository the file's `repository` key names
- **THEN** the Igor pushes the file to the destination repository's `questions` branch

### Requirement: An Igor runs its worker's lore searches

igor SHALL provide every worker the command `igor lore-search`, which reads from its standard
input the text of a question, or terms to search for, and takes no argument. The Igor, not the
worker, SHALL run the search, over the lore store it injects from: its entries, in the lore
store as the run read it, and the `questions` branch's question and miss files, in the one copy
of that branch the run reads. Under `igor serve`, the Igor SHALL fetch that branch at the start
of each run. Under `igor run`, no search fetches anything, and the run reads the branch as it
was last fetched. The results SHALL say when the branch the search read was last
fetched, or that it was never fetched or could not be fetched. The Igor SHALL take the run, and
so its role, from the channel the request arrives on, never from the request, and only that
run's worker SHALL be able to reach that channel. It SHALL apply every rule *Lore reaches the worker unbidden*
sets for a search during a run, for the run's role, and SHALL return the results to the worker
as search output. Each result SHALL be an in-scope entry, with its id, its status and its
text, marked as lore when `active` and labelled as not lore otherwise, or an in-scope question
or miss file, labelled as *Lore reaches the worker unbidden* sets, the unanswered label
included. It SHALL return a `questions`-branch file only when the repository of the
item the run works is no more visible than the file, by the visibility order that *An Igor
publishes the citations its worker reports* sets. A file is as visible as the more private of
the repositories its `repository` and `asked_from` keys name, and as its `repository` alone
when it holds no `asked_from`. The Igor SHALL pass either key's value to GitHub only when it
names a repository as `owner/repo`; any other value counts as a repository whose visibility it
cannot read. Here an item's repository whose visibility the Igor cannot read
counts as public, and a file's repository whose visibility it cannot read counts as private,
so either counts against returning the file. Visibility alone decides this: the Igor does not compare
who can read the two repositories. The same rule binds lore entries: the search SHALL NOT return an
entry whose `project:` scope keeps it from firing into the run under *Status and scope are
exact filters, always applied*, which says what repository such a scope names. The results
SHALL give no count or mention of a file or entry these visibility rules keep out.

The search SHALL match, rank and cap its results by the rule shared-skills #25's
[*Filter 1 searches every place an answer is recorded*](https://github.com/adamstallard/shared-skills/blob/spec/inquisitor/openspec/changes/inquisitor/specs/inquisitor/spec.md)
sets for filter 1, which holds inside and outside an Igor's run; this requirement does not
restate it. Every rule above that keeps a result out of the results applies before the ranking
and the cap.

When the Igor runs the inquisitor skill itself, with no worker, that run's filter 1 SHALL
search through `igor lore-search` too, under every rule of this requirement, and never through
another search of #25's script. Such a run reads the `questions` branch as the run fetched it,
once, as a worker's search does.

The Igor SHALL itself run the checks of shared-skills #25's requirement
[*Only an answer with authority stops a question*](https://github.com/adamstallard/shared-skills/blob/spec/inquisitor/openspec/changes/inquisitor/specs/inquisitor/spec.md)
on each question file it returns that holds an answer, and label the file by them as *Lore
reaches the worker unbidden* sets. #25 states the checks; this requirement does not restate
them. One is whether the comment a file's `answer_link` points to holds the answer, which #25
defines as the comment, reduced, equalling the recorded answer, reduced the same way (#25's
rule, decided by Adam on 2026-10-21); the Igor applies that rule in code, with no model call. Which comments count as a person's relayed answer is #25's rule (its
decision 216), and so is which relay file counts (its decision 225). For those checks the Igor
SHALL read #25's relay files from the destination repository's default branch as its checkout last
fetched it, never from the checkout's working tree, and the worker SHALL read no relay file
for them. Each read those checks make from GitHub SHALL authenticate as the installation of the
Igor's App that covers the repository that read is from (`surface-adapter`'s *On GitHub,
every call an Igor makes acts as its App*); the worker makes none of them. A check cannot be run when, for
example, GitHub cannot be reached, no installation of the Igor's App covers the repository the
check reads, or that installation cannot read a collaborator's permission there.

The command SHALL be available to a worker whether or not its role's `commands` list it, and
listing it SHALL grant nothing more. It SHALL be read-only: it writes nothing to the destination
repository or the state branch, records no firing, and makes no citation. Offering it SHALL
NOT widen what the worker may run, read or write, and SHALL give the worker no credential. Role
inheritance cannot remove it (`role-config`'s *Merge semantics differ by field kind*).

#### Scenario: A worker searches lore through its Igor

- **WHEN** a worker runs `igor lore-search` with a question's text on its standard input
- **THEN** the Igor searches the lore store it injects from and the `questions` branch for the
  run's role
- **AND** the worker receives the in-scope matches, labelled as search output

#### Scenario: The search command labels an unanswered question file and a miss file

- **WHEN** a worker runs `igor lore-search`
- **AND** an in-scope question file whose frontmatter holds no `authority` key, and an
  in-scope miss file, both match the text and pass the visibility rule
- **THEN** the results show the question file labelled as unanswered and the miss file
  labelled as a miss
- **AND** neither is labelled as an answer or as lore

#### Scenario: A question file that passes #25's authority checks is labelled as an answer

- **WHEN** a worker runs `igor lore-search`
- **AND** a question file holding an answer matches the text and passes the visibility rule
- **AND** the Igor, as its App's installation, runs every check of #25's *Only an answer with
  authority stops a question* on the file, and each passes
- **THEN** the results show the file labelled as an answer
- **AND** every GitHub read those checks made authenticated as that installation, and the
  worker made none of them

#### Scenario: An authority check that cannot be run labels the file as input

- **WHEN** a worker runs `igor lore-search`
- **AND** a question file holding an answer matches the text and passes the visibility rule
- **AND** a check of #25's *Only an answer with authority stops a question* cannot be run on
  it, because GitHub cannot be reached, or because no installation of the Igor's App can read
  the permission of the file's `answered_by` on the repository the check reads
- **THEN** the results show the file as input, labelled as unconfirmed, never as an answer

#### Scenario: A failing authority check labels the file as input

- **WHEN** a worker runs `igor lore-search`
- **AND** a question file holding `authority: decision` matches the text and passes the
  visibility rule
- **AND** its `answered_by` has no write access to the destination repository, which #25 counts as
  write access to what a `questions`-branch file's question concerns
- **THEN** the results show the file as input, labelled as unconfirmed, never as an answer

#### Scenario: A linked comment is judged by #25's reduced equality, with no model

- **WHEN** a worker runs `igor lore-search`, and a question file it returns has the answer
  "Back off, capped at a minute."
- **AND** the comment its `answer_link` points to reads "User says: **Back off**, capped at a
  minute.", with a line break after "**Back off**,", followed by a line `Re: <URL>`
- **THEN** the Igor finds that the comment matches the answer, as #25's rule reduces both texts
  to the same text
- **AND** no model reads the comment

#### Scenario: A recorded answer that is only part of its comment is input

- **WHEN** a worker runs `igor lore-search`
- **AND** a question file holding `authority: decision`, whose answer is "merge it.", matches
  the text and passes the visibility rule
- **AND** the comment its `answer_link` points to reads "Do not merge it."
- **THEN** the results show the file as input, labelled as unconfirmed, never as an answer

#### Scenario: An answer relayed by an Igor's App proves no person answered

- **WHEN** a worker runs `igor lore-search`
- **AND** a question file holding `authority: decision` matches the text and passes the
  visibility rule
- **AND** the comment its `answer_link` points to starts with `User says: ` and was posted by an
  Igor's App
- **THEN** the results show the file as input, labelled as unconfirmed, never as an answer

#### Scenario: An answer from a person's listed relay App is labelled as an answer

- **WHEN** a worker runs `igor lore-search`
- **AND** a question file holding `authority: decision` and `answered_by: alice` matches the text
  and passes the visibility rule
- **AND** the comment its `answer_link` points to starts with `User says: ` and was posted by
  the App `alice-relay`, which #25's rule counts as `alice`'s GitHub relay App from her relay
  file on the Igor's checkout of the destination repository's default branch
- **AND** GitHub reports which App wrote the comment, as #25's task 0.21 checks
- **AND** every other check of #25's *Only an answer with authority stops a question* passes
- **THEN** the results show the file labelled as an answer
- **AND** the Igor, not the worker, read the relay file

#### Scenario: A question file keyed to another repository is shown as input

- **WHEN** a worker on an item in repository A runs `igor lore-search`
- **AND** a question file holding `authority: decision`, whose `repository` key names
  repository B, matches the text and passes the visibility rule
- **THEN** the results show the file as input, labelled as unconfirmed, whatever its proofs

#### Scenario: A project entry about a more private repository is not returned

- **WHEN** a worker on an item in public repository Y runs `igor lore-search`
- **AND** an entry scoped `project:` naming private repository X, a repository the run's role
  works, matches the text
- **THEN** the results neither include that entry nor count or mention it

#### Scenario: The search matches terms and ranks by how many match

- **WHEN** a worker runs `igor lore-search` with the text "retry backoff limit"
- **AND** one in-scope entry's body holds all three terms and another's claim holds one
- **THEN** both are returned, the first ranked above the second
- **AND** no model or embedding took part

#### Scenario: The search returns at most twenty results and says so

- **WHEN** a worker runs `igor lore-search` and 25 in-scope results match the text
- **THEN** the results hold the 20 that match the most terms
- **AND** they say that more than 20 matched

#### Scenario: A filtered result takes no place among the twenty

- **WHEN** a worker runs `igor lore-search`, and 15 results the run may see and 10 entries
  outside the role's scope match the text
- **THEN** the results hold the 15
- **AND** they do not say that more than 20 matched

#### Scenario: The Igor's own inquisitor run searches through igor lore-search

- **WHEN** the Igor, under `igor run`, runs the inquisitor skill itself, with no worker, on an
  item in a public repository
- **AND** a `questions`-branch file about a private repository, and an entry outside the role's
  scope, match the question
- **THEN** the run's filter 1 searches through `igor lore-search`, and neither result is shown
- **AND** nothing is fetched for that search

#### Scenario: The search command needs no role listing

- **WHEN** a role's `commands` do not list `igor lore-search`
- **THEN** its worker can still run it

#### Scenario: The search command widens nothing

- **WHEN** a worker is offered `igor lore-search`
- **THEN** it can read no lore file, run no other command and hold no credential it could not
  without the offer

#### Scenario: No other process reaches a run's search channel

- **WHEN** a worker of another run, or any process other than this run's worker, tries to send
  a request on this run's search channel
- **THEN** the Igor answers nothing on it

#### Scenario: The search command returns no file about a more private repository

- **WHEN** a worker on an item in a public repository runs `igor lore-search`
- **AND** a `questions`-branch file whose `repository` key names a private repository matches
  the text, as does one whose key names a repository whose visibility cannot be read
- **THEN** the results neither include them nor count or mention them

#### Scenario: A file is judged by the more private of its two repositories

- **WHEN** a worker on an item in a public repository runs `igor lore-search`
- **AND** a `questions`-branch file whose `repository` key names a public repository, and
  whose `asked_from` key names a private one, matches the text
- **THEN** the results neither include that file nor count or mention it

#### Scenario: A malformed repository key is never looked up

- **WHEN** a worker on an item in a public repository runs `igor lore-search`
- **AND** a `questions`-branch file whose `asked_from` key is `o/../../user`, which counts as a
  repository whose visibility cannot be read and so as private, matches the text
- **THEN** the Igor makes no GitHub call with that value
- **AND** the results neither include that file nor count or mention it

#### Scenario: The search says when it could not read the questions branch

- **WHEN** a worker under `igor run` runs `igor lore-search`, and the `questions` branch has
  never been fetched
- **THEN** the results say that the branch was never fetched

#### Scenario: The search says when the questions branch was last fetched

- **WHEN** a worker runs `igor lore-search`, and the copy of the `questions` branch the run
  reads was fetched at a known time
- **THEN** the results give that time

#### Scenario: An unreadable item visibility counts against returning a file

- **WHEN** the Igor cannot read the visibility of the repository of the item the run works
- **AND** a `questions`-branch file whose `repository` key names an internal repository matches
  the text
- **THEN** the results neither include that file nor count or mention it

#### Scenario: Visibility, not readership, decides which file the search returns

- **WHEN** a worker on an item in a private repository runs `igor lore-search`
- **AND** a `questions`-branch file whose `repository` key names another private repository
  matches the text
- **THEN** the results include that file, whoever can read either repository

#### Scenario: The search command reads the questions branch as the run fetched it

- **WHEN** a run under `igor serve` starts, and the Igor fetches the `questions` branch
- **AND** a file is pushed to the `questions` branch after that
- **AND** the worker then runs `igor lore-search` with text that matches it
- **THEN** the results do not include that file

#### Scenario: igor run reads the questions branch as last fetched

- **WHEN** a file was pushed to the `questions` branch after the branch was last fetched
- **AND** a worker under `igor run` runs `igor lore-search` with text that matches it
- **THEN** the search fetches nothing, and the results do not include that file

#### Scenario: A role cannot restrict the search command away

- **WHEN** a role restricts the `commands` it inherits to a list without `igor lore-search`
- **THEN** its worker can still run `igor lore-search`

#### Scenario: The search command writes nothing

- **WHEN** a worker runs `igor lore-search`
- **THEN** nothing is written to the destination repository or the state branch, no firing is
  recorded, and no citation is made

#### Scenario: The search command searches the store as the run read it

- **WHEN** an entry is deprecated on the destination repository after the run read the store
- **AND** the worker then runs `igor lore-search` with text that matches it
- **THEN** the result shows the entry as it was when the run read the store, marked as lore

#### Scenario: The search command takes its role from its channel

- **WHEN** a worker's request to `igor lore-search` names another run or role
- **THEN** the Igor ignores that name and searches for the role of the run whose channel
  carried the request

#### Scenario: The search command returns no out-of-scope result

- **WHEN** a worker runs `igor lore-search` and an entry outside its role's scope matches the
  text
- **THEN** the results neither include it nor count or mention it
