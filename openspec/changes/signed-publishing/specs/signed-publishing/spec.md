## Purpose

Igor's code runs the prose and bug-hunter steps a role lists around the text its model writes,
and verifies their signatures before it posts the text or commits the change.

## ADDED Requirements

### Requirement: Igor verifies what each skill in a role's list requires

Igor's code SHALL verify a role's published work by its `skills` list, one check per skill:

- **`prose`:** every model-written post SHALL carry a valid `prose ✓` footer, and every commit
  a `Prose:` trailer that matches its staged tree and message.
- **`bug-hunter`:** every commit SHALL carry a `Bug-hunter:` trailer and a `Bug-hunter-Tree:`
  trailer bound to its staged tree, even where nothing was hunted.

#### Scenario: A role listing prose has its posts and commits checked

- **WHEN** a role's `skills` is `[prose]` and it publishes a post and a commit
- **THEN** the post is published only with a valid footer, and the commit only with a matching
  `Prose:` trailer
- **AND** the commit needs no `Bug-hunter:` trailer

#### Scenario: A role listing bug-hunter has its commits checked

- **WHEN** a role's `skills` is `[bug-hunter]`, it publishes a commit, and bug-hunter's first
  triage finds something to hunt
- **THEN** the commit is made only with a `Bug-hunter:` trailer, and a `Bug-hunter-Tree:`
  trailer bound to the staged tree
- **AND** its posts are published without a footer check

#### Scenario: A change bug-hunter's triage skipped still needs the tree trailer

- **WHEN** a role's `skills` is `[bug-hunter]`, bug-hunter's first triage finds nothing to hunt
  in the change, and no extra iteration runs (an *extra iteration* is the one more bug-hunter
  run `task-execution` gives a prose pass's diff that bug-hunter's triage does not skip)
- **THEN** the commit is made only with its `Bug-hunter:` trailer and a `Bug-hunter-Tree:`
  trailer bound to the staged tree

### Requirement: A role is checked only for the skills it lists

A role SHALL NOT be checked for a skill it does not list, and publishes, for that skill, as it
does without this capability. A listed skill other than `prose` and `bug-hunter` gets no check from this
capability.

#### Scenario: A role listing neither publishes as before

- **WHEN** a role's `skills` lists neither `prose` nor `bug-hunter`
- **THEN** its posts and commits are published with no footer or trailer check

### Requirement: Igor runs prose's calls around the model step that writes

For a role whose `skills` lists `prose`, every text a model step writes for an Igor to publish
SHALL go through prose's pass, apart from the words *Words the code quotes are not signed*
lists. It covers pull request descriptions, replies, questions a model step writes, and any
other model-written post to GitHub, Discord or Linear. The *prose pass* is the model step
writing the text between prose's two calls. The *pass token* is the one-use value the first call
prints and the second requires.

#### Scenario: The rule holds on every surface

- **WHEN** an Igor whose role lists `prose` posts model-written text to GitHub, Discord or Linear
- **THEN** the text carries a footer from prose's second call on that text

### Requirement: Igor's code runs both of prose's calls

Igor's code SHALL run both of prose's calls itself, as Igor's service user, from the pinned
skills directory (#174), with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` set to its own
git directory, tree and index, for a post as for a commit. Which tree and index a post that no
worker run precedes uses is open (proposal, *Still open*).

#### Scenario: Igor runs a post's calls with its own git directory

- **WHEN** Igor runs prose's first and second calls for a reply
- **THEN** it runs them as its service user, from the pinned skills directory, with `GIT_DIR`,
  `GIT_WORK_TREE` and `GIT_INDEX_FILE` set to its own git directory, tree and index

### Requirement: No model step runs a prose script or posts

No model step SHALL run a prose script or post, and no worker user SHALL be able to write
prose's token store. `igor run`, where #175 runs every step as Igor's own user, is the
exception to the token-store rule: there the steps can write the store, and the cold reader runs as that user, not as a
worker user.

#### Scenario: No model step posts

- **WHEN** a model step has a reply ready
- **THEN** it hands the reply to Igor's code, which signs and posts it, and makes no post itself

#### Scenario: A worker cannot issue a token

- **WHEN** a model step running as a worker user tries to write a file into prose's token store
- **THEN** the write fails, and no token exists that Igor's first call did not issue

### Requirement: Igor runs prose's first call before the step writes

The first call, `prose sign` for a post, SHALL run before the step writes, with the reader goals
a model wrote for that post, passed in a file (`--goals-file`), never on a command line. Igor
SHALL give the step the rules and the pass token the first
call prints, in its prompt on stdin, which SHALL tell it to quote untrusted text, such as an
item's or a person's words, in code spans.

#### Scenario: Untrusted text is quoted in a code span

- **WHEN** a model step writes a reply that quotes a commenter's words holding `@someone`
- **THEN** its prompt told it to quote those words in a code span, where the mention notifies
  no one

### Requirement: Igor reads every goals file, and a commit message goes through prose check

Igor SHALL read every goals file a model step writes, for a post or a commit, as #175's *The Igor
reads no file on the worker's behalf through a link* requires of every file the worker user
wrote, and SHALL count a missing or empty goals file as a failed attempt. Which step a commit's
failed goals file goes back to is open (proposal, *For Adam* 2). A commit message goes through
prose's two calls with `prose check` in place of `prose sign`, as `task-execution` requires.

#### Scenario: A missing or empty goals file is a failed attempt

- **WHEN** the goals file a model step was to write for a reply is missing or empty
- **THEN** Igor counts a failed attempt

### Requirement: A post no worker run precedes gets its goals from a first turn

Where no worker run precedes a post, such as a reply to a mention, the step that writes the
post SHALL write its goals file in a first turn, before the first call, into an outbox Igor
gives it, and Igor SHALL resume that session (`claude -p --resume`) after the first call, with
the same `HOME` as the first turn. #174's *Every model step in the worker's home starts from
Igor's template* resets that home before each step, not between the first turn and the resumed
call.

#### Scenario: The step writes with the rules Igor's first call printed

- **WHEN** a model step is to compose a reply to a mention
- **THEN** the step's first turn writes the reply's goals file, and Igor runs `prose sign`'s
  first call on that file
- **AND** Igor resumes the step's session with the rules and the pass token the first call
  printed, in its prompt on stdin
- **AND** Igor, not the step, runs the second call on the reply the step hands back

### Requirement: Igor runs prose's second call after a cold read

The second call, `prose sign --pass <token>`, SHALL run on the text the step hands back, on
stdin. Before it signs, Igor SHALL run a fresh model step whose whole prompt is the cold-read
brief it prints, exactly as printed, and SHALL give its report to the writing step, which SHALL
fix every finding and answer each line. Igor SHALL then run the second call again, on the fixed
text, with the report and answers; it appends a `prose ✓ <hash>` footer computed over that
text.

#### Scenario: A signature waits for a cold read

- **WHEN** Igor runs the second call on a reply and it prints a cold-read brief
- **THEN** a fresh model step reads the brief as its whole prompt, and the step that wrote the
  reply fixes what that read names
- **AND** Igor runs the second call again with the report and the answers, and only then has a
  signed reply

### Requirement: The cold reader only reads, and a kept answer fails the check

The cold reader SHALL run as the worker user, with no tool but Read on the tree and on the
skills directory for a commit, and no tool but Read on the skills directory for a post. Every
model step SHALL be granted Read on the directory its skills load from. Igor SHALL count as a
failed check an answers file that keeps any finding or understood line, answering it with
anything but `fixed` or `matches`, without passing it to prose, and SHALL count any refusal
from prose the same way.

#### Scenario: The cold reader can only read

- **WHEN** Igor starts the cold reader for a commit
- **THEN** it runs as the worker user, can read the tree and the skills directory, and can run
  no command and edit no file

#### Scenario: A kept finding is refused before prose sees it

- **WHEN** the answers file answers finding 3 with `3. kept (asked): the wording is clear`, the
  form prose's dispositions file gives a finding a person chose to keep
- **THEN** Igor counts a failed check and does not run the second call with it

#### Scenario: A kept cold-read finding is a failed check

- **WHEN** the step that wrote a reply answers a cold-read finding by keeping it
- **THEN** Igor does not run the second call with those answers, and the reply goes back to the
  step as a failed attempt

### Requirement: Text the code assembles is not signed

Text the code assembles from recorded state is not signed, and SHALL NOT be held to prose's
pass: handoffs, stop receipts and claim messages. `graceful-handoff` stays as it is.

#### Scenario: A handoff needs no model call

- **WHEN** an Igor hands off an item after its budget is exhausted, so no model call is possible
- **THEN** the code posts the handoff it assembled from recorded state, without a signature

### Requirement: Words the code quotes are not signed

Someone's words that code-assembled text quotes are not signed either, and SHALL NOT be held
to prose's pass:

- bug-hunter's open decisions, in the opening block the code assembles for a pull request body;
- the worker's reason for declining, quoted in a handoff, also where `directed-interaction`
  publishes that handoff as a question it asks a person;
- a person's request, in an issue Igor opens for them from chat, or from a mention under
  `directed-interaction` (#140).

#### Scenario: A quoted reason for declining is not signed

- **WHEN** the code posts a handoff that quotes the worker's reason for declining
- **THEN** the quoted reason is posted as part of the handoff, with no signature of its own

### Requirement: The code verifies text before it publishes it

For a role whose `skills` lists `prose`, the code that publishes a model-written text SHALL run
`prose verify-post` on the exact text it is about to send, and MUST NOT publish text that
fails.

The code SHALL publish the verified text exactly. A pull request body is the one place the
code adds lines around it, and `task-execution`'s *The pull request description is written for
a reviewer and signed* sets out where they go and which span of the body `prose verify-post`
runs on.

#### Scenario: Signed text is published unchanged

- **WHEN** prose's second call returns text whose footer verifies
- **THEN** the code publishes exactly that text
- **AND** in a pull request body, the span between the opening block and
  `<!-- igor:evidence -->`, or to the end where there is no marker, is exactly that text, and
  anything from the marker on is the evidence section Igor's code assembled

#### Scenario: Text edited after signing is not published

- **WHEN** the text differs from what its footer was computed over
- **THEN** the code does not publish it

#### Scenario: Unsigned text is not published

- **WHEN** the text has no `prose ✓` footer
- **THEN** the code does not publish it

### Requirement: A failed check goes back to the model step, a bounded number of times

When a check fails, the code SHALL return the text to the model step that wrote it, with the
reason, and that step SHALL write it again. A commit's tree or
message mismatch, and a refused minting call, go back to no step, as `task-execution` requires.
After two failed attempts in total, the code SHALL publish none of the text and SHALL record
the failure, with each reason, to the state branch; for an item the Igor claimed, the handoff
the code assembles is still posted (`graceful-handoff`).

#### Scenario: A failure is sent back with its reason

- **WHEN** a text fails verification
- **THEN** the model step receives it back with the reason it failed
- **AND** writes it again, and Igor signs and checks it again

#### Scenario: A refused token gets a new first call

- **WHEN** prose's second call refuses the token for any text, such as a reply
- **THEN** Igor runs the first call again and gives the step the new rules and token

#### Scenario: A commit's tree mismatch goes back to no step

- **WHEN** a commit's uploaded tree differs from the tree its trailers name
- **THEN** no model step receives it back, and the item's failure is recorded

#### Scenario: Repeated failure publishes nothing

- **WHEN** a text for a claimed item fails its second attempt
- **THEN** none of the text is published, and the item gets the code's handoff
- **AND** the failure and its reasons are recorded to the state branch
