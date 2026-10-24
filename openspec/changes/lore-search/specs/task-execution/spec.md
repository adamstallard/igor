## MODIFIED Requirements

### Requirement: Only reversible artifacts are produced

Execution SHALL be confined to the artifact types the role's effective `allow` list permits,
which by default are reversible: draft pull requests and comments. The loop MUST NOT act on a
worker output outside that list, regardless of what the worker produced, except the two below.

Two worker outputs are exempt from the list: the citations a worker reports, and the
questions-branch files it reports. The Igor pushes them to the destination repository's `questions`
branch only as `lore-firing`'s *An Igor publishes the citations its worker reports* and *An Igor
publishes the questions-branch files its worker reports* allow.

#### Scenario: Permitted artifact produced

- **WHEN** a role allows draft pull requests and the worker produces one
- **THEN** the artifact is created

#### Scenario: Disallowed artifact refused

- **WHEN** the worker produces output implying an action outside the role's allow list
- **THEN** the loop does not perform that action
- **AND** the refusal is recorded

#### Scenario: Enforcement is at the loop, not the prompt

- **WHEN** the worker is instructed to stay within the action space but produces output outside it
- **THEN** the action is still refused by the loop

#### Scenario: A citation push needs no allow action

- **WHEN** a role's `allow` list names no action for citations
- **AND** its worker reports a citation that *An Igor publishes the citations its worker
  reports* allows the Igor to push
- **THEN** the Igor pushes that citation all the same

#### Scenario: A questions-branch file push needs no allow action

- **WHEN** a role's `allow` list names no action for the `questions` branch
- **AND** its worker reports a questions-branch file that *An Igor publishes the
  questions-branch files its worker reports* allows the Igor to push
- **THEN** the Igor pushes that file all the same

### Requirement: The worker is given an explicit environment holding no credential but its seat's

Execution SHALL construct the worker's environment rather than inheriting the Igor's, and that
environment SHALL carry no credential other than the token of the seat the work is charged to.
The tokens of other seats, and the credential the Igor acts on its surfaces with, MUST NOT be
present. Where the chosen seat names a token source that cannot be read — an unset variable, an
unreadable or empty file, a command that fails, prints nothing, or never returns — execution
SHALL fail naming it rather than spawning a worker that authenticates as something else.

For an Igor acting as a GitHub App, the surface credential is anything that yields an App
token: the token itself, the `GITHUB_APP_*` variables, and a git credential helper or
`GIT_CONFIG_*` entry that mints one. None of them SHALL reach the worker, and the working tree
SHALL hold none of them.

The worker needs none of them. It edits files in a disposable tree; claiming, commenting,
branching and publishing all happen in the loop afterwards, with the loop's own credentials. An
inherited environment is therefore a set of credentials nothing in the worker has a use for,
one shell command away from a worker an item's text has steered.

Besides the `IGOR_RUN` marker below, only what running a toolchain requires is passed: the
search path, a home directory, and the network settings the host is configured with. None of
those is a credential, and each fails as something else entirely when it is missing.

Wherever workers run as users of their own, which is `igor serve` once #175 lands, each worker
run's Claude state, its session log included, SHALL be private to that run, and its session log
SHALL be collected when the run ends. Open pull request [#174](https://github.com/adamstallard/igor/pull/174)
(change `pinned-skills`) is how this is done, in its requirements *Every model step in the
worker's home starts from Igor's template* and *The worker's session log outlives the reset*;
this requirement does not restate them. Until then, and always under `igor run`, every worker
runs as the same user and can read and write another run's state, which Adam accepts
(decisions 94 and 99). Execution SHALL NOT spawn
a worker for a seat that names no token, and SHALL fail naming the seat.

Execution SHALL also set `IGOR_RUN` in the worker's environment, to `worker`, and in the
environment of an inquisitor run the Igor starts itself with no worker, to `igor`. The
variable tells shared-skills #25's inquisitor script that it runs during an Igor's run, and its
value says whose run: a worker's or the Igor's own.
`IGOR_RUN` SHALL carry no secret: its value is one of those two words and nothing else.

#### Scenario: The surface credential is absent

- **WHEN** a worker is spawned while the Igor holds a code-host token
- **THEN** that token is not in the worker's environment

#### Scenario: Nothing that yields an App token reaches the worker

- **WHEN** a worker is spawned for an Igor acting as a GitHub App
- **THEN** its environment holds no App token, no `GITHUB_APP_*` variable and no `GIT_CONFIG_*`
  entry
- **AND** its working tree's git config names no credential helper

#### Scenario: Only the chosen seat's token is present

- **WHEN** several seats are declared and one is chosen for an item
- **THEN** that seat's token is in the worker's environment
- **AND** no other seat's token is

#### Scenario: A seat whose token variable is unset fails loudly

- **WHEN** the chosen seat names a token variable that is not set
- **THEN** execution fails naming the variable
- **AND** no worker is spawned

#### Scenario: A seat whose file or command yields no token fails loudly

- **WHEN** the chosen seat names a file that cannot be read or is empty, or a command that
  fails, prints nothing, or is killed at its timeout
- **THEN** execution fails naming what was tried and why
- **AND** no worker is spawned

#### Scenario: A toolchain still runs

- **WHEN** a worker runs a build or a test in its working tree
- **THEN** the search path, home directory and network settings it needs are present

#### Scenario: A worker run's Claude state is private to it

- **WHEN** two worker runs, each as a worker user of its own (#175), are under way at once
- **THEN** each has its own home, as #174 gives it
- **AND** neither can read the other's `~/.claude` or session log

#### Scenario: A seat that names no token runs no worker

- **WHEN** the chosen seat names no token
- **THEN** execution fails naming the seat
- **AND** no worker is spawned on the host's own login

#### Scenario: A worker's environment marks it as in an Igor's run

- **WHEN** a worker is spawned
- **THEN** its environment holds `IGOR_RUN=worker`
- **AND** that variable holds no credential or other secret

#### Scenario: The Igor's own inquisitor run is marked as in an Igor's run

- **WHEN** the Igor runs the inquisitor skill itself, with no worker
- **THEN** that run's environment holds `IGOR_RUN=igor`

### Requirement: Transcripts and outcomes are captured to the state branch

Execution SHALL record the worker transcript, except as below, the reported cost, and the
outcome. These SHALL be written to the state branch, never to the destination's default branch.
Open pull request #220 (change `visibility-guard`)'s *Nothing from a private repository is
written to a public state branch* holds for every record this requirement writes, a flagged
run's included, and this requirement does not restate it.

A run whose worker reported meeting a question with a *category*, as `lore-firing`'s *An Igor
publishes the citations its worker reports* defines it, or whose Igor met one in its own
inquisitor run, SHALL have no transcript written to the state branch. The file at its
transcript path SHALL hold only this line: "Transcript withheld: this run met, or may have
met, a sensitive question. See the action log." The action log is the log of tool calls
described below; until a run keeps one, the line points to nothing.
Its outcome, its cost and its row in the execution ledger, `executions/<yyyy-mm-dd>.ndjson`, which holds the run's id, its item
and the citation counts that requirement sets, are still written. For such a run, the pull
request body SHALL carry no excerpt of the worker's result and no link to a transcript, and a
record of the provider refusing the run SHALL keep only the refusal's reason, never the
provider's text. The reason is the limit Igor read from the provider's reply and the time
that limit resets, where Igor read them; where it read neither, the record says only that the
provider refused the run. A record of the provider refusing any other run SHALL keep the
provider's whole reply, redacted as #217's (`redact-state-branch`) *Every write to the state branch is redacted* requires of every write to the state branch. A *refusal record* is the file execution writes under
`refusals/` on the state branch when the provider's reply names a usage limit.

The ledger row records each shell command the worker's sandbox denied. For a run that met a
question with a category, the row SHALL keep each denied command only as its *name*, without
its arguments: its first words, up to three, each starting with a lowercase letter and holding
only lowercase letters, digits and hyphens, ending before the first word that does not. A row
for any other run keeps the denied command as it does today.

For a run that met a question with a category, the row's `reason` SHALL keep only fixed words
igor sets for the kind of reason, such as `error` for a thrown error, and never an error
message's text or other text the run produced. For a worker killed for a limit, those words
SHALL name the kind of hang and the limit's duration, as *A killed worker's failure names the
limit it breached* requires, such as `silent after 10m` or `time ceiling 60m`: words from a
fixed vocabulary, and numbers, never free text. For a run that stopped on a question it could
not settle, those words SHALL be `needs a person`, and where the Igor could not keep that
question on its host (`graceful-handoff`), the `reason` SHALL be `needs a person, question not
kept`. The row's changed file
paths, the actions the role refused and the role settings that would have permitted them stay
as for any other run.

Where a run keeps a log of its model steps' tool calls beside its transcript, as the open
change `keep-action-log` (#188) specifies, that log SHALL, for a run that met a question with a
category, keep only names and numbers: each call's tool name, a shell command's name as above,
its exit code, and counts and timings. It SHALL keep no argument, path, file content, message
or output, and never more than #188 keeps for a run that met none: #188 chooses how much its
log keeps from the visibility of the store and of the worked repository, and keeps no command
for a public store and a private repository.

In this requirement a *run* is one execution of an item, with every worker run it starts and
every model step igor runs after them in that execution, such as the step of the open pull
request #153 that writes the pull request body. Each such model step counts as a worker run
here: it sends a completed report, as defined below, in the same form as a worker's, and every
rule below for a worker run applies to it. An execution counts as having met a
question with a category when any of its worker runs reported the flag below, or ended before
its completed report, as the paragraph below starting "A worker run that ends before" says;
the rules above then apply to the whole execution, including any summary of an earlier worker
run.

During a run, the worker SHALL report a flag that the run met such a question, listing each
category met in the run from shared-skills #25's fixed list (`vulnerability`, `secret`,
`personal`), each at most once, and marking which of them belong to the question or questions
the run stopped on; the flag holds no question or answer. The Igor SHALL take a listed value as
a category only when it is exactly one of those three words; any other value counts as no
category, and the run stays flagged. The Igor SHALL write the
categories, with their marks, into the question's file on its own host that `graceful-handoff`
keeps, and SHALL NOT write them to the execution ledger, the state branch, a comment or a label;
they stay, besides, in the session logs of the steps that met them, which #174 copies into the
state directory on the host, since credential redaction removes credentials, not those words. A
flagged run that stops on no question gets no host file, so the words are then kept nowhere but
those logs, which #174 keeps in the state directory as for any run. When the Igor runs the inquisitor skill itself and that skill gives a
question a category, every rule above for a run that met such a question SHALL apply to that
run.

A worker run that ends before the Igor has its completed report, for any reason, SHALL count as
a run that met a question with a category, and every rule above for such a run SHALL apply to
it, whether the provider refused it, it went silent, it was stopped, or it ended for any other
reason. The worker's *completed report* is its report of the
run's citations and of the flag above, on the channel `lore-firing`'s *An Igor publishes the
citations its worker reports* has it use, marked by the worker as whole. The provider's own
reply, such as the result that names the limit, is not the worker's report. Where the Igor
cannot tell a whole report from a cut one, the report SHALL count as not completed.

#### Scenario: Transcript persisted off the main line

- **WHEN** execution completes
- **AND** the run met no question with a category
- **AND** the Igor had the completed report of each of its worker runs
- **THEN** the transcript and outcome are written to the state branch
- **AND** the default branch is unchanged

#### Scenario: Cost recorded per invocation

- **WHEN** the worker reports its cost for an invocation
- **THEN** that figure is recorded and accumulated against the seat

#### Scenario: A run that met a categorized question stores no transcript

- **WHEN** execution completes for a run whose worker reported meeting a question with a
  category
- **THEN** no transcript of that run is written to the state branch
- **AND** the run's transcript path holds only the line "Transcript withheld: this run met, or
  may have met, a sensitive question. See the action log."
- **AND** the run's outcome, cost and record, with its citation counts, are written there

#### Scenario: A run that met a categorized question publishes no excerpt of its result

- **WHEN** a run whose worker reported meeting a question with a category publishes a pull
  request
- **THEN** its body holds no excerpt of the worker's result
- **AND** it holds no link to a transcript

#### Scenario: A refusal on such a run keeps only its reason

- **WHEN** the provider refuses a run whose worker reported meeting a question with a category
- **THEN** the record of the refusal on the state branch holds the refusal's reason
- **AND** it holds none of the provider's text

#### Scenario: A refusal Igor could not parse says only that the provider refused

- **WHEN** the provider refuses a run that met a question with a category
- **AND** Igor read neither a limit nor a reset time from the reply
- **THEN** the record of the refusal says only that the provider refused the run

#### Scenario: A report the Igor cannot tell is whole counts as cut short

- **WHEN** the provider refuses a run over a usage limit
- **AND** the worker's report reached the Igor without the worker's mark that it is whole
- **THEN** the run counts as having met a question with a category

#### Scenario: A refusal on any other run keeps the provider's reply

- **WHEN** the provider refuses a run that met no question with a category
- **AND** the Igor has the run's completed worker report
- **THEN** the record of the refusal on the state branch holds the provider's whole reply,
  redacted

#### Scenario: A refused run with no completed report counts as flagged

- **WHEN** the provider refuses a run over a usage limit
- **AND** the run ends before the Igor has its worker's completed report
- **THEN** no transcript of that run is written to the state branch
- **AND** the record of the refusal holds only the limit and reset time Igor read, and none of
  the provider's text
- **AND** any pull request the run publishes holds no excerpt of the worker's result and no
  link to a transcript

#### Scenario: A worker run that ends without its completed report, for any reason, counts as flagged

- **WHEN** a worker run goes silent or is stopped
- **AND** it ends before the Igor has its completed report
- **THEN** the run counts as having met a question with a category
- **AND** no transcript of it is written, and its transcript path holds only the withheld note

#### Scenario: A flagged run's ledger row keeps each denied command by name only

- **WHEN** the worker's sandbox denies `gh issue comment 12 --body "…"` in a run that met a
  question with a category
- **THEN** the run's ledger row records the denied command as `gh issue comment`

#### Scenario: A question that cannot be kept is recorded in fixed words

- **WHEN** a flagged run stops on a question it could not settle, and the Igor cannot write the
  question's file on its host
- **THEN** the ledger row's `reason` is `needs a person, question not kept`
- **AND** the row holds no path and no text of the question

#### Scenario: A flagged run's ledger row keeps only the kind of its reason

- **WHEN** a run that met a question with a category ends with a thrown error whose message
  quotes the item's text
- **THEN** the run's ledger row's `reason` holds only `error`, and none of the message
- **AND** the row still lists the paths the worker changed

#### Scenario: A flagged run killed for a limit keeps the limit's kind and duration

- **WHEN** a worker is killed after producing nothing for 10 minutes, and its run therefore
  counts as having met a question with a category
- **THEN** the run's ledger row's `reason` names only the kind of hang and the duration, such
  as `silent after 10m`
- **AND** it holds no other text the run produced

#### Scenario: Any other run's ledger row keeps a denied command whole

- **WHEN** the worker's sandbox denies `gh issue comment 12 --body "…"` in a run that met no
  question with a category
- **THEN** the run's ledger row records the whole command

#### Scenario: A flagged run's action log keeps names only

- **WHEN** a run that met a question with a category keeps a log of its tool calls in a
  private store, where #188's log keeps commands
- **AND** its worker ran `cat notes.txt` and read a file
- **THEN** the log holds each call's tool name, `cat` as the command's name, and the exit code
- **AND** it holds no argument, path, file content, message or output

#### Scenario: An execution counts as flagged when any of its worker runs does

- **WHEN** an execution starts two worker runs
- **AND** the second reports the flag, or ends before the Igor has its completed report
- **THEN** no transcript of either worker run is written to the state branch
- **AND** a pull request the execution publishes holds no summary or excerpt of either
  worker run's result

#### Scenario: A model step after the worker that meets a categorized question flags the execution

- **WHEN** a worker run completes its report without the flag
- **AND** a later model step of the same execution, such as the step that writes the pull
  request body, reports the flag
- **THEN** the execution counts as having met a question with a category
- **AND** no transcript of the worker run or of that step is written to the state branch

#### Scenario: A model step after the worker that sends no completed report flags the execution

- **WHEN** a worker run completes its report without the flag
- **AND** a later model step of the same execution, such as the step that writes the pull
  request body, ends before the Igor has that step's completed report, a report of the flag and
  of any citations, in the form a worker's takes
- **THEN** the execution counts as having met a question with a category
- **AND** no transcript of the worker run or of that step is written to the state branch

#### Scenario: The worker's report of a categorized question names only its category

- **WHEN** a worker's run met a `secret` question it decided, then stopped on a `personal`
  question
- **THEN** the flag lists `secret` and `personal`, each once, with `personal` marked as the
  stopped question's
- **AND** it holds no question or answer

#### Scenario: A reported category reaches only the host file

- **WHEN** a worker reports the flag with the category `secret`, marked as the stopped
  question's
- **THEN** `secret` appears in the question's file on the Igor's host, with its mark
- **AND** it appears in no ledger row, nothing on the state branch, no comment and no label

#### Scenario: A value outside #25's list is no category

- **WHEN** a worker's flag lists `secret; see attached` or any other value that is not exactly
  `vulnerability`, `secret` or `personal`
- **THEN** the Igor records no category for that value: where it was marked, the question's
  file says the stopped question's category could not be read, and where unmarked, the file
  leaves it out
- **AND** the run still counts as flagged

#### Scenario: The Igor's own inquisitor run that met a categorized question stores no transcript

- **WHEN** the Igor runs the inquisitor skill itself and meets a question with a category
- **THEN** no transcript of that run is written to the state branch
