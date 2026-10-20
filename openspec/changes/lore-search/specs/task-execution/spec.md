## MODIFIED Requirements

### Requirement: Only reversible artifacts are produced

Execution SHALL be confined to the artifact types the role's effective `allow` list permits,
which by default are reversible: draft pull requests and comments. The loop MUST NOT act on a
worker output outside that list, regardless of what the worker produced.

Two worker outputs are exempt from the list: the citations a worker reports, and the
questions-branch files it reports. The Igor pushes them to the lore repository's `questions`
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

### Requirement: Transcripts and outcomes are captured to the state branch

Execution SHALL record the worker transcript, except as below, the reported cost, and the
outcome. These SHALL be written to the state branch, never to the destination's default branch.

A run whose worker reported meeting a question with a *category*, as `lore-firing`'s *An Igor
publishes the citations its worker reports* defines it, or whose Igor met one in its own
inquisitor run, SHALL have no transcript written to the state branch.
Its outcome, its cost and its row in the execution ledger, `executions.ndjson`, which holds the run's id, its item
and the citation counts that requirement sets, are still written. For such a run, the pull
request body SHALL carry no excerpt of the worker's result and no link to a transcript, and a
record of the provider refusing the run SHALL keep only the refusal's reason, never the
provider's text. The reason is the limit Igor read from the provider's reply and the time
that limit resets, where Igor read them; where it read neither, the record says only that the
provider refused the run. A record of the provider refusing any other run SHALL keep the
provider's whole reply, except where a requirement that redacts credentials from every write
to the state branch removes them. A *refusal record* is the file execution writes under
`refusals/` on the state branch when the provider's reply names a usage limit.

In this requirement a *run* is one execution of an item, with every worker run it starts. An
execution counts as having met a question with a category when any of its worker runs
reported the flag below, or was refused before its completed report as the paragraph on refused runs below says; the rules above then
apply to the whole execution, including any summary of an earlier worker run.

During a run, the worker SHALL report a bare flag that the run met such a question, with no
category, question or answer. When the Igor runs the inquisitor skill itself and that skill gives a
question a category, every rule above for a run that met such a question SHALL apply to that
run.

A worker run the provider refuses over a usage limit, and that ends before the Igor has that
worker run's completed report, SHALL count as a run that met a question with a category, and every rule
above for such a run SHALL apply to it. The worker's *completed report* is its report of the
run's citations and of the flag above, on the channel `lore-firing`'s *An Igor publishes the
citations its worker reports* has it use, marked by the worker as whole. The provider's own
reply, such as the result that names the limit, is not the worker's report. Where the Igor
cannot tell a whole report from a cut one, the report SHALL count as not completed.

#### Scenario: Transcript persisted off the main line

- **WHEN** execution completes
- **AND** the run met no question with a category
- **AND** the provider did not refuse it over a usage limit before the Igor had its worker's
  completed report
- **THEN** the transcript and outcome are written to the state branch
- **AND** the default branch is unchanged

#### Scenario: Cost recorded per invocation

- **WHEN** the worker reports its cost for an invocation
- **THEN** that figure is recorded and accumulated against the seat

#### Scenario: A run that met a categorized question stores no transcript

- **WHEN** execution completes for a run whose worker reported meeting a question with a
  category
- **THEN** no transcript of that run is written to the state branch
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
- **THEN** the record of the refusal on the state branch holds the provider's whole reply

#### Scenario: A refused run with no completed report counts as flagged

- **WHEN** the provider refuses a run over a usage limit
- **AND** the run ends before the Igor has its worker's completed report
- **THEN** no transcript of that run is written to the state branch
- **AND** the record of the refusal holds only the limit and reset time Igor read, and none of
  the provider's text
- **AND** any pull request the run publishes holds no excerpt of the worker's result and no
  link to a transcript

#### Scenario: An execution counts as flagged when any of its worker runs does

- **WHEN** an execution starts two worker runs
- **AND** the second reports the flag, or is refused over a usage limit before the Igor has its
  completed report
- **THEN** no transcript of either worker run is written to the state branch
- **AND** a pull request the execution publishes holds no summary or excerpt of either
  worker run's result

#### Scenario: The worker's report of a categorized question names nothing

- **WHEN** a worker reports that its run met a question with a category
- **THEN** the report is a bare flag, holding no category, question or answer

#### Scenario: The Igor's own inquisitor run that met a categorized question stores no transcript

- **WHEN** the Igor runs the inquisitor skill itself and meets a question with a category
- **THEN** no transcript of that run is written to the state branch
