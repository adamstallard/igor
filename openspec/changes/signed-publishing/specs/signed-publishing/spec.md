## ADDED Requirements

### Requirement: Igor verifies what each skill in a role's list requires

Igor's code SHALL verify a role's published work according to the role's `skills` list, one
check per skill:

- **`prose`:** every model-written post SHALL carry a valid `prose ✓` footer, and every commit
  a `Prose:` trailer that matches its staged tree and message.
- **`bug-hunter`:** every commit SHALL carry a `Bug-hunter:` trailer. It SHALL also carry a
  `Bug-hunter-Tree:` trailer bound to its staged tree, unless bug-hunter's first triage, run on
  the whole change before any hunt, found nothing to hunt; then `Bug-hunter:` alone is checked.

A role that does not list a skill SHALL NOT be checked for it, and publishes as it does without
this capability. Each skill's check SHALL be defined in Igor's code, not in configuration.

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

#### Scenario: A change bug-hunter's triage skipped needs no tree trailer

- **WHEN** a role's `skills` is `[bug-hunter]` and bug-hunter's first triage finds nothing to
  hunt in the change
- **THEN** the commit is made with its `Bug-hunter:` trailer and no `Bug-hunter-Tree:`

#### Scenario: A role listing neither publishes as before

- **WHEN** a role's `skills` lists neither `prose` nor `bug-hunter`
- **THEN** its posts and commits are published with no footer or trailer check

### Requirement: Published text is signed by the model step that wrote it

For a role whose `skills` lists `prose`, every text a model step writes for an Igor to publish
SHALL be signed by that step. That
covers pull request descriptions, replies, questions, and any other model-written post to
GitHub, Discord or Linear. The step SHALL sign with the prose skill's `prose sign`, which
appends a `prose ✓ <hash>` footer computed over the text above it. No model step SHALL post.
A commit message is the exception: the prose pass writes it, and Igor's code signs it, as
`task-execution`'s *A commit is signed by bug-hunter and the prose pass before it is committed*
requires.

Text the code assembles from recorded state is not signed: handoffs, stop receipts and claim
messages. `graceful-handoff` stays as it is.

#### Scenario: No model step posts

- **WHEN** a model step has a reply ready
- **THEN** it returns the signed reply to Igor's code, which posts it, and makes no post itself

#### Scenario: A reply is signed where it is written

- **WHEN** a model step composes a reply to a mention
- **THEN** it returns the reply with a `prose ✓` footer from `prose sign`

#### Scenario: The rule holds on every surface

- **WHEN** an Igor whose role lists `prose` posts model-written text to GitHub, Discord or Linear
- **THEN** the text carries a footer from the model step that wrote it

#### Scenario: A handoff needs no model call

- **WHEN** an Igor hands off an item after its budget is exhausted, so no model call is possible
- **THEN** the code posts the handoff it assembled from recorded state, without a signature

### Requirement: The code verifies text before it publishes it

For a role whose `skills` lists `prose`, the code that publishes a model-written text SHALL run
`prose verify-post` on the exact text it is about to send, and MUST NOT publish text that
fails.

The code SHALL publish the verified text exactly. A pull request body is the one place the
code adds lines around it, and `task-execution`'s *The pull request description is written for
a reviewer and signed* sets out where they go and which span of the body `prose verify-post`
runs on.

#### Scenario: Signed text is published unchanged

- **WHEN** a model step returns text whose footer verifies
- **THEN** the code publishes exactly that text
- **AND** in a pull request body, the span between the opening block and `<!-- igor:evidence -->`, or to the end where there is no marker, is exactly that
  text, and anything from the marker on is the evidence section Igor's code assembled

#### Scenario: Text edited after signing is not published

- **WHEN** the text differs from what its footer was computed over
- **THEN** the code does not publish it

#### Scenario: Unsigned text is not published

- **WHEN** the text has no `prose ✓` footer
- **THEN** the code does not publish it

### Requirement: A failed check goes back to the model step, a bounded number of times

When a check fails, the code SHALL return the text to the model step that wrote it, with the
reason, and that step SHALL redo its check and sign again. A commit is signed by Igor's code,
not by the prose pass, so where prose's second call refuses the token the prose pass reported,
the prose pass SHALL run prose's first call again and report a new token. A commit's tree or message mismatch, and a
refused minting call, are the exceptions: each goes back to no step, as `task-execution`
requires. After two failed
attempts the code SHALL publish none of the text and SHALL record the failure, with each reason,
to the state branch. On a claimed item, the handoff the code assembles is still posted, as
`graceful-handoff` requires.

#### Scenario: A failure is sent back with its reason

- **WHEN** a text fails verification
- **THEN** the model step receives it back with the reason it failed
- **AND** returns it checked and signed again

#### Scenario: A commit's tree mismatch goes back to no step

- **WHEN** a commit's uploaded tree differs from the tree its trailers name
- **THEN** no model step receives it back, and the item's failure is recorded

#### Scenario: Repeated failure publishes nothing

- **WHEN** a text for a claimed item fails its second attempt
- **THEN** none of the text is published, and the item gets the code's handoff
- **AND** the failure and its reasons are recorded to the state branch
