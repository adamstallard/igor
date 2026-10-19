## ADDED Requirements

### Requirement: Igor verifies what each skill in a role's list requires

Igor's code SHALL verify a role's published work according to the role's `skills` list, one
check per skill:

- **`prose`:** every model-written post SHALL carry a valid `prose ✓` footer, and every commit
  a `Prose:` trailer that matches its staged tree and message.
- **`bug-hunter`:** every commit SHALL carry a `Bug-hunter:` trailer. It SHALL also carry a
  `Bug-hunter-Tree:` trailer bound to its staged tree whenever a bug-hunter run hunted: its first
  triage, run on the whole change before any hunt, or an extra iteration. Where none hunted,
  `Bug-hunter:` alone is checked.

A role that does not list a skill SHALL NOT be checked for it, and publishes as it does without
this capability. A listed skill other than `prose` and `bug-hunter` gets no check from this
capability.

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

- **WHEN** a role's `skills` is `[bug-hunter]`, bug-hunter's first triage finds nothing to hunt
  in the change, and no extra iteration runs
- **THEN** the commit is made with its `Bug-hunter:` trailer and no `Bug-hunter-Tree:`

#### Scenario: A role listing neither publishes as before

- **WHEN** a role's `skills` lists neither `prose` nor `bug-hunter`
- **THEN** its posts and commits are published with no footer or trailer check

### Requirement: Igor runs prose's calls around the model step that writes

For a role whose `skills` lists `prose`, every text a model step writes for an Igor to publish
SHALL go through prose's pass. That covers pull request descriptions, replies, questions, and
any other model-written post to GitHub, Discord or Linear. The *prose pass* is the model step
that writes the text between prose's two calls.

Igor's code SHALL run both of prose's calls itself, as Igor's service user, from the pinned
skills directory (#174):

1. **The first call**, `prose sign` for a post, SHALL run before the step writes. Igor SHALL
   give the step the rules and the pass token it prints, in the step's prompt on stdin.
2. **The second call**, `prose sign --pass <token>`, SHALL run on the text the step hands back,
   given on stdin. Once the cold read below is answered, it appends a `prose ✓ <hash>` footer
   computed over that text.

Before the second call signs, the text SHALL be read cold: Igor SHALL run a fresh model step
whose whole prompt is the cold-read brief the second call prints, exactly as printed, and SHALL
give its report to the step that wrote the text, which fixes what the report names and answers
each line. Igor SHALL then run the second call with that report and those answers. A step SHALL
fix every finding, and prose's refusal of a kept one SHALL count as a failed check.

No model step SHALL run a prose script, and no worker user SHALL be able to write prose's token
store, so no step can issue a token or sign. No model step SHALL post. A commit message is
signed the same way, through `prose check`, as `task-execution`'s *A commit is signed by
bug-hunter and the prose pass before it is committed* requires.

Text the code assembles from recorded state is not signed: handoffs, stop receipts and claim
messages. `graceful-handoff` stays as it is. Nor are someone's words that code-assembled text
quotes: bug-hunter's open decisions in the opening block the code assembles for a pull request
body, the worker's reason for declining in a handoff, and a person's chat request in the issue
Igor opens from it.

#### Scenario: No model step posts

- **WHEN** a model step has a reply ready
- **THEN** it hands the reply to Igor's code, which signs and posts it, and makes no post itself

#### Scenario: The step writes with the rules Igor's first call printed

- **WHEN** a model step is to compose a reply to a mention
- **THEN** Igor runs `prose sign`'s first call first, and the step's prompt holds the rules and
  the pass token it printed
- **AND** Igor, not the step, runs the second call on the reply the step hands back

#### Scenario: A worker cannot issue a token

- **WHEN** a model step running as a worker user tries to write a file into prose's token store
- **THEN** the write fails, and no token exists that Igor's first call did not issue

#### Scenario: A signature waits for a cold read

- **WHEN** Igor runs the second call on a reply and it prints a cold-read brief
- **THEN** a fresh model step reads the brief as its whole prompt, and the step that wrote the
  reply fixes what that read names
- **AND** Igor runs the second call again with the report and the answers, and only then has a
  signed reply

#### Scenario: A kept cold-read finding is a failed check

- **WHEN** the step that wrote a reply answers a cold-read finding by keeping it
- **THEN** prose's second call refuses to sign, and the reply goes back to the step as a failed
  attempt

#### Scenario: The rule holds on every surface

- **WHEN** an Igor whose role lists `prose` posts model-written text to GitHub, Discord or Linear
- **THEN** the text carries a footer from prose's second call on that text

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
reason, and that step SHALL write it again. Where prose's second call refuses the token, Igor
SHALL run the first call again and give the step the new rules and token. A commit's tree or
message mismatch, and a refused minting call, are the exceptions: each goes back to no step, as
`task-execution` requires. After two failed attempts in total, the first and one redo, the code
SHALL publish none of the text and SHALL record the failure, with each reason, to the state
branch. On a claimed item, the handoff the code assembles is still posted, as `graceful-handoff`
requires.

#### Scenario: A failure is sent back with its reason

- **WHEN** a text fails verification
- **THEN** the model step receives it back with the reason it failed
- **AND** writes it again, and Igor signs and checks it again

#### Scenario: A refused token gets a new first call

- **WHEN** prose's second call refuses the token for a reply
- **THEN** Igor runs the first call again and gives the step the new rules and token

#### Scenario: A commit's tree mismatch goes back to no step

- **WHEN** a commit's uploaded tree differs from the tree its trailers name
- **THEN** no model step receives it back, and the item's failure is recorded

#### Scenario: Repeated failure publishes nothing

- **WHEN** a text for a claimed item fails its second attempt
- **THEN** none of the text is published, and the item gets the code's handoff
- **AND** the failure and its reasons are recorded to the state branch
